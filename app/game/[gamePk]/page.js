'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { getTeam, getTeamLogo, getRivalry } from '@/lib/teams';
import KeyPlays from '@/app/components/KeyPlays';
import ScriptOptions from '@/app/components/ScriptOptions';
import ScriptDisplay from '@/app/components/ScriptDisplay';
import AtBatBrowser from '@/app/components/AtBatBrowser';

export default function GamePage({ params }) {
  const { gamePk } = use(params);
  const [gameData, setGameData] = useState(null);
  const [linescore, setLinescore] = useState(null);
  const [keyPlays, setKeyPlays] = useState([]);
  const [biggestSwings, setBiggestSwings] = useState([]);
  const [gameSummary, setGameSummary] = useState(null);
  const [highlights, setHighlights] = useState([]);
  const [atBats, setAtBats] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Script generation state
  const [scriptStyle, setScriptStyle] = useState('excited');
  const [scriptLength, setScriptLength] = useState('60');
  const [script, setScript] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  // Custom video from selected at-bats
  const [selectedClips, setSelectedClips] = useState([]);
  const [isGeneratingCustomVideo, setIsGeneratingCustomVideo] = useState(false);
  const [customVideo, setCustomVideo] = useState(null);

  useEffect(() => {
    const fetchGameData = async () => {
      setIsLoading(true);
      try {
        const response = await fetch(`/api/game/${gamePk}`);
        if (!response.ok) throw new Error('Failed to fetch game data');

        const data = await response.json();
        setGameData(data.gameData);
        setLinescore(data.linescore);
        setKeyPlays(data.keyPlays || []);
        setBiggestSwings(data.biggestSwings || []);
        setGameSummary(data.gameSummary);
        setHighlights(data.highlights || []);
        setAtBats(data.atBats || []);
      } catch (err) {
        console.error('Error:', err);
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    };

    if (gamePk) {
      fetchGameData();
    }
  }, [gamePk]);

  const generateScript = async () => {
    setIsGenerating(true);
    try {
      const response = await fetch('/api/generate-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameData,
          keyPlays,
          biggestSwings,
          gameSummary,
          highlights,
          style: scriptStyle,
          length: scriptLength,
        }),
      });

      if (!response.ok) throw new Error('Failed to generate script');

      const data = await response.json();
      setScript(data.script);
    } catch (err) {
      console.error('Error generating script:', err);
      setError('Failed to generate script. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-mlb-red border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-400">Loading game data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <div className="text-6xl mb-4">⚠️</div>
        <h2 className="text-xl font-bold text-white mb-2">Error Loading Game</h2>
        <p className="text-gray-400 mb-4">{error}</p>
        <Link href="/" className="text-mlb-red hover:underline">
          ← Back to Games
        </Link>
      </div>
    );
  }

  const awayTeam = getTeam(gameData?.teams?.away?.id);
  const homeTeam = getTeam(gameData?.teams?.home?.id);
  const rivalry = getRivalry(gameData?.teams?.away?.id, gameData?.teams?.home?.id);

  // Get scores from linescore (more reliable than gameData.teams)
  const awayScore = linescore?.teams?.away?.runs ?? 0;
  const homeScore = linescore?.teams?.home?.runs ?? 0;

  return (
    <div className="space-y-8">
      {/* Back link */}
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to Games
      </Link>

      {/* Game Header */}
      <section className="bg-mlb-charcoal rounded-2xl p-6 border border-white/10">
        {/* Rivalry badge */}
        {rivalry && (
          <div className="flex justify-center mb-4">
            <span className="px-3 py-1 bg-mlb-red/20 text-mlb-red text-sm font-semibold rounded-full">
              ⚔️ {rivalry.name} Rivalry
            </span>
          </div>
        )}

        {/* Teams and Score */}
        <div className="flex items-center justify-center gap-8">
          {/* Away Team */}
          <div className="text-center">
            <img
              src={getTeamLogo(gameData?.teams?.away?.id)}
              alt={awayTeam?.name}
              className="w-20 h-20 mx-auto mb-2"
            />
            <h2 className="text-xl font-bold text-white">{awayTeam?.name}</h2>
            <p className="text-gray-400 text-sm">
              {gameData?.teams?.away?.record?.wins}-{gameData?.teams?.away?.record?.losses}
            </p>
          </div>

          {/* Score */}
          <div className="text-center px-8">
            <div className="flex items-center gap-4">
              <span className={`text-5xl font-bold ${
                awayScore > homeScore
                  ? 'text-white'
                  : 'text-gray-500'
              }`}>
                {awayScore}
              </span>
              <span className="text-2xl text-gray-600">-</span>
              <span className={`text-5xl font-bold ${
                homeScore > awayScore
                  ? 'text-white'
                  : 'text-gray-500'
              }`}>
                {homeScore}
              </span>
            </div>
            <p className="text-sm text-mlb-green font-medium mt-2">
              {gameData?.status?.detailedState || 'Final'}
            </p>
          </div>

          {/* Home Team */}
          <div className="text-center">
            <img
              src={getTeamLogo(gameData?.teams?.home?.id)}
              alt={homeTeam?.name}
              className="w-20 h-20 mx-auto mb-2"
            />
            <h2 className="text-xl font-bold text-white">{homeTeam?.name}</h2>
            <p className="text-gray-400 text-sm">
              {gameData?.teams?.home?.record?.wins}-{gameData?.teams?.home?.record?.losses}
            </p>
          </div>
        </div>

        {/* Venue and Date */}
        <div className="text-center mt-4 text-sm text-gray-500">
          {gameData?.venue?.name} • {gameData?.datetime?.officialDate}
        </div>

        {/* Game Stats */}
        {gameSummary && (
          <div className="flex justify-center gap-6 mt-4 pt-4 border-t border-white/10">
            <div className="text-center">
              <div className="text-2xl font-bold text-white">{gameSummary.homeRuns}</div>
              <div className="text-xs text-gray-500">Home Runs</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-white">{gameSummary.strikeouts}</div>
              <div className="text-xs text-gray-500">Strikeouts</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-white">{gameSummary.totalPlays}</div>
              <div className="text-xs text-gray-500">Total Plays</div>
            </div>
          </div>
        )}
      </section>

      {/* Key Plays */}
      <section>
        <h2 className="text-xl font-bold text-white mb-4">
          Key Plays ({keyPlays.length})
        </h2>
        <KeyPlays plays={keyPlays} />
      </section>

      {/* At-Bat Browser - Film Room Integration */}
      {atBats.length > 0 && (
        <section>
          <AtBatBrowser
            atBats={atBats}
            gamePk={gamePk}
            onSelectClips={setSelectedClips}
          />

          {/* Custom Video Generation from Selected Clips */}
          {selectedClips.length > 0 && (
            <div className="mt-4 p-4 bg-mlb-charcoal rounded-xl border border-white/10">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-white">
                    Create Custom Highlight
                  </h3>
                  <p className="text-sm text-gray-400">
                    {selectedClips.length} clip{selectedClips.length !== 1 ? 's' : ''} selected
                  </p>
                </div>
                <button
                  onClick={async () => {
                    setIsGeneratingCustomVideo(true);
                    try {
                      // Transform selected clips to match expected format
                      const clipsForVideo = selectedClips.map(clip => ({
                        id: clip.id,
                        videoUrl: clip.videoUrl,
                        headline: clip.headline,
                        event: clip.result,
                        batter: clip.batter,
                        playDescription: clip.description,
                        inning: clip.inning,
                        halfInning: clip.halfInning,
                      }));

                      const response = await fetch('/api/generate-custom-video', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          gameData,
                          clips: clipsForVideo,
                          style: scriptStyle,
                          gamePk,
                        }),
                      });

                      if (!response.ok) throw new Error('Failed to generate video');

                      const data = await response.json();
                      setCustomVideo(data);
                    } catch (err) {
                      console.error('Error generating custom video:', err);
                      setError('Failed to generate custom video');
                    } finally {
                      setIsGeneratingCustomVideo(false);
                    }
                  }}
                  disabled={isGeneratingCustomVideo}
                  className={`px-6 py-3 rounded-xl font-bold transition-all ${
                    isGeneratingCustomVideo
                      ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                      : 'bg-mlb-red hover:bg-red-600 text-white'
                  }`}
                >
                  {isGeneratingCustomVideo ? (
                    <span className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Generating...
                    </span>
                  ) : (
                    'Generate Custom Video'
                  )}
                </button>
              </div>

              {/* Custom Video Result */}
              {customVideo && (
                <div className="mt-4 pt-4 border-t border-white/10">
                  <video
                    src={`data:video/mp4;base64,${customVideo.video}`}
                    controls
                    className="w-full rounded-lg"
                  />
                  <a
                    href={`data:video/mp4;base64,${customVideo.video}`}
                    download={`custom-highlight-${gamePk}.mp4`}
                    className="inline-block mt-3 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm text-white transition-colors"
                  >
                    Download Video
                  </a>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* Script Generation */}
      <section className="bg-mlb-charcoal rounded-2xl p-6 border border-white/10">
        <h2 className="text-xl font-bold text-white mb-6">
          Generate Highlight Script
        </h2>

        <ScriptOptions
          style={scriptStyle}
          length={scriptLength}
          onStyleChange={setScriptStyle}
          onLengthChange={setScriptLength}
        />

        <button
          onClick={generateScript}
          disabled={isGenerating || keyPlays.length === 0}
          className={`w-full mt-6 py-4 rounded-xl font-bold text-lg transition-all ${
            isGenerating || keyPlays.length === 0
              ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
              : 'bg-mlb-red hover:bg-red-600 text-white hover:scale-[1.02]'
          }`}
        >
          {isGenerating ? (
            <span className="flex items-center justify-center gap-3">
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Generating Script...
            </span>
          ) : (
            '🎙️ Generate Script'
          )}
        </button>
      </section>

      {/* Generated Script */}
      {(script || isGenerating) && (
        <section>
          <ScriptDisplay
            script={script}
            isLoading={isGenerating}
            gamePk={gamePk}
            scriptStyle={scriptStyle}
            highlights={highlights}
            keyPlays={keyPlays}
            gameData={gameData}
          />
        </section>
      )}

      {/* Video Highlights */}
      {highlights.length > 0 && (
        <section>
          <h2 className="text-xl font-bold text-white mb-4">
            Available Video Clips ({highlights.length})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {highlights.slice(0, 6).map((h) => (
              <a
                key={h.id}
                href={h.videoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-mlb-charcoal rounded-xl p-4 border border-white/10 hover:border-mlb-red/50 transition-colors group"
              >
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-10 h-10 bg-mlb-red/20 rounded-lg flex items-center justify-center group-hover:bg-mlb-red/30 transition-colors">
                    <svg className="w-5 h-5 text-mlb-red" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-medium text-white truncate">{h.headline}</h3>
                    <p className="text-sm text-gray-500">{h.duration}</p>
                  </div>
                </div>
              </a>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
