export const dynamic = "force-dynamic";

// Public runtime configuration for the production NorteP database.\nconst supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  "https://anioubcfdpbqbhmgkbwf.supabase.co";

const supabasePublishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  "sb_publishable_U9Tv18zXwvHv9sasisVFIw_PAFVycjL";

export async function GET() {
  return Response.json(
    {
      url: supabaseUrl,
      key: supabasePublishableKey,
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    },
  );
}
