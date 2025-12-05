import { NextResponse } from 'next/server';

/**
 * Proxy MLB video URLs to add required headers
 * GET /api/video-proxy?url=<encoded-video-url>
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const videoUrl = searchParams.get('url');

  if (!videoUrl) {
    return NextResponse.json(
      { error: 'Missing url parameter' },
      { status: 400 }
    );
  }

  // Only allow MLB video URLs
  const allowedDomains = [
    'fastball-clips.mlb.com',
    'mlb-cuts-diamond.mlb.com',
    'mediadownloads.mlb.com',
  ];

  let url;
  try {
    url = new URL(videoUrl);
  } catch {
    return NextResponse.json(
      { error: 'Invalid URL' },
      { status: 400 }
    );
  }

  if (!allowedDomains.some(domain => url.hostname.includes(domain))) {
    return NextResponse.json(
      { error: 'URL domain not allowed' },
      { status: 403 }
    );
  }

  try {
    // Fetch with proper headers that MLB expects
    const response = await fetch(videoUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:92.0) Gecko/20100101 Firefox/92.0',
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.5',
        'Origin': 'https://www.mlb.com',
        'Referer': 'https://www.mlb.com/',
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Failed to fetch video: ${response.status}` },
        { status: response.status }
      );
    }

    // Get the video data
    const videoData = await response.arrayBuffer();

    // Return the video with proper headers
    return new NextResponse(videoData, {
      headers: {
        'Content-Type': response.headers.get('Content-Type') || 'video/mp4',
        'Content-Length': videoData.byteLength.toString(),
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch (error) {
    console.error('Video proxy error:', error);
    return NextResponse.json(
      { error: 'Failed to proxy video' },
      { status: 500 }
    );
  }
}
