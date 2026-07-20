import { NextRequest, NextResponse } from 'next/server';
import { applyInpaintMask, stripMetadata, disruptEmbeddedSignals } from '@/lib/imageProcessor';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const imageFile = formData.get('image') as File | null;
    const maskFile = formData.get('mask') as File | null;

    if (!imageFile || !maskFile) {
      return NextResponse.json(
        { error: 'Both original image and binary brush mask are required.' },
        { status: 400 }
      );
    }

    const imageBuffer = Buffer.from(await imageFile.arrayBuffer());
    const maskBuffer = Buffer.from(await maskFile.arrayBuffer());

    const startTime = Date.now();
    const logs: string[] = [];

    logs.push(`[INPAINT] Received image (${(imageBuffer.length / 1024).toFixed(1)} KB) & brush mask`);
    logs.push(`[INPAINT] Analyzing painted region stencil...`);

    // Apply canvas visual inpainting patch
    let inpaintedBuffer = await applyInpaintMask(imageBuffer, maskBuffer);
    logs.push(`[INPAINT] Reconstructed underlying visual details via spatial neighborhood blending.`);

    // Wipe metadata as standard baseline
    inpaintedBuffer = await stripMetadata(inpaintedBuffer);
    logs.push(`[SUCCESS] Wiped C2PA Content Credentials & EXIF headers.`);

    // Optional SynthID signal disruption post-inpaint
    inpaintedBuffer = await disruptEmbeddedSignals(inpaintedBuffer, 'webp', 95);
    logs.push(`[SUCCESS] Disrupting frequency signals on final composite.`);

    const executionTimeMs = Date.now() - startTime;
    const base64Image = `data:image/webp;base64,${inpaintedBuffer.toString('base64')}`;

    return NextResponse.json({
      success: true,
      filename: imageFile.name,
      base64Image,
      telemetry: {
        originalSize: imageBuffer.length,
        processedSize: inpaintedBuffer.length,
        executionTimeMs,
        logs,
      },
    });
  } catch (error: any) {
    console.error('Inpaint Error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to execute visual inpainting.' },
      { status: 500 }
    );
  }
}
