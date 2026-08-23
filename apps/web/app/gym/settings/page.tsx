import { getGymSettingsDashboard } from "@core/services/dashboard/gym";
import { getOwnerPageContext, GymSelection, OwnerFrame } from "@/lib/page-context";
import { firstParam, type PageSearchParams } from "@/lib/search-params";
import { GymSettingsEditor } from "@/components/settings-form";
import { MessageBanner, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function GymSettingsPage({ searchParams }: { searchParams: PageSearchParams }) {
  const params = await searchParams;
  const context = await getOwnerPageContext(firstParam(params.gymId));
  if (context.selectionRequired) return <GymSelection title="Choose owner gym" rolePath="/gym" memberships={context.memberships} />;
  const membership = context.membership!;
  const data = await getGymSettingsDashboard(context.actorUserId, membership.gymId);
  const returnTo = `/gym/settings?gymId=${membership.gymId}`;
  return <OwnerFrame actor={context.actor} membership={membership}><PageHeader eyebrow="Tenant identity" title="Gym settings" description="Supported branding and coaching defaults, validated and audited server-side." /><MessageBanner notice={firstParam(params.notice)} error={firstParam(params.error)} /><GymSettingsEditor gymId={membership.gymId} gymName={data.gym.name} settings={data.settings} returnTo={returnTo} /></OwnerFrame>;
}
