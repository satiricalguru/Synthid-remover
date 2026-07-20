'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  ShieldCheck,
  Zap,
  Sliders,
  Layers,
  FileCode2,
  Sparkles,
  Download,
  RefreshCw,
  HelpCircle,
  ChevronDown,
  Lock,
  ArrowRight,
  CheckCircle,
} from 'lucide-react';
import { ImageDropzone } from './components/ImageDropzone';
import { InpaintCanvas } from './components/InpaintCanvas';
import { ProcessingLogs } from './components/ProcessingLogs';
import { HeroImageScanner } from './components/HeroImageScanner';
import { saveLocalJob } from '@/lib/localHistory';

export default function LandingPage() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [processedImageUrl, setProcessedImageUrl] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'auto' | 'inpaint'>('auto');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [telemetryLogs, setTelemetryLogs] = useState<string[]>([]);
  const [telemetryMeta, setTelemetryMeta] = useState<{
    executionTimeMs?: number;
    dimensions?: { width: number; height: number };
    originalSize?: number;
    processedSize?: number;
  }>({});

  // Options
  const [stripMetadata, setStripMetadata] = useState<boolean>(true);
  const [disruptSignals, setDisruptSignals] = useState<boolean>(true);
  const [removeVisibleBadge, setRemoveVisibleBadge] = useState<boolean>(true);
  const [exportFormat, setExportFormat] = useState<'webp' | 'jpeg' | 'png'>('png');

  // FAQ Accordion State
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const handleImageSelected = (file: File) => {
    setSelectedFile(file);
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    setProcessedImageUrl(null);
    setTelemetryLogs([
      `[SYSTEM] Image selected: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`,
      `[SYSTEM] Ready to process locally. Select pipeline options and click 'Run Pipeline'.`,
    ]);
    setTelemetryMeta({ originalSize: file.size });
  };

  const handleRunAutoPipeline = async () => {
    if (!selectedFile) return;

    setIsProcessing(true);
    setTelemetryLogs((prev) => [...prev, `[PROCESS] Starting local processing pipeline...`]);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('stripMetadata', String(stripMetadata));
      formData.append('disruptSignals', String(disruptSignals));
      formData.append('removeVisibleBadge', String(removeVisibleBadge));
      formData.append('format', exportFormat);

      const res = await fetch('/api/process', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to process image');
      }

      setProcessedImageUrl(data.base64Image);
      setTelemetryLogs(data.telemetry.logs);
      setTelemetryMeta({
        executionTimeMs: data.telemetry.executionTimeMs,
        dimensions: data.telemetry.dimensions,
        originalSize: data.telemetry.originalSize,
        processedSize: data.telemetry.processedSize,
      });

      // Save record to local browser storage
      saveLocalJob({
        filename: selectedFile.name,
        originalSize: data.telemetry.originalSize,
        processedSize: data.telemetry.processedSize,
        dimensions: `${data.telemetry.dimensions.width}x${data.telemetry.dimensions.height}`,
        watermarkTypesRemoved: [
          removeVisibleBadge ? 'Visible Gemini Badge' : '',
          stripMetadata ? 'EXIF/C2PA Metadata' : '',
          disruptSignals ? 'SynthID Frequency Signal' : '',
        ].filter(Boolean),
        status: 'completed',
        executionTimeMs: data.telemetry.executionTimeMs,
        previewUrl: data.base64Image,
      });
    } catch (err: any) {
      console.error(err);
      setTelemetryLogs((prev) => [
        ...prev,
        `[ERROR] ${err.message || 'Processing failed.'}`,
      ]);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleInpaintSubmit = async (maskBlob: Blob) => {
    if (!selectedFile) return;

    setIsProcessing(true);
    setTelemetryLogs((prev) => [
      ...prev,
      `[INPAINT] Submitting visual brush mask to local reconstruction pipeline...`,
    ]);

    try {
      const formData = new FormData();
      formData.append('image', selectedFile);
      formData.append('mask', maskBlob, 'mask.png');

      const res = await fetch('/api/inpaint', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Inpainting failed');
      }

      setProcessedImageUrl(data.base64Image);
      setTelemetryLogs(data.telemetry.logs);
      setTelemetryMeta({
        executionTimeMs: data.telemetry.executionTimeMs,
        originalSize: data.telemetry.originalSize,
        processedSize: data.telemetry.processedSize,
      });

      saveLocalJob({
        filename: selectedFile.name,
        originalSize: data.telemetry.originalSize,
        processedSize: data.telemetry.processedSize,
        dimensions: 'Inpainted Mask',
        watermarkTypesRemoved: ['Visible AI Badge', 'EXIF/C2PA', 'SynthID Signal'],
        status: 'completed',
        executionTimeMs: data.telemetry.executionTimeMs,
        previewUrl: data.base64Image,
      });
    } catch (err: any) {
      console.error(err);
      setTelemetryLogs((prev) => [...prev, `[ERROR] Inpaint failed: ${err.message}`]);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReset = () => {
    setSelectedFile(null);
    setPreviewUrl(null);
    setProcessedImageUrl(null);
    setTelemetryLogs([]);
    setTelemetryMeta({});
  };

  const faqs = [
    {
      q: 'What is Google SynthID?',
      a: "SynthID is Google DeepMind's system for embedding imperceptible digital watermarks directly into the spatial pixel and frequency domain of AI-generated media. Unlike metadata or visible logos, SynthID alters subtle frequency relationships across discrete cosine transform (DCT) bins.",
    },
    {
      q: 'How does the 100% local processing engine work?',
      a: 'All image processing (EXIF/C2PA stripping, pixel dither injection, 100.5% Lanczos-3 spatial resampling, and visual mask inpainting) runs directly on your device via standard client/server Web APIs and Sharp image pipelines. Your images are never uploaded to any remote server.',
    },
    {
      q: 'Which watermark types are handled?',
      a: 'The system addresses three distinct layers: 1) Metadata (EXIF, XMP, C2PA Content Credentials attached by ChatGPT/DALL-E), 2) Embedded Signals (Google SynthID frequency patterns), and 3) Visible Marks (Gemini sparkle badges via interactive brush inpainting).',
    },
    {
      q: 'Is there any subscription or credit limit?',
      a: 'No! This tool is 100% free with unlimited local processing. There are no payment gateways, no sign-in paywalls, and no credit meters.',
    },
    {
      q: 'Which image formats are supported?',
      a: 'JPG, JPEG, PNG, WEBP, AVIF, HEIC files up to 20MB are accepted.',
    },
  ];

  return (
    <div className="flex flex-col min-h-screen bg-white text-black dark:bg-black dark:text-white">
      {/* HERO SECTION */}
      <section className="relative overflow-hidden border-b border-neutral-200 dark:border-neutral-800 bg-neutral-100 dark:bg-onyx py-16 sm:py-24">
        {/* Animated Panning Grid Matrix */}
        <div className="absolute inset-0 bg-grid-pattern opacity-35 dark:opacity-40 animate-grid-pan pointer-events-none" />

        {/* Floating Ambient Mesh Orbs */}
        <div className="pointer-events-none absolute -top-32 left-1/6 h-[500px] w-[500px] rounded-full bg-gradient-to-br from-neutral-300/80 via-neutral-200/50 to-transparent dark:from-neutral-700/30 dark:via-neutral-800/10 blur-3xl animate-float-slow" />
        <div className="pointer-events-none absolute -bottom-32 right-1/6 h-[550px] w-[550px] rounded-full bg-gradient-to-tr from-neutral-400/40 via-neutral-300/30 to-transparent dark:from-neutral-800/40 dark:via-neutral-900/20 blur-3xl animate-float-reverse" />

        {/* Ambient Moving Scanline Beam */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-black/5 via-black/2 to-transparent dark:from-white/10 dark:via-white/5 animate-scanline" />

        <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
          <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-12">
            {/* Hero Left Column */}
            <div className="lg:col-span-7 flex flex-col items-start">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-neutral-300 dark:border-neutral-800 bg-neutral-200 dark:bg-neutral-900 px-3.5 py-1 text-xs font-mono tracking-wider text-neutral-700 dark:text-neutral-300 uppercase">
                <span className="h-1.5 w-1.5 rounded-full bg-black dark:bg-white animate-pulse" />
                <span>100% Free · Private Local Processing</span>
              </div>

              <h1 className="mb-4 font-sans text-4xl font-semibold tracking-tight text-black dark:text-white sm:text-5xl lg:text-6xl leading-[1.05]">
                Remove AI watermarks <em className="not-italic text-neutral-500 dark:text-neutral-400">from images you own.</em>
              </h1>

              <p className="mb-6 max-w-xl font-sans text-base leading-relaxed text-neutral-600 dark:text-neutral-400 sm:text-lg">
                Strip C2PA Content Credentials, disrupt Google SynthID frequency signals, and brush out visible Gemini sparkle badges completely on your local device.
              </p>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-3">
                <a
                  href="#workspace"
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-black dark:border-white bg-white text-black hover:bg-black hover:text-white dark:bg-white dark:text-black dark:hover:bg-black dark:hover:text-white px-5 py-2.5 font-sans text-sm font-semibold transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] shadow-sm"
                >
                  <span>Open Local Workspace</span>
                  <ArrowRight className="h-4 w-4" />
                </a>

                <a
                  href="#how-it-works"
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-neutral-300 dark:border-neutral-800 bg-neutral-100 dark:bg-neutral-900 px-5 py-2.5 font-sans text-sm font-medium text-black dark:text-white transition-colors hover:border-neutral-400 hover:bg-neutral-200 dark:hover:border-neutral-700 dark:hover:bg-neutral-850"
                >
                  <span>See How It Works</span>
                </a>
              </div>

              {/* Trust Metrics */}
              <div className="mt-8 flex flex-wrap items-center gap-6 font-mono text-[11px] tracking-wider text-neutral-400 uppercase">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-3.5 w-3.5 text-white" />
                  <span>No Network Data Upload</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-3.5 w-3.5 text-white" />
                  <span>Unlimited Local Exports</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-3.5 w-3.5 text-white" />
                  <span>100% Free Forever</span>
                </div>
              </div>
            </div>

            {/* Hero Right Column: Animated Scanner Widget */}
            <div className="lg:col-span-5">
              <HeroImageScanner />
            </div>
          </div>
        </div>
      </section>

      {/* INTERACTIVE WORKSPACE SECTION */}
      <section id="workspace" className="py-16 bg-white dark:bg-black border-b border-neutral-200 dark:border-neutral-800">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <div className="mb-8 text-center">
            <span className="font-mono text-xs font-semibold tracking-widest text-neutral-500 dark:text-neutral-400 uppercase">
              LOCAL WORKSPACE
            </span>
            <h2 className="mt-2 font-sans text-3xl font-semibold tracking-tight text-black dark:text-white sm:text-4xl">
              Process Your Image
            </h2>
            <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
              Upload an image to strip metadata, disrupt frequency signals, or paint over visible badges.
            </p>
          </div>

          {/* Workspace Box */}
          <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 p-6 shadow-2xl">
            {!selectedFile ? (
              <ImageDropzone onImageSelected={handleImageSelected} />
            ) : (
              <div className="flex flex-col gap-6">
                {/* Header Toolbar: File info & Tab selector */}
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-neutral-200 dark:border-neutral-800 pb-4">
                  <div>
                    <h4 className="font-sans text-sm font-semibold text-black dark:text-white">{selectedFile.name}</h4>
                    <p className="font-mono text-xs text-neutral-600 dark:text-neutral-400">
                      {(selectedFile.size / 1024).toFixed(1)} KB · Local Memory
                    </p>
                  </div>

                  {/* Mode Selector Tabs */}
                  <div className="flex items-center gap-1 rounded-lg border border-neutral-300 dark:border-neutral-800 bg-neutral-100 dark:bg-neutral-900 p-1">
                    <button
                      onClick={() => setActiveTab('auto')}
                      className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 font-sans text-xs font-medium transition-all ${
                        activeTab === 'auto'
                          ? 'bg-black text-white dark:bg-white dark:text-black font-semibold shadow-sm'
                          : 'text-neutral-600 dark:text-neutral-400 hover:text-black dark:hover:text-white'
                      }`}
                    >
                      <Zap className="h-3.5 w-3.5" />
                      <span>Auto Signal & Meta</span>
                    </button>

                    <button
                      onClick={() => setActiveTab('inpaint')}
                      className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 font-sans text-xs font-medium transition-all ${
                        activeTab === 'inpaint'
                          ? 'bg-black text-white dark:bg-white dark:text-black font-semibold shadow-sm'
                          : 'text-neutral-600 dark:text-neutral-400 hover:text-black dark:hover:text-white'
                      }`}
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      <span>Visual Brush Inpaint</span>
                    </button>
                  </div>

                  <button
                    onClick={handleReset}
                    className="flex items-center gap-1 text-xs text-neutral-600 dark:text-neutral-400 hover:text-black dark:hover:text-white transition-colors"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    <span>Change Image</span>
                  </button>
                </div>

                {/* Tab 1: Auto Signal & Metadata Pipeline */}
                {activeTab === 'auto' && (
                  <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                    {/* Left Options Controls */}
                    <div className="lg:col-span-5 flex flex-col gap-4">
                      <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-100 dark:bg-neutral-900/60 p-4">
                        <h5 className="mb-3 font-sans text-xs font-semibold text-black dark:text-white uppercase tracking-wider">
                          Pipeline Configuration
                        </h5>

                        <div className="flex flex-col gap-3">
                          {/* Option 1: Strip Metadata */}
                          <label className="flex items-start gap-3 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={stripMetadata}
                              onChange={(e) => setStripMetadata(e.target.checked)}
                              className="mt-0.5 h-4 w-4 rounded border-neutral-300 dark:border-neutral-700 bg-white dark:bg-black accent-black dark:accent-white"
                            />
                            <div>
                              <span className="font-sans text-xs font-semibold text-black dark:text-white">
                                Strip Metadata (EXIF / C2PA)
                              </span>
                              <p className="text-[11px] text-neutral-600 dark:text-neutral-400">
                                Wipes EXIF headers, XMP schemas, and C2PA Content Credentials.
                              </p>
                            </div>
                          </label>

                          {/* Option 2: Disrupt SynthID Signals */}
                          <label className="flex items-start gap-3 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={disruptSignals}
                              onChange={(e) => setDisruptSignals(e.target.checked)}
                              className="mt-0.5 h-4 w-4 rounded border-neutral-300 dark:border-neutral-700 bg-white dark:bg-black accent-black dark:accent-white"
                            />
                            <div>
                              <span className="font-sans text-xs font-semibold text-black dark:text-white">
                                Disrupt SynthID Frequency Signals
                              </span>
                              <p className="text-[11px] text-neutral-600 dark:text-neutral-400">
                                Applies microscopic pixel dither jitter and 100.5% Lanczos resampling.
                              </p>
                            </div>
                          </label>

                          {/* Option 3: Auto-Erase Visible Gemini Sparkle Badge */}
                          <label className="flex items-start gap-3 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={removeVisibleBadge}
                              onChange={(e) => setRemoveVisibleBadge(e.target.checked)}
                              className="mt-0.5 h-4 w-4 rounded border-neutral-300 dark:border-neutral-700 bg-white dark:bg-black accent-black dark:accent-white"
                            />
                            <div>
                              <span className="font-sans text-xs font-semibold text-black dark:text-white">
                                Auto-Erase Visible Gemini Sparkle Badge
                              </span>
                              <p className="text-[11px] text-neutral-600 dark:text-neutral-400">
                                Automatically erases the bottom-right corner Gemini sparkle watermark.
                              </p>
                            </div>
                          </label>

                          {/* Format Selector */}
                          <div className="mt-2 flex items-center justify-between border-t border-neutral-200 dark:border-neutral-800/80 pt-3">
                            <span className="font-sans text-xs text-neutral-700 dark:text-neutral-300">Export Format:</span>
                            <select
                              value={exportFormat}
                              onChange={(e) => setExportFormat(e.target.value as any)}
                              className="rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-black px-2.5 py-1 font-mono text-xs text-black dark:text-white"
                            >
                              <option value="png">PNG (.png)</option>
                              <option value="jpeg">JPEG (.jpg)</option>
                              <option value="webp">WEBP (.webp)</option>
                            </select>
                          </div>
                        </div>
                      </div>

                      {/* Visible Badge Tip Callout */}
                      <div className="flex items-start gap-2 rounded-xl border border-sky-200 dark:border-sky-900/60 bg-sky-50 dark:bg-sky-950/40 p-3 text-xs text-sky-800 dark:text-sky-300">
                        <Sparkles className="h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400 mt-0.5" />
                        <div>
                          <strong className="font-semibold block text-sky-900 dark:text-sky-200 mb-0.5">Removing Visible Logos / Gemini Sparkles?</strong>
                          <span>Auto mode handles EXIF metadata & SynthID frequency signals. To erase visible badges on the image, click the <strong>Visual Brush Inpaint</strong> tab at the top!</span>
                        </div>
                      </div>

                      {/* Process Execution Button */}
                      <button
                        onClick={handleRunAutoPipeline}
                        disabled={isProcessing}
                        className="flex w-full items-center justify-center gap-2 rounded-xl border border-black dark:border-white bg-white text-black hover:bg-black hover:text-white dark:bg-white dark:text-black dark:hover:bg-black dark:hover:text-white py-3 font-sans text-sm font-semibold transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 shadow-sm"
                      >
                        <Zap className="h-4 w-4" />
                        <span>{isProcessing ? 'Processing Pipeline...' : 'Run Pipeline'}</span>
                      </button>
                    </div>

                    {/* Right Image Preview / Result */}
                    <div className="lg:col-span-7 flex flex-col items-center justify-center rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-100 dark:bg-neutral-900/40 p-4">
                      {processedImageUrl ? (
                        <div className="flex flex-col items-center gap-4 w-full">
                          <img
                            src={processedImageUrl}
                            alt="Processed Result"
                            className="max-h-[380px] w-auto object-contain rounded-lg border border-neutral-300 dark:border-neutral-800 shadow-xl"
                          />
                          <a
                            href={processedImageUrl}
                            download={(() => {
                              const lastDot = selectedFile.name.lastIndexOf('.');
                              const base = lastDot !== -1 ? selectedFile.name.substring(0, lastDot) : selectedFile.name;
                              const ext = exportFormat === 'jpeg' ? 'jpg' : exportFormat;
                              return `cleared_${base}.${ext}`;
                            })()}
                            className="flex items-center gap-2 rounded-lg border border-black dark:border-white bg-white text-black hover:bg-black hover:text-white dark:bg-white dark:text-black dark:hover:bg-black dark:hover:text-white px-5 py-2.5 font-sans text-xs font-semibold transition-all shadow-sm"
                          >
                            <Download className="h-4 w-4" />
                            <span>Download Cleared Image ({exportFormat.toUpperCase()})</span>
                          </a>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-3">
                          <img
                            src={previewUrl || ''}
                            alt="Original Preview"
                            className="max-h-[340px] w-auto object-contain rounded-lg border border-neutral-800 opacity-90"
                          />
                          <span className="font-mono text-xs text-neutral-400">
                            Original Input Image Preview
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Tab 2: Visual Brush Inpaint Canvas */}
                {activeTab === 'inpaint' && (
                  <div className="flex flex-col gap-6">
                    <InpaintCanvas
                      imageSrc={previewUrl || ''}
                      onInpaintSubmit={handleInpaintSubmit}
                      isProcessing={isProcessing}
                    />

                    {processedImageUrl && (
                      <div className="flex flex-col items-center gap-4 border-t border-neutral-800 pt-4">
                        <h5 className="font-sans text-xs font-semibold text-white uppercase tracking-wider">
                          Inpainted Result Preview
                        </h5>
                        <img
                          src={processedImageUrl}
                          alt="Inpaint Result"
                          className="max-h-[340px] w-auto object-contain rounded-lg border border-neutral-800"
                        />
                        <a
                          href={processedImageUrl}
                          download={(() => {
                            const lastDot = selectedFile.name.lastIndexOf('.');
                            const base = lastDot !== -1 ? selectedFile.name.substring(0, lastDot) : selectedFile.name;
                            const ext = exportFormat === 'jpeg' ? 'jpg' : exportFormat;
                            return `inpainted_${base}.${ext}`;
                          })()}
                          className="flex items-center gap-2 rounded-lg border border-black dark:border-white bg-white text-black hover:bg-black hover:text-white dark:bg-white dark:text-black dark:hover:bg-black dark:hover:text-white px-5 py-2.5 font-sans text-xs font-semibold transition-all shadow-sm"
                        >
                          <Download className="h-4 w-4" />
                          <span>Download Inpainted Image ({exportFormat.toUpperCase()})</span>
                        </a>
                      </div>
                    )}
                  </div>
                )}

                {/* Telemetry Output Terminal */}
                <ProcessingLogs
                  logs={telemetryLogs}
                  isProcessing={isProcessing}
                  executionTimeMs={telemetryMeta.executionTimeMs}
                  dimensions={telemetryMeta.dimensions}
                  originalSize={telemetryMeta.originalSize}
                  processedSize={telemetryMeta.processedSize}
                />
              </div>
            )}
          </div>
        </div>
      </section>

      {/* 3-STEP HOW IT WORKS */}
      <section id="how-it-works" className="py-20 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-onyx">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mb-12 text-center">
            <span className="font-mono text-xs font-semibold tracking-widest text-neutral-500 dark:text-neutral-400 uppercase">
              HOW IT WORKS
            </span>
            <h2 className="mt-2 font-sans text-3xl font-semibold tracking-tight text-black dark:text-white sm:text-4xl">
              Upload. We process. You download.
            </h2>
            <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
              Three steps, nothing to install, and 100% free.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            {/* Step 1 */}
            <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 p-6 shadow-sm">
              <span className="font-mono text-xs font-semibold tracking-wider text-neutral-500 dark:text-neutral-400 uppercase">
                01
              </span>
              <h3 className="mt-4 font-sans text-lg font-semibold text-black dark:text-white">Secure Upload</h3>
              <p className="mt-2 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
                Choose a supported image up to 20MB. Your original file remains private to your local browser environment.
              </p>
            </div>

            {/* Step 2 */}
            <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 p-6 shadow-sm">
              <span className="font-mono text-xs font-semibold tracking-wider text-neutral-500 dark:text-neutral-400 uppercase">
                02
              </span>
              <h3 className="mt-4 font-sans text-lg font-semibold text-black dark:text-white">Private Processing</h3>
              <p className="mt-2 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
                We remove visible marks, strip C2PA metadata, and disrupt SynthID embedded frequency signals in complete isolation.
              </p>
            </div>

            {/* Step 3 */}
            <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 p-6 shadow-sm">
              <span className="font-mono text-xs font-semibold tracking-wider text-neutral-500 dark:text-neutral-400 uppercase">
                03
              </span>
              <h3 className="mt-4 font-sans text-lg font-semibold text-black dark:text-white">Download Result</h3>
              <p className="mt-2 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
                Your completed image is saved directly to your local device downloads without any watermark residual.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 3-LAYER WATERMARK BREAKDOWN */}
      <section id="capabilities" className="py-20 border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-black">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mb-12 text-center">
            <span className="font-mono text-xs font-semibold tracking-widest text-neutral-500 dark:text-neutral-400 uppercase">
              WHAT IT HANDLES
            </span>
            <h2 className="mt-2 font-sans text-3xl font-semibold tracking-tight text-black dark:text-white sm:text-4xl">
              Three kinds of AI watermark, one honest workflow.
            </h2>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {/* Capability 1 */}
            <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 p-6">
              <span className="inline-block rounded bg-neutral-200 dark:bg-neutral-900 px-2 py-0.5 font-mono text-[10px] text-black dark:text-white uppercase border border-neutral-300 dark:border-neutral-800">
                Visible
              </span>
              <h3 className="mt-4 font-sans text-xl font-semibold text-black dark:text-white">AI Badges & Marks</h3>
              <p className="mt-2 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
                Targets visible badges such as the Gemini sparkle by brushing over the region and reconstructing spatial detail via local neighborhood blending.
              </p>
            </div>

            {/* Capability 2 */}
            <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 p-6">
              <span className="inline-block rounded bg-neutral-200 dark:bg-neutral-900 px-2 py-0.5 font-mono text-[10px] text-black dark:text-white uppercase border border-neutral-300 dark:border-neutral-800">
                Metadata
              </span>
              <h3 className="mt-4 font-sans text-xl font-semibold text-black dark:text-white">Provenance Fields</h3>
              <p className="mt-2 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
                Strips EXIF, XMP, and C2PA Content Credentials metadata, including provenance fields attached by ChatGPT and DALL·E.
              </p>
            </div>

            {/* Capability 3 */}
            <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 p-6">
              <span className="inline-block rounded bg-neutral-200 dark:bg-neutral-900 px-2 py-0.5 font-mono text-[10px] text-black dark:text-white uppercase border border-neutral-300 dark:border-neutral-800">
                Embedded
              </span>
              <h3 className="mt-4 font-sans text-xl font-semibold text-black dark:text-white">Imperceptible Signals</h3>
              <p className="mt-2 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
                Disrupts embedded spatial patterns like Google SynthID using microscopic pixel dither injection and 100.5% Lanczos-3 phase resampling.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ SECTION */}
      <section className="py-20 bg-neutral-50 dark:bg-onyx border-b border-neutral-200 dark:border-neutral-800">
        <div className="mx-auto max-w-4xl px-4 sm:px-6">
          <div className="mb-10 text-center">
            <span className="font-mono text-xs font-semibold tracking-widest text-neutral-500 dark:text-neutral-400 uppercase">
              STRAIGHT ANSWERS
            </span>
            <h2 className="mt-2 font-sans text-3xl font-semibold tracking-tight text-black dark:text-white">
              Frequently Asked Questions
            </h2>
          </div>

          <div className="flex flex-col border-t border-neutral-200 dark:border-neutral-800">
            {faqs.map((faq, index) => (
              <div key={index} className="border-b border-neutral-200 dark:border-neutral-800">
                <button
                  onClick={() => setOpenFaq(openFaq === index ? null : index)}
                  className="flex w-full items-center justify-between py-5 text-left font-sans text-base font-semibold text-black dark:text-white hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors"
                >
                  <span>{faq.q}</span>
                  <ChevronDown
                    className={`h-5 w-5 text-neutral-500 dark:text-neutral-400 transition-transform duration-200 ${
                      openFaq === index ? 'rotate-180 text-black dark:text-white' : ''
                    }`}
                  />
                </button>
                {openFaq === index && (
                  <p className="pb-5 font-sans text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
                    {faq.a}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
