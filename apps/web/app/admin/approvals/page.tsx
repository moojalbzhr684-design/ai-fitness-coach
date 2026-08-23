import { getAdminApprovals } from "@core/services/dashboard/admin";
import { AdminFrame, getAdminPageContext } from "@/lib/page-context";
import { dashboardFilters, firstParam, type PageSearchParams } from "@/lib/search-params";
import { ApprovalList } from "@/components/approval-list";
import { MessageBanner, PageHeader, Pagination } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AdminApprovalsPage({ searchParams }: { searchParams: PageSearchParams }) {
  const params = await searchParams;
  const { actorUserId, actor } = await getAdminPageContext();
  const result = await getAdminApprovals(actorUserId, dashboardFilters(params));
  return <AdminFrame actor={actor}><PageHeader eyebrow="Global review" title="Approvals" description="Approve and reject through the existing safety-revalidation service." /><MessageBanner notice={firstParam(params.notice)} error={firstParam(params.error)} /><form className="filters"><div className="field"><label htmlFor="search">Member or reference</label><input id="search" name="search" maxLength={80} defaultValue={firstParam(params.search)} /></div><button className="button" type="submit">Search</button></form><ApprovalList approvals={result.items} returnTo="/admin/approvals" /><Pagination page={result.page} pageCount={result.pageCount} total={result.total} href="/admin/approvals" params={{ search: firstParam(params.search) }} /></AdminFrame>;
}
