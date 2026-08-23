import { notFound } from "next/navigation";
import { getAdminUserDetail, userDisplayName } from "@core/services/dashboard/admin";
import { AdminFrame, getAdminPageContext } from "@/lib/page-context";
import { MemberDetailView } from "@/components/member-detail";
import { EmptyState, PageHeader, Panel, StatusBadge, formatDateTime } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AdminUserDetailPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const { actorUserId, actor } = await getAdminPageContext();
  const user = await getAdminUserDetail(actorUserId, userId);
  if (!user) notFound();
  return <AdminFrame actor={actor}><PageHeader eyebrow="User detail" title={userDisplayName(user)} description="Coaching context, plan history and concise AI activity. Private images require an explicit audited action." /><nav className="tabs" aria-label="User detail sections"><a className="tab" href="#overview">Overview</a><a className="tab" href="#progress">Progress</a><a className="tab" href="#workout">Workout</a><a className="tab" href="#nutrition">Nutrition</a><a className="tab" href="#photos">Photos</a><a className="tab" href="#ai">AI activity</a><a className="tab" href="#decisions">Decisions</a><a className="tab" href="#audit">Audit</a></nav><div id="overview"><MemberDetailView member={user} /></div>
    <div className="split-grid section-gap">
      <Panel title="Nutrition plan history"><div className="panel-body stack">{user.nutritionPlans.length ? user.nutritionPlans.map((plan) => <div className="detail-item" key={plan.id}><span>{formatDateTime(plan.startedAt)}</span><strong>{plan.name} · <StatusBadge value={plan.status} /></strong><div className="cell-subtitle">{plan.dailyCalories} kcal · {plan.dailyProteinGrams}g protein · Weekly cost {plan.estimatedWeeklyCostIqd ? `${plan.estimatedWeeklyCostIqd.toLocaleString()} IQD` : "unknown"}</div></div>) : <EmptyState>No nutrition plan history.</EmptyState>}</div></Panel>
      <Panel title="Recent completed sessions"><div className="panel-body stack">{user.workoutSessions.length ? user.workoutSessions.map((session) => <div className="detail-item" key={session.id}><span>{formatDateTime(session.completedAt)}</span><strong>{session.workoutDay?.name ?? "Workout session"}</strong><div className="cell-subtitle">{session.exerciseLogs.length} logged exercises · {session.durationMinutes ? `${session.durationMinutes} min` : "Duration unavailable"}</div></div>) : <EmptyState>No completed sessions.</EmptyState>}</div></Panel>
    </div>
    <div className="split-grid section-gap">
      <Panel title="AI activity"><div id="ai" className="panel-body stack">{user.aiEvents.length ? user.aiEvents.map((event) => <div className="detail-item" key={event.id}><span>{formatDateTime(event.createdAt)}</span><strong>{event.eventType} · <StatusBadge value={event.status} /></strong><div className="cell-subtitle">{event.outputSummary ?? event.errorMessage ?? "No stored summary."}</div></div>) : <EmptyState>No AI events.</EmptyState>}</div></Panel>
      <Panel title="Audit"><div id="audit" className="panel-body stack">{user.auditLogs.length ? user.auditLogs.map((entry) => <div className="detail-item" key={entry.id}><span>{formatDateTime(entry.createdAt)}</span><strong>{entry.action}</strong><div className="cell-subtitle">{entry.targetType ?? "—"} {entry.targetId ?? ""}</div></div>) : <EmptyState>No audit activity.</EmptyState>}</div></Panel>
    </div>
  </AdminFrame>;
}
