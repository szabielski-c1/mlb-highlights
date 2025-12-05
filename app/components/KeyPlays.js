'use client';

import { formatPlay } from '@/lib/play-analyzer';

export default function KeyPlays({ plays }) {
  if (!plays || plays.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400">
        No key plays identified for this game.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {plays.map((play, index) => {
        const formatted = formatPlay(play);
        // Use the pre-matched highlight from the API
        const video = play.matchedHighlight;

        return (
          <div
            key={index}
            className="bg-mlb-charcoal rounded-xl p-4 border border-white/5 hover:border-white/10 transition-colors"
          >
            <div className="flex items-start gap-4">
              {/* Inning indicator */}
              <div className="flex-shrink-0 w-14 text-center">
                <div className="text-xs text-gray-500 uppercase">
                  {formatted.halfInning === 'top' ? 'Top' : 'Bot'}
                </div>
                <div className="text-2xl font-bold text-white">
                  {formatted.inning}
                </div>
              </div>

              {/* Play details */}
              <div className="flex-grow min-w-0">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  {/* Event badge */}
                  <span className={`px-2 py-0.5 rounded text-xs font-bold text-white ${formatted.badge.color}`}>
                    {formatted.badge.label}
                  </span>

                  {/* WP indicator if significant */}
                  {play.wpChange && play.wpChange >= 0.15 && (
                    <span className="px-2 py-0.5 rounded text-xs font-medium bg-yellow-500/20 text-yellow-400">
                      {play.wpSwing > 0 ? '↑' : '↓'} {Math.round(play.wpChange * 100)}% WP
                    </span>
                  )}

                  {/* Video available indicator */}
                  {video && (
                    <a
                      href={video.videoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2 py-0.5 rounded text-xs font-medium bg-blue-500/20 text-blue-400 hover:bg-blue-500/30"
                    >
                      ▶ Watch
                    </a>
                  )}
                </div>

                {/* Description */}
                <p className="text-white font-medium mb-1">
                  {formatted.description}
                </p>

                {/* Matchup */}
                <p className="text-sm text-gray-400">
                  {formatted.batter} vs {formatted.pitcher}
                </p>

                {/* Hit data if available */}
                {formatted.hitData && (
                  <div className="flex gap-4 mt-2 text-xs text-gray-500">
                    {formatted.hitData.launchSpeed && (
                      <span>Exit Velo: <span className="text-white">{formatted.hitData.launchSpeed} mph</span></span>
                    )}
                    {formatted.hitData.totalDistance && (
                      <span>Distance: <span className="text-white">{formatted.hitData.totalDistance} ft</span></span>
                    )}
                    {formatted.hitData.launchAngle && (
                      <span>Launch Angle: <span className="text-white">{formatted.hitData.launchAngle}°</span></span>
                    )}
                  </div>
                )}
              </div>

              {/* Highlight score indicator */}
              <div className="flex-shrink-0 text-right">
                <div className="text-xs text-gray-500">Score</div>
                <div className={`text-lg font-bold ${
                  formatted.highlightScore >= 80 ? 'text-mlb-red' :
                  formatted.highlightScore >= 50 ? 'text-yellow-400' :
                  'text-gray-400'
                }`}>
                  {formatted.highlightScore}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
