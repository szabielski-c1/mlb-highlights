'use client';

import { useState, useEffect, useCallback } from 'react';

/**
 * Determine if an at-bat is highlight-worthy
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
    score += (ab.rbi || 0) * 10; // More RBIs = more important
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

  // Big win probability swings (if available)
  if (ab.winProbabilityAdded && Math.abs(ab.winProbabilityAdded) > 0.15) {
    score += Math.abs(ab.winProbabilityAdded) * 100;
  }

  return score;
}

/**
 * Get suggested at-bats for highlights
 */
function getSuggestedAtBats(atBats, maxCount = 8) {
  if (!atBats || atBats.length === 0) return [];

  // Score all at-bats
  const scored = atBats
    .map(ab => ({ ab, score: getHighlightScore(ab) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score);

  // Take top N, but maintain chronological order
  const topN = scored.slice(0, maxCount).map(({ ab }) => ab);

  // Sort by inning/play order
  return topN.sort((a, b) => {
    if (a.inning !== b.inning) return a.inning - b.inning;
    if (a.halfInning !== b.halfInning) return a.halfInning === 'top' ? -1 : 1;
    return (a.playIndex || 0) - (b.playIndex || 0);
  });
}

/**
 * Component for browsing and selecting at-bats from a game
 * Allows users to find video for any at-bat via Film Room
 */
export default function AtBatBrowser({ atBats, gamePk, onSelectClips, onCreateRundown }) {
  const [selectedAtBats, setSelectedAtBats] = useState([]);
  const [loadingVideo, setLoadingVideo] = useState({});
  const [videoCache, setVideoCache] = useState({});
  const [filter, setFilter] = useState('all'); // all, scoring, hits, strikeouts
  const [expandedInning, setExpandedInning] = useState(null);
  const [isLoadingSuggested, setIsLoadingSuggested] = useState(false);

  // Group at-bats by inning
  const atBatsByInning = {};
  (atBats || []).forEach(ab => {
    const key = `${ab.halfInning === 'top' ? 'Top' : 'Bot'} ${ab.inning}`;
    if (!atBatsByInning[key]) {
      atBatsByInning[key] = [];
    }
    atBatsByInning[key].push(ab);
  });

  // Filter at-bats
  const filterAtBat = (ab) => {
    if (filter === 'all') return true;
    if (filter === 'scoring') return ab.isScoring;
    if (filter === 'hits') return ['Single', 'Double', 'Triple', 'Home Run'].includes(ab.result);
    if (filter === 'strikeouts') return ab.result === 'Strikeout';
    if (filter === 'homers') return ab.result === 'Home Run';
    if (filter === 'suggested') return getHighlightScore(ab) > 0;
    return true;
  };

  // Fetch video for an at-bat
  const fetchVideo = useCallback(async (ab) => {
    const cacheKey = `${ab.batter.id}-${ab.inning}-${ab.playIndex}`;

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

  // Toggle at-bat selection
  const toggleAtBat = async (ab) => {
    const cacheKey = `${ab.batter.id}-${ab.inning}-${ab.playIndex}`;
    const isSelected = selectedAtBats.some(s => s.cacheKey === cacheKey);

    if (isSelected) {
      setSelectedAtBats(prev => prev.filter(s => s.cacheKey !== cacheKey));
    } else {
      // Fetch video if not cached
      const videoData = await fetchVideo(ab);

      if (videoData?.found) {
        setSelectedAtBats(prev => [...prev, {
          cacheKey,
          atBat: ab,
          clip: videoData.clip,
        }]);
      }
    }
  };

  // Select all suggested highlights
  const selectSuggested = async () => {
    setIsLoadingSuggested(true);

    const suggested = getSuggestedAtBats(atBats);
    const newSelections = [];

    for (const ab of suggested) {
      const cacheKey = `${ab.batter.id}-${ab.inning}-${ab.playIndex}`;

      // Skip if already selected
      if (selectedAtBats.some(s => s.cacheKey === cacheKey)) {
        continue;
      }

      // Fetch video
      const videoData = await fetchVideo(ab);

      if (videoData?.found) {
        newSelections.push({
          cacheKey,
          atBat: ab,
          clip: videoData.clip,
        });
      }
    }

    setSelectedAtBats(prev => [...prev, ...newSelections]);
    setIsLoadingSuggested(false);
  };

  // Notify parent when selection changes
  useEffect(() => {
    if (onSelectClips) {
      const clips = selectedAtBats.map(s => ({
        id: s.clip.id || s.cacheKey,
        videoUrl: s.clip.videoUrl,
        homeVideoUrl: s.clip.homeVideoUrl,
        awayVideoUrl: s.clip.awayVideoUrl,
        headline: s.clip.title,
        description: s.atBat.description,
        batter: s.atBat.batter.name,
        pitcher: s.atBat.pitcher.name,
        inning: s.atBat.inning,
        halfInning: s.atBat.halfInning,
        result: s.atBat.result,
        playInfo: s.clip.playInfo,
      }));
      onSelectClips(clips);
    }
  }, [selectedAtBats, onSelectClips]);

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

  // Count suggested plays
  const suggestedCount = getSuggestedAtBats(atBats).length;

  return (
    <div className="bg-mlb-charcoal rounded-2xl p-6 border border-white/10">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-white">
          Browse At-Bats ({atBats?.length || 0})
        </h2>

        {/* Filter buttons */}
        <div className="flex gap-2">
          {[
            { key: 'all', label: 'All' },
            { key: 'suggested', label: `Suggested (${suggestedCount})` },
            { key: 'scoring', label: 'Scoring' },
            { key: 'hits', label: 'Hits' },
            { key: 'homers', label: 'HRs' },
          ].map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-3 py-1 rounded-full text-sm transition-colors ${
                filter === f.key
                  ? 'bg-mlb-red text-white'
                  : 'bg-white/10 text-gray-400 hover:bg-white/20'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Quick actions */}
      <div className="mb-4 flex gap-3">
        <button
          onClick={selectSuggested}
          disabled={isLoadingSuggested}
          className="px-4 py-2 bg-yellow-600 hover:bg-yellow-500 disabled:bg-yellow-800 text-white rounded-lg flex items-center gap-2 transition-colors"
        >
          {isLoadingSuggested ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Loading suggested...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
              </svg>
              Select Suggested ({suggestedCount})
            </>
          )}
        </button>

        {selectedAtBats.length > 0 && (
          <button
            onClick={() => setSelectedAtBats([])}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
          >
            Clear All ({selectedAtBats.length})
          </button>
        )}
      </div>

      {/* Selected count */}
      {selectedAtBats.length > 0 && (
        <div className="mb-4 p-3 bg-green-500/20 rounded-lg flex items-center justify-between">
          <span className="text-white">
            {selectedAtBats.length} at-bat{selectedAtBats.length !== 1 ? 's' : ''} selected
          </span>
          <span className="text-green-400 text-sm">
            Ready to create rundown
          </span>
        </div>
      )}

      {/* Innings accordion */}
      <div className="space-y-2 max-h-[500px] overflow-y-auto">
        {Object.entries(atBatsByInning).map(([inningLabel, inningAtBats]) => {
          const filteredAtBats = inningAtBats.filter(filterAtBat);
          if (filteredAtBats.length === 0) return null;

          const isExpanded = expandedInning === inningLabel;
          const selectedInInning = filteredAtBats.filter(ab => {
            const cacheKey = `${ab.batter.id}-${ab.inning}-${ab.playIndex}`;
            return selectedAtBats.some(s => s.cacheKey === cacheKey);
          }).length;

          return (
            <div key={inningLabel} className="border border-white/10 rounded-lg overflow-hidden">
              <button
                onClick={() => setExpandedInning(isExpanded ? null : inningLabel)}
                className="w-full px-4 py-3 bg-white/5 hover:bg-white/10 flex items-center justify-between transition-colors"
              >
                <span className="font-medium text-white">{inningLabel}</span>
                <div className="flex items-center gap-2">
                  {selectedInInning > 0 && (
                    <span className="px-2 py-0.5 bg-green-500/20 text-green-400 text-xs rounded">
                      {selectedInInning} selected
                    </span>
                  )}
                  <span className="text-sm text-gray-500">
                    {filteredAtBats.length} at-bat{filteredAtBats.length !== 1 ? 's' : ''}
                  </span>
                  <svg
                    className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </button>

              {isExpanded && (
                <div className="divide-y divide-white/5">
                  {filteredAtBats.map((ab, idx) => {
                    const cacheKey = `${ab.batter.id}-${ab.inning}-${ab.playIndex}`;
                    const isSelected = selectedAtBats.some(s => s.cacheKey === cacheKey);
                    const isLoading = loadingVideo[cacheKey];
                    const video = videoCache[cacheKey];
                    const highlightScore = getHighlightScore(ab);

                    return (
                      <div
                        key={idx}
                        className={`p-4 transition-colors ${
                          isSelected ? 'bg-green-500/10' : 'hover:bg-white/5'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          {/* Selection checkbox */}
                          <button
                            onClick={() => toggleAtBat(ab)}
                            disabled={isLoading}
                            className={`flex-shrink-0 w-6 h-6 rounded border-2 flex items-center justify-center transition-colors ${
                              isSelected
                                ? 'bg-green-500 border-green-500 text-white'
                                : highlightScore > 0
                                  ? 'border-yellow-500 hover:border-yellow-400'
                                  : 'border-gray-600 hover:border-gray-400'
                            }`}
                          >
                            {isLoading ? (
                              <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            ) : isSelected ? (
                              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                              </svg>
                            ) : null}
                          </button>

                          {/* At-bat info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className={`font-mono text-lg ${getResultColor(ab.result)}`}>
                                {getResultIcon(ab.result)}
                              </span>
                              <span className="font-medium text-white truncate">
                                {ab.batter.name}
                              </span>
                              {ab.isScoring && (
                                <span className="px-2 py-0.5 bg-green-500/20 text-green-400 text-xs rounded">
                                  RBI: {ab.rbi}
                                </span>
                              )}
                              {highlightScore > 0 && !isSelected && (
                                <span className="px-2 py-0.5 bg-yellow-500/20 text-yellow-400 text-xs rounded">
                                  Suggested
                                </span>
                              )}
                            </div>
                            <div className="text-sm text-gray-500 mt-1">
                              vs {ab.pitcher.name} • {ab.result}
                              {ab.finalCount && ` (${ab.finalCount})`}
                            </div>
                            {ab.description && (
                              <div className="text-sm text-gray-400 mt-1 line-clamp-2">
                                {ab.description}
                              </div>
                            )}
                          </div>

                          {/* Video status */}
                          <div className="flex-shrink-0">
                            {video?.found ? (
                              <span className="text-green-400 text-xs">
                                Video available
                              </span>
                            ) : video && !video.found ? (
                              <span className="text-gray-500 text-xs">
                                No video
                              </span>
                            ) : null}
                          </div>
                        </div>

                        {/* Video preview when selected */}
                        {isSelected && video?.clip?.videoUrl && (
                          <div className="mt-3 ml-9">
                            <video
                              src={`/api/video-proxy?url=${encodeURIComponent(video.clip.videoUrl)}`}
                              controls
                              className="w-full max-w-md rounded-lg"
                              poster={video.clip.thumbnail}
                            />
                            <div className="flex gap-2 mt-2">
                              {video.clip.homeVideoUrl && (
                                <a
                                  href={`/api/video-proxy?url=${encodeURIComponent(video.clip.homeVideoUrl)}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs text-blue-400 hover:underline"
                                >
                                  Home Feed
                                </a>
                              )}
                              {video.clip.awayVideoUrl && (
                                <a
                                  href={`/api/video-proxy?url=${encodeURIComponent(video.clip.awayVideoUrl)}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs text-blue-400 hover:underline"
                                >
                                  Away Feed
                                </a>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Create Rundown button */}
      {selectedAtBats.length > 0 && (
        <div className="mt-6 pt-4 border-t border-white/10">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-400">
              {selectedAtBats.length} clip{selectedAtBats.length !== 1 ? 's' : ''} ready for rundown
            </p>
            <button
              onClick={() => {
                // Pass all feed URLs - RundownEditor will handle feed selection and proxy wrapping
                const clips = selectedAtBats.map(s => ({
                  id: s.clip.id || s.cacheKey,
                  videoUrl: s.clip.videoUrl,             // Default/best quality (fallback)
                  cmsVideoUrl: s.clip.cmsVideoUrl,       // CMS edited highlight
                  networkVideoUrl: s.clip.networkVideoUrl, // NETWORK feed
                  homeVideoUrl: s.clip.homeVideoUrl,     // HOME broadcast (regular season only)
                  awayVideoUrl: s.clip.awayVideoUrl,     // AWAY broadcast (regular season only)
                  playInfo: s.clip.playInfo,
                  batter: s.atBat.batter.name,
                  pitcher: s.atBat.pitcher.name,
                  inning: s.atBat.inning,
                  halfInning: s.atBat.halfInning,
                  result: s.atBat.result,
                  description: s.atBat.description,
                }));
                onCreateRundown?.(clips);
              }}
              className="px-6 py-3 bg-green-600 hover:bg-green-500 text-white font-medium rounded-lg flex items-center gap-2 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Create Rundown
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
