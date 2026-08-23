import { notFound } from "next/navigation";
import { DashboardAuthorizationError } from "@core/auth/dashboard-auth";
import { getTrainerMemberDetail } from "@core/services/dashboard/trainer";
import { getTrainerPageContext, GymSelection, TrainerFrame } from "@/lib/page-context";
import { firstParam, type PageSearchParams } from "@/lib/search-params";
import { MemberDetailView } from "@/components/member-detail";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function TrainerMemberDetailPage({ params, searchParams }: { params: Promise<{ userId: string }>; searchParams: PageSearchParams }) {
  const [{ userId }, query] = await Promise.all([params, searchParams]);
  const context = await getTrainerPageContext(firstParam(query.gymId));
  if (context.selectionRequired) return <GymSelection title="Choose trainer gym" rolePath="/trainer" memberships={context.memberships} />;
  const membership = context.membership!;
  let member;
  try { member = await getTrainerMemberDetail(context.actorUserId, membership.gymId, userId); }
  catch (error) { if (error instanceof DashboardAuthorizationError) notFound(); throw error; }
  return <TrainerFrame actor={context.actor} membership={membership}><PageHeader eyebrow="Assigned coaching" title={member.firstName ?? member.telegramUsername ?? "Member"} description="Only assignment-scoped coaching data is shown. Photos require explicit trainer consent and visibility." /><MemberDetailView member={member} /></TrainerFrame>;
}
