'use client';

import { useState, useEffect } from 'react';
import { modelApi, ModelMetadata } from '@/lib/api';

interface ModelSelectorProps {
  onModelSelect: (modelXML: string, model: ModelMetadata) => void;
  selectedModelId?: string;
}

export default function ModelSelector({ onModelSelect, selectedModelId }: ModelSelectorProps) {
  const [models, setModels] = useState<ModelMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadingModelId, setLoadingModelId] = useState<string | null>(null);

  useEffect(() => {
    loadModels();
  }, []);

  const loadModels = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await modelApi.list();
      setModels(response.models);
    } catch (err) {
      setError('Failed to load models');
      console.error('Error loading models:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleModelClick = async (model: ModelMetadata) => {
    try {
      setLoadingModelId(model.id);
      setError(null);

      // Fetch the model XML file
      const blob = await modelApi.get(model.id);
      const xmlContent = await blob.text();

      onModelSelect(xmlContent, model);
    } catch (err) {
      setError('Failed to load model file');
      console.error('Error loading model file:', err);
    } finally {
      setLoadingModelId(null);
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
        <h3 className="text-lg font-semibold mb-4 text-gray-200">Models</h3>
        <div className="text-gray-400 text-sm">Loading models...</div>
      </div>
    );
  }

  if (error && models.length === 0) {
    return (
      <div className="p-4">
        <h3 className="text-lg font-semibold mb-4 text-gray-200">Models</h3>
        <div className="text-red-400 text-sm">{error}</div>
        <button
          onClick={loadModels}
          className="mt-2 text-blue-400 hover:text-blue-300 text-sm"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="p-4">
      <h3 className="text-lg font-semibold mb-4 text-gray-200">Models</h3>

      {error && (
        <div className="mb-3 text-red-400 text-xs bg-red-900 bg-opacity-20 p-2 rounded">
          {error}
        </div>
      )}

      {models.length === 0 ? (
        <div className="text-gray-400 text-sm">No models available</div>
      ) : (
        <div className="space-y-2">
          {models.map((model) => {
            const isSelected = model.id === selectedModelId;
            const isLoading = model.id === loadingModelId;

            return (
              <button
                key={model.id}
                onClick={() => handleModelClick(model)}
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
                  {model.model_name && (
                    <div className="text-xs text-gray-400 font-medium">
                      {model.model_name}
                    </div>
                  )}
                  <div className="text-sm text-gray-200 font-medium">
                    {model.filename}
                  </div>
                  <div className="text-xs text-gray-400">
                    {formatFileSize(model.file_size)}
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
    </div>
  );
}
