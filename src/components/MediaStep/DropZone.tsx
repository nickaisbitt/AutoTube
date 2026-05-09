import { useState, useCallback, useRef } from 'react';
import { Upload, X, FileVideo, Image as ImageIcon, CheckCircle2 } from 'lucide-react';

interface DropZoneProps {
  onFilesAdded: (files: { file: File; dataUrl: string; type: 'image' | 'video' }[]) => void;
}

export default function DropZone({ onFilesAdded }: DropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [uploadedFiles, setUploadedFiles] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm', 'video/quicktime'];

  const fileToDataUrl = useCallback((file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }, []);

  const simulateProgress = useCallback((fileName: string) => {
    let progress = 0;
    const interval = setInterval(() => {
      progress += Math.random() * 30 + 10;
      if (progress >= 100) {
        progress = 100;
        clearInterval(interval);
      }
      setUploadProgress((prev) => ({ ...prev, [fileName]: Math.min(progress, 100) }));
    }, 100);
    return interval;
  }, []);

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const validFiles = Array.from(files).filter((f) => ACCEPTED_TYPES.includes(f.type));
    if (validFiles.length === 0) return;

    const results: { file: File; dataUrl: string; type: 'image' | 'video' }[] = [];
    const intervals: ReturnType<typeof setInterval>[] = [];

    for (const file of validFiles) {
      const interval = simulateProgress(file.name);
      intervals.push(interval);
      try {
        const dataUrl = await fileToDataUrl(file);
        clearInterval(interval);
        setUploadProgress((prev) => ({ ...prev, [file.name]: 100 }));
        const fileType: 'image' | 'video' = file.type.startsWith('video') ? 'video' : 'image';
        results.push({ file, dataUrl, type: fileType });
        setUploadedFiles((prev) => [...prev, file.name]);
      } catch {
        clearInterval(interval);
        setUploadProgress((prev) => {
          const next = { ...prev };
          delete next[file.name];
          return next;
        });
      }
    }

    if (results.length > 0) {
      onFilesAdded(results);
    }

    setTimeout(() => {
      setUploadProgress({});
      setUploadedFiles([]);
    }, 2000);
  }, [fileToDataUrl, simulateProgress, onFilesAdded]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files) {
      handleFiles(e.dataTransfer.files);
    }
  }, [handleFiles]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      handleFiles(e.target.files);
      e.target.value = '';
    }
  }, [handleFiles]);

  const hasActiveUploads = Object.keys(uploadProgress).length > 0;

  return (
    <div className="space-y-3">
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative flex flex-col items-center justify-center gap-3 border-2 border-dashed px-6 py-8 text-center ${
          isDragging
            ? 'border-brand-500 bg-brand-500/10'
            : 'border-surface-600 bg-surface-900/50 hover:border-surface-500'
        }`}
      >
        <Upload className={`h-8 w-8 ${isDragging ? 'text-brand-400' : 'text-surface-500'}`} />
        <div>
          <p className="text-sm font-medium text-surface-300">
            {isDragging ? 'Drop files here' : 'Drag & drop images or videos'}
          </p>
          <p className="mt-1 text-xs text-surface-500">
            JPG, PNG, WebP, GIF, MP4, WebM
          </p>
        </div>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="mt-2 border-2 border-brand-500 bg-surface-900 px-4 py-2 text-xs font-bold uppercase text-brand-400 hover:bg-brand-500 hover:text-black"
        >
          Browse Files
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime"
          onChange={handleFileInput}
          className="hidden"
        />
      </div>

      {hasActiveUploads && (
        <div className="space-y-2">
          {Object.entries(uploadProgress).map(([fileName, progress]) => (
            <div key={fileName} className="flex items-center gap-3 border-2 border-surface-700 bg-surface-900 px-3 py-2">
              {uploadedFiles.includes(fileName) ? (
                <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-emerald-400" />
              ) : (
                <div className="h-4 w-4 flex-shrink-0">
                  {fileName.match(/\.(mp4|webm|mov)$/i) ? (
                    <FileVideo className="h-4 w-4 text-surface-400" />
                  ) : (
                    <ImageIcon className="h-4 w-4 text-surface-400" />
                  )}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs text-surface-300">{fileName}</p>
                <div className="mt-1 h-1.5 overflow-hidden bg-surface-800">
                  <div
                    className="h-full bg-brand-500"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
              <span className="text-[10px] font-mono text-surface-500">
                {Math.round(progress)}%
              </span>
              {progress >= 100 && (
                <button
                  onClick={() => {
                    setUploadProgress((prev) => {
                      const next = { ...prev };
                      delete next[fileName];
                      return next;
                    });
                  }}
                  className="text-surface-500 hover:text-surface-300"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
