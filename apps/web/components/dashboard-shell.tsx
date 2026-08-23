import Link from "next/link";
import { logoutAction } from "@/app/actions";

export interface DashboardNavItem { href: string; label: string }

function safeColor(value: string | null | undefined, fallback: string): string {
  return value && /^#[0-9A-F]{6}$/i.test(value) ? value : fallback;
}

export function DashboardShell({
  children,
  title,
  subtitle,
  actorLabel,
  nav,
  neutral = false,
  primaryColor,
  secondaryColor,
}: {
  children: React.ReactNode;
  title: string;
  subtitle: string;
  actorLabel: string;
  nav: DashboardNavItem[];
  neutral?: boolean;
  primaryColor?: string | null;
  secondaryColor?: string | null;
}) {
  const style = neutral ? undefined : {
    "--gym-primary": safeColor(primaryColor, "#176b68"),
    "--gym-secondary": safeColor(secondaryColor, "#e4a24c"),
    "--accent": safeColor(secondaryColor, "#e66b38"),
  } as React.CSSProperties;
  const navigation = <nav className="nav-list" aria-label="Dashboard navigation">
    {nav.map((item) => <Link className="nav-link" href={item.href} key={item.href}>{item.label}</Link>)}
  </nav>;
  return <div className="dashboard-shell" style={style}>
    <aside className="sidebar">
      <div className="brand-mark"><div className="brand-badge">AF</div><div className="brand-copy"><strong>{title}</strong><span>{subtitle}</span></div></div>
      {navigation}
      <div className="sidebar-foot"><div className="actor-label">Signed in as<br />{actorLabel}</div><form action={logoutAction}><button className="link-button" type="submit">Sign out</button></form></div>
    </aside>
    <header className="mobile-header"><div className="brand-copy"><strong>{title}</strong><span>{subtitle}</span></div><details><summary>Menu</summary><div className="mobile-menu">{navigation}<form action={logoutAction}><button className="link-button" type="submit">Sign out</button></form></div></details></header>
    <main className="main-column"><div className="content">{children}</div></main>
  </div>;
}
