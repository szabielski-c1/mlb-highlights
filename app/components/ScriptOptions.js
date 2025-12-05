'use client';

import { SCRIPT_STYLES, SCRIPT_LENGTHS } from '@/lib/script-config';

export default function ScriptOptions({ style, length, onStyleChange, onLengthChange }) {
  return (
    <div className="space-y-6">
      {/* Style Selection */}
      <div>
        <label className="block text-sm font-medium text-gray-400 mb-3">
          Announcer Style
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {SCRIPT_STYLES.map((s) => (
            <button
              key={s.id}
              onClick={() => onStyleChange(s.id)}
              className={`p-4 rounded-xl border-2 transition-all text-left ${
                style === s.id
                  ? 'border-mlb-red bg-mlb-red/10'
                  : 'border-white/10 bg-mlb-charcoal hover:border-white/20'
              }`}
            >
              <div className="text-2xl mb-2">{s.icon}</div>
              <div className="font-semibold text-white">{s.name}</div>
              <div className="text-xs text-gray-400 mt-1">{s.description}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Length Selection */}
      <div>
        <label className="block text-sm font-medium text-gray-400 mb-3">
          Script Length
        </label>
        <div className="flex gap-2">
          {SCRIPT_LENGTHS.map((l) => (
            <button
              key={l.id}
              onClick={() => onLengthChange(l.id)}
              className={`flex-1 py-3 px-4 rounded-xl border-2 transition-all ${
                length === l.id
                  ? 'border-mlb-red bg-mlb-red/10'
                  : 'border-white/10 bg-mlb-charcoal hover:border-white/20'
              }`}
            >
              <div className="font-semibold text-white">{l.name}</div>
              <div className="text-xs text-gray-400">~{l.words} words</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
