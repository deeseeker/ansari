# air-125 — Node version floor (issue #125)

Protocol: AIR (strict). Config-only change, no spec/plan/review files.

## What & why
Root cause behind #122: `tsdown@0.22.14` needs Node `^22.18.0 || >=24.11.0`. Below 22.18 it
falls back to `unrun` (uninstalled) and the auth build fails. Repo let a dev land on an
unsupported Node with no signal. Three changes, none sufficient alone:
1. `.nvmrc` `22` → `22.19.0` — removes runtime divergence (`nvm use` was resolving to newest
   locally-installed 22.x). Also pins CI (both jobs use `node-version-file: .nvmrc`).
2. `engines.node` `>=22.0.0` → `>=22.18.0` — declares the true floor. Applied to all THREE
   manifests that declare it: root, apps/api, apps/auth (auth is the one that actually breaks;
   api raised for consistency so the declared floor doesn't disagree across the repo).
3. `pnpm-workspace.yaml` `engineStrict: true` — turns the `engines` WARN into a hard refusal.
   Chosen over `.npmrc engine-strict` because `.npmrc` stops enforcing on pnpm >=11.

`.nvmrc` (22.19.0) vs `engines` floor (22.18.0) is a deliberate difference: floor = minimum
tsdown supports; pin = known-good exact runtime above the floor. Documented in PR body so nobody
"fixes" it into consistency.

Explicitly NOT done: adding `unrun`/`jiti` (rejected in #125).

## Verification (both directions, real user path = bare root install)
- FAIL on Node 22.16.0: `corepack pnpm@10.33.0 install --frozen-lockfile` (cwd = repo root) →
  `ERR_PNPM_UNSUPPORTED_ENGINE`, "Expected version: >=22.18.0  Got: v22.16.0", exit 1.
  (corepack because global pnpm lives under the 22.19.0 nvm prefix; same pinned pnpm@10.33.0.)
- PASS on Node 22.19.0: `pnpm install --frozen-lockfile` → "Already up to date", exit 0;
  `pnpm --filter ansari-auth build` → Build complete, dist/index.mjs 489.62 kB, exit 0.
- Confirmed no package under apps/* or packages/* declares a floor lower than 22.18.0.

No unit tests: purely declarative config; the both-directions install check is the verification.

## CI note
`.nvmrc` pin changes CI from "newest 22.x" to "exactly 22.19.0" (3 `setup-node` steps read it).
Intended — reproducibility over silent drift. Stated in PR body; four CI checks confirm on the pin.

## Architect
main reviewing personally (root config). Coordinated live on .nvmrc version + root-manifest
scope + real-user-path test requirement.
