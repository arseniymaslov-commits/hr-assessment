import { prisma } from "@/lib/prisma";

export const ACTIVITY_UPDATE_INTERVAL_MS = 60_000;

export async function recordUserActivity(userId: string, date = new Date(), force = false) {
  return prisma.user.updateMany({
    where: {
      id: userId,
      isActive: true,
      OR: [
        { lastSeenAt: null },
        { lastSeenAt: { lt: force ? date : new Date(date.getTime() - ACTIVITY_UPDATE_INTERVAL_MS) } }
      ]
    },
    data: { lastSeenAt: date }
  });
}
