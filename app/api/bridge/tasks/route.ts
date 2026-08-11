const BRIDGE_TASKS_URL = "http://127.0.0.1:43127/tasks";

export async function GET() {
  try {
    const response = await fetch(BRIDGE_TASKS_URL, { cache: "no-store", signal: AbortSignal.timeout(2500) });
    return new Response(response.body, {
      status: response.status,
      headers: { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8" },
    });
  } catch (error) {
    return Response.json({ connected: false, tasks: [], syncedAt: null, error: error instanceof Error ? error.message : "Codex 桥接器不可用" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
