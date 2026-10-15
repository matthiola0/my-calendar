import { getDatabaseBinding } from '../../db';
import { ensureSchema } from '../../db/ensure-schema';

const TOKEN_PREFIX = 'daybook_';
const TOKEN_LIFETIME_MS = 90 * 24 * 60 * 60 * 1000;
const MAX_ACTIVE_TOKENS = 10;

export type AgentTokenMetadata = {
  id: string;
  name: string;
  createdAt: number;
  expiresAt: number;
};

type AgentTokenRow = {
  id: string;
  name: string;
  created_at: number;
  expires_at: number;
};

export async function listAgentTokens(ownerId: string): Promise<AgentTokenMetadata[]> {
  await ensureSchema();
  const rows = await getDatabaseBinding()
    .prepare(`
      SELECT id, name, created_at, expires_at FROM agent_tokens
      WHERE owner_id = ? AND expires_at > ? ORDER BY created_at DESC
    `)
    .bind(ownerId, Date.now())
    .all<AgentTokenRow>();
  return rows.results.map(toMetadata);
}

export async function createAgentToken(ownerId: string, name: string) {
  await ensureSchema();
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = TOKEN_PREFIX + Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  const tokenHash = await hashToken(token);
  const now = Date.now();
  const metadata: AgentTokenMetadata = {
    id: crypto.randomUUID(),
    name,
    createdAt: now,
    expiresAt: now + TOKEN_LIFETIME_MS,
  };

  // A conditional insert enforces the limit even if two requests arrive together.
  const result = await getDatabaseBinding()
    .prepare(`
      INSERT INTO agent_tokens (id, owner_id, token_hash, name, created_at, expires_at)
      SELECT ?, ?, ?, ?, ?, ?
      WHERE (SELECT COUNT(*) FROM agent_tokens WHERE owner_id = ? AND expires_at > ?) < ?
    `)
    .bind(metadata.id, ownerId, tokenHash, name, now, metadata.expiresAt, ownerId, now, MAX_ACTIVE_TOKENS)
    .run();
  if (result.meta.changes === 0) return null;
  return { token, ...metadata };
}

export async function revokeAgentToken(ownerId: string, id: string) {
  await ensureSchema();
  const result = await getDatabaseBinding()
    .prepare('DELETE FROM agent_tokens WHERE owner_id = ? AND id = ?')
    .bind(ownerId, id)
    .run();
  return result.meta.changes > 0;
}

export async function getAgentTokenOwnerId(token: string) {
  if (!/^daybook_[a-f0-9]{64}$/.test(token)) return null;
  await ensureSchema();
  const row = await getDatabaseBinding()
    .prepare('SELECT owner_id FROM agent_tokens WHERE token_hash = ? AND expires_at > ?')
    .bind(await hashToken(token), Date.now())
    .first<{ owner_id: string }>();
  return row?.owner_id ?? null;
}

async function hashToken(token: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function toMetadata(row: AgentTokenRow): AgentTokenMetadata {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}
