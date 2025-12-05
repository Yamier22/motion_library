'use client';

import React from 'react';
import { Video } from 'lucide-react';

export interface MuJoCoCamera {
  name: string;
  mujocoId: number; // -1 for "free" camera, >= 0 for MuJoCo cameras
}

interface VideoControlsProps {
  cameras: MuJoCoCamera[];
  activeCamera: string;
  onCameraChange: (cameraName: string) => void;
  onRecord: () => void;
  isRecording: boolean;
  recordingProgress: number;
  disabled?: boolean;
}

export default function VideoControls({
  cameras,
  activeCamera,
  onCameraChange,
  onRecord,
  isRecording,
  recordingProgress,
  disabled = false
}: VideoControlsProps) {
  return (
    <div className="bg-white rounded-lg shadow p-4 space-y-4">
      {/* Camera Selection */}
      <div>
        <h3 className="text-sm font-medium text-gray-700 mb-2">Camera</h3>
        <div className="flex flex-wrap gap-2">
          {cameras.map((cam) => (
            <button
              key={cam.name}
              onClick={() => onCameraChange(cam.name)}
              disabled={isRecording}
              className={`px-4 py-2 rounded transition-colors ${
                activeCamera === cam.name
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
              title={cam.mujocoId >= 0 ? `MuJoCo Camera: ${cam.name}` : 'Free Camera (OrbitControls)'}
            >
              {cam.name}
            </button>
          ))}
        </div>
      </div>

      {/* Recording Controls */}
      <div>
        <h3 className="text-sm font-medium text-gray-700 mb-2">Recording</h3>
        <button
          onClick={onRecord}
          disabled={isRecording || disabled}
          className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          title={disabled ? 'Load a trajectory to enable recording' : 'Record video at 1920x1080 @ 30fps'}
        >
          <Video className="w-5 h-5" />
          {isRecording ? 'Recording...' : 'Record Video'}
        </button>

        {isRecording && (
          <div className="mt-3">
            <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
              <div
                className="bg-red-600 h-2.5 rounded-full transition-all duration-300"
                style={{ width: `${recordingProgress}%` }}
              />
            </div>
            <p className="text-sm text-gray-600 mt-1.5">
              Recording: {Math.round(recordingProgress)}% complete
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
