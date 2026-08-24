# AI Fitness Coach — Public Beta

Production-oriented multi-tenant AI fitness platform with Telegram coaching, a secured versioned Member API, a mobile-first Member Web Portal, and role-scoped staff dashboards. The Railway public beta adds production Telegram-linked Web login without beginning Milestone 10. Native mobile, payments, device integrations, public galleries, browsing, voice, WhatsApp, and per-gym bot tokens remain out of scope.

## Architecture

```text
Central AI Platform / SUPER_ADMIN
                 │
                 ├─ Gym A ─ Owner ─ Trainers ─ Members
                 └─ Gym B ─ Owner ─ Trainers ─ Members
                                 │
Telegram ───────┐
                │
Member Web ─────┼──> Authenticated Member API ──> Agent / core services ──> PostgreSQL
                │
Future Mobile ──┘

Staff Web ──> staff auth + tenant scope ──> the same core services
```

Telegram handlers and Next.js server actions are thin interfaces over the same reusable services. Program selection, prescription validation, ownership checks, approval application, session state, and progression remain outside both interfaces. The dashboard does not contain a second implementation of business rules.

Workout and nutrition plans are durable database entities rather than free-form AI text. Creating a replacement archives the user's old active plan and atomically creates the structured replacement while preserving history. The Agent receives concise context and can act only through the explicit registry; the LLM never writes Prisma tables, supplies actor identity/roles, or dynamically creates tools.

Each tenant is a `Gym`. Tenant roles belong to `GymMembership`, not `User`, so one person can hold different roles in different gyms. `User.systemRole` is reserved for platform-wide access such as `SUPER_ADMIN`.

## AI Agent architecture

```text
Telegram / future member clients
              ↓ authenticated user context
Agent Orchestrator
              ↓ allow-listed function calls
Explicit Tool Registry (READ / ACTION / PRIVILEGED)
              ↓ server-injected actor + tenant scope
Existing authorized services
              ↓ deterministic validation and transactions
PostgreSQL
```

`src/agent` owns provider-independent orchestration, bounded context, layered policy composition, authorization-aware tool availability, strict Zod schemas, timeouts, and the tool loop. `src/agent/provider.ts` is the small OpenAI Responses API adapter plus a deterministic scripted fake used by tests. The official OpenAI Node SDK produces strict function definitions; the registry validates every function argument again before a handler runs.

The hard limits are five tool rounds and eight total tool calls per user request. A limit, timeout, malformed call, unknown tool, or service failure becomes a structured tool error and an operational log. Failed actions never produce a success confirmation. One `AIEvent` correlates the sanitized request, its `AIToolExecution` rows, latency/model/status, and final sanitized response. API keys, database credentials, raw images, private storage references, and chain-of-thought are never stored in these records.

Tool availability is calculated server-side from the authenticated `User`, active `GymMembership`, and selected gym. Schemas never include `actorUserId`, `systemRole`, `gymRole`, admin/trainer flags, approval status, or reviewer identity. Member contexts cannot see privileged trainer tools. Exercise logging resolves only names/order numbers inside the current authenticated workout; food substitutions resolve only numbered items inside the authenticated active plan. There is no SQL, shell, browsing, generic plan-edit, direct calorie-mutation, approval-bypass, or exact body-fat tool.

The system prompt is composed in priority layers: core fitness safety, tool-use policy, authorization, gym configuration, concise user context, current state, and response style. Gym branding uses `GymSettings.aiDisplayName`, `Gym.aiName`, `GymSettings.defaultLanguage`, and `trainingPhilosophy`, but cannot override safety or approval rules. Iraqi Arabic is the default member experience. Potentially serious symptoms are intercepted before ordinary coaching and receive a non-diagnostic medical-evaluation boundary.

Context is bounded to the active program summary, current session, last three completed sessions, active nutrition targets/meal summary, latest evaluated check-in and trend, latest stored decision, latest text-only photo comparison, and at most 30 active safe memory records. Raw photo bytes, Telegram file IDs, storage keys, and full conversation history are excluded. Responses API continuation exists only inside the five-round request loop.

Long-term optional memory uses `AgentMemory`. Explicit durable food likes/dislikes go to the existing structured `UserProfile` fields first. Other high-confidence preferences use a category/key upsert, so retries update rather than duplicate. Credentials, casual diagnoses, hidden reasoning, and trivial conversation are rejected. `/memory` shows safe user-relevant preferences; `/forget [number]` deactivates only optional `AgentMemory` and cannot remove workouts, measurements, photos, audits, security records, or other operational history.

Natural plan-change requests never directly update a plan. A gym member can request a structured review through the existing `ApprovalRequest` architecture; assignment, trainer identity, review status, and safe application remain server-controlled. Independent users without an already modeled safe self-service mutation path receive review guidance rather than unrestricted mutation.

Telegram's deterministic commands remain separate fallbacks. If OpenAI is unavailable, `/workout`, `/food`, `/progress`, and all other deterministic handlers continue to call services without the LLM.

## Platform identity and member authentication

One person has one `User`. Provider accounts are attached through `UserIdentity` with a unique `(provider, providerSubject)` pair. Existing `User.telegramId` remains as a nullable compatibility column; the Milestone 9 migration idempotently backfills verified `TELEGRAM` identities without creating duplicate users. New verified email users may start without Telegram. A later authenticated linking flow attaches a verified email to the existing user; names and unverified addresses are never merge signals. The provider enum already reserves additive paths for phone, Apple, and Google without implementing those providers.

```text
Email
  ↓ request generic challenge
OTP Challenge (salted scrypt hash, expiry, attempts, single use)
  ↓ successful verification
UserIdentity
  ↓
Opaque server-side AuthSession
  ↓ cookie or bearer token
Versioned Member API
```

Member sessions use 256-bit random opaque tokens. Only a SHA-256 token hash, CSRF-token hash, expiry, revocation state, and activity timestamps are stored. The browser receives a Secure-in-production, HTTP-only, SameSite=Strict session cookie plus a double-submit CSRF cookie/header for mutations. Future mobile clients may request and send the same revocable opaque token as `Authorization: Bearer ...`; authorization roles and gym scope are always reloaded from PostgreSQL. Logout revokes the server record before clearing cookies, and the session endpoints can list/revoke the authenticated user's own sessions.

OTP codes are cryptographically random six-digit values, expire after ten minutes by default, are single-use, and lock after five attempts. Request limits apply per normalized email and hashed IP; verification is additionally bounded by the persisted challenge attempt count. Responses are deliberately generic and login-code requests do not query user existence. The built-in `DevelopmentEmailProvider` prints a code only when `NODE_ENV` is not `production`. Production deliberately fails closed until a real `EmailProvider` is configured—never enable or copy the development delivery behavior into production.

The staff dashboard's Milestone 7 development login remains separate and remains disabled in production. It is not a member login and was not generalized into the production member identity flow.

### Public beta Telegram Web login

The public `/login` route does not use the development email provider. It creates a short-lived `TelegramLoginChallenge` with two independent 256-bit capabilities: a browser polling token and a Telegram deep-link token. Only SHA-256 hashes are stored. The bot receives the Telegram user ID directly from Telegram, upserts the existing `User`/verified `TELEGRAM` `UserIdentity`, and marks the challenge verified. The browser can only poll with its separate capability; it cannot submit a user ID, role, username, or gym scope. Successful polling atomically consumes the challenge and creates the normal opaque Web session. Expired, verified, or consumed challenges cannot be replayed.

Every new Telegram tester defaults to `SystemRole.USER` with no gym membership. The existing configured Super Admin account is preserved, but a member session never creates a staff dashboard session and the Member API always builds a member-only actor. Joining a gym through the existing verified join flow creates only the server-authorized membership role. Names, Telegram usernames, query parameters, and browser payloads never assign staff roles.

```text
Public /login
  ↓ random browser + bot capabilities
Telegram bot deep link
  ↓ Telegram-supplied numeric identity
Verified TELEGRAM UserIdentity
  ↓ one-time challenge consumption
HTTP-only member session
  ↓
/app
```

New testers complete the existing Telegram onboarding questions in the same bot conversation. `/app/onboarding` clearly shows this handoff and watches the existing `onboardingStep`; it redirects into the portal when the service-backed Telegram flow reaches `COMPLETE`. This deliberately avoids a second onboarding rules engine.

## Member API

Fastify exposes JSON under `/api/v1`. Successes use `{ "data": ... }`; failures use `{ "error": { "code": "...", "message": "..." } }` and never include a stack trace. Actor IDs, system roles, gym roles, and tenant authorization are derived from the authenticated session. `X-Gym-Id` is accepted only as a selection among the actor's active `MEMBER` memberships; a foreign tenant is rejected and multiple memberships require an explicit selection.

Authentication endpoints:

- `POST /api/v1/auth/telegram/request`
- `POST /api/v1/auth/telegram/status`
- `POST /api/v1/auth/otp/request`
- `POST /api/v1/auth/otp/verify`
- `POST /api/v1/auth/link/email/request`
- `POST /api/v1/auth/link/email/verify`
- `GET /api/v1/auth/csrf` (authenticated CSRF rotation/recovery)
- `GET /api/v1/auth/sessions`
- `POST /api/v1/auth/sessions/revoke`
- `POST /api/v1/auth/logout`

Member endpoints:

- `GET /api/v1/member/me`, `PATCH /api/v1/member/profile`, `GET /api/v1/member/home`
- `GET /api/v1/member/workout`, `GET /workout/current`, and `POST /workout/start|set|finish`
- `GET /api/v1/member/nutrition`, `/nutrition/targets`, `/nutrition/macros`, `/nutrition/substitutions`
- `GET /api/v1/member/progress`, `POST /member/weight`, `GET|POST /member/checkin`
- `GET /api/v1/member/photos`, `GET /photos/latest`, `DELETE /photos/:photoSetRef`
- `GET /api/v1/member/agent/conversation`, `POST /agent/message`

Workout mutations reuse the Milestone 8 strict tool schemas and allow-listed registry, which delegates to existing workout services. Nutrition substitutions retain allergy, restriction, dislike, and quantity calculations. There is intentionally no calorie-edit endpoint. Check-ins accept a structured payload and reuse the persistent step/evaluation services instead of simulating Telegram messages. Photo responses contain dates, views, statuses, and existing text analysis only—never Telegram file IDs, storage keys, image bytes, or public URLs. The Agent endpoint calls the single Milestone 8 orchestrator with a forced member-only actor and a scripted provider can be injected in tests.

Conversation UX is stored as `AgentConversation` plus visible `USER`/`ASSISTANT` `AgentMessage` rows. Tool payloads, hidden reasoning, images, and credentials are never conversation messages. Storage is capped at 100 messages per conversation and only the latest 12 visible messages are supplied to the model alongside the structured long-term context. Staff dashboards do not expose these conversations; operational debugging continues through sanitized `AIEvent` and `AIToolExecution` records.

API CORS accepts only `MEMBER_ALLOWED_ORIGINS`, never wildcard credentialed origins. API and Next.js responses set content-type, referrer, frame, permissions, and practical CSP protections. Cookie mutations require CSRF; bearer requests do not use browser CSRF. OTP, Telegram challenge, and Agent endpoints have configurable basic rate limits. The in-process limiters are suitable for the current single backend deployment; a horizontally scaled deployment should replace them with a shared atomic limiter before scale-out.

## Member Web Portal

The responsive portal is under `/app`, with `/app/coach`, `/app/workout`, `/app/nutrition`, `/app/progress`, `/app/photos`, and `/app/profile`; public member authentication starts at `/login` and `/app/login` is only a compatibility redirect. It calls the Member API rather than Prisma or duplicated business logic. The interface is visibly marked Beta and uses large tap targets, visible focus states, reduced-motion handling, fixed bottom navigation, responsive charts/forms, and a 320px layout. Gym display name, AI name, and validated six-digit hex colors are used when available; database content cannot inject CSS. Independent users receive neutral platform branding.

The portal includes a basic manifest and safe local SVG icon for installability. It does not implement offline data caching or secure photo upload transport. The photo page therefore presents only metadata and stored text summaries. Browser API calls stay same-origin through a Next.js route proxy configured with the server-only `BACKEND_API_URL`; backend credentials and service URLs are not placed in the client bundle.

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
TELEGRAM_BOT_USERNAME=your_bot_username_without_at
MEMBER_WEB_URL=http://localhost:3001
OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL=gpt-5
SUPER_ADMIN_TELEGRAM_ID=
DASHBOARD_SESSION_SECRET=
DASHBOARD_DEV_LOGIN_TOKEN=
DASHBOARD_DEV_USER_TELEGRAM_ID=
PORT=3000
NODE_ENV=development
BACKEND_API_URL=http://localhost:3000
```

`DATABASE_URL` and `TELEGRAM_BOT_TOKEN` are required at startup. `OPENAI_API_KEY` is optional only if AI chat is not being used; a missing key produces a logged `ERROR` AI event and a safe Telegram message. `SUPER_ADMIN_TELEGRAM_ID` is optional and must be a numeric Telegram user ID. Never commit `.env`.

Dashboard session and development-login secrets must each contain at least 32 characters. `DASHBOARD_DEV_USER_TELEGRAM_ID` identifies one fixed existing account; it is never sent to the browser and cannot be changed by login input.

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

## Web dashboards

The web application is an isolated npm workspace at `apps/web`. It uses Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4, server-rendered queries, and server actions. The existing Fastify/Telegram application remains at the repository root and is not restructured. Next uses webpack's extension aliases so the root NodeNext service modules can keep their correct `.js` import specifiers while being compiled from TypeScript in the monorepo.

Run the dashboard in development:

```bash
npm run web:dev
```

Verify and build it independently:

```bash
npm run web:typecheck
npm run web:test
npm run web:build
```

The dashboard entry point routes authorized users to `/admin`, `/gym`, or `/trainer`. A user with multiple staff tenants receives an explicit role/gym selector; no tenant is chosen implicitly.

## Railway public beta deployment

Use one Railway project with three services: Railway PostgreSQL, Backend, and Web. Both application services deploy from this repository. Configure the Backend service to use `/railway.backend.toml` and the Web service to use `/railway.web.toml`. These select `Dockerfile.backend` and `Dockerfile.web`; both images use Node 22, and the backend binds Fastify to `0.0.0.0:$PORT`. The backend container runs `prisma migrate deploy` before starting. Run `npm run db:seed` once against the Railway database after migrations; the seed uses upserts and is idempotent.

Backend variables (secret values belong only in Railway):

- `DATABASE_URL` from the Railway PostgreSQL service
- `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`
- `OPENAI_API_KEY`, `OPENAI_MODEL`
- `NODE_ENV=production`
- `MEMBER_ALLOWED_ORIGINS=https://<web-domain>`
- `MEMBER_WEB_URL=https://<web-domain>`
- `MEMBER_PROXY_SECRET` (the same 32+ character random value on Backend and Web)
- optional documented auth/rate-limit overrides
- `SUPER_ADMIN_TELEGRAM_ID` only when preserving the existing configured account

Web variables:

- `BACKEND_API_URL=https://<backend-domain>` (server-only)
- `DATABASE_URL` for the existing server-rendered staff modules; never prefix it with `NEXT_PUBLIC_`
- `TELEGRAM_BOT_TOKEN` only for the existing protected staff media adapter; it remains server-only
- `DASHBOARD_SESSION_SECRET` (32+ random characters)
- `MEMBER_PROXY_SECRET` (matching Backend; signs the proxy-only rate-limit IP handoff)
- `NODE_ENV=production`

Do not configure `DASHBOARD_DEV_LOGIN_TOKEN` or `DASHBOARD_DEV_USER_TELEGRAM_ID` in the public Web service. `/staff/login` returns not found in production, `/login` is member-only, and authenticated member cookies cannot open `/admin`, `/gym`, or `/trainer`. Do not enable the development email provider. The production backend rejects email delivery while no real provider exists and never logs an OTP.

Generate Railway HTTPS domains for Web and Backend. The Web domain is the tester link. The backend domain is used for health checks and the Web proxy. Keep `MEMBER_ALLOWED_ORIGINS` exact; do not use `*` with credentials. Because the browser talks only to the same-origin Next proxy, the Secure, HTTP-only, SameSite=Strict session cookie stays scoped to the Web origin while the proxy talks server-to-server to Fastify.

Before starting Railway long polling with a production bot token, verify no local `src/index.ts` or built backend process is using the same token. Railway should run exactly one Backend replica during this beta. Verify the public backend `/health`, public `/login`, protected `/app`, Telegram challenge expiry/replay behavior, onboarding, all member pages, migrations, seed counts, and Railway bot logs after deployment.

### Development authentication

Milestone 7 intentionally provides a development-only bootstrap, not production authentication. It is disabled whenever `NODE_ENV=production`. The login form accepts only `DASHBOARD_DEV_LOGIN_TOKEN`; the server maps that secret to the single fixed `DASHBOARD_DEV_USER_TELEGRAM_ID`, finds the existing internal user, and issues an HMAC-signed, eight-hour, HTTP-only, SameSite session cookie. Browser-supplied user IDs or role claims are never accepted.

Before a production deployment, replace this bootstrap with production OAuth or passwordless authentication and a managed secret/session lifecycle. Production mode will not enable the temporary login.

### Master Admin dashboard

`/admin` and its gyms, users, AI observability, media, approvals, and audit sections require `User.systemRole = SUPER_ADMIN` on every server request. Metrics are database-backed. User and tenant details include plan/progress context, while AI views expose only stored concise summaries and telemetry. Media pages show metadata only.

An actual private progress-photo request goes through `/api/media/photos/[photoId]`. The endpoint reauthenticates, reruns the privileged or tenant permission path, records the existing `PROGRESS_PHOTO_VIEWED` audit event, and returns a private `no-store` response. Pages never preload every private photo and there is no unauthenticated public media URL.

### Gym Owner dashboard

`/gym` includes tenant-scoped overview, paginated members, trainers, approvals, and settings. Owners can assign/unassign trainers, review approvals, and update the supported structured `GymSettings` fields only through existing services. Gym colors and AI identity are sanitized before use; arbitrary tenant CSS and raw JSON configuration are not accepted.

### Trainer dashboard

`/trainer` includes only explicitly assigned members and assigned pending approvals in the selected gym. A member-detail request revalidates the active trainer membership, exact tenant, active member membership, and exact `TrainerAssignment`. Full AI chats, system logs, unrelated memberships, and unauthorized private media are never returned.

### Authorization and tenant isolation

Every dashboard query and mutation obtains `actorUserId` from the signed server session, validates Zod inputs, rechecks roles in PostgreSQL, and calls the shared service layer. Non-admin direct admin URLs, foreign owner member URLs, and unassigned trainer member URLs fail without disclosing whether private records exist. Potentially large users, members, AI events, media, approvals, and audit collections use server-side pagination capped at 50 rows per page. Attention signals are structured coaching prompts (overdue check-in, low reported adherence, inactivity, pending review, recovery signal, stalled trend) and never medical diagnoses.

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
- `/memory` — show safe structured preferences and optional durable fitness memory
- `/forget [number]` — list or deactivate optional memory only

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

## Weekly check-ins and progress decisions

Check-in drafts are stored in `WeeklyCheckIn` with an explicit `currentStep`, so `/checkin` resumes after process restarts. The flow collects weight, optional waist, nutrition adherence, reported workouts, optional steps, sleep, hunger, energy, and optional notes. Completed workout sessions are counted separately in `trackedWorkoutsCompleted`; they never overwrite the user's reported number.

Completion is transactional: the draft becomes submitted, a `BodyMeasurement` is appended, profile weight is refreshed, trend/evaluation records are created, an `AgentDecision` is written, audit events are recorded, and the check-in becomes evaluated. No historical measurement or plan is deleted. New onboarding completions create an `ONBOARDING` measurement only when the user has no measurement; migrations/seeds do not invent history for existing users.

### Trend and decision engine

The pure trend engine reads approximately the latest 21 days and requires at least a 14-day span. It fits ordinary least-squares linear regression against actual measurement dates, so irregular dates are handled correctly. The slope is reported as kg/week and as percent of current body weight per week. One isolated measurement returns `COLLECT_MORE_DATA`.

Goal ranges, the 85% adherence gate, recovery thresholds, calorie deltas, step increments, and step ceiling are centralized in `src/progress/rules.ts`. Slow fat loss with poor adherence recommends a supportive adherence review rather than lower calories. High hunger, very low energy, or very low sleep blocks aggressive reductions. Calorie reductions reuse Milestone 3's BMR-based safety floor. The engine generally recommends one primary lever—calories or steps—not both.

All decisions store stable action enums, concise summaries, reason codes, and structured old/new values. Eligible calorie recommendations for gym-linked users create one expiring `ApprovalRequest`. The assigned trainer, same-gym owner, or `SUPER_ADMIN` may review it; unrelated trainers and cross-gym actors are blocked. No change occurs before approval.

### Telegram progress commands

- `/checkin` — start or resume the persistent weekly check-in
- `/checkinstatus` — show a draft or the latest evaluated recommendation
- `/progress` — show starting/current weight, total change, trend, waist, adherence, workouts, and latest decision
- `/weight <kg>` — append a manual measurement and refresh profile weight without creating a check-in
- `/skip` — skip only optional waist, steps, or notes while a check-in is open

V1 prevents accidental duplicate check-ins by declining a new draft when an evaluated check-in is less than five days old. This is a product cadence guard, not a medical rule.

## Progress photos and vision analysis

`ProgressPhotoSet` represents a dated checkpoint and permits partial sets, while the normal Telegram flow collects `FRONT`, `SIDE`, and `BACK` views. `ProgressPhoto` links each view to one private `Media` record and enforces one photo per view per set. Upload progress is inferred from persisted rows, so `/photos` resumes after an application restart without an in-memory session.

`src/media/` defines the replaceable `MediaStorage` boundary. V1 retains private Telegram file IDs and downloads a size-limited image only when an authorized analysis needs a readable in-memory data URL. No permanent public media URL is created. Future S3, Cloudflare R2, or Supabase adapters can implement the same interface without changing the photo services.

Vision analysis is opt-in. `allowVisionAnalysis`, `allowTrainerPhotoAccess`, and `allowGymPhotoAccess` all default to `false`, and each photo defaults to `PRIVATE`. Analysis consent does not grant trainer or gym access. Trainer access additionally requires an active same-gym membership, user consent, and compatible photo visibility; gym-owner access requires separate gym consent and `GYM_ALLOWED`. Privileged access paths are audited.

The vision prompt and output validator permit only cautious, visible fitness observations such as apparent muscular development, symmetry, posture-related differences, broad leanness changes, and photo consistency. They prohibit exact body-fat percentages, exact muscle-mass claims, medical diagnosis, identity matching, sensitive-trait inference, sexualized commentary, and appearance shaming. Responses API calls use strict structured output with remote response storage disabled. Only concise user-facing observations are persisted; raw image bytes and hidden reasoning are never written to `AIEvent`, analysis, chat context, or audit logs.

When an earlier completed analysis exists, the current vision request can compare the private image sets and store a cautious `comparisonSummary`. Missing or inconsistent photos are handled with explicit caveats. The normal AI coach can read only the latest photo date, overall summary, and comparison summary—not media references or images.

### Telegram photo commands

- `/photos` — start or resume a private photo set and choose analysis consent
- `/latestphotos` — show latest set metadata, present views, status, and concise summary without resending images
- `/photoprogress` — show completed-set count, latest analysis, and previous-set comparison
- `/deletephotos` — request confirmation before deleting the latest set, its analysis, and its exclusively linked media

## Multi-gym configuration and trainers

`GymSettings` moves product-critical tenant configuration out of arbitrary JSON while retaining the legacy `Gym.themeConfig` and `Gym.aiConfig` fields for compatibility. It stores branding, AI display identity, language, approval policies, training philosophy, default session preferences, equipment configuration, and welcome text. Only a same-gym `OWNER` or `SUPER_ADMIN` can update it; every mutation is audited.

Gym roles remain on `GymMembership`, so a user may be an owner, trainer, or member in different tenants. `TrainerProfile` is platform-wide, while `TrainerPreferences` and `TrainerAssignment` are gym-scoped. Assignment services require an active trainer/owner and active member in the same gym, prevent self-assignment and duplicates, and allow only a gym owner or super admin to assign members. Telegram commands with multiple valid tenant memberships require explicit gym selection and revalidate the selected membership in PostgreSQL.

The effective coach configuration resolver combines immutable core safety rules, structured gym settings, assigned-trainer preferences, and the member profile. Tenant settings can customize identity and training approach but cannot remove safety rules. Workout generation reads `GymExerciseAvailability`, gym equipment settings, trainer exercise/rep preferences, and stored `ExerciseSubstitution` priorities. If no availability rows exist, the global catalogue remains the default; restrictive settings never intentionally produce an empty workout day.

### Approval lifecycle

```text
AgentDecision
    ↓ one idempotent request
ApprovalRequest (PENDING, expires after 14 days)
    ↓ assigned trainer / gym owner / super admin
Safety + authorization + stale-state revalidation
    ↓
Archive previous ACTIVE NutritionPlan
    ↓
Create new NutritionTarget and ACTIVE NutritionPlan version
```

Approval payloads store only structured current/proposed values and a concise reason. Approval reruns calorie guardrails and requires the active calorie target to exactly match the reviewed `currentValue`. A stale, expired, rejected, or already-reviewed request cannot apply. Rejection records the decision and leaves nutrition history untouched. `WORKOUT_ADJUSTMENT` is supported as an approval type and storage foundation, but automatic workout rewriting is intentionally deferred.

### Trainer and administration Telegram commands

- `/trainer` — show role, scoped gym, assigned-member count, and pending approvals
- `/mymembers` — show only coaching-safe member summaries; never raw photos, chat history, media, or AI logs
- `/approvals` — list scoped pending requests with opaque references and approve/reject buttons
- `/gym` — owner-only tenant counts and AI identity summary
- `/admin` — `SUPER_ADMIN`-only aggregate platform counts without secrets

Approval callbacks are identifiers, not authorization. Every callback reloads the request and actor scope from PostgreSQL, blocks replay, and applies mutations transactionally where practical.

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
10. Send `/checkin`, complete each persisted step, inspect `/checkinstatus` and `/progress`, and confirm recommendations say they were not applied.
11. Use `/weight 78.2` and confirm it adds weight history without creating a check-in.
12. Temporarily use an invalid OpenAI key to verify a safe Telegram error and an `AIEvent` with status `ERROR`.
13. Use `/photos`, choose analysis consent or storage-only mode, upload FRONT/SIDE/BACK as Telegram photos, then inspect `/latestphotos` and `/photoprogress`.
14. Restart during a partial photo set and use `/photos` to confirm the next missing view resumes from PostgreSQL.
15. Use `/deletephotos`, cancel once, then confirm and verify only the latest set and its linked media are removed with an audit record.
16. As a trainer or owner, use `/trainer`, `/mymembers`, and `/approvals`; with multiple gym roles, explicitly choose the intended tenant.
17. As an owner, use `/gym`. As the configured platform super admin, use `/admin` for aggregate counts.

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
  progress/                # pure trends, rules, evaluation, check-in validation
  media/                   # private, replaceable media storage contracts/adapters
  vision/                  # safe structured analysis prompts, types, and comparison
  services/                # reusable workout, nutrition, progress, user, gym logic
    dashboard/             # centralized admin/owner/trainer read queries
  auth/                    # explicit tenant scopes and permission helpers
  utils/                   # safe text helpers
apps/
  web/                     # Next.js App Router dashboard workspace
    app/                   # authenticated role routes and server actions
    components/            # responsive dashboard UI
    lib/                   # cookie auth and request context
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
- Dashboard identity comes from a signed HTTP-only cookie; roles and tenant memberships are always reloaded server-side.
- The temporary dashboard login is development-only, fixed to one configured Telegram-linked account, and disabled in production.
- Dashboard collections are paginated server-side and foreign direct URLs fail without leaking private record existence.
- AI events contain concise input/output summaries, token counts when available, latency, and errors—not hidden chain-of-thought.
- `Media` stores private metadata and backend references; no public gallery or permanent unauthenticated URL exists.
- `AgentDecision` stores explicit operational decisions and reasons, not private reasoning.
- `AuditLog` is ready for user, gym, trainer, and future admin activity.
- Workout service ownership checks prevent a user from viewing or logging another user's workout.
- Progression reasons are concise user-facing results, not hidden reasoning.
- Allergies are hard exclusions in meal generation and food substitution services.
- Meal items store nutrition snapshots so historical plans do not change with later food-data edits.
- Check-in completion writes deterministic `ProgressEvaluation`, `AgentDecision`, and concise `AuditLog` records.
- Progress AI context is read-only and uses stored summaries/reason codes rather than invented rationales.
- Photo analysis requires explicit consent, private visibility is the default, and trainer/gym access requires separate consent plus same-gym permission checks.
- Approval review requires exact tenant scope and assigned-trainer/owner/super-admin authorization; callbacks never grant permission by themselves.
- Approved nutrition changes create a new target/plan version only after safety and stale-state validation; prior plans remain archived history.
- Vision `AIEvent` and audit records contain concise metadata only—never image bytes, Telegram file references, public URLs, or hidden chain-of-thought.
- Unexpected Telegram update errors are contained so one update does not terminate the process.
- `SIGINT` and `SIGTERM` stop the bot, API server, and Prisma connection cleanly.
