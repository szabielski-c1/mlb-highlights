import { NextResponse } from 'next/server';
import { authenticate, getAudioStream, getSessionState } from '@/lib/mlbtv-auth';

/**
 * Get audio stream URL for a game
 * POST /api/mlbtv/audio
 * Body: { gamePk, feedType: 'HOME' | 'AWAY', username, password }
 */
export async function POST(request) {
  try {
    const { gamePk, feedType = 'HOME', username, password } = await request.json();

    if (!gamePk) {
      return NextResponse.json(
        { error: 'gamePk is required' },
        { status: 400 }
      );
    }

    // Check if we have valid credentials or cached token
    let accessToken = getSessionState().accessToken;
    const expiry = getSessionState().accessTokenExpiry;

    if (!accessToken || !expiry || new Date(expiry) < new Date()) {
      // Need to authenticate - use provided creds or env vars
      const authUsername = username || process.env.MLB_USERNAME;
      const authPassword = password || process.env.MLB_PASSWORD;

      if (!authUsername || !authPassword) {
        return NextResponse.json(
          { error: 'Not authenticated. Provide username and password or set MLB_USERNAME/MLB_PASSWORD env vars.' },
          { status: 401 }
        );
      }

      accessToken = await authenticate(authUsername, authPassword);
    }

    // Get the audio stream URL
    const streamUrl = await getAudioStream(gamePk, feedType, accessToken);

    if (!streamUrl) {
      return NextResponse.json(
        { error: 'Could not get stream URL' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      gamePk,
      feedType,
      streamUrl,
    });
  } catch (error) {
    console.error('MLB.TV audio stream error:', error);
    return NextResponse.json(
      { error: 'Failed to get audio stream', details: error.message },
      { status: 500 }
    );
  }
}

/**
 * Get available audio feeds for a game
 * GET /api/mlbtv/audio?gamePk=123456
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const gamePk = searchParams.get('gamePk');

  if (!gamePk) {
    return NextResponse.json(
      { error: 'gamePk query parameter is required' },
      { status: 400 }
    );
  }

  try {
    // Get game content to list available audio feeds
    const contentUrl = `https://statsapi.mlb.com/api/v1/game/${gamePk}/content`;
    const response = await fetch(contentUrl);
    const content = await response.json();

    const audioEpg = content?.media?.epg?.find(e => e.title === 'Audio');

    if (!audioEpg || !audioEpg.items?.length) {
      return NextResponse.json({
        gamePk,
        feeds: [],
        message: 'No audio feeds available for this game',
      });
    }

    const feeds = audioEpg.items.map(item => ({
      type: item.type,
      callLetters: item.callLetters,
      language: item.language,
      mediaId: item.mediaId,
      mediaState: item.mediaState,
    }));

    return NextResponse.json({
      gamePk,
      feeds,
      requiresAuth: true,
      message: 'Audio feeds found. POST with credentials to get stream URL.',
    });
  } catch (error) {
    console.error('Error fetching audio feeds:', error);
    return NextResponse.json(
      { error: 'Failed to fetch audio feeds', details: error.message },
      { status: 500 }
    );
  }
}
