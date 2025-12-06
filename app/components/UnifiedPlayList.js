'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import TranscriptEditor from './TranscriptEditor';

/**
 * Determine if an at-bat is a key play (highlight-worthy)
 * Returns a score (higher = more important) or 0 if not suggested
 */
function getHighlightScore(ab) {
  let score = 0;

  // Home runs are always highlights
  if (ab.result === 'Home Run') {
    score += 100;
    if (ab.rbi >= 3) score += 50; // Grand slam or 3-run HR
  }

  // Scoring plays
  if (ab.isScoring) {
    score += 30;
    score += (ab.rbi || 0) * 10;
  }

  // Extra base hits
  if (ab.result === 'Triple') score += 40;
  if (ab.result === 'Double') score += 20;

  // Late game situations (7th inning or later)
  if (ab.inning >= 7) {
    score *= 1.5;
  }

  // Game-ending at-bats
  if (ab.isGameEnding) {
    score += 80;
  }

  // Big win probability swings
  if (ab.winProbabilityAdded && Math.abs(ab.winProbabilityAdded) > 0.15) {
    score += Math.abs(ab.winProbabilityAdded) * 100;
  }

  return score;
}

/**
 * Get suggested/key at-bats for highlights
 */
function getKeyAtBats(atBats, maxCount = 8) {
  if (!atBats || atBats.length === 0) return [];

  const scored = atBats
    .map(ab => ({ ab, score: getHighlightScore(ab) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, maxCount).map(({ ab }) => ab);
}

/**
 * Create a unique key for an at-bat
 */
function getAtBatKey(ab) {
  return `${ab.batter.id}-${ab.inning}-${ab.halfInning}-${ab.playIndex}`;
}

/**
 * Cache key for transcriptions based on video URL
 */
function getTranscriptCacheKey(videoUrl) {
  return `transcript_${videoUrl}`;
}

/**
 * Get cached transcription from localStorage
 */
function getCachedTranscript(videoUrl) {
  if (typeof window === 'undefined') return null;
  try {
    const cached = localStorage.getItem(getTranscriptCacheKey(videoUrl));
    if (cached) {
      const data = JSON.parse(cached);
      // Cache entries expire after 7 days
      if (data.timestamp && Date.now() - data.timestamp < 7 * 24 * 60 * 60 * 1000) {
        return data;
      }
      // Remove expired cache
      localStorage.removeItem(getTranscriptCacheKey(videoUrl));
    }
  } catch (e) {
    console.error('Error reading transcript cache:', e);
  }
  return null;
}

/**
 * Save transcription to localStorage cache
 */
function cacheTranscript(videoUrl, words, duration) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(getTranscriptCacheKey(videoUrl), JSON.stringify({
      words,
      duration,
      timestamp: Date.now()
    }));
  } catch (e) {
    console.error('Error saving transcript cache:', e);
    // If localStorage is full, try to clear old transcripts
    try {
      const keys = Object.keys(localStorage).filter(k => k.startsWith('transcript_'));
      if (keys.length > 50) {
        // Remove oldest half
        keys.slice(0, 25).forEach(k => localStorage.removeItem(k));
      }
    } catch (e2) {
      // Ignore cleanup errors
    }
  }
}

/**
 * Clear cached transcription for a video URL
 */
function clearTranscriptCache(videoUrl) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(getTranscriptCacheKey(videoUrl));
    console.log('Cleared transcript cache for:', videoUrl.substring(0, 60));
  } catch (e) {
    console.error('Error clearing transcript cache:', e);
  }
}

/**
 * Get cache key for rundown state (selected plays, transitions, word selections)
 */
function getRundownCacheKey(gamePk) {
  return `rundown_${gamePk}`;
}

/**
 * Get cached rundown state from localStorage
 */
function getCachedRundownState(gamePk) {
  if (typeof window === 'undefined') return null;
  try {
    const cached = localStorage.getItem(getRundownCacheKey(gamePk));
    if (cached) {
      const data = JSON.parse(cached);
      // Cache entries expire after 7 days
      if (data.timestamp && Date.now() - data.timestamp < 7 * 24 * 60 * 60 * 1000) {
        console.log('Restored rundown state from cache for game:', gamePk);
        return data;
      }
      // Remove expired cache
      localStorage.removeItem(getRundownCacheKey(gamePk));
    }
  } catch (e) {
    console.error('Error reading rundown cache:', e);
  }
  return null;
}

/**
 * Save rundown state to localStorage cache
 */
function cacheRundownState(gamePk, selectedKeys, activeTransitions, transcriptData) {
  if (typeof window === 'undefined') return;
  try {
    // Only cache the essential data from transcriptData (not the full transcript words)
    const minimalTranscriptData = {};
    for (const [key, data] of Object.entries(transcriptData)) {
      if (data.selectedWords?.length > 0 || data.feedType) {
        minimalTranscriptData[key] = {
          feedType: data.feedType,
          selectedWords: data.selectedWords,
          selectedSegmentIndices: data.selectedSegmentIndices,
          // We don't store transcript/segments - those are in the transcript cache
        };
      }
    }

    localStorage.setItem(getRundownCacheKey(gamePk), JSON.stringify({
      selectedKeys: Array.from(selectedKeys),
      activeTransitions,
      transcriptData: minimalTranscriptData,
      timestamp: Date.now()
    }));
  } catch (e) {
    console.error('Error saving rundown cache:', e);
  }
}

/**
 * Clear cached rundown state for a game
 */
function clearRundownCache(gamePk) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(getRundownCacheKey(gamePk));
    console.log('Cleared rundown cache for game:', gamePk);
  } catch (e) {
    console.error('Error clearing rundown cache:', e);
  }
}

/**
 * Get the video URL for the selected feed type
 * Defaults to NETWORK (longer broadcast clips)
 */
function getVideoUrlForFeed(videoData, feedType = 'NETWORK') {
  if (!videoData?.clip) return null;
  const clip = videoData.clip;

  if (feedType === 'NETWORK' && clip.networkVideoUrl) return clip.networkVideoUrl;
  if (feedType === 'CMS' && clip.cmsVideoUrl) return clip.cmsVideoUrl;
  if (feedType === 'HOME' && clip.homeVideoUrl) return clip.homeVideoUrl;
  if (feedType === 'AWAY' && clip.awayVideoUrl) return clip.awayVideoUrl;

  // Fallback chain
  return clip.networkVideoUrl || clip.cmsVideoUrl || clip.homeVideoUrl || clip.awayVideoUrl || clip.videoUrl;
}

/**
 * Get list of available feeds for a clip
 */
function getAvailableFeeds(videoData) {
  if (!videoData?.clip) return [];
  const clip = videoData.clip;
  const feeds = [];
  if (clip.networkVideoUrl) feeds.push('NETWORK');
  if (clip.cmsVideoUrl) feeds.push('CMS');
  if (clip.homeVideoUrl) feeds.push('HOME');
  if (clip.awayVideoUrl) feeds.push('AWAY');
  return feeds;
}

/**
 * Determine which team benefits from the play result
 * Returns 'offense' if batter's team benefits, 'defense' if pitcher's team benefits
 */
function getPlayBeneficiary(result) {
  // Offensive success - batter's team benefits
  const offensiveResults = [
    'Home Run', 'Triple', 'Double', 'Single',
    'Walk', 'Hit By Pitch', 'Intent Walk',
    'Sac Fly', 'Sac Bunt', 'Fielders Choice'
  ];

  // Defensive success - pitcher's team benefits
  const defensiveResults = [
    'Strikeout', 'Strikeout - DP',
    'Groundout', 'Flyout', 'Lineout', 'Pop Out',
    'Forceout', 'Double Play', 'Triple Play',
    'Grounded Into DP', 'Fielders Choice Out'
  ];

  if (offensiveResults.some(r => result?.includes(r))) {
    return 'offense';
  }
  if (defensiveResults.some(r => result?.includes(r))) {
    return 'defense';
  }

  // Default to offense for unknown results (likely something good happened)
  return 'offense';
}

/**
 * Get the preferred feed for a play based on which team benefits
 * @param {object} ab - The at-bat data
 * @param {object} videoData - The video data with available feeds
 * @returns {string} - The preferred feed type
 */
function getPreferredFeed(ab, videoData) {
  const availableFeeds = getAvailableFeeds(videoData);

  // Determine which team benefits from this play
  const beneficiary = getPlayBeneficiary(ab.result);

  // In top of inning, away team bats (offense), home team pitches (defense)
  // In bottom of inning, home team bats (offense), away team pitches (defense)
  const isTopInning = ab.halfInning === 'top';

  let preferredFeed;
  if (beneficiary === 'offense') {
    // Batter's team benefits - use their feed
    preferredFeed = isTopInning ? 'AWAY' : 'HOME';
  } else {
    // Pitcher's team benefits - use their feed
    preferredFeed = isTopInning ? 'HOME' : 'AWAY';
  }

  // Use preferred feed if available
  if (availableFeeds.includes(preferredFeed)) {
    return preferredFeed;
  }

  // Fallback: try the other team's feed
  const alternateFeed = preferredFeed === 'HOME' ? 'AWAY' : 'HOME';
  if (availableFeeds.includes(alternateFeed)) {
    return alternateFeed;
  }

  // Last resort: NETWORK then CMS
  if (availableFeeds.includes('NETWORK')) return 'NETWORK';
  if (availableFeeds.includes('CMS')) return 'CMS';

  // Return first available
  return availableFeeds[0] || 'NETWORK';
}

/**
 * Calculate total duration of selected words
 */
function calculateSelectedDuration(words, selectedIndices) {
  if (!selectedIndices || selectedIndices.length === 0 || !words?.length) {
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

/**
 * UnifiedPlayList - Single list of plays with key plays visible, others collapsible
 * Key plays are pre-selected and shown by default
 * Non-key plays hidden behind expandable sections per inning
 * Includes inline transcription and video preview - this IS the rundown editor
 */
export default function UnifiedPlayList({ atBats, gamePk, titleCardUrl }) {
  const [selectedKeys, setSelectedKeys] = useState(new Set());
  const [expandedSections, setExpandedSections] = useState(new Set());
  const [loadingVideo, setLoadingVideo] = useState({});
  const [videoCache, setVideoCache] = useState({});
  const [isInitializing, setIsInitializing] = useState(true);

  // Transcription state per play: { transcript, selectedWords, isTranscribing, duration, error, feedType }
  const [transcriptData, setTranscriptData] = useState({});

  // Video generation state
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState(null);
  const [finalVideoUrl, setFinalVideoUrl] = useState(null);

  // Inning transition state - tracks which transitions are active
  // Key: "top-1", "bot-4", etc. Value: true/false
  const [activeTransitions, setActiveTransitions] = useState({});


  // Video refs and playback state for preview
  const videoRefs = useRef({});
  const [playingKey, setPlayingKey] = useState(null); // Which clip is currently playing selected segments
  const playbackIntervalRef = useRef(null);

  // Get key at-bats on mount
  const keyAtBats = getKeyAtBats(atBats);
  const keyAtBatKeys = new Set(keyAtBats.map(getAtBatKey));

  // Group at-bats by half-inning
  const groupedByInning = {};
  (atBats || []).forEach(ab => {
    const key = `${ab.halfInning === 'top' ? 'Top' : 'Bot'} ${ab.inning}`;
    if (!groupedByInning[key]) {
      groupedByInning[key] = { label: key, inning: ab.inning, halfInning: ab.halfInning, plays: [] };
    }
    groupedByInning[key].plays.push(ab);
  });

  // Sort innings chronologically
  const sortedInnings = Object.values(groupedByInning).sort((a, b) => {
    if (a.inning !== b.inning) return a.inning - b.inning;
    return a.halfInning === 'top' ? -1 : 1;
  });

  // Get transition key for an inning (e.g., "top-4", "bot-1")
  const getTransitionKey = (halfInning, inning) => {
    return `${halfInning === 'top' ? 'top' : 'bot'}-${inning}`;
  };

  // Toggle inning transition
  const toggleTransition = (transitionKey) => {
    setActiveTransitions(prev => ({
      ...prev,
      [transitionKey]: !prev[transitionKey]
    }));
  };

  // Auto-activate transitions for innings that have selected plays
  // Transitions follow the selection state of plays in that inning (unless manually overridden)
  useEffect(() => {
    setActiveTransitions(prev => {
      const updated = { ...prev };
      let hasChanges = false;

      sortedInnings.forEach(inningGroup => {
        const transitionKey = getTransitionKey(inningGroup.halfInning, inningGroup.inning);
        const hasSelectedPlays = inningGroup.plays.some(ab => selectedKeys.has(getAtBatKey(ab)));

        // Auto-set transitions to match whether inning has selected plays
        // This means selecting a play auto-enables the transition,
        // and deselecting all plays in an inning auto-disables it
        if (updated[transitionKey] !== hasSelectedPlays) {
          updated[transitionKey] = hasSelectedPlays;
          hasChanges = true;
        }
      });

      return hasChanges ? updated : prev;
    });
  }, [selectedKeys, sortedInnings]);

  // Fetch video for an at-bat
  const fetchVideo = useCallback(async (ab) => {
    const cacheKey = getAtBatKey(ab);

    if (videoCache[cacheKey]) {
      return videoCache[cacheKey];
    }

    setLoadingVideo(prev => ({ ...prev, [cacheKey]: true }));

    try {
      const response = await fetch(`/api/game/${gamePk}/atbat-video`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ab.filmRoomParams),
      });

      const data = await response.json();
      setVideoCache(prev => ({ ...prev, [cacheKey]: data }));
      return data;
    } catch (error) {
      console.error('Error fetching video:', error);
      return null;
    } finally {
      setLoadingVideo(prev => ({ ...prev, [cacheKey]: false }));
    }
  }, [gamePk, videoCache]);

  // Track in-flight transcription requests to prevent duplicates
  const transcribingRef = useRef(new Set());

  // Transcribe a clip (checks cache first)
  const transcribeClip = useCallback(async (key, videoUrl) => {
    if (!videoUrl) return;

    // Prevent duplicate requests
    if (transcribingRef.current.has(videoUrl)) {
      console.log(`Already transcribing: ${videoUrl.substring(0, 60)}...`);
      return;
    }

    // Check cache first
    const cached = getCachedTranscript(videoUrl);
    if (cached) {
      console.log(`Using cached transcript for ${key} (${cached.words.length} words)`);
      setTranscriptData(prev => {
        const existing = prev[key] || {};
        // Preserve existing word selections if they exist (from rundown cache)
        const hasExistingSelection = existing.selectedWords?.length > 0;
        return {
          ...prev,
          [key]: {
            ...existing,
            transcript: cached.words,
            // Use existing selection if present, otherwise select all
            selectedWords: hasExistingSelection ? existing.selectedWords : cached.words.map((_, i) => i),
            duration: cached.duration,
            isTranscribing: false,
            error: null
          }
        };
      });
      return;
    }

    // Mark as in-flight
    transcribingRef.current.add(videoUrl);

    // Mark as transcribing
    setTranscriptData(prev => ({
      ...prev,
      [key]: { ...prev[key], isTranscribing: true, error: null }
    }));

    try {
      const response = await fetch('/api/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoUrl, clipId: key })
      });

      const result = await response.json();

      if (result.success) {
        // Cache the result
        cacheTranscript(videoUrl, result.words, result.duration);

        setTranscriptData(prev => {
          const existing = prev[key] || {};
          // Preserve existing word selections if they exist (from rundown cache)
          const hasExistingSelection = existing.selectedWords?.length > 0;
          return {
            ...prev,
            [key]: {
              ...existing,
              transcript: result.words,
              // Use existing selection if present, otherwise select all
              selectedWords: hasExistingSelection ? existing.selectedWords : result.words.map((_, i) => i),
              duration: result.duration,
              isTranscribing: false,
              error: null
            }
          };
        });
      } else {
        setTranscriptData(prev => ({
          ...prev,
          [key]: {
            ...prev[key],
            isTranscribing: false,
            error: result.error || 'Transcription failed'
          }
        }));
      }
    } catch (err) {
      setTranscriptData(prev => ({
        ...prev,
        [key]: {
          ...prev[key],
          isTranscribing: false,
          error: err.message
        }
      }));
    } finally {
      // Remove from in-flight tracking
      transcribingRef.current.delete(videoUrl);
    }
  }, []);

  // Handle feed type change for a specific clip
  const handleFeedChange = useCallback((key, newFeedType) => {
    setTranscriptData(prev => ({
      ...prev,
      [key]: {
        ...prev[key],
        feedType: newFeedType,
        // Clear transcript when feed changes - will need re-transcription
        transcript: [],
        selectedWords: [],
        duration: 0,
        isTranscribing: false,
        error: null
      }
    }));
    // Re-transcribe with new feed
    const videoData = videoCache[key];
    const newVideoUrl = getVideoUrlForFeed(videoData, newFeedType);
    if (newVideoUrl) {
      transcribeClip(key, newVideoUrl);
    }
  }, [videoCache, transcribeClip]);

  // Handle word selection change for a clip
  // Now receives: wordIndices, segmentIndices, segments (from TranscriptEditor)
  const handleWordSelectionChange = useCallback((key, wordIndices, segmentIndices, segments) => {
    setTranscriptData(prev => ({
      ...prev,
      [key]: {
        ...prev[key],
        selectedWords: wordIndices,
        selectedSegmentIndices: segmentIndices,
        segments: segments
      }
    }));
  }, []);

  // Handle retranscribe request - clear cache and re-transcribe
  const handleRetranscribe = useCallback((key, videoUrl) => {
    clearTranscriptCache(videoUrl);
    // Clear local state
    setTranscriptData(prev => ({
      ...prev,
      [key]: { ...prev[key], transcript: [], isTranscribing: false, error: null, selectedWords: [], selectedSegmentIndices: null, segments: null }
    }));
    // Re-transcribe
    transcribeClip(key, videoUrl);
  }, [transcribeClip]);

  // Get time ranges from selected segment indices
  const getTimeRangesFromSelection = useCallback((segments, selectedSegmentIndices) => {
    if (!selectedSegmentIndices || selectedSegmentIndices.length === 0 || !segments?.length) {
      return [];
    }

    const sorted = [...selectedSegmentIndices].sort((a, b) => a - b);
    const ranges = [];
    let currentStart = null;
    let currentEnd = null;
    let prevIdx = null;

    for (const idx of sorted) {
      const seg = segments[idx];
      if (!seg) continue;

      if (currentStart === null) {
        currentStart = Math.max(0, seg.start - 0.05); // Small buffer
        currentEnd = seg.end + 0.05;
        prevIdx = idx;
      } else if (idx === prevIdx + 1) {
        // Consecutive segment
        currentEnd = seg.end + 0.05;
        prevIdx = idx;
      } else {
        // Gap - save range and start new one
        ranges.push({ start: currentStart, end: currentEnd });
        currentStart = Math.max(0, seg.start - 0.05);
        currentEnd = seg.end + 0.05;
        prevIdx = idx;
      }
    }

    if (currentStart !== null) {
      ranges.push({ start: currentStart, end: currentEnd });
    }

    return ranges;
  }, []);

  // Play selected segments for a clip
  const handlePlaySelected = useCallback((key) => {
    const video = videoRefs.current[key];
    const tData = transcriptData[key];

    // Check if we have segments and segment indices (new format) or fall back to words
    const hasSegmentData = tData?.segments?.length > 0 && tData?.selectedSegmentIndices?.length > 0;
    const hasWordData = tData?.transcript?.length > 0 && tData?.selectedWords?.length > 0;

    if (!video || (!hasSegmentData && !hasWordData)) {
      return;
    }

    // If already playing this clip, stop it
    if (playingKey === key) {
      video.pause();
      setPlayingKey(null);
      if (playbackIntervalRef.current) {
        clearInterval(playbackIntervalRef.current);
        playbackIntervalRef.current = null;
      }
      return;
    }

    // Stop any other playing clip
    if (playingKey && videoRefs.current[playingKey]) {
      videoRefs.current[playingKey].pause();
    }
    if (playbackIntervalRef.current) {
      clearInterval(playbackIntervalRef.current);
    }

    // Get time ranges to play - prefer segment data if available
    const timeRanges = hasSegmentData
      ? getTimeRangesFromSelection(tData.segments, tData.selectedSegmentIndices)
      : getTimeRangesFromSelection(
          tData.transcript.map((w, i) => ({ start: w.start, end: w.end, type: 'word' })),
          tData.selectedWords
        );

    if (timeRanges.length === 0) return;

    let currentRangeIndex = 0;

    // Start playing first range
    video.currentTime = timeRanges[0].start;
    video.play();
    setPlayingKey(key);

    // Monitor playback and skip to next range when current one ends
    playbackIntervalRef.current = setInterval(() => {
      const currentRange = timeRanges[currentRangeIndex];

      if (video.currentTime >= currentRange.end) {
        currentRangeIndex++;

        if (currentRangeIndex < timeRanges.length) {
          // Jump to next range
          video.currentTime = timeRanges[currentRangeIndex].start;
        } else {
          // All ranges done
          video.pause();
          setPlayingKey(null);
          clearInterval(playbackIntervalRef.current);
          playbackIntervalRef.current = null;
        }
      }
    }, 50); // Check every 50ms

    // Also handle video ending or pausing manually
    const handleEnded = () => {
      setPlayingKey(null);
      if (playbackIntervalRef.current) {
        clearInterval(playbackIntervalRef.current);
        playbackIntervalRef.current = null;
      }
    };

    video.addEventListener('ended', handleEnded, { once: true });
    video.addEventListener('pause', () => {
      // Only clear if we're the active player
      if (playingKey === key) {
        setPlayingKey(null);
        if (playbackIntervalRef.current) {
          clearInterval(playbackIntervalRef.current);
          playbackIntervalRef.current = null;
        }
      }
    }, { once: true });
  }, [transcriptData, playingKey, getTimeRangesFromSelection]);

  // Initialize: check cache first, otherwise fetch videos for key plays
  useEffect(() => {
    const initializeFromCacheOrKeyPlays = async () => {
      setIsInitializing(true);

      // Check if we have cached rundown state for this game
      const cachedState = getCachedRundownState(gamePk);

      if (cachedState) {
        // Restore from cache
        console.log('Restoring rundown from cache:', {
          selectedCount: cachedState.selectedKeys?.length,
          transitionsCount: Object.keys(cachedState.activeTransitions || {}).length
        });

        // Restore selected keys
        setSelectedKeys(new Set(cachedState.selectedKeys || []));

        // Restore active transitions
        setActiveTransitions(cachedState.activeTransitions || {});

        // Fetch videos for all cached selected plays
        const toTranscribe = [];
        for (const selectedKey of (cachedState.selectedKeys || [])) {
          // Find the at-bat matching this key
          const ab = atBats.find(a => getAtBatKey(a) === selectedKey);
          if (!ab) continue;

          const videoData = await fetchVideo(ab);
          if (videoData?.found) {
            const cachedTranscriptInfo = cachedState.transcriptData?.[selectedKey];
            const preferredFeed = cachedTranscriptInfo?.feedType || getPreferredFeed(ab, videoData);
            const videoUrl = getVideoUrlForFeed(videoData, preferredFeed);

            if (videoUrl) {
              toTranscribe.push({ key: selectedKey, videoUrl });
              // Initialize with cached word selections
              setTranscriptData(prev => ({
                ...prev,
                [selectedKey]: {
                  transcript: [],
                  selectedWords: cachedTranscriptInfo?.selectedWords || [],
                  selectedSegmentIndices: cachedTranscriptInfo?.selectedSegmentIndices,
                  duration: 0,
                  isTranscribing: false,
                  error: null,
                  feedType: preferredFeed
                }
              }));
            }
          }
        }

        setIsInitializing(false);

        // Transcribe all clips (will use transcript cache, then merge word selections)
        for (const { key, videoUrl } of toTranscribe) {
          await transcribeClip(key, videoUrl);
        }
      } else {
        // No cache - initialize with key plays as default
        const newSelected = new Set();
        const toTranscribe = [];

        for (const ab of keyAtBats) {
          const key = getAtBatKey(ab);
          const videoData = await fetchVideo(ab);
          if (videoData?.found) {
            newSelected.add(key);
            // Use preferred feed based on which team benefits from the play
            const preferredFeed = getPreferredFeed(ab, videoData);
            const videoUrl = getVideoUrlForFeed(videoData, preferredFeed);
            if (videoUrl) {
              toTranscribe.push({ key, videoUrl });
              // Initialize transcript data for this key
              setTranscriptData(prev => ({
                ...prev,
                [key]: {
                  transcript: [],
                  selectedWords: [],
                  duration: 0,
                  isTranscribing: false,
                  error: null,
                  feedType: preferredFeed
                }
              }));
            }
          }
        }

        setSelectedKeys(newSelected);
        setIsInitializing(false);

        // Start transcription for all key plays (sequentially to avoid overwhelming API)
        for (const { key, videoUrl } of toTranscribe) {
          await transcribeClip(key, videoUrl);
        }
      }
    };

    if (atBats?.length > 0) {
      initializeFromCacheOrKeyPlays();
    }
  }, [atBats, gamePk]); // Only run on atBats/gamePk change

  // Auto-save rundown state to cache whenever it changes
  useEffect(() => {
    // Don't save during initialization
    if (isInitializing) return;

    // Don't save if we have no selections (might be initial load)
    if (selectedKeys.size === 0 && Object.keys(activeTransitions).length === 0) return;

    // Debounce saving to avoid excessive writes
    const timeoutId = setTimeout(() => {
      cacheRundownState(gamePk, selectedKeys, activeTransitions, transcriptData);
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [gamePk, selectedKeys, activeTransitions, transcriptData, isInitializing]);

  // Toggle play selection
  const toggleSelection = async (ab) => {
    const key = getAtBatKey(ab);
    const isSelected = selectedKeys.has(key);

    if (isSelected) {
      // Deselect - remove from selectedKeys but keep transcript data
      setSelectedKeys(prev => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    } else {
      // Select - fetch video if not cached, then start transcription
      const videoData = await fetchVideo(ab);
      if (videoData?.found) {
        setSelectedKeys(prev => new Set(prev).add(key));

        // Use preferred feed based on which team benefits from the play
        const preferredFeed = getPreferredFeed(ab, videoData);
        const videoUrl = getVideoUrlForFeed(videoData, preferredFeed);
        if (videoUrl && !transcriptData[key]?.transcript?.length) {
          setTranscriptData(prev => ({
            ...prev,
            [key]: {
              transcript: [],
              selectedWords: [],
              duration: 0,
              isTranscribing: false,
              error: null,
              feedType: preferredFeed
            }
          }));
          transcribeClip(key, videoUrl);
        }
      }
    }
  };

  // Toggle section expansion
  const toggleSection = (sectionKey) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(sectionKey)) {
        next.delete(sectionKey);
      } else {
        next.add(sectionKey);
      }
      return next;
    });
  };

  // Get result styling
  const getResultColor = (result) => {
    if (['Home Run', 'Triple', 'Double'].includes(result)) return 'text-green-400';
    if (result === 'Single') return 'text-green-300';
    if (result === 'Strikeout') return 'text-red-400';
    if (['Walk', 'Hit By Pitch'].includes(result)) return 'text-blue-400';
    return 'text-gray-400';
  };

  const getResultIcon = (result) => {
    if (result === 'Home Run') return '💣';
    if (result === 'Triple') return '3️⃣';
    if (result === 'Double') return '2️⃣';
    if (result === 'Single') return '1️⃣';
    if (result === 'Strikeout') return 'K';
    if (result === 'Walk') return 'BB';
    return '•';
  };

  // Generate final video from selected plays
  const handleGenerateVideo = useCallback(async () => {
    setIsGenerating(true);
    setGenerationError(null);

    try {
      // Build clips in order: for each inning with selected plays,
      // add transition (if active) then add the plays
      const clipsForGeneration = [];

      // Group selected plays by inning for proper ordering
      const selectedByInning = {};
      atBats
        .filter(ab => selectedKeys.has(getAtBatKey(ab)))
        .forEach(ab => {
          const inningKey = `${ab.halfInning}-${ab.inning}`;
          if (!selectedByInning[inningKey]) {
            selectedByInning[inningKey] = { halfInning: ab.halfInning, inning: ab.inning, plays: [] };
          }
          selectedByInning[inningKey].plays.push(ab);
        });

      // Sort innings chronologically
      const sortedInningKeys = Object.keys(selectedByInning).sort((a, b) => {
        const [halfA, innA] = a.split('-');
        const [halfB, innB] = b.split('-');
        if (parseInt(innA) !== parseInt(innB)) return parseInt(innA) - parseInt(innB);
        return halfA === 'top' ? -1 : 1;
      });

      // Build the final clip list with transitions
      for (const inningKey of sortedInningKeys) {
        const { halfInning, inning, plays } = selectedByInning[inningKey];
        const transitionKey = getTransitionKey(halfInning, inning);

        // Add transition clip if active
        if (activeTransitions[transitionKey]) {
          clipsForGeneration.push({
            id: `transition-${transitionKey}`,
            isTransition: true,
            transitionKey: transitionKey
          });
        }

        // Add the plays
        for (const ab of plays) {
          const key = getAtBatKey(ab);
          const video = videoCache[key];
          const tData = transcriptData[key] || {};
          const feedType = tData.feedType || getPreferredFeed(ab, video);
          const videoUrl = getVideoUrlForFeed(video, feedType);

          if (tData.selectedWords?.length > 0) {
            clipsForGeneration.push({
              id: key,
              videoUrl,
              transcript: tData.transcript || [],
              selectedWords: tData.selectedWords || []
            });
          }
        }
      }

      if (clipsForGeneration.filter(c => !c.isTransition).length === 0) {
        throw new Error('No clips with selected words to generate');
      }

      const response = await fetch('/api/generate-rundown-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gamePk,
          clips: clipsForGeneration,
          titleCardUrl: titleCardUrl || null
        })
      });

      const result = await response.json();

      if (result.success) {
        setFinalVideoUrl(result.videoUrl);
      } else {
        throw new Error(result.error || 'Video generation failed');
      }
    } catch (err) {
      setGenerationError(err.message);
    } finally {
      setIsGenerating(false);
    }
  }, [atBats, selectedKeys, videoCache, transcriptData, gamePk, titleCardUrl, activeTransitions]);

  // Remove a clip from selection
  const handleRemoveClip = useCallback((key) => {
    setSelectedKeys(prev => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }, []);

  // Render a single play row with inline video/transcript when selected
  const renderPlay = (ab, isKeyPlay) => {
    const key = getAtBatKey(ab);
    const isSelected = selectedKeys.has(key);
    const isLoading = loadingVideo[key];
    const video = videoCache[key];
    const tData = transcriptData[key] || {};
    const feedType = tData.feedType || getPreferredFeed(ab, video);
    const availableFeeds = getAvailableFeeds(video);
    const videoUrl = getVideoUrlForFeed(video, feedType);
    const selectedDuration = calculateSelectedDuration(tData.transcript, tData.selectedWords);

    return (
      <div
        key={key}
        className={`transition-all border-l-4 ${
          isSelected
            ? 'bg-slate-700/50 border-blue-500'
            : 'bg-gray-800/50 border-transparent hover:bg-gray-700/50'
        }`}
      >
        {/* Header row - clickable */}
        <div
          onClick={() => toggleSelection(ab)}
          className="p-3 cursor-pointer"
        >
          <div className="flex items-center gap-3">
            {/* Selection indicator */}
            <div className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
              isSelected
                ? 'bg-blue-500 border-blue-500 text-white'
                : 'border-gray-600'
            }`}>
              {isLoading ? (
                <div className="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
              ) : isSelected ? (
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              ) : null}
            </div>

            {/* Result icon */}
            <span className={`font-mono text-lg ${getResultColor(ab.result)}`}>
              {getResultIcon(ab.result)}
            </span>

            {/* Play info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-white truncate">
                  {ab.batter.name}
                </span>
                {ab.isScoring && (
                  <span className="px-1.5 py-0.5 bg-green-500/20 text-green-400 text-xs rounded">
                    RBI: {ab.rbi}
                  </span>
                )}
                {isKeyPlay && !isSelected && (
                  <span className="px-1.5 py-0.5 bg-yellow-500/20 text-yellow-400 text-xs rounded">
                    Key Play
                  </span>
                )}
                {/* Feed selector for selected clips */}
                {isSelected && availableFeeds.length > 0 && (
                  <select
                    value={feedType}
                    onChange={(e) => {
                      e.stopPropagation();
                      handleFeedChange(key, e.target.value);
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
              <div className="text-sm text-gray-500">
                vs {ab.pitcher.name} • {ab.result}
              </div>
            </div>

            {/* Duration/status indicator */}
            <div className="text-right shrink-0">
              {tData.isTranscribing ? (
                <div className="text-yellow-400 text-sm animate-pulse">
                  Transcribing...
                </div>
              ) : tData.transcript?.length > 0 ? (
                <>
                  <div className="text-green-400 font-mono text-sm">
                    {selectedDuration.toFixed(1)}s
                  </div>
                  <div className="text-gray-500 text-xs">
                    / {(tData.duration || 0).toFixed(1)}s
                  </div>
                </>
              ) : tData.error ? (
                <div className="text-red-400 text-sm">Error</div>
              ) : video?.found ? (
                <span className="text-green-400 text-xs">✓ Video</span>
              ) : null}
            </div>

            {/* Remove button for selected clips */}
            {isSelected && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemoveClip(key);
                }}
                className="p-1 hover:bg-red-500/20 rounded text-gray-500 hover:text-red-400"
                title="Remove clip"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Expanded content for selected plays */}
        {isSelected && (
          <div className="px-3 pb-3 space-y-3">
            {/* Video preview */}
            {videoUrl && (
              <div className="relative aspect-video bg-black rounded-lg overflow-hidden max-w-md">
                <video
                  ref={(el) => { videoRefs.current[key] = el; }}
                  src={videoUrl.includes('/api/video-proxy') ? videoUrl : `/api/video-proxy?url=${encodeURIComponent(videoUrl)}`}
                  className="w-full h-full object-contain"
                  controls
                  preload="metadata"
                />
              </div>
            )}

            {/* Transcribing indicator */}
            {tData.isTranscribing && (
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
                <div className="flex items-center gap-3">
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-yellow-500 border-t-transparent" />
                  <div>
                    <div className="text-yellow-400 text-sm font-medium">Transcribing audio...</div>
                    <div className="text-yellow-400/70 text-xs">This may take 10-30 seconds</div>
                  </div>
                </div>
              </div>
            )}

            {/* Error message */}
            {tData.error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-400 text-sm">
                {tData.error}
              </div>
            )}

            {/* Transcript editor */}
            {tData.transcript?.length > 0 && (
              <TranscriptEditor
                words={tData.transcript}
                selectedIndices={tData.selectedWords || []}
                selectedSegmentIndicesProp={tData.selectedSegmentIndices || null}
                onSelectionChange={(wordIndices, segmentIndices, segments) => handleWordSelectionChange(key, wordIndices, segmentIndices, segments)}
                duration={tData.duration || 0}
                disabled={tData.isTranscribing}
                onPlaySelected={() => handlePlaySelected(key)}
                isPlaying={playingKey === key}
                onRetranscribe={() => handleRetranscribe(key, videoUrl)}
              />
            )}

            {/* No transcript yet */}
            {!tData.isTranscribing && !tData.error && !tData.transcript?.length && video?.found && (
              <div className="text-gray-500 text-sm italic">
                Transcript will appear here after analysis
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // Count selected plays and calculate total selected duration
  const selectedCount = selectedKeys.size;
  const transcribingCount = Object.values(transcriptData).filter(t => t.isTranscribing).length;
  const totalSelectedDuration = [...selectedKeys].reduce((sum, key) => {
    const tData = transcriptData[key];
    if (!tData?.transcript?.length || !tData?.selectedWords?.length) return sum;
    return sum + calculateSelectedDuration(tData.transcript, tData.selectedWords);
  }, 0);

  if (isInitializing) {
    return (
      <div className="bg-mlb-charcoal rounded-2xl p-6 border border-white/10">
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-gray-400">Loading key plays...</p>
          </div>
        </div>
      </div>
    );
  }

  // Show final video if generation is complete
  if (finalVideoUrl) {
    return (
      <div className="bg-mlb-charcoal rounded-2xl p-6 border border-white/10">
        <h3 className="text-lg font-medium mb-4 text-green-400">Video Ready!</h3>
        <div className="aspect-video bg-black rounded-lg overflow-hidden mb-4">
          <video
            src={finalVideoUrl}
            controls
            autoPlay
            className="w-full h-full"
          />
        </div>
        <div className="flex gap-3">
          <a
            href={finalVideoUrl}
            download={`highlight-${gamePk}.mp4`}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-white"
          >
            Download Video
          </a>
          <button
            onClick={() => setFinalVideoUrl(null)}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-white"
          >
            Edit Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-mlb-charcoal rounded-2xl p-6 border border-white/10">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold text-white">Game Plays</h2>
          <p className="text-sm text-gray-400">
            {selectedCount} selected • {keyAtBatKeys.size} key plays auto-detected
            {totalSelectedDuration > 0 && ` • ${totalSelectedDuration.toFixed(1)}s total`}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Generate video button */}
          {selectedCount > 0 && (
            <button
              onClick={handleGenerateVideo}
              disabled={totalSelectedDuration < 1 || isGenerating || transcribingCount > 0}
              className="px-5 py-2 bg-green-600 hover:bg-green-500 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-medium rounded-lg flex items-center gap-2 transition-colors"
            >
              {isGenerating ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                  Generating...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Generate Video ({selectedCount})
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Generation error */}
      {generationError && (
        <div className="mb-4 bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400">
          {generationError}
        </div>
      )}

      {/* Generating progress */}
      {isGenerating && (
        <div className="mb-4 bg-gray-800 rounded-lg p-6 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-green-500 border-t-transparent mx-auto mb-4" />
          <h3 className="text-lg font-medium mb-2 text-white">Generating your highlight video...</h3>
          <p className="text-gray-400">This may take a few minutes</p>
        </div>
      )}

      {/* Play list by inning */}
      <div className="space-y-1">
        {sortedInnings.map(inningGroup => {
          const { label, plays, halfInning, inning } = inningGroup;
          const keyPlaysInInning = plays.filter(ab => keyAtBatKeys.has(getAtBatKey(ab)));
          const nonKeyPlaysInInning = plays.filter(ab => !keyAtBatKeys.has(getAtBatKey(ab)));
          const sectionKey = `${label}-nonkey`;
          const isExpanded = expandedSections.has(sectionKey);
          const selectedInInning = plays.filter(ab => selectedKeys.has(getAtBatKey(ab))).length;
          const transitionKey = getTransitionKey(halfInning, inning);
          const isTransitionActive = activeTransitions[transitionKey] === true;

          return (
            <div key={label} className="border border-white/10 rounded-lg overflow-hidden">
              {/* Inning transition toggle - shown for all innings */}
              <div
                className={`flex items-center gap-3 px-4 py-2 cursor-pointer transition-colors ${
                  isTransitionActive
                    ? 'bg-purple-500/20 border-b border-purple-500/30'
                    : 'bg-gray-800/30 border-b border-white/5 hover:bg-gray-700/30'
                }`}
                onClick={() => toggleTransition(transitionKey)}
              >
                {/* Checkbox */}
                <div className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                  isTransitionActive
                    ? 'bg-purple-500 border-purple-500 text-white'
                    : 'border-gray-600'
                }`}>
                  {isTransitionActive && (
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </div>

                {/* Transition icon and label */}
                <div className="flex items-center gap-2 flex-1">
                  <svg className={`w-4 h-4 ${isTransitionActive ? 'text-purple-400' : 'text-gray-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
                  </svg>
                  <span className={`text-sm ${isTransitionActive ? 'text-purple-400' : 'text-gray-500'}`}>
                    {label} Transition
                  </span>
                </div>

                {/* Preview thumbnail when active */}
                {isTransitionActive && (
                  <video
                    src={`/api/inning-transition/${transitionKey}`}
                    className="w-16 h-9 object-cover rounded"
                    muted
                    preload="metadata"
                  />
                )}
              </div>

              {/* Inning header */}
              <div className="px-4 py-2 bg-blue-400/30 flex items-center justify-between">
                <span className="font-semibold text-white text-sm">{label}</span>
                <div className="flex items-center gap-2">
                  {selectedInInning > 0 && (
                    <span className="px-2 py-0.5 bg-red-500/20 text-red-400 text-xs rounded">
                      {selectedInInning} selected
                    </span>
                  )}
                  <span className="text-xs text-gray-500">
                    {plays.length} play{plays.length !== 1 ? 's' : ''}
                  </span>
                </div>
              </div>

              {/* Plays */}
              <div className="divide-y divide-white/5">
                {/* Render plays in chronological order, with expander for non-key plays */}
                {(() => {
                  const elements = [];
                  let nonKeyBuffer = [];

                  const flushNonKeyBuffer = () => {
                    if (nonKeyBuffer.length > 0) {
                      const bufferKey = `${label}-${elements.length}`;
                      const bufferExpanded = expandedSections.has(bufferKey);

                      elements.push(
                        <div key={bufferKey}>
                          {/* Expander button */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleSection(bufferKey);
                            }}
                            className="w-full px-4 py-2 bg-gray-800/30 hover:bg-gray-700/50 text-gray-500 text-sm flex items-center justify-center gap-2 transition-colors"
                          >
                            <span className="text-gray-600">⋯</span>
                            <span>{bufferExpanded ? 'Hide' : `+${nonKeyBuffer.length}`} play{nonKeyBuffer.length !== 1 ? 's' : ''}</span>
                            <svg
                              className={`w-3 h-3 transition-transform ${bufferExpanded ? 'rotate-180' : ''}`}
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </button>

                          {/* Expanded non-key plays */}
                          {bufferExpanded && (
                            <div className="divide-y divide-white/5">
                              {nonKeyBuffer.map(ab => renderPlay(ab, false))}
                            </div>
                          )}
                        </div>
                      );
                      nonKeyBuffer = [];
                    }
                  };

                  plays.forEach((ab, idx) => {
                    const isKey = keyAtBatKeys.has(getAtBatKey(ab));

                    if (isKey) {
                      flushNonKeyBuffer();
                      elements.push(renderPlay(ab, true));
                    } else {
                      nonKeyBuffer.push(ab);
                    }
                  });

                  // Flush any remaining non-key plays
                  flushNonKeyBuffer();

                  return elements;
                })()}
              </div>
            </div>
          );
        })}
      </div>

      {/* Empty state */}
      {(!atBats || atBats.length === 0) && (
        <div className="text-center py-12 text-gray-500">
          No plays available for this game
        </div>
      )}
    </div>
  );
}
