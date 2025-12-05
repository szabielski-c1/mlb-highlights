'use client';

import { useState, useEffect } from 'react';

/**
 * Component for browsing and selecting at-bats from a game
 * Allows users to find video for any at-bat via Film Room
 */
export default function AtBatBrowser({ atBats, gamePk, onSelectClips }) {
  const [selectedAtBats, setSelectedAtBats] = useState([]);
  const [loadingVideo, setLoadingVideo] = useState({});
  const [videoCache, setVideoCache] = useState({});
  const [filter, setFilter] = useState('all'); // all, scoring, hits, strikeouts
  const [expandedInning, setExpandedInning] = useState(null);

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
    return true;
  };

  // Fetch video for an at-bat
  const fetchVideo = async (ab) => {
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
  };

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
            { key: 'scoring', label: 'Scoring' },
            { key: 'hits', label: 'Hits' },
            { key: 'homers', label: 'HRs' },
            { key: 'strikeouts', label: 'Ks' },
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

      {/* Selected count */}
      {selectedAtBats.length > 0 && (
        <div className="mb-4 p-3 bg-mlb-red/20 rounded-lg flex items-center justify-between">
          <span className="text-white">
            {selectedAtBats.length} at-bat{selectedAtBats.length !== 1 ? 's' : ''} selected
          </span>
          <button
            onClick={() => setSelectedAtBats([])}
            className="text-sm text-red-400 hover:text-red-300"
          >
            Clear all
          </button>
        </div>
      )}

      {/* Innings accordion */}
      <div className="space-y-2 max-h-[500px] overflow-y-auto">
        {Object.entries(atBatsByInning).map(([inningLabel, inningAtBats]) => {
          const filteredAtBats = inningAtBats.filter(filterAtBat);
          if (filteredAtBats.length === 0) return null;

          const isExpanded = expandedInning === inningLabel;

          return (
            <div key={inningLabel} className="border border-white/10 rounded-lg overflow-hidden">
              <button
                onClick={() => setExpandedInning(isExpanded ? null : inningLabel)}
                className="w-full px-4 py-3 bg-white/5 hover:bg-white/10 flex items-center justify-between transition-colors"
              >
                <span className="font-medium text-white">{inningLabel}</span>
                <div className="flex items-center gap-2">
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

                    return (
                      <div
                        key={idx}
                        className={`p-4 transition-colors ${
                          isSelected ? 'bg-mlb-red/10' : 'hover:bg-white/5'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          {/* Selection checkbox */}
                          <button
                            onClick={() => toggleAtBat(ab)}
                            disabled={isLoading}
                            className={`flex-shrink-0 w-6 h-6 rounded border-2 flex items-center justify-center transition-colors ${
                              isSelected
                                ? 'bg-mlb-red border-mlb-red text-white'
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

      {/* Generate button */}
      {selectedAtBats.length > 0 && (
        <div className="mt-6 pt-4 border-t border-white/10">
          <p className="text-sm text-gray-400 mb-3">
            Selected clips will be used for your custom highlight video
          </p>
        </div>
      )}
    </div>
  );
}
