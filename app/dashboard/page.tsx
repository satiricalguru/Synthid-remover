'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  History,
  Trash2,
  Download,
  ShieldCheck,
  Zap,
  ArrowLeft,
  HardDrive,
  Clock,
  CheckCircle2,
} from 'lucide-react';
import { getLocalHistory, clearLocalHistory, LocalJobRecord } from '@/lib/localHistory';

export default function DashboardPage() {
  const [history, setHistory] = useState<LocalJobRecord[]>([]);

  useEffect(() => {
    setHistory(getLocalHistory());
  }, []);

  const handleClearHistory = () => {
    if (confirm('Are you sure you want to clear your local processing history?')) {
      clearLocalHistory();
      setHistory([]);
    }
  };

  const totalProcessed = history.length;
  const totalSavedBytes = history.reduce((acc, job) => acc + Math.max(0, job.originalSize - job.processedSize), 0);

  return (
    <div className="min-h-screen bg-white text-black dark:bg-black dark:text-white py-12">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        {/* Back Link */}
        <Link
          href="/"
          className="mb-6 inline-flex items-center gap-2 font-mono text-xs text-neutral-600 dark:text-neutral-400 hover:text-black dark:hover:text-white transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back to Workspace</span>
        </Link>

        {/* Dashboard Title & Engine Header */}
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b border-neutral-800 pb-6">
          <div>
            <div className="mb-1 inline-flex items-center gap-2 rounded bg-neutral-100 dark:bg-neutral-900 px-2 py-0.5 font-mono text-[10px] font-medium text-neutral-600 dark:text-neutral-300 uppercase border border-neutral-200 dark:border-neutral-800">
              <ShieldCheck className="h-3 w-3 text-black dark:text-white" />
              <span>100% Free Local Session</span>
            </div>
            <h1 className="font-sans text-3xl font-semibold tracking-tight text-black dark:text-white sm:text-4xl">
              Local Job History
            </h1>
            <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
              Processing logs and exports saved in your browser storage.
            </p>
          </div>

          {history.length > 0 && (
            <button
              onClick={handleClearHistory}
              className="flex items-center gap-2 rounded-lg border border-black dark:border-white bg-white text-black hover:bg-black hover:text-white dark:bg-white dark:text-black dark:hover:bg-black dark:hover:text-white px-3.5 py-2 font-sans text-xs font-semibold transition-all duration-200 shadow-sm"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Clear History</span>
            </button>
          )}
        </div>

        {/* Stats Metrics Cards */}
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 p-5 shadow-sm">
            <div className="flex items-center justify-between text-neutral-500 dark:text-neutral-400">
              <span className="font-mono text-xs uppercase tracking-wider">Engine Status</span>
              <ShieldCheck className="h-4 w-4 text-black dark:text-white" />
            </div>
            <div className="mt-3 font-sans text-2xl font-semibold text-black dark:text-white">Unlimited Free</div>
            <p className="mt-1 font-mono text-[11px] text-neutral-500 dark:text-neutral-400">Zero network usage</p>
          </div>

          <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 p-5 shadow-sm">
            <div className="flex items-center justify-between text-neutral-500 dark:text-neutral-400">
              <span className="font-mono text-xs uppercase tracking-wider">Total Processed</span>
              <Zap className="h-4 w-4 text-black dark:text-white" />
            </div>
            <div className="mt-3 font-sans text-2xl font-semibold text-black dark:text-white">{totalProcessed} Jobs</div>
            <p className="mt-1 font-mono text-[11px] text-neutral-500 dark:text-neutral-400">Completed locally</p>
          </div>

          <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 p-5 shadow-sm">
            <div className="flex items-center justify-between text-neutral-500 dark:text-neutral-400">
              <span className="font-mono text-xs uppercase tracking-wider">Data Optimization</span>
              <HardDrive className="h-4 w-4 text-black dark:text-white" />
            </div>
            <div className="mt-3 font-sans text-2xl font-semibold text-black dark:text-white">
              {(totalSavedBytes / 1024).toFixed(1)} KB
            </div>
            <p className="mt-1 font-mono text-[11px] text-neutral-500 dark:text-neutral-400">Metadata stripped</p>
          </div>
        </div>

        {/* Job History Table */}
        <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 overflow-hidden shadow-2xl">
          <div className="border-b border-neutral-200 dark:border-neutral-800 px-6 py-4">
            <h3 className="font-sans text-sm font-semibold text-black dark:text-white uppercase tracking-wider">
              Recent Job Telemetry
            </h3>
          </div>

          {history.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 text-center text-neutral-500 dark:text-neutral-400">
              <History className="mb-3 h-8 w-8 text-neutral-400 dark:text-neutral-600" />
              <p className="font-sans text-sm font-medium text-black dark:text-white">No jobs recorded yet</p>
              <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                Process an image in the workspace to see local telemetry logs here.
              </p>
              <Link
                href="/"
                className="mt-4 inline-flex items-center gap-2 rounded-lg border border-black dark:border-white bg-black dark:bg-white px-4 py-2 font-sans text-xs font-semibold text-white dark:text-black hover:bg-neutral-800 dark:hover:bg-neutral-200 transition-colors"
              >
                Go to Workspace
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left font-sans text-xs text-neutral-700 dark:text-neutral-300">
                <thead className="border-b border-neutral-200 dark:border-neutral-800 bg-neutral-100 dark:bg-neutral-900/60 font-mono text-[11px] uppercase text-neutral-600 dark:text-neutral-400">
                  <tr>
                    <th className="px-6 py-3">Timestamp</th>
                    <th className="px-6 py-3">Filename</th>
                    <th className="px-6 py-3">Dimensions</th>
                    <th className="px-6 py-3">Removed Layers</th>
                    <th className="px-6 py-3">Execution</th>
                    <th className="px-6 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200 dark:divide-neutral-900">
                  {history.map((job) => (
                    <tr key={job.id} className="hover:bg-neutral-100 dark:hover:bg-neutral-900/40 transition-colors">
                      <td className="whitespace-nowrap px-6 py-4 font-mono text-[11px] text-neutral-600 dark:text-neutral-400">
                        {new Date(job.timestamp).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 font-medium text-black dark:text-white">
                        {job.filename}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 font-mono text-neutral-600 dark:text-neutral-400">
                        {job.dimensions}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-1">
                          {job.watermarkTypesRemoved.map((type, idx) => (
                            <span
                              key={idx}
                              className="rounded border border-neutral-300 dark:border-neutral-800 bg-neutral-200 dark:bg-neutral-900 px-1.5 py-0.5 font-mono text-[10px] text-neutral-700 dark:text-neutral-300"
                            >
                              {type}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 font-mono text-emerald-600 dark:text-emerald-400">
                        {job.executionTimeMs}ms
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-right">
                        {job.previewUrl && (
                          <a
                            href={job.previewUrl}
                            download={`cleared_${job.filename}`}
                            className="inline-flex items-center gap-1 rounded border border-neutral-300 dark:border-neutral-800 bg-neutral-200 dark:bg-neutral-900 px-2.5 py-1 text-[11px] font-medium text-black dark:text-white hover:bg-neutral-300 dark:hover:border-neutral-600 dark:hover:bg-neutral-800 transition-colors"
                          >
                            <Download className="h-3 w-3" />
                            <span>Download</span>
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
