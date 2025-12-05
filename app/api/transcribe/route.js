import { NextResponse } from 'next/server';
import { transcribeVideo, cleanupTranscriptionFiles } from '@/lib/transcription';

/**
 * Transcribe audio from a video URL
 * POST /api/transcribe
 * Body: { videoUrl, clipId? }
 * Returns: { words: [{ word, start, end, confidence }], duration }
 */
export async function POST(request) {
  let videoPath = null;
  let audioPath = null;

  try {
    const { videoUrl, clipId } = await request.json();

    if (!videoUrl) {
      return NextResponse.json(
        { error: 'videoUrl is required' },
        { status: 400 }
      );
    }

    console.log(`Transcribing video: ${clipId || 'unknown'}`, videoUrl.substring(0, 100));

    const result = await transcribeVideo(videoUrl);

    // Store paths for cleanup
    videoPath = result.videoPath;
    audioPath = result.audioPath;

    console.log(`Transcription complete: ${result.words.length} words, ${result.duration.toFixed(2)}s`);

    return NextResponse.json({
      success: true,
      clipId,
      words: result.words,
      duration: result.duration,
      wordCount: result.words.length
    });
  } catch (error) {
    console.error('Transcription error:', error);
    return NextResponse.json(
      { error: 'Transcription failed', details: error.message },
      { status: 500 }
    );
  } finally {
    // Clean up temp files
    if (videoPath || audioPath) {
      await cleanupTranscriptionFiles(videoPath, audioPath);
    }
  }
}
