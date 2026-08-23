import { getAdminGyms, getAdminMedia } from "@core/services/dashboard/admin";
import { AdminFrame, getAdminPageContext } from "@/lib/page-context";
import { dashboardFilters, firstParam, type PageSearchParams } from "@/lib/search-params";
import { EmptyState, PageHeader, Pagination, formatDateTime } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AdminMediaPage({ searchParams }: { searchParams: PageSearchParams }) {
  const params = await searchParams;
  const { actorUserId, actor } = await getAdminPageContext();
  const filters = { gymId: firstParam(params.gymId), type: firstParam(params.type), purpose: firstParam(params.purpose), dateFrom: firstParam(params.dateFrom), dateTo: firstParam(params.dateTo) };
  const [result, gyms] = await Promise.all([getAdminMedia(actorUserId, { ...dashboardFilters(params), ...filters }), getAdminGyms(actorUserId, { page: 1, pageSize: 50 })]);
  return <AdminFrame actor={actor}><PageHeader eyebrow="Private storage" title="Media metadata" description="References stay private; this collection never bulk-renders photo content." />
    <form className="filters"><div className="field compact"><label htmlFor="gymId">Gym</label><select id="gymId" name="gymId" defaultValue={filters.gymId ?? ""}><option value="">All gyms</option>{gyms.items.map((gym) => <option key={gym.id} value={gym.id}>{gym.name}</option>)}</select></div><div className="field compact"><label htmlFor="type">Type</label><select id="type" name="type" defaultValue={filters.type ?? ""}><option value="">All</option><option>PHOTO</option><option>DOCUMENT</option></select></div><div className="field"><label htmlFor="purpose">Purpose</label><select id="purpose" name="purpose" defaultValue={filters.purpose ?? ""}><option value="">All purposes</option><option>PROGRESS_FRONT</option><option>PROGRESS_SIDE</option><option>PROGRESS_BACK</option><option>MEAL</option><option>OTHER</option></select></div><div className="field compact"><label htmlFor="dateFrom">From</label><input id="dateFrom" name="dateFrom" type="date" defaultValue={filters.dateFrom} /></div><div className="field compact"><label htmlFor="dateTo">To</label><input id="dateTo" name="dateTo" type="date" defaultValue={filters.dateTo} /></div><button className="button" type="submit">Filter</button></form>
    <div className="panel table-wrap">{result.items.length ? <table><thead><tr><th>Type</th><th>Purpose</th><th>User</th><th>Gym</th><th>Size</th><th>Created</th></tr></thead><tbody>{result.items.map((media) => <tr key={media.id}><td>{media.type}</td><td>{media.purpose}</td><td>{media.user.firstName ?? media.user.telegramUsername ?? "—"}</td><td>{media.gym?.name ?? "—"}</td><td>{media.sizeBytes ? `${(Number(media.sizeBytes) / 1024 / 1024).toFixed(2)} MB` : "—"}</td><td>{formatDateTime(media.createdAt)}</td></tr>)}</tbody></table> : <EmptyState>No media records match.</EmptyState>}</div><Pagination page={result.page} pageCount={result.pageCount} total={result.total} href="/admin/media" params={filters} />
  </AdminFrame>;
}
