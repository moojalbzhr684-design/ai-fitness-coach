import { CheckInStatus } from "../generated/prisma/client.js";
import { prisma } from "../lib/prisma.js";
import { calculateWeightTrend } from "../progress/trend.js";

export async function getProgressSummary(userId: string) {
  const [user, measurements, latestCheckIn, checkInCount] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, include: { profile: true } }),
    prisma.bodyMeasurement.findMany({
      where: { userId },
      orderBy: { measuredAt: "asc" },
      select: { weightKg: true, waistCm: true, measuredAt: true },
    }),
    prisma.weeklyCheckIn.findFirst({
      where: { userId, status: CheckInStatus.EVALUATED },
      include: { evaluation: true },
      orderBy: { evaluatedAt: "desc" },
    }),
    prisma.weeklyCheckIn.count({ where: { userId, status: CheckInStatus.EVALUATED } }),
  ]);
  if (!user) return null;
  const oldest = measurements[0];
  const latest = measurements.at(-1);
  const startingWeightKg = oldest?.weightKg ?? user.profile?.weightKg ?? null;
  const currentWeightKg = latest?.weightKg ?? user.profile?.weightKg ?? null;
  return {
    startingWeightKg,
    currentWeightKg,
    totalChangeKg: startingWeightKg !== null && currentWeightKg !== null
      ? Math.round((currentWeightKg - startingWeightKg) * 10) / 10
      : null,
    latestWaistCm: [...measurements].reverse().find((item) => item.waistCm !== null)?.waistCm ?? null,
    trend: calculateWeightTrend(measurements),
    latestCheckIn,
    checkInCount,
  };
}

export async function getCheckInStatus(userId: string) {
  const [draft, latest] = await Promise.all([
    prisma.weeklyCheckIn.findFirst({
      where: { userId, status: CheckInStatus.DRAFT },
      orderBy: { createdAt: "desc" },
    }),
    prisma.weeklyCheckIn.findFirst({
      where: { userId, status: { in: [CheckInStatus.SUBMITTED, CheckInStatus.EVALUATED] } },
      include: { evaluation: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  return { draft, latest };
}
