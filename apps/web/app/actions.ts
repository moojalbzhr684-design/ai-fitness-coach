"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@core/lib/prisma";
import {
  DASHBOARD_SESSION_COOKIE,
  createDashboardSession,
  dashboardSessionCookieOptions,
} from "@core/auth/session";
import { ApprovalServiceError, approveRequest, rejectRequest } from "@core/services/approvals";
import { GymSettingsError, updateGymSettings } from "@core/services/gym-settings";
import { TrainerServiceError, assignTrainerToMember, removeTrainerFromMember } from "@core/services/trainers";
import { opaqueIdSchema, optionalReviewNoteSchema } from "@core/services/dashboard/common";
import {
  assertDevelopmentLoginEnabled,
  clearDashboardSession,
  developmentTokenMatches,
  requireSessionActorUserId,
} from "@/lib/auth";

const tokenSchema = z.string().min(1).max(500);
const returnToSchema = z.string().max(500).refine((value) => /^\/(admin|gym|trainer)(?:[/?]|$)/.test(value) && !value.startsWith("//"));

function safeReturnTo(value: string): string {
  return returnToSchema.safeParse(value).success ? value : "/";
}

function destinationWithMessage(returnTo: string, kind: "notice" | "error", message: string): string {
  const url = new URL(safeReturnTo(returnTo), "http://dashboard.local");
  url.searchParams.set(kind, message.slice(0, 180));
  return `${url.pathname}${url.search}`;
}

function safeServiceMessage(error: unknown, fallback: string): string {
  return error instanceof ApprovalServiceError || error instanceof GymSettingsError || error instanceof TrainerServiceError
    ? error.message
    : fallback;
}

export async function developmentLoginAction(formData: FormData): Promise<void> {
  const token = tokenSchema.safeParse(formData.get("token"));
  const config = assertDevelopmentLoginEnabled();
  if (!token.success || !developmentTokenMatches(token.data, config.loginToken)) {
    redirect("/staff/login?error=Invalid+development+access+token");
  }
  const user = await prisma.user.findUnique({ where: { telegramId: BigInt(config.telegramId) }, select: { id: true } });
  if (!user) redirect("/staff/login?error=Configured+dashboard+account+was+not+found");
  const store = await cookies();
  store.set(
    DASHBOARD_SESSION_COOKIE,
    createDashboardSession(user.id, config.sessionSecret),
    dashboardSessionCookieOptions(process.env.NODE_ENV === "production"),
  );
  redirect("/");
}

export async function logoutAction(): Promise<void> {
  await clearDashboardSession();
  redirect("/staff/login");
}

export async function approveDashboardRequestAction(returnTo: string, requestId: string, formData: FormData): Promise<void> {
  const actorUserId = await requireSessionActorUserId();
  const id = opaqueIdSchema.parse(requestId);
  const note = optionalReviewNoteSchema.parse(formData.get("note"));
  let failure: string | null = null;
  try {
    await approveRequest(actorUserId, id, note);
  } catch (error) {
    failure = safeServiceMessage(error, "Approval could not be completed.");
  }
  if (failure) redirect(destinationWithMessage(returnTo, "error", failure));
  revalidatePath("/admin/approvals");
  revalidatePath("/gym/approvals");
  revalidatePath("/trainer/approvals");
  redirect(destinationWithMessage(returnTo, "notice", "Approval completed safely."));
}

export async function rejectDashboardRequestAction(returnTo: string, requestId: string, formData: FormData): Promise<void> {
  const actorUserId = await requireSessionActorUserId();
  const id = opaqueIdSchema.parse(requestId);
  const note = optionalReviewNoteSchema.parse(formData.get("note"));
  let failure: string | null = null;
  try {
    await rejectRequest(actorUserId, id, note);
  } catch (error) {
    failure = safeServiceMessage(error, "Rejection could not be completed.");
  }
  if (failure) redirect(destinationWithMessage(returnTo, "error", failure));
  revalidatePath("/admin/approvals");
  revalidatePath("/gym/approvals");
  revalidatePath("/trainer/approvals");
  redirect(destinationWithMessage(returnTo, "notice", "Approval rejected without changing the plan."));
}

function nullableText(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function updateGymSettingsAction(returnTo: string, gymId: string, formData: FormData): Promise<void> {
  const actorUserId = await requireSessionActorUserId();
  const id = opaqueIdSchema.parse(gymId);
  const duration = nullableText(formData, "defaultSessionMinutes");
  let failure: string | null = null;
  try {
    await updateGymSettings(actorUserId, id, {
      displayName: nullableText(formData, "displayName"),
      aiDisplayName: nullableText(formData, "aiDisplayName"),
      primaryColor: nullableText(formData, "primaryColor"),
      secondaryColor: nullableText(formData, "secondaryColor"),
      defaultLanguage: nullableText(formData, "defaultLanguage") ?? "ar-IQ",
      requireTrainerApprovalForNutritionChanges: formData.get("requireTrainerApprovalForNutritionChanges") === "on",
      requireTrainerApprovalForWorkoutChanges: formData.get("requireTrainerApprovalForWorkoutChanges") === "on",
      allowAutomaticProgressRecommendations: formData.get("allowAutomaticProgressRecommendations") === "on",
      trainingPhilosophy: nullableText(formData, "trainingPhilosophy"),
      defaultSessionMinutes: duration ? Number(duration) : null,
      welcomeMessage: nullableText(formData, "welcomeMessage"),
    });
  } catch (error) {
    failure = safeServiceMessage(error, "Settings could not be updated.");
  }
  if (failure) redirect(destinationWithMessage(returnTo, "error", failure));
  revalidatePath("/gym/settings");
  revalidatePath(`/admin/gyms/${id}`);
  redirect(destinationWithMessage(returnTo, "notice", "Gym settings updated."));
}

export async function assignTrainerAction(returnTo: string, gymId: string, formData: FormData): Promise<void> {
  const actorUserId = await requireSessionActorUserId();
  const trainerUserId = opaqueIdSchema.parse(formData.get("trainerUserId"));
  const memberUserId = opaqueIdSchema.parse(formData.get("memberUserId"));
  let failure: string | null = null;
  try {
    await assignTrainerToMember(actorUserId, opaqueIdSchema.parse(gymId), trainerUserId, memberUserId);
  } catch (error) {
    failure = safeServiceMessage(error, "Assignment failed.");
  }
  if (failure) redirect(destinationWithMessage(returnTo, "error", failure));
  revalidatePath("/gym/trainers");
  revalidatePath("/gym/members");
  redirect(destinationWithMessage(returnTo, "notice", "Trainer assigned."));
}

export async function unassignTrainerAction(returnTo: string, gymId: string, trainerUserId: string, memberUserId: string): Promise<void> {
  const actorUserId = await requireSessionActorUserId();
  let failure: string | null = null;
  try {
    await removeTrainerFromMember(actorUserId, opaqueIdSchema.parse(gymId), opaqueIdSchema.parse(trainerUserId), opaqueIdSchema.parse(memberUserId));
  } catch (error) {
    failure = safeServiceMessage(error, "Unassignment failed.");
  }
  if (failure) redirect(destinationWithMessage(returnTo, "error", failure));
  revalidatePath("/gym/trainers");
  revalidatePath("/gym/members");
  redirect(destinationWithMessage(returnTo, "notice", "Trainer unassigned."));
}
