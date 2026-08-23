import { approveDashboardRequestAction, rejectDashboardRequestAction } from "@/app/actions";
import { ConfirmButton } from "@/components/confirm-button";
import { EmptyState, StatusBadge, formatDate, formatDateTime } from "@/components/ui";

type ApprovalItem = {
  id: string;
  reference: string;
  type: string;
  status: string;
  reason: string;
  requestedChange: unknown;
  currentValue: unknown;
  createdAt: Date;
  expiresAt: Date | null;
  member: { id?: string; firstName: string | null; telegramUsername: string | null };
  gym?: { name: string } | null;
};

function conciseJson(value: unknown) {
  if (value === null || value === undefined) return "—";
  const serialized = JSON.stringify(value);
  return serialized.length > 180 ? `${serialized.slice(0, 177)}…` : serialized;
}

export function ApprovalList({ approvals, returnTo }: { approvals: ApprovalItem[]; returnTo: string }) {
  if (!approvals.length) return <EmptyState>No approvals match this view.</EmptyState>;
  return <div className="stack">{approvals.map((approval) => (
    <article className="approval-card" key={approval.id}>
      <div className="approval-heading">
        <div><strong>{approval.member.firstName ?? approval.member.telegramUsername ?? "Member"}</strong><span>{approval.gym?.name ? `${approval.gym.name} · ` : ""}{approval.reference}</span></div>
        <StatusBadge value={approval.status} />
      </div>
      <div className="detail-grid">
        <div className="detail-item"><span>Type</span><strong>{approval.type.replaceAll("_", " ")}</strong></div>
        <div className="detail-item"><span>Requested</span><strong>{conciseJson(approval.requestedChange)}</strong></div>
        <div className="detail-item"><span>Current</span><strong>{conciseJson(approval.currentValue)}</strong></div>
      </div>
      <p className="muted-copy">{approval.reason}</p>
      <div className="cell-subtitle">Created {formatDateTime(approval.createdAt)} · Expires {formatDate(approval.expiresAt)}</div>
      {approval.status === "PENDING" ? <div className="approval-actions">
        <form action={approveDashboardRequestAction.bind(null, returnTo, approval.id)}>
          <div className="field"><label htmlFor={`approve-${approval.id}`}>Optional review note</label><input id={`approve-${approval.id}`} name="note" maxLength={500} /></div>
          <ConfirmButton message="Approve and safely apply this request?">Approve</ConfirmButton>
        </form>
        <form action={rejectDashboardRequestAction.bind(null, returnTo, approval.id)}>
          <input aria-label="Optional rejection note" name="note" maxLength={500} placeholder="Optional rejection note" />
          <ConfirmButton className="button danger" message="Reject this request without changing the member plan?">Reject</ConfirmButton>
        </form>
      </div> : null}
    </article>
  ))}</div>;
}
