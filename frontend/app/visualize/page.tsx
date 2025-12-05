'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import MuJoCoViewer, { ViewerOptions, TrajectoryPlaybackState, MuJoCoViewerRef } from '@/components/MuJoCoViewer';
import ModelSelector from '@/components/ModelSelector';
import TrajectorySelector from '@/components/TrajectorySelector';
import ViewerOptionsPanel from '@/components/ViewerOptions';
import VideoControls, { MuJoCoCamera } from '@/components/VideoControls';
import { ModelMetadata, TrajectoryMetadata } from '@/lib/api';
import { parseTrajectory, TrajectoryData } from '@/lib/trajectory-parser';

export default function VisualizePage() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();
  const [selectedModelXML, setSelectedModelXML] = useState<string | undefined>();
  const [selectedModel, setSelectedModel] = useState<ModelMetadata | null>(null);
  const [selectedTrajectory, setSelectedTrajectory] = useState<TrajectoryMetadata | null>(null);
  const [trajectoryData, setTrajectoryData] = useState<TrajectoryData | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const lastFrameTimeRef = useRef<number>(0);
  const [viewerOptions, setViewerOptions] = useState<ViewerOptions>({
    showFixedAxes: true,
    showMovingAxes: true,
  });

  // Camera and video recording state
  const [cameras, setCameras] = useState<MuJoCoCamera[]>([]);
  const [activeCamera, setActiveCamera] = useState('free');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingProgress, setRecordingProgress] = useState(0);
  const viewerRef = useRef<MuJoCoViewerRef>(null);

  // Playback loop - advance frames when playing
  useEffect(() => {
    if (!playing || !trajectoryData) {
      return;
    }

    console.log('Starting playback:', {
      frameCount: trajectoryData.frameCount,
      frameRate: trajectoryData.frameRate,
      playbackSpeed
    });

    let animationFrameId: number;
    lastFrameTimeRef.current = performance.now();

    const advanceFrame = (currentTime: number) => {
      const deltaTime = (currentTime - lastFrameTimeRef.current) / 1000;
      lastFrameTimeRef.current = currentTime;

      const frameDelta = deltaTime * trajectoryData.frameRate * playbackSpeed;

      setCurrentFrame((prevFrame) => {
        const nextFrame = prevFrame + frameDelta;

        if (nextFrame >= trajectoryData.frameCount - 1) {
          console.log('Playback finished');
          setPlaying(false);
          return trajectoryData.frameCount - 1;
        }

        return nextFrame;
      });

      animationFrameId = requestAnimationFrame(advanceFrame);
    };

    animationFrameId = requestAnimationFrame(advanceFrame);

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [playing, playbackSpeed, trajectoryData]);

  const handleModelSelect = (modelXML: string, model: ModelMetadata) => {
    setSelectedModelXML(modelXML);
    setSelectedModel(model);
  };

  const handleTrajectorySelect = async (trajectoryBlob: Blob, trajectory: TrajectoryMetadata) => {
    console.log('[VISUALIZE PAGE] handleTrajectorySelect called with:', trajectory.filename);
    console.log('[VISUALIZE PAGE] Blob received:', { size: trajectoryBlob.size, type: trajectoryBlob.type });

    setSelectedTrajectory(trajectory);
    console.log('[VISUALIZE PAGE] selectedTrajectory state updated');

    try {
      console.log('[VISUALIZE PAGE] Starting trajectory parsing...');
      const parsedData = await parseTrajectory(trajectoryBlob, trajectory.filename);
      console.log('[VISUALIZE PAGE] Parsed trajectory data:', {
        frameCount: parsedData.frameCount,
        frameRate: parsedData.frameRate,
        qposArrays: parsedData.qpos.length,
        firstFrameQposLength: parsedData.qpos[0]?.length,
        firstFewQpos: parsedData.qpos[0]?.slice(0, 5)
      });

      console.log('[VISUALIZE PAGE] Setting trajectoryData state...');
      setTrajectoryData(parsedData);
      setCurrentFrame(0);
      setPlaying(false);
      console.log('[VISUALIZE PAGE] Trajectory loaded successfully:', `${parsedData.frameCount} frames at ${parsedData.frameRate} fps`);
    } catch (error) {
      console.error('[VISUALIZE PAGE] Failed to parse trajectory:', error);
      alert('Failed to load trajectory: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  };

  const handlePlayPause = () => {
    setPlaying(!playing);
  };

  const handleReset = () => {
    setCurrentFrame(0);
    setPlaying(false);
  };

  const handleFrameChange = (frame: number) => {
    setCurrentFrame(frame);
  };

  const handleSpeedChange = (speed: number) => {
    setPlaybackSpeed(speed);
  };

  const handleCameraChange = (cameraName: string) => {
    if (!isRecording) {
      setActiveCamera(cameraName);
    }
  };

  const handleRecord = async () => {
    if (viewerRef.current) {
      try {
        setIsRecording(true);
        setRecordingProgress(0);

        // Pass progress callback to update UI
        await viewerRef.current.recordVideo((progress: number) => {
          setRecordingProgress(progress);
        });

        // Ensure 100% at end
        setRecordingProgress(100);
      } catch (error) {
        console.error('Recording failed:', error);
        alert('Failed to record video: ' + (error instanceof Error ? error.message : 'Unknown error'));
      } finally {
        setIsRecording(false);
        setRecordingProgress(0);
      }
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input field
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) {
        return;
      }

      switch (e.key) {
        case ' ': // Space - Play/Pause
          e.preventDefault();
          handlePlayPause();
          break;
        case 'r':
        case 'R': // R - Reset
          e.preventDefault();
          handleReset();
          break;
        case 'ArrowLeft': // Left - Step back 1 second
          e.preventDefault();
          if (trajectoryData) {
            const newFrame = Math.max(0, currentFrame - trajectoryData.frameRate);
            handleFrameChange(newFrame);
          }
          break;
        case 'ArrowRight': // Right - Step forward 1 second
          e.preventDefault();
          if (trajectoryData) {
            const newFrame = Math.min(trajectoryData.frameCount - 1, currentFrame + trajectoryData.frameRate);
            handleFrameChange(newFrame);
          }
          break;
        case 'ArrowUp': // Up - Step forward 1 frame
          e.preventDefault();
          if (trajectoryData) {
            const newFrame = Math.min(trajectoryData.frameCount - 1, Math.floor(currentFrame) + 1);
            handleFrameChange(newFrame);
          }
          break;
        case 'ArrowDown': // Down - Step back 1 frame
          e.preventDefault();
          if (trajectoryData) {
            const newFrame = Math.max(0, Math.floor(currentFrame) - 1);
            handleFrameChange(newFrame);
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [playing, currentFrame, trajectoryData]);

  // Prepare trajectory playback state for the viewer (must be before any returns)
  const trajectoryPlaybackState: TrajectoryPlaybackState | undefined = trajectoryData
    ? {
        qpos: trajectoryData.qpos,
        currentFrame: Math.floor(currentFrame),
        isPlaying: playing,
        playbackSpeed: playbackSpeed,
        frameRate: trajectoryData.frameRate,
      }
    : undefined;

  // Log whenever trajectoryData state changes
  useEffect(() => {
    if (trajectoryData) {
      console.log('[VISUALIZE PAGE] trajectoryData state updated:', {
        frameCount: trajectoryData.frameCount,
        frameRate: trajectoryData.frameRate,
        qposLength: trajectoryData.qpos.length
      });
    } else {
      console.log('[VISUALIZE PAGE] trajectoryData state is null');
    }
  }, [trajectoryData]);

  // Log whenever trajectoryPlaybackState changes
  useEffect(() => {
    if (trajectoryPlaybackState) {
      console.log('[VISUALIZE PAGE] trajectoryPlaybackState computed:', {
        hasQpos: !!trajectoryPlaybackState.qpos,
        qposLength: trajectoryPlaybackState.qpos?.length,
        currentFrame: trajectoryPlaybackState.currentFrame,
        isPlaying: trajectoryPlaybackState.isPlaying
      });
    } else {
      console.log('[VISUALIZE PAGE] trajectoryPlaybackState is undefined');
    }
  }, [trajectoryPlaybackState]);

  // Log trajectory state changes (only when playback state changes, not every frame)
  useEffect(() => {
    if (trajectoryPlaybackState && trajectoryPlaybackState.isPlaying) {
      console.log('Trajectory playback active:', {
        currentFrame: trajectoryPlaybackState.currentFrame,
        totalFrames: trajectoryPlaybackState.qpos.length,
        playbackSpeed: trajectoryPlaybackState.playbackSpeed
      });
    }
  }, [trajectoryPlaybackState?.isPlaying]);

  // Redirect to login if not authenticated (after all hooks)
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/');
    }
  }, [isLoading, isAuthenticated, router]);

  // Show loading state
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  // Don't render if not authenticated (will redirect via useEffect)
  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="h-screen bg-gray-900 flex flex-col overflow-hidden">
      {/* Header */}
      <header className="bg-gray-800 shadow flex-shrink-0">
        <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold text-white">Motion Library Visualization</h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-sm text-gray-400 flex items-center gap-4">
              {selectedModel && (
                <div>
                  {selectedModel.model_name && (
                    <span className="mr-2">{selectedModel.model_name}</span>
                  )}
                  <span>{selectedModel.filename}</span>
                </div>
              )}
              {trajectoryData && (
                <div className="text-gray-500">
                  {trajectoryData.frameCount} frames @ {trajectoryData.frameRate} fps
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => router.push('/dashboard')}
              className="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white transition-colors text-sm font-medium"
            >
              Dashboard
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Sidebar */}
        <div className="w-80 bg-gray-800 border-r border-gray-700 overflow-y-auto flex-shrink-0">
          {/* Playback Controls - Always visible */}
          <div className="border-b border-gray-700 bg-gray-750">
            <div className="p-4">
              <h3 className="text-sm font-semibold text-white mb-3">Playback Controls</h3>

              {/* Timeline Slider */}
              <div className="mb-4">
                <label htmlFor="timeline-slider" className="block text-xs font-medium text-gray-300 mb-2">Timeline</label>
                <input
                  id="timeline-slider"
                  type="range"
                  min="0"
                  max={trajectoryData ? trajectoryData.frameCount - 1 : 0}
                  value={trajectoryData ? Math.floor(currentFrame) : 0}
                  onChange={(e) => handleFrameChange(parseInt(e.target.value))}
                  disabled={!trajectoryData}
                  aria-label="Timeline scrubber"
                  className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <div className="flex justify-between text-xs text-gray-400 mt-1">
                  <span>{trajectoryData ? (currentFrame / trajectoryData.frameRate).toFixed(2) : '0.00'}s</span>
                  <span>Frame {trajectoryData ? Math.floor(currentFrame) + 1 : 0} / {trajectoryData ? trajectoryData.frameCount : 0}</span>
                  <span>{trajectoryData ? (trajectoryData.frameCount / trajectoryData.frameRate).toFixed(2) : '0.00'}s</span>
                </div>
              </div>

              {/* Control Buttons */}
              <div className="flex flex-col gap-2 mb-4">
                <button
                  type="button"
                  onClick={handlePlayPause}
                  disabled={!trajectoryData}
                  className="w-full px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-gray-600"
                >
                  {playing ? 'Pause' : 'Play'}
                </button>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={handleReset}
                    disabled={!trajectoryData}
                    className="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Reset
                  </button>
                  <button
                    type="button"
                    onClick={() => trajectoryData && handleFrameChange(Math.min(currentFrame + 1, trajectoryData.frameCount - 1))}
                    disabled={!trajectoryData}
                    className="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Step →
                  </button>
                </div>
              </div>

              {/* Speed Control */}
              <div className="mb-4">
                <label htmlFor="playback-speed" className="block text-xs font-medium text-gray-300 mb-2">
                  Playback Speed
                </label>
                <select
                  id="playback-speed"
                  value={playbackSpeed}
                  onChange={(e) => handleSpeedChange(parseFloat(e.target.value))}
                  disabled={!trajectoryData}
                  aria-label="Playback speed"
                  className="w-full px-3 py-2 rounded-lg bg-gray-700 text-white border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <option value={0.25}>0.25x</option>
                  <option value={0.5}>0.5x</option>
                  <option value={1}>1x</option>
                  <option value={1.5}>1.5x</option>
                  <option value={2}>2x</option>
                </select>
              </div>

              {/* Keyboard Shortcuts Guide */}
              <div className="mt-4 pt-4 border-t border-gray-700">
                <h4 className="text-xs font-semibold text-gray-300 mb-2">Keyboard Shortcuts</h4>
                <div className="space-y-1 text-xs text-gray-400">
                  <div className="flex justify-between">
                    <span>Play/Pause</span>
                    <span className="font-mono bg-gray-700 px-2 py-0.5 rounded">Space</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Reset</span>
                    <span className="font-mono bg-gray-700 px-2 py-0.5 rounded">R</span>
                  </div>
                  <div className="flex justify-between">
                    <span>±1 second</span>
                    <span className="font-mono bg-gray-700 px-2 py-0.5 rounded">← →</span>
                  </div>
                  <div className="flex justify-between">
                    <span>±1 frame</span>
                    <span className="font-mono bg-gray-700 px-2 py-0.5 rounded">↑ ↓</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Video Controls Section */}
          <div className="border-b border-gray-700 p-4">
            <VideoControls
              cameras={cameras}
              activeCamera={activeCamera}
              onCameraChange={handleCameraChange}
              onRecord={handleRecord}
              isRecording={isRecording}
              recordingProgress={recordingProgress}
              disabled={!trajectoryData}
            />
          </div>

          {/* Models Section */}
          <div className="border-b border-gray-700">
            <ModelSelector
              onModelSelect={handleModelSelect}
              selectedModelId={selectedModel?.id}
            />
          </div>

          {/* Trajectories Section */}
          <div className="border-b border-gray-700">
            <TrajectorySelector
              onTrajectorySelect={handleTrajectorySelect}
              selectedTrajectoryId={selectedTrajectory?.id}
            />
          </div>

          {/* Viewer Options Section */}
          <div className="border-b border-gray-700">
            <ViewerOptionsPanel
              options={viewerOptions}
              onChange={setViewerOptions}
            />
          </div>
        </div>

        {/* 3D Viewer */}
        <div className="flex-1 relative">
          <MuJoCoViewer
            ref={viewerRef}
            modelXML={selectedModelXML}
            modelId={selectedModel?.id}
            modelMetadata={selectedModel ?? undefined}
            trajectory={trajectoryPlaybackState}
            options={viewerOptions}
            onModelLoaded={() => console.log('Model loaded successfully')}
            onError={(error) => console.error('Viewer error:', error)}
            onCamerasLoaded={setCameras}
            activeCamera={activeCamera}
          />
        </div>
      </div>
    </div>
  );
}
