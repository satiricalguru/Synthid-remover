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

  // Step 1: Create a test image with high-entropy gradients and synthetic EXIF tags
  const width = 400;
  const height = 400;

  // Create radial gradient pattern
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

  const originalInput = await sharp(rawSvg)
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

  console.log(`[SETUP] Generated mock test image (${width}x${height}px, ${(originalInput.length / 1024).toFixed(1)} KB)`);

  const initialScan = scanBufferProvenance(originalInput);
  console.log(`[SETUP] Initial provenance scan: EXIF=${initialScan.exifFound}, C2PA=${initialScan.c2paFound}, Clean=${initialScan.clean}`);

  if (initialScan.clean) {
    throw new Error('Test setup error: initial mock image was expected to contain EXIF metadata.');
  }

  const testModes = ['metadata-only', 'balanced', 'aggressive'];
  const results = [];

  for (const mode of testModes) {
    console.log(`\n--- Testing Mode: ${mode.toUpperCase()} ---`);

    const result = await processImagePipeline(originalInput, {
      disruptionMode: mode,
      disruptionStrength: 75,
      stripMetadata: true,
      targetFormat: 'png',
    });

    const audit = result.telemetry.provenanceAudit;
    const { mse, psnr } = await calculatePSNR(originalInput, result.buffer);

    console.log(`  ⏱️ Execution time: ${result.telemetry.executionTimeMs} ms`);
    console.log(`  📦 Output size: ${(result.buffer.length / 1024).toFixed(1)} KB`);
    console.log(`  🔍 Byte-level Audit: C2PA=${audit.c2paFound ? 'FOUND' : 'CLEAN'}, EXIF=${audit.exifFound ? 'FOUND' : 'CLEAN'}, XMP=${audit.xmpFound ? 'FOUND' : 'CLEAN'}`);
    console.log(`  📊 Measured PSNR: ${psnr === Infinity ? 'Infinity (Lossless)' : psnr.toFixed(2) + ' dB'} (MSE: ${mse.toFixed(2)})`);

    // Assertions
    if (!audit.clean) {
      throw new Error(`[ASSERTION FAILED] Mode '${mode}' did not produce a clean byte container! Detected: C2PA=${audit.c2paFound}, EXIF=${audit.exifFound}, XMP=${audit.xmpFound}`);
    }

    if (mode === 'metadata-only' && psnr < 45) {
      throw new Error(`[ASSERTION FAILED] Metadata-only mode caused visual drift (PSNR: ${psnr.toFixed(2)} dB, expected >= 45 dB)`);
    }

    if (mode === 'balanced' && psnr < 34) {
      throw new Error(`[ASSERTION FAILED] Balanced mode visual drift exceeded threshold (PSNR: ${psnr.toFixed(2)} dB, expected >= 34 dB)`);
    }

    if (mode === 'aggressive' && psnr < 30) {
      throw new Error(`[ASSERTION FAILED] Aggressive mode visual drift exceeded threshold (PSNR: ${psnr.toFixed(2)} dB, expected >= 30 dB)`);
    }

    results.push({
      mode,
      auditClean: audit.clean,
      psnr: psnr === Infinity ? 'Infinity (Lossless)' : psnr.toFixed(2) + ' dB',
      timeMs: result.telemetry.executionTimeMs,
    });
  }

  console.log('\n====================================================');
  console.log('✅ ALL PIPELINE & AUDIT ASSERTIONS PASSED');
  console.log('====================================================');
  console.table(results);
}

runVerificationSuite()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n❌ VERIFICATION SUITE FAILED:', err);
    process.exit(1);
  });
