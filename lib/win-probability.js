/**
 * Win Probability Analysis
 * Tracks win probability changes and identifies momentum swings
 */

/**
 * Simple win probability estimation based on game state
 * This is a simplified model - MLB has more sophisticated calculations
 */
function estimateWinProbability(homeScore, awayScore, inning, isTop, outs) {
  const scoreDiff = homeScore - awayScore;
  const inningsRemaining = Math.max(0, 9 - inning + (isTop ? 0.5 : 0));

  // Base probability from score differential
  // Each run is worth roughly 10% in expected win probability
  let homeWinProb = 0.5 + (scoreDiff * 0.1);

  // Adjust for innings remaining (advantages diminish late in game)
  const leverageMultiplier = Math.max(0.3, inningsRemaining / 9);

  // Close games have more uncertainty
  if (Math.abs(scoreDiff) <= 2) {
    homeWinProb = 0.5 + (scoreDiff * 0.08 * (1 - leverageMultiplier * 0.5));
  }

  // Late game with lead is more certain
  if (inning >= 9 && scoreDiff > 0) {
    homeWinProb = 0.5 + (scoreDiff * 0.15) + 0.1;
  }

  // Clamp between 1% and 99%
  return Math.max(0.01, Math.min(0.99, homeWinProb));
}

/**
 * Calculate running score through the game
 */
function calculateRunningScore(allPlays) {
  let homeScore = 0;
  let awayScore = 0;

  return allPlays.map(play => {
    const prevHome = homeScore;
    const prevAway = awayScore;

    // Update scores based on runs scored
    if (play.about?.isScoringPlay) {
      const isTopInning = play.about?.halfInning === 'top';
      const runs = play.result?.rbi || 0;

      if (isTopInning) {
        awayScore += runs;
      } else {
        homeScore += runs;
      }
    }

    return {
      ...play,
      scoreBefore: { home: prevHome, away: prevAway },
      scoreAfter: { home: homeScore, away: awayScore },
    };
  });
}

/**
 * Analyze win probability swings throughout the game
 */
export function analyzeWinProbability(allPlays) {
  const playsWithScores = calculateRunningScore(allPlays);

  let results = [];

  playsWithScores.forEach((play, index) => {
    const inning = play.about?.inning || 1;
    const isTop = play.about?.halfInning === 'top';
    const outs = play.count?.outs || 0;

    // Calculate win prob before and after this play
    const probBefore = estimateWinProbability(
      play.scoreBefore.home,
      play.scoreBefore.away,
      inning,
      isTop,
      outs
    );

    const probAfter = estimateWinProbability(
      play.scoreAfter.home,
      play.scoreAfter.away,
      inning,
      isTop,
      outs
    );

    const wpChange = Math.abs(probAfter - probBefore);
    const wpSwing = probAfter - probBefore; // Positive = good for home team

    results.push({
      ...play,
      playIndex: index,
      winProbBefore: probBefore,
      winProbAfter: probAfter,
      wpChange,
      wpSwing,
      isMomentumShift: wpChange >= 0.15,
      isTurningPoint: wpChange >= 0.25,
    });
  });

  return results;
}

/**
 * Get the biggest momentum swings in the game
 */
export function getBiggestSwings(allPlays, limit = 5) {
  const analyzed = analyzeWinProbability(allPlays);

  return analyzed
    .filter(p => p.wpChange >= 0.10) // At least 10% swing
    .sort((a, b) => b.wpChange - a.wpChange)
    .slice(0, limit)
    .map(p => ({
      playIndex: p.playIndex,
      inning: p.about?.inning,
      halfInning: p.about?.halfInning,
      event: p.result?.event,
      description: p.result?.description,
      batter: p.matchup?.batter?.fullName,
      wpChange: p.wpChange,
      wpSwing: p.wpSwing,
      isTurningPoint: p.isTurningPoint,
      scoreBefore: p.scoreBefore,
      scoreAfter: p.scoreAfter,
    }));
}

/**
 * Identify the single most pivotal moment in the game
 */
export function getGameTurningPoint(allPlays) {
  const swings = getBiggestSwings(allPlays, 1);
  return swings.length > 0 ? swings[0] : null;
}

/**
 * Format win probability for display (e.g., "73%" or "+15%")
 */
export function formatWinProb(prob, asChange = false) {
  const pct = Math.round(prob * 100);
  if (asChange) {
    return prob >= 0 ? `+${pct}%` : `${pct}%`;
  }
  return `${pct}%`;
}

/**
 * Get narrative description of a momentum swing
 */
export function describeSwing(swing) {
  const direction = swing.wpSwing > 0 ? 'home team' : 'away team';
  const magnitude = swing.wpChange;

  if (magnitude >= 0.30) {
    return `A game-changing moment that dramatically shifted the odds in favor of the ${direction}`;
  } else if (magnitude >= 0.20) {
    return `A pivotal play that significantly boosted the ${direction}'s chances`;
  } else if (magnitude >= 0.15) {
    return `An important moment that swung momentum toward the ${direction}`;
  } else {
    return `A key play that helped the ${direction}`;
  }
}
