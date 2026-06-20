-- CreateEnum
CREATE TYPE "TargetMode" AS ENUM ('SNIPE', 'WATCH');

-- AlterEnum
ALTER TYPE "TargetStatus" ADD VALUE 'WATCHING';

-- AlterTable
ALTER TABLE "ReservationTarget" ADD COLUMN     "mode" "TargetMode" NOT NULL DEFAULT 'SNIPE';
