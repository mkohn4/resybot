-- Rename lastName -> encryptedLastName, phone -> encryptedPhone
-- Existing plaintext values are overwritten with '' — users will need to reconnect OT once.
ALTER TABLE "OTGuestProfile"
  RENAME COLUMN "lastName" TO "encryptedLastName";

ALTER TABLE "OTGuestProfile"
  RENAME COLUMN "phone" TO "encryptedPhone";

-- Clear existing plaintext values so decrypt() doesn't crash on stale data
UPDATE "OTGuestProfile" SET "encryptedLastName" = '', "encryptedPhone" = '';
