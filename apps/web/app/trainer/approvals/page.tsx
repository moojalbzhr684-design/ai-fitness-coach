import { getTrainerApprovals } from "@core/services/dashboard/trainer";
import { getTrainerPageContext, GymSelection, TrainerFrame } from "@/lib/page-context";
import { dashboardFilters, firstParam, type PageSearchParams } from "@/lib/search-params";
import { ApprovalList } from "@/components/approval-list";
import { MessageBanner, PageHeader, Pagination } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function TrainerApprovalsPage({ searchParams }: { searchParams: PageSearchParams }) {
  const params = await searchParams;
  const context = await getTrainerPageContext(firstParam(params.gymId));
  if (context.selectionRequired) return <GymSelection title="Choose trainer gym" rolePath="/trainer" memberships={context.memberships} />;
  const membership = context.membership!;
  const result = await getTrainerApprovals(context.actorUserId, membership.gymId, dashboardFilters(params));
  const returnTo = `/trainer/approvals?gymId=${membership.gymId}`;
  return <TrainerFrame actor={context.actor} membership={membership}><PageHeader eyebrow="Assigned reviews" title="Approvals" description="Only pending requests assigned to this trainer are returned." /><MessageBanner notice={firstParam(params.notice)} error={firstParam(params.error)} /><ApprovalList approvals={result.items} returnTo={returnTo} /><Pagination page={result.page} pageCount={result.pageCount} total={result.total} href="/trainer/approvals" params={{ gymId: membership.gymId, search: firstParam(params.search) }} /></TrainerFrame>;
}
