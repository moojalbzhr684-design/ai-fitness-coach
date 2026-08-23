import { getAdminAudit, getAdminGyms } from "@core/services/dashboard/admin";
import { AdminFrame, getAdminPageContext } from "@/lib/page-context";
import { dashboardFilters, firstParam, type PageSearchParams } from "@/lib/search-params";
import { EmptyState, PageHeader, Pagination, formatDateTime } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AdminAuditPage({ searchParams }: { searchParams: PageSearchParams }) {
  const params = await searchParams;
  const { actorUserId, actor } = await getAdminPageContext();
  const filters = { gymId: firstParam(params.gymId), action: firstParam(params.action) };
  const [result, gyms] = await Promise.all([getAdminAudit(actorUserId, { ...dashboardFilters(params), ...filters }), getAdminGyms(actorUserId, { page: 1, pageSize: 50 })]);
  return <AdminFrame actor={actor}><PageHeader eyebrow="Accountability" title="Audit log" description="Privileged actions with concise, safe metadata and clear tenant scope." /><form className="filters"><div className="field compact"><label htmlFor="gymId">Gym</label><select id="gymId" name="gymId" defaultValue={filters.gymId ?? ""}><option value="">All gyms</option>{gyms.items.map((gym) => <option value={gym.id} key={gym.id}>{gym.name}</option>)}</select></div><div className="field"><label htmlFor="action">Action</label><input id="action" name="action" maxLength={100} defaultValue={filters.action} /></div><button className="button" type="submit">Filter</button></form>
    <div className="panel table-wrap">{result.items.length ? <table><thead><tr><th>Time</th><th>Actor</th><th>Gym</th><th>Action</th><th>Target</th><th>Safe metadata</th></tr></thead><tbody>{result.items.map((entry) => <tr key={entry.id}><td>{formatDateTime(entry.createdAt)}</td><td>{entry.actorUser?.firstName ?? entry.actorUser?.telegramUsername ?? "System"}</td><td>{entry.gym?.name ?? "Platform"}</td><td>{entry.action}</td><td>{entry.targetType ?? "—"}<span className="cell-subtitle">{entry.targetId ?? ""}</span></td><td><details><summary>Expand</summary><pre className="metadata">{JSON.stringify(entry.metadata, null, 2)}</pre></details></td></tr>)}</tbody></table> : <EmptyState>No audit entries match.</EmptyState>}</div><Pagination page={result.page} pageCount={result.pageCount} total={result.total} href="/admin/audit" params={filters} />
  </AdminFrame>;
}
