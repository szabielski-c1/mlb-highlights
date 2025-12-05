'use client';

import { useState, useCallback, useEffect } from 'react';
import ClipCard from './ClipCard';

/**
 * RundownEditor - Multi-step workflow for creating highlight packages
 * Steps: selecting -> analyzing -> editing -> generating -> complete
 *
 * Feed types available:
 * - CMS: Edited highlights from MLB content team (shorter, polished)
 * - NETWORK: Broadcast network feed (longer, more raw)
 * - HOME/AWAY: Only available during regular season games
 */

/**
 * Get the video URL for the selected feed type
 * Defaults to NETWORK (longer broadcast clips from fastball-clips.mlb.com)
 */
function getVideoUrlForFeed(clip, feedType = 'NETWORK') {
  // Try requested feed first
  if (feedType === 'NETWORK' && clip.networkVideoUrl) {
    return clip.networkVideoUrl;
  }
  if (feedType === 'CMS' && clip.cmsVideoUrl) {
    return clip.cmsVideoUrl;
  }
  if (feedType === 'HOME' && clip.homeVideoUrl) {
    return clip.homeVideoUrl;
  }
  if (feedType === 'AWAY' && clip.awayVideoUrl) {
    return clip.awayVideoUrl;
  }

  // Fallback chain: NETWORK -> CMS -> HOME -> AWAY -> videoUrl
  return clip.networkVideoUrl || clip.cmsVideoUrl || clip.homeVideoUrl || clip.awayVideoUrl || clip.videoUrl;
}

/**
 * Get list of available feeds for a clip
 */
function getAvailableFeeds(clip) {
  const feeds = [];
  if (clip.networkVideoUrl) feeds.push('NETWORK');
  if (clip.cmsVideoUrl) feeds.push('CMS');
  if (clip.homeVideoUrl) feeds.push('HOME');
  if (clip.awayVideoUrl) feeds.push('AWAY');
  return feeds;
}

export default function RundownEditor({
  initialClips = [],
  gamePk,
  onBack,
  onComplete
}) {
  const [step, setStep] = useState('editing'); // analyzing, editing, generating, complete
  const [globalFeedType, setGlobalFeedType] = useState('NETWORK'); // Default to NETWORK (longer clips)
  const [clips, setClips] = useState(initialClips.map(clip => ({
    ...clip,
    // Default to NETWORK feed (longer broadcast clips)
    feedType: 'NETWORK',
    activeVideoUrl: getVideoUrlForFeed(clip, 'NETWORK'),
    availableFeeds: getAvailableFeeds(clip),
    transcript: [],
    selectedWords: [],
    duration: 0,
    isTranscribing: false,
    error: null
  })));
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [finalVideoUrl, setFinalVideoUrl] = useState(null);
  const [error, setError] = useState(null);

  // Handle feed type change for individual clip
  const handleFeedChange = useCallback((clipId, newFeedType) => {
    setClips(prev => prev.map(c =>
      c.id === clipId ? {
        ...c,
        feedType: newFeedType,
        activeVideoUrl: getVideoUrlForFeed(c, newFeedType)
      } : c
    ));
  }, []);

  // Handle global feed type change - apply to all clips
  const handleGlobalFeedChange = useCallback((newFeedType) => {
    setGlobalFeedType(newFeedType);
    setClips(prev => prev.map(c => ({
      ...c,
      feedType: newFeedType,
      activeVideoUrl: getVideoUrlForFeed(c, newFeedType)
    })));
  }, []);

  // Start transcription when entering analyzing step
  const startAnalysis = useCallback(async () => {
    setStep('analyzing');
    setError(null);

    // Transcribe clips one at a time to avoid overwhelming the API
    for (let i = 0; i < clips.length; i++) {
      const clip = clips[i];

      // Use the active video URL for the selected feed
      const videoUrl = clip.activeVideoUrl;
      if (!videoUrl) continue;

      // Mark as transcribing
      setClips(prev => prev.map((c, idx) =>
        idx === i ? { ...c, isTranscribing: true, error: null } : c
      ));

      try {
        const response = await fetch('/api/transcribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            videoUrl: videoUrl,
            clipId: clip.id
          })
        });

        const result = await response.json();

        if (result.success) {
          // Update clip with transcript, select all words by default
          setClips(prev => prev.map((c, idx) =>
            idx === i ? {
              ...c,
              transcript: result.words,
              selectedWords: result.words.map((_, wordIdx) => wordIdx),
              duration: result.duration,
              isTranscribing: false,
              error: null
            } : c
          ));
        } else {
          setClips(prev => prev.map((c, idx) =>
            idx === i ? {
              ...c,
              isTranscribing: false,
              error: result.error || 'Transcription failed'
            } : c
          ));
        }
      } catch (err) {
        setClips(prev => prev.map((c, idx) =>
          idx === i ? {
            ...c,
            isTranscribing: false,
            error: err.message
          } : c
        ));
      }
    }

    setStep('editing');
  }, [clips]);

  // Handle word selection change for a clip
  const handleSelectionChange = useCallback((clipId, selectedIndices) => {
    setClips(prev => prev.map(c =>
      c.id === clipId ? { ...c, selectedWords: selectedIndices } : c
    ));
  }, []);

  // Handle clip removal
  const handleRemoveClip = useCallback((clipId) => {
    setClips(prev => prev.filter(c => c.id !== clipId));
  }, []);

  // Generate final video
  const handleGenerate = useCallback(async () => {
    setStep('generating');
    setIsGenerating(true);
    setGenerationProgress(0);
    setError(null);

    try {
      // Prepare clips data for video generation - use selected feed
      const clipsForGeneration = clips
        .filter(c => c.selectedWords.length > 0)
        .map(c => ({
          id: c.id,
          videoUrl: c.activeVideoUrl,
          transcript: c.transcript,
          selectedWords: c.selectedWords
        }));

      if (clipsForGeneration.length === 0) {
        throw new Error('No clips with selected words to generate');
      }

      // Call video generation API
      const response = await fetch('/api/generate-rundown-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gamePk,
          clips: clipsForGeneration
        })
      });

      const result = await response.json();

      if (result.success) {
        setFinalVideoUrl(result.videoUrl);
        setStep('complete');
      } else {
        throw new Error(result.error || 'Video generation failed');
      }
    } catch (err) {
      setError(err.message);
      setStep('editing');
    } finally {
      setIsGenerating(false);
    }
  }, [clips, gamePk]);

  // Calculate totals
  const totalSelectedDuration = clips.reduce((sum, clip) => {
    if (!clip.transcript.length || !clip.selectedWords.length) return sum;
    const sorted = [...clip.selectedWords].sort((a, b) => a - b);
    let duration = 0;
    let start = null;
    let end = null;
    let prev = null;
    for (const idx of sorted) {
      const word = clip.transcript[idx];
      if (!word) continue;
      if (start === null) {
        start = word.start;
        end = word.end;
        prev = idx;
      } else if (idx === prev + 1) {
        end = word.end;
        prev = idx;
      } else {
        duration += end - start;
        start = word.start;
        end = word.end;
        prev = idx;
      }
    }
    if (start !== null) duration += end - start;
    return sum + duration;
  }, 0);

  const clipsWithTranscripts = clips.filter(c => c.transcript.length > 0).length;
  const clipsTranscribing = clips.filter(c => c.isTranscribing).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Edit Rundown</h2>
          <p className="text-gray-400 text-sm">
            Select which parts of the announcer audio to include
          </p>
        </div>

        <button
          onClick={onBack}
          className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg"
        >
          Back to Plays
        </button>
      </div>

      {/* Progress bar during analysis */}
      {step === 'analyzing' && (
        <div className="bg-gray-800 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-yellow-400">Analyzing clips...</span>
            <span className="text-gray-400 text-sm">
              {clipsWithTranscripts} / {clips.length} complete
            </span>
          </div>
          <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-yellow-500 transition-all duration-300"
              style={{ width: `${(clipsWithTranscripts / clips.length) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Stats bar */}
      {step === 'editing' && (
        <div className="bg-gray-800 rounded-lg p-4 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div>
              <span className="text-2xl font-bold text-green-400">
                {totalSelectedDuration.toFixed(1)}s
              </span>
              <span className="text-gray-400 text-sm ml-2">selected audio</span>
            </div>
            <div className="text-gray-500">|</div>
            <div className="text-gray-400">
              {clips.length} clip{clips.length !== 1 ? 's' : ''}
            </div>
            <div className="text-gray-500">|</div>
            {/* Global feed selector */}
            <div className="flex items-center gap-2">
              <span className="text-gray-400 text-sm">Feed:</span>
              <select
                value={globalFeedType}
                onChange={(e) => handleGlobalFeedChange(e.target.value)}
                className="bg-gray-700 text-white text-sm rounded px-2 py-1 border border-gray-600 focus:border-blue-500 focus:outline-none"
              >
                <option value="NETWORK">NETWORK</option>
                <option value="CMS">CMS</option>
                <option value="HOME">HOME</option>
                <option value="AWAY">AWAY</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {clipsTranscribing === 0 && clipsWithTranscripts < clips.length && (
              <button
                onClick={startAnalysis}
                className="px-4 py-2 bg-yellow-600 hover:bg-yellow-500 rounded-lg flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
                Transcribe Clips
              </button>
            )}

            <button
              onClick={handleGenerate}
              disabled={totalSelectedDuration < 1 || isGenerating}
              className="px-6 py-2 bg-green-600 hover:bg-green-500 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg flex items-center gap-2"
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
                  Generate Video
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400">
          {error}
        </div>
      )}

      {/* Generating progress */}
      {step === 'generating' && (
        <div className="bg-gray-800 rounded-lg p-6 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-green-500 border-t-transparent mx-auto mb-4" />
          <h3 className="text-lg font-medium mb-2">Generating your highlight video...</h3>
          <p className="text-gray-400">This may take a few minutes</p>
        </div>
      )}

      {/* Complete - show video */}
      {step === 'complete' && finalVideoUrl && (
        <div className="bg-gray-800 rounded-lg p-6">
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
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg"
            >
              Download Video
            </a>
            <button
              onClick={() => {
                setStep('editing');
                setFinalVideoUrl(null);
              }}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg"
            >
              Edit Again
            </button>
          </div>
        </div>
      )}

      {/* Clip list */}
      {(step === 'analyzing' || step === 'editing') && (
        <div className="space-y-4">
          {clips.map((clip, index) => (
            <ClipCard
              key={clip.id}
              clip={clip}
              index={index}
              onSelectionChange={handleSelectionChange}
              onRemove={handleRemoveClip}
              onFeedChange={handleFeedChange}
              isTranscribing={clip.isTranscribing}
              error={clip.error}
            />
          ))}
        </div>
      )}

      {/* Empty state */}
      {clips.length === 0 && (
        <div className="bg-gray-800 rounded-lg p-8 text-center">
          <p className="text-gray-400">No clips selected. Go back and select some plays.</p>
        </div>
      )}
    </div>
  );
}
