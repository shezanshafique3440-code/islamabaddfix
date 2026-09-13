-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('PENDING_PAYMENT', 'ACTIVE', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MembershipBenefitKind" AS ENUM ('DISCOUNT', 'EMERGENCY_FEE_WAIVER', 'GUARANTEE_EXTENSION', 'PRIORITY_MATCH');

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "membershipDiscountPaisa" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "membershipId" UUID;

-- CreateTable
CREATE TABLE "MembershipPlan" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tagline" TEXT,
    "description" TEXT NOT NULL,
    "pricePaisa" INTEGER NOT NULL,
    "periodDays" INTEGER NOT NULL DEFAULT 365,
    "discountBp" INTEGER NOT NULL DEFAULT 0,
    "maxDiscountPaisa" INTEGER,
    "guaranteeBonusDays" INTEGER NOT NULL DEFAULT 0,
    "priorityBoost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "emergencyFeeWaiverPaisa" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MembershipPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "status" "MembershipStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "pricePaisa" INTEGER NOT NULL,
    "periodDays" INTEGER NOT NULL,
    "discountBp" INTEGER NOT NULL DEFAULT 0,
    "maxDiscountPaisa" INTEGER,
    "guaranteeBonusDays" INTEGER NOT NULL DEFAULT 0,
    "priorityBoost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "emergencyFeeWaiverPaisa" INTEGER NOT NULL DEFAULT 0,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MembershipPayment" (
    "id" UUID NOT NULL,
    "membershipId" UUID NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "amountPaisa" INTEGER NOT NULL,
    "refundedPaisa" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'PKR',
    "providerKey" TEXT,
    "externalRef" TEXT,
    "metadata" JSONB,
    "paidAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "recordedByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MembershipPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MembershipBenefit" (
    "id" UUID NOT NULL,
    "membershipId" UUID NOT NULL,
    "bookingId" UUID NOT NULL,
    "kind" "MembershipBenefitKind" NOT NULL,
    "amountPaisa" INTEGER NOT NULL DEFAULT 0,
    "days" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MembershipBenefit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MembershipPlan_code_key" ON "MembershipPlan"("code");

-- CreateIndex
CREATE INDEX "MembershipPlan_isActive_sortOrder_idx" ON "MembershipPlan"("isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_reference_key" ON "Membership"("reference");

-- CreateIndex
CREATE INDEX "Membership_userId_status_idx" ON "Membership"("userId", "status");

-- CreateIndex
CREATE INDEX "Membership_status_endsAt_idx" ON "Membership"("status", "endsAt");

-- CreateIndex
CREATE INDEX "MembershipPayment_membershipId_status_idx" ON "MembershipPayment"("membershipId", "status");

-- CreateIndex
CREATE INDEX "MembershipPayment_status_createdAt_idx" ON "MembershipPayment"("status", "createdAt");

-- CreateIndex
CREATE INDEX "MembershipBenefit_membershipId_createdAt_idx" ON "MembershipBenefit"("membershipId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MembershipBenefit_bookingId_kind_key" ON "MembershipBenefit"("bookingId", "kind");

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_planId_fkey" FOREIGN KEY ("planId") REFERENCES "MembershipPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipPayment" ADD CONSTRAINT "MembershipPayment_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipBenefit" ADD CONSTRAINT "MembershipBenefit_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembershipBenefit" ADD CONSTRAINT "MembershipBenefit_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;
