import Link from "next/link";
import { getAdminGyms, getAdminUsers, userDisplayName } from "@core/services/dashboard/admin";
import { AdminFrame, getAdminPageContext } from "@/lib/page-context";
import { dashboardFilters, firstParam, type PageSearchParams } from "@/lib/search-params";
import { EmptyState, PageHeader, Pagination, StatusBadge, formatDate } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage({ searchParams }: { searchParams: PageSearchParams }) {
  const params = await searchParams;
  const { actorUserId, actor } = await getAdminPageContext();
  const common = dashboardFilters(params);
  const input = { ...common, gymId: firstParam(params.gymId), gymRole: firstParam(params.gymRole), goal: firstParam(params.goal), onboarding: firstParam(params.onboarding) };
  const [result, gyms] = await Promise.all([getAdminUsers(actorUserId, input), getAdminGyms(actorUserId, { page: 1, pageSize: 50 })]);
  return <AdminFrame actor={actor}><PageHeader eyebrow="People" title="Users" description="Searchable, tenant-aware profiles without exposing private chats or credentials." />
    <form className="filters"><div className="field"><label htmlFor="search">Name or Telegram username</label><input id="search" name="search" maxLength={80} defaultValue={firstParam(params.search)} /></div><div className="field compact"><label htmlFor="gymId">Gym</label><select id="gymId" name="gymId" defaultValue={firstParam(params.gymId) ?? ""}><option value="">All gyms</option>{gyms.items.map((gym) => <option value={gym.id} key={gym.id}>{gym.name}</option>)}</select></div><div className="field compact"><label htmlFor="gymRole">Gym role</label><select id="gymRole" name="gymRole" defaultValue={firstParam(params.gymRole) ?? ""}><option value="">All roles</option><option>OWNER</option><option>TRAINER</option><option>MEMBER</option></select></div><div className="field compact"><label htmlFor="goal">Goal</label><select id="goal" name="goal" defaultValue={firstParam(params.goal) ?? ""}><option value="">All goals</option><option value="FAT_LOSS">Lose fat</option><option value="MUSCLE_GAIN">Build muscle</option><option value="RECOMPOSITION">Recomposition</option><option value="STRENGTH">Strength</option><option value="GENERAL_FITNESS">General fitness</option></select></div><div className="field compact"><label htmlFor="onboarding">Onboarding</label><select id="onboarding" name="onboarding" defaultValue={firstParam(params.onboarding) ?? ""}><option value="">Any</option><option value="COMPLETE">Complete</option><option value="INCOMPLETE">Incomplete</option></select></div><button className="button" type="submit">Filter</button></form>
    <div className="panel table-wrap">{result.items.length ? <table><thead><tr><th>User</th><th>Global role</th><th>Memberships</th><th>Goal</th><th>Weight</th><th>Onboarding</th><th>Created</th></tr></thead><tbody>{result.items.map((user) => <tr key={user.id}><td><Link className="text-link" href={`/admin/users/${user.id}`}>{userDisplayName(user)}</Link><span className="cell-subtitle">{user.telegramUsername ? `@${user.telegramUsername}` : "No username"}</span></td><td><StatusBadge value={user.systemRole} /></td><td>{user.gymMemberships.map((membership) => `${membership.gym.name} (${membership.role})`).join(", ") || "—"}</td><td>{user.profile?.goal?.replaceAll("_", " ") ?? "—"}</td><td>{user.profile?.weightKg ? `${user.profile.weightKg} kg` : "—"}</td><td><StatusBadge value={user.onboardingStep} /></td><td>{formatDate(user.createdAt)}</td></tr>)}</tbody></table> : <EmptyState>No users match these filters.</EmptyState>}</div>
    <Pagination page={result.page} pageCount={result.pageCount} total={result.total} href="/admin/users" params={{ search: firstParam(params.search), gymId: firstParam(params.gymId), gymRole: firstParam(params.gymRole), goal: firstParam(params.goal), onboarding: firstParam(params.onboarding) }} />
  </AdminFrame>;
}
