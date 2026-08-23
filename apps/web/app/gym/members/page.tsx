import Link from "next/link";
import { getGymMembers, getGymTrainers } from "@core/services/dashboard/gym";
import { getOwnerPageContext, GymSelection, OwnerFrame } from "@/lib/page-context";
import { dashboardFilters, firstParam, type PageSearchParams } from "@/lib/search-params";
import { EmptyState, PageHeader, Pagination, formatDate } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function GymMembersPage({ searchParams }: { searchParams: PageSearchParams }) {
  const params = await searchParams;
  const gymId = firstParam(params.gymId);
  const context = await getOwnerPageContext(gymId);
  if (context.selectionRequired) return <GymSelection title="Choose owner gym" rolePath="/gym" memberships={context.memberships} />;
  const membership = context.membership!;
  const filters = { ...dashboardFilters(params), trainerUserId: firstParam(params.trainerUserId), goal: firstParam(params.goal), checkIn: firstParam(params.checkIn) };
  const [result, trainers] = await Promise.all([getGymMembers(context.actorUserId, membership.gymId, filters), getGymTrainers(context.actorUserId, membership.gymId, { page: 1, pageSize: 50 })]);
  return <OwnerFrame actor={context.actor} membership={membership}><PageHeader eyebrow="Coaching roster" title="Members" description="Only active members inside the selected gym are returned." />
    <form className="filters"><input type="hidden" name="gymId" value={membership.gymId} /><div className="field"><label htmlFor="search">Name or username</label><input id="search" name="search" maxLength={80} defaultValue={firstParam(params.search)} /></div><div className="field compact"><label htmlFor="trainerUserId">Trainer</label><select id="trainerUserId" name="trainerUserId" defaultValue={firstParam(params.trainerUserId) ?? ""}><option value="">All trainers</option>{trainers.items.map((trainer) => <option value={trainer.userId} key={trainer.userId}>{trainer.user.firstName ?? trainer.user.telegramUsername ?? "Trainer"}</option>)}</select></div><div className="field compact"><label htmlFor="goal">Goal</label><select id="goal" name="goal" defaultValue={firstParam(params.goal) ?? ""}><option value="">All goals</option><option value="FAT_LOSS">Lose fat</option><option value="MUSCLE_GAIN">Build muscle</option><option value="RECOMPOSITION">Recomposition</option><option value="STRENGTH">Strength</option><option value="GENERAL_FITNESS">General fitness</option></select></div><div className="field compact"><label htmlFor="checkIn">Check-in</label><select id="checkIn" name="checkIn" defaultValue={firstParam(params.checkIn) ?? ""}><option value="">Any</option><option value="RECENT">Recent</option><option value="OVERDUE">Overdue</option></select></div><button className="button" type="submit">Filter</button></form>
    <div className="panel table-wrap">{result.items.length ? <table><thead><tr><th>Name</th><th>Goal</th><th>Weight</th><th>Trainer</th><th>Last check-in</th><th>Adherence</th><th>Latest decision</th></tr></thead><tbody>{result.items.map(({ user }) => <tr key={user.id}><td><Link className="text-link" href={`/gym/members/${user.id}?gymId=${membership.gymId}`}>{user.firstName ?? user.telegramUsername ?? "Member"}</Link></td><td>{user.profile?.goal?.replaceAll("_", " ") ?? "—"}</td><td>{user.profile?.weightKg ? `${user.profile.weightKg} kg` : "—"}</td><td>{user.memberAssignments[0]?.trainer.firstName ?? user.memberAssignments[0]?.trainer.telegramUsername ?? "Unassigned"}</td><td>{formatDate(user.weeklyCheckIns[0]?.evaluatedAt)}</td><td>{user.weeklyCheckIns[0]?.nutritionAdherencePct !== null && user.weeklyCheckIns[0]?.nutritionAdherencePct !== undefined ? `${user.weeklyCheckIns[0].nutritionAdherencePct}%` : "—"}</td><td>{user.agentDecisions[0]?.reason ?? "—"}</td></tr>)}</tbody></table> : <EmptyState>No members match.</EmptyState>}</div><Pagination page={result.page} pageCount={result.pageCount} total={result.total} href="/gym/members" params={{ gymId: membership.gymId, search: firstParam(params.search), trainerUserId: firstParam(params.trainerUserId), goal: firstParam(params.goal), checkIn: firstParam(params.checkIn) }} />
  </OwnerFrame>;
}
