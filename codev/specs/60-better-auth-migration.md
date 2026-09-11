# Specification: Better Auth Migration Plan

## Metadata

- **ID**: spec-2026-09-11-better-auth-migration
- **Status**: draft
- **Created**: 2026-09-11
- **Source**: GitHub issue #60
- **Depends on**: #59 (Better Auth scaffold in `apps/auth` + `packages/auth`)

## Problem Statement

Ansari's production authentication is a custom JWT system in `apps/api`: HS256 access/refresh
tokens, SHA-256-hashed rows in `tokens`, bcrypt passwords on `users.password_hash`, and
`session_version` as a global session-revocation primitive. It is hardened (spec 4) and well tested,
but capabilities such as OAuth, 2FA, email verification, and passkeys would all be custom work.

Issue #59 added a **second, additive** Better Auth stack (`packages/auth`, `apps/auth`) with four
new tables (`user`/`session`/`account`/`verification`). `apps/api` still uses the legacy path
exclusively. This spec defines how to migrate to Better Auth **without locking out existing users**.

### Schema gap

| Area | Current (`users` + JWT) | Better Auth default |
|------|-------------------------|---------------------|
| User id | UUID | text |
| Name | `firstName` + `lastName` (nullable) | single `name` (required) |
| Password | `users.password_hash` | `account.password` (`providerId='credential'`) |
| Email verification | none | `emailVerified` + `verification` table |
| Custom columns | `isAdmin`, `systemKey`, `sessionVersion`, `source`, `registeredVia` | none |
| Timestamps | `timestamptz` | `timestamp` (no tz) |
| Sessions | `tokens` table, hashed JWTs, rotation grace | `session` table, one row per session |

Four tables carry UUID foreign keys to `users.id` with `onDelete: cascade`: **`threads`,
`tokens`, `preferences`, `feedback`**.

### Post-#59 constraints

- **`user` vs `users`**: Better Auth's default table name is `user` (SQL reserved word); `apps/api`
  uses `users`. Both may coexist in the same database until consolidation is deliberate.
- **CORS**: `apps/api/next.config.ts` sets `Access-Control-Allow-Origin: *` alongside
  `Access-Control-Allow-Credentials: true`. This is invalid for cookie-based auth and must be fixed
  before credentialed Better Auth traffic hits `apps/api`.
- **`trustedOrigins`**: Custom URI schemes (`askansari://`) must not be treated as the sole security
  boundary for native flows; behavior should be verified with automated tests.

## Current State

- **Legacy auth (`apps/api`)**: Register/login/refresh/logout/reset via `v2/users/*`; middleware
  validates JWTs; `issueTokenPair` writes to `tokens`; `session_version` checked on every
  validation.
- **Better Auth (#59)**: `packages/auth` exports `createAuth()`; `apps/auth` mounts
  `toNodeHandler(auth)` at `/api/auth/*`. Uses default text ids and stock schema. Shares
  `DATABASE_URL` with `apps/api` but no Drizzle code or table names overlap yet.
- **Passwords**: bcrypt (12 rounds) in `apps/api/lib/auth/password.ts`.
- **Admin**: `users.is_admin` DB flag; bootstrapped via `scripts/grant-admin.ts`; never email-match.
- **System accounts**: `users.system_key` (`ai-skill`, `leaderboard`); resolved by key, not email.

## Decision: Migrate to Better Auth architecture

**Chosen:** Adopt Better Auth as the canonical auth model (`session`, `account`, `verification`,
cookie sessions, plugins). Preserve **UUID user identity** so existing FKs and user-owned data
remain valid. Retire the JWT/`tokens` path after cutover.

**Rejected:** Permanent dual auth or configuring Better Auth to replicate the legacy
JWT/`session_version` model indefinitely.

**Reasoning:**

1. Better Auth is configurable ([Database docs](https://better-auth.com/docs/concepts/database)) —
   UUID ids, table mapping, and `additionalFields` are supported — but the end state should use
   Better Auth's native session and account model, not a permanent wrapper around legacy tokens.
2. Four tables FK to `users.id`; changing id type or breaking identity continuity would force a
   destructive rewrite.
3. The primary failure mode is **silent lockout of existing users**; the migration must preserve
   bcrypt credentials through a defined data migration and verification hook.
4. #59 deliberately kept auth additive; this spec defines the cutover from that starting point.

**Tradeoff accepted:** Configuration diverges from stock Better Auth examples (UUID ids, dual hash
verification, `users` table mapping, system-account fields). Mappings must be documented in
`arch.md`.

**Identity strategy:** One UUID row per user, same id before and after migration. Better Auth's user
model maps onto the existing **`users`** table (eliminating the parallel `user`/`users` hazard)
unless a Phase 0 spike proves a cleaner consolidation path.

---

## Answers to the eight open questions

### 1. `session_version`

**Decision:** Retire `session_version` when the JWT path is decommissioned. Better Auth **session
rows** become the revocation primitive.

| Period | Behavior |
|--------|----------|
| Dual-run | Legacy clients: JWT + `session_version` check. New clients: Better Auth sessions. |
| Post-cutover | Logout, password reset, and admin lockout invalidate Better Auth sessions for that user. Remove `session_version` from validation paths. |

**Guarantee replaced:** "Kill all sessions" = invalidate all `session` rows for the user (Better Auth
APIs or equivalent DB operation).

### 2. Refresh-token rotation / revoke-on-reuse (#16)

**Decision:** Better Auth owns session/refresh lifecycle after cutover. **Close #16** during
implementation by documenting Better Auth's behavior and adding regression tests — do not port the
legacy `tokens.rotatedAt` grace model forward.

During dual-run, legacy refresh semantics (including issue #34 concurrent-refresh behavior) remain
until JWT routes are removed.

### 3. System accounts

**Decision:** Retain `system_key` as a server-owned `additionalField` (`input: false`). System
endpoints continue resolving identities by `system_key`, never email. Registration must remain
blocked for reserved system addresses.

System rows migrate with their existing UUIDs and `system_key` values.

### 4. Admin authorization

**Decision:** Adopt the [Better Auth admin plugin](https://better-auth.com/docs/plugins/admin) as
the long-term admin mechanism. Bridge from `users.is_admin` and `scripts/grant-admin.ts` during
transition.

| Period | Behavior |
|--------|----------|
| Dual-run | Admin routes may dual-check `is_admin` and/or plugin role until BA session is universal. |
| Post-cutover | Admin plugin is source of truth; bootstrap script updated accordingly. |

**Invariant preserved:** Admin access is never derived from email match; `ADMIN_EMAILS` remains
reservation + production boot assertion only.

### 5. Where does it run?

**Decision (phased):**

| Phase | Hosting |
|-------|---------|
| Initial cutover | **`apps/auth`** — standalone Express service from #59 (`toNodeHandler`). |
| Optional later | Fold into **`apps/api`** via `toNextJsHandler` once CORS/cookie cross-origin requirements are satisfied. |

Starting with `apps/auth` avoids modifying production API routes until the Better Auth path is
proven end-to-end.

### 6. Existing user credentials

**Decision:** No mass password reset.

1. **One-time SQL migration** copies existing users into Better Auth tables, preserving UUIDs and
   copying bcrypt hashes from `users.password_hash` to `account.password`.
2. **Custom password verification**
   ([email-password configuration](https://better-auth.com/docs/authentication/email-password#configuration)):
   hashes matching bcrypt prefixes (`$2a$`/`$2b$`) verify with bcrypt; new hashes use Better Auth's
   default scrypt.
3. **Phase 0 spike:** Migrate one test user and prove login via Better Auth before bulk migration.

Optional post-login rehash from bcrypt to scrypt is an implementation detail for the plan phase.

### 7. Cutover shape and rollback

**Decision:** Phased side-by-side cutover, not big-bang.

Each phase ships independently and can revert independently:

| Phase | Goal | Rollback |
|-------|------|----------|
| 0 | UUID config, schema consolidation, single-user spike | Revert config only |
| 1 | New users authenticate via Better Auth | Route flag back to legacy auth |
| 2 | Migrate existing users (SQL + dual verify) | Keep legacy path enabled; migration idempotent |
| 3 | Decommission JWT routes and `tokens` usage | Feature flag until soak period ends |
| 4 | Admin plugin, CORS fix, tests, arch docs | Revert individual commits |

**CORS prerequisite:** Before credentialed Better Auth against `apps/api`, replace wildcard origin
with an explicit allowlist matching `packages/auth` `trustedOrigins`; add a test that the two lists
cannot diverge silently.

### 8. Test suite

| Category | Action |
|----------|--------|
| JWT route tests (`auth.test.ts`, refresh, token-grace, etc.) | Rewrite or remove when JWT path is decommissioned |
| Admin authz tests | Rewrite for Better Auth session + admin plugin |
| System account / registration guards | Keep behavior; update fixtures for BA users |
| Ownership / IDOR tests (e.g. feedback) | Keep — auth-mechanism agnostic |
| `bcrypt-compat.test.ts` | Keep — supports migration |
| New | BA E2E: sign-up → sign-in → session → sign-out; migrated-user bcrypt login; CORS allowlist sync |

**Safety bar:** The new suite must prove at least the spec-4 invariants: admin not by email, system
by `system_key`, session kill on logout/reset, no credential lockout.

---

## Desired State

After migration:

1. **All product auth** flows through Better Auth (`apps/auth` initially; optionally `apps/api`
   later).
2. **Existing users** log in with unchanged passwords via migrated bcrypt hashes.
3. **New users** receive scrypt hashes under Better Auth defaults.
4. **User ids** remain UUID; `threads`, `preferences`, and `feedback` FKs unchanged.
5. **Admin** is enforced via Better Auth admin plugin (with transitional bridge from `is_admin`).
6. **System accounts** remain keyed on `system_key`.
7. **Legacy JWT/`tokens`/`session_version` path** is removed.
8. **CORS** supports credentialed cookie auth when API and auth services interact cross-origin.

## Phased outcomes

### Phase 0 — Foundation

Configure UUID ids (`advanced.database.generateId = "uuid"`); regenerate `@ansari/auth` schema;
resolve `user`/`users` consolidation; prove one migrated user can authenticate via Better Auth.

### Phase 1 — New-user cutover

Decouple register/login from legacy JWT issuance; route new users through `apps/auth`; teach
`apps/api` middleware to accept Better Auth sessions for protected routes.

### Phase 2 — Existing-user migration

Run one-time SQL migration (ported migration framework) to populate Better Auth tables; enable dual
bcrypt/scrypt verification.

### Phase 3 — Legacy decommission

Remove JWT issue/refresh/logout routes, `tokens` table usage, and `session_version` checks.

### Phase 4 — Admin, hardening, documentation

Wire admin plugin; update bootstrap script; fix CORS; update tests and architecture docs.

### Phase 5 (optional) — Hosting consolidation

Move handler to `apps/api` (`toNextJsHandler`); retire standalone `apps/auth` service if desired.

## Stakeholders

- **Primary users:** Existing Ansari users who must retain login access without password reset.
- **Secondary users:** Administrators; operators of system-attributed endpoints.
- **Technical team:** Backend maintainers implementing migration phases and applying DB migrations at
  deploy.
- **Business owners:** IASER / Ansari project owners accountable for auth posture and uptime.

## Success Criteria

- [ ] Adapt-vs-migrate decision documented with reasoning.
- [ ] All eight issue questions answered (above).
- [ ] Phased plan: each phase independently shippable and revertible.
- [ ] Explicit credential migration story (bcrypt copy + dual verify + spike gate).
- [ ] `arch-critical.md` delta identified (below).
- [ ] No implementation in this issue — follow-up issues per phase.

## Constraints

- **No implementation in #60** — this spec only; work is tracked in separate issues.
- **DB changes:** `drizzle-kit generate` → review SQL → human-applied at deploy. Never `db:push`.
- **Invariants from spec 4 that survive:** admin never by email; system by `system_key`; reserved
  system addresses blocked at registration.
- **Failure mode to design against:** silent mass lockout of existing users.
- **CORS:** Wildcard origin incompatible with cookie auth — must be fixed before credentialed
  cutover to `apps/api`.

## Assumptions

- #59 scaffold is runnable and remains the starting point for Better Auth integration.
- bcrypt hashes copied to `account.password` are compatible with Better Auth's verification hook
  (validated in Phase 0 spike).
- A ported SQL migration framework exists or will land before Phase 2 implementation.
- Frontend can be pointed at `apps/auth` for auth flows during Phase 1 without breaking existing
  sessions for legacy users.

## `arch-critical.md` changes

| Current | After migration |
|---------|-----------------|
| Token embeds `session_version`; bump kills all sessions | Better Auth session invalidation |
| JWT secret via validated `config.auth` | Better Auth secret / session config via `@ansari/auth` env |
| Token rotation in `tokens` table | Better Auth session lifecycle |
| Admin = `users.is_admin` DB flag | Admin plugin (+ transitional bridge) |
| **Unchanged** | System accounts by `system_key`; admin never email-match; drizzle migrate never db:push |

## Risks

| Risk | Mitigation |
|------|------------|
| Mass credential lockout | Phase 0 spike; dual verify; idempotent migration; keep legacy path until verified |
| `user`/`users` confusion | Deliberate consolidation in Phase 0; document mapping |
| CORS breaks cookie auth | Explicit allowlist + sync test before API integration |
| Parallel auth complexity during dual-run | Time-boxed phases; feature flags; clear rollback per phase |
| Admin regression during plugin transition | Dual-check period; rewrite admin authz tests |

## Out of Scope

- OAuth, 2FA, email verification, passkeys (future Better Auth configuration).
- Rate limiting, MCP auth, spend caps, message-size limits.
- Implementation of any migration phase (separate issues).
- Detailed file-level implementation steps (belong in `codev/plans/60-better-auth-migration.md`).

## References

- GitHub issue #60
- #59 review: `codev/reviews/59-build-better-auth-in-apps-auth.md`
- [Better Auth — Database / UUIDs](https://better-auth.com/docs/concepts/database#uuids)
- [Better Auth — Email & password configuration](https://better-auth.com/docs/authentication/email-password#configuration)
- [Better Auth — Admin plugin](https://better-auth.com/docs/plugins/admin)
- Spec 4 (auth hardening invariants): `codev/specs/4-auth-hardening-admin-roles-in-.md`
