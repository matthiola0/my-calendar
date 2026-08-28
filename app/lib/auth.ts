import { env } from 'cloudflare:workers';
import { cookies } from 'next/headers';
import { ensureSchema } from '../../db/ensure-schema';
import { getDatabaseBinding } from '../../db';

export type CurrentUser = {
  ownerId: string;
  displayName: string;
};

const SESSION_COOKIE = 'calendar_session';
const SESSION_SECONDS = 60 * 60 * 24 * 30;
const PASSWORD_ITERATIONS = 100_000;
const PASSWORD_HASH_PREFIX = 'v2:';

type PasswordUserRow = {
  id: string;
  username: string;
  display_name: string;
  password_salt: string;
  password_hash: string;
};

export async function getCurrentUser(request?: Request): Promise<CurrentUser | null> {
  await ensureSchema();

  const sessionToken = request
    ? readCookie(request.headers.get('cookie'), SESSION_COOKIE)
    : (await cookies()).get(SESSION_COOKIE)?.value;

  if (sessionToken) {
    const tokenHash = await sha256(sessionToken);
    const row = await getDatabaseBinding()
      .prepare(`
        SELECT password_users.id, password_users.display_name
        FROM auth_sessions
        INNER JOIN password_users ON password_users.id = auth_sessions.user_id
        WHERE auth_sessions.token_hash = ? AND auth_sessions.expires_at > ?
      `)
      .bind(tokenHash, Date.now())
      .first<{ id: string; display_name: string }>();

    if (row) {
      return {
        ownerId: `password:${row.id}`,
        displayName: row.display_name,
      };
    }

    const googleRow = await getDatabaseBinding()
      .prepare(`
        SELECT google_users.id, google_users.email, google_users.display_name
        FROM google_auth_sessions
        INNER JOIN google_users ON google_users.id = google_auth_sessions.user_id
        WHERE google_auth_sessions.token_hash = ? AND google_auth_sessions.expires_at > ?
      `)
      .bind(tokenHash, Date.now())
      .first<{ id: string; email: string; display_name: string }>();

    if (googleRow) {
      const ownerEmail = (
        env.OWNER_GOOGLE_EMAIL ?? env.OWNER_CHATGPT_EMAIL
      )?.trim().toLowerCase();
      return {
        ownerId:
          ownerEmail && googleRow.email.trim().toLowerCase() === ownerEmail
            ? 'owner'
            : `google:${googleRow.id}`,
        displayName: googleRow.display_name,
      };
    }
  }

  return null;
}

export function normalizeUsername(value: string) {
  return value.trim().normalize('NFKC').toLowerCase();
}

export function isValidUsername(value: string) {
  return /^[a-z0-9_.-]{3,30}$/.test(value);
}

export function isValidPassword(value: string) {
  return value.length >= 10 && value.length <= 128;
}

export function isPasswordAuthConfigured() {
  return Boolean(env.PASSWORD_PEPPER && env.PASSWORD_PEPPER.trim().length >= 32);
}

export async function createPasswordUser(username: string, password: string) {
  await ensureSchema();
  const normalized = normalizeUsername(username);
  const salt = randomToken(16);
  const passwordHash = PASSWORD_HASH_PREFIX + await derivePasswordHash(
    password,
    salt,
    requirePasswordPepper(),
  );
  const userId = crypto.randomUUID();

  try {
    await getDatabaseBinding()
      .prepare(`
        INSERT INTO password_users
          (id, username, display_name, password_salt, password_hash, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `)
      .bind(userId, normalized, username.trim(), salt, passwordHash, Date.now())
      .run();
  } catch (error) {
    if (String(error).includes('UNIQUE constraint failed')) return null;
    throw error;
  }

  return { id: userId, displayName: username.trim() };
}

export async function verifyPasswordUser(username: string, password: string) {
  await ensureSchema();
  const row = await getDatabaseBinding()
    .prepare(`
      SELECT id, username, display_name, password_salt, password_hash
      FROM password_users WHERE username = ?
    `)
    .bind(normalizeUsername(username))
    .first<PasswordUserRow>();

  if (!row) {
    await derivePasswordHash(password, randomToken(16));
    return null;
  }

  const isPeppered = row.password_hash.startsWith(PASSWORD_HASH_PREFIX);
  const expectedHash = isPeppered
    ? row.password_hash.slice(PASSWORD_HASH_PREFIX.length)
    : row.password_hash;
  const suppliedHash = await derivePasswordHash(
    password,
    row.password_salt,
    isPeppered ? requirePasswordPepper() : undefined,
  );
  if (!constantTimeEqual(suppliedHash, expectedHash)) return null;

  if (!isPeppered) {
    const upgradedHash = PASSWORD_HASH_PREFIX + await derivePasswordHash(
      password,
      row.password_salt,
      requirePasswordPepper(),
    );
    await getDatabaseBinding()
      .prepare('UPDATE password_users SET password_hash = ? WHERE id = ?')
      .bind(upgradedHash, row.id)
      .run();
  }

  return { id: row.id, displayName: row.display_name };
}

export async function createPasswordSession(userId: string, secure: boolean) {
  await ensureSchema();
  const token = randomToken(32);
  const tokenHash = await sha256(token);
  const now = Date.now();
  const expiresAt = now + SESSION_SECONDS * 1000;
  const db = getDatabaseBinding();

  await db.batch([
    db.prepare('DELETE FROM auth_sessions WHERE expires_at <= ?').bind(now),
    db
      .prepare(`
        INSERT INTO auth_sessions (token_hash, user_id, expires_at, created_at)
        VALUES (?, ?, ?, ?)
      `)
      .bind(tokenHash, userId, expiresAt, now),
  ]);

  return sessionCookie(token, SESSION_SECONDS, secure);
}

export async function createGoogleUserSession(
  profile: { id: string; email: string; displayName: string },
  secure: boolean,
) {
  await ensureSchema();
  const token = randomToken(32);
  const tokenHash = await sha256(token);
  const now = Date.now();
  const expiresAt = now + SESSION_SECONDS * 1000;
  const db = getDatabaseBinding();

  await db.batch([
    db
      .prepare(`
        INSERT INTO google_users (id, email, display_name, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          email = excluded.email,
          display_name = excluded.display_name,
          updated_at = excluded.updated_at
      `)
      .bind(profile.id, profile.email, profile.displayName, now, now),
    db.prepare('DELETE FROM google_auth_sessions WHERE expires_at <= ?').bind(now),
    db
      .prepare(`
        INSERT INTO google_auth_sessions (token_hash, user_id, expires_at, created_at)
        VALUES (?, ?, ?, ?)
      `)
      .bind(tokenHash, profile.id, expiresAt, now),
  ]);

  return sessionCookie(token, SESSION_SECONDS, secure);
}

export async function deleteAppSession(request: Request) {
  const token = readCookie(request.headers.get('cookie'), SESSION_COOKIE);
  if (token) {
    await ensureSchema();
    const tokenHash = await sha256(token);
    const db = getDatabaseBinding();
    await db.batch([
      db.prepare('DELETE FROM auth_sessions WHERE token_hash = ?').bind(tokenHash),
      db.prepare('DELETE FROM google_auth_sessions WHERE token_hash = ?').bind(tokenHash),
    ]);
  }
  return sessionCookie('', 0, new URL(request.url).protocol === 'https:');
}

function sessionCookie(token: string, maxAge: number, secure: boolean) {
  const secureAttribute = secure ? '; Secure' : '';
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly${secureAttribute}; SameSite=Lax; Max-Age=${maxAge}`;
}

function readCookie(header: string | null, name: string) {
  if (!header) return null;
  for (const part of header.split(';')) {
    const [key, ...rawValue] = part.trim().split('=');
    if (key === name) return rawValue.join('=');
  }
  return null;
}

async function derivePasswordHash(password: string, salt: string, pepper?: string) {
  const passwordBytes = pepper
    ? await hmacSha256(pepper, password)
    : new TextEncoder().encode(password);
  const key = await crypto.subtle.importKey(
    'raw',
    passwordBytes,
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: base64UrlDecode(salt),
      iterations: PASSWORD_ITERATIONS,
    },
    key,
    256,
  );
  return base64UrlEncode(new Uint8Array(bits));
}

async function hmacSha256(secret: string, value: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(value),
  );
  return new Uint8Array(signature);
}

function requirePasswordPepper() {
  const pepper = env.PASSWORD_PEPPER?.trim();
  if (!pepper || pepper.length < 32) {
    throw new Error('PASSWORD_PEPPER must contain at least 32 characters.');
  }
  return pepper;
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

function base64UrlDecode(value: string) {
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}
