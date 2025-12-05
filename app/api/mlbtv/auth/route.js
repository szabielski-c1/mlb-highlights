import { NextResponse } from 'next/server';
import { authenticate, getSessionState } from '@/lib/mlbtv-auth';

/**
 * Authenticate with MLB.TV
 * POST /api/mlbtv/auth
 * Body: { username, password }
 */
export async function POST(request) {
  try {
    const { username, password } = await request.json();

    if (!username || !password) {
      return NextResponse.json(
        { error: 'Username and password required' },
        { status: 400 }
      );
    }

    const accessToken = await authenticate(username, password);

    return NextResponse.json({
      success: true,
      message: 'Authentication successful',
      // Don't expose the full token, just confirmation
      tokenPreview: accessToken.substring(0, 20) + '...',
      expiresAt: getSessionState().accessTokenExpiry,
    });
  } catch (error) {
    console.error('MLB.TV auth error:', error);
    return NextResponse.json(
      { error: 'Authentication failed', details: error.message },
      { status: 401 }
    );
  }
}

/**
 * Get current auth status
 * GET /api/mlbtv/auth
 */
export async function GET() {
  const state = getSessionState();

  const isAuthenticated = !!(state.accessToken && state.accessTokenExpiry);
  const isExpired = isAuthenticated && new Date(state.accessTokenExpiry) < new Date();

  return NextResponse.json({
    isAuthenticated,
    isExpired,
    expiresAt: state.accessTokenExpiry,
  });
}
