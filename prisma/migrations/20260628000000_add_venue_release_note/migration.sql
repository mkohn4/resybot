-- Community-curated reservation-release notes (idempotent; safe to apply directly to prod)
CREATE TABLE IF NOT EXISTS "VenueReleaseNote" (
    "id" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "displayName" TEXT NOT NULL,
    "releaseTime" TEXT,
    "daysOut" INTEGER,
    "notes" TEXT NOT NULL,
    "updatedById" TEXT,
    "updatedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VenueReleaseNote_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "VenueReleaseNote_nameKey_platform_key" ON "VenueReleaseNote"("nameKey", "platform");
