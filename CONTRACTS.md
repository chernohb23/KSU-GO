# KSU-GO contracts

These are the strict interfaces between the parts of KSU-GO. Inside a part, build however you like. Anything that crosses a part boundary must match this file exactly. Change this file only with the whole team's agreement, in its own PR.

## 1. Repo layout

```
app/       Expo app (React Native, TypeScript). Runs in Expo Go.
viewer/    three.js scenes (Vite, TypeScript): campus map and indoor route.
server/    FastAPI backend and the video-to-route pipeline (Python).
shared/    types.ts (TypeScript version of this file) and fixtures/.
pitch/     Survey results, event counts, slides.
docs/      Reference docs (pipeline.md: pipeline details, outside services, filming rules).
```

| Path | Owner part | Others may |
|---|---|---|
| `app/` | App | read |
| `viewer/src/campus/` | Campus map | read |
| `viewer/src/route/` | Indoor route | read |
| `viewer/src/bridge.ts`, viewer build config | Campus map | read; changes need both viewer owners |
| `server/` | AI + server | read |
| `shared/types.ts` | everyone | change only together with this file; needs a teammate's review |
| `shared/instructions.ts` | Indoor route | read and import; merges without review |
| `shared/fixtures/` | everyone | content changes merge without review; shapes must match this file |

`shared/types.ts` is the TypeScript source for the shapes below. `server/models.py` mirrors them in pydantic. If they disagree, this file wins.

Fixtures in `shared/fixtures/`:

| File | Content |
|---|---|
| `events.seed.json` | Fake events for today and the following six days (section 2, seed form) |
| `campus.json` | Logical layout of the campus section (section 3) |
| `route.sample.json` | The hand-written sample route in section 4 |
| `route.draft-flawed.json` | The sample route as a `draft` with planted problems and their checks. Mock mode returns it, so the confirm screen is always built against a bad draft. |
| `routes/*.json` | Routes for the demo building: confirmed routes, and `*.draft.json` drafts waiting for the organizer |

Every part must work from fixtures alone, with no server and no network.

## 2. Events

All times are ISO 8601 with offset. All ids are strings.

```ts
type Event = {
  id: string;
  title: string;
  description: string;
  organizer: string;            // club or office name
  category: "academic" | "social" | "career" | "sports" | "arts" | "other";
  startsAt: string;
  endsAt: string;
  location: { buildingId: string; room: string };  // buildingId from campus.json
  routeId: string | null;       // confirmed route to the room; several events may share one
  capacity: number | null;
  registeredCount: number;
};
```

**Seed form.** `events.seed.json` holds the same objects, but with `startsInMin` (negative means already started) and `durationMin` in place of `startsAt` and `endsAt`. The server at startup, and the app when it falls back to fixtures, convert them using the current time. The demo therefore always has live and upcoming events.

**Ranges.** Both the server and the app in fixture mode use these. Ended events are always left out, and results are sorted by `startsAt`.

| Range | Events included |
|---|---|
| `today` | start less than 24 hours from now. The map shows these. |
| `week` | start less than 7 days from now. Includes everything in `today`. |

**Flag rule.** The map and the event card must both use this.

| State | Condition | Flag |
|---|---|---|
| `live` | `startsAt <= now < endsAt` | live color, height 30 m, pulsing |
| `soon` | starts in 60 min or less | soon color |
| `later` | starts in more than 60 min | later color |
| ended | `now >= endsAt` | not shown |

For `soon` and `later`, `heightM = 12 + 18 * (1 - clamp(minutesUntilStart / 240, 0, 1))`. A flag stands at its building's `entrance`. Several flags at one building fan out around it.

## 3. Campus

The campus scene is stylized and does not need to match the real campus. How it looks (procedural code, generated models, or extruded footprints) is internal to `viewer/src/campus/`. `campus.json` is the logical layout that every part shares: which buildings exist, where they stand, and where their flags go. The scene must place each building where this file says.

`campus.json` describes one section of campus in local meters. `x` is east, `z` is south (north is `-z`), `y` is up. The origin is the center of the section.

```ts
type Campus = {
  attribution: string | null;             // credit the map screen must show, e.g. "© OpenStreetMap contributors" if OSM data is used
  buildings: {
    id: string;                           // e.g. "b-engineering"
    name: string;
    footprint: [number, number][];        // [x, z] ring, not closed; approximate outline of the building
    heightM: number;
    entrance: [number, number];           // [x, z]
  }[];
  paths: [number, number][][];            // walkway polylines, [x, z]
};
```

## 4. Route

A route is an ordered list of steps from the building entrance to the room door. The viewer lays it out like turtle graphics, so the format carries no coordinates.

```ts
type Route = {
  id: string;
  version: 1;
  status: "processing" | "draft" | "confirmed" | "failed";
  progress: { stage: "ingest" | "timeline" | "geometry" | "assemble" | "verify"; pct: number } | null;
  error: string | null;                   // set when status is "failed"
  buildingId: string;
  destination: string;                    // e.g. "Room 204"
  startFloor: string;                     // e.g. "1"; entered by the organizer
  destinationFloor: string;               // e.g. "2"; entered by the organizer
  corridorWidthM: number;                 // default 2.0
  ceilingHeightM: number;                 // default 2.7
  steps: Step[];                          // empty while processing
  checks: Check[];                        // verifier results
  stats: { videoSec: number; processingSec: number; costUsd: number } | null;
  createdAt: string;
  confirmedAt: string | null;
};

type StepBase = {
  id: string;                             // unique within the route
  source: "ai" | "organizer";
  confidence: number | null;              // 0 to 1, from the AI
  tSec: number | null;                    // time in the source video
  note: string | null;                    // landmark or sign text, e.g. "past the vending machines"
};

type Step = StepBase & (
  | { type: "walk"; lengthM: number }
  | { type: "turn"; direction: "left" | "right" | "u_left" | "u_right" }
  | { type: "stairs"; direction: "up" | "down"; riseM: number; runM: number; toFloor: string | null }
  | { type: "elevator"; toFloor: string }
  | { type: "door"; label: string | null }
);

type Check = {
  id: string;                             // e.g. "leg_length_range"
  level: "pass" | "warn" | "fail";
  message: string;                        // shown to the organizer
  stepId: string | null;
};
```

**Layout rules.** Both the viewer and the verifier follow these.

- The route starts at the origin on the floor of `startFloor`, heading `-z`. Units are meters, `y` is up.
- `walk` moves forward `lengthM`.
- `turn` `left` and `right` rotate the heading 90° in place. Seen from above, left is counter-clockwise.
- `turn` `u_left` and `u_right` reverse the heading and shift the position sideways by `corridorWidthM` toward that side. This is how switchback stairs avoid overlapping.
- `stairs` moves forward `runM` and up or down `riseM`.
- `elevator` keeps the horizontal position and the heading, and changes the floor to `toFloor`. Height changes by 3.6 m per floor when the current floor and `toFloor` are both whole numbers (floor "1" to "3" is up 7.2 m); otherwise it goes up 3.6 m.
- The current floor starts as `startFloor` and changes at a `stairs` step with a `toFloor`, or at an `elevator` step.
- `door` is a marker at the current position and does not move it.
- The route ends at the position after the last step. That point is the destination.

**Checks.** The verifier attaches these. A check is `fail` only if the organizer's edits in the app can clear it; everything else is `warn`. A draft with a `fail` cannot be confirmed.

| Check id | Level | Meaning |
|---|---|---|
| `leg_length_range` | `fail` | A walk is shorter than 0.5 m. Deleting it clears the check. |
| `long_walk` | `warn` | A walk is longer than 80 m |
| `elevator_floor` | `fail` | An elevator's `toFloor` is the floor it is already on |
| `ends_on_destination_floor` | `warn` | The floor after the last step is not `destinationFloor` |
| `turn_motion_mismatch` | `warn` | The camera's motion in the video disagrees with this turn |
| `turn_from_motion` | `warn` | The video turns here but the AI reported no turn; the step was added for review |
| `low_confidence` | `warn` | The AI's confidence in this step is under 0.6 |
| `total_length`, `stair_rise`, others | `warn` | Plausibility checks; the `message` explains |

`low_confidence` and the two motion checks express the AI's doubt. They are not raised for a step whose `source` is `"organizer"`, so an organizer resolves one either by editing the step or by approving it unchanged, which sets its `source`.

A route's steps always begin and end with a `door`. The last door's label is the `destination`.

**Status lifecycle.** `processing` → `draft` (AI finished, checks attached) → `confirmed` (organizer approved). `processing` can also go to `failed`; a route still `processing` when the server restarts becomes `failed`. Students only ever see `confirmed` routes.

**Sample** (`route.sample.json`; `source`, `confidence`, `tSec`, `note` shortened here to keep it readable, but the file carries them on every step):

```json
{
  "id": "route-sample", "version": 1, "status": "confirmed", "progress": null, "error": null,
  "buildingId": "b-engineering", "destination": "Room 204", "startFloor": "1", "destinationFloor": "2",
  "corridorWidthM": 2.0, "ceilingHeightM": 2.7,
  "steps": [
    { "id": "s1",  "type": "door",   "label": "Main entrance" },
    { "id": "s2",  "type": "walk",   "lengthM": 8 },
    { "id": "s3",  "type": "turn",   "direction": "right" },
    { "id": "s4",  "type": "walk",   "lengthM": 5, "note": "past the vending machines" },
    { "id": "s5",  "type": "stairs", "direction": "up", "riseM": 1.8, "runM": 3, "toFloor": null },
    { "id": "s6",  "type": "turn",   "direction": "u_right" },
    { "id": "s7",  "type": "stairs", "direction": "up", "riseM": 1.8, "runM": 3, "toFloor": "2" },
    { "id": "s8",  "type": "walk",   "lengthM": 2 },
    { "id": "s9",  "type": "turn",   "direction": "left" },
    { "id": "s10", "type": "walk",   "lengthM": 14 },
    { "id": "s11", "type": "door",   "label": "Room 204" }
  ],
  "checks": [
    { "id": "leg_length_range", "level": "pass", "message": "No walk is shorter than 0.5 m.", "stepId": null }
  ],
  "stats": { "videoSec": 86, "processingSec": 600, "costUsd": 0.31 },
  "createdAt": "2026-11-17T09:00:00-05:00", "confirmedAt": "2026-11-17T09:20:00-05:00"
}
```

## 5. API

Base URL comes from `EXPO_PUBLIC_API_URL`. All paths start with `/api`. Bodies are JSON unless noted. There is no login; organizer mode is a switch in the app.

| Method and path | Request | Response |
|---|---|---|
| `GET /api/health` | | `{ "ok": true, "pipelineMode": "mock" \| "live" }` |
| `GET /api/events` | optional query `range=today` (default) or `range=week` | `Event[]` in that range (section 2) |
| `GET /api/events/{id}` | | `Event` |
| `POST /api/events/{id}/register` | `{ "deviceId": string }` | `{ "registered": true, "registeredCount": number }`. Repeating it for the same device changes nothing. |
| `POST /api/routes` | multipart: `video` (file), `buildingId`, `destination`, `startFloor`, `destinationFloor`, optional `eventId` | `202` with a `Route` in `processing` |
| `GET /api/routes/{id}` | | `Route`. The app polls this every 3 s while `processing`. |
| `PUT /api/routes/{id}/steps` | `{ "steps": Step[] }` | `Route` with the new steps and fresh `checks`. Only allowed in `draft`. The steps must begin and end with a `door`, or the call is an `invalid_request`. |
| `POST /api/routes/{id}/confirm` | | `Route` in `confirmed`. The route is then set as `routeId` on the upload's `eventId`, if there was one, and on every event in the same room that has no route. An event is in the same room when its `location.buildingId` equals the route's `buildingId` and `"Room " + location.room` equals the route's `destination`, ignoring case and surrounding spaces. A route belongs to a room and serves every event there. |

Errors use the right HTTP status and this body:

```json
{ "error": { "code": "route_has_failed_checks", "message": "Fix the failed checks before confirming." } }
```

| Code | Status | When |
|---|---|---|
| `not_found` | 404 | unknown event or route |
| `invalid_request` | 422 | body does not match this file |
| `wrong_status` | 409 | editing or confirming a route that is not a `draft` |
| `route_has_failed_checks` | 409 | confirming while any check is `fail` |
| `video_rejected` | 422 | video longer than 3 minutes, larger than 100 MB, or unreadable |
| `budget_exceeded` | 402 | the spend cap is reached; no pipeline run started |

**Mock mode.** With `PIPELINE_MODE=mock` the server skips the AI calls, walks through the `progress` stages over about 10 seconds, and returns `route.draft-flawed.json` as the draft under a new id. Its planted checks stay until the organizer edits or deletes the step they point at. Every endpoint behaves the same otherwise.

**Responsiveness.** A pipeline run never blocks the API. `GET /api/health` and `GET /api/routes/{id}` answer in under half a second while a run is in progress.

## 6. Viewer bridge

The viewer is one web bundle with two scenes. The app shows it in a `react-native-webview`. The viewer build produces a single self-contained HTML file with three.js inlined and no network requests (any 3D model files are inlined too), and the app loads it as an HTML string. The scene is chosen by the first `load` message.

Every message is a JSON object with a `type`.

**App to viewer.** The app calls `window.ksugo.receive(message)` through `injectJavaScript`.

| Type | Payload | Effect |
|---|---|---|
| `campus:load` | `{ campus: Campus, events: Event[], now: string, savedEventIds?: string[] }` | Build or refresh the campus scene and its flags. Flags of saved events may be highlighted; a viewer that ignores `savedEventIds` is still correct. |
| `campus:select` | `{ eventId: string \| null }` | Highlight one flag and move the camera to it |
| `route:load` | `{ route: Route }` | Build or rebuild the route scene |
| `route:goto` | `{ stepIndex: number }` | Move the camera to the start of that step |
| `route:play` | `{ playing: boolean }` | Start or stop the walk-through |

**Viewer to app.** The viewer calls `window.ReactNativeWebView.postMessage(JSON.stringify(message))`.

| Type | Payload | When |
|---|---|---|
| `ready` | `{}` | The viewer can receive messages. The app sends nothing before this. |
| `campus:flagTapped` | `{ eventId: string }` | The user tapped a flag |
| `route:stepChanged` | `{ stepIndex: number }` | The walk-through reached a new step |
| `error` | `{ message: string }` | Something failed inside the viewer |

**Browser mode.** Opened in a desktop browser, `window.ReactNativeWebView` is missing. The viewer then logs outgoing messages to the console and loads fixtures by itself: `?scene=campus` or `?scene=route`. Viewer work needs no phone.

## 7. Environment variables

| Variable | Used by | Meaning |
|---|---|---|
| `EXPO_PUBLIC_API_URL` | app | Default server base URL. A hidden settings screen in the app can override it at runtime. If no server answers, the app uses fixtures and shows an "Offline data" badge. |
| `PIPELINE_MODE` | server | `mock` (default) or `live` |
| `GEMINI_API_KEY` | server | Needed in `live` mode. Use a paid-tier key. |
| `REPLICATE_API_TOKEN` | server | Needed only when the MapAnything stage is used |
| `BUDGET_CAP_USD` | server | Refuse new pipeline runs at this total pipeline spend. Default `14`. |

Secrets live in `server/.env`, which is never committed. `server/.env.example` lists the names.
