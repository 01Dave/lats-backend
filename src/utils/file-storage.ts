import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { env } from "../config/env";

/**
 * Local-disk document storage, behind a small interface so a later move
 * to S3/MinIO only means writing a new implementation of these three
 * functions — nothing in document-service.ts or elsewhere would need to
 * change. Storage decision: local disk (Step 3), see project notes.
 */

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

/**
 * Saves a buffer under a collision-proof name and returns the relative
 * storage path to persist on the Document row. Never trusts the original
 * filename for the on-disk name (path traversal / collision safety) —
 * the original name is kept separately as Document.filename for display.
 */
export async function saveFile(applicationId: string, originalFilename: string, buffer: Buffer): Promise<string> {
  const dir = path.join(env.fileStorageDir, applicationId);
  await ensureDir(dir);

  const ext = path.extname(originalFilename);
  const safeName = `${randomUUID()}${ext}`;
  const fullPath = path.join(dir, safeName);

  await fs.writeFile(fullPath, buffer);

  return path.join(applicationId, safeName);
}

export async function getFile(storagePath: string): Promise<Buffer> {
  const fullPath = path.join(env.fileStorageDir, storagePath);
  return fs.readFile(fullPath);
}

export async function deleteFile(storagePath: string): Promise<void> {
  const fullPath = path.join(env.fileStorageDir, storagePath);
  await fs.unlink(fullPath).catch(() => {
    // Already gone — deleting a missing file isn't an error for our purposes.
  });
}
