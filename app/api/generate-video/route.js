import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import { createHighlightPackage, cleanupTempFiles } from '@/lib/video-processor';
import { generateSpeech, DEFAULT_VOICE_ID } from '@/lib/elevenlabs';

export async function POST(request) {
  let gamePk = null;

  try {
    const { script, keyPlays, highlights, voiceId, style, gamePk: gPk } = await request.json();
    gamePk = gPk;

    if (!script) {
      return NextResponse.json(
        { error: 'Script is required' },
        { status: 400 }
      );
    }

    // Build video clips from matched key plays (preferred) or fall back to highlights
    let videoClips = [];

    // First try: Use matched highlights from key plays
    if (keyPlays && keyPlays.length > 0) {
      videoClips = keyPlays
        .filter(play => play.matchedHighlight?.videoUrl)
        .map(play => ({
          videoUrl: play.matchedHighlight.videoUrl,
          headline: play.matchedHighlight.headline || play.result?.description,
          event: play.result?.event,
        }));
    }

    // Fall back to general highlights if no matched clips
    if (videoClips.length === 0 && highlights && highlights.length > 0) {
      videoClips = highlights
        .filter(h => h.videoUrl && h.isInGameHighlight)
        .slice(0, 5)
        .map(h => ({
          videoUrl: h.videoUrl,
          headline: h.headline,
        }));
    }

    if (videoClips.length === 0) {
      return NextResponse.json(
        { error: 'No video clips available for this game' },
        { status: 400 }
      );
    }

    // Generate voice narration
    const selectedVoiceId = voiceId || DEFAULT_VOICE_ID;
    const audioBuffer = await generateSpeech(script, selectedVoiceId, style || 'excited');

    // Create video package using the matched clips
    const videoPath = await createHighlightPackage(videoClips, audioBuffer, gamePk);

    // Read final video
    const videoBuffer = await fs.readFile(videoPath);
    const base64Video = videoBuffer.toString('base64');

    // Clean up
    await cleanupTempFiles(gamePk);

    return NextResponse.json({
      video: base64Video,
      format: 'mp4',
      clipsUsed: videoClips.length,
    });
  } catch (error) {
    console.error('Error generating video:', error);

    // Clean up on error
    if (gamePk) {
      await cleanupTempFiles(gamePk);
    }

    return NextResponse.json(
      { error: 'Failed to generate video', details: error.message },
      { status: 500 }
    );
  }
}
