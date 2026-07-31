export async function GET(request: Request) {
  return Response.redirect(new URL("/nortep-icon-v1.png", request.url), 307);
}
