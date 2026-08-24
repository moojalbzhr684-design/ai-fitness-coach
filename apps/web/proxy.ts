import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const PRODUCTION_STAFF_PREFIXES = ["/admin", "/gym", "/trainer", "/staff"] as const;

export function isProductionStaffPath(pathname: string, nodeEnv = process.env.NODE_ENV): boolean {
  if (nodeEnv !== "production") return false;
  return PRODUCTION_STAFF_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function proxy(request: NextRequest) {
  if (isProductionStaffPath(request.nextUrl.pathname)) {
    return new NextResponse(null, {
      status: 404,
      headers: { "Cache-Control": "private, no-store" },
    });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/gym/:path*", "/trainer/:path*", "/staff/:path*"],
};
