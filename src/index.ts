import { createApiServer } from "./api/server.js";
import { createTelegramBot } from "./bot/bot.js";
import { env } from "./config/env.js";
import { prisma } from "./lib/prisma.js";
import { safeErrorMessage } from "./utils/text.js";

const server = createApiServer();
const bot = createTelegramBot();
let shuttingDown = false;

async function shutdown(signal: string, exitCode = 0): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Received ${signal}; shutting down.`);

  try {
    if (bot.isRunning()) {
      await bot.stop();
    }
    await server.close();
    await prisma.$disconnect();
  } catch (error) {
    console.error(
      "Shutdown error:",
      safeErrorMessage(error, [env.TELEGRAM_BOT_TOKEN, env.DATABASE_URL]),
    );
    exitCode = 1;
  }

  process.exitCode = exitCode;
}

async function main(): Promise<void> {
  await prisma.$connect();
  await server.listen({ host: "0.0.0.0", port: env.PORT });

  void bot.start({
    onStart: ({ username }) => {
      console.log(`Telegram bot @${username} started.`);
    },
  }).catch(async (error: unknown) => {
    console.error(
      "Telegram bot stopped unexpectedly:",
      safeErrorMessage(error, [env.TELEGRAM_BOT_TOKEN, env.DATABASE_URL]),
    );
    await shutdown("bot failure", 1);
  });
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

main().catch(async (error: unknown) => {
  console.error(
    "Application startup failed:",
    safeErrorMessage(error, [env.TELEGRAM_BOT_TOKEN, env.DATABASE_URL]),
  );
  await shutdown("startup failure", 1);
});
