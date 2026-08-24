-- Public beta Telegram-to-web authentication challenges.
-- Browser and Telegram capabilities are deliberately separate and only their hashes are stored.
CREATE TABLE "TelegramLoginChallenge" (
    "id" TEXT NOT NULL,
    "browserTokenHash" TEXT NOT NULL,
    "botTokenHash" TEXT NOT NULL,
    "requestIpHash" TEXT,
    "verifiedUserId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramLoginChallenge_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TelegramLoginChallenge_browserTokenHash_key" ON "TelegramLoginChallenge"("browserTokenHash");
CREATE UNIQUE INDEX "TelegramLoginChallenge_botTokenHash_key" ON "TelegramLoginChallenge"("botTokenHash");
CREATE INDEX "TelegramLoginChallenge_requestIpHash_createdAt_idx" ON "TelegramLoginChallenge"("requestIpHash", "createdAt");
CREATE INDEX "TelegramLoginChallenge_expiresAt_consumedAt_idx" ON "TelegramLoginChallenge"("expiresAt", "consumedAt");
CREATE INDEX "TelegramLoginChallenge_verifiedUserId_verifiedAt_idx" ON "TelegramLoginChallenge"("verifiedUserId", "verifiedAt");

ALTER TABLE "TelegramLoginChallenge"
ADD CONSTRAINT "TelegramLoginChallenge_verifiedUserId_fkey"
FOREIGN KEY ("verifiedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
