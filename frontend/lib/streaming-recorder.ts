/**
 * Streaming video recorder using Mediabunny + WebCodecs
 * Encodes frames incrementally without storing all frames in memory
 * Creates MP4 videos with H.264 codec
 */

import { Output, Mp4OutputFormat, BufferTarget, VideoSampleSource, VideoSample, QUALITY_HIGH } from 'mediabunny';

export interface StreamingRecorderConfig {
  width: number;
  height: number;
  fps: number;
  bitrate?: number;
}

/**
 * Streaming video recorder that encodes frames on-the-fly
 * Uses WebCodecs VideoEncoder wrapped by Mediabunny for MP4 muxing
 * No frame buffering - each frame is encoded and muxed immediately
 */
export class StreamingRecorder {
  private output: Output | null = null;
  private videoSource: VideoSampleSource | null = null;
  private config: StreamingRecorderConfig;
  private frameCount: number = 0;
  private isRecording: boolean = false;

  constructor(config: StreamingRecorderConfig) {
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
   * Start recording - initializes encoder and muxer
   */
  async start(): Promise<void> {
    if (this.isRecording) {
      throw new Error('Already recording');
    }

    console.log('[STREAMING] Starting streaming recorder with Mediabunny...');

    // Create video source with H.264 codec
    this.videoSource = new VideoSampleSource({
      codec: 'avc', // H.264
      bitrate: this.config.bitrate || QUALITY_HIGH
    });

    // Create output with MP4 format and buffer target
    this.output = new Output({
      format: new Mp4OutputFormat({
        fastStart: 'in-memory', // Enable fast start for web playback
      }),
      target: new BufferTarget(),
    });

    // Add video track
    this.output.addVideoTrack(this.videoSource);

    // Start output processing
    await this.output.start();

    this.isRecording = true;
    this.frameCount = 0;

    console.log(`[STREAMING] Recorder ready: ${this.config.width}x${this.config.height} @ ${this.config.fps}fps`);
  }

  /**
   * Add a frame from canvas (encodes immediately, doesn't store in memory)
   */
  async addFrame(canvas: HTMLCanvasElement | OffscreenCanvas): Promise<void> {
    if (!this.isRecording || !this.videoSource) {
      throw new Error('Not recording');
    }

    // Calculate timestamp in seconds
    const timestamp = this.frameCount / this.config.fps;

    // Create VideoSample from canvas with proper color space configuration
    // Canvas uses sRGB color space, so we need to preserve it during encoding
    const videoSample = new VideoSample(canvas, {
      timestamp: timestamp,
      duration: 1 / this.config.fps,
      // Specify sRGB color space to match browser rendering
      colorSpace: {
        primaries: 'bt709',        // BT.709 primaries (same as sRGB)
        transfer: 'iec61966-2-1',  // sRGB transfer function (gamma curve)
        matrix: 'rgb',             // Keep as RGB (no YUV conversion yet)
        fullRange: true            // Full range (0-255) for RGB
      }
    });

    // Add sample to source (this triggers encoding immediately)
    await this.videoSource.add(videoSample);

    // Close the sample to free memory immediately
    videoSample.close();

    this.frameCount++;
  }

  /**
   * Stop recording and get the final MP4 blob
   */
  async stop(): Promise<Blob> {
    if (!this.isRecording || !this.output) {
      throw new Error('Not recording');
    }

    console.log('[STREAMING] Finalizing video...');

    // Finalize the output - this flushes the encoder and completes the MP4 file
    await this.output.finalize();

    // Get the final buffer from the BufferTarget
    const buffer = (this.output.target as BufferTarget).buffer;
    if (!buffer) {
      throw new Error('Failed to get video buffer');
    }
    const blob = new Blob([buffer], { type: 'video/mp4' });

    // Cleanup
    this.isRecording = false;
    this.videoSource = null;
    this.output = null;

    console.log(`[STREAMING] Video complete: ${(blob.size / 1024 / 1024).toFixed(2)} MB, ${this.frameCount} frames`);

    return blob;
  }

  /**
   * Get current frame count
   */
  getFrameCount(): number {
    return this.frameCount;
  }
}
