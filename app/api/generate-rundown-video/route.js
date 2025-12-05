import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import { createRundownVideo } from '@/lib/video-processor';
import { getSelectionSegments } from '@/lib/transcription';

/**
 * Generate a video from rundown clips with selected word segments
 * POST /api/generate-rundown-video
 * Body: { gamePk, clips: [{ videoUrl, transcript, selectedWords }] }
 */
export async function POST(request) {
  try {
    const { gamePk, clips } = await request.json();

    if (!gamePk) {
      return NextResponse.json(
        { error: 'gamePk is required' },
        { status: 400 }
      );
    }

    if (!clips || clips.length === 0) {
      return NextResponse.json(
        { error: 'At least one clip is required' },
        { status: 400 }
      );
    }

    console.log(`Generating rundown video for game ${gamePk} with ${clips.length} clips`);

    // Convert clips with word selections to clips with time segments
    const clipsWithSegments = clips.map(clip => {
      const segments = getSelectionSegments(
        clip.transcript,
        clip.selectedWords,
        0.15 // 150ms buffer around words
      );

      return {
        videoUrl: clip.videoUrl,
        segments
      };
    }).filter(clip => clip.segments.length > 0);

    if (clipsWithSegments.length === 0) {
      return NextResponse.json(
        { error: 'No clips with valid segments' },
        { status: 400 }
      );
    }

    // Generate the video
    const videoPath = await createRundownVideo(clipsWithSegments, gamePk);

    // Read the video file and return as base64
    const videoBuffer = await fs.readFile(videoPath);
    const videoBase64 = videoBuffer.toString('base64');

    // Cleanup the temp file
    await fs.unlink(videoPath).catch(() => {});

    console.log(`Video generated successfully: ${videoPath}`);

    return NextResponse.json({
      success: true,
      gamePk,
      clipCount: clipsWithSegments.length,
      videoUrl: `data:video/mp4;base64,${videoBase64}`
    });
  } catch (error) {
    console.error('Rundown video generation error:', error);
    return NextResponse.json(
      { error: 'Video generation failed', details: error.message },
      { status: 500 }
    );
  }
}
