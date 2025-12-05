/**
 * Highlight Matcher - Links key plays to their corresponding video clips
 */

/**
 * Match a key play to its highlight video based on player ID and description
 * @param {object} play - Key play from play analyzer
 * @param {array} highlights - Array of highlight clips from MLB API
 * @returns {object|null} - Matched highlight or null
 */
function matchPlayToHighlight(play, highlights) {
  const batterId = play.matchup?.batter?.id;
  const pitcherId = play.matchup?.pitcher?.id;
  const playDescription = (play.result?.description || '').toLowerCase();
  const event = play.result?.event || '';

  // Filter to in-game highlights only (not recaps/interviews)
  const inGameHighlights = highlights.filter(h => h.isInGameHighlight);

  // Score each highlight for how well it matches this play
  const scoredHighlights = inGameHighlights.map(highlight => {
    let score = 0;

    // Player ID match is the strongest signal
    if (batterId && highlight.playerIds?.includes(batterId)) {
      score += 50;
    }
    if (pitcherId && highlight.playerIds?.includes(pitcherId)) {
      score += 20;
    }

    // Check description for player name matches
    const batterName = play.matchup?.batter?.fullName?.toLowerCase() || '';
    const highlightText = `${highlight.headline || ''} ${highlight.description || ''} ${highlight.blurb || ''}`.toLowerCase();

    if (batterName && highlightText.includes(batterName.split(' ').pop())) {
      score += 30; // Last name match in highlight text
    }

    // Event type matching
    const eventMatches = {
      'Home Run': ['homer', 'home run', 'hr', 'dinger', 'blast', 'smashes'],
      'Triple': ['triple', '3b'],
      'Double': ['double', '2b', 'rbi double'],
      'Strikeout': ['strikeout', 'strikes out', 'k\'s', 'fans'],
      'Double Play': ['double play', 'dp', 'turns two'],
      'Stolen Base': ['steals', 'stolen base', 'swipes'],
      'Walk': ['walk', 'base on balls', 'bb'],
    };

    if (eventMatches[event]) {
      for (const term of eventMatches[event]) {
        if (highlightText.includes(term)) {
          score += 25;
          break;
        }
      }
    }

    // Inning matching (if available in highlight)
    const playInning = play.about?.inning;
    const inningMatch = highlightText.match(/(\d+)(st|nd|rd|th)\s*(inning)?/i);
    if (inningMatch && parseInt(inningMatch[1]) === playInning) {
      score += 15;
    }

    // Check play types from highlight keywords
    if (highlight.playTypes) {
      if (event === 'Home Run' && highlight.playTypes.some(t => t.includes('home-run'))) {
        score += 30;
      }
      if (event === 'Strikeout' && highlight.playTypes.some(t => t.includes('strikeout'))) {
        score += 30;
      }
    }

    return { highlight, score };
  });

  // Return best match if score is high enough
  const bestMatch = scoredHighlights
    .filter(h => h.score >= 30) // Minimum threshold
    .sort((a, b) => b.score - a.score)[0];

  return bestMatch ? { ...bestMatch.highlight, matchScore: bestMatch.score } : null;
}

/**
 * Match all key plays to their highlight videos
 * @param {array} keyPlays - Array of key plays
 * @param {array} highlights - Array of highlight clips
 * @returns {array} - Key plays with matched highlights
 */
export function matchPlaysToHighlights(keyPlays, highlights) {
  const usedHighlights = new Set();

  return keyPlays.map(play => {
    // Filter out already-used highlights to prevent duplicates
    const availableHighlights = highlights.filter(h => !usedHighlights.has(h.id));
    const matchedHighlight = matchPlayToHighlight(play, availableHighlights);

    if (matchedHighlight) {
      usedHighlights.add(matchedHighlight.id);
    }

    return {
      ...play,
      matchedHighlight,
    };
  });
}

/**
 * Get only the key plays that have matching video clips
 * @param {array} keyPlays - Array of key plays
 * @param {array} highlights - Array of highlight clips
 * @returns {array} - Key plays with matched highlights (filtered to only those with matches)
 */
export function getPlaysWithVideos(keyPlays, highlights) {
  const matched = matchPlaysToHighlights(keyPlays, highlights);
  return matched.filter(play => play.matchedHighlight);
}

/**
 * Build a video package from matched plays
 * @param {array} matchedPlays - Array of plays with matched highlights
 * @returns {array} - Array of video clips in play order
 */
export function buildVideoPackage(matchedPlays) {
  return matchedPlays
    .filter(play => play.matchedHighlight?.videoUrl)
    .map(play => ({
      playDescription: play.result?.description,
      event: play.result?.event,
      inning: play.about?.inning,
      halfInning: play.about?.halfInning,
      batter: play.matchup?.batter?.fullName,
      videoUrl: play.matchedHighlight.videoUrl,
      videoUrlHigh: play.matchedHighlight.videoUrlHigh,
      headline: play.matchedHighlight.headline,
      duration: play.matchedHighlight.duration,
      thumbnail: play.matchedHighlight.thumbnail,
      matchScore: play.matchedHighlight.matchScore,
    }));
}
