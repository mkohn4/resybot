-- Indexes for cron hot-path queries (applied to prod via direct SQL; idempotent)
CREATE INDEX IF NOT EXISTS "ReservationTarget_status_mode_snipeAt_idx" ON "ReservationTarget"("status", "mode", "snipeAt");
CREATE INDEX IF NOT EXISTS "ReservationTarget_status_mode_date_idx" ON "ReservationTarget"("status", "mode", "date");
CREATE INDEX IF NOT EXISTS "ReservationTarget_userId_idx" ON "ReservationTarget"("userId");
CREATE INDEX IF NOT EXISTS "SnipeAttempt_targetId_attemptAt_idx" ON "SnipeAttempt"("targetId", "attemptAt");
