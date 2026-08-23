# AI Fitness Coach — Milestone 3

Production-oriented foundation for a multi-tenant AI fitness platform. Milestone 3 adds deterministic calorie/macro targets, structured meal plans, an Iraqi/Middle Eastern food catalogue, nutrition-aware substitutions, allergy/restriction filtering, and budget estimates for beginner and intermediate users. Body/photo analysis, automatic check-in adjustments, meal-photo recognition, barcode scanning, and dashboards remain out of scope.

## Architecture

```text
Telegram Bot ───────┐    ┌─> Workout services ─> Workout engine ───────┐
Future Mobile App ──┼─> ─┤                                        PostgreSQL
Future Dashboards ──┘    └─> Nutrition services ─> Nutrition engine ───┘
                                                   │
                                                   └─> global food data
```

Telegram handlers only translate Telegram updates into calls to reusable services. Program selection, prescription validation, ownership checks, session state, and progression live outside the bot, so future mobile, Trainer Dashboard, and Master Admin Dashboard interfaces can use the same behavior and data model.

Workout and nutrition plans are durable database entities rather than free-form AI text. Creating a replacement archives the user's old active plan and atomically creates the structured replacement while preserving history. The chat AI receives concise, read-only workout/nutrition summaries and cannot write plan tables.

Each tenant is a `Gym`. Tenant roles belong to `GymMembership`, not `User`, so one person can hold different roles in different gyms. `User.systemRole` is reserved for platform-wide access such as `SUPER_ADMIN`.

## Requirements

- Node.js 22 or newer
- npm
- PostgreSQL
- A Telegram bot token
- An OpenAI API key to enable AI chat

## Installation

```bash
npm install
cp .env.example .env
```

Fill in `.env`:

```dotenv
DATABASE_URL=postgresql://postgres:password@localhost:5432/ai_fitness_coach
TELEGRAM_BOT_TOKEN=your_bot_token
OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL=gpt-5
SUPER_ADMIN_TELEGRAM_ID=
PORT=3000
NODE_ENV=development
```

`DATABASE_URL` and `TELEGRAM_BOT_TOKEN` are required at startup. `OPENAI_API_KEY` is optional only if AI chat is not being used; a missing key produces a logged `ERROR` AI event and a safe Telegram message. `SUPER_ADMIN_TELEGRAM_ID` is optional and must be a numeric Telegram user ID. Never commit `.env`.

### Getting a Telegram token

1. Open Telegram and message `@BotFather`.
2. Run `/newbot` and follow BotFather's prompts.
3. Put the token BotFather returns in `TELEGRAM_BOT_TOKEN`.
4. Do not paste the token into source code, logs, or commits.

### PostgreSQL URL

Create an empty PostgreSQL database and use a standard connection URL:

```text
postgresql://USER:PASSWORD@HOST:5432/DATABASE
```

Percent-encode special characters in the username or password.

## Database setup

Generate the Prisma 7 client:

```bash
npm run db:generate
```

Apply the included initial migration during local development:

```bash
npm run db:migrate
```

For a fresh database you may name a new development migration when the schema changes:

```bash
npm run db:migrate -- --name describe_the_change
```

Seed the idempotent development gym, exercises, foods, and substitutions:

```bash
npm run db:seed
```

The seed upserts:

- Gym: `Development Gym`
- Join code: `DEVGYM`
- AI name: `Dev Coach`
- 52 common resistance-training exercises with structured muscle, equipment, movement, type, and difficulty metadata
- 20 prioritized exercise substitution relationships
- 66 standardized approximate food entries, including 51 Iraqi/common choices
- 30 nutrition-aware food substitution relationships

Open Prisma Studio when needed:

```bash
npm run db:studio
```

## Running the application

Development with reload:

```bash
npm run dev
```

Production build and start:

```bash
npm run build
npm start
```

The Fastify health endpoint defaults to `http://localhost:3000/health` and returns:

```json
{
  "status": "ok",
  "service": "ai-fitness-coach"
}
```

Useful verification commands:

```bash
npm run test
npm run typecheck
npm run build
```

## Workout engine

`generateInitialWorkoutProgram(userId)` loads a completed profile, validates that the workout inputs exist, chooses a safe split, builds ordered prescriptions from templates, archives an existing active program, and creates the new active program in one Prisma transaction.

Default split selection:

- 2-3 days: Full Body
- 4-5 days: Upper / Lower, with a safe focused day at five days
- 6 days: Push / Pull / Legs for intermediate users; beginners retain the simpler Upper / Lower structure

Session length caps exercise count: short beginner sessions contain four exercises, typical sessions five, and longer sessions six. Intermediate sessions add at most one exercise. Generated prescriptions are checked for 1-5 sets, 1-30 reps, 30-300 seconds rest, and RIR 0-5.

### Double Progression V1

Progression uses completed working sets and ignores warmups. When all prescribed sets reach the top of the rep range with acceptable RIR, it recommends increasing load. Barbell/EZ-bar defaults are +2.5 kg for upper body and +5 kg for lower body. Dumbbells and machines recommend the smallest available increment instead of inventing equipment-specific jumps. In-range work keeps the load, multiple below-range sets recommend a conservative decrease, and incomplete logs recommend repeating the session. Recommendations are informational and do not mutate prescriptions.

## Telegram workout commands

- `/workout` — create or display the active program and open an individual day
- `/currentworkout` — display the in-progress session and its logged sets
- `/logset <exercise_number> <set_number> <weight> <reps> [rir]` — add or correct a working set in the current session
- `/finishworkout` — complete the current session, calculate duration, and display per-exercise progression recommendations

The user starts a session through the inline **ابدأ التمرين** button on a workout day. All commands resolve the Telegram identity to an internal user and enforce program/session ownership in the service layer.

## Nutrition engine

`generateInitialNutritionPlan(userId)` loads the completed profile, calculates and versions the target, applies preferences and hard exclusions, builds 2-6 ordered meals, snapshots each item's macros, estimates cost, archives an old active plan, and creates the new target/plan in one Prisma transaction. `regenerateNutritionPlan(userId)` uses the same history-preserving path.

### Calories and macros

V1 uses Mifflin-St Jeor. Male and female formulas use their standard offsets; `PREFER_NOT_TO_SAY` uses the midpoint of both estimates instead of inventing a sex. Activity multipliers are centralized in `src/nutrition/calculator.ts`. Goal adjustments are moderate: 15% deficit for fat loss, 8% surplus for muscle gain, 3% deficit for recomposition, 3% surplus for strength, and maintenance for general fitness.

A product safety guardrail keeps generated targets from dropping drastically below estimated BMR. This is not a personalized medical threshold. Protein uses deterministic goal-specific values from 1.6-2.0 g/kg, fat uses a conservative bodyweight/calorie range, and carbohydrates receive the remaining calories. The calculator corrects allocation instead of returning negative carbohydrates.

### Food data, plans, and substitutions

The global food catalogue prioritizes simple ingredients and Iraqi/common Middle Eastern choices such as cooked rice, khubz, samoon, bulgur, lentils, chickpeas, fava beans, dates, yogurt, labneh, tahini, chicken, eggs, and common produce. Nutrition values and prices are standardized estimates: brands, cuts, cooking methods, water content, recipes, and market prices vary.

Meal generation targets calories within ±5% and protein within ±10%. Allergy tags are hard exclusions. Dietary restrictions are required tags; disliked foods are excluded and preferences are ranked higher. If constraints cannot form a valid plan, generation returns a structured error rather than violating them.

Food alternatives are not gram-for-gram swaps. Protein foods match protein first, carbohydrate/legume foods match carbs first, fat foods match fat first, and calories contribute to the reported difference. Alternatives are filtered again for allergies, restrictions, dislikes, Iraqi availability, and estimated cost.

Budget estimates use `quantityGrams / 1000 × estimatedPriceIqdPerKg`. Missing prices produce an unknown total instead of a fabricated number. When a positive weekly budget is too low, the generator favors economical foods and returns a warning while preserving calorie/protein safety.

### Telegram nutrition commands

- `/food` — create or display the active structured meal plan
- `/macros` — display current calorie, protein, carbohydrate, and fat targets without regeneration
- `/alternatives <meal_number> <food_number>` — display up to three filtered, quantity-adjusted alternatives

This is a general fitness nutrition feature, not clinical medical nutrition. It does not diagnose or treat disease, manage pregnancy, treat eating disorders, or replace individualized advice from a qualified clinician/dietitian for severe allergies or medical conditions.

## Testing the Telegram flow

1. Start the app and open the bot in Telegram.
2. Send `/start`. Complete every onboarding question. Invalid numbers are rejected without advancing the PostgreSQL-backed step.
3. Restart the server during onboarding and send `/start` again to confirm it resumes at the saved step.
4. After onboarding, send `/profile` and verify the Iraqi Arabic profile summary.
5. After seeding, send `/join DEVGYM`. The user receives an active `MEMBER` membership; repeating the command updates the same membership instead of creating a duplicate.
6. Send a normal, non-command fitness question after onboarding. The answer uses the OpenAI Responses API and creates an `AIEvent`.
7. Send `/workout`, create the program, open a day, and press **ابدأ التمرين**.
8. Log sets, for example `/logset 1 1 60 10 2`, inspect `/currentworkout`, then use `/finishworkout`.
9. Send `/food`, create the plan, inspect `/macros`, then request an item alternative such as `/alternatives 2 1`.
10. Temporarily use an invalid OpenAI key to verify a safe Telegram error and an `AIEvent` with status `ERROR`.

The `/join` command can never assign `OWNER` or `TRAINER`. Those roles require a future administrative flow. A Telegram user can only become `SUPER_ADMIN` when their ID matches the server-controlled `SUPER_ADMIN_TELEGRAM_ID`.

## Project layout

```text
src/
  index.ts                 # startup and graceful shutdown
  config/env.ts            # Zod environment validation
  lib/prisma.ts            # one shared adapter-backed Prisma client
  api/                     # Fastify server and routes
  bot/                     # Telegram-only interaction layer
  ai/                      # prompts and Responses API orchestration
  workout/                 # pure generation, templates, validation, progression
  nutrition/               # pure targets, plans, budget, substitutions, validation
  services/                # reusable workout, nutrition, user, gym, AI-event logic
  utils/                   # safe text helpers
prisma/
  schema.prisma            # multi-tenant data model
  migrations/              # PostgreSQL migration history
  exercise-seed.ts         # global exercise/substitution catalogue
  food-seed.ts             # global food/substitution catalogue
  seed.ts                  # idempotent development seed entrypoint
prisma.config.ts           # Prisma 7 CLI configuration
```

## Security and observability

- Secrets are loaded from ignored environment files and are redacted from handled errors.
- AI events contain concise input/output summaries, token counts when available, latency, and errors—not hidden chain-of-thought.
- `Media` stores metadata only; Milestone 1 does not download or analyze uploads.
- `AgentDecision` stores explicit operational decisions and reasons, not private reasoning.
- `AuditLog` is ready for user, gym, trainer, and future admin activity.
- Workout service ownership checks prevent a user from viewing or logging another user's workout.
- Progression reasons are concise user-facing results, not hidden reasoning.
- Allergies are hard exclusions in meal generation and food substitution services.
- Meal items store nutrition snapshots so historical plans do not change with later food-data edits.
- Unexpected Telegram update errors are contained so one update does not terminate the process.
- `SIGINT` and `SIGTERM` stop the bot, API server, and Prisma connection cleanly.
