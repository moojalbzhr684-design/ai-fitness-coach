import Link from "next/link";
import { getTrainerMembersDashboard } from "@core/services/dashboard/trainer";
import { getTrainerPageContext, GymSelection, TrainerFrame } from "@/lib/page-context";
import { dashboardFilters, firstParam, type PageSearchParams } from "@/lib/search-params";
import { EmptyState, PageHeader, Pagination, formatDate } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function TrainerMembersPage({ searchParams }: { searchParams: PageSearchParams }) {
  const params = await searchParams;
  const context = await getTrainerPageContext(firstParam(params.gymId));
  if (context.selectionRequired) return <GymSelection title="Choose trainer gym" rolePath="/trainer" memberships={context.memberships} />;
  const membership = context.membership!;
  const result = await getTrainerMembersDashboard(context.actorUserId, membership.gymId, { ...dashboardFilters(params), goal: firstParam(params.goal) });
  return <TrainerFrame actor={context.actor} membership={membership}><PageHeader eyebrow="Assigned roster" title="Members" description="This list is based on explicit trainer assignments in the selected tenant." />
    <form className="filters"><input type="hidden" name="gymId" value={membership.gymId} /><div className="field"><label htmlFor="search">Name or username</label><input id="search" name="search" maxLength={80} defaultValue={firstParam(params.search)} /></div><div className="field compact"><label htmlFor="goal">Goal</label><select id="goal" name="goal" defaultValue={firstParam(params.goal) ?? ""}><option value="">All goals</option><option value="FAT_LOSS">Lose fat</option><option value="MUSCLE_GAIN">Build muscle</option><option value="RECOMPOSITION">Recomposition</option><option value="STRENGTH">Strength</option><option value="GENERAL_FITNESS">General fitness</option></select></div><button className="button" type="submit">Filter</button></form>
    <div className="panel table-wrap">{result.items.length ? <table><thead><tr><th>Name</th><th>Goal</th><th>Weight</th><th>Last check-in</th><th>Nutrition adherence</th><th>Recent workout</th><th>Recommendation</th></tr></thead><tbody>{result.items.map(({ member }) => <tr key={member.id}><td><Link className="text-link" href={`/trainer/members/${member.id}?gymId=${membership.gymId}`}>{member.firstName ?? member.telegramUsername ?? "Member"}</Link></td><td>{member.profile?.goal?.replaceAll("_", " ") ?? "—"}</td><td>{member.profile?.weightKg ? `${member.profile.weightKg} kg` : "—"}</td><td>{formatDate(member.weeklyCheckIns[0]?.evaluatedAt)}</td><td>{member.weeklyCheckIns[0]?.nutritionAdherencePct !== null && member.weeklyCheckIns[0]?.nutritionAdherencePct !== undefined ? `${member.weeklyCheckIns[0].nutritionAdherencePct}%` : "—"}</td><td>{formatDate(member.workoutSessions[0]?.completedAt)}</td><td>{member.agentDecisions[0]?.reason ?? "—"}</td></tr>)}</tbody></table> : <EmptyState>No assigned members match.</EmptyState>}</div><Pagination page={result.page} pageCount={result.pageCount} total={result.total} href="/trainer/members" params={{ gymId: membership.gymId, search: firstParam(params.search), goal: firstParam(params.goal) }} />
  </TrainerFrame>;
}
