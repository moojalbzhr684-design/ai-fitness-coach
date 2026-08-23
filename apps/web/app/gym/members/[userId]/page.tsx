import { notFound } from "next/navigation";
import { getGymMemberDetail } from "@core/services/dashboard/gym";
import { DashboardAuthorizationError } from "@core/auth/dashboard-auth";
import { getOwnerPageContext, GymSelection, OwnerFrame } from "@/lib/page-context";
import { firstParam, type PageSearchParams } from "@/lib/search-params";
import { MemberDetailView } from "@/components/member-detail";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function GymMemberDetailPage({ params, searchParams }: { params: Promise<{ userId: string }>; searchParams: PageSearchParams }) {
  const [{ userId }, query] = await Promise.all([params, searchParams]);
  const context = await getOwnerPageContext(firstParam(query.gymId));
  if (context.selectionRequired) return <GymSelection title="Choose owner gym" rolePath="/gym" memberships={context.memberships} />;
  const membership = context.membership!;
  let member;
  try { member = await getGymMemberDetail(context.actorUserId, membership.gymId, userId); }
  catch (error) { if (error instanceof DashboardAuthorizationError) notFound(); throw error; }
  return <OwnerFrame actor={context.actor} membership={membership}><PageHeader eyebrow="Member coaching" title={member.firstName ?? member.telegramUsername ?? "Member"} description="Coaching-relevant information only. Photo metadata follows gym consent and visibility rules." /><MemberDetailView member={member} /></OwnerFrame>;
}
