'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { trajectoryApi, TrajectoryMetadata } from '@/lib/api';

export default function VisualizePage() {
  const params = useParams();
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();
  const [trajectory, setTrajectory] = useState<TrajectoryMetadata | null>(null);
  const [trajectoryData, setTrajectoryData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/');
    }
  }, [isAuthenticated, isLoading, router]);

  useEffect(() => {
    if (isAuthenticated) {
      loadTrajectory();
    }
  }, [isAuthenticated, params.id]);

  const loadTrajectory = async () => {
    try {
      const id = params.id as string;

      // Get trajectory metadata
      const trajList = await trajectoryApi.list();
      const traj = trajList.trajectories.find(t => t.id === id);
      if (!traj) {
        alert('Trajectory not found');
        router.push('/dashboard');
        return;
      }
      setTrajectory(traj);

      // Download trajectory data
      const blob = await trajectoryApi.get(id);
      // TODO: Parse NPY/NPZ file
      // For now, we'll just store the blob
      setTrajectoryData(blob);
    } catch (error) {
      console.error('Error loading trajectory:', error);
      alert('Failed to load trajectory');
    } finally {
      setLoading(false);
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

  if (isLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-600">Loading...</div>
      </div>
    );
  }

  if (!trajectory) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-600">Trajectory not found</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Header */}
      <header className="bg-gray-800 shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push('/dashboard')}
              className="text-gray-300 hover:text-white"
            >
              ← Back
            </button>
            <h1 className="text-xl font-bold text-white">{trajectory.filename}</h1>
          </div>
          <div className="text-sm text-gray-400">
            {trajectory.frame_count && `${trajectory.frame_count} frames`}
            {trajectory.frame_rate && ` @ ${trajectory.frame_rate} fps`}
          </div>
        </div>
      </header>

      {/* Visualization Area */}
      <div className="flex-1 flex flex-col items-center justify-center p-8">
        <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-6xl">
          {/* Canvas */}
          <div className="relative" style={{ paddingBottom: '56.25%' }}>
            <canvas
              ref={canvasRef}
              className="absolute top-0 left-0 w-full h-full bg-gray-700 rounded-t-lg"
            />
            <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-lg">
              MuJoCo Viewer (To be implemented)
            </div>
          </div>

          {/* Controls */}
          <div className="p-6 space-y-4">
            {/* Playback Controls */}
            <div className="flex items-center justify-center gap-4">
              <button
                onClick={handleReset}
                className="px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-600"
              >
                Reset
              </button>
              <button
                onClick={handlePlayPause}
                className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                {playing ? 'Pause' : 'Play'}
              </button>
              <select
                value={playbackSpeed}
                onChange={(e) => handleSpeedChange(parseFloat(e.target.value))}
                className="px-3 py-2 bg-gray-700 text-white rounded"
              >
                <option value="0.25">0.25x</option>
                <option value="0.5">0.5x</option>
                <option value="1.0">1.0x</option>
                <option value="1.5">1.5x</option>
                <option value="2.0">2.0x</option>
              </select>
            </div>

            {/* Frame Slider */}
            {trajectory.frame_count && (
              <div className="space-y-2">
                <input
                  type="range"
                  min="0"
                  max={trajectory.frame_count - 1}
                  value={currentFrame}
                  onChange={(e) => handleFrameChange(parseInt(e.target.value))}
                  className="w-full"
                />
                <div className="flex justify-between text-sm text-gray-400">
                  <span>Frame: {currentFrame + 1} / {trajectory.frame_count}</span>
                  {trajectory.frame_rate && (
                    <span>Time: {(currentFrame / trajectory.frame_rate).toFixed(2)}s</span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
