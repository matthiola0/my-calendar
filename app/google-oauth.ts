import { env } from 'cloudflare:workers';
import { createGoogleUserSession } from './auth';

const STATE_COOKIE = 'calendar_google_state';
const VERIFIER_COOKIE = 'calendar_google_verifier';
const OAUTH_COOKIE_SECONDS = 60 * 10;

type GoogleTokenResponse = {
  access_token?: string;
};

type GoogleProfile = {
  sub?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
};

export function isGoogleAuthConfigured() {
  return Boolean(
    env.GOOGLE_CLIENT_ID &&
      env.GOOGLE_CLIENT_SECRET &&
      env.GOOGLE_REDIRECT_URI,
  );
}

export async function startGoogleOAuth(request: Request) {
  const config = getGoogleConfig();
  if (!config) return unavailable();

  const secure = new URL(request.url).protocol === 'https:';
  const state = randomToken(32);
  const verifier = randomToken(48);
  const challenge = await sha256(verifier);
  const authorizationUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authorizationUrl.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    prompt: 'select_account',
  }).toString();

  const headers = new Headers({ Location: authorizationUrl.toString() });
  headers.append('Set-Cookie', shortCookie(STATE_COOKIE, state, secure));
  headers.append('Set-Cookie', shortCookie(VERIFIER_COOKIE, verifier, secure));
  return new Response(null, { status: 302, headers });
}

export async function finishGoogleOAuth(request: Request) {
  const config = getGoogleConfig();
  if (!config) return unavailable();

  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const suppliedState = requestUrl.searchParams.get('state');
  const cookies = parseCookies(request.headers.get('cookie'));
  const expectedState = cookies.get(STATE_COOKIE);
  const verifier = cookies.get(VERIFIER_COOKIE);

  if (
    requestUrl.searchParams.has('error') ||
    !code ||
    !suppliedState ||
    !expectedState ||
    !verifier ||
    !constantTimeEqual(suppliedState, expectedState)
  ) {
    return oauthFailure(request);
  }

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: 'authorization_code',
      code_verifier: verifier,
    }),
  });
  if (!tokenResponse.ok) return oauthFailure(request);

  const token = (await tokenResponse.json()) as GoogleTokenResponse;
  if (!token.access_token) return oauthFailure(request);

  const profileResponse = await fetch(
    'https://openidconnect.googleapis.com/v1/userinfo',
    { headers: { Authorization: `Bearer ${token.access_token}` } },
  );
  if (!profileResponse.ok) return oauthFailure(request);

  const profile = (await profileResponse.json()) as GoogleProfile;
  if (
    !profile.sub ||
    !profile.email ||
    profile.email_verified !== true ||
    profile.sub.length > 255
  ) {
    return oauthFailure(request);
  }

  const secure = requestUrl.protocol === 'https:';
  const sessionCookie = await createGoogleUserSession(
    {
      id: profile.sub,
      email: profile.email,
      displayName: profile.name?.trim() || profile.email,
    },
    secure,
  );
  const headers = new Headers({ Location: new URL('/', request.url).toString() });
  headers.append('Set-Cookie', sessionCookie);
  headers.append('Set-Cookie', clearCookie(STATE_COOKIE, secure));
  headers.append('Set-Cookie', clearCookie(VERIFIER_COOKIE, secure));
  return new Response(null, { status: 303, headers });
}

function getGoogleConfig() {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_REDIRECT_URI) {
    return null;
  }
  return {
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    redirectUri: env.GOOGLE_REDIRECT_URI,
  };
}

function oauthFailure(request: Request) {
  const secure = new URL(request.url).protocol === 'https:';
  const headers = new Headers({
    Location: new URL('/?auth_error=google', request.url).toString(),
  });
  headers.append('Set-Cookie', clearCookie(STATE_COOKIE, secure));
  headers.append('Set-Cookie', clearCookie(VERIFIER_COOKIE, secure));
  return new Response(null, { status: 303, headers });
}

function unavailable() {
  return Response.json({ error: 'Google 登入尚未完成設定。' }, { status: 503 });
}

function shortCookie(name: string, value: string, secure: boolean) {
  return cookie(name, value, OAUTH_COOKIE_SECONDS, secure);
}

function clearCookie(name: string, secure: boolean) {
  return cookie(name, '', 0, secure);
}

function cookie(name: string, value: string, maxAge: number, secure: boolean) {
  return `${name}=${value}; Path=/; HttpOnly${secure ? '; Secure' : ''}; SameSite=Lax; Max-Age=${maxAge}`;
}

function parseCookies(header: string | null) {
  const values = new Map<string, string>();
  if (!header) return values;
  for (const part of header.split(';')) {
    const [name, ...rawValue] = part.trim().split('=');
    values.set(name, rawValue.join('='));
  }
  return values;
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return base64UrlEncode(new Uint8Array(digest));
}

function randomToken(bytes: number) {
  return base64UrlEncode(crypto.getRandomValues(new Uint8Array(bytes)));
}

function base64UrlEncode(value: Uint8Array) {
  let binary = '';
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}
