-- Milestone 9 evolves User into a platform identity while preserving telegramId.
ALTER TABLE "User" ALTER COLUMN "telegramId" DROP NOT NULL;

CREATE TYPE "IdentityProvider" AS ENUM ('TELEGRAM', 'EMAIL', 'PHONE', 'APPLE', 'GOOGLE');
CREATE TYPE "AuthChallengePurpose" AS ENUM ('LOGIN', 'LINK_IDENTITY');
CREATE TYPE "AgentMessageRole" AS ENUM ('USER', 'ASSISTANT');

CREATE TABLE "UserIdentity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "IdentityProvider" NOT NULL,
    "providerSubject" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    CONSTRAINT "UserIdentity_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuthChallenge" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "purpose" "AuthChallengePurpose" NOT NULL,
    "linkUserId" TEXT,
    "requestIpHash" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuthChallenge_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuthSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "csrfTokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AgentConversation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "gymId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AgentConversation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AgentMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" "AgentMessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AgentMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserIdentity_provider_providerSubject_key" ON "UserIdentity"("provider", "providerSubject");
CREATE INDEX "UserIdentity_userId_provider_idx" ON "UserIdentity"("userId", "provider");
CREATE INDEX "UserIdentity_email_idx" ON "UserIdentity"("email");
CREATE INDEX "AuthChallenge_email_purpose_createdAt_idx" ON "AuthChallenge"("email", "purpose", "createdAt");
CREATE INDEX "AuthChallenge_requestIpHash_createdAt_idx" ON "AuthChallenge"("requestIpHash", "createdAt");
CREATE INDEX "AuthChallenge_expiresAt_usedAt_idx" ON "AuthChallenge"("expiresAt", "usedAt");
CREATE UNIQUE INDEX "AuthSession_tokenHash_key" ON "AuthSession"("tokenHash");
CREATE INDEX "AuthSession_userId_revokedAt_expiresAt_idx" ON "AuthSession"("userId", "revokedAt", "expiresAt");
CREATE INDEX "AuthSession_expiresAt_idx" ON "AuthSession"("expiresAt");
CREATE INDEX "AgentConversation_userId_lastMessageAt_idx" ON "AgentConversation"("userId", "lastMessageAt");
CREATE INDEX "AgentConversation_gymId_lastMessageAt_idx" ON "AgentConversation"("gymId", "lastMessageAt");
CREATE INDEX "AgentMessage_conversationId_createdAt_idx" ON "AgentMessage"("conversationId", "createdAt");

ALTER TABLE "UserIdentity" ADD CONSTRAINT "UserIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuthChallenge" ADD CONSTRAINT "AuthChallenge_linkUserId_fkey" FOREIGN KEY ("linkUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentConversation" ADD CONSTRAINT "AgentConversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentConversation" ADD CONSTRAINT "AgentConversation_gymId_fkey" FOREIGN KEY ("gymId") REFERENCES "Gym"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AgentMessage" ADD CONSTRAINT "AgentMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AgentConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Idempotent repair/backfill for every existing Telegram-backed User.
INSERT INTO "UserIdentity" (
    "id", "userId", "provider", "providerSubject", "isVerified", "createdAt", "updatedAt", "lastUsedAt"
)
SELECT
    'tg_' || md5("id" || ':' || "telegramId"::text),
    "id",
    'TELEGRAM'::"IdentityProvider",
    "telegramId"::text,
    true,
    "createdAt",
    CURRENT_TIMESTAMP,
    "updatedAt"
FROM "User"
WHERE "telegramId" IS NOT NULL
ON CONFLICT ("provider", "providerSubject") DO NOTHING;
