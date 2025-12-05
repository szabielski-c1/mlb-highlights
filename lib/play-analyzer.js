/**
 * Play Analyzer - Identifies key plays and scores them by highlight-worthiness
 */

// Event types and their base highlight scores
const EVENT_SCORES = {
  'Home Run': 100,
  'Triple': 60,
  'Double': 30,
  'Single': 10,
  'Walk': 5,
  'Strikeout': 15,
  'Grounded Into DP': 25,
  'Double Play': 25,
  'Sac Fly': 20,
  'Hit By Pitch': 8,
  'Stolen Base': 20,
  'Caught Stealing': 15,
  'Wild Pitch': 15,
  'Passed Ball': 15,
  'Error': 20,
  'Flyout': 5,
  'Groundout': 5,
  'Lineout': 8,
  'Pop Out': 3,
};

/**
 * Calculate highlight score for a single play
 */
function calculatePlayScore(play, gameContext) {
  const event = play.result?.event || '';
  let score = EVENT_SCORES[event] || 5;

  // Scoring play bonus
  if (play.about?.isScoringPlay) {
    score += 30;
    // Extra bonus for multi-RBI plays
    const rbi = play.result?.rbi || 0;
    score += rbi * 15;
  }

  // Exit velocity bonus (for hits)
  const hitData = play.playEvents?.find(e => e.hitData)?.hitData;
  if (hitData) {
    const exitVelo = hitData.launchSpeed || 0;
    if (exitVelo >= 110) score += 30; // Barrel
    else if (exitVelo >= 105) score += 20;
    else if (exitVelo >= 100) score += 10;

    // Distance bonus for home runs
    if (event === 'Home Run' && hitData.totalDistance >= 450) {
      score += 25; // Monster shot
    }
  }

  // Situational bonuses
  const inning = play.about?.inning || 1;
  const isTopInning = play.about?.halfInning === 'top';

  // Late game bonus (7th inning or later)
  if (inning >= 7) score += 15;
  if (inning >= 9) score += 20;

  // Clutch situation bonus
  const outs = play.count?.outs || 0;
  if (outs === 2) score += 10;

  // Runners on base context
  const runners = play.runners?.length || 0;
  if (runners >= 2) score += 10;
  if (runners >= 3) score += 15; // Bases loaded potential

  // Lead change / tie game detection
  if (gameContext) {
    const { scoreBefore, scoreAfter } = getScoreChange(play, gameContext);
    if (scoreBefore.away === scoreBefore.home && scoreAfter.away !== scoreAfter.home) {
      score += 25; // Tie-breaking play
    }
    if ((scoreBefore.away > scoreBefore.home) !== (scoreAfter.away > scoreAfter.home)) {
      score += 35; // Lead change
    }
  }

  return score;
}

/**
 * Helper to track score changes
 */
function getScoreChange(play, gameContext) {
  // This would need game state tracking - simplified for now
  return {
    scoreBefore: { away: 0, home: 0 },
    scoreAfter: { away: 0, home: 0 },
  };
}

/**
 * Analyze all plays and return top highlights
 */
export function analyzeGame(allPlays, options = {}) {
  const { maxPlays = 10, minScore = 30 } = options;

  const scoredPlays = allPlays.map((play, index) => ({
    ...play,
    highlightScore: calculatePlayScore(play),
    playIndex: index,
  }));

  // Sort by score descending
  const sortedPlays = scoredPlays
    .filter(p => p.highlightScore >= minScore)
    .sort((a, b) => b.highlightScore - a.highlightScore)
    .slice(0, maxPlays);

  // Re-sort by game order for narrative flow
  return sortedPlays.sort((a, b) => a.playIndex - b.playIndex);
}

/**
 * Get play type badge info
 */
export function getPlayBadge(play) {
  const event = play.result?.event || '';

  const badges = {
    'Home Run': { label: 'HR', color: 'bg-mlb-red', priority: 1 },
    'Triple': { label: '3B', color: 'bg-purple-500', priority: 2 },
    'Double': { label: '2B', color: 'bg-blue-500', priority: 3 },
    'Strikeout': { label: 'K', color: 'bg-gray-500', priority: 4 },
    'Double Play': { label: 'DP', color: 'bg-yellow-600', priority: 4 },
    'Grounded Into DP': { label: 'DP', color: 'bg-yellow-600', priority: 4 },
    'Stolen Base': { label: 'SB', color: 'bg-green-500', priority: 5 },
  };

  if (badges[event]) return badges[event];

  if (play.about?.isScoringPlay) {
    return { label: 'RUN', color: 'bg-mlb-green', priority: 3 };
  }

  return { label: event.slice(0, 3).toUpperCase(), color: 'bg-gray-600', priority: 10 };
}

/**
 * Format play for display
 */
export function formatPlay(play) {
  return {
    inning: play.about?.inning,
    halfInning: play.about?.halfInning,
    event: play.result?.event,
    description: play.result?.description,
    rbi: play.result?.rbi || 0,
    batter: play.matchup?.batter?.fullName,
    pitcher: play.matchup?.pitcher?.fullName,
    isScoringPlay: play.about?.isScoringPlay,
    hitData: play.playEvents?.find(e => e.hitData)?.hitData,
    highlightScore: play.highlightScore,
    badge: getPlayBadge(play),
  };
}

/**
 * Get game summary stats
 */
export function getGameSummary(allPlays) {
  const events = {};
  let totalRuns = 0;
  let scoringPlays = 0;

  allPlays.forEach(play => {
    const event = play.result?.event;
    if (event) {
      events[event] = (events[event] || 0) + 1;
    }
    if (play.about?.isScoringPlay) {
      scoringPlays++;
      totalRuns += play.result?.rbi || 0;
    }
  });

  return {
    totalPlays: allPlays.length,
    homeRuns: events['Home Run'] || 0,
    strikeouts: events['Strikeout'] || 0,
    doubles: events['Double'] || 0,
    triples: events['Triple'] || 0,
    walks: events['Walk'] || 0,
    scoringPlays,
    totalRuns,
  };
}
