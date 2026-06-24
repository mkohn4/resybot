-- CreateEnum
CREATE TYPE "Platform" AS ENUM ('RESY', 'OPENTABLE');

-- AlterTable
ALTER TABLE "ReservationTarget" ADD COLUMN     "platform" "Platform" NOT NULL DEFAULT 'RESY';

-- CreateTable
CREATE TABLE "OTGuestProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OTGuestProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OTGuestProfile_userId_key" ON "OTGuestProfile"("userId");

-- AddForeignKey
ALTER TABLE "OTGuestProfile" ADD CONSTRAINT "OTGuestProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
