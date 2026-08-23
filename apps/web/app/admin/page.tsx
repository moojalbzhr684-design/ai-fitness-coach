import Link from "next/link";
import { getAdminOverview } from "@core/services/dashboard/admin";
import { AdminFrame, getAdminPageContext } from "@/lib/page-context";
import { MetricCard, PageHeader, Panel } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AdminOverviewPage() {
  const { actorUserId, actor } = await getAdminPageContext();
  const metrics = await getAdminOverview(actorUserId);

  return (
    <AdminFrame actor={actor}>
      <PageHeader
        eyebrow="System overview"
        title="Platform control room"
        description="Live operational totals across every tenant, with the highest-risk queues kept visible."
      />
      <div className="metric-grid">
        <MetricCard label="Total gyms" value={metrics.totalGyms} hint={`${metrics.activeGyms} active`} accent />
        <MetricCard label="Total users" value={metrics.totalUsers} hint={`${metrics.activeMemberships} active memberships`} />
        <MetricCard label="Trainers" value={metrics.totalTrainers} />
        <MetricCard label="Members" value={metrics.totalMembers} />
        <MetricCard label="Pending approvals" value={metrics.pendingApprovals} hint="Requires staff review" />
        <MetricCard label="AI requests today" value={metrics.aiRequestsToday} hint={`${metrics.aiErrorsToday} errors`} />
        <MetricCard label="Progress photo sets" value={metrics.photoSets} />
        <MetricCard label="Media records" value={metrics.mediaRecords} hint="Metadata only" />
      </div>
      <div className="split-grid">
        <Panel title="Operational queues">
          <div className="action-list">
            <Link href="/admin/approvals"><span>Approval review</span><strong>{metrics.pendingApprovals}</strong></Link>
            <Link href="/admin/ai"><span>AI errors today</span><strong>{metrics.aiErrorsToday}</strong></Link>
            <Link href="/admin/audit"><span>Privileged activity</span><strong>Audit log</strong></Link>
          </div>
        </Panel>
        <Panel title="Tenant administration">
          <div className="action-list">
            <Link href="/admin/gyms"><span>Gym settings and status</span><strong>Open</strong></Link>
            <Link href="/admin/users"><span>User and membership lookup</span><strong>Search</strong></Link>
            <Link href="/admin/media"><span>Private media metadata</span><strong>Inspect</strong></Link>
          </div>
        </Panel>
      </div>
    </AdminFrame>
  );
}
