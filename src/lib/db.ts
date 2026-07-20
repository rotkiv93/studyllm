import Database from "@tauri-apps/plugin-sql";
import type { ProviderType } from "./providers";

let dbPromise: Promise<Database> | null = null;

function getDb(): Promise<Database> {
  if (!dbPromise) {
    dbPromise = Database.load("sqlite:studyllm.db");
  }
  return dbPromise;
}

export interface ProviderRow {
  id: string;
  type: ProviderType;
  label: string;
  model: string;
  base_url_override: string | null;
  priority: number;
  enabled: number;
  secret_ref: string;
  created_at: number;
}

export interface ConversationRow {
  id: string;
  title: string;
  created_at: number;
  updated_at: number;
  pinned: number;
  /** Chat "lab" overrides for this conversation. null = use the model/provider default.
   * `system_prompt` is a persisted standing instruction the student authored (distinct from the
   * transient per-turn research/RAG steering, which is never saved). */
  system_prompt: string | null;
  temperature: number | null;
  top_p: number | null;
  max_tokens: number | null;
}

export interface MessageRow {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  provider_used: string | null;
  model_used: string | null;
  created_at: number;
}

export interface McpServerRow {
  id: string;
  name: string;
  kind: string;
  command: string;
  args_json: string;
  scoped_path: string | null;
  enabled: number;
  created_at: number;
  /** 'stdio' (spawned npx child process) or 'remote-http' (Streamable HTTP). */
  transport: string;
  /** Remote endpoint URL; null for stdio servers. */
  url: string | null;
  /** JSON: Record<envVarName, { secret: boolean; value: string }> — secret values are keychain refs. */
  env_refs_json: string;
  /** 'official' | 'verified' | 'community', computed at install time. */
  trust_tier: string;
  /** JSON: Record<toolName, { enabled: boolean; permission: 'allow' | 'ask' | 'deny' }>. Tools absent from this map default to enabled+allow. */
  tool_permissions_json: string;
  /** 1 = start this server automatically after the app launches. */
  autostart: number;
  /** JSON: McpToolInfo[] snapshot from the last time this server was running — lets the tool
   * permission UI work while the server is stopped. */
  cached_tools_json: string;
  /** Set (e.g. `"google"`) only for servers connected via the Plugins OAuth flow; null for every
   * other server kind. Drives `McpPanel`'s pinning/edit-form branching instead of name-sniffing. */
  oauth_provider: string | null;
  /** Epoch milliseconds the current OAuth access token expires at; null for non-OAuth servers.
   * Only informational on the frontend — the Rust-side refresh loop is what actually keeps the
   * connection alive, this is just kept in sync for display/autostart-reconnect purposes. */
  oauth_expires_at: number | null;
}

export interface ToolCallRow {
  id: string;
  message_id: string;
  tool_call_id: string;
  /** `t${serverId}_${toolName}` — same sanitized key used to register the dynamicTool. */
  tool_key: string;
  input_json: string;
  output_text: string | null;
  is_error: number;
  seq: number;
  /** Length of the assistant's persisted `content` text emitted before this call was made —
   * lets history replay interleave tool blocks with text segments in their original order. */
  text_offset: number;
  created_at: number;
}

export interface McpCatalogCacheRow {
  id: string;
  name: string;
  description: string;
  version: string | null;
  repository_url: string | null;
  runtime: string;
  install_json: string;
  required_env_json: string;
  fetched_at: number;
}

export async function listProviders(): Promise<ProviderRow[]> {
  const db = await getDb();
  return db.select<ProviderRow[]>(
    "SELECT * FROM providers ORDER BY priority ASC, created_at ASC",
  );
}

export async function insertProvider(row: ProviderRow): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO providers (id, type, label, model, base_url_override, priority, enabled, secret_ref, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      row.id,
      row.type,
      row.label,
      row.model,
      row.base_url_override,
      row.priority,
      row.enabled,
      row.secret_ref,
      row.created_at,
    ],
  );
}

export async function updateProvider(
  id: string,
  patch: Partial<Pick<ProviderRow, "label" | "priority" | "enabled" | "base_url_override" | "model">>,
): Promise<void> {
  const db = await getDb();
  const fields = Object.keys(patch) as (keyof typeof patch)[];
  if (fields.length === 0) return;
  const setClause = fields.map((f, i) => `${f} = $${i + 1}`).join(", ");
  const values = fields.map((f) => patch[f]);
  await db.execute(`UPDATE providers SET ${setClause} WHERE id = $${fields.length + 1}`, [
    ...values,
    id,
  ]);
}

export async function deleteProvider(id: string): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM providers WHERE id = $1", [id]);
}

export async function recordProviderUsage(
  providerId: string,
  date: string,
  tokenCount: number,
): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO provider_usage (provider_id, date, request_count, token_count_estimate)
     VALUES ($1, $2, 1, $3)
     ON CONFLICT(provider_id, date) DO UPDATE SET
       request_count = request_count + 1,
       token_count_estimate = token_count_estimate + excluded.token_count_estimate`,
    [providerId, date, tokenCount],
  );
}

export async function getProviderUsageToday(
  providerId: string,
): Promise<{ request_count: number; token_count_estimate: number } | null> {
  const db = await getDb();
  const today = new Date().toISOString().slice(0, 10);
  const rows = await db.select<{ request_count: number; token_count_estimate: number }[]>(
    "SELECT request_count, token_count_estimate FROM provider_usage WHERE provider_id = $1 AND date = $2",
    [providerId, today],
  );
  return rows[0] ?? null;
}

export async function createConversation(id: string, title: string): Promise<void> {
  const db = await getDb();
  const now = Date.now();
  await db.execute(
    "INSERT INTO conversations (id, title, created_at, updated_at, pinned) VALUES ($1, $2, $3, $4, 0)",
    [id, title, now, now],
  );
}

/** Persist the chat-lab overrides for a conversation. Any field left null falls back to the
 * model/provider default at send time. Kept separate from `touchConversation` so editing the lab
 * controls doesn't reorder the conversation list. */
export async function updateConversationSettings(
  id: string,
  settings: {
    system_prompt: string | null;
    temperature: number | null;
    top_p: number | null;
    max_tokens: number | null;
  },
): Promise<void> {
  const db = await getDb();
  await db.execute(
    `UPDATE conversations
        SET system_prompt = $1, temperature = $2, top_p = $3, max_tokens = $4
      WHERE id = $5`,
    [settings.system_prompt, settings.temperature, settings.top_p, settings.max_tokens, id],
  );
}

export async function getConversation(id: string): Promise<ConversationRow | null> {
  const db = await getDb();
  const rows = await db.select<ConversationRow[]>("SELECT * FROM conversations WHERE id = $1", [id]);
  return rows[0] ?? null;
}

export async function touchConversation(id: string): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE conversations SET updated_at = $1 WHERE id = $2", [Date.now(), id]);
}

export async function listConversations(): Promise<ConversationRow[]> {
  const db = await getDb();
  return db.select<ConversationRow[]>(
    "SELECT * FROM conversations ORDER BY pinned DESC, updated_at DESC",
  );
}

export async function deleteConversation(id: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    "DELETE FROM tool_calls WHERE message_id IN (SELECT id FROM messages WHERE conversation_id = $1)",
    [id],
  );
  await db.execute("DELETE FROM messages WHERE conversation_id = $1", [id]);
  await db.execute("DELETE FROM conversations WHERE id = $1", [id]);
}

export async function renameConversation(id: string, title: string): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE conversations SET title = $1 WHERE id = $2", [title, id]);
}

export async function insertMessage(row: MessageRow): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO messages (id, conversation_id, role, content, provider_used, model_used, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      row.id,
      row.conversation_id,
      row.role,
      row.content,
      row.provider_used,
      row.model_used,
      row.created_at,
    ],
  );
}

export async function listMessages(conversationId: string): Promise<MessageRow[]> {
  const db = await getDb();
  return db.select<MessageRow[]>(
    "SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC",
    [conversationId],
  );
}

export async function deleteMessagesFrom(conversationId: string, fromMessageId: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    `DELETE FROM tool_calls WHERE message_id IN (
       SELECT id FROM messages
       WHERE conversation_id = $1
         AND created_at >= (SELECT created_at FROM messages WHERE id = $2)
     )`,
    [conversationId, fromMessageId],
  );
  await db.execute(
    `DELETE FROM messages
     WHERE conversation_id = $1
       AND created_at >= (SELECT created_at FROM messages WHERE id = $2)`,
    [conversationId, fromMessageId],
  );
}

export async function insertToolCall(row: ToolCallRow): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO tool_calls (id, message_id, tool_call_id, tool_key, input_json, output_text, is_error, seq, text_offset, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      row.id,
      row.message_id,
      row.tool_call_id,
      row.tool_key,
      row.input_json,
      row.output_text,
      row.is_error,
      row.seq,
      row.text_offset,
      row.created_at,
    ],
  );
}

export async function listToolCallsForConversation(conversationId: string): Promise<ToolCallRow[]> {
  const db = await getDb();
  return db.select<ToolCallRow[]>(
    `SELECT tc.* FROM tool_calls tc
     JOIN messages m ON m.id = tc.message_id
     WHERE m.conversation_id = $1
     ORDER BY m.created_at ASC, tc.seq ASC`,
    [conversationId],
  );
}

export async function listMcpServers(): Promise<McpServerRow[]> {
  const db = await getDb();
  return db.select<McpServerRow[]>("SELECT * FROM mcp_servers ORDER BY created_at ASC");
}

export async function insertMcpServer(row: McpServerRow): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO mcp_servers
       (id, name, kind, command, args_json, scoped_path, enabled, created_at, transport, url, env_refs_json, trust_tier, tool_permissions_json, autostart, cached_tools_json, oauth_provider, oauth_expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
    [
      row.id,
      row.name,
      row.kind,
      row.command,
      row.args_json,
      row.scoped_path,
      row.enabled,
      row.created_at,
      row.transport,
      row.url,
      row.env_refs_json,
      row.trust_tier,
      row.tool_permissions_json,
      row.autostart,
      row.cached_tools_json,
      row.oauth_provider,
      row.oauth_expires_at,
    ],
  );
}

export async function updateMcpServer(
  id: string,
  patch: Partial<
    Pick<
      McpServerRow,
      | "name"
      | "args_json"
      | "scoped_path"
      | "url"
      | "env_refs_json"
      | "tool_permissions_json"
      | "autostart"
      | "cached_tools_json"
      | "oauth_expires_at"
    >
  >,
): Promise<void> {
  const db = await getDb();
  const fields = Object.keys(patch) as (keyof typeof patch)[];
  if (fields.length === 0) return;
  const setClause = fields.map((f, i) => `${f} = $${i + 1}`).join(", ");
  const values = fields.map((f) => patch[f]);
  await db.execute(`UPDATE mcp_servers SET ${setClause} WHERE id = $${fields.length + 1}`, [
    ...values,
    id,
  ]);
}

export async function deleteMcpServer(id: string): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM mcp_servers WHERE id = $1", [id]);
}

export async function upsertCatalogEntries(entries: McpCatalogCacheRow[]): Promise<void> {
  const db = await getDb();
  for (const e of entries) {
    await db.execute(
      `INSERT INTO mcp_catalog_cache
         (id, name, description, version, repository_url, runtime, install_json, required_env_json, fetched_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         description = excluded.description,
         version = excluded.version,
         repository_url = excluded.repository_url,
         runtime = excluded.runtime,
         install_json = excluded.install_json,
         required_env_json = excluded.required_env_json,
         fetched_at = excluded.fetched_at`,
      [
        e.id,
        e.name,
        e.description,
        e.version,
        e.repository_url,
        e.runtime,
        e.install_json,
        e.required_env_json,
        e.fetched_at,
      ],
    );
  }
}

export async function listCachedCatalogEntries(): Promise<McpCatalogCacheRow[]> {
  const db = await getDb();
  return db.select<McpCatalogCacheRow[]>(
    "SELECT * FROM mcp_catalog_cache ORDER BY fetched_at DESC",
  );
}

export async function searchCachedCatalogEntries(query: string): Promise<McpCatalogCacheRow[]> {
  const db = await getDb();
  const like = `%${query}%`;
  return db.select<McpCatalogCacheRow[]>(
    "SELECT * FROM mcp_catalog_cache WHERE name LIKE $1 OR description LIKE $1 ORDER BY fetched_at DESC",
    [like],
  );
}

/** Days after which a stale catalog cache entry is dropped on next successful live search. */
export const CATALOG_CACHE_TTL_DAYS = 14;

export async function evictStaleCatalogEntries(ttlDays: number = CATALOG_CACHE_TTL_DAYS): Promise<void> {
  const db = await getDb();
  const cutoff = Date.now() - ttlDays * 24 * 60 * 60 * 1000;
  await db.execute("DELETE FROM mcp_catalog_cache WHERE fetched_at < $1", [cutoff]);
}

export async function clearCatalogCache(): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM mcp_catalog_cache", []);
}

// ── RAG document library ───────────────────────────────────────────────────────

export interface RagDocumentRow {
  id: string;
  name: string;
  char_count: number;
  chunk_count: number;
  /** The embedding model the chunks were embedded with (for display + mismatch warnings). */
  embed_model: string;
  created_at: number;
}

export interface RagChunkRow {
  id: string;
  document_id: string;
  seq: number;
  text: string;
  /** JSON-encoded `number[]` — the chunk's embedding vector (SQLite has no native vector type). */
  embedding: string;
  created_at: number;
}

export async function insertRagDocument(row: RagDocumentRow): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO rag_documents (id, name, char_count, chunk_count, embed_model, created_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [row.id, row.name, row.char_count, row.chunk_count, row.embed_model, row.created_at],
  );
}

export async function insertRagChunks(rows: RagChunkRow[]): Promise<void> {
  const db = await getDb();
  for (const row of rows) {
    await db.execute(
      `INSERT INTO rag_chunks (id, document_id, seq, text, embedding, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [row.id, row.document_id, row.seq, row.text, row.embedding, row.created_at],
    );
  }
}

export async function listRagDocuments(): Promise<RagDocumentRow[]> {
  const db = await getDb();
  return db.select<RagDocumentRow[]>("SELECT * FROM rag_documents ORDER BY created_at DESC");
}

export async function countRagDocuments(): Promise<number> {
  const db = await getDb();
  const rows = await db.select<{ n: number }[]>("SELECT COUNT(*) AS n FROM rag_documents");
  return rows[0]?.n ?? 0;
}

/** Every chunk across all documents, joined with its document's name for citation display. */
export async function listAllRagChunks(): Promise<(RagChunkRow & { document_name: string })[]> {
  const db = await getDb();
  return db.select<(RagChunkRow & { document_name: string })[]>(
    `SELECT c.*, d.name AS document_name
     FROM rag_chunks c JOIN rag_documents d ON d.id = c.document_id
     ORDER BY c.document_id, c.seq ASC`,
  );
}

/** Delete a document and its chunks (FKs aren't enforced, so remove chunks explicitly). */
export async function deleteRagDocument(id: string): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM rag_chunks WHERE document_id = $1", [id]);
  await db.execute("DELETE FROM rag_documents WHERE id = $1", [id]);
}
