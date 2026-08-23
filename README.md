# AI Fitness Coach — Milestone 1

Production-oriented foundation for a multi-tenant AI fitness platform. Milestone 1 provides a Fastify API, a grammY Telegram interface, persistent onboarding, gym memberships, a basic OpenAI coach, and operational data models. It intentionally does **not** generate workout plans, meal plans, or analyze photos.

## Architecture

```text
Telegram Bot ───────┐
Future Mobile App ──┼─> Core services ─> AI services ─> PostgreSQL
Future Dashboards ──┘
```

Telegram handlers only translate Telegram updates into calls to reusable services. Gym/user rules and AI orchestration live outside the bot, so future mobile, Trainer Dashboard, and Master Admin Dashboard interfaces can use the same backend and data model.

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

Seed the idempotent development gym:

```bash
npm run db:seed
```

The seed upserts:

- Gym: `Development Gym`
- Join code: `DEVGYM`
- AI name: `Dev Coach`

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
npm run typecheck
npm run build
```

## Testing the Telegram flow

1. Start the app and open the bot in Telegram.
2. Send `/start`. Complete every onboarding question. Invalid numbers are rejected without advancing the PostgreSQL-backed step.
3. Restart the server during onboarding and send `/start` again to confirm it resumes at the saved step.
4. After onboarding, send `/profile` and verify the Iraqi Arabic profile summary.
5. After seeding, send `/join DEVGYM`. The user receives an active `MEMBER` membership; repeating the command updates the same membership instead of creating a duplicate.
6. Send a normal, non-command fitness question after onboarding. The answer uses the OpenAI Responses API and creates an `AIEvent`.
7. Temporarily use an invalid OpenAI key to verify a safe Telegram error and an `AIEvent` with status `ERROR`.

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
  services/                # reusable user, gym, and AI-event logic
  utils/                   # safe text helpers
prisma/
  schema.prisma            # multi-tenant data model
  migrations/              # PostgreSQL migration history
  seed.ts                  # idempotent development gym seed
prisma.config.ts           # Prisma 7 CLI configuration
```

## Security and observability

- Secrets are loaded from ignored environment files and are redacted from handled errors.
- AI events contain concise input/output summaries, token counts when available, latency, and errors—not hidden chain-of-thought.
- `Media` stores metadata only; Milestone 1 does not download or analyze uploads.
- `AgentDecision` stores explicit operational decisions and reasons, not private reasoning.
- `AuditLog` is ready for user, gym, trainer, and future admin activity.
- Unexpected Telegram update errors are contained so one update does not terminate the process.
- `SIGINT` and `SIGTERM` stop the bot, API server, and Prisma connection cleanly.
