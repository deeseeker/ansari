# Ansari Expo prototype

An Expo (SDK 54) mobile/web prototype of the Ansari app, currently on the
**Replit-sourced dark-mode design** (dark mode, collapsible sidebar, source
panel, a motion/layout/radius token system) but **not wired to any backend**.

It lives in `prototypes/` and is deliberately **outside** the pnpm workspace
and the Turborepo task graph (`pnpm-workspace.yaml` globs only `apps/*` and
`packages/*`). Do **not** move it under `apps/`, add it to the workspace, or
wire it into CI — it targets a different toolchain and installs its own
isolated `node_modules`.

## Current state: design only, not wired (issue #121)

This prototype went through two rounds of independent divergence from a
common ancestor:

1. An earlier pass wired it to this repo's real backend — auth
   (`lib/auth/`), a hand-built SSE client (`lib/api/`), and an incremental
   streaming reconciler (`lib/chat-reconcile.ts`, `lib/chat-trace.ts`).
2. A separate Replit-hosted pass rebuilt the entire UI: dark mode, the
   sidebar, the source panel, and near-total rewrites of every page and most
   components.

Issue #121 took the Replit design as source of truth for `app/`,
`components/`, `constants/`, `hooks/`, and most of `lib/`, **without**
re-wiring the real-backend code back onto it. So today:

- `app/index.tsx` and `app/chat/[id].tsx` call the vendored
  `@workspace/api-client-react` client directly (`useCreateConversation`,
  `useListSuggestedQuestions`, `useSendMessage`, `useGetConversation`) —
  **not** `lib/api/`.
- `app/_layout.tsx` calls that client's `setBaseUrl()` with
  `EXPO_PUBLIC_DOMAIN`, a Replit-workspace variable nothing here sets — so
  those calls resolve against no real host and **the network requests are
  expected to fail**. This shows up as an error/empty state on screens that
  fetch data (e.g. the home screen's suggested questions), not a crash.
- `lib/api/`, `lib/auth/`, `lib/chat-reconcile.ts`, `lib/chat-trace.ts` (and
  their tests) are still in the tree, untouched, but **nothing imports
  them** — `app/login.tsx` and `app/register.tsx`, their only callers, were
  removed along with the components tied to that wiring (`AuthForm`,
  `HistorySheet`, `CitationSheet`, `WebNavButton`).
- Registration, login, real thread history, streaming chat, and real
  citations do **not** work in this build. That's expected, not a bug —
  don't file it.

**Re-wiring the real backend onto this design is tracked in issue #124.**
Until then, this prototype is useful for reviewing the design
itself (open it, look at the screens, toggle dark mode) — not for testing
against staging.

## Known gaps from the port

- **Web fonts.** Native builds load the real Amiri/Inter/Literata faces via
  `useAppFonts.ts` (`useFonts`). On web, `useAppFonts.web.ts` returns `true`
  unconditionally — in the Replit source this was safe because
  `public/index.html` preloaded real `@font-face` declarations for all three
  families. That `public/` directory wasn't ported (it's Replit's own
  hosting layer), so **the web build currently falls back to a system font**
  until a repo-appropriate font-loading strategy is added.

## Quick start

```bash
cd prototypes/ansari-expo
pnpm install --ignore-workspace   # see note below — the flag matters
pnpm start                        # expo start
```

Or, from the repo root, use the convenience alias — it runs the
`--ignore-workspace` install (a fast no-op once `node_modules` is current)
and then `expo start` for you:

```bash
pnpm prototype
```

Then: home screen (dark-mode-capable, sidebar, ambient palm-shadow layer) →
open a chat thread → sidebar collapses/expands (desktop) or opens as a
drawer (narrow width) → open the source panel from a citation affordance →
About page. Expect the suggested-questions and send-message network calls to
fail (see above) — everything else is static UI, not backed by real data.

> **Why `--ignore-workspace` is required.** This prototype sits inside the
> repo, which is a pnpm workspace. On `pnpm install`, pnpm walks UP the
> directory tree, finds the root `pnpm-workspace.yaml`, and installs **that
> workspace** (its `apps/*` + `packages/*`) — not the package in your current
> directory. Since `prototypes/` isn't matched by the workspace globs, the
> prototype's own `package.json` is skipped entirely and no `node_modules` is
> created here. `--ignore-workspace` tells pnpm to ignore that root workspace
> file and treat this directory as a standalone project, so it installs
> *these* dependencies into an isolated `node_modules` here. That
> `node_modules`, any lockfile it writes, and `.expo/` are gitignored — and
> the root `pnpm-lock.yaml` is never touched.

## The `@workspace/api-client-react` bridge

The new pages import from the bare specifier `@workspace/api-client-react`
(matching the Replit source, which had it as a real workspace package). This
prototype instead resolves it to the vendored copy already at
`vendor/api-client-react/` via a `tsconfig.json` `paths` entry and a matching
Metro `resolver.extraNodeModules` entry in `metro.config.js` — no new runtime
dependency, no workspace membership. The vendored client's generated
hooks/types (`Citation`, `Message`, `SafetySignal`, `useCreateConversation`,
`useSendMessage`, etc.) already cover everything the new pages need.

`lib/api/` — the adapter that targets this repo's real `apps/api` — imports
the same vendored runtime under `@/vendor/api-client-react/...` (the
pre-existing `@/*` alias). Both import paths resolve to the same files; they
just aren't connected to each other.

## Test runner

Vitest (`pnpm test`), matching the rest of the repo. The 3 Replit
`lib/*.test.ts` files (`ambientNight.test.ts`, `keyboard.test.ts`,
`markdown.test.ts`) were ported from Replit's `node --test` syntax to
vitest's `describe`/`expect`/`it`. `lib/api/`, `lib/auth/`,
`lib/chat-reconcile.test.ts`, and `lib/chat-trace.test.ts` are untouched and
still pass — they don't depend on anything this port changed.

## Auth & token storage (kept, disconnected)

`lib/auth/` (token store, session context, auth API calls) is still in the
tree for issue #124, but nothing in the current UI mounts it — there's no
login/register screen to trigger it. See its own code and tests for how
it's meant to work once reconnected.

## Source + SHA

- **Design**: imported from a Replit build at local path
  `~/Downloads/Ansari`, `artifacts/ansari/`, upstream commit **`6c58e51`**
  ("Rebuild icons from Figma artwork").
- **API client vendoring** (unchanged from the earlier import): a separate
  Replit pnpm monorepo, source commit `896cd4c` — only the Expo app
  (`artifacts/ansari/`) and the React API client it depended on
  (`lib/api-client-react/src/` → `vendor/api-client-react/`) were imported.
  The vendored client's runtime (`custom-fetch.ts`: base URL + bearer
  wiring, and the React Native `response.body` workaround) is reused by both
  the new design's direct imports and `lib/api/`'s adapter.

## Version gaps a porter into `apps/frontend` will hit

Not defects — the translation list from this snapshot to the real frontend:

| Concern | Prototype | This repo |
|---|---|---|
| Expo SDK | 54 | 57 |
| React Native | 0.81.5 | 0.86.2 |
| TypeScript | 5.9 | 6.0 |
| zod | 3 | 4 |
| Styling | `StyleSheet.create` | uniwind `className` |

## Layout

```
prototypes/ansari-expo/
  app/                       Expo Router screens (index, chat/[id], about, _layout)
  components/                UI components (StyleSheet.create): sidebar, source
                              panel, chat, chrome, and shared primitives
  constants/                 colors (incl. dark mode), motion, radius, layout tokens
  hooks/                     fonts, keyboard, color scheme, sidebar/source-panel state
  lib/                       design helpers (ambientNight, hijri, haptics, toast, ...)
  lib/api/                   the apps/api adapter — kept, NOT wired into the new UI
  lib/auth/                  token store, session context, auth API — kept, NOT wired in
  lib/chat-reconcile.ts,     the PIR #65 streaming reconciler — kept, NOT wired in
  lib/chat-trace.ts
  lib/sample-citations.ts    sample citation data (consumed by lib/api/mappers.ts)
  lib/suggested-topics.ts    static suggested-questions list (consumed by lib/api/hooks.ts)
  assets/                    fonts, redrawn icons, ambient-shadow video
  vendor/api-client-react/   the imported orval client's runtime (custom-fetch.ts is reused)
```
