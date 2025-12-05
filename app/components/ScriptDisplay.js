'use client';

import { useState } from 'react';

export default function ScriptDisplay({ script, isLoading, gamePk }) {
  const [copied, setCopied] = useState(false);

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
  );
}
