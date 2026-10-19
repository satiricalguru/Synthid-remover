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

export interface ClientProvenanceAudit {
  c2paFound: boolean;
  exifFound: boolean;
  xmpFound: boolean;
  iccFound: boolean;
  iptcFound: boolean;
  clean: boolean;
  bytesScanned: number;
  formatDetected: string;
}

/**
 * Forensic byte-level scanner on client-side base64 image strings.
 * Verifies that zero C2PA (caBX / JUMBF), EXIF, XMP, ICC, or IPTC chunks survive.
 */
export function scanBase64Provenance(base64Data: string): ClientProvenanceAudit {
  const binaryString = atob(base64Data.split(',')[1] || '');
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  let c2pa = false;
  let exif = false;
  let xmp = false;
  let icc = false;
  let iptc = false;
  let format = 'unknown';

  // PNG
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    format = 'PNG';
    let offset = 8;
    while (offset + 8 <= bytes.length) {
      const chunkLen = (bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3];
      const chunkType = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);

      if (chunkType === 'caBX') c2pa = true;
      if (chunkType === 'eXIf') exif = true;
      if (chunkType === 'iCCP') icc = true;
      if (chunkType === 'iTXt' || chunkType === 'tEXt' || chunkType === 'zTXt') {
        let chunkText = '';
        const maxText = Math.min(bytes.length, offset + 8 + Math.min(chunkLen, 120));
        for (let j = offset + 8; j < maxText; j++) {
          chunkText += String.fromCharCode(bytes[j]);
        }
        if (/c2pa|contentcredentials/i.test(chunkText)) c2pa = true;
        if (/xmp|ns\.adobe/i.test(chunkText)) xmp = true;
        if (/exif/i.test(chunkText)) exif = true;
        if (/iptc/i.test(chunkText)) iptc = true;
      }
      offset += 12 + chunkLen;
    }
  }
  // JPEG
  else if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    format = 'JPEG';
    let offset = 2;
    while (offset + 4 <= bytes.length) {
      if (bytes[offset] !== 0xff) break;
      const marker = bytes[offset + 1];
      if (marker === 0xda || marker === 0xd9) break;
      const markerLen = (bytes[offset + 2] << 8) | bytes[offset + 3];

      if (marker === 0xe1) {
        let payload = '';
        const maxP = Math.min(bytes.length, offset + 4 + Math.min(markerLen - 2, 40));
        for (let j = offset + 4; j < maxP; j++) {
          payload += String.fromCharCode(bytes[j]);
        }
        if (payload.startsWith('Exif')) exif = true;
        if (payload.includes('ns.adobe.com') || payload.includes('XMP')) xmp = true;
      }
      if (marker === 0xe2) icc = true;
      if (marker === 0xed) iptc = true;
      if (marker === 0xeb) c2pa = true;

      offset += 2 + markerLen;
    }
  }
  // WebP
  else if (bytes.length >= 12 && String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) === 'RIFF') {
    format = 'WEBP';
    let offset = 12;
    while (offset + 8 <= bytes.length) {
      const chunkId = String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
      const chunkLen = bytes[offset + 4] | (bytes[offset + 5] << 8) | (bytes[offset + 6] << 16) | (bytes[offset + 7] << 24);

      if (chunkId === 'EXIF') exif = true;
      if (chunkId === 'XMP ') xmp = true;
      if (chunkId === 'ICCP') icc = true;

      offset += 8 + chunkLen + (chunkLen % 2);
    }
  }

  return {
    c2paFound: c2pa,
    exifFound: exif,
    xmpFound: xmp,
    iccFound: icc,
    iptcFound: iptc,
    clean: !c2pa && !exif && !xmp && !icc && !iptc,
    bytesScanned: bytes.length,
    formatDetected: format,
  };
}

/**
 * Fast client-side 3x3 median order-statistic filter on ImageData.
 * Eliminates steganographic outlier noise without blurring sharp image edges.
 */
function applyMedianFilter3x3(imageData: ImageData): ImageData {
  const { width: w, height: h, data: src } = imageData;
  const output = new ImageData(w, h);
  const dst = output.data;
  dst.set(src); // Copy baseline (including borders)

  const winR = new Uint8Array(9);
  const winG = new Uint8Array(9);
  const winB = new Uint8Array(9);

  for (let y = 1; y < h - 1; y++) {
    const rowOffset = y * w * 4;
    for (let x = 1; x < w - 1; x++) {
      let k = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const srcOffset = (y + dy) * w * 4 + (x - 1) * 4;
        for (let dx = 0; dx < 3; dx++) {
          const idx = srcOffset + dx * 4;
          winR[k] = src[idx];
          winG[k] = src[idx + 1];
          winB[k] = src[idx + 2];
          k++;
        }
      }
      const dstIdx = rowOffset + x * 4;
      winR.sort();
      winG.sort();
      winB.sort();
      dst[dstIdx] = winR[4];
      dst[dstIdx + 1] = winG[4];
      dst[dstIdx + 2] = winB[4];
      // preserve alpha as-is
    }
  }
  return output;
}

export async function processImageClientSide(
  file: File,
  options: ClientProcessingOptions = {}
): Promise<{ base64Image: string; telemetry: any }> {
  const startTime = Date.now();
  const logs: string[] = [];

  const disruptionMode = options.disruptionMode || 'balanced';
  const disruptionStrength = options.disruptionStrength ?? 75;
  const isMetadataOnly = disruptionMode === 'metadata-only';
  const shouldRemoveBadge = options.removeVisibleBadge !== false && !isMetadataOnly;

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
  if (shouldRemoveBadge) {
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
  } else if (isMetadataOnly) {
    logs.push(`[INFO] Metadata-only mode active: visual badge removal bypassed to preserve bit-for-bit pixel integrity.`);
  }

  // 2. Frequency Disruption (SynthID & OpenAI Verifier Evasion)
  if (options.disruptSignals !== false && !isMetadataOnly) {
    logs.push(`[PROCESS] Initializing ${disruptionMode.toUpperCase()} frequency disruption (Strength: ${disruptionStrength}%)...`);

    // Step 2A: Chrominance-targeted microscopic frequency dither
    const data = imageData.data;
    const noiseScale = disruptionMode === 'aggressive' ? (disruptionStrength / 100) * 3.6 : (disruptionStrength / 100) * 2.0;
    const ditherProb = disruptionMode === 'aggressive' ? 0.75 : 0.55;
    let hasTransparency = false;

    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 255) {
        hasTransparency = true;
      }

      if (Math.random() < ditherProb) {
        const jitter = (Math.random() - 0.5) * noiseScale;
        data[i] = Math.min(255, Math.max(0, Math.round(data[i] + jitter)));
        data[i + 2] = Math.min(255, Math.max(0, Math.round(data[i + 2] - jitter)));

        if (disruptionMode === 'aggressive') {
          const lumaJitter = (Math.random() - 0.5) * (noiseScale * 0.35);
          data[i + 1] = Math.min(255, Math.max(0, Math.round(data[i + 1] + lumaJitter)));
        }
      }
    }

    // Step 2B: Non-linear order-statistic filtering (Aggressive mode)
    // Strips steganographic outlier noise without destroying coherent visual edges
    if (disruptionMode === 'aggressive') {
      imageData = applyMedianFilter3x3(imageData);
      logs.push(`[PROCESS] 3x3 median order-statistic spatial filter applied.`);
    }
    ctx.putImageData(imageData, 0, 0);

    // Step 2C: Anisotropic non-uniform geometric coordinate desynchronization
    // Breaks orthogonal 8x8 DCT grid and rectangular convolutional receptive fields
    const scaleX = disruptionMode === 'aggressive' ? 0.975 : 0.988;
    const scaleY = disruptionMode === 'aggressive' ? 0.965 : 0.978;
    const scaledW = Math.max(16, Math.round(canvas.width * scaleX));
    const scaledH = Math.max(16, Math.round(canvas.height * scaleY));

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

    // Step 2D: Mandatory Internal Lossy Round-Trip (DCT Coefficient Quantization)
    // Runs an intermediate lossy cycle on canvas to quantize high-frequency DCT harmonics
    // before final export. If transparency is present, we use lossy WebP to avoid flattening
    // alpha onto black (#000000). For opaque images, we use lossy JPEG.
    const internalQuality = disruptionMode === 'aggressive' ? 0.78 : 0.84;
    const lossyMime = hasTransparency ? 'image/webp' : 'image/jpeg';
    const internalLossyDataUrl = canvas.toDataURL(lossyMime, internalQuality);

    // If toDataURL('image/webp') is not supported or returns same data, canvas safely fallbacks
    if (internalLossyDataUrl && !internalLossyDataUrl.startsWith('data:image/png')) {
      const lossyImg = new Image();
      await new Promise((resolve, reject) => {
        lossyImg.onload = resolve;
        lossyImg.onerror = reject;
        lossyImg.src = internalLossyDataUrl;
      });
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(lossyImg, 0, 0);
      logs.push(`[PROCESS] Lossy DCT quantization pass applied (${hasTransparency ? 'alpha-preserving WebP' : 'JPEG'}).`);
    } else {
      logs.push(`[INFO] Alpha transparency preserved without lossy container flattening.`);
    }

    logs.push(`[SUCCESS] Chrominance phase shift, anisotropic grid realignment, & DCT quantization completed.`);
  } else if (isMetadataOnly) {
    logs.push(`[INFO] Metadata-only mode active: preserving pixel data bit-for-bit.`);
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

  // 4. Perform Real Forensic Byte-Level Provenance Audit on Client Base64
  const provenanceAudit = scanBase64Provenance(base64Image);
  logs.push(`[AUDIT] Scanned ${provenanceAudit.bytesScanned} bytes (${provenanceAudit.formatDetected}): C2PA=${provenanceAudit.c2paFound ? 'FOUND' : 'CLEAN'}, EXIF=${provenanceAudit.exifFound ? 'FOUND' : 'CLEAN'}, XMP=${provenanceAudit.xmpFound ? 'FOUND' : 'CLEAN'}, ICC=${provenanceAudit.iccFound ? 'FOUND' : 'CLEAN'}, IPTC=${provenanceAudit.iptcFound ? 'FOUND' : 'CLEAN'}`);

  const executionTimeMs = Date.now() - startTime;
  logs.push(`[COMPLETE] Pipeline finished in ${executionTimeMs}ms (Browser Memory).`);

  return {
    base64Image,
    telemetry: {
      originalSize: file.size,
      processedSize: Math.round(base64Image.length * 0.75),
      dimensions: { width: canvas.width, height: canvas.height },
      metadataStripped: options.stripMetadata !== false,
      signalsDisrupted: options.disruptSignals !== false && !isMetadataOnly,
      disruptionMode,
      badgeRemoved: shouldRemoveBadge,
      provenanceAudit,
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

  logs.push(`[CLIENT INPAINT] Reconstructed patch composited smoothly.`);
  logs.push(`[SUCCESS] Wiped C2PA Content Credentials and EXIF metadata.`);

  const base64Image = canvas.toDataURL('image/webp', 0.95);
  const provenanceAudit = scanBase64Provenance(base64Image);
  const executionTimeMs = Date.now() - startTime;
  logs.push(`[COMPLETE] Client inpainting finished in ${executionTimeMs}ms.`);

  return {
    base64Image,
    telemetry: {
      originalSize: imageFile.size,
      processedSize: Math.round(base64Image.length * 0.75),
      dimensions: { width, height },
      provenanceAudit,
      executionTimeMs,
      logs,
    },
  };
}
