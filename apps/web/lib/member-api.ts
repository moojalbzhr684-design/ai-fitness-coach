export class MemberApiError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
    this.name = "MemberApiError";
  }
}

export const memberApiBaseUrl = process.env.NEXT_PUBLIC_MEMBER_API_URL ?? "http://localhost:3000";

function storedCsrfToken(): string | undefined {
  if (typeof document === "undefined") return undefined;
  const stored = window.sessionStorage.getItem("afc_member_csrf");
  if (stored) return stored;
  const item = document.cookie.split(";").map((value) => value.trim()).find((value) => value.startsWith("afc_member_csrf="));
  return item ? decodeURIComponent(item.slice("afc_member_csrf=".length)) : undefined;
}

export function rememberMemberCsrfToken(value: string): void {
  if (typeof window !== "undefined") window.sessionStorage.setItem("afc_member_csrf", value);
}

async function csrfToken(): Promise<string | undefined> {
  const stored = storedCsrfToken();
  if (stored) return stored;
  if (typeof window === "undefined") return undefined;
  const response = await fetch(`${memberApiBaseUrl}/api/v1/auth/csrf`, { credentials: "include", cache: "no-store" });
  if (!response.ok) return undefined;
  const payload = await response.json() as { data?: { csrfToken?: string } };
  if (payload.data?.csrfToken) rememberMemberCsrfToken(payload.data.csrfToken);
  return payload.data?.csrfToken;
}

export async function memberApi<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? "GET").toUpperCase();
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (typeof window !== "undefined") {
    const gymRef = window.sessionStorage.getItem("afc_member_gym");
    if (gymRef) headers.set("X-Gym-Id", gymRef);
  }
  if (init.body !== undefined) headers.set("Content-Type", "application/json");
  const csrfExempt = path === "/api/v1/auth/otp/request" || path === "/api/v1/auth/otp/verify";
  if (!["GET", "HEAD", "OPTIONS"].includes(method) && !csrfExempt) {
    const csrf = await csrfToken();
    if (csrf) headers.set("X-CSRF-Token", csrf);
  }
  const response = await fetch(`${memberApiBaseUrl}${path}`, {
    ...init,
    headers,
    credentials: "include",
    cache: "no-store",
  });
  const payload = await response.json().catch(() => null) as { data?: T; error?: { code?: string; message?: string } } | null;
  if (!response.ok) {
    throw new MemberApiError(response.status, payload?.error?.code ?? "REQUEST_FAILED", payload?.error?.message ?? "Request failed");
  }
  return payload?.data as T;
}

export function redirectForMemberAuth(error: unknown): boolean {
  if (error instanceof MemberApiError && error.status === 401 && typeof window !== "undefined") {
    window.location.assign("/app/login");
    return true;
  }
  return false;
}
