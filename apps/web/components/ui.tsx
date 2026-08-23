import Link from "next/link";

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description: string; actions?: React.ReactNode }) {
  return <header className="page-header"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="lede">{description}</p></div>{actions ? <div className="header-actions">{actions}</div> : null}</header>;
}

export function MetricCard({ label, value, hint, accent = false }: { label: string; value: React.ReactNode; hint?: string; accent?: boolean }) {
  return <article className={`metric-card${accent ? " accent" : ""}`}><div className="metric-label">{label}</div><div className="metric-value">{value}</div>{hint ? <div className="metric-hint">{hint}</div> : null}</article>;
}

export function Panel({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return <section className="panel"><div className="panel-header"><h2>{title}</h2>{action}</div>{children}</section>;
}

export function EmptyState({ children }: { children: React.ReactNode }) { return <div className="empty">{children}</div>; }

export function StatusBadge({ value }: { value: string }) {
  const normalized = value.toUpperCase();
  const tone = ["ACTIVE", "SUCCESS", "APPROVED", "COMPLETE", "COMPLETED"].includes(normalized) ? "success"
    : ["ERROR", "FAILED", "REJECTED", "EXPIRED"].includes(normalized) ? "error"
      : ["PENDING", "WARNING", "DRAFT"].includes(normalized) ? "warning" : "info";
  return <span className={`badge ${tone}`}>{value.replaceAll("_", " ")}</span>;
}

export function MessageBanner({ notice, error }: { notice?: string; error?: string }) {
  return <>{notice ? <div className="banner notice">{notice}</div> : null}{error ? <div className="banner error">{error}</div> : null}</>;
}

export function Pagination({ page, pageCount, total, href, params = {} }: { page: number; pageCount: number; total: number; href: string; params?: Record<string, string | undefined> }) {
  const link = (target: number) => {
    const search = new URLSearchParams(Object.entries(params).filter((entry): entry is [string, string] => Boolean(entry[1])));
    search.set("page", String(target));
    return `${href}?${search.toString()}`;
  };
  return <div className="pagination"><span>{total} records · Page {page} of {pageCount}</span><div className="pagination-links">{page > 1 ? <Link className="button secondary small" href={link(page - 1)}>Previous</Link> : null}{page < pageCount ? <Link className="button secondary small" href={link(page + 1)}>Next</Link> : null}</div></div>;
}

export function formatDate(value: Date | null | undefined) { return value ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(value) : "—"; }
export function formatDateTime(value: Date | null | undefined) { return value ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(value) : "—"; }
