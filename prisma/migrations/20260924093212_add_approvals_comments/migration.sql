-- CreateEnum
CREATE TYPE "ApprovalStage" AS ENUM ('HOD', 'CREDIT_REVIEW', 'INTERNAL_CONTROL', 'MD', 'WITHDRAWAL');

-- CreateEnum
CREATE TYPE "ApprovalDecision" AS ENUM ('APPROVE', 'QUERY', 'DECLINE', 'REJECT', 'RESOLVE', 'WITHDRAW');

-- AlterTable
ALTER TABLE "loan_applications" ADD COLUMN     "kycConfirmed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "kycConfirmedAt" TIMESTAMP(3),
ADD COLUMN     "kycConfirmedById" TEXT;

-- CreateTable
CREATE TABLE "approvals" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "stage" "ApprovalStage",
    "decision" "ApprovalDecision" NOT NULL,
    "actorId" TEXT NOT NULL,
    "comment" TEXT,
    "resultingStatus" "ApplicationStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comments" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comments_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "loan_applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "loan_applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
