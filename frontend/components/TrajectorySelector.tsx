'use client';

import { useState, useEffect } from 'react';
import { trajectoryApi, TrajectoryMetadata } from '@/lib/api';

interface TrajectorySelectorProps {
  onTrajectorySelect: (trajectoryData: Blob, trajectory: TrajectoryMetadata) => void;
  selectedTrajectoryId?: string;
}

export default function TrajectorySelector({
  onTrajectorySelect,
  selectedTrajectoryId,
}: TrajectorySelectorProps) {
  const [trajectories, setTrajectories] = useState<TrajectoryMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadingTrajectoryId, setLoadingTrajectoryId] = useState<string | null>(null);

  useEffect(() => {
    loadTrajectories();
  }, []);

  const loadTrajectories = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await trajectoryApi.list();
      setTrajectories(response.trajectories);
    } catch (err) {
      setError('Failed to load trajectories');
      console.error('Error loading trajectories:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleTrajectoryClick = async (trajectory: TrajectoryMetadata) => {
    try {
      setLoadingTrajectoryId(trajectory.id);
      setError(null);

      // Fetch the trajectory data file
      const blob = await trajectoryApi.get(trajectory.id);

      onTrajectorySelect(blob, trajectory);
    } catch (err) {
      setError('Failed to load trajectory file');
      console.error('Error loading trajectory file:', err);
    } finally {
      setLoadingTrajectoryId(null);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  if (loading) {
    return (
      <div className="p-4">
        <h3 className="text-lg font-semibold mb-4 text-gray-200">Trajectories</h3>
        <div className="text-gray-400 text-sm">Loading trajectories...</div>
      </div>
    );
  }

  if (error && trajectories.length === 0) {
    return (
      <div className="p-4">
        <h3 className="text-lg font-semibold mb-4 text-gray-200">Trajectories</h3>
        <div className="text-red-400 text-sm">{error}</div>
        <button
          onClick={loadTrajectories}
          className="mt-2 text-blue-400 hover:text-blue-300 text-sm"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="p-4">
      <h3 className="text-lg font-semibold mb-4 text-gray-200">Trajectories</h3>

      {error && (
        <div className="mb-3 text-red-400 text-xs bg-red-900 bg-opacity-20 p-2 rounded">
          {error}
        </div>
      )}

      {trajectories.length === 0 ? (
        <div className="text-gray-400 text-sm">No trajectories available</div>
      ) : (
        <div className="space-y-2">
          {trajectories.map((trajectory) => {
            const isSelected = trajectory.id === selectedTrajectoryId;
            const isLoading = trajectory.id === loadingTrajectoryId;

            return (
              <button
                key={trajectory.id}
                onClick={() => handleTrajectoryClick(trajectory)}
                disabled={isLoading}
                className={`
                  w-full text-left p-3 rounded transition-colors
                  ${
                    isSelected
                      ? 'bg-blue-600 bg-opacity-30 border border-blue-500'
                      : 'bg-gray-700 hover:bg-gray-600 border border-transparent'
                  }
                  ${isLoading ? 'opacity-50 cursor-wait' : 'cursor-pointer'}
                `}
              >
                <div className="flex flex-col gap-1">
                  {trajectory.category && (
                    <div className="text-xs text-gray-400 font-medium">
                      {trajectory.category}
                    </div>
                  )}
                  <div className="text-sm text-gray-200 font-medium">
                    {trajectory.filename}
                  </div>
                  <div className="text-xs text-gray-400">
                    {formatFileSize(trajectory.file_size)}
                    {trajectory.frame_count && ` • ${trajectory.frame_count} frames`}
                    {trajectory.frame_rate && ` • ${trajectory.frame_rate} fps`}
                  </div>
                </div>
                {isLoading && (
                  <div className="mt-2 text-xs text-blue-400">Loading...</div>
                )}
              </button>
            );
          })}
        </div>
      )}

      <div className="mt-4 text-xs text-gray-500 border-t border-gray-700 pt-3">
        Note: Trajectory playback requires NPY/NPZ parsing (coming soon)
      </div>
    </div>
  );
}
