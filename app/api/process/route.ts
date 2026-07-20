import { NextRequest, NextResponse } from 'next/server';
import { processImagePipeline } from '@/lib/imageProcessor';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const stripMetadata = formData.get('stripMetadata') !== 'false';
    const disruptSignals = formData.get('disruptSignals') !== 'false';
    const removeVisibleBadge = formData.get('removeVisibleBadge') !== 'false';
    const format = (formData.get('format') as 'jpeg' | 'png' | 'webp') || 'png';

    if (!file) {
      return NextResponse.json(
        { error: 'No image file provided in request payload.' },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const inputBuffer = Buffer.from(arrayBuffer);

    // Run Sharp image pipeline
    const { buffer: processedBuffer, telemetry } = await processImagePipeline(inputBuffer, {
      stripMetadata,
      disruptSignals,
      removeVisibleBadge,
      targetFormat: format,
      quality: 95,
    });

    const base64Image = `data:image/${format};base64,${processedBuffer.toString('base64')}`;

    return NextResponse.json({
      success: true,
      filename: file.name,
      format,
      base64Image,
      telemetry,
    });
  } catch (error: any) {
    console.error('Local Processing Error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to process image locally.' },
      { status: 500 }
    );
  }
}
