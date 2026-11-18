import { NextResponse, type NextRequest } from "next/server";
import { apiOrigin } from "./lib/api-origin";

export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname === "/staff/login" && !request.nextUrl.search) {
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }

  const upstream = new URL(apiOrigin());
  upstream.pathname = request.nextUrl.pathname;
  upstream.search = request.nextUrl.search;
  return NextResponse.rewrite(upstream);
}

export const config = {
  matcher: ["/api/:path*", "/health/:path*", "/staff/login", "/admin/login", "/signin-oidc", "/signin-google"],
};
