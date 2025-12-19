'use client';

import { useState, useEffect, useRef } from 'react';
import { trajectoryApi, TrajectoryMetadata } from '@/lib/api';
import { Upload } from 'lucide-react';

interface TrajectorySelectorProps {
  onTrajectorySelect: (trajectoryData: Blob, trajectory: TrajectoryMetadata) => void;
  selectedTrajectoryId?: string;
}

interface CategoryGroup {
  categoryName: string;
  trajectories: TrajectoryMetadata[];
}

export default function TrajectorySelector({
  onTrajectorySelect,
  selectedTrajectoryId,
}: TrajectorySelectorProps) {
  const [trajectories, setTrajectories] = useState<TrajectoryMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadingTrajectoryId, setLoadingTrajectoryId] = useState<string | null>(null);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const [defaultCollapsed, setDefaultCollapsed] = useState(true);
  const [thumbnailUrls, setThumbnailUrls] = useState<Map<string, string>>(new Map());
  const [loadedCategories, setLoadedCategories] = useState<Set<string>>(new Set());
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadMode, setUploadMode] = useState<'new' | 'existing'>('new');
  const [newCategoryName, setNewCategoryName] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadTrajectories();
  }, []);

  useEffect(() => {
    // Cleanup blob URLs on unmount
    return () => {
      thumbnailUrls.forEach(url => URL.revokeObjectURL(url));
    };
  }, [thumbnailUrls]);

  const loadTrajectories = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await trajectoryApi.list();
      setTrajectories(response.trajectories);

      // Initialize all categories as collapsed if defaultCollapsed is true
      if (defaultCollapsed) {
        const categoryNames = new Set<string>();
        response.trajectories.forEach((trajectory) => {
          const categoryName = trajectory.category || 'Uncategorized';
          categoryNames.add(categoryName);
        });
        setCollapsedCategories(categoryNames);
        setDefaultCollapsed(false); // Only do this once
      }
    } catch (err) {
      setError('Failed to load trajectories');
      console.error('Error loading trajectories:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleTrajectoryClick = async (trajectory: TrajectoryMetadata) => {
    console.log('[TRAJECTORY SELECTOR] Trajectory clicked:', trajectory.filename);
    try {
      setLoadingTrajectoryId(trajectory.id);
      setError(null);

      console.log('[TRAJECTORY SELECTOR] Fetching trajectory file from API...');
      // Fetch the trajectory data file
      const blob = await trajectoryApi.get(trajectory.id);
      console.log('[TRAJECTORY SELECTOR] Blob received:', { size: blob.size, type: blob.type });

      console.log('[TRAJECTORY SELECTOR] Calling onTrajectorySelect callback...');
      onTrajectorySelect(blob, trajectory);
      console.log('[TRAJECTORY SELECTOR] Callback completed');
    } catch (err) {
      setError('Failed to load trajectory file');
      console.error('[TRAJECTORY SELECTOR] Error loading trajectory file:', err);
    } finally {
      setLoadingTrajectoryId(null);
    }
  };

  const toggleCategory = (categoryName: string) => {
    setCollapsedCategories((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(categoryName)) {
        newSet.delete(categoryName);
        // Load thumbnails for this category when expanded
        loadCategoryThumbnails(categoryName);
      } else {
        newSet.add(categoryName);
      }
      return newSet;
    });
  };

  const loadCategoryThumbnails = async (categoryName: string) => {
    // Don't reload if already loaded
    if (loadedCategories.has(categoryName)) {
      return;
    }

    console.log('[TRAJECTORY SELECTOR] Loading thumbnails for category:', categoryName);

    // Get trajectories in this category
    const categoryTrajectories = trajectories.filter(
      t => (t.category || 'Uncategorized') === categoryName
    );

    const urlMap = new Map(thumbnailUrls);

    for (const trajectory of categoryTrajectories) {
      if (trajectory.thumbnail_path && !urlMap.has(trajectory.id)) {
        try {
          console.log('[TRAJECTORY SELECTOR] Preloading thumbnail for:', trajectory.id, trajectory.filename);
          const blob = await trajectoryApi.getThumbnail(trajectory.id);
          const blobUrl = URL.createObjectURL(blob);
          urlMap.set(trajectory.id, blobUrl);
          console.log('[TRAJECTORY SELECTOR] Thumbnail preloaded:', trajectory.id);
        } catch (err) {
          console.error('[TRAJECTORY SELECTOR] Failed to preload thumbnail:', trajectory.id, err);
        }
      }
    }

    setThumbnailUrls(urlMap);
    setLoadedCategories(prev => new Set(prev).add(categoryName));
  };

  // Group trajectories by category
  const groupTrajectories = (): CategoryGroup[] => {
    const categoryMap = new Map<string, TrajectoryMetadata[]>();

    trajectories.forEach((trajectory) => {
      const categoryName = trajectory.category || 'Uncategorized';

      if (!categoryMap.has(categoryName)) {
        categoryMap.set(categoryName, []);
      }
      categoryMap.get(categoryName)!.push(trajectory);
    });

    // Convert to array and sort by category name
    return Array.from(categoryMap.entries())
      .map(([categoryName, trajectories]) => ({ categoryName, trajectories }))
      .sort((a, b) => a.categoryName.localeCompare(b.categoryName));
  };

  // Get all unique categories
  const getAllCategories = (): string[] => {
    const categories = new Set<string>();
    trajectories.forEach((trajectory) => {
      if (trajectory.category) {
        categories.add(trajectory.category);
      }
    });
    return Array.from(categories).sort();
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && (file.name.endsWith('.npy') || file.name.endsWith('.npz'))) {
      setSelectedFile(file);
    } else if (file) {
      alert('请选择 .npy 或 .npz 文件');
      setSelectedFile(null);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      alert('请先选择文件');
      return;
    }

    let category: string | undefined;
    if (uploadMode === 'new') {
      if (!newCategoryName.trim()) {
        alert('请输入文件夹名称');
        return;
      }
      category = newCategoryName.trim();
    } else {
      if (!selectedCategory) {
        alert('请选择文件夹');
        return;
      }
      category = selectedCategory === 'Uncategorized' ? undefined : selectedCategory;
    }

    setUploading(true);
    try {
      await trajectoryApi.upload(selectedFile, category);
      // Reload trajectories
      await loadTrajectories();
      // Reset form
      setShowUploadModal(false);
      setSelectedFile(null);
      setNewCategoryName('');
      setSelectedCategory('');
      setUploadMode('new');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      alert('上传成功！');
    } catch (err) {
      console.error('Error uploading trajectory:', err);
      alert('上传失败: ' + (err instanceof Error ? err.message : '未知错误'));
    } finally {
      setUploading(false);
    }
  };

  const openUploadModal = () => {
    setShowUploadModal(true);
    setSelectedFile(null);
    setNewCategoryName('');
    setSelectedCategory('');
    setUploadMode('new');
  };

  const closeUploadModal = () => {
    if (!uploading) {
      setShowUploadModal(false);
      setSelectedFile(null);
      setNewCategoryName('');
      setSelectedCategory('');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  if (loading) {
    return (
      <div className="p-4">
        <h3 className="text-lg font-semibold mb-4 text-gray-200" style={{ height: '32px', marginTop: '0px', marginBottom: '0px' }}>Trajectories</h3>
        <div className="text-gray-400 text-sm">Loading trajectories...</div>
      </div>
    );
  }

  if (error && trajectories.length === 0) {
    return (
      <div className="p-4">
        <h3 className="text-lg font-semibold mb-4 text-gray-200" style={{ height: '32px', marginTop: '0px', marginBottom: '0px' }}>Trajectories</h3>
        <div className="text-red-400 text-sm">{error}</div>
        <button
          type="button"
          onClick={loadTrajectories}
          className="mt-2 text-blue-400 hover:text-blue-300 text-sm"
        >
          Retry
        </button>
      </div>
    );
  }

  const categoryGroups = groupTrajectories();

  const allCategories = getAllCategories();

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4 relative">
        <h3 className="text-lg font-semibold text-gray-200" style={{ height: '32px', marginTop: '5px', marginBottom: '5px' }}>Trajectories</h3>
        <button
          type="button"
          onClick={openUploadModal}
          className="flex items-center justify-center gap-1 px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
          style={{ width: '180px', marginTop: '10px', marginBottom: '10px', marginLeft: '0px', marginRight: '0px', position: 'static' }}
        >
          <Upload className="w-4 h-4" />
          Upload Trajectory
        </button>
      </div>

      {error && (
        <div className="mb-3 text-red-400 text-xs bg-red-900 bg-opacity-20 p-2 rounded">
          {error}
        </div>
      )}

      {/* Upload Modal */}
      {showUploadModal && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          onClick={closeUploadModal}
        >
          <div 
            className="bg-gray-800 rounded-lg p-6 w-full max-w-md border border-gray-700"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold text-white mb-4">上传轨迹文件</h2>

            {/* Folder Selection Mode */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                选择文件夹
              </label>
              <div className="flex gap-2 mb-3">
                <button
                  type="button"
                  onClick={() => setUploadMode('new')}
                  className={`flex-1 px-4 py-2 rounded transition-colors ${
                    uploadMode === 'new'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  新建文件夹
                </button>
                <button
                  type="button"
                  onClick={() => setUploadMode('existing')}
                  className={`flex-1 px-4 py-2 rounded transition-colors ${
                    uploadMode === 'existing'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  使用已有文件夹
                </button>
              </div>

              {uploadMode === 'new' ? (
                <input
                  type="text"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="输入新文件夹名称"
                  className="w-full px-3 py-2 bg-gray-700 text-white rounded border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              ) : (
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-700 text-white rounded border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">选择文件夹</option>
                  {allCategories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* File Selection */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                选择文件
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".npy,.npz"
                onChange={handleFileSelect}
                className="w-full px-3 py-2 bg-gray-700 text-white rounded border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700"
              />
              {selectedFile && (
                <p className="mt-2 text-sm text-gray-400">
                  已选择: {selectedFile.name}
                </p>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={closeUploadModal}
                disabled={uploading}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleUpload}
                disabled={uploading || !selectedFile}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {uploading ? '上传中...' : '上传'}
              </button>
            </div>
          </div>
        </div>
      )}

      {trajectories.length === 0 ? (
        <div className="text-gray-400 text-sm">No trajectories available</div>
      ) : (
        <div className="space-y-3">
          {categoryGroups.map((group) => {
            const isCollapsed = collapsedCategories.has(group.categoryName);

            return (
              <div key={group.categoryName} className="space-y-2">
                {/* Category Header */}
                <button
                  type="button"
                  onClick={() => toggleCategory(group.categoryName)}
                  className="w-full flex items-center gap-2 p-2 rounded bg-gray-700 hover:bg-gray-600 transition-colors"
                >
                  {/* Arrow icon */}
                  <svg
                    className={`w-4 h-4 text-gray-400 transition-transform ${
                      isCollapsed ? '-rotate-90' : ''
                    }`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                  <span className="text-sm font-medium text-gray-200">
                    {group.categoryName}
                  </span>
                  <span className="text-xs text-gray-400">
                    ({group.trajectories.length})
                  </span>
                </button>

                {/* Trajectories in category */}
                {!isCollapsed && (
                  <div className="grid grid-cols-2 gap-2">
                    {group.trajectories.map((trajectory) => {
                      const isSelected = trajectory.id === selectedTrajectoryId;
                      const isLoading = trajectory.id === loadingTrajectoryId;

                      return (
                        <button
                          key={trajectory.id}
                          type="button"
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
                          <div className="flex flex-col gap-2">
                            {/* Thumbnail preview */}
                            <div className="w-full aspect-square bg-gray-600 rounded overflow-hidden">
                              {thumbnailUrls.get(trajectory.id) ? (
                                <img
                                  src={thumbnailUrls.get(trajectory.id)}
                                  alt={trajectory.filename}
                                  className="w-full h-full object-cover"
                                />
                              ) : trajectory.thumbnail_path ? (
                                <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">
                                  Loading...
                                </div>
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">
                                  No preview
                                </div>
                              )}
                            </div>

                            {/* Info section */}
                            <div className="flex flex-col gap-1">
                              <div className="text-xs text-gray-200 font-medium break-words">
                                {trajectory.filename}
                              </div>
                              {isLoading && (
                                <div className="text-xs text-blue-400">Loading...</div>
                              )}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
