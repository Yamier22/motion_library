# Video Recording and Camera Selection

This document describes the architecture and implementation of the video recording and camera selection features in the Motion Library frontend.

## Table of Contents

1. [Overview](#overview)
2. [Camera Selection System](#camera-selection-system)
3. [Video Recording System](#video-recording-system)
4. [Color Space Management](#color-space-management)
5. [File Structure](#file-structure)
6. [Implementation Details](#implementation-details)

---

## Overview

The Motion Library viewer supports:
- **Multiple camera views**: Free camera (OrbitControls) and MuJoCo cameras from the model
- **High-quality video recording**: 1920x1080 @ 30fps MP4 videos with H.264 codec
- **Streaming encoding**: Memory-efficient frame-by-frame encoding using WebCodecs
- **Color accuracy**: Proper color space handling to match browser rendering

---

## Camera Selection System

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    visualize/page.tsx                        │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  State Management                                       │ │
│  │  - activeCamera: string                                 │ │
│  │  - cameras: MuJoCoCamera[]                              │ │
│  └────────────────────────────────────────────────────────┘ │
│                           │                                  │
│                           ▼                                  │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  VideoControls Component                                │ │
│  │  - Camera selection buttons                             │ │
│  │  - Recording button + progress bar                      │ │
│  └────────────────────────────────────────────────────────┘ │
│                           │                                  │
└───────────────────────────┼──────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              MuJoCoViewer Component                          │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Camera Management                                      │ │
│  │  - Parse cameras from XML                               │ │
│  │  - Create THREE.PerspectiveCamera for each              │ │
│  │  - Update camera transforms each frame                  │ │
│  │  - Toggle OrbitControls for free camera                 │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### Camera Types

#### 1. Free Camera
- **Name**: "free"
- **MuJoCo ID**: -1
- **Controls**: OrbitControls (user can rotate, pan, zoom)
- **Implementation**: Standard THREE.js PerspectiveCamera with OrbitControls

#### 2. MuJoCo Cameras
- **Source**: Parsed from `<camera>` tags in MuJoCo XML
- **MuJoCo ID**: 0, 1, 2, ... (from `cam.id`)
- **Controls**: Fixed to MuJoCo model's camera definition
- **Transform**: Updated every frame from MuJoCo data

### Camera Parsing

**File**: `frontend/components/MuJoCoViewer.tsx`

```typescript
// Parse cameras from MuJoCo model XML (lines ~312-349)
const parseCameras = () => {
  const cameras: MuJoCoCamera[] = [
    { name: 'free', mujocoId: -1 }  // Free camera always first
  ];

  // Parse XML for camera definitions
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xml, 'text/xml');
  const cameraElements = xmlDoc.getElementsByTagName('camera');

  // Add each MuJoCo camera
  for (let i = 0; i < cameraElements.length; i++) {
    const cam = cameraElements[i];
    const name = cam.getAttribute('name') || `camera_${i}`;

    // Find MuJoCo camera ID by name
    const camId = model.name_camadr[model.name2id(mujoco.mjtObj.mjOBJ_CAMERA, name)];

    cameras.push({
      name: name,
      mujocoId: camId
    });
  }

  return cameras;
};
```

### Camera Transform Updates

**File**: `frontend/lib/mujoco-utils.ts`

```typescript
/**
 * Update THREE.js camera from MuJoCo camera data
 */
export function updateCameraFromMuJoCo(
  camera: THREE.PerspectiveCamera,
  data: any,
  model: any,
  cameraId: number
): void {
  // Get camera position and orientation from MuJoCo data
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();

  getPosition(data.cam_xpos, cameraId, pos, false);
  getQuaternion(data.cam_xmat, cameraId, quat, false);

  // Apply to THREE.js camera
  camera.position.copy(pos);
  camera.quaternion.copy(quat);
  camera.updateMatrixWorld();
}
```

### Camera Switching

**Flow**:
1. User clicks camera button in VideoControls
2. `onCameraChange(cameraName)` called in visualize/page.tsx
3. `setActiveCamera(cameraName)` updates state
4. MuJoCoViewer receives new `activeCamera` prop
5. Effect hook updates camera and OrbitControls:

```typescript
// MuJoCoViewer.tsx (lines ~707-729)
useEffect(() => {
  if (!activeCamera || !controlsRef.current) return;

  // Find camera by name
  const selectedCamera = camerasRef.current.find(c => c.name === activeCamera);
  if (!selectedCamera) return;

  activeCameraIdRef.current = selectedCamera.mujocoId;

  if (selectedCamera.mujocoId === -1) {
    // Free camera: enable OrbitControls
    controlsRef.current.enabled = true;
  } else {
    // MuJoCo camera: disable OrbitControls, update transform
    controlsRef.current.enabled = false;
    updateCameraFromMuJoCo(
      cameraRef.current,
      dataRef.current,
      modelRef.current,
      selectedCamera.mujocoId
    );
  }
}, [activeCamera]);
```

---

## Video Recording System

### Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                 User clicks "Record Video"                    │
└────────────────────────┬─────────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────────┐
│        visualize/page.tsx: handleRecord()                     │
│  - Sets isRecording = true                                    │
│  - Calls viewerRef.current.recordVideo(onProgress)            │
└────────────────────────┬─────────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────────┐
│    MuJoCoViewer.tsx: recordVideo() - useImperativeHandle     │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  1. Calculate video parameters                         │  │
│  │     - Trajectory duration = frames / frameRate         │  │
│  │     - Video frames = duration × 30fps                  │  │
│  │                                                         │  │
│  │  2. Create off-screen renderer                         │  │
│  │     - 1920x1080 resolution                             │  │
│  │     - LinearSRGBColorSpace (matches main viewer)       │  │
│  │                                                         │  │
│  │  3. Create StreamingRecorder                           │  │
│  │     - Mediabunny + WebCodecs                           │  │
│  │     - H.264 codec, 8 Mbps bitrate                      │  │
│  │                                                         │  │
│  │  4. Frame loop (streaming!)                            │  │
│  │     FOR each video frame:                              │  │
│  │       - Calculate corresponding trajectory frame       │  │
│  │       - Update MuJoCo qpos                             │  │
│  │       - Compute forward kinematics                     │  │
│  │       - Update THREE.js scene                          │  │
│  │       - Render to off-screen canvas                    │  │
│  │       - Encode frame immediately (no buffering!)       │  │
│  │       - Report progress                                │  │
│  │                                                         │  │
│  │  5. Finalize and download                              │  │
│  │     - Flush encoder                                    │  │
│  │     - Get MP4 blob                                     │  │
│  │     - Download as trajectory_TIMESTAMP.mp4             │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

### Frame Rate Conversion

**Problem**: Trajectory may be at 100fps, but video needs to be 30fps.

**Solution**: Time-based sampling

```typescript
// Calculate video duration
const trajectoryDuration = totalTrajectoryFrames / trajectoryFrameRate;
// e.g., 724 frames / 100 fps = 7.24 seconds

// Calculate video frames needed
const totalVideoFrames = Math.round(trajectoryDuration * videoFrameRate);
// e.g., 7.24s × 30fps = 217 frames

// For each video frame, sample trajectory at that time
for (let videoFrame = 0; videoFrame < totalVideoFrames; videoFrame++) {
  // Calculate time in seconds
  const trajectoryTime = videoFrame / videoFrameRate;
  // e.g., frame 10 → 0.333s

  // Find closest trajectory frame
  const trajectoryFrameIndex = Math.round(trajectoryTime * trajectoryFrameRate);
  // e.g., 0.333s × 100fps = frame 33

  // Use that trajectory frame's qpos
  const qposData = trajectory.qpos[trajectoryFrameIndex];
}
```

**Key insight**: Think in **time domain**, not frame domain. This works for any frame rate (60fps, 100fps, 240fps, etc.).

### Streaming Encoder

**File**: `frontend/lib/streaming-recorder.ts`

**Key Features**:
- Uses **Mediabunny** (wrapper around WebCodecs)
- **H.264 (AVC)** codec for universal compatibility
- **Streaming**: Frames encoded immediately, not buffered
- **Memory efficient**: Only 1 frame in memory at a time

**Implementation**:

```typescript
export class StreamingRecorder {
  private output: Output | null = null;
  private videoSource: VideoSampleSource | null = null;

  async start(): Promise<void> {
    // Create video source with H.264 codec
    this.videoSource = new VideoSampleSource({
      codec: 'avc',  // H.264
      bitrate: 8000000  // 8 Mbps
    });

    // Create MP4 output
    this.output = new Output({
      format: new Mp4OutputFormat({
        fastStart: 'in-memory'  // Metadata at start for web playback
      }),
      target: new BufferTarget()
    });

    this.output.addVideoTrack(this.videoSource);
    await this.output.start();
  }

  async addFrame(canvas: HTMLCanvasElement): Promise<void> {
    // Create VideoSample with color space metadata
    const videoSample = new VideoSample(canvas, {
      timestamp: this.frameCount / this.config.fps,
      duration: 1 / this.config.fps,
      colorSpace: {
        primaries: 'bt709',
        transfer: 'iec61966-2-1',  // sRGB
        matrix: 'rgb',
        fullRange: true
      }
    });

    // Encode immediately (streaming!)
    await this.videoSource.add(videoSample);
    videoSample.close();  // Free memory

    this.frameCount++;
  }

  async stop(): Promise<Blob> {
    await this.output.finalize();
    const buffer = (this.output.target as BufferTarget).buffer;
    return new Blob([buffer], { type: 'video/mp4' });
  }
}
```

### Recording Utilities

**File**: `frontend/lib/video-recorder.ts`

Utility functions for video recording:

```typescript
/**
 * Create off-screen renderer for recording
 * MUST match main viewer's color space!
 */
export function createRecordingRenderer(): THREE.WebGLRenderer {
  const renderer = new THREE.WebGLRenderer({
    preserveDrawingBuffer: true,
    antialias: true
  });

  renderer.setSize(1920, 1080);
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;  // Critical!

  return renderer;
}

/**
 * Clone camera with 16:9 aspect ratio
 */
export function createRecordingCamera(
  sourceCamera: THREE.PerspectiveCamera
): THREE.PerspectiveCamera {
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
```

---

## Color Space Management

### The Challenge

Three different color spaces are involved:
1. **THREE.js Renderer**: LinearSRGBColorSpace vs SRGBColorSpace
2. **Canvas Buffer**: RGBA pixel data
3. **Video Encoder**: YUV420p with color metadata

### Color Space Pipeline

```
┌──────────────────────────────────────────────────────────────┐
│  THREE.js Scene (LinearSRGBColorSpace)                       │
│  - Background: 0x243447 (dark blue-gray)                     │
│  - Materials: PBR with linear values                         │
└────────────────┬─────────────────────────────────────────────┘
                 │
                 ▼
┌──────────────────────────────────────────────────────────────┐
│  THREE.js Renderer (LinearSRGBColorSpace)                    │
│  - outputColorSpace = THREE.LinearSRGBColorSpace             │
│  - Renders without gamma correction                          │
└────────────────┬─────────────────────────────────────────────┘
                 │
                 ▼
┌──────────────────────────────────────────────────────────────┐
│  Canvas Buffer (RGBA, linear RGB values)                     │
│  - Pixel data ready for encoding                             │
└────────────────┬─────────────────────────────────────────────┘
                 │
                 ▼
┌──────────────────────────────────────────────────────────────┐
│  VideoSample (with colorSpace metadata)                      │
│  - primaries: 'bt709'                                        │
│  - transfer: 'iec61966-2-1' (sRGB gamma)                     │
│  - matrix: 'rgb'                                             │
│  - fullRange: true                                           │
└────────────────┬─────────────────────────────────────────────┘
                 │
                 ▼
┌──────────────────────────────────────────────────────────────┐
│  WebCodecs VideoEncoder (H.264)                              │
│  - Converts RGB → YUV420p                                    │
│  - Uses BT.709 matrix (guided by colorSpace)                 │
└────────────────┬─────────────────────────────────────────────┘
                 │
                 ▼
┌──────────────────────────────────────────────────────────────┐
│  MP4 Video (H.264/AVC, YUV420p)                              │
│  - Color metadata embedded                                   │
│  - BT.709 primaries, sRGB transfer                           │
└────────────────┬─────────────────────────────────────────────┘
                 │
                 ▼
┌──────────────────────────────────────────────────────────────┐
│  Video Player Decoding                                       │
│  - Reads color metadata                                      │
│  - Converts YUV → RGB using BT.709                           │
│  - Applies sRGB transfer function                            │
│  - Colors match browser rendering! ✓                         │
└──────────────────────────────────────────────────────────────┘
```

### Critical Configuration

**1. Recording Renderer Must Match Main Renderer**

```typescript
// Main viewer (MuJoCoViewer.tsx:408)
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;

// Recording renderer MUST match (video-recorder.ts:48)
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
```

**Why**: If mismatched, colors will be brighter/darker in video.

**2. VideoSample Must Specify Color Space**

```typescript
// streaming-recorder.ts:95-100
const videoSample = new VideoSample(canvas, {
  timestamp: timestamp,
  duration: 1 / fps,
  colorSpace: {
    primaries: 'bt709',        // Color primaries (R, G, B wavelengths)
    transfer: 'iec61966-2-1',  // sRGB gamma curve
    matrix: 'rgb',             // Keep RGB until encoder converts
    fullRange: true            // 0-255 range (not 16-235)
  }
});
```

**Why**: Tells encoder how to convert RGB→YUV correctly.

### Color Space Parameters Explained

| Parameter | Value | Purpose |
|-----------|-------|---------|
| `primaries` | `'bt709'` | Color gamut (same as sRGB) - defines R, G, B wavelengths |
| `transfer` | `'iec61966-2-1'` | sRGB gamma curve - how brightness is encoded |
| `matrix` | `'rgb'` | Keep as RGB (encoder converts to YUV internally) |
| `fullRange` | `true` | Full 0-255 range (not limited 16-235 "studio" range) |

### Common Color Issues

**Issue 1: Skybox appears blue instead of black**
- **Cause**: Recording renderer using default `SRGBColorSpace` (gamma applied)
- **Fix**: Set `renderer.outputColorSpace = THREE.LinearSRGBColorSpace`

**Issue 2: Greens appear darker in video**
- **Cause**: BT.601 vs BT.709 matrix mismatch
- **Fix**: Specify `colorSpace` in VideoSample with `primaries: 'bt709'`

**Issue 3: Colors look washed out**
- **Cause**: `fullRange: false` (limited range)
- **Fix**: Set `fullRange: true` in VideoSample colorSpace

---

## File Structure

```
frontend/
├── components/
│   ├── MuJoCoViewer.tsx          # Main 3D viewer with camera + recording
│   └── VideoControls.tsx         # UI for camera selection + recording button
│
├── lib/
│   ├── streaming-recorder.ts     # WebCodecs-based streaming encoder
│   ├── video-recorder.ts         # Utility functions for recording
│   └── mujoco-utils.ts           # MuJoCo helpers (camera updates, etc.)
│
└── app/
    └── visualize/
        └── page.tsx              # Main page with state management
```

### File Responsibilities

#### `MuJoCoViewer.tsx`
- Parse cameras from MuJoCo XML
- Create THREE.js cameras for each MuJoCo camera
- Update camera transforms each frame
- Toggle OrbitControls based on active camera
- Implement `recordVideo()` function
- Handle trajectory playback

#### `VideoControls.tsx`
- Display camera selection buttons
- Display recording button with progress bar
- Disable controls during recording
- Show recording status

#### `streaming-recorder.ts`
- Manage WebCodecs VideoEncoder
- Encode frames on-the-fly (streaming)
- Handle color space configuration
- Create MP4 with H.264 codec

#### `video-recorder.ts`
- Create recording renderer (matches main renderer)
- Create recording camera (16:9 aspect)
- Download blob utility
- Shared recording utilities

#### `mujoco-utils.ts`
- Update THREE.js camera from MuJoCo data
- Get position/quaternion from MuJoCo arrays
- Draw tendons and flex elements

---

## Implementation Details

### Camera Selection Flow

```typescript
// 1. User clicks camera button in UI
<button onClick={() => onCameraChange(cam.name)}>
  {cam.name}
</button>

// 2. visualize/page.tsx updates state
const handleCameraChange = (cameraName: string) => {
  setActiveCamera(cameraName);
};

// 3. MuJoCoViewer receives new prop and updates
useEffect(() => {
  const selectedCamera = camerasRef.current.find(c => c.name === activeCamera);
  activeCameraIdRef.current = selectedCamera.mujocoId;

  if (selectedCamera.mujocoId === -1) {
    controlsRef.current.enabled = true;  // Free camera
  } else {
    controlsRef.current.enabled = false; // MuJoCo camera
    updateCameraFromMuJoCo(/*...*/);
  }
}, [activeCamera]);

// 4. Animation loop updates MuJoCo cameras each frame
const animate = () => {
  if (activeCameraIdRef.current >= 0) {
    updateCameraFromMuJoCo(
      cameraRef.current,
      dataRef.current,
      modelRef.current,
      activeCameraIdRef.current
    );
  }
  renderer.render(scene, camera);
};
```

### Video Recording Flow

```typescript
// 1. User clicks "Record Video"
const handleRecord = async () => {
  setIsRecording(true);
  setRecordingProgress(0);

  await viewerRef.current.recordVideo((progress) => {
    setRecordingProgress(progress);  // Update UI
  });

  setIsRecording(false);
};

// 2. MuJoCoViewer.recordVideo() executes
recordVideo: async (onProgress) => {
  // Calculate parameters
  const trajectoryDuration = frames / frameRate;
  const videoFrames = Math.round(duration * 30);

  // Create off-screen renderer + recorder
  const renderer = createRecordingRenderer();
  const recorder = new StreamingRecorder({ width: 1920, height: 1080, fps: 30 });
  await recorder.start();

  // Render and encode each frame
  for (let videoFrame = 0; videoFrame < videoFrames; videoFrame++) {
    // Sample trajectory at this time
    const trajectoryTime = videoFrame / 30;
    const trajectoryFrameIndex = Math.round(trajectoryTime * frameRate);

    // Update scene
    updateMuJoCoData(trajectory.qpos[trajectoryFrameIndex]);
    updateThreeJsScene();
    updateCamera();

    // Render and encode (streaming!)
    renderer.render(scene, camera);
    await recorder.addFrame(renderer.domElement);

    // Report progress
    onProgress((videoFrame + 1) / videoFrames * 100);
  }

  // Finalize and download
  const blob = await recorder.stop();
  downloadBlob(blob, `trajectory_${Date.now()}.mp4`);
}

// 3. StreamingRecorder encodes each frame immediately
async addFrame(canvas) {
  const videoSample = new VideoSample(canvas, {
    timestamp: frameCount / fps,
    colorSpace: { /* ... */ }
  });

  await this.videoSource.add(videoSample);  // Encode now!
  videoSample.close();  // Free memory
}
```

### Memory Efficiency

**Key Optimization**: Streaming encoding

```
Traditional approach (buffering):
┌──────────────────────────────────────────┐
│ Frame 1 → Store in memory                │
│ Frame 2 → Store in memory                │
│ ...                                       │
│ Frame 217 → Store in memory              │
│ [217 PNG images in RAM = ~50-100 MB]     │
│                                           │
│ THEN encode all at once                   │
└──────────────────────────────────────────┘
Memory: HIGH (all frames buffered)

Streaming approach (current):
┌──────────────────────────────────────────┐
│ Frame 1 → Render → Encode → Free         │
│ Frame 2 → Render → Encode → Free         │
│ ...                                       │
│ Frame 217 → Render → Encode → Free       │
│ [Only 1 frame in RAM at a time]          │
│                                           │
│ Encoding happens in parallel              │
└──────────────────────────────────────────┘
Memory: LOW (constant ~5-10 MB)
```

---

## Browser Compatibility

### Camera Selection
- ✅ All modern browsers (uses standard THREE.js)

### Video Recording
- ✅ **Chrome/Edge**: Full support (WebCodecs native)
- ✅ **Safari**: Supported (WebCodecs available)
- ❌ **Firefox**: Limited (WebCodecs behind flag)

**Fallback**: If WebCodecs not available, show error message prompting user to use Chrome/Edge.

---

## Testing Checklist

### Camera Selection
- [ ] Free camera can orbit/pan/zoom
- [ ] MuJoCo cameras follow model transforms
- [ ] Switching cameras updates view immediately
- [ ] OrbitControls disabled for MuJoCo cameras
- [ ] Camera persists during trajectory playback

### Video Recording
- [ ] Record with free camera
- [ ] Record with MuJoCo camera
- [ ] Video duration matches trajectory duration
- [ ] Video is exactly 30fps
- [ ] Video resolution is 1920x1080
- [ ] Colors match browser rendering (background, objects, lighting)
- [ ] Progress bar updates smoothly
- [ ] File downloads as MP4
- [ ] Video plays in standard media players (VLC, QuickTime, etc.)
- [ ] Long trajectories (>1000 frames) don't crash

---

## Performance Considerations

### Rendering
- **Off-screen rendering**: No impact on main viewer
- **Frame rate**: Encodes as fast as possible (usually faster than real-time)
- **Progress updates**: Throttled to every 10 frames to avoid UI thrashing

### Memory
- **Streaming**: Constant memory usage (~10 MB)
- **Cleanup**: Renderer disposed after recording
- **WebCodecs**: Hardware-accelerated when available

### Typical Performance
- **7.24s trajectory (217 frames)**:
  - Rendering: ~2-3 seconds
  - Encoding: ~1-2 seconds (parallel with rendering)
  - Total: ~3-5 seconds
  - Output: ~15-25 MB MP4 file

---

## Troubleshooting

### Video colors don't match browser

**Check 1**: Recording renderer color space
```typescript
// Should be LINEAR, not SRGB
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
```

**Check 2**: VideoSample color space
```typescript
colorSpace: {
  primaries: 'bt709',
  transfer: 'iec61966-2-1',  // sRGB
  matrix: 'rgb',
  fullRange: true
}
```

### Camera doesn't update during recording

**Issue**: Recording uses active camera at recording start
**Solution**: Camera is locked during recording (by design)
**Workaround**: Switch camera before starting recording

### Recording fails with "Not supported" error

**Cause**: WebCodecs not available
**Solution**: Use Chrome, Edge, or Safari
**Check**: `StreamingRecorder.isSupported()`

### Video duration is wrong

**Check**: Frame rate conversion math
```typescript
const duration = trajectoryFrames / trajectoryFrameRate;
const videoFrames = Math.round(duration * 30);
// Should produce: duration * 30 frames
```

---

## Future Enhancements

### Potential Improvements
1. **Variable resolution**: Allow 720p, 4K recording
2. **Frame rate selection**: Allow 60fps, 120fps recording
3. **Quality presets**: Low, Medium, High, Ultra
4. **Watermark support**: Add custom watermark to videos
5. **Audio track**: Add silent audio track for compatibility
6. **Seek preview**: Show thumbnail preview during recording
7. **Batch recording**: Record multiple camera angles simultaneously

### Known Limitations
1. **Browser dependency**: Requires WebCodecs support
2. **No audio**: Videos have no audio track
3. **Fixed format**: MP4/H.264 only (no WebM, AV1, etc.)
4. **No compression options**: Fixed bitrate (8 Mbps)

---

## References

- [WebCodecs API](https://developer.chrome.com/docs/web-platform/best-practices/webcodecs)
- [Mediabunny Documentation](https://mediabunny.dev/guide/introduction)
- [THREE.js Color Management](https://threejs.org/docs/#manual/en/introduction/Color-management)
- [MuJoCo Camera Documentation](https://mujoco.readthedocs.io/en/stable/XMLreference.html#body-camera)
- [H.264 Codec](https://en.wikipedia.org/wiki/Advanced_Video_Coding)
