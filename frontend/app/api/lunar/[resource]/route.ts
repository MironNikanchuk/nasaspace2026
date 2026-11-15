import { NextRequest, NextResponse } from "next/server";
import { demoCatalog, demoComparison } from "@/lib/demo";
import { parsePair } from "@/lib/presets";

const origin = (process.env.LUNAWINDOW_API_URL ?? "http://127.0.0.1:8000").replace(/\/+$/, "");
const routes = new Set(["sites", "health", "compare"]);
type Context = { params: Promise<{ resource: string }> };

async function forward(resource: string, options: RequestInit) {
  try {
    const reply = await fetch(`${origin}/api/v1/${resource}`, {
      ...options, cache: "no-store", signal: AbortSignal.timeout(4_000), redirect: "error",
    });
    if (reply.status >= 500) return;
    const data = await reply.json();
    return NextResponse.json(data, { status: reply.status, headers: { "Cache-Control": "no-store" } });
  } catch {
    return;
  }
}

export async function GET(_request: NextRequest, context: Context) {
  const { resource } = await context.params;
  if (!routes.has(resource) || resource === "compare") {
    return NextResponse.json({ detail: "Endpoint not found" }, { status: 404 });
  }

  return await forward(resource, {}) ?? (resource === "sites"
    ? NextResponse.json(demoCatalog)
    : NextResponse.json({ status: "demo", dataset_version: demoCatalog.dataset.version }));
}

export async function POST(request: NextRequest, context: Context) {
  const { resource } = await context.params;
  if (resource !== "compare") return NextResponse.json({ detail: "Endpoint not found" }, { status: 404 });
  const body = await request.text();
  if (body.length > 8192) return NextResponse.json({ detail: "Request is too large" }, { status: 413 });
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    return NextResponse.json({ detail: "Invalid comparison request" }, { status: 400 });
  }
  const pair = parsePair(parsed?.scenarios);
  if (!pair) return NextResponse.json({ detail: "Provide two valid scenarios" }, { status: 422 });

  const upstream = await forward(resource, {
    method: "POST", headers: { "Content-Type": "application/json" }, body,
  });
  if (upstream) return upstream;
  const snapshot = demoComparison(pair);
  if (snapshot) return NextResponse.json(snapshot);
  return NextResponse.json(
    { detail: "Live API unavailable." },
    { status: 503 },
  );
}
