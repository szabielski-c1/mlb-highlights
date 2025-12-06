import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { createRundownVideo } from '@/lib/video-processor';
import { getSelectionSegments } from '@/lib/transcription';

/**
 * Generate a video from rundown clips with selected word segments
 * POST /api/generate-rundown-video
 * Body: { gamePk, clips: [{ videoUrl, transcript, selectedWords } | { isTransition, transitionKey }] }
 */
export async function POST(request) {
  try {
    const { gamePk, clips, titleCardUrl } = await request.json();

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

    // Count transitions and plays
    const transitionCount = clips.filter(c => c.isTransition).length;
    const playCount = clips.filter(c => !c.isTransition).length;
    console.log(`Generating rundown video for game ${gamePk} with ${playCount} plays + ${transitionCount} transitions${titleCardUrl ? ' + title card' : ''}`);

    // Convert clips with word selections to clips with time segments
    // Also handle transition clips (which don't need segment processing)
    const clipsWithSegments = [];

    for (const clip of clips) {
      // Handle transition clips
      if (clip.isTransition && clip.transitionKey) {
        const transitionPath = path.join(process.cwd(), 'innings', `${clip.transitionKey}.mp4`);

        // Verify the transition file exists
        try {
          await fs.access(transitionPath);
          clipsWithSegments.push({
            isTransition: true,
            transitionPath: transitionPath
          });
        } catch {
          console.warn(`Transition file not found: ${clip.transitionKey}.mp4, skipping`);
        }
        continue;
      }

      // Handle regular play clips
      if (clip.transcript && clip.selectedWords) {
        const segments = getSelectionSegments(
          clip.transcript,
          clip.selectedWords,
          0.15 // 150ms buffer around words
        );

        if (segments.length > 0) {
          clipsWithSegments.push({
            videoUrl: clip.videoUrl,
            segments
          });
        }
      }
    }

    // Must have at least one play clip (transitions alone aren't valid)
    if (clipsWithSegments.filter(c => !c.isTransition).length === 0) {
      return NextResponse.json(
        { error: 'No clips with valid segments' },
        { status: 400 }
      );
    }

    // Generate the video (with optional title card)
    const videoPath = await createRundownVideo(clipsWithSegments, gamePk, titleCardUrl);

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
