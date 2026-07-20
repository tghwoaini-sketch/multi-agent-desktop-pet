"use client";

import { useEffect, useState } from "react";
import { PERSISTED_STORAGE_KEYS } from "./lib/persistent-storage";

type PersistencePayload = {
  records?: Record<string, string>;
};

export default function PersistenceGate({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function hydrate() {
      try {
        const response = await fetch("/api/persistence", { cache: "no-store" });
        if (!response.ok) throw new Error("database unavailable");
        const payload = await response.json() as PersistencePayload;
        const remote = payload.records ?? {};
        const missing: Array<{ key: string; value: string }> = [];

        for (const key of PERSISTED_STORAGE_KEYS) {
          if (typeof remote[key] === "string") {
            localStorage.setItem(key, remote[key]);
          } else {
            const local = localStorage.getItem(key);
            if (local !== null) missing.push({ key, value: local });
          }
        }

        await Promise.all(missing.map((record) => fetch("/api/persistence", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(record),
        })));
      } catch {
        // Offline/local-service fallback: keep the existing browser cache usable.
      } finally {
        if (!cancelled) setReady(true);
      }
    }
    void hydrate();
    return () => { cancelled = true; };
  }, []);

  if (!ready) return <main className="persistence-loading"><span>叶</span><p>正在载入修行记录…</p></main>;
  return children;
}
