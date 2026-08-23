import { TrainingPlace, WorkoutSplit } from "../generated/prisma/client.js";
import type { DayTemplate } from "./types.js";

const gymTemplates: Record<WorkoutSplit, DayTemplate[]> = {
  [WorkoutSplit.FULL_BODY]: [
    {
      name: "Full Body A",
      exercises: [
        { slug: "leg-press", alternatives: ["goblet-squat", "back-squat"] },
        { slug: "machine-chest-press", alternatives: ["dumbbell-bench-press", "push-up"] },
        { slug: "lat-pulldown", alternatives: ["assisted-pull-up", "pull-up"] },
        { slug: "seated-leg-curl", alternatives: ["lying-leg-curl"] },
        { slug: "dumbbell-lateral-raise", alternatives: ["cable-lateral-raise"] },
        { slug: "cable-crunch", alternatives: ["plank"] },
        { slug: "standing-calf-raise", alternatives: ["seated-calf-raise"] },
      ],
    },
    {
      name: "Full Body B",
      exercises: [
        { slug: "hack-squat", alternatives: ["leg-press", "goblet-squat"] },
        { slug: "incline-dumbbell-press", alternatives: ["machine-chest-press"] },
        { slug: "seated-cable-row", alternatives: ["chest-supported-row"] },
        { slug: "hip-thrust", alternatives: ["glute-bridge"] },
        { slug: "machine-shoulder-press", alternatives: ["dumbbell-shoulder-press"] },
        { slug: "plank", alternatives: ["cable-crunch"] },
        { slug: "cable-pushdown", alternatives: ["overhead-cable-extension"] },
      ],
    },
    {
      name: "Full Body C",
      exercises: [
        { slug: "bulgarian-split-squat", alternatives: ["leg-press"] },
        { slug: "dumbbell-bench-press", alternatives: ["machine-chest-press"] },
        { slug: "chest-supported-row", alternatives: ["seated-cable-row"] },
        { slug: "romanian-deadlift", alternatives: ["seated-leg-curl"] },
        { slug: "face-pull", alternatives: ["reverse-pec-deck"] },
        { slug: "dumbbell-curl", alternatives: ["cable-curl"] },
        { slug: "hanging-knee-raise", alternatives: ["plank"] },
      ],
    },
  ],
  [WorkoutSplit.UPPER_LOWER]: [
    {
      name: "Upper A",
      exercises: [
        { slug: "barbell-bench-press", alternatives: ["dumbbell-bench-press", "machine-chest-press"] },
        { slug: "lat-pulldown", alternatives: ["assisted-pull-up", "pull-up"] },
        { slug: "machine-shoulder-press", alternatives: ["dumbbell-shoulder-press"] },
        { slug: "seated-cable-row", alternatives: ["chest-supported-row"] },
        { slug: "dumbbell-lateral-raise", alternatives: ["cable-lateral-raise"] },
        { slug: "cable-pushdown", alternatives: ["overhead-cable-extension"] },
        { slug: "dumbbell-curl", alternatives: ["cable-curl"] },
        { slug: "face-pull", alternatives: ["reverse-pec-deck"] },
      ],
    },
    {
      name: "Lower A",
      exercises: [
        { slug: "back-squat", alternatives: ["hack-squat", "leg-press"] },
        { slug: "romanian-deadlift", alternatives: ["seated-leg-curl"] },
        { slug: "leg-press", alternatives: ["hack-squat"] },
        { slug: "seated-leg-curl", alternatives: ["lying-leg-curl"] },
        { slug: "standing-calf-raise", alternatives: ["seated-calf-raise"] },
        { slug: "cable-crunch", alternatives: ["plank"] },
        { slug: "leg-extension" },
      ],
    },
    {
      name: "Upper B",
      exercises: [
        { slug: "incline-dumbbell-press", alternatives: ["machine-chest-press"] },
        { slug: "chest-supported-row", alternatives: ["seated-cable-row"] },
        { slug: "dumbbell-shoulder-press", alternatives: ["machine-shoulder-press"] },
        { slug: "assisted-pull-up", alternatives: ["lat-pulldown", "pull-up"] },
        { slug: "cable-fly", alternatives: ["pec-deck"] },
        { slug: "ez-bar-curl", alternatives: ["cable-curl"] },
        { slug: "overhead-cable-extension", alternatives: ["cable-pushdown"] },
        { slug: "reverse-pec-deck", alternatives: ["face-pull"] },
      ],
    },
    {
      name: "Lower B",
      exercises: [
        { slug: "hack-squat", alternatives: ["leg-press", "back-squat"] },
        { slug: "hip-thrust", alternatives: ["glute-bridge"] },
        { slug: "bulgarian-split-squat", alternatives: ["leg-press"] },
        { slug: "lying-leg-curl", alternatives: ["seated-leg-curl"] },
        { slug: "seated-calf-raise", alternatives: ["standing-calf-raise"] },
        { slug: "hanging-knee-raise", alternatives: ["plank"] },
        { slug: "leg-extension" },
      ],
    },
    {
      name: "Upper Focus",
      exercises: [
        { slug: "machine-chest-press", alternatives: ["dumbbell-bench-press"] },
        { slug: "lat-pulldown", alternatives: ["assisted-pull-up"] },
        { slug: "cable-lateral-raise", alternatives: ["dumbbell-lateral-raise"] },
        { slug: "face-pull", alternatives: ["reverse-pec-deck"] },
        { slug: "hammer-curl", alternatives: ["dumbbell-curl"] },
        { slug: "cable-pushdown", alternatives: ["overhead-cable-extension"] },
        { slug: "cable-crunch", alternatives: ["plank"] },
      ],
    },
    {
      name: "Lower Focus",
      exercises: [
        { slug: "leg-press", alternatives: ["hack-squat"] },
        { slug: "romanian-deadlift", alternatives: ["seated-leg-curl"] },
        { slug: "leg-extension" },
        { slug: "seated-leg-curl", alternatives: ["lying-leg-curl"] },
        { slug: "standing-calf-raise", alternatives: ["seated-calf-raise"] },
        { slug: "plank", alternatives: ["cable-crunch"] },
      ],
    },
  ],
  [WorkoutSplit.PUSH_PULL_LEGS]: [
    {
      name: "Push A",
      exercises: [
        { slug: "barbell-bench-press", alternatives: ["dumbbell-bench-press"] },
        { slug: "incline-dumbbell-press", alternatives: ["machine-chest-press"] },
        { slug: "dumbbell-shoulder-press", alternatives: ["machine-shoulder-press"] },
        { slug: "cable-lateral-raise", alternatives: ["dumbbell-lateral-raise"] },
        { slug: "cable-pushdown", alternatives: ["overhead-cable-extension"] },
        { slug: "cable-fly", alternatives: ["pec-deck"] },
      ],
    },
    {
      name: "Pull A",
      exercises: [
        { slug: "pull-up", alternatives: ["lat-pulldown", "assisted-pull-up"] },
        { slug: "barbell-row", alternatives: ["chest-supported-row"] },
        { slug: "seated-cable-row", alternatives: ["one-arm-dumbbell-row"] },
        { slug: "reverse-pec-deck", alternatives: ["face-pull"] },
        { slug: "ez-bar-curl", alternatives: ["dumbbell-curl"] },
        { slug: "hammer-curl", alternatives: ["cable-curl"] },
      ],
    },
    {
      name: "Legs A",
      exercises: [
        { slug: "back-squat", alternatives: ["hack-squat", "leg-press"] },
        { slug: "romanian-deadlift", alternatives: ["seated-leg-curl"] },
        { slug: "leg-press", alternatives: ["hack-squat"] },
        { slug: "seated-leg-curl", alternatives: ["lying-leg-curl"] },
        { slug: "standing-calf-raise", alternatives: ["seated-calf-raise"] },
        { slug: "cable-crunch", alternatives: ["plank"] },
      ],
    },
    {
      name: "Push B",
      exercises: [
        { slug: "machine-chest-press", alternatives: ["dumbbell-bench-press"] },
        { slug: "machine-shoulder-press", alternatives: ["dumbbell-shoulder-press"] },
        { slug: "cable-fly", alternatives: ["pec-deck"] },
        { slug: "dumbbell-lateral-raise", alternatives: ["cable-lateral-raise"] },
        { slug: "overhead-cable-extension", alternatives: ["cable-pushdown"] },
        { slug: "skull-crusher", alternatives: ["cable-pushdown"] },
      ],
    },
    {
      name: "Pull B",
      exercises: [
        { slug: "lat-pulldown", alternatives: ["assisted-pull-up"] },
        { slug: "chest-supported-row", alternatives: ["seated-cable-row"] },
        { slug: "one-arm-dumbbell-row", alternatives: ["barbell-row"] },
        { slug: "face-pull", alternatives: ["reverse-pec-deck"] },
        { slug: "dumbbell-curl", alternatives: ["cable-curl"] },
        { slug: "cable-curl", alternatives: ["hammer-curl"] },
      ],
    },
    {
      name: "Legs B",
      exercises: [
        { slug: "hack-squat", alternatives: ["leg-press", "back-squat"] },
        { slug: "hip-thrust", alternatives: ["glute-bridge"] },
        { slug: "bulgarian-split-squat", alternatives: ["leg-press"] },
        { slug: "lying-leg-curl", alternatives: ["seated-leg-curl"] },
        { slug: "leg-extension" },
        { slug: "seated-calf-raise", alternatives: ["standing-calf-raise"] },
        { slug: "hanging-knee-raise", alternatives: ["plank"] },
      ],
    },
  ],
  [WorkoutSplit.CUSTOM]: [],
};

const homeFullBody: DayTemplate[] = [
  {
    name: "Full Body A",
    exercises: [
      { slug: "goblet-squat", alternatives: ["bodyweight-squat"] },
      { slug: "push-up", alternatives: ["dumbbell-floor-press"] },
      { slug: "one-arm-dumbbell-row" },
      { slug: "dumbbell-romanian-deadlift", alternatives: ["glute-bridge"] },
      { slug: "dumbbell-lateral-raise" },
      { slug: "plank" },
    ],
  },
  {
    name: "Full Body B",
    exercises: [
      { slug: "bulgarian-split-squat", alternatives: ["bodyweight-squat"] },
      { slug: "dumbbell-floor-press", alternatives: ["push-up"] },
      { slug: "one-arm-dumbbell-row" },
      { slug: "glute-bridge", alternatives: ["dumbbell-romanian-deadlift"] },
      { slug: "dumbbell-shoulder-press" },
      { slug: "hanging-knee-raise", alternatives: ["plank"] },
    ],
  },
  {
    name: "Full Body C",
    exercises: [
      { slug: "goblet-squat", alternatives: ["bodyweight-squat"] },
      { slug: "push-up", alternatives: ["dumbbell-floor-press"] },
      { slug: "one-arm-dumbbell-row" },
      { slug: "dumbbell-romanian-deadlift", alternatives: ["glute-bridge"] },
      { slug: "hammer-curl" },
      { slug: "plank" },
    ],
  },
];

const homeUpperLower: DayTemplate[] = [
  {
    name: "Upper A",
    exercises: [
      { slug: "dumbbell-floor-press", alternatives: ["push-up"] },
      { slug: "one-arm-dumbbell-row" },
      { slug: "dumbbell-shoulder-press" },
      { slug: "push-up", alternatives: ["dumbbell-floor-press"] },
      { slug: "dumbbell-lateral-raise" },
      { slug: "dumbbell-curl", alternatives: ["hammer-curl"] },
    ],
  },
  {
    name: "Lower A",
    exercises: [
      { slug: "goblet-squat", alternatives: ["bodyweight-squat"] },
      { slug: "dumbbell-romanian-deadlift", alternatives: ["glute-bridge"] },
      { slug: "bulgarian-split-squat", alternatives: ["bodyweight-squat"] },
      { slug: "glute-bridge" },
      { slug: "single-leg-calf-raise" },
      { slug: "plank" },
    ],
  },
  {
    name: "Upper B",
    exercises: [
      { slug: "push-up", alternatives: ["dumbbell-floor-press"] },
      { slug: "one-arm-dumbbell-row" },
      { slug: "dumbbell-shoulder-press" },
      { slug: "dumbbell-floor-press", alternatives: ["push-up"] },
      { slug: "hammer-curl", alternatives: ["dumbbell-curl"] },
      { slug: "farmer-carry" },
    ],
  },
  {
    name: "Lower B",
    exercises: [
      { slug: "bulgarian-split-squat", alternatives: ["bodyweight-squat"] },
      { slug: "glute-bridge", alternatives: ["dumbbell-romanian-deadlift"] },
      { slug: "goblet-squat", alternatives: ["bodyweight-squat"] },
      { slug: "dumbbell-romanian-deadlift" },
      { slug: "single-leg-calf-raise" },
      { slug: "dead-bug", alternatives: ["plank"] },
    ],
  },
  {
    name: "Upper Focus",
    exercises: [
      { slug: "dumbbell-floor-press", alternatives: ["push-up"] },
      { slug: "one-arm-dumbbell-row" },
      { slug: "dumbbell-lateral-raise" },
      { slug: "dumbbell-curl", alternatives: ["hammer-curl"] },
      { slug: "farmer-carry" },
      { slug: "plank" },
    ],
  },
  {
    name: "Lower Focus",
    exercises: [
      { slug: "goblet-squat", alternatives: ["bodyweight-squat"] },
      { slug: "dumbbell-romanian-deadlift", alternatives: ["glute-bridge"] },
      { slug: "bulgarian-split-squat", alternatives: ["bodyweight-squat"] },
      { slug: "glute-bridge" },
      { slug: "single-leg-calf-raise" },
      { slug: "hanging-knee-raise", alternatives: ["dead-bug"] },
    ],
  },
];

const homePushPullLegs: DayTemplate[] = [
  { name: "Push A", exercises: homeUpperLower[0]!.exercises },
  {
    name: "Pull A",
    exercises: [
      { slug: "one-arm-dumbbell-row" },
      { slug: "dumbbell-curl" },
      { slug: "hammer-curl" },
      { slug: "farmer-carry" },
      { slug: "dumbbell-romanian-deadlift" },
      { slug: "plank" },
    ],
  },
  { name: "Legs A", exercises: homeUpperLower[1]!.exercises },
  { name: "Push B", exercises: homeUpperLower[2]!.exercises },
  {
    name: "Pull B",
    exercises: [
      { slug: "one-arm-dumbbell-row" },
      { slug: "hammer-curl" },
      { slug: "dumbbell-curl" },
      { slug: "farmer-carry" },
      { slug: "dumbbell-romanian-deadlift" },
      { slug: "dead-bug" },
    ],
  },
  { name: "Legs B", exercises: homeUpperLower[3]!.exercises },
];

export function getDayTemplates(
  split: WorkoutSplit,
  place: TrainingPlace,
  dayCount: number,
): DayTemplate[] {
  if (place === TrainingPlace.HOME) {
    const templates = split === WorkoutSplit.FULL_BODY
      ? homeFullBody
      : split === WorkoutSplit.UPPER_LOWER
        ? homeUpperLower
        : homePushPullLegs;
    if (templates.length < dayCount) throw new Error(`No home ${split} template for ${dayCount} days`);
    return templates.slice(0, dayCount);
  }

  const templates = gymTemplates[split];
  if (templates.length < dayCount) {
    throw new Error(`No ${split} template for ${dayCount} days`);
  }
  return templates.slice(0, dayCount);
}
