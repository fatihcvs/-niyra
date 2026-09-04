export async function GET() {
  const startedAt = Date.now();
  try {
    const { env } = await import("cloudflare:workers");
    if (!env.DB) throw new Error("database unavailable");
    await env.DB.prepare("SELECT 1 AS ok").first();
    return Response.json(
      { status: "ok", service: "uniyra", version: "1.6.22", database: "ok", storage: env.FILES ? "configured" : "unavailable", latencyMs: Date.now() - startedAt },
      { headers: { "cache-control": "no-store" } },
    );
  } catch {
    return Response.json(
      { status: "degraded", service: "uniyra", version: "1.6.22", database: "unavailable", storage: "unknown", latencyMs: Date.now() - startedAt },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
