import { NextResponse } from 'next/server';
import { searchClips, getClipBySlug } from '@/lib/filmroom';

/**
 * Search MLB Film Room for video clips
 * GET /api/filmroom/search?batterId=123&date=2024-08-09&inning=1
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);

    const params = {};

    if (searchParams.get('batterId')) {
      params.batterId = parseInt(searchParams.get('batterId'));
    }
    if (searchParams.get('pitcherId')) {
      params.pitcherId = parseInt(searchParams.get('pitcherId'));
    }
    if (searchParams.get('date')) {
      params.date = searchParams.get('date');
    }
    if (searchParams.get('inning')) {
      params.inning = parseInt(searchParams.get('inning'));
    }
    if (searchParams.get('balls')) {
      params.balls = parseInt(searchParams.get('balls'));
    }
    if (searchParams.get('strikes')) {
      params.strikes = parseInt(searchParams.get('strikes'));
    }
    if (searchParams.get('pitchType')) {
      params.pitchType = searchParams.get('pitchType');
    }

    // Require at least one search parameter
    if (Object.keys(params).length === 0) {
      return NextResponse.json(
        { error: 'At least one search parameter required (batterId, pitcherId, date, inning, etc.)' },
        { status: 400 }
      );
    }

    const clips = await searchClips(params);

    return NextResponse.json({
      clips,
      count: clips.length,
      searchParams: params,
    });
  } catch (error) {
    console.error('Film Room search error:', error);
    return NextResponse.json(
      { error: 'Failed to search Film Room', details: error.message },
      { status: 500 }
    );
  }
}

/**
 * Get clip by slug ID
 * POST /api/filmroom/search { slug: 'clip-slug-id' }
 */
export async function POST(request) {
  try {
    const { slug } = await request.json();

    if (!slug) {
      return NextResponse.json(
        { error: 'Slug is required' },
        { status: 400 }
      );
    }

    const clip = await getClipBySlug(slug);

    if (!clip) {
      return NextResponse.json(
        { error: 'Clip not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ clip });
  } catch (error) {
    console.error('Film Room clip fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch clip', details: error.message },
      { status: 500 }
    );
  }
}
