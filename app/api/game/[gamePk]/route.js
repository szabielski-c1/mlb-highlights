import { NextResponse } from 'next/server';
import { getGameFeed, getHighlights } from '@/lib/mlb-api';
import { analyzeGame, getGameSummary } from '@/lib/play-analyzer';
import { analyzeWinProbability, getBiggestSwings } from '@/lib/win-probability';
import { matchPlaysToHighlights } from '@/lib/highlight-matcher';
import { searchClips } from '@/lib/filmroom';

/**
 * Extract at-bats from game data with player IDs for Film Room lookup
 */
function extractAtBats(allPlays, gameDate) {
  const atBats = [];

  for (const play of allPlays) {
    // Skip non-at-bat plays
    if (!play.result?.event) continue;

    const batter = play.matchup?.batter;
    const pitcher = play.matchup?.pitcher;
    const about = play.about || {};

    // Get the pitches for count info
    const pitches = (play.playEvents || []).filter(e => e.isPitch);
    const firstPitch = pitches[0];
    const finalPitch = pitches[pitches.length - 1];

    // Get outs at the start of the at-bat from the first pitch
    const outsAtStart = firstPitch?.count?.outs ?? 0;

    atBats.push({
      playIndex: play.atBatIndex,
      inning: about.inning,
      halfInning: about.halfInning,
      outsAtStart, // Used to distinguish same batter multiple times in an inning
      batter: {
        id: batter?.id,
        name: batter?.fullName,
      },
      pitcher: {
        id: pitcher?.id,
        name: pitcher?.fullName,
      },
      result: play.result?.event,
      description: play.result?.description,
      rbi: play.result?.rbi || 0,
      isScoring: about.isScoringPlay,
      pitchCount: pitches.length,
      finalCount: finalPitch?.count ? `${finalPitch.count.balls}-${finalPitch.count.strikes}` : null,
      // Search params for Film Room
      filmRoomParams: {
        batterId: batter?.id,
        pitcherId: pitcher?.id,
        date: gameDate,
        inning: about.inning,
        outs: outsAtStart, // Add outs to distinguish multiple at-bats by same batter in same inning
      },
    });
  }

  return atBats;
}

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

    // Match key plays to their video highlights
    const keyPlaysWithHighlights = matchPlaysToHighlights(keyPlaysWithWP, highlights);

    const biggestSwings = getBiggestSwings(allPlays, 5);
    const gameSummary = getGameSummary(allPlays);

    // Extract at-bats with Film Room search params
    const gameDate = gameFeed.gameData?.datetime?.officialDate;
    const atBats = extractAtBats(allPlays, gameDate);

    return NextResponse.json({
      gamePk,
      gameData: gameFeed.gameData,
      linescore: gameFeed.liveData?.linescore,
      boxscore: gameFeed.liveData?.boxscore,
      decisions: gameFeed.liveData?.decisions,
      keyPlays: keyPlaysWithHighlights,
      biggestSwings,
      gameSummary,
      highlights,
      atBats, // All at-bats with Film Room search params
    });
  } catch (error) {
    console.error('Error fetching game data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch game data' },
      { status: 500 }
    );
  }
}
