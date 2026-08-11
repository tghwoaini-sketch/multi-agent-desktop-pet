import { snapshot, upsertTask } from "../../agents/store";

export async function POST(request: Request) {
  try {
    const task = upsertTask(await request.json() as Record<string, unknown>);
    if (!task) return Response.json({ ok: false, receivingEnabled: snapshot().receivingEnabled, message: "看板当前未开启 Agent 接收" }, { status: 409 });
    return Response.json({ ok: true, task, receivingEnabled: snapshot().receivingEnabled });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "task update failed" }, { status: 400 });
  }
}
