'use client';

import { useState } from 'react';
import TranscriptEditor from './TranscriptEditor';

/**
 * Individual clip card in the rundown editor
 * Shows play info, video preview, and transcript editor
 */
export default function ClipCard({
  clip,
  index,
  onSelectionChange,
  onRemove,
  onFeedChange,
  isTranscribing = false,
  error = null
}) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);

  const {
    id,
    activeVideoUrl,
    videoUrl,
    feedType = 'NETWORK',
    availableFeeds = [],
    batter,
    result,
    inning,
    transcript = [],
    selectedWords = [],
    duration = 0
  } = clip;

  // Use active feed URL, fallback to videoUrl
  const displayVideoUrl = activeVideoUrl || videoUrl;

  // Calculate selected duration
  const selectedDuration = calculateSelectedDuration(transcript, selectedWords);

  return (
    <div className="bg-gray-800 rounded-lg overflow-hidden border border-gray-700">
      {/* Header - always visible */}
      <div
        className="flex items-center gap-3 p-3 cursor-pointer hover:bg-gray-700/50"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {/* Index badge */}
        <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-sm font-bold shrink-0">
          {index + 1}
        </div>

        {/* Play info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium truncate">
              {batter || 'Unknown Batter'}
            </span>
            {/* Feed selector - shows available feeds for this clip */}
            {availableFeeds.length > 0 && (
              <select
                value={feedType}
                onChange={(e) => {
                  e.stopPropagation();
                  onFeedChange?.(id, e.target.value);
                }}
                onClick={(e) => e.stopPropagation()}
                className={`px-1.5 py-0.5 text-xs font-medium rounded cursor-pointer border-0 ${
                  feedType === 'NETWORK'
                    ? 'bg-purple-500/20 text-purple-400'
                    : feedType === 'CMS'
                    ? 'bg-green-500/20 text-green-400'
                    : feedType === 'HOME'
                    ? 'bg-blue-500/20 text-blue-400'
                    : 'bg-orange-500/20 text-orange-400'
                }`}
              >
                {availableFeeds.map(feed => (
                  <option key={feed} value={feed}>{feed}</option>
                ))}
              </select>
            )}
          </div>
          <div className="text-sm text-gray-400 truncate">
            {result || 'Play'} {inning ? `- Inning ${inning}` : ''}
          </div>
        </div>

        {/* Duration indicator */}
        <div className="text-right shrink-0">
          {isTranscribing ? (
            <div className="text-yellow-400 text-sm animate-pulse">
              Transcribing...
            </div>
          ) : transcript.length > 0 ? (
            <>
              <div className="text-green-400 font-mono text-sm">
                {selectedDuration.toFixed(1)}s
              </div>
              <div className="text-gray-500 text-xs">
                / {duration.toFixed(1)}s
              </div>
            </>
          ) : error ? (
            <div className="text-red-400 text-sm">
              Error
            </div>
          ) : (
            <div className="text-gray-500 text-sm">
              Pending
            </div>
          )}
        </div>

        {/* Expand/collapse icon */}
        <svg
          className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>

        {/* Remove button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove?.(id);
          }}
          className="p-1 hover:bg-red-500/20 rounded text-gray-500 hover:text-red-400"
          title="Remove clip"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div className="border-t border-gray-700 p-4 space-y-4">
          {/* Video preview - using raw broadcast feed */}
          {displayVideoUrl && (
            <div className="relative aspect-video bg-black rounded-lg overflow-hidden max-w-md">
              <video
                src={displayVideoUrl.includes('/api/video-proxy') ? displayVideoUrl : `/api/video-proxy?url=${encodeURIComponent(displayVideoUrl)}`}
                className="w-full h-full object-contain"
                controls
                preload="metadata"
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onEnded={() => setIsPlaying(false)}
              />
            </div>
          )}

          {/* Error message */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Transcribing indicator */}
          {isTranscribing && (
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
              <div className="flex items-center gap-3">
                <div className="animate-spin rounded-full h-5 w-5 border-2 border-yellow-500 border-t-transparent" />
                <div>
                  <div className="text-yellow-400 font-medium">Transcribing audio...</div>
                  <div className="text-yellow-400/70 text-sm">This may take 10-30 seconds</div>
                </div>
              </div>
            </div>
          )}

          {/* Transcript editor */}
          {transcript.length > 0 && (
            <TranscriptEditor
              words={transcript}
              selectedIndices={selectedWords}
              onSelectionChange={(indices) => onSelectionChange?.(id, indices)}
              duration={duration}
              disabled={isTranscribing}
            />
          )}

          {/* No transcript yet */}
          {!isTranscribing && !error && transcript.length === 0 && (
            <div className="text-gray-500 text-sm italic">
              Transcript will appear here after analysis
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Calculate total duration of selected words
 */
function calculateSelectedDuration(words, selectedIndices) {
  if (!selectedIndices || selectedIndices.length === 0 || !words.length) {
    return 0;
  }

  const sorted = [...selectedIndices].sort((a, b) => a - b);
  let totalDuration = 0;
  let rangeStart = null;
  let rangeEnd = null;
  let prevIdx = null;

  for (const idx of sorted) {
    const word = words[idx];
    if (!word) continue;

    if (rangeStart === null) {
      rangeStart = word.start;
      rangeEnd = word.end;
      prevIdx = idx;
    } else if (idx === prevIdx + 1) {
      rangeEnd = word.end;
      prevIdx = idx;
    } else {
      totalDuration += rangeEnd - rangeStart;
      rangeStart = word.start;
      rangeEnd = word.end;
      prevIdx = idx;
    }
  }

  if (rangeStart !== null) {
    totalDuration += rangeEnd - rangeStart;
  }

  return totalDuration;
}
