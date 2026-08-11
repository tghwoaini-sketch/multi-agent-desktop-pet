import { registerAgent } from "../store";

export async function POST(request: Request) {
  try {
    const agent = registerAgent(await request.json() as Record<string, unknown>);
    return Response.json({ ok: true, agent });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "register failed" }, { status: 400 });
  }
}
