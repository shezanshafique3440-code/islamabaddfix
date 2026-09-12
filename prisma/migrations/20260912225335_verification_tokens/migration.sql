-- CreateEnum
CREATE TYPE "VerificationPurpose" AS ENUM ('PASSWORD_RESET', 'EMAIL_VERIFY', 'PHONE_VERIFY');

-- CreateTable
CREATE TABLE "VerificationToken" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "purpose" "VerificationPurpose" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "sentTo" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerificationToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VerificationToken_tokenHash_idx" ON "VerificationToken"("tokenHash");

-- CreateIndex
CREATE INDEX "VerificationToken_userId_purpose_consumedAt_idx" ON "VerificationToken"("userId", "purpose", "consumedAt");

-- CreateIndex
CREATE INDEX "VerificationToken_expiresAt_idx" ON "VerificationToken"("expiresAt");

-- AddForeignKey
ALTER TABLE "VerificationToken" ADD CONSTRAINT "VerificationToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Attempt counters only ever go up, and never below zero.
ALTER TABLE "VerificationToken"
  ADD CONSTRAINT "verification_attempts_nonneg" CHECK ("attempts" >= 0);

-- A secret that never expires is not a one-time secret.
ALTER TABLE "VerificationToken"
  ADD CONSTRAINT "verification_expires_after_creation" CHECK ("expiresAt" > "createdAt");
