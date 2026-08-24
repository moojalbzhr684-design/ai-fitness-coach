import { createHmac } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const requestHeaders = ["accept", "content-type", "x-csrf-token", "x-gym-id", "user-agent"];
const responseHeaders = ["content-type", "cache-control", "retry-after"];

function backendOrigin(): string {
  const raw = process.env.BACKEND_API_URL;
  if (!raw) throw new Error("BACKEND_API_URL is not configured");
  const url = new URL(raw);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("BACKEND_API_URL must use HTTP or HTTPS");
  return url.origin;
}

function memberCookies(raw: string | null): string | null {
  if (!raw) return null;
  const allowed = new Set(["afc_member_session", "afc_member_csrf"]);
  const cookies = raw.split(";").map((value) => value.trim()).filter((value) => {
    const name = value.slice(0, value.indexOf("="));
    return allowed.has(name);
  });
  return cookies.length ? cookies.join("; ") : null;
}

function trustedIncomingIp(request: NextRequest): string | null {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",").map((value) => value.trim()).filter(Boolean);
  return forwarded?.at(-1) ?? request.headers.get("x-real-ip")?.trim() ?? null;
}

async function proxy(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  try {
    const { path } = await context.params;
    const url = new URL(`/api/v1/${path.map(encodeURIComponent).join("/")}${request.nextUrl.search}`, backendOrigin());
    const headers = new Headers();
    for (const name of requestHeaders) {
      const value = request.headers.get(name);
      if (value) headers.set(name, value);
    }
    const cookie = memberCookies(request.headers.get("cookie"));
    if (cookie) headers.set("cookie", cookie);
    const proxySecret = process.env.MEMBER_PROXY_SECRET;
    const clientIp = trustedIncomingIp(request);
    if (proxySecret && proxySecret.length >= 32 && clientIp) {
      headers.set("x-afc-proxy-ip", clientIp);
      headers.set("x-afc-proxy-signature", createHmac("sha256", proxySecret).update(clientIp).digest("hex"));
    }
    const hasBody = !["GET", "HEAD"].includes(request.method);
    const upstream = await fetch(url, {
      method: request.method,
      headers,
      body: hasBody ? await request.arrayBuffer() : undefined,
      cache: "no-store",
      redirect: "manual",
    });
    const response = new NextResponse(upstream.status === 204 ? null : await upstream.arrayBuffer(), {
      status: upstream.status,
    });
    for (const name of responseHeaders) {
      const value = upstream.headers.get(name);
      if (value) response.headers.set(name, value);
    }
    for (const cookie of upstream.headers.getSetCookie()) response.headers.append("Set-Cookie", cookie);
    return response;
  } catch {
    return NextResponse.json(
      { error: { code: "BACKEND_UNAVAILABLE", message: "الخدمة غير متوفرة هسه. حاول مرة ثانية." } },
      { status: 502 },
    );
  }
}

export const GET = proxy;
export const POST = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const OPTIONS = proxy;
