import { prisma } from "../db/client";
import { AuthenticatedUser } from "../middleware/auth-middleware";
import { getApplicationById } from "./application-service";

export async function addComment(actor: AuthenticatedUser, applicationId: string, body: string) {
  // Visibility-scoped — can't comment on an application you can't see.
  await getApplicationById(actor, applicationId);

  return prisma.comment.create({
    data: { applicationId, authorId: actor.id, body },
  });
}

export async function listComments(actor: AuthenticatedUser, applicationId: string) {
  await getApplicationById(actor, applicationId);
  return prisma.comment.findMany({
    where: { applicationId },
    orderBy: { createdAt: "asc" },
  });
}
