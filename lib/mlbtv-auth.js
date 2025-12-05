/**
 * MLB.TV Authentication
 * Based on https://github.com/kmac/mlbv/blob/master/mlbv/mlbam/mlbsession.py
 *
 * Implements the 9-step OAuth flow to authenticate with MLB.TV
 * and retrieve stream URLs for video/audio content.
 */

const crypto = require('crypto');

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:92.0) Gecko/20100101 Firefox/92.0';
const PLATFORM = 'macintosh';
const BAM_SDK_VERSION = '3.4';

// Endpoints
const MLB_API_KEY_URL = 'https://www.mlb.com/tv/g490865/';
const MLB_OKTA_URL = 'https://www.mlbstatic.com/mlb.com/vendor/mlb-okta/mlb-okta.js';
const AUTHN_URL = 'https://ids.mlb.com/api/v1/authn';
const OKTA_AUTHORIZE_URL = 'https://ids.mlb.com/oauth2/aus1m088yK07noBfh356/v1/authorize';
const OKTA_TOKEN_URL = 'https://ids.mlb.com/oauth2/aus1m088yK07noBfh356/v1/token';
const BAM_DEVICES_URL = 'https://us.edge.bamgrid.com/devices';
const BAM_SESSION_URL = 'https://us.edge.bamgrid.com/session';
const BAM_TOKEN_URL = 'https://us.edge.bamgrid.com/token';
const BAM_ENTITLEMENT_URL = 'https://media-entitlement.mlb.com/api/v3/jwt';
const STREAM_URL_TEMPLATE = 'https://edge.svcs.mlb.com/media/{media_id}/scenarios/browser~csai';

// Regex patterns - multiple patterns to try for API key extraction
const API_KEY_PATTERNS = [
  /"x-api-key","value":"([^"]+)"/,  // New format (streamglob)
  /"apiKey":"([^"]+)"/,              // Old format (mlbv)
  /"x-api-key":\s*"([^"]+)"/,        // JSON format
];
const CLIENT_API_KEY_RE = /"clientApiKey":"([^"]+)"/;
const OKTA_CLIENT_ID_RE = /production:{clientId:"([^"]+)",/;

// Session state (in-memory cache)
let sessionState = {
  sessionToken: null,
  sessionTokenTime: null,
  apiKey: null,
  clientApiKey: null,
  oktaClientId: null,
  oktaAccessToken: null,
  accessToken: null,
  accessTokenExpiry: null,
};

/**
 * Generate random alphanumeric string
 */
function genRandomString(n) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < n; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Base64 URL encode (for PKCE)
 * Removes padding and replaces + with - and / with _
 */
function base64UrlEncode(buffer) {
  return buffer.toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Generate PKCE code verifier and challenge
 */
function generatePKCE() {
  // Generate 64-character code verifier
  const codeVerifier = genRandomString(64);

  // Create SHA-256 hash of verifier and base64url encode it
  const hash = crypto.createHash('sha256').update(codeVerifier, 'ascii').digest();
  const codeChallenge = base64UrlEncode(hash);

  return { codeVerifier, codeChallenge };
}

/**
 * Step 1: Login with username/password to get session token
 */
async function login(username, password) {
  console.log('MLB.TV Auth: Step 1 - Login');

  const authnParams = {
    username,
    password,
    options: {
      multiOptionalFactorEnroll: false,
      warnBeforePasswordExpired: true,
    },
  };

  const response = await fetch(AUTHN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': USER_AGENT,
    },
    body: JSON.stringify(authnParams),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Login failed: ${response.status} - ${text}`);
  }

  const data = await response.json();

  if (!data.sessionToken) {
    throw new Error(`Login failed: ${JSON.stringify(data)}`);
  }

  sessionState.sessionToken = data.sessionToken;
  sessionState.sessionTokenTime = new Date().toISOString();

  console.log('MLB.TV Auth: Login successful');
  return data.sessionToken;
}

/**
 * Step 2: Get API keys from MLB website
 */
async function getApiKeys() {
  console.log('MLB.TV Auth: Step 2 - Get API Keys');

  const response = await fetch(MLB_API_KEY_URL, {
    headers: { 'User-Agent': USER_AGENT },
  });

  const html = await response.text();

  // Try multiple patterns for API key
  let apiKey = null;
  for (const pattern of API_KEY_PATTERNS) {
    const match = html.match(pattern);
    if (match) {
      apiKey = match[1];
      console.log(`MLB.TV Auth: Found API key with pattern: ${pattern}`);
      break;
    }
  }

  const clientApiKeyMatch = html.match(CLIENT_API_KEY_RE);

  if (!apiKey || !clientApiKeyMatch) {
    // Log some debug info about the page content
    console.error('MLB.TV Auth: Could not find API keys');
    console.error('Page length:', html.length);
    console.error('Has clientApiKey pattern:', html.includes('clientApiKey'));
    console.error('Has x-api-key pattern:', html.includes('x-api-key'));
    console.error('Has apiKey pattern:', html.includes('apiKey'));
    throw new Error('Could not extract API keys from MLB website');
  }

  sessionState.apiKey = apiKey;
  sessionState.clientApiKey = clientApiKeyMatch[1];

  console.log('MLB.TV Auth: Got API keys');
  return { apiKey: sessionState.apiKey, clientApiKey: sessionState.clientApiKey };
}

/**
 * Step 3: Get Okta client ID
 */
async function getOktaClientId() {
  console.log('MLB.TV Auth: Step 3 - Get Okta Client ID');

  const response = await fetch(MLB_OKTA_URL, {
    headers: { 'User-Agent': USER_AGENT },
  });

  const js = await response.text();
  const match = js.match(OKTA_CLIENT_ID_RE);

  if (!match) {
    throw new Error('Could not extract Okta client ID');
  }

  sessionState.oktaClientId = match[1];
  console.log('MLB.TV Auth: Got Okta client ID');
  return sessionState.oktaClientId;
}

/**
 * Step 4: Get Okta access token using authorization code flow with PKCE
 */
async function getOktaAccessToken() {
  console.log('MLB.TV Auth: Step 4 - Get Okta Access Token (PKCE flow)');

  if (!sessionState.sessionToken) {
    throw new Error('No session token - must login first');
  }

  // Generate PKCE parameters
  const { codeVerifier, codeChallenge } = generatePKCE();
  const stateParam = genRandomString(64);
  const nonceParam = genRandomString(64);

  // Step 4a: Get authorization code
  console.log('MLB.TV Auth: Step 4a - Getting authorization code');
  const authParams = new URLSearchParams({
    client_id: sessionState.oktaClientId,
    redirect_uri: 'https://www.mlb.com/login',
    response_type: 'code',
    response_mode: 'okta_post_message',
    state: stateParam,
    nonce: nonceParam,
    prompt: 'none',
    sessionToken: sessionState.sessionToken,
    scope: 'openid email',
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });

  const authResponse = await fetch(`${OKTA_AUTHORIZE_URL}?${authParams}`, {
    headers: { 'User-Agent': USER_AGENT },
  });

  const html = await authResponse.text();

  // Extract authorization code from response
  let authCode = null;
  const lines = html.split('\n');
  for (const line of lines) {
    if (line.includes("data.code")) {
      // Extract code from: data.code = 'abc123...'
      const codeMatch = line.match(/data\.code\s*=\s*'([^']+)'/);
      if (codeMatch) {
        authCode = codeMatch[1];
        break;
      }
    }
    if (line.includes("data.error = 'login_required'")) {
      throw new Error('Login required - session expired');
    }
    if (line.includes("data.error")) {
      console.error('MLB.TV Auth: Okta error line:', line);
    }
  }

  if (!authCode) {
    console.error('MLB.TV Auth: Could not find auth code. Response preview:', html.substring(0, 2000));
    throw new Error('Could not extract authorization code');
  }

  console.log('MLB.TV Auth: Got authorization code');

  // Step 4b: Exchange code for access token
  console.log('MLB.TV Auth: Step 4b - Exchanging code for token');
  const tokenParams = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: sessionState.oktaClientId,
    redirect_uri: 'https://www.mlb.com/login',
    code: authCode,
    code_verifier: codeVerifier,
  });

  const tokenResponse = await fetch(OKTA_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': USER_AGENT,
    },
    body: tokenParams,
  });

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text();
    console.error('MLB.TV Auth: Token exchange failed:', errorText);
    throw new Error(`Token exchange failed: ${tokenResponse.status}`);
  }

  const tokenData = await tokenResponse.json();

  if (!tokenData.access_token) {
    throw new Error(`No access token in response: ${JSON.stringify(tokenData)}`);
  }

  sessionState.oktaAccessToken = tokenData.access_token;
  console.log('MLB.TV Auth: Got Okta access token');
  return sessionState.oktaAccessToken;
}

/**
 * Step 5: Get device assertion
 */
async function getDeviceAssertion() {
  console.log('MLB.TV Auth: Step 5 - Get Device Assertion');

  const response = await fetch(BAM_DEVICES_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${sessionState.clientApiKey}`,
      'Origin': 'https://www.mlb.com',
      'Content-Type': 'application/json',
      'User-Agent': USER_AGENT,
    },
    body: JSON.stringify({
      applicationRuntime: 'firefox',
      attributes: {},
      deviceFamily: 'browser',
      deviceProfile: 'macosx',
    }),
  });

  const data = await response.json();

  if (!data.assertion) {
    throw new Error(`No device assertion in response: ${JSON.stringify(data)}`);
  }

  console.log('MLB.TV Auth: Got device assertion');
  return data.assertion;
}

/**
 * Step 6: Get device access token
 */
async function getDeviceAccessToken(deviceAssertion) {
  console.log('MLB.TV Auth: Step 6 - Get Device Access Token');

  const params = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
    latitude: '0',
    longitude: '0',
    platform: 'browser',
    subject_token: deviceAssertion,
    subject_token_type: 'urn:bamtech:params:oauth:token-type:device',
  });

  const response = await fetch(BAM_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${sessionState.clientApiKey}`,
      'Origin': 'https://www.mlb.com',
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': USER_AGENT,
    },
    body: params,
  });

  const data = await response.json();

  if (!data.access_token) {
    throw new Error(`No access token in response: ${JSON.stringify(data)}`);
  }

  console.log('MLB.TV Auth: Got device access token');
  return data.access_token;
}

/**
 * Step 7: Create session and get device ID
 */
async function createSession(deviceAccessToken) {
  console.log('MLB.TV Auth: Step 7 - Create Session');

  const response = await fetch(BAM_SESSION_URL, {
    headers: {
      'Authorization': deviceAccessToken,
      'User-Agent': USER_AGENT,
      'Origin': 'https://www.mlb.com',
      'Accept': 'application/vnd.session-service+json; version=1',
      'x-bamsdk-version': BAM_SDK_VERSION,
      'x-bamsdk-platform': PLATFORM,
    },
  });

  const data = await response.json();

  if (!data.device?.id) {
    throw new Error(`No device ID in session response: ${JSON.stringify(data)}`);
  }

  console.log('MLB.TV Auth: Got session with device ID');
  return data.device.id;
}

/**
 * Step 8: Get entitlement token
 */
async function getEntitlementToken(deviceId) {
  console.log('MLB.TV Auth: Step 8 - Get Entitlement Token');

  const params = new URLSearchParams({
    os: PLATFORM,
    did: deviceId,
    appname: 'mlbtv_web',
  });

  const response = await fetch(`${BAM_ENTITLEMENT_URL}?${params}`, {
    headers: {
      'Authorization': `Bearer ${sessionState.oktaAccessToken}`,
      'Origin': 'https://www.mlb.com',
      'x-api-key': sessionState.apiKey,
      'User-Agent': USER_AGENT,
    },
  });

  const token = await response.text();

  if (!token || token.length < 100) {
    throw new Error(`Invalid entitlement token: ${token}`);
  }

  console.log('MLB.TV Auth: Got entitlement token');
  return token;
}

/**
 * Step 9: Get final access token
 */
async function getFinalAccessToken(entitlementToken) {
  console.log('MLB.TV Auth: Step 9 - Get Final Access Token');

  const params = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
    platform: 'browser',
    subject_token: entitlementToken,
    subject_token_type: 'urn:bamtech:params:oauth:token-type:account',
  });

  const response = await fetch(BAM_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${sessionState.clientApiKey}`,
      'User-Agent': USER_AGENT,
      'Accept': 'application/vnd.media-service+json; version=1',
      'x-bamsdk-version': BAM_SDK_VERSION,
      'x-bamsdk-platform': PLATFORM,
      'Origin': 'https://www.mlb.com',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params,
  });

  const data = await response.json();

  if (!data.access_token) {
    throw new Error(`No access token in response: ${JSON.stringify(data)}`);
  }

  sessionState.accessToken = data.access_token;
  sessionState.accessTokenExpiry = new Date(Date.now() + data.expires_in * 1000).toISOString();

  console.log('MLB.TV Auth: Got final access token');
  return data.access_token;
}

/**
 * Complete authentication flow
 */
export async function authenticate(username, password) {
  // Check if we have a valid cached token
  if (sessionState.accessToken && sessionState.accessTokenExpiry) {
    const expiry = new Date(sessionState.accessTokenExpiry);
    if (expiry > new Date()) {
      console.log('MLB.TV Auth: Using cached access token');
      return sessionState.accessToken;
    }
  }

  try {
    // Step 1: Login
    await login(username, password);

    // Step 2: Get API keys
    await getApiKeys();

    // Step 3: Get Okta client ID
    await getOktaClientId();

    // Step 4: Get Okta access token
    await getOktaAccessToken();

    // Step 5: Get device assertion
    const deviceAssertion = await getDeviceAssertion();

    // Step 6: Get device access token
    const deviceAccessToken = await getDeviceAccessToken(deviceAssertion);

    // Step 7: Create session
    const deviceId = await createSession(deviceAccessToken);

    // Step 8: Get entitlement token
    const entitlementToken = await getEntitlementToken(deviceId);

    // Step 9: Get final access token
    const accessToken = await getFinalAccessToken(entitlementToken);

    return accessToken;
  } catch (error) {
    console.error('MLB.TV Auth: Authentication failed:', error);
    throw error;
  }
}

/**
 * Get stream URL for a media ID
 */
export async function getStreamUrl(mediaId, accessToken) {
  const url = STREAM_URL_TEMPLATE.replace('{media_id}', mediaId);

  const response = await fetch(url, {
    headers: {
      'Authorization': accessToken,
      'User-Agent': USER_AGENT,
      'Accept': 'application/vnd.media-service+json; version=1',
      'x-bamsdk-version': BAM_SDK_VERSION,
      'x-bamsdk-platform': PLATFORM,
      'Origin': 'https://www.mlb.com',
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Stream lookup failed: ${response.status} - ${text}`);
  }

  const data = await response.json();

  if (data.errors) {
    throw new Error(`Stream errors: ${JSON.stringify(data.errors)}`);
  }

  return data.stream?.complete || null;
}

/**
 * Get audio stream for a game
 */
export async function getAudioStream(gamePk, feedType = 'HOME', accessToken) {
  // First get the media ID for the audio feed
  const contentUrl = `https://statsapi.mlb.com/api/v1/game/${gamePk}/content`;
  const contentResponse = await fetch(contentUrl);
  const content = await contentResponse.json();

  const audioEpg = content?.media?.epg?.find(e => e.title === 'Audio');
  if (!audioEpg || !audioEpg.items?.length) {
    throw new Error('No audio feeds available for this game');
  }

  // Find the requested feed type (HOME or AWAY)
  const audioItem = audioEpg.items.find(item => item.type === feedType) || audioEpg.items[0];

  if (!audioItem?.mediaId) {
    throw new Error(`No media ID for ${feedType} audio feed`);
  }

  console.log(`Getting ${feedType} audio stream (${audioItem.callLetters}) for game ${gamePk}`);

  return getStreamUrl(audioItem.mediaId, accessToken);
}

// Export session state for debugging
export function getSessionState() {
  return { ...sessionState };
}

// Clear session (for logout)
export function clearSession() {
  sessionState = {
    sessionToken: null,
    sessionTokenTime: null,
    apiKey: null,
    clientApiKey: null,
    oktaClientId: null,
    oktaAccessToken: null,
    accessToken: null,
    accessTokenExpiry: null,
  };
}
