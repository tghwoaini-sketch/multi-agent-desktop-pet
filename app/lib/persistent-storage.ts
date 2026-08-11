export const PERSISTED_STORAGE_KEYS = [
  "xiaobu-task-library-v1",
  "xiaobu-task-library-backups-v1",
  "xiaobu-tip-library-v1",
  "xiaobu-tip-groups-v1",
  "xiaobu-reward-library-v1",
  "xiaobu-reward-history-v1",
  "xiaobu-xiuxian-state",
  "xiaobu-daily-ledger-v1",
] as const;

export type PersistedStorageKey = (typeof PERSISTED_STORAGE_KEYS)[number];

function isPersistedKey(key: string): key is PersistedStorageKey {
  return (PERSISTED_STORAGE_KEYS as readonly string[]).includes(key);
}

export async function savePersistentValue(key: string, value: string): Promise<boolean> {
  localStorage.setItem(key, value);
  if (!isPersistedKey(key)) return true;
  try {
    const response = await fetch("/api/persistence", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key, value }),
      keepalive: true,
    });
    return response.ok;
  } catch {
    // Keep the browser cache usable while allowing critical save flows to retry.
    return false;
  }
}
