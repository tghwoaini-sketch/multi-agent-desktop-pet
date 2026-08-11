const BRIDGE_CONTROL_URL = "http://127.0.0.1:43127/control";

async function proxyBridge(request: Request, method: "GET" | "POST") {
  try {
    const body = method === "POST" ? await request.text() : undefined;
    const response = await fetch(BRIDGE_CONTROL_URL, {
      method,
      body,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(2500),
    });
    return new Response(response.body, {
      status: response.status,
      headers: { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8" },
    });
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : "Codex 桥接器不可用" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

export async function GET(request: Request) {
  return proxyBridge(request, "GET");
}

export async function POST(request: Request) {
  return proxyBridge(request, "POST");
}
