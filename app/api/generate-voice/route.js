import { NextResponse } from 'next/server';
import { generateSpeech, ANNOUNCER_VOICES, getRecommendedVoice, DEFAULT_VOICE_ID } from '@/lib/elevenlabs';

export async function POST(request) {
  try {
    const { script, voiceId, style } = await request.json();

    if (!script) {
      return NextResponse.json(
        { error: 'Script text is required' },
        { status: 400 }
      );
    }

    // Use provided voiceId or get default
    const selectedVoiceId = voiceId || DEFAULT_VOICE_ID;

    // Generate audio
    const audioBuffer = await generateSpeech(script, selectedVoiceId, style || 'excited');

    // Return audio as base64 for client-side playback
    const base64Audio = audioBuffer.toString('base64');

    return NextResponse.json({
      audio: base64Audio,
      format: 'mp3',
      voiceId: selectedVoiceId,
    });
  } catch (error) {
    console.error('Error generating voice:', error);
    return NextResponse.json(
      { error: 'Failed to generate voice', details: error.message },
      { status: 500 }
    );
  }
}

// GET endpoint to list available voices
export async function GET() {
  return NextResponse.json({
    voices: ANNOUNCER_VOICES,
    defaultVoiceId: DEFAULT_VOICE_ID,
  });
}
