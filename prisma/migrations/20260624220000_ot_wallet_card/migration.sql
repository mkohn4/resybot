-- Add encrypted Spreedly card token and last4 to OTGuestProfile
-- for CC-hold restaurant support. Defaults to '' — populated on next OT reconnect.
ALTER TABLE "OTGuestProfile"
  ADD COLUMN "encryptedCardToken" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "cardLast4" TEXT NOT NULL DEFAULT '';
