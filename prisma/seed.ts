import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { seedExercises } from "./exercise-seed.js";
import { seedFoods } from "./food-seed.js";

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
  const workoutSeed = await seedExercises(prisma);
  console.log(
    `Seeded ${workoutSeed.exerciseCount} exercises and ${workoutSeed.substitutionCount} substitutions.`,
  );
  const foodSeed = await seedFoods(prisma);
  console.log(
    `Seeded ${foodSeed.foodCount} foods (${foodSeed.iraqiCommonCount} Iraqi/common) and ${foodSeed.substitutionCount} food substitutions.`,
  );
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
