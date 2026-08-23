import Link from "next/link";
import { notFound } from "next/navigation";
import { GymRole } from "@core/generated/prisma/client";
import { DashboardAuthorizationError, requireAdminActor, resolveDashboardGym } from "@core/auth/dashboard-auth";
import { requireSessionActorUserId } from "@/lib/auth";
import { DashboardShell } from "@/components/dashboard-shell";
import { PageHeader } from "@/components/ui";

export function actorName(actor: { firstName: string | null; telegramUsername: string | null }) {
  return actor.firstName ?? (actor.telegramUsername ? `@${actor.telegramUsername}` : "Staff user");
}

export async function getAdminPageContext() {
  const actorUserId = await requireSessionActorUserId();
  let actor;
  try { actor = await requireAdminActor(actorUserId); }
  catch (error) { if (error instanceof DashboardAuthorizationError) notFound(); throw error; }
  return { actorUserId, actor };
}

export async function getOwnerPageContext(requestedGymId?: string) {
  const actorUserId = await requireSessionActorUserId();
  let scope;
  try { scope = await resolveDashboardGym({ actorUserId, role: GymRole.OWNER, ...(requestedGymId ? { requestedGymId } : {}) }); }
  catch (error) { if (error instanceof DashboardAuthorizationError) notFound(); throw error; }
  return { actorUserId, ...scope };
}

export async function getTrainerPageContext(requestedGymId?: string) {
  const actorUserId = await requireSessionActorUserId();
  let scope;
  try { scope = await resolveDashboardGym({ actorUserId, role: GymRole.TRAINER, ...(requestedGymId ? { requestedGymId } : {}) }); }
  catch (error) { if (error instanceof DashboardAuthorizationError) notFound(); throw error; }
  return { actorUserId, ...scope };
}

export function GymSelection({ title, rolePath, memberships }: {
  title: string;
  rolePath: "/gym" | "/trainer";
  memberships: Array<{ gymId: string; gym: { name: string; settings: { displayName: string | null; aiDisplayName: string | null } | null } }>;
}) {
  return <main className="content"><PageHeader eyebrow="Tenant scope" title={title} description="Choose the gym context for this dashboard. Your selection is revalidated on every server request." /><div className="metric-grid">{memberships.map((membership) => <Link className="metric-card" href={`${rolePath}?gymId=${encodeURIComponent(membership.gymId)}`} key={membership.gymId}><div className="metric-label">Gym</div><div className="metric-value" style={{ fontSize: 22 }}>{membership.gym.settings?.displayName ?? membership.gym.name}</div><div className="metric-hint">{membership.gym.settings?.aiDisplayName ?? "AI Coach"}</div></Link>)}</div></main>;
}

const adminNav = [
  ["/admin", "Overview"], ["/admin/gyms", "Gyms"], ["/admin/users", "Users"],
  ["/admin/ai", "AI observability"], ["/admin/media", "Media"], ["/admin/approvals", "Approvals"], ["/admin/audit", "Audit log"],
] as const;

export function AdminFrame({ actor, children }: { actor: { firstName: string | null; telegramUsername: string | null }; children: React.ReactNode }) {
  return <DashboardShell title="AFC Platform" subtitle="Master Admin" actorLabel={actorName(actor)} nav={adminNav.map(([href, label]) => ({ href, label }))} neutral>{children}</DashboardShell>;
}

export function OwnerFrame({ actor, membership, children }: {
  actor: { firstName: string | null; telegramUsername: string | null };
  membership: { gymId: string; gym: { name: string; primaryColor: string | null; secondaryColor: string | null; aiName: string; settings: { displayName: string | null; aiDisplayName: string | null; primaryColor: string | null; secondaryColor: string | null } | null } };
  children: React.ReactNode;
}) {
  const gymId = encodeURIComponent(membership.gymId);
  const gym = membership.gym;
  const title = gym.settings?.displayName ?? gym.name;
  const nav = [[`/gym?gymId=${gymId}`, "Overview"], [`/gym/members?gymId=${gymId}`, "Members"], [`/gym/trainers?gymId=${gymId}`, "Trainers"], [`/gym/approvals?gymId=${gymId}`, "Approvals"], [`/gym/settings?gymId=${gymId}`, "Settings"]];
  return <DashboardShell title={title} subtitle={`${gym.settings?.aiDisplayName ?? gym.aiName} · Owner`} actorLabel={actorName(actor)} nav={nav.map(([href, label]) => ({ href: href!, label: label! }))} primaryColor={gym.settings?.primaryColor ?? gym.primaryColor} secondaryColor={gym.settings?.secondaryColor ?? gym.secondaryColor}>{children}</DashboardShell>;
}

export function TrainerFrame({ actor, membership, children }: {
  actor: { firstName: string | null; telegramUsername: string | null };
  membership: { gymId: string; gym: { name: string; primaryColor: string | null; secondaryColor: string | null; aiName: string; settings: { displayName: string | null; aiDisplayName: string | null; primaryColor: string | null; secondaryColor: string | null } | null } };
  children: React.ReactNode;
}) {
  const gymId = encodeURIComponent(membership.gymId);
  const gym = membership.gym;
  const title = gym.settings?.displayName ?? gym.name;
  const nav = [[`/trainer?gymId=${gymId}`, "Overview"], [`/trainer/members?gymId=${gymId}`, "Assigned members"], [`/trainer/approvals?gymId=${gymId}`, "Approvals"]];
  return <DashboardShell title={title} subtitle={`${gym.settings?.aiDisplayName ?? gym.aiName} · Trainer`} actorLabel={actorName(actor)} nav={nav.map(([href, label]) => ({ href: href!, label: label! }))} primaryColor={gym.settings?.primaryColor ?? gym.primaryColor} secondaryColor={gym.settings?.secondaryColor ?? gym.secondaryColor}>{children}</DashboardShell>;
}
