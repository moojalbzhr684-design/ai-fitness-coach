export const MAX_CHECKIN_NOTES_LENGTH = 1_000;

function finiteInRange(value: number, minimum: number, maximum: number, label: string): void {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new RangeError(`${label} must be from ${minimum} to ${maximum}`);
  }
}

export function validateWeightKg(value: number): void {
  finiteInRange(value, 35, 300, "Weight");
}

export function validateWaistCm(value: number | null): void {
  if (value !== null) finiteInRange(value, 40, 200, "Waist");
}

export function validateNutritionAdherencePct(value: number): void {
  if (!Number.isInteger(value)) throw new RangeError("Nutrition adherence must be an integer");
  finiteInRange(value, 0, 100, "Nutrition adherence");
}

export function validateWorkoutsCompleted(value: number): void {
  if (!Number.isInteger(value)) throw new RangeError("Workouts completed must be an integer");
  finiteInRange(value, 0, 7, "Workouts completed");
}

export function validateAverageDailySteps(value: number | null): void {
  if (value !== null) {
    if (!Number.isInteger(value)) throw new RangeError("Steps must be an integer");
    finiteInRange(value, 0, 100_000, "Average daily steps");
  }
}

export function validateAverageSleepHours(value: number): void {
  finiteInRange(value, 0, 16, "Average sleep");
}

export function validateHungerRating(value: number): void {
  if (!Number.isInteger(value)) throw new RangeError("Hunger rating must be an integer");
  finiteInRange(value, 1, 10, "Hunger rating");
}

export function validateEnergyRating(value: number): void {
  if (!Number.isInteger(value)) throw new RangeError("Energy rating must be an integer");
  finiteInRange(value, 1, 10, "Energy rating");
}

export function validateNotes(value: string | null): void {
  if (value !== null && value.length > MAX_CHECKIN_NOTES_LENGTH) {
    throw new RangeError(`Notes cannot exceed ${MAX_CHECKIN_NOTES_LENGTH} characters`);
  }
}

export function validateCompletedCheckIn(input: {
  weightKg: number;
  waistCm: number | null;
  nutritionAdherencePct: number;
  workoutsCompleted: number;
  averageDailySteps: number | null;
  averageSleepHours: number;
  hungerRating: number;
  energyRating: number;
  notes: string | null;
}): void {
  validateWeightKg(input.weightKg);
  validateWaistCm(input.waistCm);
  validateNutritionAdherencePct(input.nutritionAdherencePct);
  validateWorkoutsCompleted(input.workoutsCompleted);
  validateAverageDailySteps(input.averageDailySteps);
  validateAverageSleepHours(input.averageSleepHours);
  validateHungerRating(input.hungerRating);
  validateEnergyRating(input.energyRating);
  validateNotes(input.notes);
}
