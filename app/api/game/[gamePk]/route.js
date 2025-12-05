import { NextResponse } from 'next/server';
import { getGameFeed, getHighlights } from '@/lib/mlb-api';
import { analyzeGame, getGameSummary } from '@/lib/play-analyzer';
import { analyzeWinProbability, getBiggestSwings } from '@/lib/win-probability';

export async function GET(request, { params }) {
  const { gamePk } = await params;

  if (!gamePk) {
    return NextResponse.json(
      { error: 'Missing gamePk parameter' },
      { status: 400 }
    );
  }

  try {
    // Fetch game data and highlights in parallel
    const [gameFeed, highlights] = await Promise.all([
      getGameFeed(gamePk),
      getHighlights(gamePk),
    ]);

    const allPlays = gameFeed.liveData?.plays?.allPlays || [];

    // Analyze plays
    const keyPlays = analyzeGame(allPlays, { maxPlays: 12, minScore: 25 });

    // Add win probability data to key plays
    const wpAnalysis = analyzeWinProbability(allPlays);
    const wpByIndex = {};
    wpAnalysis.forEach(p => {
      wpByIndex[p.playIndex] = {
        wpChange: p.wpChange,
        wpSwing: p.wpSwing,
        isMomentumShift: p.isMomentumShift,
        isTurningPoint: p.isTurningPoint,
      };
    });

    const keyPlaysWithWP = keyPlays.map(p => ({
      ...p,
      ...(wpByIndex[p.playIndex] || {}),
    }));

    const biggestSwings = getBiggestSwings(allPlays, 5);
    const gameSummary = getGameSummary(allPlays);

    return NextResponse.json({
      gamePk,
      gameData: gameFeed.gameData,
      linescore: gameFeed.liveData?.linescore,
      boxscore: gameFeed.liveData?.boxscore,
      decisions: gameFeed.liveData?.decisions,
      keyPlays: keyPlaysWithWP,
      biggestSwings,
      gameSummary,
      highlights,
    });
  } catch (error) {
    console.error('Error fetching game data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch game data' },
      { status: 500 }
    );
  }
}
