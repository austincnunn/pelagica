# CLAUDE.md

Pelagica is a third-party [Jellyfin](https://jellyfin.org) client: a React web app (self-hosted via Docker), a Wails v3 desktop app, and Samsung Tizen / LG webOS TV apps. GPL-3.0. Apple TV lives in a separate repo (`PelagicaApp/pelagica-atv`).

## Layout

pnpm workspace (`pnpm-workspace.yaml`) + go-task (`Taskfile.yml`) monorepo.

| Path | What |
|------|------|
| `frontend/` | Web/desktop React 19 SPA (`pelagica` package). Vite 8, Tailwind 4, shadcn/ui (new-york), TanStack Query, react-router, video.js |
| `packages/core/` | `@pelagica/core`: shared Jellyfin API client, TanStack Query hooks, config types, i18n init, utils. Used by web **and** TV |
| `packages/tv-frontend/` | `@pelagica/tv-frontend`: TV UI (Base UI + shadcn, spatial navigation via `@noriginmedia/norigin-spatial-navigation`, custom layer-stack router in `src/router/`, not react-router) |
| `packages/tv-platform/` | `@pelagica/tv-platform`: Tizen/webOS adapters (remote keys, gamepad, local IP, AVPlay vs video.js player) |
| `tizen/`, `webos/` | Thin Vite shells: `src/main.tsx` calls `setClientInfo`, inits navigation, renders `@pelagica/tv-frontend`. Build to `www/` with `base: './'` |
| `backend/` | Go 1.25 + Fiber v3 API on `:4321`, served under `/api` (themes, studio logos/SQLite DB, Seerr proxy, stats consent, branding, server address) |
| `desktop/` | Wails v3 (alpha) Go shell. Embeds `frontend/dist` and reimplements a **subset** of backend routes with `net/http` |

Workspace packages export raw TS source (`"exports": "./src/index.ts"`), no build step. Consumers compile them.

## Commands

Run from repo root (requires `task`, `pnpm`, Go 1.25). Root `package.json` has no scripts; use Taskfile.

```bash
task dev                    # backend (:4321) + frontend Vite (:3000, proxies /api → backend)
task frontend               # frontend only (MODE=demo|desktop optional)
task backend                # Go backend only, env from backend/Taskfile.yml, data in ./config/
task checkup                # all lint + format checks (frontend, tv-frontend, tizen, webos)
task lint / task format     # frontend ESLint / Prettier (lint:fix, format:check also exist)
task desktop                # build frontend in desktop mode, copy dist, `go run .`
task desktop:generate-bindings  # regenerate frontend/src/bindings from Go services
task tizen:dev / task webos:dev # TV UI in a plain browser
task tizen:build / task webos:build
task docker                 # build + run local image on :8080
task version VERSION=x.y.z  # bump version in every tracked place (see below)
```

Type-check the web app with `pnpm --filter pelagica build` (`tsc -b && vite build`). There is no separate `typecheck` script and **no test suite**. The only automated check is `node --test packages/core/src/api/embyRoutes.test.ts`, so otherwise verify with type-check + lint + running the app.

CI (`.github/workflows/lint.yml`) only runs ESLint + `prettier --check` in `frontend/`. Run `task checkup` locally to cover the TV packages too (they use **oxlint**, not ESLint).

## Code style

- Prettier everywhere: 4-space indent, single quotes, semicolons, `printWidth: 100`, `trailingComma: es5`. Run `task format` before finishing.
- TS strict with `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax` (use `import type` for types), `erasableSyntaxOnly` (no enums, no parameter properties, no namespaces).
- Frontend alias `@/` → `frontend/src`. Use `cn()` from `@/lib/utils` for class merging.
- `frontend/src/components/ui/**` and `frontend/src/bindings/**` are generated (shadcn / Wails). They're ignored by lint and format. Don't hand-edit bindings; regenerate them.
- Go: standard `gofmt`, `log/slog` for logging, errors returned as `models.APIError{Error: "..."}` JSON.

## Architecture notes

### Data access lives in `@pelagica/core`
- Jellyfin calls go through `getApi()` (`packages/core/src/api/getApi.ts`), which reads server URL + token from localStorage and uses `@jellyfin/sdk` `get*Api(api)` helpers.
- Hooks are TanStack Query wrappers in `packages/core/src/hooks/`. Follow the existing pattern: array `queryKey` (e.g. `['item', itemId]`), `...getRetryConfig()` from `utils/authErrorHandler`, explicit `staleTime`/`gcTime`, and mutations that `invalidateQueries` on related keys.
- **New core exports must be added to the barrel `packages/core/src/index.ts`.**
- Put a hook in core if TV could use it too. Web-only UI hooks go in `frontend/src/hooks/`.
- **Emby support:** login detects the server type (`detectServerType`) and stores it (`getServerType()` in `utils/localstorageCredentials.ts`). On Emby, `createApi` adds an axios interceptor that sets `X-Emby-Authorization` and maps Jellyfin 10.9+ routes back to Emby's `/Users/{userId}/...` paths (`api/embyRoutes.ts`). Gate Jellyfin-only features (Quick Connect, media segments, lyrics, Pelagica plugin, KefinTweaks watchlist) with `isEmbyServer()`. Emby quirks found against Emby 4.10:
  - no `ProductName` in `/System/Info/Public`, so the SDK's discovery rejects it (use core `findBestServer`)
  - `/Users/Me` → 500, not 404
  - user-scoped `?ids=` lookups drop music items, so the interceptor fetches single ids from `/Users/{id}/Items/{itemId}`
  - `DatePlayed` must be `yyyyMMddHHmmss`
  - `Likes` is ignored
  - media source ids are `mediasource_<itemId>` (use `ItemId`)
  - missing images return 500
  - HLS transcodes restart with timestamps from 0 on resume/seek, which video.js can't realign in fMP4. Emby gets TS segments with H.264 only (`buildDeviceProfile` in `usePlaybackInfo.ts`)
- Every app must call `setClientInfo({ name, version, platform })` at startup. `getPlatform()` / `getPlatformCapabilities()` drive platform branching (direct-play codecs, navigation adapter).

### Admin config (`AppConfig`)
- Source of truth for the shape and defaults: `packages/core/src/hooks/useConfig.ts` (`AppConfig`, `HomeScreenSection` union, `DEFAULT_CONFIG`).
- Config is now read/written via the **Pelagica Jellyfin plugin** (`/Pelagica/Config` on the Jellyfin server, see `api/pelagicaPlugin.ts`, repo `PelagicaApp/jellyfin-plugin`), not the Go backend.
- `backend/models/config.go` + `GET /api/config` are a leftover mirror from the per-server file config and have already drifted (e.g. no `playerControlsLogoSize`). Check whether anything still uses them before extending.
- Adding a home section type means updating the union + defaults in core, the renderer in `frontend/src/pages/Home/`, the editor in `frontend/src/pages/Settings/tabs/HomeSectionsTab.tsx`, and the TV equivalent in `packages/tv-frontend/src/components/home/` if supported there.

### Backend (`backend/`)
- Routes are all in `backend/main.go`. Write endpoints use the `protected` middleware (Jellyfin token must belong to an admin; disabled when `ENABLE_AUTH != true`).
- Per-server data is namespaced by the `jellyfin_url` query param → `serverKeyFromURL` (`handlers/serverkey.go`) → `$SERVERS_DIR/<key>/`. Frontend calls always append `?jellyfin_url=...`.
- Frontend reaches it via `withBasePath('/api/...')` (`packages/core/src/utils/basePath.ts`) so `BASE_PATH` sub-path deploys keep working. Never hardcode `/api` or absolute app paths.
- Prod: one container runs nginx (static SPA + `/api/` proxy) and the Go binary (`Dockerfile`, `nginx.conf`). Env vars are listed in the Dockerfile.

### Desktop (`desktop/`)
- No Fiber backend. `desktop/main.go` + `seerr_handler.go` + `stats_collector.go` + `studios_logo_handler.go` reimplement the Seerr, stats-consent and studio-logo routes. **If you change one of those backend endpoints, mirror it in `desktop/`.** Themes/config/branding routes don't exist there.
- Frontend detects desktop with `isDesktopBuild` (`VITE_IS_DESKTOP_BUILD`, set by `frontend/.env.desktop`) plus `isDesktopApp()` (runtime `window._wails`). Native calls are dynamically imported from `@/bindings/pelagica-desktop`, see `frontend/src/utils/desktopApp.ts`. Open external links with `openExternalUrl()`.
- Frontend is embedded at build time, so re-run `task desktop` after frontend changes.

### TV (`tizen/`, `webos/`, `packages/tv-*`)
- No backend on TV. Anything that relies on `/api/*` (themes, Seerr proxy, studio DB) won't work there. TV fetches studio logos straight from `studios.pelagica.app` with an IndexedDB cache (`tv-frontend/src/lib/studio-logos.ts`).
- Everything except `window.tizen` / `webOS` APIs and hardware keys works in a desktop browser via `task tizen:dev`.
- Focusable UI uses `Focusable*` components and `useLayerFocusable`. Keep new interactive TV elements navigable by remote.

### i18n
- Translations come from the external npm package `@pelagica/i18n` (managed on Twoglot), initialized in `packages/core/src/i18n`. There are no locale files in this repo. Use `useTranslation()` / `t('snake_case_key')` with keys that already exist. New keys have to be added upstream in that package, so flag it to the user rather than inventing keys silently.

## Versioning & releases
- `task version VERSION=x.y.z` updates `frontend/package.json`, `tizen/package.json` + `public/config.xml`, `webos/package.json` + `public/appinfo.json`, `backend/Taskfile.yml` (`APP_VERSION`), `desktop/build/config.yml` + platform files. Don't bump versions by hand.
- Publishing a GitHub release triggers Docker (multi-arch, plus `-basepath` variant), desktop (mac signed/notarized, Windows NSIS, Linux deb/pkg/AppImage), Tizen `.wgt`, webOS `.ipk`, and demo site deploys.

## Git workflow
- `origin` is a fork. `upstream` is `PelagicaApp/pelagica`.
- Feature PRs target **`develop`**. `validate-pr-target.yml` rejects any PR into `main` whose head isn't `develop`.
- Commit messages: short imperative sentence, capitalized, no prefix (e.g. `Fix quick connect not correctly resetting`, `Add QR code quick connect to web ui`).

## Gotchas
- `dev.config.json`, `config/`, `cache/`, `branding`, and `backend/themes` are gitignored local runtime data.
- `frontend/vite.config.ts` splits video.js into its own chunk and honours `BASE_PATH`. Keep both when editing.
- `pnpm-workspace.yaml` has security `overrides` and `allowBuilds` restrictions. Don't drop them when touching deps.
- Wails is pinned to `v3.0.0-alpha2.117` (Go) / `@wailsio/runtime 3.0.0-alpha.97` (JS). Upgrade both together.
