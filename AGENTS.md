# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Active System

**All active development happens in `frontend/`**. The root-level `server.js`, `src/`, and `public/` are a legacy Express+HTML system (port 3378) kept for reference only — do not modify it.

## Commands

```bash
# Run from frontend/ directory
cd frontend

npm run dev        # Start dev server on port 4321 (auto-increments if busy)
npm run build      # Production build (astro build)
npm run check      # Type-check with astro check

# Database (must stop dev server first — DLL lock causes EPERM)
npx prisma db push          # Apply schema changes to dev.db
npx prisma studio           # GUI for SQLite data
npx prisma generate         # Regenerate client (stop server first)
node prisma/seed.mjs        # Seed initial data
```

## Architecture

### SSR Pattern
Astro pages (`src/pages/*.astro`) handle server-side data fetching directly via Prisma. React components are used as islands (`client:load`) only when interactivity is needed. Pure data display stays in `.astro` files.

### Data Flow
- **Pages**: `.astro` files fetch from Prisma directly — no API calls from SSR layer
- **React islands**: call REST endpoints under `/api/*` via `src/lib/api-client.ts`
- **API routes**: `.ts` files under `src/pages/api/` return `ApiResponse<T>` (always `{ success, data }` or `{ success, error }` — see `src/lib/api.ts`)

### Auth
Sessions are DB-backed (no JWT, no in-memory state). `src/lib/auth/index.ts` exports:
- `getSession(event: APIEvent)` — for API routes
- `getSessionById(sessionId?)` — for Astro pages (reads `Astro.cookies.get('session')`)
- `createSession`, `deleteSession`

Lazy ban evaluation happens inside `resolveSessionUser()`: TEMP_BANNED users whose `banUntil` has passed are automatically lifted on next request.

### Permissions
Use `can(session, action)` from `src/lib/permissions.ts` for all authorization checks. Actions are strings like `'content:create'`, `'content:review'`, `'user:ban'`. Returns `false` for null sessions (guests). Role hierarchy: `USER < CONTRIBUTOR < EDITOR < ADMIN`.

### State Management
`src/stores/icebergStore.ts` — Zustand store for the editor. Tracks `iceberg`, `isDirty`, `lastSaved`. All mutations set `isDirty: true`. Components call API on save/publish, then reset dirty state.

### Type Safety for Enums
SQLite does not support Prisma enums. All enum-like fields (`role`, `status`, `IcebergStatus`, etc.) are stored as plain strings in the DB. TypeScript union types in `src/lib/types.ts` provide compile-time safety. Never use Prisma-generated enum types for these fields.

### Key Conventions
- **Item labels** are stored as a JSON string in the DB (`labels String @default("[]")`), parsed/serialized manually in API routes.
- **Notification creation** uses `notify()` from `src/lib/notify.ts` — fire-and-forget, never throws.
- **Pre-submission checklist** lives in `src/lib/checklist.ts` — validates title length, description, tier count, item density, and NSFW label acknowledgement before status transitions to `PENDING_REVIEW`.
- **Quality score** levels defined in `src/lib/qualityLevel.ts`: VISITOR(0), RESEARCHER(10), ANALYST(100), SUPERVISOR(500).
- **Prisma new-table workaround**: `npx prisma db push` can run while the dev server is running (creates the table), but `prisma generate` fails with EPERM on Windows because the server holds the DLL. Use `(prisma as any).newModel` as a temporary workaround, then stop the server, run `prisma generate`, and remove the casts.

### Design System
All global CSS is in `src/layouts/Layout.astro` inside `<style is:global>`. CSS variables are defined on `:root`. Light theme overrides are under `html.light`. The brand color is `#00FF41` (terminal green), dark background is `#0A0A0A`.

CSS utility classes defined here (not in Tailwind):
- `.archive-card` — content cards with left-border + hover translateX
- `.rank-card` / `.top-1/.top-2/.top-3` — leaderboard gold/silver/bronze borders
- `.view-bar` / `.view-bar-fill` — 3px progress bar
- `.boot-animate` — fade+blur-in on page load
- `.glitch-hover` — RGB chromatic aberration on hover
- `.bg-grid` — terminal dot-grid background
- `.vignette` — radial corner darkening overlay
- `.crt-scanlines` — CRT scan line overlay (hidden in light mode)
- `.markdown-content` — styles for rendered Markdown

### Environment Variables (frontend/.env)
```
DATABASE_URL=file:./dev.db
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
REDIRECT_URI=http://localhost:4321/api/auth/callback   # hardcoded to localhost — needs env var for prod
NODE_ENV=development
```
