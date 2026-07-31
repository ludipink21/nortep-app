export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(
    {
      url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
      key: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    },
  );
}
