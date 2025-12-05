'use client';

import { useState, useRef } from 'react';

export default function VideoPlayer({ videoBase64, onClose }) {
  const videoRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const downloadVideo = () => {
    const link = document.createElement('a');
    link.href = `data:video/mp4;base64,${videoBase64}`;
    link.download = 'highlight-package.mp4';
    link.click();
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      videoRef.current?.parentElement?.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  return (
    <div className="bg-mlb-charcoal rounded-xl overflow-hidden border border-white/10">
      {/* Video Container */}
      <div className="relative aspect-video bg-black">
        <video
          ref={videoRef}
          src={`data:video/mp4;base64,${videoBase64}`}
          controls
          className="w-full h-full"
        />
      </div>

      {/* Controls */}
      <div className="p-4 flex items-center justify-between">
        <div className="text-sm text-gray-400">
          Your highlight package is ready!
        </div>

        <div className="flex items-center gap-2">
          {/* Download Button */}
          <button
            onClick={downloadVideo}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-mlb-red hover:bg-red-600 text-white font-medium transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download
          </button>

          {/* Fullscreen Button */}
          <button
            onClick={toggleFullscreen}
            className="p-2 rounded-lg hover:bg-white/10 transition-colors"
            title="Fullscreen"
          >
            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {isFullscreen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9V5H5m0 0l4 4m6-4h4v4m0-4l-4 4M9 15v4H5m0 0l4-4m6 4h4v-4m0 4l-4-4" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
              )}
            </svg>
          </button>

          {/* Close Button */}
          {onClose && (
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-white/10 transition-colors"
              title="Close"
            >
              <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
