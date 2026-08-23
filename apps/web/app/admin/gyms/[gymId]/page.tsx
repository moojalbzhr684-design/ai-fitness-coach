import { notFound } from "next/navigation";
import { getAdminGymDetail } from "@core/services/dashboard/admin";
import { AdminFrame, getAdminPageContext } from "@/lib/page-context";
import { GymSettingsEditor } from "@/components/settings-form";
import { EmptyState, MetricCard, PageHeader, Panel, StatusBadge, formatDateTime } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AdminGymDetailPage({ params }: { params: Promise<{ gymId: string }> }) {
  const { gymId } = await params;
  const { actorUserId, actor } = await getAdminPageContext();
  const gym = await getAdminGymDetail(actorUserId, gymId);
  if (!gym) notFound();
  return <AdminFrame actor={actor}><PageHeader eyebrow="Tenant detail" title={gym.settings?.displayName ?? gym.name} description="Branding changes use the same authorization and audit service as every other interface." />
    <div className="metric-grid"><MetricCard label="Members" value={gym.memberCount} /><MetricCard label="Trainers" value={gym.trainerCount} /><MetricCard label="Pending approvals" value={gym.pendingApprovals} /><MetricCard label="Equipment rules" value={gym.exerciseAvailability.length} /></div>
    <GymSettingsEditor gymId={gym.id} gymName={gym.name} settings={gym.settings} returnTo={`/admin/gyms/${gym.id}`} />
    <div className="split-grid section-gap"><Panel title="Owners"><div className="panel-body stack">{gym.memberships.length ? gym.memberships.map((membership) => <div className="detail-item" key={membership.id}><strong>{membership.user.firstName ?? membership.user.telegramUsername ?? "Owner"}</strong></div>) : <EmptyState>No active owner.</EmptyState>}</div></Panel>
      <Panel title="Equipment availability"><div className="panel-body stack">{gym.exerciseAvailability.length ? gym.exerciseAvailability.map((item) => <div className="detail-item" key={item.id}><span>{item.isAvailable ? "Available" : "Unavailable"}</span><strong>{item.exercise.name}</strong></div>) : <EmptyState>Global exercise defaults apply.</EmptyState>}</div></Panel></div>
    <div className="split-grid section-gap"><Panel title="Recent AI activity"><div className="panel-body stack">{gym.aiEvents.length ? gym.aiEvents.map((event) => <div className="detail-item" key={event.id}><span>{formatDateTime(event.createdAt)}</span><strong>{event.eventType} · <StatusBadge value={event.status} /></strong></div>) : <EmptyState>No recent AI events.</EmptyState>}</div></Panel>
      <Panel title="Recent progress"><div className="panel-body stack">{gym.progressEvaluations.length ? gym.progressEvaluations.map((item) => <div className="detail-item" key={item.id}><span>{formatDateTime(item.createdAt)}</span><strong>{item.action}</strong><div className="cell-subtitle">{item.summary}</div></div>) : <EmptyState>No recent progress evaluations.</EmptyState>}</div></Panel></div>
  </AdminFrame>;
}
