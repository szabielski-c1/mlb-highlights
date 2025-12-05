'use client';

import { useState } from 'react';
import VoiceOptions from './VoiceOptions';
import AudioPlayer from './AudioPlayer';
import VideoPlayer from './VideoPlayer';

// Default voice ID
const DEFAULT_VOICE_ID = 'yl2ZDV1MzN4HbQJbMihG';

export default function ScriptDisplay({ script, isLoading, gamePk, scriptStyle, highlights, keyPlays, gameData }) {
  const [copied, setCopied] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState(DEFAULT_VOICE_ID);
  const [showVoiceOptions, setShowVoiceOptions] = useState(false);

  // Voice generation state
  const [isGeneratingVoice, setIsGeneratingVoice] = useState(false);
  const [audioData, setAudioData] = useState(null);
  const [voiceError, setVoiceError] = useState(null);

  // Video generation state
  const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
  const [videoData, setVideoData] = useState(null);
  const [videoError, setVideoError] = useState(null);

  // Synced video generation state
  const [isGeneratingSyncedVideo, setIsGeneratingSyncedVideo] = useState(false);
  const [syncedVideoData, setSyncedVideoData] = useState(null);
  const [syncedVideoError, setSyncedVideoError] = useState(null);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(script);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleShare = async () => {
    const url = `${window.location.origin}/game/${gamePk}`;
    try {
      if (navigator.share) {
        await navigator.share({
          title: 'MLB Highlight Script',
          text: script,
          url: url,
        });
      } else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch (err) {
      console.error('Failed to share:', err);
    }
  };

  const handleGenerateVoice = async () => {
    setIsGeneratingVoice(true);
    setVoiceError(null);
    setAudioData(null);

    try {
      const response = await fetch('/api/generate-voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          script,
          voiceId: selectedVoice,
          style: scriptStyle,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.details || 'Failed to generate voice');
      }

      const data = await response.json();
      setAudioData(data.audio);
    } catch (err) {
      console.error('Voice generation error:', err);
      setVoiceError(err.message);
    } finally {
      setIsGeneratingVoice(false);
    }
  };

  const handleGenerateVideo = async () => {
    setIsGeneratingVideo(true);
    setVideoError(null);
    setVideoData(null);

    try {
      const response = await fetch('/api/generate-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          script,
          voiceId: selectedVoice,
          style: scriptStyle,
          keyPlays, // Use matched key plays with their video clips
          highlights: highlights?.slice(0, 5), // Fallback to top 5 highlights
          gamePk,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.details || 'Failed to generate video');
      }

      const data = await response.json();
      setVideoData(data.video);
    } catch (err) {
      console.error('Video generation error:', err);
      setVideoError(err.message);
    } finally {
      setIsGeneratingVideo(false);
    }
  };

  const handleGenerateSyncedVideo = async () => {
    setIsGeneratingSyncedVideo(true);
    setSyncedVideoError(null);
    setSyncedVideoData(null);

    try {
      const response = await fetch('/api/generate-synced-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameData,
          keyPlays,
          style: scriptStyle,
          voiceId: selectedVoice,
          gamePk,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.details || 'Failed to generate synced video');
      }

      const data = await response.json();
      setSyncedVideoData(data.video);
    } catch (err) {
      console.error('Synced video generation error:', err);
      setSyncedVideoError(err.message);
    } finally {
      setIsGeneratingSyncedVideo(false);
    }
  };

  if (isLoading) {
    return (
      <div className="bg-mlb-charcoal rounded-xl p-6 border border-white/10">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 border-2 border-mlb-red border-t-transparent rounded-full animate-spin" />
          <span className="text-gray-300">Generating script...</span>
        </div>
        <div className="space-y-3">
          <div className="h-4 bg-gray-700 rounded w-full animate-pulse" />
          <div className="h-4 bg-gray-700 rounded w-11/12 animate-pulse" />
          <div className="h-4 bg-gray-700 rounded w-full animate-pulse" />
          <div className="h-4 bg-gray-700 rounded w-9/12 animate-pulse" />
        </div>
      </div>
    );
  }

  if (!script) {
    return null;
  }

  // Calculate estimated read time (average 150 words per minute)
  const wordCount = script.split(/\s+/).length;
  const readTime = Math.ceil(wordCount / 150 * 60);

  return (
    <div className="space-y-4">
      <div className="bg-mlb-charcoal rounded-xl border border-white/10 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-black/20 border-b border-white/10">
          <div>
            <h3 className="font-semibold text-white">Generated Script</h3>
            <p className="text-xs text-gray-400">
              {wordCount} words • ~{readTime} seconds
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleCopy}
              className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
            >
              {copied ? (
                <>
                  <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-green-400 text-sm">Copied!</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  <span className="text-gray-300 text-sm">Copy</span>
                </>
              )}
            </button>
            <button
              onClick={handleShare}
              className="flex items-center gap-2 px-4 py-2 bg-mlb-red hover:bg-red-600 rounded-lg transition-colors"
            >
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
              <span className="text-white text-sm">Share</span>
            </button>
          </div>
        </div>

        {/* Script content */}
        <div className="p-6">
          <div className="prose prose-invert max-w-none">
            {script.split('\n\n').map((paragraph, index) => (
              <p key={index} className="text-gray-200 leading-relaxed mb-4 last:mb-0">
                {paragraph}
              </p>
            ))}
          </div>
        </div>
      </div>

      {/* Voice & Video Generation Section */}
      <div className="bg-mlb-charcoal rounded-xl border border-white/10 p-6">
        <h3 className="font-semibold text-white mb-4">Generate Audio/Video</h3>

        {/* Voice Selection Toggle */}
        <button
          onClick={() => setShowVoiceOptions(!showVoiceOptions)}
          className="flex items-center justify-between w-full px-4 py-3 bg-white/5 hover:bg-white/10 rounded-lg mb-4 transition-colors"
        >
          <span className="text-gray-300">
            Voice: <span className="text-white font-medium">
              {selectedVoice === DEFAULT_VOICE_ID ? 'Sports Announcer (Default)' : 'Custom Voice'}
            </span>
          </span>
          <svg className={`w-5 h-5 text-gray-400 transition-transform ${showVoiceOptions ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {/* Voice Options Panel */}
        {showVoiceOptions && (
          <div className="mb-6 p-4 bg-black/20 rounded-lg">
            <VoiceOptions
              selectedVoice={selectedVoice}
              onVoiceChange={setSelectedVoice}
              scriptStyle={scriptStyle}
            />
          </div>
        )}

        {/* Generation Buttons */}
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Generate Voice Button */}
          <button
            onClick={handleGenerateVoice}
            disabled={isGeneratingVoice}
            className={`flex-1 flex items-center justify-center gap-3 py-4 rounded-xl font-bold transition-all ${
              isGeneratingVoice
                ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                : 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white'
            }`}
          >
            {isGeneratingVoice ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Generating Audio...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
                Generate Voice
              </>
            )}
          </button>

          {/* Generate Video Button (Basic) */}
          <button
            onClick={handleGenerateVideo}
            disabled={isGeneratingVideo || !highlights || highlights.length === 0}
            className={`flex-1 flex items-center justify-center gap-3 py-4 rounded-xl font-bold transition-all ${
              isGeneratingVideo || !highlights || highlights.length === 0
                ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                : 'bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white'
            }`}
          >
            {isGeneratingVideo ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Creating Video...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                Quick Video
              </>
            )}
          </button>
        </div>

        {/* Synced Video Button - Premium Feature */}
        <button
          onClick={handleGenerateSyncedVideo}
          disabled={isGeneratingSyncedVideo || !keyPlays || keyPlays.filter(p => p.matchedHighlight).length === 0}
          className={`w-full mt-3 flex items-center justify-center gap-3 py-4 rounded-xl font-bold transition-all ${
            isGeneratingSyncedVideo || !keyPlays || keyPlays.filter(p => p.matchedHighlight).length === 0
              ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
              : 'bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white'
          }`}
        >
          {isGeneratingSyncedVideo ? (
            <>
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Analyzing & Syncing (this takes a minute)...
            </>
          ) : (
            <>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
              </svg>
              Create Synced Video (AI Analysis)
            </>
          )}
        </button>
        <p className="text-xs text-gray-500 text-center mt-2">
          Uses Gemini to analyze clips and sync narration with action
        </p>

        {/* Error Messages */}
        {voiceError && (
          <div className="mt-4 p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
            <p className="text-red-400 text-sm">{voiceError}</p>
          </div>
        )}

        {videoError && (
          <div className="mt-4 p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
            <p className="text-red-400 text-sm">{videoError}</p>
          </div>
        )}

        {syncedVideoError && (
          <div className="mt-4 p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
            <p className="text-red-400 text-sm">{syncedVideoError}</p>
          </div>
        )}

        {/* No highlights warning */}
        {(!highlights || highlights.length === 0) && (
          <p className="mt-3 text-xs text-gray-500 text-center">
            Video generation requires available highlight clips
          </p>
        )}
      </div>

      {/* Audio Player */}
      {audioData && (
        <AudioPlayer
          audioBase64={audioData}
          onClose={() => setAudioData(null)}
        />
      )}

      {/* Video Player */}
      {videoData && (
        <VideoPlayer
          videoBase64={videoData}
          onClose={() => setVideoData(null)}
        />
      )}

      {/* Synced Video Player */}
      {syncedVideoData && (
        <VideoPlayer
          videoBase64={syncedVideoData}
          onClose={() => setSyncedVideoData(null)}
        />
      )}
    </div>
  );
}
