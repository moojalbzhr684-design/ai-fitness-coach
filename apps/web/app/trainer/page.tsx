import Link from "next/link";
import { getTrainerOverview } from "@core/services/dashboard/trainer";
import { getTrainerPageContext, GymSelection, TrainerFrame } from "@/lib/page-context";
import { firstParam, type PageSearchParams } from "@/lib/search-params";
import { EmptyState, MetricCard, PageHeader, Panel, formatDate } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function TrainerOverviewPage({ searchParams }: { searchParams: PageSearchParams }) {
  const params = await searchParams;
  const context = await getTrainerPageContext(firstParam(params.gymId));
  if (context.selectionRequired) return <GymSelection title="Choose trainer gym" rolePath="/trainer" memberships={context.memberships} />;
  const membership = context.membership!;
  const data = await getTrainerOverview(context.actorUserId, membership.gymId);
  return <TrainerFrame actor={context.actor} membership={membership}><PageHeader eyebrow="Coaching desk" title="Trainer overview" description="Assigned members, pending decisions and non-diagnostic attention signals." />
    <div className="metric-grid"><MetricCard label="Assigned members" value={data.assignedMemberCount} accent /><MetricCard label="Pending approvals" value={data.pendingApprovalCount} /><MetricCard label="Needs review" value={data.needingReviewCount} /><MetricCard label="Recent progress" value={data.memberProgress.filter((item) => item.latestDecision).length} /></div>
    <Panel title="Member progress" action={<Link className="text-link" href={`/trainer/members?gymId=${membership.gymId}`}>Full roster</Link>}><div className="panel-body stack">{data.memberProgress.length ? data.memberProgress.map((member) => <Link className="detail-item" href={`/trainer/members/${member.userId}?gymId=${membership.gymId}`} key={member.userId}><span>{formatDate(member.lastCheckInAt)} · {member.goal?.replaceAll("_", " ") ?? "No goal"}</span><strong>{member.name} {member.weightKg ? `· ${member.weightKg} kg` : ""}</strong><div className="cell-subtitle">{member.latestDecision ?? "No recent decision."}</div>{member.signals.length ? <div className="signal-list section-gap">{member.signals.map((signal) => <div className={`signal ${signal.severity.toLowerCase()}`} key={signal.type}>{signal.message}</div>)}</div> : null}</Link>) : <EmptyState>No members are assigned in this gym.</EmptyState>}</div></Panel>
  </TrainerFrame>;
}
