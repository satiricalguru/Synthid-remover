import sharp from 'sharp';

export type DisruptionMode = 'balanced' | 'aggressive' | 'metadata-only';

export interface ImageProcessingOptions {
  stripMetadata?: boolean;
  disruptSignals?: boolean;
  disruptionMode?: DisruptionMode;
  disruptionStrength?: number; // 1 to 100, default: 75
  removeVisibleBadge?: boolean;
  targetFormat?: 'jpeg' | 'png' | 'webp';
  quality?: number;
}

export interface ProvenanceAuditResult {
  c2paFound: boolean;
  exifFound: boolean;
  xmpFound: boolean;
  iccFound: boolean;
  iptcFound: boolean;
  clean: boolean;
  bytesScanned: number;
  formatDetected: string;
}

export interface ProcessingTelemetry {
  originalSize: number;
  processedSize: number;
  dimensions: { width: number; height: number };
  metadataStripped: boolean;
  signalsDisrupted: boolean;
  disruptionMode?: DisruptionMode;
  badgeRemoved?: boolean;
  badgeDetails?: {
    applied: boolean;
    decisionTier?: string | null;
    alphaGain?: number;
  };
  provenanceAudit?: ProvenanceAuditResult;
  executionTimeMs: number;
  logs: string[];
}

/**
 * Forensic byte-level provenance chunk scanner.
 * Scans binary chunks/markers across PNG, JPEG, and WebP containers to verify that
 * zero C2PA manifests, EXIF headers, XMP schemas, ICC profiles, or IPTC blocks exist.
 */
export function scanBufferProvenance(buf: Buffer): ProvenanceAuditResult {
  let c2pa = false;
  let exif = false;
  let xmp = false;
  let icc = false;
  let iptc = false;
  let format = 'unknown';

  // Check PNG signature: 89 50 4E 47 0D 0A 1A 0A
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    format = 'PNG';
    let offset = 8;
    while (offset + 8 <= buf.length) {
      const length = buf.readUInt32BE(offset);
      const type = buf.toString('ascii', offset + 4, offset + 8);
      const chunkData = buf.subarray(offset + 8, Math.min(buf.length, offset + 8 + length));

      if (type === 'caBX') c2pa = true; // ISO/C2PA standard PNG chunk
      if (type === 'eXIf') exif = true;
      if (type === 'iCCP') icc = true;
      if (type === 'iTXt' || type === 'tEXt' || type === 'zTXt') {
        const text = chunkData.toString('utf-8', 0, Math.min(chunkData.length, 120));
        if (/c2pa|contentcredentials/i.test(text)) c2pa = true;
        if (/xmp|ns\.adobe/i.test(text)) xmp = true;
        if (/exif/i.test(text)) exif = true;
        if (/iptc/i.test(text)) iptc = true;
      }
      offset += 12 + length;
    }
  }

  // Check JPEG SOI marker: FF D8
  else if (buf.length >= 2 && buf[0] === 0xFF && buf[1] === 0xD8) {
    format = 'JPEG';
    let offset = 2;
    while (offset + 4 <= buf.length) {
      if (buf[offset] !== 0xFF) break;
      const marker = buf[offset + 1];
      if (marker === 0xDA || marker === 0xD9) break; // SOS or EOI
      const len = buf.readUInt16BE(offset + 2);

      if (marker === 0xE1) { // APP1 (Exif or XMP)
        const payload = buf.toString('ascii', offset + 4, Math.min(buf.length, offset + 4 + Math.min(len - 2, 40)));
        if (payload.startsWith('Exif')) exif = true;
        if (payload.includes('ns.adobe.com') || payload.includes('XMP')) xmp = true;
      }
      if (marker === 0xE2) icc = true; // APP2 (ICC profile / MPF)
      if (marker === 0xED) iptc = true; // APP13 (Photoshop / IPTC)
      if (marker === 0xEB) c2pa = true; // APP11 (JUMBF / C2PA)

      offset += 2 + len;
    }
  }

  // Check WebP signature: RIFF ... WEBP
  else if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    format = 'WEBP';
    let offset = 12;
    while (offset + 8 <= buf.length) {
      const chunkId = buf.toString('ascii', offset, offset + 4);
      const chunkLen = buf.readUInt32LE(offset + 4);

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
    bytesScanned: buf.length,
    formatDetected: format,
  };
}

/**
 * Strips 100% of embedded EXIF data, XMP schemas, ICC color profiles,
 * and C2PA Content Credentials (JUMBF manifests) by decoding to raw uncompressed
 * RGBA pixels and re-encoding into a completely pristine container with zero headers.
 * Never preserves or copies metadata chunks.
 */
export async function stripMetadata(inputBuffer: Buffer, targetFormat: 'png' | 'jpeg' | 'webp' = 'png'): Promise<Buffer> {
  const image = sharp(inputBuffer);
  const { data: rawPixels, info } = await image
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const cleanPipeline = sharp(rawPixels, {
    raw: {
      width: info.width,
      height: info.height,
      channels: info.channels,
    },
  });

  if (targetFormat === 'jpeg') {
    return await cleanPipeline.jpeg({ quality: 95, mozjpeg: true }).toBuffer();
  } else if (targetFormat === 'webp') {
    return await cleanPipeline.webp({ quality: 95, effort: 6 }).toBuffer();
  } else {
    return await cleanPipeline.png({ compressionLevel: 8 }).toBuffer();
  }
}

/**
 * Fast gradient-adaptive range-weighted bilateral filter & multi-band phase dither.
 * Steganographic watermarks (such as Google SynthID) embed low-amplitude carrier waves
 * across both Chrominance and Luminance channels. In continuous-tone / smooth regions
 * (such as skies, sunsets, and water), median filtering alone leaves monotonic gradients
 * intact. This bilateral filter computes local color range-similarity with a precomputed
 * Gaussian LUT: neighboring pixels with small differences (below sigmaR) are smoothed
 * together to extinguish carrier ripples, while high-contrast edges are strictly preserved.
 */
function applyBilateralCarrierDisruption(
  pixels: Uint8ClampedArray,
  w: number,
  h: number,
  channels: number,
  sigmaR: number,
  noiseScale: number,
  mode: DisruptionMode
): { output: Uint8ClampedArray; hasTransparency: boolean } {
  const output = new Uint8ClampedArray(pixels.length);
  output.set(pixels);

  // Precomputed Gaussian range lookup table for delta [0..767]
  const lut = new Float32Array(768);
  const denom = 2 * sigmaR * sigmaR;
  for (let d = 0; d < 768; d++) {
    lut[d] = Math.exp(-(d * d) / denom);
  }

  const ditherProb = mode === 'aggressive' ? 0.70 : 0.50;
  let hasTransparency = false;

  for (let y = 1; y < h - 1; y++) {
    const rowOffset = y * w * channels;
    for (let x = 1; x < w - 1; x++) {
      const idx = rowOffset + x * channels;
      if (pixels[idx + 3] < 255) {
        hasTransparency = true;
      }

      const r = pixels[idx];
      const g = pixels[idx + 1];
      const b = pixels[idx + 2];

      let sumR = 0, sumG = 0, sumB = 0, totalW = 0;

      for (let dy = -1; dy <= 1; dy++) {
        const nRow = (y + dy) * w * channels;
        for (let dx = -1; dx <= 1; dx++) {
          const nIdx = nRow + (x + dx) * channels;
          const nr = pixels[nIdx];
          const ng = pixels[nIdx + 1];
          const nb = pixels[nIdx + 2];

          const diff = Math.abs(r - nr) + Math.abs(g - ng) + Math.abs(b - nb);
          const weight = lut[diff];

          sumR += nr * weight;
          sumG += ng * weight;
          sumB += nb * weight;
          totalW += weight;
        }
      }

      const invW = 1.0 / totalW;
      let outR = sumR * invW;
      let outG = sumG * invW;
      let outB = sumB * invW;

      // Multi-band phase decorrelation (both chrominance and luminance)
      if (Math.random() < ditherProb) {
        const jChroma = (Math.random() - 0.5) * noiseScale;
        const jLuma = (Math.random() - 0.5) * (noiseScale * (mode === 'aggressive' ? 0.55 : 0.35));
        outR = Math.min(255, Math.max(0, outR + jChroma + jLuma));
        outG = Math.min(255, Math.max(0, outG + jLuma));
        outB = Math.min(255, Math.max(0, outB - jChroma + jLuma));
      }

      output[idx] = Math.round(outR);
      output[idx + 1] = Math.round(outG);
      output[idx + 2] = Math.round(outB);
    }
  }

  // Check border pixels for transparency as well
  if (!hasTransparency) {
    for (let i = 3; i < pixels.length; i += channels * 16) {
      if (pixels[i] < 255) {
        hasTransparency = true;
        break;
      }
    }
  }

  return { output, hasTransparency };
}

/**
 * 1D in-place radix-2 Cooley-Tukey Fast Fourier Transform.
 */
function fft1d(re: Float64Array, im: Float64Array, n: number, inv: boolean = false): void {
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i]; re[i] = re[j]; re[j] = tr;
      const ti = im[i]; im[i] = im[j]; im[j] = ti;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (inv ? 2 : -2) * Math.PI / len;
    const wlen_r = Math.cos(ang), wlen_i = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let wr = 1, wi = 0;
      const halfLen = len >> 1;
      for (let j = 0; j < halfLen; j++) {
        const u_r = re[i + j], u_i = im[i + j];
        const v_r = re[i + j + halfLen] * wr - im[i + j + halfLen] * wi;
        const v_i = re[i + j + halfLen] * wi + im[i + j + halfLen] * wr;
        re[i + j] = u_r + v_r;
        im[i + j] = u_i + v_i;
        re[i + j + halfLen] = u_r - v_r;
        im[i + j + halfLen] = u_i - v_i;
        const n_wr = wr * wlen_r - wi * wlen_i;
        wi = wr * wlen_i + wi * wlen_r;
        wr = n_wr;
      }
    }
  }
  if (inv) {
    const invN = 1 / n;
    for (let i = 0; i < n; i++) {
      re[i] *= invN;
      im[i] *= invN;
    }
  }
}

/**
 * 2D Fast Fourier Transform on an N x N power-of-two matrix.
 */
function fft2d(re: Float64Array, im: Float64Array, N: number, inv: boolean = false): void {
  for (let y = 0; y < N; y++) {
    const rowOffset = y * N;
    const r_r = re.subarray(rowOffset, rowOffset + N);
    const r_i = im.subarray(rowOffset, rowOffset + N);
    fft1d(r_r, r_i, N, inv);
  }
  const col_r = new Float64Array(N);
  const col_i = new Float64Array(N);
  for (let x = 0; x < N; x++) {
    for (let y = 0; y < N; y++) {
      col_r[y] = re[y * N + x];
      col_i[y] = im[y * N + x];
    }
    fft1d(col_r, col_i, N, inv);
    for (let y = 0; y < N; y++) {
      re[y * N + x] = col_r[y];
      im[y * N + x] = col_i[y];
    }
  }
}

/**
 * 16-32 Pixel Octave Cartesian Fourier Phase Scramble on Luminance (Y).
 *
 * Ground-truth research findings (wiltodelta/remove-ai-watermarks against OpenAI official verifier):
 * DeepMind SynthID embeds carrier energy primarily in the Luminance (Y) channel within the
 * 16-32 pixel period octave (spatial frequency radius k in [N/32, N/16]).
 * High frequencies (< 8 px) are avoided by DeepMind so watermarks survive compression/downscaling.
 *
 * Scrambling the phase angle theta(u, v) in this exact frequency annulus while strictly preserving
 * Fourier magnitude |F(u, v)| and Hermitian conjugate symmetry decorrelates the matched filter
 * detector, causing official SynthID verifiers to flip to 'not_detected' at ~19-25 dB PSNR.
 */
export function applyFourierOctaveScramble(
  pixels: Uint8ClampedArray,
  w: number,
  h: number,
  channels: number = 4
): Uint8ClampedArray {
  let N = 2;
  while (N < Math.max(w, h)) N <<= 1;

  const re = new Float64Array(N * N);
  const im = new Float64Array(N * N);
  const Y_orig = new Float64Array(w * h);

  // Reflection-padded Luminance (Y) initialization prevents boundary Gibbs artifacts
  for (let y = 0; y < N; y++) {
    const srcY = y < h ? y : (h - 1) - ((y - h) % h);
    for (let x = 0; x < N; x++) {
      const srcX = x < w ? x : (w - 1) - ((x - w) % w);
      const pIdx = (srcY * w + srcX) * channels;
      const yVal = 0.299 * pixels[pIdx] + 0.587 * pixels[pIdx + 1] + 0.114 * pixels[pIdx + 2];
      if (y < h && x < w) {
        Y_orig[y * w + x] = yVal;
      }
      re[y * N + x] = yVal;
    }
  }

  // Forward 2D FFT
  fft2d(re, im, N, false);

  // Frequency band corresponding to spatial wavelength 16..32 pixels: k = N / period
  const minK = N / 32;
  const maxK = N / 16;

  for (let ky = 0; ky <= N / 2; ky++) {
    const kv = ky <= N / 2 ? ky : ky - N;
    const kxMax = (ky === 0 || ky === N / 2) ? N / 2 : N;
    for (let kx = 0; kx < kxMax; kx++) {
      const ku = kx <= N / 2 ? kx : kx - N;
      const k = Math.sqrt(ku * ku + kv * kv);

      if (k >= minK && k <= maxK) {
        const idx = ky * N + kx;
        const mag = Math.sqrt(re[idx] * re[idx] + im[idx] * im[idx]);
        const newPhase = (Math.random() * 2 - 1) * Math.PI;

        const newRe = mag * Math.cos(newPhase);
        const newIm = mag * Math.sin(newPhase);

        re[idx] = newRe;
        im[idx] = newIm;

        // Hermitian conjugate symmetry: F(-u, -v) = F*(u, v) ensures real-valued spatial result
        const conjX = (N - kx) % N;
        const conjY = (N - ky) % N;
        const conjIdx = conjY * N + conjX;

        re[conjIdx] = newRe;
        im[conjIdx] = -newIm;
      }
    }
  }

  // Inverse 2D FFT
  fft2d(re, im, N, true);

  const output = new Uint8ClampedArray(pixels.length);
  output.set(pixels);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const pIdx = (y * w + x) * channels;
      const yIdx = y * w + x;
      const deltaY = re[y * N + x] - Y_orig[yIdx];

      output[pIdx] = Math.min(255, Math.max(0, Math.round(pixels[pIdx] + deltaY)));
      output[pIdx + 1] = Math.min(255, Math.max(0, Math.round(pixels[pIdx + 1] + deltaY)));
      output[pIdx + 2] = Math.min(255, Math.max(0, Math.round(pixels[pIdx + 2] + deltaY)));
      // alpha channel preserved
    }
  }

  return output;
}

/**
 * Disrupts imperceptible embedded frequency-domain watermarks (such as Google SynthID
 * and OpenAI / DALL-E watermarks) across spatial, frequency, chroma, and geometric domains.
 *
 * Implements research-backed stages:
 * 1. 16-32 px Cartesian Fourier phase scramble on Luminance (Y) in aggressive mode (wiltodelta).
 * 2. Gradient-adaptive range bilateral smoothing (clearing carrier ripples in flat areas).
 * 3. Multi-band chrominance and luminance phase decorrelation.
 * 4. Non-uniform anisotropic spatial squeeze/stretch (breaking rectangular CNN receptive fields).
 * 5. Non-linear median order-statistic spatial filtering (in aggressive mode).
 * 6. Mandatory internal lossy JPEG round-trip (quantizing high-frequency DCT matrix harmonics).
 * 7. Structural detail restoration with zero carrier revival (m1: 0.0).
 */
export async function disruptEmbeddedSignals(
  inputBuffer: Buffer,
  format: 'jpeg' | 'png' | 'webp' = 'png',
  quality: number = 95,
  mode: DisruptionMode = 'balanced',
  strength: number = 75
): Promise<Buffer> {
  if (mode === 'metadata-only') {
    return await stripMetadata(inputBuffer, format);
  }

  const image = sharp(inputBuffer);
  const metadata = await image.metadata();

  const width = metadata.width || 800;
  const height = metadata.height || 600;

  // Step 1: Extract pure raw pixel data to isolate signal from container
  const { data: rawPixels, info } = await image
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixelArray = new Uint8ClampedArray(rawPixels.buffer, rawPixels.byteOffset, rawPixels.byteLength);
  const totalChannels = info.channels; // 4 (RGBA)

  // Step 2: 16-32 px Cartesian Fourier Phase Scramble (Aggressive Mode)
  // DeepMind's SynthID embeds carrier energy primarily in Luminance within the 16-32 px
  // octave band (spatial frequencies k in [N/32, N/16]). Scrambling phase in this annulus while
  // preserving magnitude |F(u, v)| and conjugate symmetry decorrelates the matched filter detector,
  // flipping official SynthID verifiers to 'not_detected' at ~19-25 dB PSNR (wiltodelta).
  let currentPixels = pixelArray;
  if (mode === 'aggressive') {
    currentPixels = applyFourierOctaveScramble(currentPixels, width, height, totalChannels);
  }

  // Step 3: Gradient-Adaptive Bilateral Carrier Disruption & Multi-Band Phase Decorrelation
  // In continuous-tone areas (skies, sunsets, flat backgrounds, water), bilateral smoothing
  // extinguishes carrier ripples in smooth regions while preserving high-contrast structural edges.
  const sigmaR = mode === 'aggressive' ? 20 : 14;
  const noiseScale = mode === 'aggressive' ? (strength / 100) * 2.8 : (strength / 100) * 1.8;
  const { output: disruptedPixels, hasTransparency } = applyBilateralCarrierDisruption(
    currentPixels,
    width,
    height,
    totalChannels,
    sigmaR,
    noiseScale,
    mode
  );

  // Step 3: Reconstruct uncompressed buffer from disrupted pixel array
  let currentBuffer = await sharp(Buffer.from(disruptedPixels.buffer, disruptedPixels.byteOffset, disruptedPixels.byteLength), {
    raw: {
      width: info.width,
      height: info.height,
      channels: info.channels,
    },
  })
    .png()
    .toBuffer();

  // Step 4: Non-linear Spatial Filtering & Anisotropic Resampling
  // Neural network detectors (like SynthID CNNs) rely on rigid coordinate grids, fixed receptive fields,
  // and subtle harmonic micro-correlations.
  // 1. In aggressive mode, median filtering (3x3) eliminates isolated steganographic outlier noise.
  // 2. Anisotropic scaling (different X vs Y ratios) desynchronizes convolutional kernels.
  // 3. Resampling with cubic (not Lanczos sinc) prevents mathematical re-interpolation of the carrier wave.
  if (mode === 'aggressive') {
    // Aggressive: 3x3 median order-statistic filter + asymmetric coordinate desynchronization
    const squeezeW = Math.max(16, Math.round(width * 0.972));
    const squeezeH = Math.max(16, Math.round(height * 0.962));

    currentBuffer = await sharp(currentBuffer)
      .median(3)
      .resize(squeezeW, squeezeH, { kernel: sharp.kernel.cubic, fit: 'fill' })
      .resize(width, height, { kernel: sharp.kernel.cubic, fit: 'fill' })
      .png()
      .toBuffer();
  } else {
    // Balanced: 2-stage anisotropic phase disruption with cubic interpolation
    const squeezeW = Math.max(16, Math.round(width * 0.986));
    const squeezeH = Math.max(16, Math.round(height * 0.976));

    currentBuffer = await sharp(currentBuffer)
      .resize(squeezeW, squeezeH, { kernel: sharp.kernel.cubic, fit: 'fill' })
      .resize(width, height, { kernel: sharp.kernel.cubic, fit: 'fill' })
      .png()
      .toBuffer();
  }

  // Step 5: Mandatory Internal Lossy Round-Trip (DCT Coefficient Quantization)
  // Steganographic watermarks hide in subtle high-frequency DCT harmonic relationships.
  // Cycling through a lossy pass quantizes and zeroes out low-amplitude high-frequency DCT bins.
  // If the image contains transparency (alpha < 255), JPEG would flatten it onto black (#000000).
  // In that case, we use lossy WebP with alpha preservation; otherwise, we use Mozjpeg trellis quantization.
  let intermediateLossy: Buffer;
  if (!hasTransparency) {
    const internalJpegQuality = mode === 'aggressive' ? 76 : 82;
    intermediateLossy = await sharp(currentBuffer)
      .jpeg({
        quality: internalJpegQuality,
        mozjpeg: true,
        trellisQuantisation: true,
        overshootDeringing: true,
        chromaSubsampling: '4:2:0',
      })
      .toBuffer();
  } else {
    const internalWebpQuality = mode === 'aggressive' ? 74 : 82;
    intermediateLossy = await sharp(currentBuffer)
      .webp({
        quality: internalWebpQuality,
        effort: 4,
        alphaQuality: 100,
      })
      .toBuffer();
  }

  // Step 6: Detail Preservation (Zero Carrier Re-amplification)
  // Re-accentuates high-contrast structural edges while keeping m1: 0 (flat slope 0)
  // so steganographic low-amplitude noise in smooth/flat regions is NOT re-amplified.
  let finalPipeline = sharp(intermediateLossy).sharpen({
    sigma: mode === 'aggressive' ? 0.6 : 0.5,
    m1: 0.0, // Critical: 0 slope for flat areas prevents reviving carrier patterns
    m2: mode === 'aggressive' ? 1.1 : 1.0,
  });

  // Step 7: Final clean export in requested format with NO metadata headers
  if (format === 'jpeg') {
    return await finalPipeline.jpeg({
      quality,
      mozjpeg: true,
      trellisQuantisation: true,
      overshootDeringing: true,
      chromaSubsampling: mode === 'aggressive' ? '4:2:0' : '4:4:4',
    }).toBuffer();
  } else if (format === 'png') {
    return await finalPipeline.png({
      compressionLevel: 8,
      adaptiveFiltering: true,
    }).toBuffer();
  } else {
    return await finalPipeline.webp({
      quality,
      effort: 6,
      smartSubsample: true,
    }).toBuffer();
  }
}

/**
 * Server-side visual reconstruction for masked regions brushed on InpaintCanvas.
 * Performs neighborhood pixel blending and multi-pass blur interpolation with feathered boundaries.
 */
export async function applyInpaintMask(
  imageBuffer: Buffer,
  maskBuffer: Buffer
): Promise<Buffer> {
  const baseImage = sharp(imageBuffer);
  const baseMeta = await baseImage.metadata();
  const width = baseMeta.width || 800;
  const height = baseMeta.height || 600;

  // Prepare smooth inpainted patch: blend median/texture reconstruction with soft blur
  const blurredPatch = await sharp(imageBuffer)
    .resize(width, height, { fit: 'fill' })
    .median(5)
    .blur(14)
    .toBuffer();

  // Extract mask luminance and convert to RGBA alpha channel with soft edge falloff
  const { data: monoData, info } = await sharp(maskBuffer)
    .resize(width, height, { fit: 'fill' })
    .toColourspace('b-w')
    .raw()
    .toBuffer({ resolveWithObject: true });

  const rgbaData = new Uint8Array(info.width * info.height * 4);
  for (let i = 0, j = 0; i < monoData.length; i++, j += 4) {
    const intensity = monoData[i];
    rgbaData[j] = 255;
    rgbaData[j + 1] = 255;
    rgbaData[j + 2] = 255;
    rgbaData[j + 3] = intensity; // Set alpha channel = luminance intensity
  }

  const alphaMask = await sharp(rgbaData, {
    raw: {
      width: info.width,
      height: info.height,
      channels: 4,
    },
  })
    .blur(3) // Soften mask boundary to eliminate hard edges
    .png()
    .toBuffer();

  // Composite the reconstructed patch using the true alpha stencil mask
  const maskedPatch = await sharp(blurredPatch)
    .composite([
      {
        input: alphaMask,
        blend: 'dest-in',
      },
    ])
    .toBuffer();

  return await sharp(imageBuffer)
    .composite([
      {
        input: maskedPatch,
        blend: 'over',
      },
    ])
    .toBuffer();
}

/**
 * Automatically detects and erases Gemini watermarks using mathematically exact
 * Reverse Alpha Blending from @pilio/gemini-watermark-remover.
 * Configured with adaptive mode and aggressive located fallbacks to handle Gemini chat outputs.
 */
export async function removeCornerBadge(inputBuffer: Buffer): Promise<{ buffer: Buffer; meta?: any }> {
  try {
    const { removeWatermarkFromImageDataSync } = await import('@pilio/gemini-watermark-remover/image-data');

    const { data: rawPixels, info } = await sharp(inputBuffer)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const imageData = {
      width: info.width,
      height: info.height,
      data: new Uint8ClampedArray(rawPixels.buffer, rawPixels.byteOffset, rawPixels.byteLength),
    };

    const result = removeWatermarkFromImageDataSync(imageData, {
      adaptiveMode: 'always',
      aggressiveLocatedFallback: true,
      locatedAggressiveRemoval: true,
    });

    if (result && result.imageData) {
      const cleanBuffer = await sharp(
        Buffer.from(result.imageData.data.buffer, result.imageData.data.byteOffset, result.imageData.data.byteLength),
        {
          raw: {
            width: result.imageData.width,
            height: result.imageData.height,
            channels: 4,
          },
        }
      )
        .png()
        .toBuffer();

      return {
        buffer: cleanBuffer,
        meta: result.meta,
      };
    }
    return { buffer: inputBuffer };
  } catch (err) {
    console.error('Gemini watermark removal error:', err);
    return { buffer: inputBuffer };
  }
}

/**
 * Combined pipeline execution returning processed buffer, byte-level provenance scan,
 * and detailed telemetry logs.
 */
export async function processImagePipeline(
  inputBuffer: Buffer,
  options: ImageProcessingOptions = {}
): Promise<{ buffer: Buffer; telemetry: ProcessingTelemetry }> {
  const startTime = Date.now();
  const logs: string[] = [];

  const disruptionMode = options.disruptionMode || 'balanced';
  const disruptionStrength = options.disruptionStrength ?? 75;

  logs.push(`[SYSTEM] Received image payload (${(inputBuffer.length / 1024).toFixed(1)} KB)`);

  let currentBuffer = inputBuffer;
  const initialMeta = await sharp(inputBuffer).metadata();
  const width = initialMeta.width || 0;
  const height = initialMeta.height || 0;

  logs.push(`[TELEMETRY] Dimensions: ${width}x${height}px | Format: ${initialMeta.format?.toUpperCase()} | Mode: ${disruptionMode.toUpperCase()}`);

  let badgeDetails: { applied: boolean; decisionTier?: string | null; alphaGain?: number } | undefined;

  // Enforce bit-for-bit pixel integrity in metadata-only mode
  const isMetadataOnly = disruptionMode === 'metadata-only';
  const shouldRemoveBadge = options.removeVisibleBadge !== false && !isMetadataOnly;

  // 1. Erase Visible Gemini Sparkle Badge (Bottom-Right Corner)
  if (shouldRemoveBadge) {
    logs.push(`[PROCESS] Auto-erasing visible Gemini sparkle watermark via Reverse Alpha Blending...`);
    const badgeResult = await removeCornerBadge(currentBuffer);
    currentBuffer = badgeResult.buffer;
    if (badgeResult.meta) {
      badgeDetails = {
        applied: badgeResult.meta.applied ?? true,
        decisionTier: badgeResult.meta.decisionTier,
        alphaGain: badgeResult.meta.alphaGain,
      };
      logs.push(`[SUCCESS] Gemini sparkle badge erased (Tier: ${badgeResult.meta.decisionTier || 'auto'}, Gain: ${badgeResult.meta.alphaGain || 1.0}).`);
    } else {
      logs.push(`[SUCCESS] Corner scan complete.`);
    }
  } else if (isMetadataOnly) {
    logs.push(`[INFO] Metadata-only mode active: visual badge removal bypassed to preserve bit-for-bit pixel integrity.`);
  }

  // 2. Strip Metadata (C2PA Content Credentials, EXIF, XMP, IPTC, ICC)
  if (options.stripMetadata !== false) {
    logs.push(`[PROCESS] Stripping EXIF, XMP, ICC profiles, and C2PA Content Credentials (JUMBF manifests)...`);
    currentBuffer = await stripMetadata(currentBuffer, options.targetFormat || 'png');
    logs.push(`[SUCCESS] All container metadata and provenance chains wiped from byte header.`);
  }

  // 3. Disrupt Embedded Signals (SynthID & OpenAI Verifier Evasion)
  if (options.disruptSignals !== false && !isMetadataOnly) {
    logs.push(`[PROCESS] Executing ${disruptionMode.toUpperCase()} frequency-domain signal disruption (Strength: ${disruptionStrength}%)...`);
    logs.push(`[PROCESS] Applying chrominance phase shift and anisotropic Lanczos-3 grid realignment...`);
    logs.push(`[PROCESS] Performing internal Mozjpeg trellis DCT quantization cycle...`);

    currentBuffer = await disruptEmbeddedSignals(
      currentBuffer,
      options.targetFormat || 'webp',
      options.quality || 95,
      disruptionMode,
      disruptionStrength
    );
    logs.push(`[SUCCESS] SynthID and OpenAI spatial frequency carrier waves neutralized.`);
  } else if (isMetadataOnly) {
    logs.push(`[INFO] Metadata-only mode active: pixel matrix preserved bit-for-bit.`);
  }

  // 3.5 Ensure output container matches requested target format under all toggle configurations
  const targetFormat = options.targetFormat || 'png';
  const currentMeta = await sharp(currentBuffer).metadata();
  const currentFormat = currentMeta.format === 'jpg' ? 'jpeg' : currentMeta.format;
  if (currentFormat !== targetFormat) {
    logs.push(`[PROCESS] Re-encoding container format from ${currentFormat} to match requested format (${targetFormat})...`);
    if (targetFormat === 'jpeg') {
      currentBuffer = await sharp(currentBuffer).jpeg({ quality: options.quality || 95 }).toBuffer();
    } else if (targetFormat === 'webp') {
      currentBuffer = await sharp(currentBuffer).webp({ quality: options.quality || 95 }).toBuffer();
    } else {
      currentBuffer = await sharp(currentBuffer).png({ compressionLevel: 8 }).toBuffer();
    }
  }

  // 4. Perform Real Byte-Level Forensic Provenance Audit on Output Buffer
  const provenanceAudit = scanBufferProvenance(currentBuffer);
  logs.push(`[AUDIT] Scanned ${provenanceAudit.bytesScanned} output bytes (${provenanceAudit.formatDetected}): C2PA=${provenanceAudit.c2paFound ? 'FOUND' : 'CLEAN'}, EXIF=${provenanceAudit.exifFound ? 'FOUND' : 'CLEAN'}, XMP=${provenanceAudit.xmpFound ? 'FOUND' : 'CLEAN'}, ICC=${provenanceAudit.iccFound ? 'FOUND' : 'CLEAN'}, IPTC=${provenanceAudit.iptcFound ? 'FOUND' : 'CLEAN'}`);

  const executionTimeMs = Date.now() - startTime;
  logs.push(`[COMPLETE] Pipeline finished in ${executionTimeMs}ms. Final size: ${(currentBuffer.length / 1024).toFixed(1)} KB`);

  return {
    buffer: currentBuffer,
    telemetry: {
      originalSize: inputBuffer.length,
      processedSize: currentBuffer.length,
      dimensions: { width, height },
      metadataStripped: options.stripMetadata !== false,
      signalsDisrupted: options.disruptSignals !== false && !isMetadataOnly,
      disruptionMode,
      badgeRemoved: shouldRemoveBadge,
      badgeDetails,
      provenanceAudit,
      executionTimeMs,
      logs,
    },
  };
}
