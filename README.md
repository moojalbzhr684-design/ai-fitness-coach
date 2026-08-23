# AI Fitness Coach — Milestone 2

Production-oriented foundation for a multi-tenant AI fitness platform. Milestone 2 adds a structured resistance-training engine for beginner and intermediate users: a global exercise catalogue, deterministic program generation, workout sessions and set logs, exercise substitutions, and Double Progression recommendations. Nutrition, body/photo analysis, and dashboards are intentionally out of scope.

## Architecture

```text
Telegram Bot ───────┐
Future Mobile App ──┼─> Workout services ─> Workout engine ─> PostgreSQL
Future Dashboards ──┘                       │
                                           └─> deterministic progression
```

Telegram handlers only translate Telegram updates into calls to reusable services. Program selection, prescription validation, ownership checks, session state, and progression live outside the bot, so future mobile, Trainer Dashboard, and Master Admin Dashboard interfaces can use the same behavior and data model.

Workout programs are durable database entities rather than free-form AI text. Creating a program archives the user's old active program and atomically creates its ordered days and prescriptions. Historical programs and completed sessions remain available. The chat AI receives a concise, read-only summary of the active/current workout and cannot write workout tables.

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

Seed the idempotent development gym, global exercises, and substitutions:

```bash
npm run db:seed
```

The seed upserts:

- Gym: `Development Gym`
- Join code: `DEVGYM`
- AI name: `Dev Coach`
- 52 common resistance-training exercises with structured muscle, equipment, movement, type, and difficulty metadata
- 20 prioritized exercise substitution relationships

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

## Testing the Telegram flow

1. Start the app and open the bot in Telegram.
2. Send `/start`. Complete every onboarding question. Invalid numbers are rejected without advancing the PostgreSQL-backed step.
3. Restart the server during onboarding and send `/start` again to confirm it resumes at the saved step.
4. After onboarding, send `/profile` and verify the Iraqi Arabic profile summary.
5. After seeding, send `/join DEVGYM`. The user receives an active `MEMBER` membership; repeating the command updates the same membership instead of creating a duplicate.
6. Send a normal, non-command fitness question after onboarding. The answer uses the OpenAI Responses API and creates an `AIEvent`.
7. Send `/workout`, create the program, open a day, and press **ابدأ التمرين**.
8. Log sets, for example `/logset 1 1 60 10 2`, inspect `/currentworkout`, then use `/finishworkout`.
9. Temporarily use an invalid OpenAI key to verify a safe Telegram error and an `AIEvent` with status `ERROR`.

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
  services/                # reusable workout, user, gym, and AI-event logic
  utils/                   # safe text helpers
prisma/
  schema.prisma            # multi-tenant data model
  migrations/              # PostgreSQL migration history
  exercise-seed.ts         # global exercise/substitution catalogue
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
- Unexpected Telegram update errors are contained so one update does not terminate the process.
- `SIGINT` and `SIGTERM` stop the bot, API server, and Prisma connection cleanly.
