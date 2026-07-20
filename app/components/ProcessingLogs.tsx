'use client';

import React from 'react';
import { Terminal, CheckCircle2, Clock, Cpu, HardDrive } from 'lucide-react';

interface ProcessingLogsProps {
  logs: string[];
  isProcessing?: boolean;
  executionTimeMs?: number;
  dimensions?: { width: number; height: number };
  originalSize?: number;
  processedSize?: number;
}

export const ProcessingLogs: React.FC<ProcessingLogsProps> = ({
  logs,
  isProcessing,
  executionTimeMs,
  dimensions,
  originalSize,
  processedSize,
}) => {
  return (
    <div className="w-full rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 p-4 font-mono text-xs shadow-2xl">
      {/* Terminal Header */}
      <div className="mb-3 flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800/80 pb-2.5">
        <div className="flex items-center gap-2 text-neutral-700 dark:text-neutral-300">
          <Terminal className="h-4 w-4 text-black dark:text-white" />
          <span className="font-sans text-xs font-semibold tracking-wide text-black dark:text-white uppercase">
            Telemetry & Processing Terminal
          </span>
        </div>

        {/* Live Status Indicator */}
        <div className="flex items-center gap-2">
          {isProcessing ? (
            <div className="flex items-center gap-1.5 rounded-full border border-neutral-300 dark:border-neutral-700 bg-neutral-200 dark:bg-neutral-900 px-2.5 py-0.5 text-[10px] text-neutral-700 dark:text-neutral-300">
              <span className="h-2 w-2 rounded-full bg-black dark:bg-white animate-ping" />
              <span>Processing...</span>
            </div>
          ) : logs.length > 0 ? (
            <div className="flex items-center gap-1.5 rounded-full border border-emerald-300 dark:border-emerald-900/60 bg-emerald-100 dark:bg-emerald-950/40 px-2.5 py-0.5 text-[10px] text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="h-3 w-3" />
              <span>Pipeline Complete</span>
            </div>
          ) : (
            <span className="text-[10px] text-neutral-500 dark:text-neutral-400">IDLE</span>
          )}
        </div>
      </div>

      {/* Telemetry Metrics Bar */}
      {(executionTimeMs || dimensions || originalSize) && (
        <div className="mb-3 grid grid-cols-2 gap-2 rounded-lg border border-neutral-200 dark:border-neutral-850 bg-neutral-100 dark:bg-neutral-900/60 p-2.5 text-[11px] text-neutral-600 dark:text-neutral-400 sm:grid-cols-4">
          <div className="flex flex-col">
            <span className="text-[10px] text-neutral-500 dark:text-neutral-400 uppercase">Execution</span>
            <span className="font-semibold text-black dark:text-white">{executionTimeMs ? `${executionTimeMs}ms` : '0ms'}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] text-neutral-500 dark:text-neutral-400 uppercase">Dimensions</span>
            <span className="font-semibold text-black dark:text-white">
              {dimensions ? `${dimensions.width}x${dimensions.height}px` : 'N/A'}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] text-neutral-500 dark:text-neutral-400 uppercase">Original Size</span>
            <span className="font-semibold text-black dark:text-white">
              {originalSize ? `${(originalSize / 1024).toFixed(1)} KB` : 'N/A'}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] text-neutral-500 dark:text-neutral-400 uppercase">Processed Size</span>
            <span className="font-semibold text-black dark:text-white">
              {processedSize ? `${(processedSize / 1024).toFixed(1)} KB` : 'N/A'}
            </span>
          </div>
        </div>
      )}

      {/* Scrollable Terminal Output */}
      <div className="h-44 w-full overflow-y-auto rounded-lg border border-neutral-300 dark:border-neutral-900 bg-neutral-900 dark:bg-black p-3 font-mono text-[11px] leading-relaxed text-neutral-200 dark:text-neutral-300">
        {logs.length === 0 ? (
          <div className="flex h-full items-center justify-center text-neutral-400">
            <span>Awaiting image upload to initialize local processing pipeline...</span>
          </div>
        ) : (
          logs.map((log, index) => {
            let textColor = 'text-neutral-300';
            if (log.includes('[SUCCESS]')) textColor = 'text-emerald-400 font-semibold';
            if (log.includes('[PROCESS]')) textColor = 'text-white';
            if (log.includes('[TELEMETRY]')) textColor = 'text-neutral-400';
            if (log.includes('[INPAINT]')) textColor = 'text-sky-400';

            return (
              <div key={index} className={`flex items-start gap-2 ${textColor}`}>
                <span className="select-none text-neutral-400">&gt;</span>
                <span>{log}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
