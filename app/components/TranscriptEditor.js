'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';

const GAP_THRESHOLD = 0.3; // Minimum gap to show indicator (seconds)
const GAP_UNIT = 0.3; // Each "_" represents 0.3 seconds

/**
 * Build a unified list of segments (words and gaps) from the word list
 * Each segment has: type ('word' | 'gap'), start, end, content, originalIndex (for words)
 * @param {Array} words - Array of word objects with start/end times
 * @param {number} totalDuration - Total duration of the clip in seconds
 */
function buildSegments(words, totalDuration = 0) {
  if (!words || words.length === 0) return [];

  const segments = [];

  // Helper to add gap segments
  const addGapSegments = (gapStart, gapEnd) => {
    const gapDuration = gapEnd - gapStart;
    if (gapDuration >= GAP_THRESHOLD) {
      const underscoreCount = Math.max(1, Math.round(gapDuration / GAP_UNIT));
      let currentStart = gapStart;

      for (let i = 0; i < underscoreCount; i++) {
        const currentEnd = Math.min(currentStart + GAP_UNIT, gapEnd);
        segments.push({
          type: 'gap',
          start: currentStart,
          end: currentEnd,
          content: '_',
          duration: currentEnd - currentStart,
          segmentIndex: segments.length
        });
        currentStart = currentEnd;
      }
    }
  };

  // Check for gap at the beginning (before first word)
  if (words.length > 0 && words[0].start >= GAP_THRESHOLD) {
    addGapSegments(0, words[0].start);
  }

  words.forEach((word, index) => {
    // Check for gap before this word (between words)
    if (index > 0) {
      const prevWord = words[index - 1];
      addGapSegments(prevWord.end, word.start);
    }

    segments.push({
      type: 'word',
      start: word.start,
      end: word.end,
      content: word.word,
      originalIndex: index,
      segmentIndex: segments.length
    });
  });

  // Check for gap at the end (after last word)
  if (words.length > 0 && totalDuration > 0) {
    const lastWord = words[words.length - 1];
    if (totalDuration - lastWord.end >= GAP_THRESHOLD) {
      addGapSegments(lastWord.end, totalDuration);
    }
  }

  return segments;
}

/**
 * Convert segment indices to original word indices (for backward compatibility)
 * Also includes gap time ranges
 */
function segmentIndicesToWordIndices(segments, selectedSegmentIndices) {
  const wordIndices = [];
  for (const segIdx of selectedSegmentIndices) {
    const seg = segments[segIdx];
    if (seg && seg.type === 'word') {
      wordIndices.push(seg.originalIndex);
    }
  }
  return wordIndices.sort((a, b) => a - b);
}

/**
 * Convert original word indices to segment indices
 */
function wordIndicesToSegmentIndices(segments, wordIndices) {
  const wordIndexSet = new Set(wordIndices);
  const segmentIndices = [];

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (seg.type === 'word' && wordIndexSet.has(seg.originalIndex)) {
      segmentIndices.push(i);
    }
  }

  return segmentIndices;
}

/**
 * Calculate total duration of selected segments
 */
function calculateSelectedDuration(segments, selectedSegmentIndices) {
  if (!selectedSegmentIndices || selectedSegmentIndices.length === 0 || !segments.length) {
    return 0;
  }

  const sorted = [...selectedSegmentIndices].sort((a, b) => a - b);
  let totalDuration = 0;
  let rangeStart = null;
  let rangeEnd = null;
  let prevIdx = null;

  for (const idx of sorted) {
    const seg = segments[idx];
    if (!seg) continue;

    if (rangeStart === null) {
      rangeStart = seg.start;
      rangeEnd = seg.end;
      prevIdx = idx;
    } else if (idx === prevIdx + 1) {
      // Consecutive segment
      rangeEnd = seg.end;
      prevIdx = idx;
    } else {
      // Non-consecutive - save range and start new one
      totalDuration += rangeEnd - rangeStart;
      rangeStart = seg.start;
      rangeEnd = seg.end;
      prevIdx = idx;
    }
  }

  // Add final range
  if (rangeStart !== null) {
    totalDuration += rangeEnd - rangeStart;
  }

  return totalDuration;
}

/**
 * Descript-like transcript editor with word-level selection
 * Users can:
 * - Click and drag to select words AND gaps (like highlighting in Word)
 * - Click word/gap to toggle inclusion
 * - Shift+click for range selection
 */
export default function TranscriptEditor({
  words = [],
  selectedIndices = [], // These are WORD indices (for backward compatibility)
  selectedSegmentIndicesProp = null, // Optional: segment indices (includes gaps)
  onSelectionChange,
  duration = 0,
  disabled = false,
  onPlaySelected = null,
  isPlaying = false,
  onRetranscribe = null // Callback to trigger re-transcription
}) {
  const [lastClickedIndex, setLastClickedIndex] = useState(null);
  const containerRef = useRef(null);

  // Drag selection state
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState(null);
  const [dragEnd, setDragEnd] = useState(null);
  const [dragMode, setDragMode] = useState('add');

  // Build segments (words + gaps) - pass duration for start/end gaps
  const segments = useMemo(() => buildSegments(words, duration), [words, duration]);

  // Track selected SEGMENT indices internally (includes gaps)
  // Initialize from segment indices prop if available, otherwise from word indices
  const [selectedSegmentIndices, setSelectedSegmentIndices] = useState(() =>
    selectedSegmentIndicesProp && selectedSegmentIndicesProp.length > 0
      ? selectedSegmentIndicesProp
      : wordIndicesToSegmentIndices(segments, selectedIndices)
  );

  // Sync when selectedSegmentIndicesProp changes (prefer this over word indices)
  useEffect(() => {
    if (selectedSegmentIndicesProp && selectedSegmentIndicesProp.length > 0) {
      setSelectedSegmentIndices(selectedSegmentIndicesProp);
    } else if (selectedIndices && selectedIndices.length > 0) {
      // Fallback: convert from word indices if no segment indices provided
      setSelectedSegmentIndices(wordIndicesToSegmentIndices(segments, selectedIndices));
    }
  }, [selectedSegmentIndicesProp, selectedIndices, segments]);

  // Calculate selected duration from segments
  const selectedDuration = useMemo(() =>
    calculateSelectedDuration(segments, selectedSegmentIndices),
    [segments, selectedSegmentIndices]
  );

  // Get the effective selection (including drag preview)
  const getEffectiveSelection = useCallback(() => {
    if (!isDragging || dragStart === null || dragEnd === null) {
      return new Set(selectedSegmentIndices);
    }

    const newSelection = new Set(selectedSegmentIndices);
    const start = Math.min(dragStart, dragEnd);
    const end = Math.max(dragStart, dragEnd);

    for (let i = start; i <= end; i++) {
      if (dragMode === 'add') {
        newSelection.add(i);
      } else {
        newSelection.delete(i);
      }
    }

    return newSelection;
  }, [isDragging, dragStart, dragEnd, dragMode, selectedSegmentIndices]);

  // Notify parent of selection changes (convert back to word indices for compatibility)
  const notifySelectionChange = useCallback((newSegmentIndices) => {
    setSelectedSegmentIndices(newSegmentIndices);
    // For the parent, we need to communicate the time ranges, not just word indices
    // But for backward compatibility, we also send word indices
    const wordIndices = segmentIndicesToWordIndices(segments, newSegmentIndices);
    onSelectionChange(wordIndices, newSegmentIndices, segments);
  }, [segments, onSelectionChange]);

  // Handle mouse down on a segment (start drag)
  const handleMouseDown = useCallback((index, e) => {
    if (disabled || e.button !== 0) return;

    e.preventDefault();

    const isCurrentlySelected = selectedSegmentIndices.includes(index);

    setIsDragging(true);
    setDragStart(index);
    setDragEnd(index);
    setDragMode(isCurrentlySelected ? 'remove' : 'add');
  }, [disabled, selectedSegmentIndices]);

  // Handle mouse enter on a segment (extend drag)
  const handleMouseEnter = useCallback((index) => {
    if (!isDragging) return;
    setDragEnd(index);
  }, [isDragging]);

  // Handle mouse up (finish drag)
  const handleMouseUp = useCallback(() => {
    if (!isDragging) return;

    if (dragStart !== null && dragEnd !== null) {
      const newSelection = new Set(selectedSegmentIndices);
      const start = Math.min(dragStart, dragEnd);
      const end = Math.max(dragStart, dragEnd);

      for (let i = start; i <= end; i++) {
        if (dragMode === 'add') {
          newSelection.add(i);
        } else {
          newSelection.delete(i);
        }
      }

      setLastClickedIndex(dragEnd);
      notifySelectionChange([...newSelection].sort((a, b) => a - b));
    }

    setIsDragging(false);
    setDragStart(null);
    setDragEnd(null);
  }, [isDragging, dragStart, dragEnd, dragMode, selectedSegmentIndices, notifySelectionChange]);

  // Handle click (for shift+click)
  const handleClick = useCallback((index, e) => {
    if (disabled) return;

    if (dragStart !== null && dragEnd !== null && dragStart !== dragEnd) {
      return;
    }

    const newSelection = new Set(selectedSegmentIndices);

    if (e.shiftKey && lastClickedIndex !== null) {
      const start = Math.min(lastClickedIndex, index);
      const end = Math.max(lastClickedIndex, index);
      const isAdding = !newSelection.has(index);

      for (let i = start; i <= end; i++) {
        if (isAdding) {
          newSelection.add(i);
        } else {
          newSelection.delete(i);
        }
      }

      setLastClickedIndex(index);
      notifySelectionChange([...newSelection].sort((a, b) => a - b));
    }
  }, [selectedSegmentIndices, lastClickedIndex, notifySelectionChange, disabled, dragStart, dragEnd]);

  // Global mouse up listener
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (isDragging) {
        handleMouseUp();
      }
    };

    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, [isDragging, handleMouseUp]);

  // Handle select all / deselect all
  const handleSelectAll = useCallback(() => {
    if (disabled) return;
    notifySelectionChange(segments.map((_, i) => i));
  }, [segments, notifySelectionChange, disabled]);

  const handleDeselectAll = useCallback(() => {
    if (disabled) return;
    notifySelectionChange([]);
  }, [notifySelectionChange, disabled]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (disabled) return;

      if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
        e.preventDefault();
        handleSelectAll();
      }

      if (e.key === 'Escape') {
        handleDeselectAll();
      }
    };

    const container = containerRef.current;
    if (container) {
      container.addEventListener('keydown', handleKeyDown);
      return () => container.removeEventListener('keydown', handleKeyDown);
    }
  }, [disabled, handleSelectAll, handleDeselectAll]);

  // Get the effective selection for rendering
  const effectiveSelection = getEffectiveSelection();

  // Build elements
  const segmentElements = segments.map((segment, index) => {
    const isSelected = effectiveSelection.has(index);
    const isFirstSelected = isSelected && !effectiveSelection.has(index - 1);
    const isLastSelected = isSelected && !effectiveSelection.has(index + 1);

    const isInDragRange = isDragging && dragStart !== null && dragEnd !== null &&
      index >= Math.min(dragStart, dragEnd) && index <= Math.max(dragStart, dragEnd);

    if (segment.type === 'gap') {
      return (
        <span
          key={`gap-${index}`}
          onMouseDown={(e) => handleMouseDown(index, e)}
          onMouseEnter={() => handleMouseEnter(index)}
          onClick={(e) => handleClick(index, e)}
          className={`
            inline cursor-pointer select-none transition-all duration-75 mx-0.5
            ${isSelected
              ? 'bg-green-500/30 text-green-400'
              : 'text-gray-600 hover:text-gray-400 hover:bg-gray-700/30'
            }
            ${isInDragRange ? 'ring-2 ring-blue-400/50' : ''}
            ${isFirstSelected ? 'rounded-l pl-1' : ''}
            ${isLastSelected ? 'rounded-r pr-1' : ''}
            ${disabled ? 'cursor-not-allowed opacity-50' : ''}
          `}
          title={`${segment.duration.toFixed(1)}s silence`}
        >
          {segment.content}
          {' '}
        </span>
      );
    }

    return (
      <span
        key={`word-${index}`}
        onMouseDown={(e) => handleMouseDown(index, e)}
        onMouseEnter={() => handleMouseEnter(index)}
        onClick={(e) => handleClick(index, e)}
        className={`
          inline cursor-pointer select-none transition-all duration-75
          ${isSelected
            ? 'bg-green-500/30 text-white'
            : 'text-gray-400 line-through decoration-gray-600 hover:text-gray-300 hover:bg-gray-700/30'
          }
          ${isInDragRange ? 'ring-2 ring-blue-400/50' : ''}
          ${isFirstSelected ? 'rounded-l pl-1' : ''}
          ${isLastSelected ? 'rounded-r pr-1' : ''}
          ${disabled ? 'cursor-not-allowed opacity-50' : ''}
        `}
        title={`${segment.start.toFixed(2)}s - ${segment.end.toFixed(2)}s`}
      >
        {segment.content}
        {' '}
      </span>
    );
  });

  // Count words selected (not gaps)
  const wordsSelected = selectedSegmentIndices.filter(i => segments[i]?.type === 'word').length;
  const totalWords = segments.filter(s => s.type === 'word').length;

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      className="outline-none"
    >
      {/* Header with stats and controls */}
      <div className="flex items-center justify-between mb-3 text-sm">
        <div className="flex items-center gap-4">
          <span className="text-gray-400">
            {wordsSelected} / {totalWords} words selected
          </span>
          <span className="text-gray-500">|</span>
          {onPlaySelected && selectedSegmentIndices.length > 0 && (
            <button
              onClick={onPlaySelected}
              disabled={disabled}
              className="p-1 hover:bg-green-500/20 rounded transition-colors disabled:opacity-50"
              title={isPlaying ? "Playing selected..." : "Play selected segments"}
            >
              {isPlaying ? (
                <svg className="w-4 h-4 text-green-400" fill="currentColor" viewBox="0 0 24 24">
                  <rect x="6" y="4" width="4" height="16" />
                  <rect x="14" y="4" width="4" height="16" />
                </svg>
              ) : (
                <svg className="w-4 h-4 text-green-400" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>
          )}
          <span className="text-green-400">
            {selectedDuration.toFixed(1)}s selected
          </span>
          <span className="text-gray-500">
            / {duration.toFixed(1)}s total
          </span>
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleSelectAll}
            disabled={disabled}
            className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded disabled:opacity-50"
          >
            Select All
          </button>
          <button
            onClick={handleDeselectAll}
            disabled={disabled}
            className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded disabled:opacity-50"
          >
            Clear
          </button>
          {onRetranscribe && (
            <button
              onClick={onRetranscribe}
              disabled={disabled}
              className="p-1 text-xs bg-gray-700 hover:bg-gray-600 rounded disabled:opacity-50"
              title="Re-transcribe (clear cache)"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Instructions */}
      <p className="text-xs text-gray-500 mb-3">
        Drag to select. Click to toggle. Shift+click for range. Green = included, strikethrough = excluded. _ = silence (0.5s each)
      </p>

      {/* Transcript text */}
      <div
        className="bg-gray-800/50 rounded-lg p-4 leading-relaxed text-lg font-serif"
      >
        {segments.length > 0 ? (
          segmentElements
        ) : (
          <span className="text-gray-500 italic">No transcript available</span>
        )}
      </div>
    </div>
  );
}
