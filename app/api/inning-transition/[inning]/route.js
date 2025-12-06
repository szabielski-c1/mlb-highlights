import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

/**
 * Serve inning transition video files
 * GET /api/inning-transition/top-1
 * GET /api/inning-transition/bot-4
 */
export async function GET(request, { params }) {
  try {
    const { inning } = await params;

    // Validate inning format (top-1 through top-9, bot-1 through bot-9)
    const validPattern = /^(top|bot)-[1-9]$/;
    if (!validPattern.test(inning)) {
      return NextResponse.json(
        { error: 'Invalid inning format. Use top-1 through top-9 or bot-1 through bot-9' },
        { status: 400 }
      );
    }

    const videoPath = path.join(process.cwd(), 'innings', `${inning}.mp4`);

    // Check if file exists
    try {
      await fs.access(videoPath);
    } catch {
      return NextResponse.json(
        { error: `Transition video not found: ${inning}` },
        { status: 404 }
      );
    }

    // Read the video file
    const videoBuffer = await fs.readFile(videoPath);

    // Return video with proper headers
    return new NextResponse(videoBuffer, {
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Length': videoBuffer.length.toString(),
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (error) {
    console.error('Error serving inning transition:', error);
    return NextResponse.json(
      { error: 'Failed to serve transition video' },
      { status: 500 }
    );
  }
}
