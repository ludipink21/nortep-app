import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  "https://anioubcfdpbqbhmgkbwf.supabase.co";

const supabasePublishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  "sb_publishable_U9Tv18zXwvHv9sasisVFIw_PAFVycjL";

const RETRYABLE = new Set([408, 429, 500, 502, 503, 504]);

function wait(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function POST(request: NextRequest) {
  const requestId = request.headers.get("x-request-id") || crypto.randomUUID();
  const raw = (await request.json().catch(() => null)) as Record<string, unknown> | null;

  if (!raw || typeof raw.p_code !== "string" || !raw.p_code.trim()) {
    return NextResponse.json({ message: "Link de origem inválido.", request_id: requestId }, { status: 400 });
  }

  const body = { ...raw };
  delete body.request_id;

  let lastStatus = 503;
  let lastValue: Record<string, unknown> = { message: "Não foi possível registrar sua resposta." };

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(`${supabaseUrl}/rest/v1/rpc/submit_public_mobilization_response_v2`, {
        method: "POST",
        headers: {
          apikey: supabasePublishableKey,
          "Content-Type": "application/json",
          "X-Client-Info": "nortep-server-submit-v1",
          "X-Request-Id": requestId,
        },
        cache: "no-store",
        body: JSON.stringify(body),
      });

      const value = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      if (response.ok) {
        return NextResponse.json({ ...value, request_id: requestId }, {
          status: 200,
          headers: { "Cache-Control": "no-store, max-age=0" },
        });
      }

      lastStatus = response.status;
      lastValue = value;
      if (!RETRYABLE.has(response.status)) break;
    } catch {
      lastStatus = 503;
      lastValue = { message: "Falha temporária de conexão. Tente novamente." };
    }

    if (attempt < 2) await wait(400 * 2 ** attempt);
  }

  console.error("mobilization-submit-failed", {
    requestId,
    status: lastStatus,
    message: lastValue.message || lastValue.error || "unknown",
  });

  return NextResponse.json(
    {
      message: lastValue.message || lastValue.error || "Não foi possível registrar sua resposta.",
      request_id: requestId,
    },
    { status: lastStatus >= 400 && lastStatus < 600 ? lastStatus : 503 },
  );
}
