'use client';

import { useState, useCallback, useRef, useEffect } from 'react';

/**
 * Descript-like transcript editor with word-level selection
 * Users can click words to toggle inclusion, shift+click for range selection
 */
export default function TranscriptEditor({
  words = [],
  selectedIndices = [],
  onSelectionChange,
  duration = 0,
  disabled = false
}) {
  const [lastClickedIndex, setLastClickedIndex] = useState(null);
  const containerRef = useRef(null);

  // Calculate selected duration
  const selectedDuration = calculateSelectedDuration(words, selectedIndices);

  // Handle word click
  const handleWordClick = useCallback((index, e) => {
    if (disabled) return;

    const newSelection = new Set(selectedIndices);

    if (e.shiftKey && lastClickedIndex !== null) {
      // Range selection
      const start = Math.min(lastClickedIndex, index);
      const end = Math.max(lastClickedIndex, index);

      // Check if we're adding or removing the range
      const isAdding = !newSelection.has(index);

      for (let i = start; i <= end; i++) {
        if (isAdding) {
          newSelection.add(i);
        } else {
          newSelection.delete(i);
        }
      }
    } else {
      // Toggle single word
      if (newSelection.has(index)) {
        newSelection.delete(index);
      } else {
        newSelection.add(index);
      }
    }

    setLastClickedIndex(index);
    onSelectionChange([...newSelection].sort((a, b) => a - b));
  }, [selectedIndices, lastClickedIndex, onSelectionChange, disabled]);

  // Handle select all / deselect all
  const handleSelectAll = useCallback(() => {
    if (disabled) return;
    onSelectionChange(words.map((_, i) => i));
  }, [words, onSelectionChange, disabled]);

  const handleDeselectAll = useCallback(() => {
    if (disabled) return;
    onSelectionChange([]);
  }, [onSelectionChange, disabled]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (disabled) return;

      // Cmd/Ctrl + A to select all
      if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
        e.preventDefault();
        handleSelectAll();
      }

      // Escape to deselect all
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

  // Group words into sentences/phrases for better readability
  const wordElements = words.map((word, index) => {
    const isSelected = selectedIndices.includes(index);
    const isFirstSelected = isSelected && !selectedIndices.includes(index - 1);
    const isLastSelected = isSelected && !selectedIndices.includes(index + 1);

    return (
      <span
        key={index}
        onClick={(e) => handleWordClick(index, e)}
        className={`
          inline cursor-pointer select-none transition-all duration-100
          ${isSelected
            ? 'bg-green-500/30 text-white'
            : 'text-gray-400 line-through decoration-gray-600 hover:text-gray-300 hover:bg-gray-700/30'
          }
          ${isFirstSelected ? 'rounded-l pl-1' : ''}
          ${isLastSelected ? 'rounded-r pr-1' : ''}
          ${disabled ? 'cursor-not-allowed opacity-50' : ''}
        `}
        title={`${word.start.toFixed(2)}s - ${word.end.toFixed(2)}s`}
      >
        {word.word}
        {' '}
      </span>
    );
  });

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
            {selectedIndices.length} / {words.length} words selected
          </span>
          <span className="text-gray-500">|</span>
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
        </div>
      </div>

      {/* Instructions */}
      <p className="text-xs text-gray-500 mb-3">
        Click words to toggle. Shift+click for range. Green = included, strikethrough = excluded.
      </p>

      {/* Transcript text */}
      <div className="bg-gray-800/50 rounded-lg p-4 leading-relaxed text-lg font-serif">
        {words.length > 0 ? (
          wordElements
        ) : (
          <span className="text-gray-500 italic">No transcript available</span>
        )}
      </div>
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
      // Consecutive word
      rangeEnd = word.end;
      prevIdx = idx;
    } else {
      // Non-consecutive - save range and start new one
      totalDuration += rangeEnd - rangeStart;
      rangeStart = word.start;
      rangeEnd = word.end;
      prevIdx = idx;
    }
  }

  // Add final range
  if (rangeStart !== null) {
    totalDuration += rangeEnd - rangeStart;
  }

  return totalDuration;
}
