'use client';

import React, { useState, useEffect, useRef } from 'react';

export const HeroImageScanner: React.FC = () => {
  const [sliderPos, setSliderPos] = useState<number>(0);
  const [isHovering, setIsHovering] = useState<boolean>(false);
  const [containerWidth, setContainerWidth] = useState<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.clientWidth);
      }
    };
    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  // Auto-animate slider position when user is not hovering
  useEffect(() => {
    if (isHovering) return;

    let startTime = Date.now();
    const duration = 7000; // 7 seconds per full cycle

    const interval = setInterval(() => {
      const elapsed = (Date.now() - startTime) % duration;
      const progress = elapsed / duration;
      // Smooth full sweep from 0% (full left) to 100% (full right)
      const newPos = 50 - 50 * Math.cos(progress * Math.PI * 2);
      setSliderPos(newPos);
    }, 16);

    return () => clearInterval(interval);
  }, [isHovering]);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));
    setSliderPos(percentage);
  };

  return (
    <div className="relative rounded-2xl border border-neutral-800 bg-neutral-950 p-4 shadow-2xl overflow-hidden">
      {/* Scanner Header */}
      <div className="mb-3 flex items-center justify-between font-mono text-[10px] tracking-widest text-neutral-400 uppercase select-none">
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span>signal · scrub</span>
        </span>
        <div className="flex items-center gap-1.5 text-white">
          <span className="h-1.5 w-1.5 rounded-full bg-white animate-ping" />
          <span>live preview</span>
        </div>
      </div>

      {/* Interactive Image Container */}
      <div
        ref={containerRef}
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
        onMouseMove={handleMouseMove}
        className="relative h-72 w-full overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900 select-none cursor-ew-resize group"
      >
        {/* Base Layer: Image WITH Watermark */}
        <div className="absolute inset-0 bg-black">
          <img
            src={`${process.env.NEXT_PUBLIC_BASE_PATH || ''}/hero-watermarked.jpg`}
            alt="Watermarked Sample"
            className="h-full w-full object-contain"
          />
          {/* Frequency Dither Overlay */}
          <div className="absolute inset-0 bg-grid-pattern opacity-25 pointer-events-none" />
        </div>

        {/* Right Clipped Layer (sliderPos% to 100%): EMBEDDED SYNTHID SIGNAL Badge */}
        <div
          className="absolute inset-y-0 right-0 overflow-hidden pointer-events-none z-10"
          style={{ left: `${sliderPos}%` }}
        >
          <div
            className="relative h-full"
            style={{ width: containerWidth > 0 ? `${containerWidth}px` : '100%', marginLeft: `-${sliderPos}%` }}
          >
            <div className="absolute top-3 right-3 rounded-md bg-black/85 backdrop-blur-md px-2.5 py-1 font-mono text-[10px] font-medium text-neutral-300 uppercase tracking-wider border border-neutral-800 shadow-lg">
              embedded synthid signal
            </div>
          </div>
        </div>

        {/* Top Clipped Layer (0% to sliderPos%): Image WITH Watermark REMOVED & CLEARED SIGNAL Badge */}
        <div
          className="absolute inset-y-0 left-0 overflow-hidden"
          style={{ width: `${sliderPos}%` }}
        >
          <div
            className="relative h-full bg-black"
            style={{ width: containerWidth > 0 ? `${containerWidth}px` : '100%' }}
          >
            <img
              src={`${process.env.NEXT_PUBLIC_BASE_PATH || ''}/hero-cleaned.jpg`}
              alt="Cleaned Sample"
              className="h-full w-full object-contain"
            />
            {/* Label Left: CLEARED SIGNAL */}
            <div className="absolute top-3 left-3 rounded-md bg-black/85 backdrop-blur-md px-2.5 py-1 font-mono text-[10px] font-semibold text-white uppercase tracking-wider border border-white/20 shadow-lg z-10">
              cleared signal
            </div>
          </div>
        </div>

        {/* Vertical Scan Divider Bar */}
        <div
          className="absolute inset-y-0 w-0.5 bg-white shadow-[0_0_12px_rgba(255,255,255,0.9)] pointer-events-none transition-transform duration-75"
          style={{ left: `${sliderPos}%` }}
        >
          {/* Slider Handle Grip */}
          <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-7 w-7 rounded-full border border-white bg-black/90 text-white flex items-center justify-center shadow-xl backdrop-blur-md text-[10px] font-mono font-bold">
            ↔
          </div>
        </div>
      </div>

      {/* Scanner Footer Legend */}
      <div className="mt-3 flex items-center justify-between font-mono text-[10px] text-neutral-400 uppercase select-none">
        <span>SynthID · C2PA · EXIF</span>
        <span>1-pass local process</span>
      </div>
    </div>
  );
};
