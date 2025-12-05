import { NextResponse } from 'next/server';
import { getSchedule } from '@/lib/mlb-api';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date');

  if (!date) {
    return NextResponse.json(
      { error: 'Missing date parameter' },
      { status: 400 }
    );
  }

  try {
    const games = await getSchedule(date);
    return NextResponse.json({ games });
  } catch (error) {
    console.error('Error fetching schedule:', error);
    return NextResponse.json(
      { error: 'Failed to fetch schedule' },
      { status: 500 }
    );
  }
}
