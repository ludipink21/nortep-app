export const dynamic = "force-dynamic";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  "https://anioubcfdpbqbhmgkbwf.supabase.co";

const supabasePublishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  "sb_publishable_U9Tv18zXwvHv9sasisVFIw_PAFVycjL";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const requestedPath = typeof body?.path === "string" ? body.path : "/convite";

    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return Response.json({ message: "Informe um e-mail válido." }, { status: 400 });
    }

    const safePath = requestedPath.startsWith("/convite?") || requestedPath === "/convite"
      ? requestedPath
      : "/convite";
    const origin = new URL(request.url).origin;
    const redirectTo = `${origin}${safePath}`;

    const response = await fetch(
      `${supabaseUrl}/auth/v1/resend?redirect_to=${encodeURIComponent(redirectTo)}`,
      {
        method: "POST",
        headers: {
          apikey: supabasePublishableKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ type: "signup", email }),
        cache: "no-store",
      },
    );

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = result?.msg || result?.message || result?.error_description || result?.error;
      return Response.json(
        { message: message || "Não foi possível reenviar a confirmação agora." },
        { status: response.status },
      );
    }

    return Response.json({ sent: true });
  } catch {
    return Response.json({ message: "Não foi possível reenviar a confirmação agora." }, { status: 500 });
  }
}
