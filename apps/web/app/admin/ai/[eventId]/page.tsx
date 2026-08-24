import { notFound } from "next/navigation";
import { getAdminAIEventDetail } from "@core/services/dashboard/admin";
import { AdminFrame, getAdminPageContext } from "@/lib/page-context";
import { PageHeader, Panel, StatusBadge, formatDateTime } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AdminAIEventPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const { actorUserId, actor } = await getAdminPageContext();
  const event = await getAdminAIEventDetail(actorUserId, eventId);
  if (!event) notFound();
  return <AdminFrame actor={actor}><PageHeader eyebrow="AI event" title={event.eventType} description="Sanitized request and tool telemetry only—no hidden reasoning, credentials, or private images." /><Panel title="Event details"><div className="panel-body detail-grid"><div className="detail-item"><span>Status</span><StatusBadge value={event.status} /></div><div className="detail-item"><span>Model</span><strong>{event.model ?? "—"}</strong></div><div className="detail-item"><span>Time</span><strong>{formatDateTime(event.createdAt)}</strong></div><div className="detail-item"><span>Latency</span><strong>{event.latencyMs ? `${event.latencyMs} ms` : "—"}</strong></div><div className="detail-item"><span>User</span><strong>{event.user?.firstName ?? event.user?.telegramUsername ?? "—"}</strong></div><div className="detail-item"><span>Gym</span><strong>{event.gym?.name ?? "Platform"}</strong></div><div className="detail-item"><span>Input summary</span><strong>{event.inputSummary ?? "—"}</strong></div><div className="detail-item"><span>Output summary</span><strong>{event.outputSummary ?? "—"}</strong></div><div className="detail-item"><span>Error</span><strong>{event.errorMessage ?? "—"}</strong></div></div></Panel><Panel title="Tool executions"><div className="panel-body stack">{event.toolExecutions.length ? event.toolExecutions.map((tool) => <div className="detail-item" key={tool.id}><span>{formatDateTime(tool.createdAt)} · {tool.durationMs !== null ? `${tool.durationMs} ms` : "—"}</span><strong>{tool.toolName} · <StatusBadge value={tool.status} /></strong><div className="cell-subtitle">Input: {tool.inputSummary ?? "—"}</div><div className="cell-subtitle">Output: {tool.outputSummary ?? tool.errorMessage ?? "—"}</div></div>) : <div className="detail-item">No tools used.</div>}</div></Panel></AdminFrame>;
}
