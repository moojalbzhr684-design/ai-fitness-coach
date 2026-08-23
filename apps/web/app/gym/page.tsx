import Link from "next/link";
import { getGymOverview } from "@core/services/dashboard/gym";
import { getOwnerPageContext, GymSelection, OwnerFrame } from "@/lib/page-context";
import { firstParam, type PageSearchParams } from "@/lib/search-params";
import { EmptyState, MetricCard, PageHeader, Panel } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function GymOverviewPage({ searchParams }: { searchParams: PageSearchParams }) {
  const params = await searchParams;
  const context = await getOwnerPageContext(firstParam(params.gymId));
  if (context.selectionRequired) return <GymSelection title="Choose owner gym" rolePath="/gym" memberships={context.memberships} />;
  const membership = context.membership!;
  const data = await getGymOverview(context.actorUserId, membership.gymId);
  return <OwnerFrame actor={context.actor} membership={membership}><PageHeader eyebrow="Gym operations" title="Owner overview" description="Tenant-scoped coaching operations, review queues and member attention signals." />
    <div className="metric-grid"><MetricCard label="Members" value={data.members} accent /><MetricCard label="Trainers" value={data.trainers} /><MetricCard label="Pending approvals" value={data.pendingApprovals} /><MetricCard label="Recent check-ins" value={data.recentCheckIns} hint="Last 10 days" /></div>
    <div className="panel-grid"><Panel title="Members needing attention" action={<Link className="text-link" href={`/gym/members?gymId=${membership.gymId}`}>All members</Link>}><div className="panel-body stack">{data.attention.length ? data.attention.map((item) => <Link className="detail-item" href={`/gym/members/${item.userId}?gymId=${membership.gymId}`} key={item.userId}><span>{item.signals.length} signal{item.signals.length === 1 ? "" : "s"}</span><strong>{item.name}</strong><div className="signal-list section-gap">{item.signals.map((signal) => <div className={`signal ${signal.severity.toLowerCase()}`} key={signal.type}>{signal.message}</div>)}</div></Link>) : <EmptyState>No current attention signals.</EmptyState>}</div></Panel>
      <div><Panel title="Review queue"><div className="panel-body"><p className="muted-copy">Nutrition and workout changes remain behind the shared approval service.</p><Link className="button section-gap" href={`/gym/approvals?gymId=${membership.gymId}`}>Review {data.pendingApprovals}</Link></div></Panel><Panel title="AI activity"><div className="panel-body stack">{data.recentAI.length ? data.recentAI.map((row) => <div className="detail-item" key={row.status}><span>{row.status}</span><strong>{row._count._all} events</strong></div>) : <EmptyState>No AI events in the last 10 days.</EmptyState>}</div></Panel></div>
    </div>
  </OwnerFrame>;
}
