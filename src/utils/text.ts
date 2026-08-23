const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

export function normalizeNumericText(value: string): string {
  return value
    .trim()
    .replace(/[٠-٩]/g, (digit) => String(ARABIC_DIGITS.indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String(PERSIAN_DIGITS.indexOf(digit)))
    .replace(/٫/g, ".")
    .replace(/٬/g, "")
    .replace(/,/g, ".");
}

export function truncateText(value: string, maxLength = 500): string {
  const compact = value.replace(/\s+/g, " ").trim();

  if (compact.length <= maxLength) {
    return compact;
  }

  return `${compact.slice(0, Math.max(0, maxLength - 1))}…`;
}

export function safeErrorMessage(error: unknown, secrets: string[] = []): string {
  const raw = error instanceof Error ? error.message : "Unknown error";
  let safe = raw
    .replace(/data:image\/[A-Za-z0-9.+-]+;base64,[A-Za-z0-9+/=]+/g, "[REDACTED_IMAGE]")
    .replace(/sk-[A-Za-z0-9_-]+/g, "[REDACTED]");

  for (const secret of secrets) {
    if (secret) {
      safe = safe.split(secret).join("[REDACTED]");
    }
  }

  return truncateText(safe, 1_000);
}
