import { isIP } from "node:net";

export function trustedIncomingIp(headers: Pick<Headers, "get">): string | null {
  const realIp = headers.get("x-real-ip")?.trim();
  if (realIp && isIP(realIp)) return realIp;
  const forwarded = headers
    .get("x-forwarded-for")
    ?.split(",")
    .map((value) => value.trim())
    .filter((value) => isIP(value));
  return forwarded?.at(-1) ?? null;
}
