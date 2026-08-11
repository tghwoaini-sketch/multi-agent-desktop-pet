import { setRealtimeEnabled, snapshot } from "../store";

export async function GET() {
  const state = snapshot();
  return Response.json({ realtimeEnabled: state.realtimeEnabled, receivingEnabled: state.receivingEnabled }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { enabled?: unknown };
    if (typeof body.enabled !== "boolean") return Response.json({ error: "enabled must be boolean" }, { status: 400 });
    const realtimeEnabled = setRealtimeEnabled(body.enabled);
    return Response.json({ ok: true, realtimeEnabled, receivingEnabled: snapshot().receivingEnabled });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "control failed" }, { status: 400 });
  }
}
