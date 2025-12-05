/**
 * MLB Film Room API - Access video for every pitch
 * Uses the MLB fastball-gateway GraphQL API to search and retrieve video clips
 */

// GraphQL queries for MLB Film Room
const FILMROOM_CLIP_QUERY = `query clipQuery($ids: [String], $languagePreference: LanguagePreference, $idType: MediaPlaybackIdType, $userId: String!, $withUser: Boolean!) {
  mediaPlayback(ids: $ids, languagePreference: $languagePreference, idType: $idType) {
    id
    slug
    title
    blurb
    description
    date
    feeds {
      type
      duration
      playbacks {
        name
        url
        __typename
      }
      __typename
    }
    playInfo {
      balls
      strikes
      outs
      inning
      inningHalf
      pitchSpeed
      pitchType
      exitVelocity
      hitDistance
      launchAngle
      gamePk
      teams {
        away { name shortName triCode __typename }
        home { name shortName triCode __typename }
        batting { name shortName triCode __typename }
        pitching { name shortName triCode __typename }
        __typename
      }
      players {
        pitcher { id name lastName __typename }
        batter { id name lastName __typename }
        __typename
      }
      __typename
    }
    __typename
  }
}`;

const FILMROOM_SEARCH_QUERY = `query Search($query: String!, $page: Int, $limit: Int, $feedPreference: FeedPreference, $languagePreference: LanguagePreference, $contentPreference: ContentPreference, $queryType: QueryType = STRUCTURED) {
  search(query: $query, limit: $limit, page: $page, feedPreference: $feedPreference, languagePreference: $languagePreference, contentPreference: $contentPreference, queryType: $queryType) {
    plays {
      mediaPlayback {
        id
        slug
        blurb
        date
        description
        title
        feeds {
          type
          duration
          playbacks {
            name
            url
            __typename
          }
          __typename
        }
        playInfo {
          balls
          strikes
          outs
          inning
          inningHalf
          pitchSpeed
          pitchType
          exitVelocity
          hitDistance
          gamePk
          teams {
            away { name shortName triCode __typename }
            home { name shortName triCode __typename }
            batting { name shortName triCode __typename }
            __typename
          }
          players {
            pitcher { id name lastName __typename }
            batter { id name lastName __typename }
            __typename
          }
          __typename
        }
        __typename
      }
      __typename
    }
    total
    __typename
  }
}`;

const FILMROOM_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:92.0) Gecko/20100101 Firefox/92.0',
  'Accept': '*/*',
  'Accept-Language': 'en-US,en;q=0.5',
  'Content-Type': 'application/json',
  'Origin': 'https://www.mlb.com',
  'Referer': 'https://www.mlb.com',
};

// Feed priority - prefer CMS high quality, then HOME, then AWAY
const FEED_PRIORITY = [
  'CMS_highBit',
  'CMS_mp4Avc',
  'HOME_mp4Avc',
  'AWAY_mp4Avc',
  'NETWORK_mp4Avc',
];

/**
 * Search for video clips matching specific criteria
 * @param {Object} params - Search parameters
 * @param {number} params.batterId - MLB player ID for batter
 * @param {number} params.pitcherId - MLB player ID for pitcher
 * @param {string} params.date - Game date (YYYY-MM-DD)
 * @param {number} params.inning - Inning number
 * @param {number} params.balls - Ball count
 * @param {number} params.strikes - Strike count
 * @param {string} params.pitchType - Pitch type code (FF, SL, etc.)
 * @param {number} params.gamePk - Game ID
 * @returns {Promise<Array>} - Array of matching clips
 */
export async function searchClips(params) {
  const queryParts = [];

  if (params.batterId) {
    queryParts.push(`BatterId = [${params.batterId}]`);
  }
  if (params.pitcherId) {
    queryParts.push(`PitcherId = [${params.pitcherId}]`);
  }
  if (params.date) {
    queryParts.push(`Date = ["${params.date}"]`);
  }
  if (params.inning) {
    queryParts.push(`Inning = [${params.inning}]`);
  }
  if (params.balls !== undefined) {
    queryParts.push(`Balls = [${params.balls}]`);
  }
  if (params.strikes !== undefined) {
    queryParts.push(`Strikes = [${params.strikes}]`);
  }
  if (params.pitchType) {
    queryParts.push(`PitchType = ["${params.pitchType}"]`);
  }
  if (params.outs !== undefined) {
    queryParts.push(`Outs = [${params.outs}]`);
  }

  const query = queryParts.join(' AND ') + ' Order By Timestamp DESC';

  const url = new URL('https://fastball-gateway.mlb.com/graphql');
  url.searchParams.set('query', FILMROOM_SEARCH_QUERY);
  url.searchParams.set('operationName', 'Search');
  url.searchParams.set('variables', JSON.stringify({
    query,
    limit: 25,
    page: 0,
    languagePreference: 'EN',
    contentPreference: 'CMS_FIRST',
    queryType: null,
  }));

  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: FILMROOM_HEADERS,
    });

    if (!response.ok) {
      throw new Error(`Film Room search failed: ${response.status}`);
    }

    const data = await response.json();
    const plays = data?.data?.search?.plays || [];

    return plays.map(play => {
      const mp = play.mediaPlayback?.[0] || play.mediaPlayback;
      if (!mp) return null;

      return {
        id: mp.id,
        slug: mp.slug,
        title: mp.title,
        description: mp.blurb || mp.description,
        date: mp.date,
        playInfo: mp.playInfo,
        feeds: mp.feeds,
        videoUrl: getBestVideoUrl(mp.feeds),
        homeVideoUrl: getVideoUrlByFeed(mp.feeds, 'HOME'),
        awayVideoUrl: getVideoUrlByFeed(mp.feeds, 'AWAY'),
      };
    }).filter(Boolean);
  } catch (error) {
    console.error('Film Room search error:', error);
    return [];
  }
}

/**
 * Get clip details by slug ID
 * @param {string} slug - Clip slug ID
 * @returns {Promise<Object|null>} - Clip details with video URLs
 */
export async function getClipBySlug(slug) {
  const url = new URL('https://fastball-gateway.mlb.com/graphql');
  url.searchParams.set('query', FILMROOM_CLIP_QUERY);
  url.searchParams.set('operationName', 'clipQuery');
  url.searchParams.set('variables', JSON.stringify({
    ids: slug,
    languagePreference: 'EN',
    idType: 'SLUG',
    userId: '',
    withUser: false,
  }));

  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: FILMROOM_HEADERS,
    });

    if (!response.ok) {
      throw new Error(`Film Room clip fetch failed: ${response.status}`);
    }

    const data = await response.json();
    const mp = data?.data?.mediaPlayback?.[0];

    if (!mp) return null;

    return {
      id: mp.id,
      slug: mp.slug,
      title: mp.title,
      description: mp.blurb || mp.description,
      date: mp.date,
      playInfo: mp.playInfo,
      feeds: mp.feeds,
      videoUrl: getBestVideoUrl(mp.feeds),
      homeVideoUrl: getVideoUrlByFeed(mp.feeds, 'HOME'),
      awayVideoUrl: getVideoUrlByFeed(mp.feeds, 'AWAY'),
    };
  } catch (error) {
    console.error('Film Room clip fetch error:', error);
    return null;
  }
}

/**
 * Search for clips from a specific game
 * @param {number} gamePk - Game ID
 * @param {string} date - Game date (YYYY-MM-DD)
 * @returns {Promise<Array>} - All clips from the game
 */
export async function getGameClips(gamePk, date) {
  // Search by date to get all clips from the game
  const clips = await searchClips({ date });

  // Filter to only clips from this specific game
  return clips.filter(clip => clip.playInfo?.gamePk === gamePk);
}

/**
 * Get video URL for a specific pitch using playId from Stats API
 * @param {string} playId - Play ID UUID from Stats API
 * @param {Object} context - Additional context to help find the clip
 * @param {number} context.batterId - Batter's MLB ID
 * @param {number} context.pitcherId - Pitcher's MLB ID
 * @param {string} context.date - Game date
 * @param {number} context.inning - Inning number
 * @param {number} context.balls - Ball count
 * @param {number} context.strikes - Strike count
 * @returns {Promise<Object|null>} - Video URLs if found
 */
export async function getVideoForPitch(playId, context) {
  // The playId from Stats API doesn't directly map to Film Room
  // We need to search using the pitch context
  const clips = await searchClips({
    batterId: context.batterId,
    pitcherId: context.pitcherId,
    date: context.date,
    inning: context.inning,
    balls: context.balls,
    strikes: context.strikes,
  });

  if (clips.length > 0) {
    // Return the first (most recent) match
    return clips[0];
  }

  // Try without ball/strike count if no results
  const fallbackClips = await searchClips({
    batterId: context.batterId,
    pitcherId: context.pitcherId,
    date: context.date,
    inning: context.inning,
  });

  return fallbackClips[0] || null;
}

/**
 * Get the best available video URL from feeds
 * @param {Array} feeds - Feeds array from API response
 * @returns {string|null} - Best video URL or null
 */
function getBestVideoUrl(feeds) {
  if (!feeds || feeds.length === 0) return null;

  for (const priority of FEED_PRIORITY) {
    const [feedType, playbackName] = priority.split('_');

    for (const feed of feeds) {
      if (feed.type === feedType || (feedType === 'CMS' && feed.type === 'CMS')) {
        const playback = feed.playbacks?.find(pb => {
          const url = pb.url || '';
          return url.includes('.mp4') && (
            pb.name === playbackName ||
            pb.name?.includes(playbackName) ||
            (playbackName === 'highBit' && pb.name?.includes('highBit')) ||
            (playbackName === 'mp4Avc' && pb.name?.includes('mp4'))
          );
        });
        if (playback?.url) {
          return playback.url;
        }
      }
    }
  }

  // Fallback: return any MP4 URL
  for (const feed of feeds) {
    const playback = feed.playbacks?.find(pb => pb.url?.includes('.mp4'));
    if (playback?.url) {
      return playback.url;
    }
  }

  return null;
}

/**
 * Get video URL for a specific feed type (HOME or AWAY)
 * @param {Array} feeds - Feeds array
 * @param {string} feedType - 'HOME' or 'AWAY'
 * @returns {string|null} - Video URL or null
 */
function getVideoUrlByFeed(feeds, feedType) {
  if (!feeds) return null;

  const feed = feeds.find(f => f.type === feedType);
  if (!feed) return null;

  const playback = feed.playbacks?.find(pb => pb.url?.includes('.mp4'));
  return playback?.url || null;
}

/**
 * Extract pitch-level data with video capability from game feed
 * @param {Object} gameFeed - Live game feed from Stats API
 * @returns {Array} - Array of pitches with video search parameters
 */
export function extractPitchesFromGame(gameFeed) {
  const pitches = [];
  const gameDate = gameFeed.gameData?.datetime?.officialDate;
  const allPlays = gameFeed.liveData?.plays?.allPlays || [];

  for (const play of allPlays) {
    const playEvents = play.playEvents || [];
    const batter = play.matchup?.batter;
    const pitcher = play.matchup?.pitcher;
    const inning = play.about?.inning;
    const halfInning = play.about?.halfInning;

    for (const event of playEvents) {
      if (event.isPitch && event.playId) {
        pitches.push({
          playId: event.playId,
          pitchNumber: event.pitchNumber,
          batterId: batter?.id,
          batterName: batter?.fullName,
          pitcherId: pitcher?.id,
          pitcherName: pitcher?.fullName,
          inning,
          halfInning,
          balls: event.count?.balls,
          strikes: event.count?.strikes,
          outs: event.count?.outs,
          pitchType: event.details?.type?.code,
          pitchDescription: event.details?.description,
          result: play.result?.event,
          resultDescription: play.result?.description,
          date: gameDate,
          // Search parameters for Film Room
          searchParams: {
            batterId: batter?.id,
            pitcherId: pitcher?.id,
            date: gameDate,
            inning,
            balls: event.count?.balls,
            strikes: event.count?.strikes,
            pitchType: event.details?.type?.code,
          },
        });
      }
    }
  }

  return pitches;
}
