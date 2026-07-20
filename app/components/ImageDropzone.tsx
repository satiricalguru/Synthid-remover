'use client';

import React, { useState, useRef } from 'react';
import { Upload, Image as ImageIcon, FileWarning, CheckCircle, Lock } from 'lucide-react';

interface ImageDropzoneProps {
  onImageSelected: (file: File) => void;
  disabled?: boolean;
}

const SUPPORTED_FORMATS = ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/heic'];
const MAX_FILE_SIZE_MB = 20;

export const ImageDropzone: React.FC<ImageDropzoneProps> = ({ onImageSelected, disabled }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateAndHandleFile = (file: File) => {
    setErrorMessage(null);

    // Size validation
    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      setErrorMessage(`File exceeds the maximum size limit of ${MAX_FILE_SIZE_MB}MB.`);
      return;
    }

    // Format validation (allow standard image formats)
    if (!file.type.startsWith('image/')) {
      setErrorMessage('Unsupported file format. Please upload JPG, PNG, WEBP, or AVIF.');
      return;
    }

    onImageSelected(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (disabled) return;

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      validateAndHandleFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      validateAndHandleFile(e.target.files[0]);
    }
  };

  return (
    <div className="w-full">
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !disabled && fileInputRef.current?.click()}
        className={`group relative flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed p-8 transition-all duration-300 ${
          isDragging
            ? 'border-black dark:border-white bg-neutral-100 dark:bg-neutral-900/80 scale-[1.01]'
            : 'border-neutral-300 dark:border-neutral-800 bg-white dark:bg-neutral-950/60 hover:border-neutral-400 dark:hover:border-neutral-600 hover:bg-neutral-50 dark:hover:bg-neutral-900/40'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif,image/heic"
          onChange={handleFileChange}
          className="hidden"
          disabled={disabled}
        />

        {/* Upload Icon Box */}
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-100 dark:bg-neutral-900 shadow-inner group-hover:border-neutral-400 dark:group-hover:border-neutral-600 group-hover:bg-neutral-200 dark:group-hover:bg-neutral-800">
          <Upload className="h-6 w-6 text-neutral-600 dark:text-neutral-300 group-hover:text-black dark:group-hover:text-white transition-colors" />
        </div>

        {/* Header Text */}
        <h3 className="mb-1 text-center font-sans text-base font-semibold tracking-tight text-black dark:text-white">
          Drop an image here or click to browse
        </h3>

        <p className="mb-4 text-center text-xs text-neutral-500 dark:text-neutral-400">
          Supports JPG, PNG, WEBP, AVIF up to {MAX_FILE_SIZE_MB}MB
        </p>

        {/* Privacy Callout */}
        <div className="flex items-center gap-2 rounded-full border border-neutral-200 dark:border-neutral-850 bg-neutral-100 dark:bg-neutral-900/80 px-3 py-1 font-mono text-[11px] text-neutral-600 dark:text-neutral-400">
          <Lock className="h-3 w-3 text-neutral-500 dark:text-neutral-400" />
          <span>Private local processing · Never leaves your browser</span>
        </div>
      </div>

      {/* Error Banner */}
      {errorMessage && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-red-900/50 bg-red-950/40 p-3 text-xs text-red-400">
          <FileWarning className="h-4 w-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}
    </div>
  );
};
