-- Add bearer token columns with empty defaults so existing rows don't block.
-- The existing row has no bearer token yet; user will reconnect via the updated UI.
ALTER TABLE "OTGuestProfile"
ADD COLUMN "customerId" TEXT NOT NULL DEFAULT '',
ADD COLUMN "encryptedBearerToken" TEXT NOT NULL DEFAULT '',
ADD COLUMN "gpid" TEXT NOT NULL DEFAULT '';
