import { assignTrainerAction, unassignTrainerAction } from "@/app/actions";
import { ConfirmButton } from "@/components/confirm-button";
import { getGymMembers, getGymTrainers } from "@core/services/dashboard/gym";
import { getOwnerPageContext, GymSelection, OwnerFrame } from "@/lib/page-context";
import { dashboardFilters, firstParam, type PageSearchParams } from "@/lib/search-params";
import { EmptyState, MessageBanner, PageHeader, Pagination, StatusBadge } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function GymTrainersPage({ searchParams }: { searchParams: PageSearchParams }) {
  const params = await searchParams;
  const context = await getOwnerPageContext(firstParam(params.gymId));
  if (context.selectionRequired) return <GymSelection title="Choose owner gym" rolePath="/gym" memberships={context.memberships} />;
  const membership = context.membership!;
  const [trainers, members] = await Promise.all([getGymTrainers(context.actorUserId, membership.gymId, dashboardFilters(params)), getGymMembers(context.actorUserId, membership.gymId, { page: 1, pageSize: 50 })]);
  const returnTo = `/gym/trainers?gymId=${membership.gymId}`;
  return <OwnerFrame actor={context.actor} membership={membership}><PageHeader eyebrow="Staffing" title="Trainers" description="Assignments run through the validated trainer service; route handlers never write assignment rows directly." /><MessageBanner notice={firstParam(params.notice)} error={firstParam(params.error)} />
    <form className="filters" action={assignTrainerAction.bind(null, returnTo, membership.gymId)}><div className="field"><label htmlFor="trainerUserId">Trainer</label><select id="trainerUserId" name="trainerUserId" required><option value="">Choose trainer</option>{trainers.items.map((trainer) => <option value={trainer.userId} key={trainer.userId}>{trainer.user.firstName ?? trainer.user.telegramUsername ?? "Trainer"}</option>)}</select></div><div className="field"><label htmlFor="memberUserId">Member</label><select id="memberUserId" name="memberUserId" required><option value="">Choose member</option>{members.items.map((member) => <option value={member.userId} key={member.userId}>{member.user.firstName ?? member.user.telegramUsername ?? "Member"}</option>)}</select></div><ConfirmButton message="Assign this trainer to the selected member?">Assign trainer</ConfirmButton></form>
    <div className="panel table-wrap">{trainers.items.length ? <table><thead><tr><th>Trainer</th><th>Status</th><th>Assigned members</th><th>Pending approvals</th></tr></thead><tbody>{trainers.items.map((trainer) => <tr key={trainer.userId}><td><span className="cell-title">{trainer.user.trainerProfile?.displayName ?? trainer.user.firstName ?? trainer.user.telegramUsername ?? "Trainer"}</span><span className="cell-subtitle">{trainer.user.trainerProfile?.bio ?? "No profile bio"}</span></td><td><StatusBadge value={trainer.user.trainerProfile?.isActive === false ? "INACTIVE" : "ACTIVE"} /></td><td><div className="stack">{trainer.user.trainerAssignments.length ? trainer.user.trainerAssignments.map((assignment) => <form action={unassignTrainerAction.bind(null, returnTo, membership.gymId, trainer.userId, assignment.member.id)} key={assignment.id}><span>{assignment.member.firstName ?? assignment.member.telegramUsername ?? "Member"} </span><ConfirmButton className="button secondary small" message="Remove this trainer assignment?">Unassign</ConfirmButton></form>) : "0"}</div></td><td>{trainer.user.trainerApprovals.length}</td></tr>)}</tbody></table> : <EmptyState>No active trainers.</EmptyState>}</div><Pagination page={trainers.page} pageCount={trainers.pageCount} total={trainers.total} href="/gym/trainers" params={{ gymId: membership.gymId, search: firstParam(params.search) }} />
  </OwnerFrame>;
}
