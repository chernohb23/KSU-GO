# KSU-GO: ground rules for coding agents

## What this project is

KSU-GO is a mobile app that helps Kennesaw State University students find and reach campus events.

- **Campus map.** A stylized, game-like 3D map of one section of campus. Every event today is a flag on its building: taller means it starts sooner, and the color shows live, soon or later. It does not need to match the real campus.
- **Event card.** Tapping a flag opens the event details and a register button.
- **Indoor route.** A low-poly 3D route from the building entrance to the room door, with stairs, elevators, turns and floors.
- **Video-to-route.** An organizer films one phone video from the entrance to the room, and AI turns it into the route. This is the core of the product.

**AI drafts, code verifies, the organizer confirms.** Students never see AI output directly. Event data is seeded sample data, with no login and no connection to real university systems.

## Where things are

| Path | What it is |
|---|---|
| `app/` | Expo app (TypeScript): screens, API client, and the WebView that hosts the viewer |
| `viewer/` | three.js scenes (Vite), built into one self-contained HTML file. `src/campus/` is the map; `src/route/` is the indoor route. |
| `server/` | FastAPI backend (Python): events, routes, and the video-to-route pipeline |
| `shared/` | `types.ts`, `instructions.ts` and `fixtures/`, used by every part |
| `docs/pipeline.md` | Pipeline details, outside-service facts, video handling and filming rules. Read it for 🤖 AI + server tickets. |
| `pitch/` | Presentation material, not code |

**`CONTRACTS.md` is the source of truth** for data shapes, API endpoints, the app-to-viewer messages, and who owns which directory.

## How we work

1. **Read before writing.** Read the ticket, `CONTRACTS.md`, and the code you will touch before writing anything. Diagnose before you implement.
2. **Ask instead of assuming.** If the ticket is unclear, or seems to need a contract change, stop and say so. Never edit `CONTRACTS.md`, `shared/types.ts` or a fixture's shape to make your code fit.
3. **Git.**
   - Work on a branch named `{name}-{ticket}-{summary}`, for example `yourname-APP-3-event-card`. You may commit on that branch.
   - Never commit to `main`, never force-push, and never amend pushed commits.
   - Never commit `.env` files, videos, or anything under `server/data/`.
   - The human opens and merges the pull request.
4. **One ticket at a time.**
   - Take tickets only from the Todo column. Have one In Progress ticket at a time, unless you are waiting on something.
   - Ask the human before creating or editing GitHub issues or board items.
   - Change only the directories your ticket names. Read the others freely.
5. **Verify honestly.**
   - Run the type check and tests for your part before saying you're done.
   - Never weaken or delete a test to make it pass.
   - Say plainly what you did not verify, such as "not tried on a real iPhone".
6. **Review.** Self-merge is fine once the local type check and tests pass. There is no CI. Only changes to `CONTRACTS.md` or `shared/types.ts` need a teammate's review. Fixtures and `shared/instructions.ts` merge without review.
7. **No extras.** Add no new MCP servers, services or dependencies beyond the ticket's "Pre-approved libraries" line without asking the human.

## Money and API keys

1. All paid keys (Gemini, Replicate, and any 3D generation service) are Juan's and live only on Juan's laptop; the server's keys are in `server/.env` there. No other machine needs them.
2. Everyone builds and tests in mock mode, which needs no keys. Tests never make paid calls; they use recorded responses. Live checks are manual runs on Juan's server.
3. Live runs go through Juan's server, which enforces the spend cap (see `docs/pipeline.md`). Tickets labelled "💳 Costs money" need Juan's OK before a live run.
4. Never read, print, log, copy or commit a key or a `.env` file. Never put a key in the app: `EXPO_PUBLIC_` variables are bundled into the app and are public.
5. Never raise `BUDGET_CAP_USD`, add a paid service or model, or retry paid calls in a loop.
6. Keys never go in issues, pull requests, chat, screenshots or logs. If one leaks, tell Juan immediately so he can revoke it.

## Product rules

1. **Expo Go only.** Use only libraries that Expo Go includes. No custom native modules, native config plugins or `expo prebuild`.
2. **3D lives in `viewer/`.** The viewer builds to one HTML file that makes no network requests, with any 3D models inlined and kept small. The app never imports three.js; it talks to the viewer only through the messages in `CONTRACTS.md`.
3. **Everything runs from fixtures.** The app works with no server and shows an "Offline data" badge when it does. The viewer works in a desktop browser with `?scene=campus` or `?scene=route`. The server works in mock mode with no keys.
4. **The API stays responsive.** Pipeline runs happen off the request thread. A route left in `processing` by a restart becomes `failed`.
5. **Location privacy.** Strip all metadata from a video, and assert that no GPS remains, before any part of it goes to an outside service.
6. **Original art only.** Inspired by location-based games, but no names, characters, art, sounds or interface copied from Pokémon, Nintendo, Niantic or any other game.
7. **Wording.** In anything a user reads, the route is "drafted by AI from the video and drawn from the step list", never a 3D reconstruction or a scan. Describe the verifier only by checks that exist in the code.
8. **Keep it small.** No new framework, state library or database. The server keeps data in memory and in JSON files under `server/data/`. TypeScript is strict, with no `any` in types that mirror `CONTRACTS.md`.

## Commands

| Directory | Command | Purpose |
|---|---|---|
| `app/` | `npx expo start` | Run the app in Expo Go (see `app/README.md` for the setup that works from WSL) |
| `app/` | `npm run typecheck` | Type check |
| `viewer/` | `npm run dev` | Viewer in a desktop browser |
| `viewer/` | `npm run build` | Build the single HTML file for the app |
| `viewer/` | `npm test` | Unit tests |
| `server/` | `uvicorn main:app --reload` | Run the API (mock mode by default) |
| `server/` | `pytest` | Tests |
