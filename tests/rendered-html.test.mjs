import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("uses D1 as durable storage and keeps browser data as a cache", async () => {
  const [hosting, route, gate, layout] = await Promise.all([
    source("../.openai/hosting.json"),
    source("../app/api/persistence/route.ts"),
    source("../app/PersistenceGate.tsx"),
    source("../app/layout.tsx"),
  ]);

  assert.match(hosting, /"d1":\s*"DB"/);
  assert.match(route, /CREATE TABLE IF NOT EXISTS state_meta/);
  assert.match(route, /state_revisions/);
  assert.match(route, /OFFSET 10/);
  assert.match(gate, /PERSISTED_STORAGE_KEYS/);
  assert.match(gate, /localStorage\.setItem/);
  assert.match(layout, /<PersistenceGate>/);
});

test("task saves append safely and create rolling browser backups", async () => {
  const [taskModel, persistence] = await Promise.all([
    source("../app/lib/task-model.ts"),
    source("../app/lib/persistent-storage.ts"),
  ]);

  assert.match(taskModel, /saveTaskLibrary\(\[task, \.\.\.library\.filter/);
  assert.match(taskModel, /TASK_LIBRARY_BACKUP_KEY/);
  assert.match(taskModel, /\.slice\(0, 8\)/);
  assert.match(persistence, /fetch\("\/api\/persistence"/);
  assert.match(persistence, /keepalive:\s*true/);
});
