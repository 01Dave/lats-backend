-- AlterEnum
ALTER TYPE "ApprovalStage" ADD VALUE 'FINANCE';

-- AlterEnum
ALTER TYPE "ApprovalDecision" ADD VALUE 'DISBURSE';

-- AlterTable
ALTER TABLE "loan_applications" ADD COLUMN     "disbursedAmount" DECIMAL(14,2),
ADD COLUMN     "disbursementDate" TIMESTAMP(3),
ADD COLUMN     "disbursementMethod" TEXT,
ADD COLUMN     "disbursementReference" TEXT,
ADD COLUMN     "disbursedById" TEXT,
ADD COLUMN     "disbursedAt" TIMESTAMP(3);
