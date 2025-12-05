'use client';

// Default voice ID
const DEFAULT_VOICE_ID = 'yl2ZDV1MzN4HbQJbMihG';

// Curated voices for sports announcing (matches lib/elevenlabs.js)
const ANNOUNCER_VOICES = [
  {
    id: 'yl2ZDV1MzN4HbQJbMihG',
    name: 'Sports Announcer',
    description: 'Dynamic sports broadcasting voice',
    style: 'default',
    isDefault: true,
  },
  {
    id: 'pNInz6obpgDQGcFmaJgB',
    name: 'Adam',
    description: 'Deep, authoritative male voice',
    style: 'professional',
  },
  {
    id: 'ErXwobaYiN019PkySvjV',
    name: 'Antoni',
    description: 'Warm, engaging male voice',
    style: 'excited',
  },
  {
    id: 'VR6AewLTigWG4xSOukaG',
    name: 'Arnold',
    description: 'Bold, dramatic male voice',
    style: 'dramatic',
  },
  {
    id: 'TxGEqnHWrfWFTfGW9XjX',
    name: 'Josh',
    description: 'Young, energetic male voice',
    style: 'casual',
  },
  {
    id: '21m00Tcm4TlvDq8ikWAM',
    name: 'Rachel',
    description: 'Clear, professional female voice',
    style: 'analytical',
  },
];

export default function VoiceOptions({ selectedVoice, onVoiceChange, scriptStyle }) {
  // Default voice is always recommended

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium text-gray-400">
          Announcer Voice
        </label>
        <span className="text-xs text-gray-500">
          Powered by ElevenLabs
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {ANNOUNCER_VOICES.map((voice) => {
          const isDefault = voice.id === DEFAULT_VOICE_ID;
          const isSelected = selectedVoice === voice.id;

          return (
            <button
              key={voice.id}
              onClick={() => onVoiceChange(voice.id)}
              className={`relative p-4 rounded-xl border-2 transition-all text-left ${
                isSelected
                  ? 'border-mlb-red bg-mlb-red/10'
                  : 'border-white/10 bg-mlb-charcoal hover:border-white/20'
              }`}
            >
              {isDefault && (
                <span className="absolute -top-2 -right-2 px-2 py-0.5 text-xs font-bold bg-mlb-green text-white rounded-full">
                  Default
                </span>
              )}

              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  isSelected ? 'bg-mlb-red' : 'bg-white/10'
                }`}>
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </svg>
                </div>
                <div>
                  <div className="font-semibold text-white">{voice.name}</div>
                  <div className="text-xs text-gray-400">{voice.description}</div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
