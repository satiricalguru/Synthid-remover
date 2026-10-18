import fs from 'fs';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import { processImagePipeline, scanBufferProvenance } from '../lib/imageProcessor.ts';

// Helper function to calculate Mean Squared Error (MSE) and PSNR
async function calculatePSNR(buf1, buf2) {
  const { data: d1, info: i1 } = await sharp(buf1).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { data: d2, info: i2 } = await sharp(buf2).resize(i1.width, i1.height, { fit: 'fill' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

  let sumSquaredError = 0;
  const len = Math.min(d1.length, d2.length);
  // Compare RGB channels only (skip alpha)
  let count = 0;
  for (let i = 0; i < len; i += 4) {
    for (let c = 0; c < 3; c++) {
      const diff = d1[i + c] - d2[i + c];
      sumSquaredError += diff * diff;
      count++;
    }
  }

  const mse = sumSquaredError / count;
  if (mse === 0) return { mse: 0, psnr: Infinity };

  const psnr = 10 * Math.log10((255 * 255) / mse);
  return { mse, psnr };
}

async function runVerificationSuite() {
  console.log('====================================================');
  console.log('🧪 REALTIME SYNTHID-REMOVER AUTOMATED TEST SUITE');
  console.log('====================================================\n');

  const testModes = ['metadata-only', 'balanced', 'aggressive'];

  // --------------------------------------------------------------------------
  // FIXTURE 1: Synthetic High-Entropy Gradient + Mock EXIF
  // --------------------------------------------------------------------------
  const width = 400;
  const height = 400;

  const rawSvg = Buffer.from(`
    <svg width="${width}" height="${height}">
      <defs>
        <radialGradient id="grad1" cx="50%" cy="50%" r="50%" fx="50%" fy="50%">
          <stop offset="0%" style="stop-color:rgb(255,255,255);stop-opacity:1" />
          <stop offset="40%" style="stop-color:rgb(255,100,50);stop-opacity:1" />
          <stop offset="100%" style="stop-color:rgb(20,40,90);stop-opacity:1" />
        </radialGradient>
      </defs>
      <rect width="${width}" height="${height}" fill="url(#grad1)" />
      <circle cx="150" cy="150" r="60" fill="cyan" />
      <rect x="220" y="220" width="100" height="100" fill="magenta" />
    </svg>
  `);

  const syntheticInput = await sharp(rawSvg)
    .withMetadata({
      exif: {
        IFD0: {
          Artist: 'OpenAI ChatGPT DALL-E',
          Make: 'Synthetic Provenance Test',
          Copyright: 'C2PA Test Mock',
        },
      },
    })
    .jpeg()
    .toBuffer();

  console.log(`[SETUP: FIXTURE 1] Generated synthetic SVG test image (${width}x${height}px, ${(syntheticInput.length / 1024).toFixed(1)} KB)`);

  const initialScan1 = scanBufferProvenance(syntheticInput);
  console.log(`[SETUP: FIXTURE 1] Initial scan: EXIF=${initialScan1.exifFound}, C2PA=${initialScan1.c2paFound}, Clean=${initialScan1.clean}`);

  if (initialScan1.clean) {
    throw new Error('Test setup error: Fixture 1 was expected to contain EXIF metadata.');
  }

  const syntheticResults = [];

  for (const mode of testModes) {
    console.log(`\n[Fixture 1 - SVG Gradient] Mode: ${mode.toUpperCase()}`);

    const result = await processImagePipeline(syntheticInput, {
      disruptionMode: mode,
      disruptionStrength: 75,
      stripMetadata: true,
      targetFormat: 'png',
    });

    const audit = result.telemetry.provenanceAudit;
    const { mse, psnr } = await calculatePSNR(syntheticInput, result.buffer);

    console.log(`  ⏱️ Time: ${result.telemetry.executionTimeMs} ms | 📦 Size: ${(result.buffer.length / 1024).toFixed(1)} KB`);
    console.log(`  🔍 Byte Audit: C2PA=${audit.c2paFound ? 'FOUND' : 'CLEAN'}, EXIF=${audit.exifFound ? 'FOUND' : 'CLEAN'}, XMP=${audit.xmpFound ? 'FOUND' : 'CLEAN'}, ICC=${audit.iccFound ? 'FOUND' : 'CLEAN'}`);
    console.log(`  📊 Measured PSNR: ${psnr === Infinity ? 'Infinity (Lossless)' : psnr.toFixed(2) + ' dB'} (MSE: ${mse.toFixed(2)})`);

    if (!audit.clean) {
      throw new Error(`[ASSERTION FAILED] Fixture 1 in mode '${mode}' did not produce a clean byte container!`);
    }

    if (mode === 'metadata-only' && psnr !== Infinity) {
      throw new Error(`[ASSERTION FAILED] Metadata-only mode must preserve 100% lossless bit-for-bit pixels (got PSNR: ${psnr.toFixed(2)} dB, expected Infinity)`);
    }

    if (mode === 'balanced' && psnr < 38) {
      throw new Error(`[ASSERTION FAILED] Balanced mode visual drift exceeded threshold (PSNR: ${psnr.toFixed(2)} dB, expected >= 38 dB)`);
    }

    if (mode === 'aggressive' && psnr < 35) {
      throw new Error(`[ASSERTION FAILED] Aggressive mode visual drift exceeded threshold (PSNR: ${psnr.toFixed(2)} dB, expected >= 35 dB)`);
    }

    syntheticResults.push({
      fixture: 'SVG Gradient (400x400)',
      mode,
      auditClean: audit.clean,
      psnr: psnr === Infinity ? 'Infinity (Lossless)' : psnr.toFixed(2) + ' dB',
      mse: mse.toFixed(2),
      timeMs: result.telemetry.executionTimeMs,
    });
  }

  // --------------------------------------------------------------------------
  // FIXTURE 2: Realistic Textured Photograph (public/hero-watermarked.jpg)
  // --------------------------------------------------------------------------
  const photoPath = fileURLToPath(new URL('../public/hero-watermarked.jpg', import.meta.url));
  const photoInput = fs.readFileSync(photoPath);
  const photoMeta = await sharp(photoInput).metadata();

  console.log(`\n[SETUP: FIXTURE 2] Loaded real photo (${photoMeta.width}x${photoMeta.height}px, ${(photoInput.length / 1024).toFixed(1)} KB)`);

  const photoResults = [];

  for (const mode of testModes) {
    console.log(`\n[Fixture 2 - Real Photo] Mode: ${mode.toUpperCase()}`);

    const result = await processImagePipeline(photoInput, {
      disruptionMode: mode,
      disruptionStrength: 75,
      stripMetadata: true,
      targetFormat: 'png',
    });

    const audit = result.telemetry.provenanceAudit;
    const { mse, psnr } = await calculatePSNR(photoInput, result.buffer);

    console.log(`  ⏱️ Time: ${result.telemetry.executionTimeMs} ms | 📦 Size: ${(result.buffer.length / 1024).toFixed(1)} KB`);
    console.log(`  🔍 Byte Audit: C2PA=${audit.c2paFound ? 'FOUND' : 'CLEAN'}, EXIF=${audit.exifFound ? 'FOUND' : 'CLEAN'}, XMP=${audit.xmpFound ? 'FOUND' : 'CLEAN'}, ICC=${audit.iccFound ? 'FOUND' : 'CLEAN'}`);
    console.log(`  📊 Measured PSNR: ${psnr === Infinity ? 'Infinity (Lossless)' : psnr.toFixed(2) + ' dB'} (MSE: ${mse.toFixed(2)})`);

    if (!audit.clean) {
      throw new Error(`[ASSERTION FAILED] Fixture 2 in mode '${mode}' did not produce a clean byte container!`);
    }

    if (mode === 'metadata-only' && psnr !== Infinity) {
      throw new Error(`[ASSERTION FAILED] Metadata-only mode must preserve 100% lossless bit-for-bit pixels on photo! (got PSNR: ${psnr.toFixed(2)} dB, expected Infinity)`);
    }

    if (mode === 'balanced' && psnr < 35) {
      throw new Error(`[ASSERTION FAILED] Balanced mode visual drift on photo exceeded threshold (PSNR: ${psnr.toFixed(2)} dB, expected >= 35 dB)`);
    }

    if (mode === 'aggressive' && psnr < 30) {
      throw new Error(`[ASSERTION FAILED] Aggressive mode visual drift on photo exceeded threshold (PSNR: ${psnr.toFixed(2)} dB, expected >= 30 dB)`);
    }

    photoResults.push({
      fixture: 'Real Photo (1200x655)',
      mode,
      auditClean: audit.clean,
      psnr: psnr === Infinity ? 'Infinity (Lossless)' : psnr.toFixed(2) + ' dB',
      mse: mse.toFixed(2),
      timeMs: result.telemetry.executionTimeMs,
    });
  }

  console.log('\n====================================================');
  console.log('✅ ALL PIPELINE & AUDIT ASSERTIONS PASSED (BOTH FIXTURES)');
  console.log('====================================================');
  console.log('\n--- Fixture 1: Synthetic Gradient Results ---');
  console.table(syntheticResults);
  console.log('\n--- Fixture 2: Real Photograph Results ---');
  console.table(photoResults);
}

runVerificationSuite()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n❌ VERIFICATION SUITE FAILED:', err);
    process.exit(1);
  });
