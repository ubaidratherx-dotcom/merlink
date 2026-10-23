import { prisma } from "../lib/prisma";

/**
 * Database-backed file store for user uploads (profile photos, dispute
 * evidence). Keeps the API stateless so it can run on serverless hosts where
 * local disk is ephemeral. Files are served from GET /uploads/:id.
 */
async function save(buffer: Buffer, mimeType: string): Promise<string> {
  const file = await prisma.storedFile.create({
    data: { mimeType, data: buffer, size: buffer.length },
    select: { id: true },
  });
  return `/uploads/${file.id}`;
}

async function get(id: string) {
  return prisma.storedFile.findUnique({ where: { id } });
}

export const fileStoreService = { save, get };
