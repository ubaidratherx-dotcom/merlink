import { prisma } from "../lib/prisma";

interface CreateNotification {
  userId: string;
  type: string;
  title: string;
  subtitle?: string;
  link?: string;
}

/** Create a notification for a user (persisted to DB) */
async function create(data: CreateNotification) {
  return prisma.notification.create({ data });
}

/** Create notifications for multiple users at once */
async function createMany(userIds: string[], data: Omit<CreateNotification, "userId">) {
  if (userIds.length === 0) return;
  return prisma.notification.createMany({
    data: userIds.map((userId) => ({ userId, ...data })),
  });
}

/** Get unread notifications for a user */
async function getUnread(userId: string) {
  return prisma.notification.findMany({
    where: { userId, read: false },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

/** Get all recent notifications for a user */
async function getRecent(userId: string, limit = 50) {
  return prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

/** Mark all as read */
async function markAllRead(userId: string) {
  return prisma.notification.updateMany({
    where: { userId, read: false },
    data: { read: true },
  });
}

/** Get unread count */
async function getUnreadCount(userId: string): Promise<number> {
  return prisma.notification.count({
    where: { userId, read: false },
  });
}

export const notificationService = {
  create,
  createMany,
  getUnread,
  getRecent,
  markAllRead,
  getUnreadCount,
};
