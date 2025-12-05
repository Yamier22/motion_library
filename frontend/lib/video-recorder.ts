import * as THREE from 'three';

/**
 * Check browser support for MediaRecorder and return best supported MIME type
 * Prioritizes MP4 with H.264 codec, falls back to WebM if not supported
 */
export function getSupportedMimeType(): string {
  // Priority order: MP4 with H.264, then WebM variants
  const types = [
    'video/mp4;codecs=h264',
    'video/mp4;codecs=avc1',
    'video/mp4',
    'video/webm;codecs=h264',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm'
  ];

  const supported = types.find(type => {
    try {
      return MediaRecorder.isTypeSupported(type);
    } catch {
      return false;
    }
  });

  if (!supported) {
    throw new Error('MediaRecorder not supported in this browser');
  }

  return supported;
}

/**
 * Create off-screen renderer for video recording
 * IMPORTANT: Must match the color space of the main renderer to ensure consistent colors
 */
export function createRecordingRenderer(): THREE.WebGLRenderer {
  const renderer = new THREE.WebGLRenderer({
    preserveDrawingBuffer: true,
    antialias: true
  });

  renderer.setSize(1920, 1080);

  // Match the main renderer's color space configuration
  // This ensures colors are rendered identically to the main viewer
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;

  // Note: We don't set clearColor here because the scene.background handles it
  // The scene's background color will be used during rendering

  return renderer;
}

/**
 * Clone camera with 16:9 aspect ratio for recording
 */
export function createRecordingCamera(sourceCamera: THREE.PerspectiveCamera): THREE.PerspectiveCamera {
  const camera = sourceCamera.clone();
  camera.aspect = 1920 / 1080;
  camera.updateProjectionMatrix();
  return camera;
}

/**
 * Download blob as file
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Wait for specified milliseconds
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Get file extension from MIME type
 */
export function getFileExtension(mimeType: string): string {
  if (mimeType.startsWith('video/mp4')) {
    return 'mp4';
  } else if (mimeType.startsWith('video/webm')) {
    return 'webm';
  }
  return 'mp4'; // Default fallback
}
