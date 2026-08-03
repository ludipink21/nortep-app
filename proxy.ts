import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { isActiveNortePProduct, resolveNortePProduct } from "./subdomain-routing.mjs";

export function proxy(request: NextRequest) {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost || request.headers.get("host") || "";
  const rootDomain = process.env.NORTEP_ROOT_DOMAIN || "nortep.ia.br";
  const product = resolveNortePProduct(host, rootDomain);

  if (!product) return NextResponse.next();

  if (isActiveNortePProduct(product)) {
    const response = NextResponse.next();
    response.headers.set("x-nortep-product", product);
    return response;
  }

  const destination = request.nextUrl.clone();
  destination.pathname = `/produto/${product}`;
  const response = NextResponse.rewrite(destination);
  response.headers.set("x-nortep-product", product);
  return response;
}

export const config = {
  matcher: "/",
};
