import Link from "next/link";
import { EmptyState, Panel, StatusBadge, formatDate, formatDateTime } from "@/components/ui";
import { WeightChart } from "@/components/weight-chart";

type MemberRecord = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  telegramUsername: string | null;
  onboardingStep: string;
  profile: null | {
    goal: string | null;
    weightKg: number | null;
    heightCm: number | null;
    allowTrainerPhotoAccess: boolean;
    allowGymPhotoAccess: boolean;
  };
  memberAssignments: Array<{ trainer: { firstName: string | null; lastName: string | null; telegramUsername: string | null } }>;
  bodyMeasurements: Array<{ id: string; measuredAt: Date; weightKg: number; waistCm: number | null }>;
  weeklyCheckIns: Array<{ id: string; evaluatedAt: Date | null; status: string; nutritionAdherencePct: number | null; workoutsCompleted: number | null; trackedWorkoutsCompleted: number | null }>;
  workoutPrograms: Array<{ id: string; name: string; split: string; status: string; days: Array<{ id: string; dayNumber: number; name: string; exercises: Array<{ id: string; sets: number; repMin: number; repMax: number; exercise: { name: string } }> }> }>;
  workoutSessions: Array<{ id: string; completedAt: Date | null; workoutDay: { name: string } | null; exerciseLogs: Array<{ id: string }> }>;
  nutritionPlans: Array<{ id: string; status: string; estimatedWeeklyCostIqd: number | null; target: { calories: number; proteinGrams: number; carbsGrams: number; fatGrams: number }; meals: Array<{ id: string; name: string; items: Array<{ id: string; quantityGrams: number; food: { name: string } }> }> }>;
  agentDecisions: Array<{ id: string; decisionType: string; reason: string; createdAt: Date; approvalRequest: { status: string } | null }>;
  memberApprovals: Array<{ id: string; reference: string; type: string; status: string; createdAt: Date }>;
  progressPhotoSets: Array<{ id: string; capturedAt: Date; analysis: { status: string; overallSummary: string | null; comparisonSummary: string | null } | null; photos: Array<{ id: string; view: string; visibility: string }> }>;
};

function name(member: MemberRecord) {
  return [member.firstName, member.lastName].filter(Boolean).join(" ") || (member.telegramUsername ? `@${member.telegramUsername}` : "Member");
}

export function MemberDetailView({ member }: { member: MemberRecord }) {
  const workout = member.workoutPrograms[0];
  const nutrition = member.nutritionPlans[0];
  return <>
    <div className="detail-grid">
      <div className="detail-item"><span>Member</span><strong>{name(member)}</strong></div>
      <div className="detail-item"><span>Goal</span><strong>{member.profile?.goal?.replaceAll("_", " ") ?? "—"}</strong></div>
      <div className="detail-item"><span>Current weight</span><strong>{member.profile?.weightKg ? `${member.profile.weightKg} kg` : "—"}</strong></div>
      <div className="detail-item"><span>Starting weight</span><strong>{member.bodyMeasurements[0]?.weightKg ? `${member.bodyMeasurements[0].weightKg} kg` : "—"}</strong></div>
      <div className="detail-item"><span>Assigned trainer</span><strong>{member.memberAssignments[0]?.trainer.firstName ?? member.memberAssignments[0]?.trainer.telegramUsername ?? "Unassigned"}</strong></div>
      <div className="detail-item"><span>Onboarding</span><StatusBadge value={member.onboardingStep} /></div>
    </div>

    <div className="panel-grid section-gap">
      <div>
        <div id="progress"><Panel title="Weight progress"><div className="panel-body"><WeightChart points={member.bodyMeasurements.map((point) => ({ measuredAt: point.measuredAt, weightKg: point.weightKg }))} /></div></Panel></div>
        <div id="workout"><Panel title="Workout"><div className="panel-body">{workout ? <div className="stack"><div><strong>{workout.name}</strong> · {workout.split.replaceAll("_", " ")} <StatusBadge value={workout.status} /></div>{workout.days.map((day) => <div className="detail-item" key={day.id}><span>Day {day.dayNumber}</span><strong>{day.name}</strong><div className="cell-subtitle">{day.exercises.map((item) => `${item.exercise.name} ${item.sets}×${item.repMin}-${item.repMax}`).join(" · ")}</div></div>)}</div> : <EmptyState>No active workout program.</EmptyState>}</div></Panel></div>
        <div id="nutrition"><Panel title="Nutrition"><div className="panel-body">{nutrition ? <><div className="detail-grid"><div className="detail-item"><span>Calories</span><strong>{nutrition.target.calories}</strong></div><div className="detail-item"><span>Protein</span><strong>{nutrition.target.proteinGrams} g</strong></div><div className="detail-item"><span>Carbs / Fat</span><strong>{nutrition.target.carbsGrams} / {nutrition.target.fatGrams} g</strong></div></div><div className="stack section-gap">{nutrition.meals.map((meal) => <div className="detail-item" key={meal.id}><span>Meal</span><strong>{meal.name}</strong><div className="cell-subtitle">{meal.items.map((item) => `${item.food.name} ${item.quantityGrams}g`).join(" · ")}</div></div>)}</div></> : <EmptyState>No active nutrition plan.</EmptyState>}</div></Panel></div>
      </div>
      <div>
        <Panel title="Recent check-ins"><div className="panel-body stack">{member.weeklyCheckIns.length ? member.weeklyCheckIns.slice(0, 8).map((checkIn) => <div className="detail-item" key={checkIn.id}><span>{formatDate(checkIn.evaluatedAt)}</span><strong>Nutrition {checkIn.nutritionAdherencePct ?? "—"}% · Workouts {checkIn.workoutsCompleted ?? "—"}/{checkIn.trackedWorkoutsCompleted ?? "—"}</strong></div>) : <EmptyState>No evaluated check-ins.</EmptyState>}</div></Panel>
        <div id="photos"><Panel title="Progress photos"><div className="panel-body stack">{member.progressPhotoSets.length ? member.progressPhotoSets.map((set) => <div className="detail-item" key={set.id}><span>{formatDate(set.capturedAt)}</span><strong>{set.photos.length} authorized view{set.photos.length === 1 ? "" : "s"}</strong><div className="cell-subtitle">{set.analysis?.overallSummary ?? "No completed analysis summary."}</div>{set.photos.length ? <div className="photo-actions">{set.photos.map((photo) => <Link className="button secondary small" href={`/api/media/photos/${photo.id}`} target="_blank" rel="noreferrer" key={photo.id}>View {photo.view.toLowerCase()}</Link>)}</div> : null}</div>) : <EmptyState>No photos are authorized for this role.</EmptyState>}</div></Panel></div>
        <div id="decisions"><Panel title="Decisions and approvals"><div className="panel-body stack">{member.agentDecisions.length ? member.agentDecisions.slice(0, 10).map((decision) => <div className="detail-item" key={decision.id}><span>{formatDateTime(decision.createdAt)}</span><strong>{decision.decisionType.replaceAll("_", " ")}</strong><div className="cell-subtitle">{decision.reason}</div>{decision.approvalRequest ? <StatusBadge value={decision.approvalRequest.status} /> : null}</div>) : <EmptyState>No decisions recorded.</EmptyState>}</div></Panel></div>
      </div>
    </div>
  </>;
}
