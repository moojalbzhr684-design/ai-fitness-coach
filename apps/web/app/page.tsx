import Link from "next/link";
import { redirect } from "next/navigation";
import { getDashboardDestinations } from "@core/auth/dashboard-auth";
import { getSessionActorUserId } from "@/lib/auth";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function DashboardEntryPage() {
  const actorUserId = await getSessionActorUserId();
  if (!actorUserId) redirect("/login");
  const { actor, destinations } = await getDashboardDestinations(actorUserId);
  return <main className="content"><PageHeader eyebrow="Staff workspace" title={`Welcome${actor.firstName ? `, ${actor.firstName}` : ""}`} description="Choose an authorized role and gym. No tenant is selected implicitly when more than one context is available." />{destinations.length ? <div className="metric-grid">{destinations.map((destination) => <Link className="metric-card" href={destination.href} key={`${destination.kind}-${destination.href}`}><div className="metric-label">{destination.kind}</div><div className="metric-value" style={{ fontSize: 22 }}>{destination.label}</div><div className="metric-hint">Open authorized dashboard</div></Link>)}</div> : <div className="panel"><div className="empty">This account has no staff dashboard role. Member accounts are intentionally denied.</div></div>}</main>;
}
