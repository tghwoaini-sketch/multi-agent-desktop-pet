import { snapshot } from "./store";

export async function GET() {
  return Response.json(snapshot(), { headers: { "Cache-Control": "no-store" } });
}
