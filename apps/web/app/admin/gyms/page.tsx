import Link from "next/link";
import { getAdminGyms } from "@core/services/dashboard/admin";
import { AdminFrame, getAdminPageContext } from "@/lib/page-context";
import { dashboardFilters, firstParam, type PageSearchParams } from "@/lib/search-params";
import { EmptyState, PageHeader, Pagination, StatusBadge, formatDate } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AdminGymsPage({ searchParams }: { searchParams: PageSearchParams }) {
  const params = await searchParams;
  const { actorUserId, actor } = await getAdminPageContext();
  const result = await getAdminGyms(actorUserId, dashboardFilters(params));
  const search = firstParam(params.search);
  return <AdminFrame actor={actor}><PageHeader eyebrow="Tenants" title="Gyms" description="Active tenants, staffing and review queues from one audited view." />
    <form className="filters"><div className="field"><label htmlFor="search">Gym name</label><input id="search" name="search" defaultValue={search} maxLength={80} placeholder="Search gyms" /></div><button className="button" type="submit">Search</button></form>
    <div className="panel table-wrap">{result.items.length ? <table><thead><tr><th>Gym</th><th>Status</th><th>Members</th><th>Trainers</th><th>Approvals</th><th>AI identity</th><th>Created</th></tr></thead><tbody>{result.items.map((gym) => <tr key={gym.id}><td><Link className="text-link" href={`/admin/gyms/${gym.id}`}>{gym.settings?.displayName ?? gym.name}</Link></td><td><StatusBadge value={gym.isActive ? "ACTIVE" : "INACTIVE"} /></td><td>{gym.memberCount}</td><td>{gym.trainerCount}</td><td>{gym.pendingApprovals}</td><td>{gym.aiDisplayName}</td><td>{formatDate(gym.createdAt)}</td></tr>)}</tbody></table> : <EmptyState>No gyms match this search.</EmptyState>}</div>
    <Pagination page={result.page} pageCount={result.pageCount} total={result.total} href="/admin/gyms" params={{ search }} />
  </AdminFrame>;
}
