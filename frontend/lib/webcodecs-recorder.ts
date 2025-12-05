/**
 * WebCodecs-based video recorder for offline frame-by-frame encoding
 * This allows proper control over FPS and duration, unlike MediaRecorder which records in real-time
 */

import * as THREE from 'three';

export interface RecordingConfig {
  width: number;
  height: number;
  fps: number;
  bitrate?: number;
}

/**
 * Muxer for creating MP4/WebM files from encoded video chunks
 * Uses mp4-muxer library for MP4 output
 */
class VideoMuxer {
  private chunks: Uint8Array[] = [];
  private config: RecordingConfig;

  constructor(config: RecordingConfig) {
    this.config = config;
  }

  addChunk(chunk: Uint8Array): void {
    this.chunks.push(chunk);
  }

  async finalize(): Promise<Blob> {
    // For now, we'll use WebM format with simple concatenation
    // In future, can use mp4-muxer library for proper MP4 muxing
    const totalLength = this.chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const combined = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of this.chunks) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }
    return new Blob([combined], { type: 'video/webm;codecs=vp9' });
  }
}

/**
 * Frame-by-frame video recorder using WebCodecs API
 */
export class WebCodecsRecorder {
  private encoder: VideoEncoder | null = null;
  private muxer: VideoMuxer | null = null;
  private config: RecordingConfig;
  private frameCount: number = 0;
  private isRecording: boolean = false;

  constructor(config: RecordingConfig) {
    this.config = {
      bitrate: 8000000, // 8 Mbps default
      ...config
    };
  }

  /**
   * Check if WebCodecs API is supported
   */
  static isSupported(): boolean {
    return typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined';
  }

  /**
   * Get best supported codec configuration
   */
  static async getSupportedCodec(width: number, height: number, fps: number): Promise<VideoEncoderConfig> {
    // Try VP9 first (WebM), then AVC (H.264/MP4)
    const configs: VideoEncoderConfig[] = [
      {
        codec: 'vp09.00.10.08',
        width,
        height,
        framerate: fps,
        bitrate: 8000000,
      },
      {
        codec: 'avc1.42001E', // H.264 Baseline
        width,
        height,
        framerate: fps,
        bitrate: 8000000,
        avc: { format: 'avc' }
      }
    ];

    for (const config of configs) {
      const support = await VideoEncoder.isConfigSupported(config);
      if (support.supported) {
        console.log('[WEBCODECS] Using codec:', config.codec);
        return support.config!;
      }
    }

    throw new Error('No supported video codec found');
  }

  /**
   * Start recording
   */
  async start(): Promise<void> {
    if (this.isRecording) {
      throw new Error('Already recording');
    }

    const codecConfig = await WebCodecsRecorder.getSupportedCodec(
      this.config.width,
      this.config.height,
      this.config.fps
    );

    this.muxer = new VideoMuxer(this.config);
    this.frameCount = 0;
    this.isRecording = true;

    this.encoder = new VideoEncoder({
      output: (chunk, metadata) => {
        // Collect encoded chunks
        const chunkData = new Uint8Array(chunk.byteLength);
        chunk.copyTo(chunkData);
        this.muxer?.addChunk(chunkData);
      },
      error: (error) => {
        console.error('[WEBCODECS] Encoder error:', error);
        throw error;
      }
    });

    this.encoder.configure(codecConfig);
  }

  /**
   * Add a frame from a canvas
   */
  async addFrame(canvas: HTMLCanvasElement | OffscreenCanvas): Promise<void> {
    if (!this.isRecording || !this.encoder) {
      throw new Error('Not recording');
    }

    // Create VideoFrame from canvas
    const frame = new VideoFrame(canvas, {
      timestamp: (this.frameCount * 1000000) / this.config.fps, // microseconds
      duration: 1000000 / this.config.fps
    });

    // Encode the frame
    this.encoder.encode(frame, { keyFrame: this.frameCount % 30 === 0 }); // Keyframe every 30 frames
    frame.close();

    this.frameCount++;
  }

  /**
   * Add a frame from a renderer (convenience method)
   */
  async addFrameFromRenderer(renderer: THREE.WebGLRenderer): Promise<void> {
    await this.addFrame(renderer.domElement);
  }

  /**
   * Stop recording and get the video blob
   */
  async stop(): Promise<Blob> {
    if (!this.isRecording || !this.encoder || !this.muxer) {
      throw new Error('Not recording');
    }

    // Flush encoder
    await this.encoder.flush();
    this.encoder.close();

    // Finalize video file
    const blob = await this.muxer.finalize();

    this.isRecording = false;
    this.encoder = null;
    this.muxer = null;

    return blob;
  }

  /**
   * Get current frame count
   */
  getFrameCount(): number {
    return this.frameCount;
  }
}
