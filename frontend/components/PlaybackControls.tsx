/**
 * Playback controls for trajectory visualization
 * Provides play/pause, timeline scrubbing, and speed control
 */

import React from 'react';
import { Play, Pause, SkipBack, SkipForward } from 'lucide-react';

export interface PlaybackControlsProps {
  isPlaying: boolean;
  currentFrame: number;
  totalFrames: number;
  playbackSpeed: number;
  frameRate: number;
  onPlayPause: () => void;
  onFrameChange: (frame: number) => void;
  onSpeedChange: (speed: number) => void;
  onReset: () => void;
}

export function PlaybackControls({
  isPlaying,
  currentFrame,
  totalFrames,
  playbackSpeed,
  frameRate,
  onPlayPause,
  onFrameChange,
  onSpeedChange,
  onReset,
}: PlaybackControlsProps) {
  const currentTime = currentFrame / frameRate;
  const totalTime = totalFrames / frameRate;

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  };

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const frame = parseInt(e.target.value, 10);
    onFrameChange(frame);
  };

  const handleSpeedChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const speed = parseFloat(e.target.value);
    onSpeedChange(speed);
  };

  const handleStepForward = () => {
    if (currentFrame < totalFrames - 1) {
      onFrameChange(currentFrame + 1);
    }
  };

  const handleStepBackward = () => {
    if (currentFrame > 0) {
      onFrameChange(currentFrame - 1);
    }
  };

  return (
    <div className="bg-gray-800 border-t border-gray-700 p-4">
      {/* Timeline Slider */}
      <div className="mb-4">
        <input
          type="range"
          min="0"
          max={totalFrames - 1}
          value={currentFrame}
          onChange={handleSliderChange}
          className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
          style={{
            background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${(currentFrame / (totalFrames - 1)) * 100}%, #4b5563 ${(currentFrame / (totalFrames - 1)) * 100}%, #4b5563 100%)`
          }}
        />
        <div className="flex justify-between text-xs text-gray-400 mt-1">
          <span>{formatTime(currentTime)}</span>
          <span>Frame {currentFrame + 1} / {totalFrames}</span>
          <span>{formatTime(totalTime)}</span>
        </div>
      </div>

      {/* Control Buttons */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          {/* Reset Button */}
          <button
            onClick={onReset}
            className="p-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white transition-colors"
            title="Reset to start"
          >
            <SkipBack className="w-5 h-5" />
          </button>

          {/* Step Backward */}
          <button
            onClick={handleStepBackward}
            disabled={currentFrame === 0}
            className="p-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Previous frame"
          >
            <SkipBack className="w-4 h-4" />
          </button>

          {/* Play/Pause Button */}
          <button
            onClick={onPlayPause}
            className="p-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors"
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? (
              <Pause className="w-6 h-6" />
            ) : (
              <Play className="w-6 h-6" />
            )}
          </button>

          {/* Step Forward */}
          <button
            onClick={handleStepForward}
            disabled={currentFrame === totalFrames - 1}
            className="p-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Next frame"
          >
            <SkipForward className="w-4 h-4" />
          </button>
        </div>

        {/* Speed Control */}
        <div className="flex items-center space-x-2">
          <label className="text-sm text-gray-400">Speed:</label>
          <select
            value={playbackSpeed}
            onChange={handleSpeedChange}
            className="px-3 py-1 rounded-lg bg-gray-700 text-white border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value={0.25}>0.25x</option>
            <option value={0.5}>0.5x</option>
            <option value={1}>1x</option>
            <option value={1.5}>1.5x</option>
            <option value={2}>2x</option>
          </select>
        </div>

        {/* Framerate Display */}
        <div className="text-sm text-gray-400">
          {frameRate.toFixed(1)} fps
        </div>
      </div>
    </div>
  );
}
