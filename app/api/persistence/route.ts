import { env } from "cloudflare:workers";

const ALLOWED_KEYS = new Set([
  "xiaobu-task-library-v1",
  "xiaobu-task-library-backups-v1",
  "xiaobu-tip-library-v1",
  "xiaobu-tip-groups-v1",
  "xiaobu-reward-library-v1",
  "xiaobu-reward-history-v1",
  "xiaobu-xiuxian-state",
  "xiaobu-daily-ledger-v1",
]);
const CHUNK_CHARACTERS = 180_000;
const MAX_VALUE_BYTES = 12_000_000;

async function ensureSchema() {
  const db = env.DB;
  await db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS state_meta (key TEXT PRIMARY KEY, updated_at TEXT NOT NULL, chunk_count INTEGER NOT NULL, size_bytes INTEGER NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS state_chunks (key TEXT NOT NULL, chunk_index INTEGER NOT NULL, value TEXT NOT NULL, PRIMARY KEY (key, chunk_index))"),
    db.prepare("CREATE TABLE IF NOT EXISTS state_revisions (id TEXT PRIMARY KEY, key TEXT NOT NULL, saved_at TEXT NOT NULL, chunk_count INTEGER NOT NULL, size_bytes INTEGER NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS state_revision_chunks (revision_id TEXT NOT NULL, chunk_index INTEGER NOT NULL, value TEXT NOT NULL, PRIMARY KEY (revision_id, chunk_index))"),
    db.prepare("CREATE INDEX IF NOT EXISTS state_revisions_key_saved_idx ON state_revisions (key, saved_at DESC)"),
  ]);
}

function splitValue(value: string) {
  const chunks: string[] = [];
  for (let offset = 0; offset < value.length; offset += CHUNK_CHARACTERS) chunks.push(value.slice(offset, offset + CHUNK_CHARACTERS));
  return chunks.length ? chunks : [""];
}

async function writeRecord(key: string, value: string) {
  if (!ALLOWED_KEYS.has(key)) throw new Error("unsupported storage key");
  const sizeBytes = new TextEncoder().encode(value).byteLength;
  if (sizeBytes > MAX_VALUE_BYTES) throw new Error("record exceeds 12 MB safety limit");
  const db = env.DB;
  const chunks = splitValue(value);
  const previous = await db.prepare("SELECT chunk_count, size_bytes FROM state_meta WHERE key = ?").bind(key).first<{ chunk_count: number; size_bytes: number }>();
  const statements = [];
  if (previous) {
    const revisionId = crypto.randomUUID();
    const savedAt = new Date().toISOString();
    statements.push(
      db.prepare("INSERT INTO state_revisions (id, key, saved_at, chunk_count, size_bytes) VALUES (?, ?, ?, ?, ?)").bind(revisionId, key, savedAt, previous.chunk_count, previous.size_bytes),
      db.prepare("INSERT INTO state_revision_chunks (revision_id, chunk_index, value) SELECT ?, chunk_index, value FROM state_chunks WHERE key = ?").bind(revisionId, key),
    );
  }
  statements.push(
    db.prepare("DELETE FROM state_chunks WHERE key = ?").bind(key),
    db.prepare("INSERT INTO state_meta (key, updated_at, chunk_count, size_bytes) VALUES (?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET updated_at = excluded.updated_at, chunk_count = excluded.chunk_count, size_bytes = excluded.size_bytes").bind(key, new Date().toISOString(), chunks.length, sizeBytes),
    ...chunks.map((chunk, index) => db.prepare("INSERT INTO state_chunks (key, chunk_index, value) VALUES (?, ?, ?)").bind(key, index, chunk)),
    db.prepare("DELETE FROM state_revision_chunks WHERE revision_id IN (SELECT id FROM state_revisions WHERE key = ? ORDER BY saved_at DESC LIMIT -1 OFFSET 10)").bind(key),
    db.prepare("DELETE FROM state_revisions WHERE key = ? AND id IN (SELECT id FROM state_revisions WHERE key = ? ORDER BY saved_at DESC LIMIT -1 OFFSET 10)").bind(key, key),
  );
  await db.batch(statements);
}

async function readAllRecords() {
  const meta = await env.DB.prepare("SELECT key FROM state_meta ORDER BY key").all<{ key: string }>();
  const records: Record<string, string> = {};
  for (const row of meta.results) {
    if (!ALLOWED_KEYS.has(row.key)) continue;
    const chunks = await env.DB.prepare("SELECT value FROM state_chunks WHERE key = ? ORDER BY chunk_index").bind(row.key).all<{ value: string }>();
    records[row.key] = chunks.results.map((item) => item.value).join("");
  }
  return records;
}

export async function GET() {
  try {
    await ensureSchema();
    return Response.json({ records: await readAllRecords(), storage: "local-d1", revisionLimit: 10 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "database unavailable" }, { status: 503 });
  }
}

export async function HEAD() {
  try {
    await ensureSchema();
    const probeKey = `__health_${crypto.randomUUID()}`;
    await env.DB.batch([
      env.DB.prepare("INSERT INTO state_meta (key, updated_at, chunk_count, size_bytes) VALUES (?, ?, 1, 2)").bind(probeKey, new Date().toISOString()),
      env.DB.prepare("INSERT INTO state_chunks (key, chunk_index, value) VALUES (?, 0, 'ok')").bind(probeKey),
      env.DB.prepare("DELETE FROM state_chunks WHERE key = ?").bind(probeKey),
      env.DB.prepare("DELETE FROM state_meta WHERE key = ?").bind(probeKey),
    ]);
    return new Response(null, { status: 204, headers: { "x-xiaobu-storage": "ready" } });
  } catch {
    return new Response(null, { status: 503 });
  }
}

export async function PUT(request: Request) {
  try {
    await ensureSchema();
    const body = await request.json() as { key?: unknown; value?: unknown };
    if (typeof body.key !== "string" || typeof body.value !== "string") return Response.json({ error: "invalid record" }, { status: 400 });
    await writeRecord(body.key, body.value);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "save failed" }, { status: 400 });
  }
}
