/*
  Warnings:

  - You are about to drop the column `priorityBoost` on the `Membership` table. All the data in the column will be lost.
  - You are about to drop the column `priorityBoost` on the `MembershipPlan` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Membership" DROP COLUMN "priorityBoost",
ADD COLUMN     "priorityFanoutBonus" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "MembershipPlan" DROP COLUMN "priorityBoost",
ADD COLUMN     "priorityFanoutBonus" INTEGER NOT NULL DEFAULT 0;
