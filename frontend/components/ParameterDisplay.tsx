/**
 * Parameter Display Component
 * Displays trajectory extra parameters (act, xpos, etc.) in a floating window
 */

'use client';

import React, { useState } from 'react';
import { X } from 'lucide-react';

interface TrajectoryInfo {
  id: string;
  name: string;
  extraParams?: {
    [key: string]: Float64Array[];
  };
}

interface ParameterDisplayProps {
  trajectories: TrajectoryInfo[];
  currentFrame: number;
  onClose: () => void;
}

export default function ParameterDisplay({
  trajectories,
  currentFrame,
  onClose
}: ParameterDisplayProps) {
  const [selectedTrajectoryId, setSelectedTrajectoryId] = useState<string | null>(null);
  const [selectedParam, setSelectedParam] = useState<string | null>(null);

  // Filter trajectories that have extra parameters
  const trajectoriesWithParams = trajectories.filter(t => t.extraParams && Object.keys(t.extraParams).length > 0);

  // Set default selected trajectory
  React.useEffect(() => {
    if (trajectoriesWithParams.length > 0 && !selectedTrajectoryId) {
      setSelectedTrajectoryId(trajectoriesWithParams[0].id);
    }
  }, [trajectoriesWithParams, selectedTrajectoryId]);

  // Get selected trajectory
  const selectedTrajectory = trajectoriesWithParams.find(t => t.id === selectedTrajectoryId);
  const extraParams = selectedTrajectory?.extraParams;

  // Get available parameter types for selected trajectory
  const paramTypes = extraParams ? Object.keys(extraParams) : [];

  // Set default selected parameter when trajectory changes
  React.useEffect(() => {
    if (paramTypes.length > 0) {
      // If no parameter selected or selected parameter doesn't exist in current trajectory
      if (!selectedParam || !paramTypes.includes(selectedParam)) {
        setSelectedParam(paramTypes[0]);
      }
    } else {
      // Clear selection if no parameters available
      setSelectedParam(null);
    }
  }, [paramTypes, selectedParam]);

  if (trajectoriesWithParams.length === 0) {
    return (
      <div className="absolute top-4 left-4 w-80 bg-gray-800 border border-gray-700 rounded-lg shadow-lg p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-white">Parameters</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-300"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-xs text-gray-400">No extra parameters available</p>
      </div>
    );
  }

  // Get current frame data for selected parameter
  const currentParamData = selectedParam && extraParams && extraParams[selectedParam]
    ? extraParams[selectedParam][Math.min(currentFrame, extraParams[selectedParam].length - 1)]
    : null;

  return (
    <div className="absolute top-4 left-4 w-80 bg-gray-800 border border-gray-700 rounded-lg shadow-lg">
      {/* Header with close button */}
      <div className="flex items-center justify-between p-3 border-b border-gray-700">
        <h3 className="text-sm font-semibold text-white">Parameters</h3>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-300"
          title="Close"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Trajectory selector */}
      {trajectoriesWithParams.length > 1 && (
        <div className="p-2 border-b border-gray-700">
          <label className="text-xs text-gray-400 mb-1 block">Trajectory:</label>
          <select
            value={selectedTrajectoryId || ''}
            onChange={(e) => {
              setSelectedTrajectoryId(e.target.value);
              setSelectedParam(null); // Reset parameter selection when trajectory changes
            }}
            className="w-full px-2 py-1 text-xs bg-gray-700 text-white rounded border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {trajectoriesWithParams.map(traj => (
              <option key={traj.id} value={traj.id}>
                {traj.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Parameter type tabs */}
      {paramTypes.length > 0 && (
        <div className="flex border-b border-gray-700 overflow-x-auto">
          {paramTypes.map(paramType => (
            <button
              key={paramType}
              onClick={() => setSelectedParam(paramType)}
              className={`px-4 py-2 text-xs font-medium whitespace-nowrap transition-colors ${
                selectedParam === paramType
                  ? 'bg-blue-600 text-white border-b-2 border-blue-500'
                  : 'text-gray-400 hover:text-gray-300 hover:bg-gray-700'
              }`}
            >
              {paramType}
            </button>
          ))}
        </div>
      )}

      {/* Parameter values */}
      <div className="p-3 max-h-64 overflow-y-auto">
        {extraParams && selectedParam && extraParams[selectedParam] ? (
          <>
            <div className="text-xs text-gray-400 mb-2">
              Frame {currentFrame + 1} / {extraParams[selectedParam].length}
            </div>

            {currentParamData ? (
              <div className="space-y-1">
                {Array.from(currentParamData).map((value, idx) => (
                  <div
                    key={idx}
                    className="flex justify-between items-center p-2 bg-gray-700 rounded text-xs"
                  >
                    <span className="text-gray-300">
                      {selectedParam}[{idx}]
                    </span>
                    <span className="text-white font-mono">
                      {value.toFixed(4)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-500">No data available for current frame</p>
            )}
          </>
        ) : (
          <p className="text-xs text-gray-500">Please select a parameter type</p>
        )}
      </div>

      {/* Summary info */}
      {currentParamData && (
        <div className="p-3 border-t border-gray-700 text-xs text-gray-400">
          <div className="flex justify-between">
            <span>Dimensions:</span>
            <span className="text-white">{currentParamData.length}</span>
          </div>
          <div className="flex justify-between">
            <span>Min:</span>
            <span className="text-white">{Math.min(...Array.from(currentParamData)).toFixed(4)}</span>
          </div>
          <div className="flex justify-between">
            <span>Max:</span>
            <span className="text-white">{Math.max(...Array.from(currentParamData)).toFixed(4)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

