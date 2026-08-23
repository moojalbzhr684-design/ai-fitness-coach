import {
  EquipmentType as EQ,
  ExerciseType as ET,
  ExperienceLevel as XL,
  MovementPattern as MP,
  MuscleGroup as MG,
  type PrismaClient,
} from "../src/generated/prisma/client.js";

interface ExerciseSeed {
  name: string;
  slug: string;
  primaryMuscle: MG;
  secondaryMuscles: MG[];
  exerciseType: ET;
  equipment: EQ;
  movementPattern: MP;
  difficulty: XL;
  instructions?: string;
}

const exercise = (
  name: string,
  slug: string,
  primaryMuscle: MG,
  exerciseType: ET,
  equipment: EQ,
  movementPattern: MP,
  difficulty: XL = XL.BEGINNER,
  secondaryMuscles: MG[] = [],
): ExerciseSeed => ({
  name,
  slug,
  primaryMuscle,
  secondaryMuscles,
  exerciseType,
  equipment,
  movementPattern,
  difficulty,
});

export const exerciseSeeds: ExerciseSeed[] = [
  exercise("Barbell Bench Press", "barbell-bench-press", MG.CHEST, ET.COMPOUND, EQ.BARBELL, MP.HORIZONTAL_PUSH, XL.INTERMEDIATE, [MG.TRICEPS, MG.SHOULDERS]),
  exercise("Dumbbell Bench Press", "dumbbell-bench-press", MG.CHEST, ET.COMPOUND, EQ.DUMBBELL, MP.HORIZONTAL_PUSH, XL.BEGINNER, [MG.TRICEPS, MG.SHOULDERS]),
  exercise("Incline Dumbbell Press", "incline-dumbbell-press", MG.CHEST, ET.COMPOUND, EQ.DUMBBELL, MP.HORIZONTAL_PUSH, XL.BEGINNER, [MG.SHOULDERS, MG.TRICEPS]),
  exercise("Machine Chest Press", "machine-chest-press", MG.CHEST, ET.COMPOUND, EQ.MACHINE, MP.HORIZONTAL_PUSH, XL.BEGINNER, [MG.TRICEPS, MG.SHOULDERS]),
  exercise("Cable Fly", "cable-fly", MG.CHEST, ET.ISOLATION, EQ.CABLE, MP.HORIZONTAL_PUSH),
  exercise("Pec Deck", "pec-deck", MG.CHEST, ET.ISOLATION, EQ.MACHINE, MP.HORIZONTAL_PUSH),
  exercise("Push-Up", "push-up", MG.CHEST, ET.COMPOUND, EQ.BODYWEIGHT, MP.HORIZONTAL_PUSH, XL.BEGINNER, [MG.TRICEPS, MG.SHOULDERS]),
  exercise("Dumbbell Floor Press", "dumbbell-floor-press", MG.CHEST, ET.COMPOUND, EQ.DUMBBELL, MP.HORIZONTAL_PUSH, XL.BEGINNER, [MG.TRICEPS]),

  exercise("Lat Pulldown", "lat-pulldown", MG.BACK, ET.COMPOUND, EQ.CABLE, MP.VERTICAL_PULL, XL.BEGINNER, [MG.BICEPS]),
  exercise("Pull-Up", "pull-up", MG.BACK, ET.COMPOUND, EQ.BODYWEIGHT, MP.VERTICAL_PULL, XL.INTERMEDIATE, [MG.BICEPS]),
  exercise("Assisted Pull-Up", "assisted-pull-up", MG.BACK, ET.COMPOUND, EQ.MACHINE, MP.VERTICAL_PULL, XL.BEGINNER, [MG.BICEPS]),
  exercise("Seated Cable Row", "seated-cable-row", MG.BACK, ET.COMPOUND, EQ.CABLE, MP.HORIZONTAL_PULL, XL.BEGINNER, [MG.BICEPS]),
  exercise("Chest Supported Row", "chest-supported-row", MG.BACK, ET.COMPOUND, EQ.MACHINE, MP.HORIZONTAL_PULL, XL.BEGINNER, [MG.BICEPS]),
  exercise("One Arm Dumbbell Row", "one-arm-dumbbell-row", MG.BACK, ET.COMPOUND, EQ.DUMBBELL, MP.HORIZONTAL_PULL, XL.BEGINNER, [MG.BICEPS]),
  exercise("Barbell Row", "barbell-row", MG.BACK, ET.COMPOUND, EQ.BARBELL, MP.HORIZONTAL_PULL, XL.INTERMEDIATE, [MG.BICEPS, MG.HAMSTRINGS]),

  exercise("Dumbbell Shoulder Press", "dumbbell-shoulder-press", MG.SHOULDERS, ET.COMPOUND, EQ.DUMBBELL, MP.VERTICAL_PUSH, XL.BEGINNER, [MG.TRICEPS]),
  exercise("Machine Shoulder Press", "machine-shoulder-press", MG.SHOULDERS, ET.COMPOUND, EQ.MACHINE, MP.VERTICAL_PUSH, XL.BEGINNER, [MG.TRICEPS]),
  exercise("Cable Lateral Raise", "cable-lateral-raise", MG.SHOULDERS, ET.ISOLATION, EQ.CABLE, MP.SHOULDER_ABDUCTION),
  exercise("Dumbbell Lateral Raise", "dumbbell-lateral-raise", MG.SHOULDERS, ET.ISOLATION, EQ.DUMBBELL, MP.SHOULDER_ABDUCTION),
  exercise("Reverse Pec Deck", "reverse-pec-deck", MG.SHOULDERS, ET.ISOLATION, EQ.MACHINE, MP.HORIZONTAL_PULL, XL.BEGINNER, [MG.BACK]),
  exercise("Face Pull", "face-pull", MG.SHOULDERS, ET.ISOLATION, EQ.CABLE, MP.HORIZONTAL_PULL, XL.BEGINNER, [MG.BACK]),

  exercise("Dumbbell Curl", "dumbbell-curl", MG.BICEPS, ET.ISOLATION, EQ.DUMBBELL, MP.ELBOW_FLEXION),
  exercise("EZ Bar Curl", "ez-bar-curl", MG.BICEPS, ET.ISOLATION, EQ.EZ_BAR, MP.ELBOW_FLEXION),
  exercise("Cable Curl", "cable-curl", MG.BICEPS, ET.ISOLATION, EQ.CABLE, MP.ELBOW_FLEXION),
  exercise("Hammer Curl", "hammer-curl", MG.BICEPS, ET.ISOLATION, EQ.DUMBBELL, MP.ELBOW_FLEXION, XL.BEGINNER, [MG.FOREARMS]),

  exercise("Cable Pushdown", "cable-pushdown", MG.TRICEPS, ET.ISOLATION, EQ.CABLE, MP.ELBOW_EXTENSION),
  exercise("Overhead Cable Extension", "overhead-cable-extension", MG.TRICEPS, ET.ISOLATION, EQ.CABLE, MP.ELBOW_EXTENSION),
  exercise("Skull Crusher", "skull-crusher", MG.TRICEPS, ET.ISOLATION, EQ.EZ_BAR, MP.ELBOW_EXTENSION, XL.INTERMEDIATE),

  exercise("Back Squat", "back-squat", MG.QUADS, ET.COMPOUND, EQ.BARBELL, MP.SQUAT, XL.INTERMEDIATE, [MG.GLUTES, MG.HAMSTRINGS]),
  exercise("Leg Press", "leg-press", MG.QUADS, ET.COMPOUND, EQ.MACHINE, MP.SQUAT, XL.BEGINNER, [MG.GLUTES]),
  exercise("Hack Squat", "hack-squat", MG.QUADS, ET.COMPOUND, EQ.MACHINE, MP.SQUAT, XL.BEGINNER, [MG.GLUTES]),
  exercise("Leg Extension", "leg-extension", MG.QUADS, ET.ISOLATION, EQ.MACHINE, MP.OTHER),
  exercise("Bulgarian Split Squat", "bulgarian-split-squat", MG.QUADS, ET.COMPOUND, EQ.DUMBBELL, MP.LUNGE, XL.INTERMEDIATE, [MG.GLUTES]),
  exercise("Goblet Squat", "goblet-squat", MG.QUADS, ET.COMPOUND, EQ.DUMBBELL, MP.SQUAT, XL.BEGINNER, [MG.GLUTES]),
  exercise("Bodyweight Squat", "bodyweight-squat", MG.QUADS, ET.COMPOUND, EQ.BODYWEIGHT, MP.SQUAT, XL.BEGINNER, [MG.GLUTES]),
  exercise("Smith Machine Squat", "smith-machine-squat", MG.QUADS, ET.COMPOUND, EQ.SMITH_MACHINE, MP.SQUAT, XL.BEGINNER, [MG.GLUTES]),

  exercise("Romanian Deadlift", "romanian-deadlift", MG.HAMSTRINGS, ET.COMPOUND, EQ.BARBELL, MP.HINGE, XL.INTERMEDIATE, [MG.GLUTES, MG.BACK]),
  exercise("Dumbbell Romanian Deadlift", "dumbbell-romanian-deadlift", MG.HAMSTRINGS, ET.COMPOUND, EQ.DUMBBELL, MP.HINGE, XL.BEGINNER, [MG.GLUTES]),
  exercise("Seated Leg Curl", "seated-leg-curl", MG.HAMSTRINGS, ET.ISOLATION, EQ.MACHINE, MP.OTHER),
  exercise("Lying Leg Curl", "lying-leg-curl", MG.HAMSTRINGS, ET.ISOLATION, EQ.MACHINE, MP.OTHER),
  exercise("Hip Thrust", "hip-thrust", MG.GLUTES, ET.COMPOUND, EQ.BARBELL, MP.HINGE, XL.BEGINNER, [MG.HAMSTRINGS]),
  exercise("Glute Bridge", "glute-bridge", MG.GLUTES, ET.COMPOUND, EQ.BODYWEIGHT, MP.HINGE, XL.BEGINNER, [MG.HAMSTRINGS]),
  exercise("Cable Pull Through", "cable-pull-through", MG.GLUTES, ET.COMPOUND, EQ.CABLE, MP.HINGE, XL.BEGINNER, [MG.HAMSTRINGS]),

  exercise("Standing Calf Raise", "standing-calf-raise", MG.CALVES, ET.ISOLATION, EQ.MACHINE, MP.CALF_RAISE),
  exercise("Seated Calf Raise", "seated-calf-raise", MG.CALVES, ET.ISOLATION, EQ.MACHINE, MP.CALF_RAISE),
  exercise("Single Leg Calf Raise", "single-leg-calf-raise", MG.CALVES, ET.ISOLATION, EQ.BODYWEIGHT, MP.CALF_RAISE),

  exercise("Cable Crunch", "cable-crunch", MG.ABS, ET.ISOLATION, EQ.CABLE, MP.CORE),
  exercise("Hanging Knee Raise", "hanging-knee-raise", MG.ABS, ET.COMPOUND, EQ.BODYWEIGHT, MP.CORE, XL.BEGINNER, [MG.FOREARMS]),
  exercise("Plank", "plank", MG.ABS, ET.COMPOUND, EQ.BODYWEIGHT, MP.CORE),
  exercise("Dead Bug", "dead-bug", MG.ABS, ET.COMPOUND, EQ.BODYWEIGHT, MP.CORE),

  exercise("Farmer Carry", "farmer-carry", MG.FOREARMS, ET.COMPOUND, EQ.DUMBBELL, MP.OTHER, XL.BEGINNER, [MG.FULL_BODY]),
  exercise("Kettlebell Deadlift", "kettlebell-deadlift", MG.GLUTES, ET.COMPOUND, EQ.KETTLEBELL, MP.HINGE, XL.BEGINNER, [MG.HAMSTRINGS]),
];

interface SubstitutionSeed {
  exercise: string;
  substitute: string;
  priority: number;
  reason: string;
}

export const substitutionSeeds: SubstitutionSeed[] = [
  { exercise: "barbell-bench-press", substitute: "dumbbell-bench-press", priority: 1, reason: "Same push pattern with dumbbells" },
  { exercise: "barbell-bench-press", substitute: "machine-chest-press", priority: 2, reason: "Stable chest press alternative" },
  { exercise: "dumbbell-bench-press", substitute: "machine-chest-press", priority: 1, reason: "Stable chest press alternative" },
  { exercise: "lat-pulldown", substitute: "assisted-pull-up", priority: 1, reason: "Similar vertical pull" },
  { exercise: "lat-pulldown", substitute: "pull-up", priority: 2, reason: "Bodyweight vertical pull" },
  { exercise: "pull-up", substitute: "lat-pulldown", priority: 1, reason: "Adjustable vertical pull" },
  { exercise: "pull-up", substitute: "assisted-pull-up", priority: 2, reason: "Assisted vertical pull" },
  { exercise: "back-squat", substitute: "hack-squat", priority: 1, reason: "Stable squat pattern" },
  { exercise: "back-squat", substitute: "leg-press", priority: 2, reason: "Machine quad compound" },
  { exercise: "hack-squat", substitute: "leg-press", priority: 1, reason: "Machine quad compound" },
  { exercise: "romanian-deadlift", substitute: "dumbbell-romanian-deadlift", priority: 1, reason: "Same hinge with dumbbells" },
  { exercise: "romanian-deadlift", substitute: "seated-leg-curl", priority: 2, reason: "Stable hamstring alternative" },
  { exercise: "seated-cable-row", substitute: "chest-supported-row", priority: 1, reason: "Stable horizontal pull" },
  { exercise: "seated-cable-row", substitute: "one-arm-dumbbell-row", priority: 2, reason: "Dumbbell horizontal pull" },
  { exercise: "machine-shoulder-press", substitute: "dumbbell-shoulder-press", priority: 1, reason: "Same vertical push" },
  { exercise: "cable-lateral-raise", substitute: "dumbbell-lateral-raise", priority: 1, reason: "Same shoulder isolation" },
  { exercise: "seated-leg-curl", substitute: "lying-leg-curl", priority: 1, reason: "Same hamstring isolation" },
  { exercise: "hip-thrust", substitute: "glute-bridge", priority: 1, reason: "Similar glute-dominant hinge" },
  { exercise: "standing-calf-raise", substitute: "seated-calf-raise", priority: 1, reason: "Calf raise alternative" },
  { exercise: "cable-crunch", substitute: "plank", priority: 1, reason: "Bodyweight core alternative" },
];

export async function seedExercises(prisma: PrismaClient): Promise<{
  exerciseCount: number;
  substitutionCount: number;
}> {
  const ids = new Map<string, string>();
  for (const item of exerciseSeeds) {
    const saved = await prisma.exercise.upsert({
      where: { slug: item.slug },
      update: { ...item, isActive: true },
      create: item,
      select: { id: true },
    });
    ids.set(item.slug, saved.id);
  }

  for (const item of substitutionSeeds) {
    const exerciseId = ids.get(item.exercise);
    const substituteExerciseId = ids.get(item.substitute);
    if (!exerciseId || !substituteExerciseId) {
      throw new Error(`Missing substitution exercise: ${item.exercise} -> ${item.substitute}`);
    }
    await prisma.exerciseSubstitution.upsert({
      where: { exerciseId_substituteExerciseId: { exerciseId, substituteExerciseId } },
      update: { priority: item.priority, reason: item.reason },
      create: { exerciseId, substituteExerciseId, priority: item.priority, reason: item.reason },
    });
  }

  return { exerciseCount: exerciseSeeds.length, substitutionCount: substitutionSeeds.length };
}
