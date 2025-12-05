// ElevenLabs API helper for voice generation
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';

// Initialize client - will use ELEVENLABS_API_KEY from env
const getClient = () => {
  if (!process.env.ELEVENLABS_API_KEY) {
    throw new Error('ELEVENLABS_API_KEY environment variable is required');
  }
  return new ElevenLabsClient({
    apiKey: process.env.ELEVENLABS_API_KEY,
  });
};

// Default voice ID
export const DEFAULT_VOICE_ID = 'yl2ZDV1MzN4HbQJbMihG';

// Curated voices good for sports announcing
export const ANNOUNCER_VOICES = [
  {
    id: 'yl2ZDV1MzN4HbQJbMihG', // Default - user's preferred voice
    name: 'Sports Announcer',
    description: 'Dynamic sports broadcasting voice',
    style: 'default',
    isDefault: true,
  },
  {
    id: 'pNInz6obpgDQGcFmaJgB', // Adam - deep, authoritative
    name: 'Adam',
    description: 'Deep, authoritative male voice',
    style: 'professional',
  },
  {
    id: 'ErXwobaYiN019PkySvjV', // Antoni - warm, engaging
    name: 'Antoni',
    description: 'Warm, engaging male voice',
    style: 'excited',
  },
  {
    id: 'VR6AewLTigWG4xSOukaG', // Arnold - bold, dramatic
    name: 'Arnold',
    description: 'Bold, dramatic male voice',
    style: 'dramatic',
  },
  {
    id: 'TxGEqnHWrfWFTfGW9XjX', // Josh - young, energetic
    name: 'Josh',
    description: 'Young, energetic male voice',
    style: 'casual',
  },
  {
    id: '21m00Tcm4TlvDq8ikWAM', // Rachel - clear, professional
    name: 'Rachel',
    description: 'Clear, professional female voice',
    style: 'analytical',
  },
];

// Voice settings optimized for sports broadcasting
export const VOICE_SETTINGS = {
  excited: {
    stability: 0.3, // Lower = more expressive
    similarity_boost: 0.8,
    style: 0.7, // Higher = more stylized
    use_speaker_boost: true,
  },
  analytical: {
    stability: 0.7, // Higher = more consistent
    similarity_boost: 0.75,
    style: 0.3,
    use_speaker_boost: true,
  },
  casual: {
    stability: 0.5,
    similarity_boost: 0.75,
    style: 0.5,
    use_speaker_boost: true,
  },
};

/**
 * Generate speech from text using ElevenLabs
 * @param {string} text - The script text to convert to speech
 * @param {string} voiceId - ElevenLabs voice ID
 * @param {string} style - Script style (excited/analytical/casual)
 * @returns {Promise<Buffer>} - Audio buffer (MP3)
 */
export async function generateSpeech(text, voiceId, style = 'excited') {
  const client = getClient();
  const settings = VOICE_SETTINGS[style] || VOICE_SETTINGS.excited;

  try {
    const audioStream = await client.textToSpeech.convert(voiceId, {
      text,
      model_id: 'eleven_turbo_v2_5', // Fast, high quality
      voice_settings: settings,
    });

    // Collect stream into buffer
    const chunks = [];
    for await (const chunk of audioStream) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  } catch (error) {
    console.error('ElevenLabs API error:', error);
    throw new Error(`Failed to generate speech: ${error.message}`);
  }
}

/**
 * Get available voices from ElevenLabs
 * @returns {Promise<Array>} - List of available voices
 */
export async function getVoices() {
  const client = getClient();

  try {
    const response = await client.voices.getAll();
    return response.voices;
  } catch (error) {
    console.error('Failed to fetch voices:', error);
    // Return curated voices as fallback
    return ANNOUNCER_VOICES;
  }
}

/**
 * Get voice recommendation based on script style
 * @param {string} style - Script style (excited/analytical/casual)
 * @returns {object} - Recommended voice
 */
export function getRecommendedVoice(style) {
  // Always return the default voice as the recommendation
  return ANNOUNCER_VOICES.find(v => v.id === DEFAULT_VOICE_ID) || ANNOUNCER_VOICES[0];
}
