'use client';

import React, { useRef, useState, useEffect } from 'react';
import { Paintbrush, RotateCcw, Trash2, Eye, Check, Sparkles } from 'lucide-react';

interface InpaintCanvasProps {
  imageSrc: string;
  onInpaintSubmit: (maskBlob: Blob) => void;
  isProcessing?: boolean;
}

export const InpaintCanvas: React.FC<InpaintCanvasProps> = ({
  imageSrc,
  onInpaintSubmit,
  isProcessing,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const imageCanvasRef = useRef<HTMLCanvasElement>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement>(null);

  const [brushRadius, setBrushRadius] = useState<number>(20);
  const [isDrawing, setIsDrawing] = useState<boolean>(false);
  const [strokeHistory, setStrokeHistory] = useState<ImageData[]>([]);
  const [imageLoaded, setImageLoaded] = useState<boolean>(false);
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });

  // Load image into base canvas
  useEffect(() => {
    if (!imageSrc) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      setImageDimensions({ width: img.width, height: img.height });

      const imgCanvas = imageCanvasRef.current;
      const maskCanvas = maskCanvasRef.current;

      if (imgCanvas && maskCanvas) {
        imgCanvas.width = img.width;
        imgCanvas.height = img.height;

        maskCanvas.width = img.width;
        maskCanvas.height = img.height;

        const imgCtx = imgCanvas.getContext('2d');
        const maskCtx = maskCanvas.getContext('2d');

        if (imgCtx && maskCtx) {
          // Draw base image
          imgCtx.clearRect(0, 0, img.width, img.height);
          imgCtx.drawImage(img, 0, 0);

          // Clear mask canvas (transparent)
          maskCtx.clearRect(0, 0, img.width, img.height);
          
          // Save initial blank state to stroke history
          const initialState = maskCtx.getImageData(0, 0, img.width, img.height);
          setStrokeHistory([initialState]);
          setImageLoaded(true);
        }
      }
    };
    img.src = imageSrc;
  }, [imageSrc]);

  // Coordinate helper mapping pointer event to canvas coordinates
  const getCanvasCoordinates = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = maskCanvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    let clientX = 0;
    let clientY = 0;

    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    setIsDrawing(true);
    draw(e);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    e.preventDefault();

    const canvas = maskCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { x, y } = getCanvasCoordinates(e);

    ctx.lineWidth = brushRadius * 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // Draw white strokes on mask canvas with semi-transparent overlay
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';

    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, brushRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);

    const canvas = maskCanvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.beginPath();
        // Push current state to undo history stack
        const currentState = ctx.getImageData(0, 0, canvas.width, canvas.height);
        setStrokeHistory((prev) => [...prev, currentState]);
      }
    }
  };

  const handleUndo = () => {
    if (strokeHistory.length <= 1) return;

    const canvas = maskCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const newHistory = [...strokeHistory];
    newHistory.pop(); // Remove last state
    const previousState = newHistory[newHistory.length - 1];

    ctx.putImageData(previousState, 0, 0);
    setStrokeHistory(newHistory);
  };

  const handleClear = () => {
    const canvas = maskCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const clearedState = ctx.getImageData(0, 0, canvas.width, canvas.height);
    setStrokeHistory([clearedState]);
  };

  const handleExportMask = () => {
    const maskCanvas = maskCanvasRef.current;
    if (!maskCanvas) return;

    // Create binary mask canvas (Black background, pure white strokes)
    const binaryCanvas = document.createElement('canvas');
    binaryCanvas.width = maskCanvas.width;
    binaryCanvas.height = maskCanvas.height;

    const binaryCtx = binaryCanvas.getContext('2d');
    if (!binaryCtx) return;

    // Fill black background
    binaryCtx.fillStyle = '#000000';
    binaryCtx.fillRect(0, 0, binaryCanvas.width, binaryCanvas.height);

    // Draw white strokes from current mask canvas
    binaryCtx.drawImage(maskCanvas, 0, 0);

    // Convert to PNG blob
    binaryCanvas.toBlob((blob) => {
      if (blob) {
        onInpaintSubmit(blob);
      }
    }, 'image/png');
  };

  return (
    <div className="flex flex-col items-center w-full gap-4">
      {/* Brush Toolbar Controls */}
      <div className="flex flex-wrap items-center justify-between w-full p-3 border rounded-xl border-neutral-200 dark:border-neutral-800 bg-neutral-100 dark:bg-neutral-950/80 gap-3">
        {/* Brush Size Slider */}
        <div className="flex items-center gap-3">
          <Paintbrush className="h-4 w-4 text-neutral-600 dark:text-neutral-300" />
          <span className="font-mono text-xs text-neutral-600 dark:text-neutral-400">Size:</span>
          <input
            type="range"
            min="5"
            max="60"
            value={brushRadius}
            onChange={(e) => setBrushRadius(Number(e.target.value))}
            className="w-28 accent-black dark:accent-white cursor-pointer"
          />
          <span className="font-mono text-xs text-black dark:text-white">{brushRadius}px</span>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleUndo}
            disabled={strokeHistory.length <= 1 || isProcessing}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-neutral-300 dark:border-neutral-800 bg-neutral-200 dark:bg-neutral-900 text-neutral-800 dark:text-neutral-300 hover:text-black dark:hover:text-white hover:border-neutral-400 dark:hover:border-neutral-700 disabled:opacity-40 transition-all"
            title="Undo stroke"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Undo</span>
          </button>

          <button
            onClick={handleClear}
            disabled={strokeHistory.length <= 1 || isProcessing}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-neutral-300 dark:border-neutral-800 bg-neutral-200 dark:bg-neutral-900 text-neutral-800 dark:text-neutral-300 hover:text-black dark:hover:text-white hover:border-neutral-400 dark:hover:border-neutral-700 disabled:opacity-40 transition-all"
            title="Clear brush mask"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>Clear</span>
          </button>

          <button
            onClick={handleExportMask}
            disabled={isProcessing}
            className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded-md border border-black dark:border-white bg-white text-black hover:bg-black hover:text-white dark:bg-white dark:text-black dark:hover:bg-black dark:hover:text-white transition-all disabled:opacity-50 shadow-sm"
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>Inpaint Mask</span>
          </button>
        </div>
      </div>

      {/* Canvas Workspace Container */}
      <div
        ref={containerRef}
        className="relative flex items-center justify-center w-full max-h-[500px] overflow-hidden rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 p-2"
      >
        <div className="relative max-w-full max-h-[480px]">
          {/* Base Image Canvas */}
          <canvas
            ref={imageCanvasRef}
            className="block max-w-full max-h-[480px] object-contain rounded"
          />

          {/* Interactive Brush Mask Canvas (Overlaid) */}
          <canvas
            ref={maskCanvasRef}
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={stopDrawing}
            onMouseLeave={stopDrawing}
            onTouchStart={startDrawing}
            onTouchMove={draw}
            onTouchEnd={stopDrawing}
            className="absolute inset-0 max-w-full max-h-[480px] object-contain cursor-crosshair rounded touch-none"
          />
        </div>
      </div>

      <div className="flex items-center justify-between w-full px-1 text-[11px] font-mono text-neutral-600 dark:text-neutral-400">
        <span>Brush over visible badges (e.g. Gemini sparkle) to generate binary inpaint stencil.</span>
        <span>{imageDimensions.width} x {imageDimensions.height} px</span>
      </div>
    </div>
  );
};
