-- CreateEnum
CREATE TYPE "RecurrenceFrequency" AS ENUM ('WEEKLY', 'FORTNIGHTLY', 'MONTHLY', 'QUARTERLY');

-- CreateEnum
CREATE TYPE "RecurringScheduleStatus" AS ENUM ('ACTIVE', 'PAUSED', 'ENDED');

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "recurringScheduleId" UUID;

-- CreateTable
CREATE TABLE "RecurringSchedule" (
    "id" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "customerId" UUID NOT NULL,
    "serviceId" UUID NOT NULL,
    "addressId" UUID NOT NULL,
    "providerId" UUID,
    "frequency" "RecurrenceFrequency" NOT NULL,
    "intervalCount" INTEGER NOT NULL DEFAULT 1,
    "timeOfDayMinutes" INTEGER NOT NULL,
    "dayOfWeek" INTEGER,
    "dayOfMonth" INTEGER,
    "problemDescription" TEXT NOT NULL,
    "customerNotes" TEXT,
    "status" "RecurringScheduleStatus" NOT NULL DEFAULT 'ACTIVE',
    "nextOccurrenceAt" TIMESTAMP(3) NOT NULL,
    "lastGeneratedAt" TIMESTAMP(3),
    "occurrencesCreated" INTEGER NOT NULL DEFAULT 0,
    "maxOccurrences" INTEGER,
    "endsAt" TIMESTAMP(3),
    "pausedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "endedReason" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecurringSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RecurringSchedule_reference_key" ON "RecurringSchedule"("reference");

-- CreateIndex
CREATE INDEX "RecurringSchedule_customerId_status_idx" ON "RecurringSchedule"("customerId", "status");

-- CreateIndex
CREATE INDEX "RecurringSchedule_status_nextOccurrenceAt_idx" ON "RecurringSchedule"("status", "nextOccurrenceAt");

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_recurringScheduleId_fkey" FOREIGN KEY ("recurringScheduleId") REFERENCES "RecurringSchedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringSchedule" ADD CONSTRAINT "RecurringSchedule_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringSchedule" ADD CONSTRAINT "RecurringSchedule_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringSchedule" ADD CONSTRAINT "RecurringSchedule_addressId_fkey" FOREIGN KEY ("addressId") REFERENCES "Address"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringSchedule" ADD CONSTRAINT "RecurringSchedule_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "ProviderProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
