import { getPendingApprovalsForMember, getPendingApprovalsForTrainer, requestStructuredPlanReview } from "../../services/approvals.js";
import { GymRole } from "../../generated/prisma/client.js";
import { emptyToolInputSchema, reviewRequestInputSchema } from "../schemas.js";
import { ToolCategory, type AgentToolDefinition } from "../types.js";

export const trainerTools: AgentToolDefinition[] = [
  {
    name: "get_pending_member_approvals",
    description: "Read the authenticated member's own pending structured plan approvals only.",
    category: ToolCategory.READ,
    schema: emptyToolInputSchema,
    requiresGym: true,
    allowedGymRoles: [GymRole.MEMBER],
    handler: async (_input, { actor }) => getPendingApprovalsForMember(actor.userId, actor.gymId ?? undefined),
  },
  {
    name: "request_structured_plan_review",
    description: "Request a trainer review through the structured approval architecture. This does not mutate a plan or approve anything.",
    category: ToolCategory.ACTION,
    schema: reviewRequestInputSchema,
    requiresGym: true,
    allowedGymRoles: [GymRole.MEMBER],
    handler: async (input, { actor }) => {
      const parsed = reviewRequestInputSchema.parse(input);
      const request = await requestStructuredPlanReview({
        memberUserId: actor.userId,
        gymId: actor.gymId!,
        scope: parsed.scope,
        ...(parsed.notes ? { notes: parsed.notes } : {}),
      });
      return { status: "requested", reference: request.reference, reviewScope: parsed.scope, assignedToTrainer: Boolean(request.trainerUserId) };
    },
  },
  {
    name: "get_pending_trainer_approvals",
    description: "Privileged: read pending approvals that the authenticated trainer/owner is authorized to review in the active gym.",
    category: ToolCategory.PRIVILEGED,
    schema: emptyToolInputSchema,
    requiresGym: true,
    handler: async (_input, { actor }) => getPendingApprovalsForTrainer(actor.userId, actor.gymId!),
  },
];
