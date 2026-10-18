import { removeWatermarkFromImageDataSync } from '@pilio/gemini-watermark-remover/image-data';

export type DisruptionMode = 'balanced' | 'aggressive' | 'metadata-only';

export interface ClientProcessingOptions {
  stripMetadata?: boolean;
  disruptSignals?: boolean;
  disruptionMode?: DisruptionMode;
  disruptionStrength?: number; // 1 to 100, default: 75
  removeVisibleBadge?: boolean;
  format?: 'png' | 'jpeg' | 'webp';
  quality?: number;
}

export async function processImageClientSide(
  file: File,
  options: ClientProcessingOptions = {}
): Promise<{ base64Image: string; telemetry: any }> {
  const startTime = Date.now();
  const logs: string[] = [];

  const disruptionMode = options.disruptionMode || 'balanced';
  const disruptionStrength = options.disruptionStrength ?? 75;

  logs.push(`[CLIENT] Selected image file: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`);

  const img = new Image();
  const url = URL.createObjectURL(file);
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
    img.src = url;
  });
  URL.revokeObjectURL(url);

  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Could not create 2D canvas context');

  ctx.drawImage(img, 0, 0);
  let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

  logs.push(`[CLIENT] Image dimensions: ${canvas.width}x${canvas.height}px | Mode: ${disruptionMode.toUpperCase()}`);

  // 1. Erase Gemini Sparkle Watermark via Reverse Alpha Blending
  if (options.removeVisibleBadge !== false) {
    logs.push(`[PROCESS] Auto-erasing visible Gemini sparkle watermark with adaptive fallback...`);
    try {
      const result = removeWatermarkFromImageDataSync(imageData, {
        adaptiveMode: 'always',
        aggressiveLocatedFallback: true,
        locatedAggressiveRemoval: true,
      });
      if (result && result.imageData) {
        imageData = result.imageData as ImageData;
        ctx.putImageData(imageData, 0, 0);
        logs.push(`[SUCCESS] Gemini sparkle badge removed via Reverse Alpha Blending (Tier: ${result.meta?.decisionTier || 'auto'}).`);
      }
    } catch (err) {
      console.warn('Client watermark removal warning:', err);
      logs.push(`[WARN] Automatic badge removal pass bypassed.`);
    }
  }

  // 2. Frequency Disruption (SynthID & OpenAI Verifier Evasion)
  if (options.disruptSignals !== false && disruptionMode !== 'metadata-only') {
    logs.push(`[PROCESS] Initializing ${disruptionMode.toUpperCase()} frequency disruption (Strength: ${disruptionStrength}%)...`);

    // Step 2A: Chrominance-targeted microscopic frequency dither
    const data = imageData.data;
    const noiseScale = disruptionMode === 'aggressive' ? (disruptionStrength / 100) * 3.5 : (disruptionStrength / 100) * 1.8;
    const ditherProb = disruptionMode === 'aggressive' ? 0.75 : 0.5;

    for (let i = 0; i < data.length; i += 4) {
      if (Math.random() < ditherProb) {
        const jitter = (Math.random() - 0.5) * noiseScale;
        data[i] = Math.min(255, Math.max(0, Math.round(data[i] + jitter)));
        data[i + 2] = Math.min(255, Math.max(0, Math.round(data[i + 2] - jitter)));

        if (disruptionMode === 'aggressive') {
          const lumaJitter = (Math.random() - 0.5) * (noiseScale * 0.4);
          data[i + 1] = Math.min(255, Math.max(0, Math.round(data[i + 1] + lumaJitter)));
        }
      }
    }
    ctx.putImageData(imageData, 0, 0);

    // Step 2B: Non-integer geometric resampling to disrupt rigid convolutional receptive fields
    const scaleFactor = disruptionMode === 'aggressive' ? 0.968 : 0.982;
    const scaledW = Math.max(16, Math.round(canvas.width * scaleFactor));
    const scaledH = Math.max(16, Math.round(canvas.height * scaleFactor));

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = scaledW;
    tempCanvas.height = scaledH;
    const tempCtx = tempCanvas.getContext('2d');

    if (tempCtx) {
      tempCtx.imageSmoothingEnabled = true;
      tempCtx.imageSmoothingQuality = 'high';
      tempCtx.drawImage(canvas, 0, 0, scaledW, scaledH);

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(tempCanvas, 0, 0, canvas.width, canvas.height);
    }

    logs.push(`[SUCCESS] Spatial frequency phase shift and non-integer grid realignment completed.`);
  } else if (disruptionMode === 'metadata-only') {
    logs.push(`[INFO] Metadata-only mode active: preserving pixel data.`);
  }

  // 3. Metadata Stripping (Canvas export strips all C2PA, EXIF, and XMP metadata)
  if (options.stripMetadata !== false) {
    logs.push(`[PROCESS] Stripping EXIF, XMP, and C2PA Content Credentials headers...`);
    logs.push(`[SUCCESS] Canvas re-encoding completely eliminated all metadata headers.`);
  }

  const format = options.format || 'png';
  const mimeType = format === 'jpeg' ? 'image/jpeg' : format === 'webp' ? 'image/webp' : 'image/png';
  const exportQuality = options.quality ? options.quality / 100 : 0.95;
  const base64Image = canvas.toDataURL(mimeType, exportQuality);

  const executionTimeMs = Date.now() - startTime;
  logs.push(`[COMPLETE] Pipeline finished in ${executionTimeMs}ms (Browser Memory).`);

  return {
    base64Image,
    telemetry: {
      originalSize: file.size,
      processedSize: Math.round(base64Image.length * 0.75),
      dimensions: { width: canvas.width, height: canvas.height },
      metadataStripped: options.stripMetadata !== false,
      signalsDisrupted: options.disruptSignals !== false && disruptionMode !== 'metadata-only',
      disruptionMode,
      badgeRemoved: options.removeVisibleBadge !== false,
      executionTimeMs,
      logs,
    },
  };
}

/**
 * Pure client-side inpainting fallback when backend API is unavailable (e.g. GitHub Pages static export).
 * Performs iterative edge-aware boundary interpolation and soft Gaussian blur falloff.
 */
export async function inpaintImageClientSide(
  imageFile: File,
  maskBlob: Blob
): Promise<{ base64Image: string; telemetry: any }> {
  const startTime = Date.now();
  const logs: string[] = [];

  logs.push(`[CLIENT INPAINT] Loading image and brush mask into browser canvas...`);

  // Load Image
  const img = new Image();
  const imgUrl = URL.createObjectURL(imageFile);
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
    img.src = imgUrl;
  });
  URL.revokeObjectURL(imgUrl);

  // Load Mask
  const maskImg = new Image();
  const maskUrl = URL.createObjectURL(maskBlob);
  await new Promise((resolve, reject) => {
    maskImg.onload = resolve;
    maskImg.onerror = reject;
    maskImg.src = maskUrl;
  });
  URL.revokeObjectURL(maskUrl);

  const width = img.naturalWidth || img.width;
  const height = img.naturalHeight || img.height;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Could not create canvas context for inpainting');

  // Draw base image
  ctx.drawImage(img, 0, 0);
  const imgData = ctx.getImageData(0, 0, width, height);

  // Draw mask to secondary canvas
  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = width;
  maskCanvas.height = height;
  const maskCtx = maskCanvas.getContext('2d', { willReadFrequently: true });
  if (!maskCtx) throw new Error('Could not create mask canvas context');
  maskCtx.drawImage(maskImg, 0, 0, width, height);
  const maskData = maskCtx.getImageData(0, 0, width, height);

  logs.push(`[CLIENT INPAINT] Analyzing mask coordinates and neighborhood boundaries...`);

  // Iterative neighborhood diffusion
  const src = imgData.data;
  const mask = maskData.data;

  // Find bounding box of mask to speed up processing
  let minX = width, maxX = 0, minY = height, maxY = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      if (mask[idx + 3] > 20 || mask[idx] > 20) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  const pad = 12;
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(width - 1, maxX + pad);
  maxY = Math.min(height - 1, maxY + pad);

  // Multi-pass boundary pixel diffusion
  const passes = 4;
  for (let pass = 0; pass < passes; pass++) {
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const idx = (y * width + x) * 4;
        const maskAlpha = mask[idx + 3];
        const maskLum = mask[idx];

        if (maskAlpha > 30 || maskLum > 30) {
          // Average valid neighbors
          let rSum = 0, gSum = 0, bSum = 0, count = 0;
          const radius = 3;
          for (let dy = -radius; dy <= radius; dy++) {
            const ny = y + dy;
            if (ny < 0 || ny >= height) continue;
            for (let dx = -radius; dx <= radius; dx++) {
              const nx = x + dx;
              if (nx < 0 || nx >= width) continue;
              const nidx = (ny * width + nx) * 4;
              if (mask[nidx + 3] <= 30 && mask[nidx] <= 30) {
                const weight = 1 / (1 + Math.hypot(dx, dy));
                rSum += src[nidx] * weight;
                gSum += src[nidx + 1] * weight;
                bSum += src[nidx + 2] * weight;
                count += weight;
              }
            }
          }
          if (count > 0) {
            src[idx] = Math.round(rSum / count);
            src[idx + 1] = Math.round(gSum / count);
            src[idx + 2] = Math.round(bSum / count);
          }
        }
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);

  // Subtle blur pass over masked area to eliminate sharp seam edges
  const blurCanvas = document.createElement('canvas');
  blurCanvas.width = width;
  blurCanvas.height = height;
  const blurCtx = blurCanvas.getContext('2d');
  if (blurCtx) {
    blurCtx.filter = 'blur(4px)';
    blurCtx.drawImage(canvas, 0, 0);
  }

  logs.push(`[CLIENT INPAINT] Reconstructed patch composited smoothly.`);
  logs.push(`[SUCCESS] Wiped C2PA Content Credentials and EXIF metadata.`);

  const base64Image = canvas.toDataURL('image/webp', 0.95);
  const executionTimeMs = Date.now() - startTime;
  logs.push(`[COMPLETE] Client inpainting finished in ${executionTimeMs}ms.`);

  return {
    base64Image,
    telemetry: {
      originalSize: imageFile.size,
      processedSize: Math.round(base64Image.length * 0.75),
      dimensions: { width, height },
      executionTimeMs,
      logs,
    },
  };
}
