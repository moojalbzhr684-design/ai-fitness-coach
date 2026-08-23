import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required to seed the database.");
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main(): Promise<void> {
  const gym = await prisma.gym.upsert({
    where: { slug: "development-gym" },
    update: {
      name: "Development Gym",
      joinCode: "DEVGYM",
      aiName: "Dev Coach",
      primaryColor: "#111111",
      isActive: true,
    },
    create: {
      name: "Development Gym",
      slug: "development-gym",
      joinCode: "DEVGYM",
      aiName: "Dev Coach",
      primaryColor: "#111111",
    },
  });

  console.log(`Seeded gym: ${gym.name} (${gym.joinCode})`);
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
