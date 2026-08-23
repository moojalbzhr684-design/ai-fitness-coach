import { getGymApprovals } from "@core/services/dashboard/gym";
import { getOwnerPageContext, GymSelection, OwnerFrame } from "@/lib/page-context";
import { dashboardFilters, firstParam, type PageSearchParams } from "@/lib/search-params";
import { ApprovalList } from "@/components/approval-list";
import { MessageBanner, PageHeader, Pagination } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function GymApprovalsPage({ searchParams }: { searchParams: PageSearchParams }) {
  const params = await searchParams;
  const context = await getOwnerPageContext(firstParam(params.gymId));
  if (context.selectionRequired) return <GymSelection title="Choose owner gym" rolePath="/gym" memberships={context.memberships} />;
  const membership = context.membership!;
  const result = await getGymApprovals(context.actorUserId, membership.gymId, dashboardFilters(params));
  const returnTo = `/gym/approvals?gymId=${membership.gymId}`;
  return <OwnerFrame actor={context.actor} membership={membership}><PageHeader eyebrow="Tenant review" title="Approvals" description="All requests are gym-scoped and reauthorized when reviewed." /><MessageBanner notice={firstParam(params.notice)} error={firstParam(params.error)} /><ApprovalList approvals={result.items} returnTo={returnTo} /><Pagination page={result.page} pageCount={result.pageCount} total={result.total} href="/gym/approvals" params={{ gymId: membership.gymId, search: firstParam(params.search) }} /></OwnerFrame>;
}
