import data from "../../../analise-eleitoral/data/mg-2024.json";

// Official, public aggregate election results. No supporter or research records.
export async function GET() {
  return Response.json(data, { headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}
