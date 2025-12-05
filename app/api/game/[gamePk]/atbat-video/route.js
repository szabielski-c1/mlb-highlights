import { NextResponse } from 'next/server';
import { searchClips } from '@/lib/filmroom';

/**
 * Get Film Room video for a specific at-bat
 * POST /api/game/[gamePk]/atbat-video
 * Body: { batterId, pitcherId, date, inning }
 */
export async function POST(request, { params }) {
  try {
    const { gamePk } = await params;
    const { batterId, pitcherId, date, inning, outs } = await request.json();

    if (!batterId || !date) {
      return NextResponse.json(
        { error: 'batterId and date are required' },
        { status: 400 }
      );
    }

    // Search Film Room for this at-bat
    // Include outs to distinguish when same batter bats multiple times in an inning
    const searchParams = {
      batterId,
      pitcherId,
      date,
      inning,
    };

    // Only add outs filter if provided (helps distinguish multiple at-bats)
    if (outs !== undefined) {
      searchParams.outs = outs;
    }

    const clips = await searchClips(searchParams);

    // Filter to clips from this specific game if we can
    const gameClips = clips.filter(clip => {
      const clipGamePk = clip.playInfo?.gamePk;
      return !clipGamePk || clipGamePk === parseInt(gamePk);
    });

    if (gameClips.length === 0) {
      // Try without inning constraint
      const fallbackClips = await searchClips({
        batterId,
        pitcherId,
        date,
      });

      const fallbackGameClips = fallbackClips.filter(clip => {
        const clipGamePk = clip.playInfo?.gamePk;
        return !clipGamePk || clipGamePk === parseInt(gamePk);
      });

      if (fallbackGameClips.length === 0) {
        return NextResponse.json({
          found: false,
          clip: null,
          message: 'No video found for this at-bat',
        });
      }

      return NextResponse.json({
        found: true,
        clip: fallbackGameClips[0],
        allClips: fallbackGameClips,
        count: fallbackGameClips.length,
      });
    }

    return NextResponse.json({
      found: true,
      clip: gameClips[0],
      allClips: gameClips,
      count: gameClips.length,
    });
  } catch (error) {
    console.error('Error fetching at-bat video:', error);
    return NextResponse.json(
      { error: 'Failed to fetch video', details: error.message },
      { status: 500 }
    );
  }
}
