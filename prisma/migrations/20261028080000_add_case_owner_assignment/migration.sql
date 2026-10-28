-- AlterTable
ALTER TABLE "loan_applications" ADD COLUMN     "ownerId" TEXT;

-- CreateTable
CREATE TABLE "case_assignments" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "assigneeId" TEXT NOT NULL,
    "assignedById" TEXT,
    "status" "ApplicationStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "case_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "case_assignments_applicationId_idx" ON "case_assignments"("applicationId");

-- CreateIndex
CREATE INDEX "case_assignments_assigneeId_idx" ON "case_assignments"("assigneeId");

-- CreateIndex
CREATE INDEX "loan_applications_ownerId_idx" ON "loan_applications"("ownerId");

-- AddForeignKey
ALTER TABLE "loan_applications" ADD CONSTRAINT "loan_applications_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_assignments" ADD CONSTRAINT "case_assignments_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "loan_applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_assignments" ADD CONSTRAINT "case_assignments_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_assignments" ADD CONSTRAINT "case_assignments_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
