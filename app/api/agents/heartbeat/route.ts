import { heartbeat, snapshot } from "../store";

export async function POST(request: Request) {
  try {
    const agent = heartbeat(await request.json() as Record<string, unknown>);
    if (!agent) return Response.json({ ok: false, receivingEnabled: snapshot().receivingEnabled, message: "看板当前未开启 Agent 接收" }, { status: 409 });
    return Response.json({ ok: true, agent, receivingEnabled: snapshot().receivingEnabled });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "heartbeat failed" }, { status: 400 });
  }
}
