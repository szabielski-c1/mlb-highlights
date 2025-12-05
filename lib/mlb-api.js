const MLB_API_BASE = 'https://statsapi.mlb.com/api/v1';
const MLB_API_V11 = 'https://statsapi.mlb.com/api/v1.1';

/**
 * Fetch schedule for a specific date
 * @param {string} date - Format: YYYY-MM-DD
 */
export async function getSchedule(date) {
  const url = `${MLB_API_BASE}/schedule?sportId=1&date=${date}&hydrate=team,linescore`;
  const response = await fetch(url);
  const data = await response.json();

  if (!data.dates || data.dates.length === 0) {
    return [];
  }

  return data.dates[0].games.map(game => ({
    gamePk: game.gamePk,
    gameDate: game.gameDate,
    status: game.status.detailedState,
    venue: game.venue?.name,
    away: {
      id: game.teams.away.team.id,
      name: game.teams.away.team.name,
      abbreviation: game.teams.away.team.abbreviation,
      score: game.teams.away.score,
      wins: game.teams.away.leagueRecord?.wins,
      losses: game.teams.away.leagueRecord?.losses,
    },
    home: {
      id: game.teams.home.team.id,
      name: game.teams.home.team.name,
      abbreviation: game.teams.home.team.abbreviation,
      score: game.teams.home.score,
      wins: game.teams.home.leagueRecord?.wins,
      losses: game.teams.home.leagueRecord?.losses,
    },
    linescore: game.linescore,
  }));
}

/**
 * Fetch full game feed with play-by-play data
 * @param {string} gamePk - Game ID
 */
export async function getGameFeed(gamePk) {
  const url = `${MLB_API_V11}/game/${gamePk}/feed/live`;
  const response = await fetch(url);
  const data = await response.json();

  return {
    gamePk: data.gamePk,
    gameData: {
      datetime: data.gameData?.datetime,
      status: data.gameData?.status,
      teams: data.gameData?.teams,
      venue: data.gameData?.venue,
      weather: data.gameData?.weather,
    },
    liveData: {
      plays: data.liveData?.plays,
      linescore: data.liveData?.linescore,
      boxscore: data.liveData?.boxscore,
      decisions: data.liveData?.decisions,
    },
  };
}

/**
 * Fetch available video highlights for a game
 * @param {string} gamePk - Game ID
 */
export async function getHighlights(gamePk) {
  const url = `${MLB_API_BASE}/game/${gamePk}/content`;
  const response = await fetch(url);
  const data = await response.json();

  const highlights = data.highlights?.highlights?.items || [];

  return highlights
    .filter(h => h.type === 'video')
    .map(h => {
      // Extract player IDs from keywords
      const playerIds = h.keywordsAll
        ?.filter(k => k.type === 'player_id')
        .map(k => parseInt(k.value)) || [];

      // Extract play type from keywords
      const playTypes = h.keywordsAll
        ?.filter(k => k.type === 'taxonomy')
        .map(k => k.value) || [];

      // Check if this is an in-game highlight (vs recap/interview)
      const isInGameHighlight = playTypes.includes('in-game-highlight') || playTypes.includes('highlight');

      return {
        id: h.id,
        headline: h.headline,
        blurb: h.blurb,
        description: h.description,
        duration: h.duration,
        playerIds,
        playTypes,
        isInGameHighlight,
        // Multiple quality options
        videoUrl: h.playbacks?.find(p => p.name === 'mp4Avc')?.url,
        videoUrlHigh: h.playbacks?.find(p => p.name === 'highBit')?.url,
        // Thumbnail
        thumbnail: h.image?.cuts?.find(c => c.width === 640)?.src,
      };
    });
}

/**
 * Fetch player stats for a season
 * @param {string} playerId - Player ID
 * @param {string} season - Year (e.g., "2024")
 */
export async function getPlayerStats(playerId, season) {
  const url = `${MLB_API_BASE}/people/${playerId}?hydrate=stats(group=[hitting,pitching],type=season,season=${season})`;
  const response = await fetch(url);
  const data = await response.json();

  const player = data.people?.[0];
  if (!player) return null;

  return {
    id: player.id,
    fullName: player.fullName,
    position: player.primaryPosition?.abbreviation,
    stats: player.stats,
  };
}

/**
 * Get all plays from a game
 * @param {object} gameFeed - Game feed data from getGameFeed
 */
export function getAllPlays(gameFeed) {
  return gameFeed.liveData?.plays?.allPlays || [];
}

/**
 * Get scoring plays from a game
 * @param {object} gameFeed - Game feed data from getGameFeed
 */
export function getScoringPlays(gameFeed) {
  const allPlays = getAllPlays(gameFeed);
  return allPlays.filter(play => play.about?.isScoringPlay);
}
