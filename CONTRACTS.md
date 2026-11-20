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
| `routes/*.json` | Routes for the demo building: confirmed routes, and `*.draft.json` drafts waiting for the organizer. `room-113.draft.json` is the prepared stage draft, baked by `server/scripts/bake_stage_draft.py` from the recorded route2 run. |
| `organizations.json` | Seed organizations (section 2, organization seed form). The server loads them at startup and stores every change and new organization in `server/data/state.json`. The app bundles the file for offline use. |

Every part must work from fixtures alone, with no server and no network.

## 2. Events

All times are ISO 8601 with offset. All ids are strings.

```ts
type Event = {
  id: string;
  title: string;
  description: string;
  organizationId: string;               // hosting organization, from organizations.json
  organizer: string;                    // display name; equals the hosting organization's name
  partnerOrganizationId: string | null; // optional co-host from organizations.json; never the host
  category: "academic" | "social" | "career" | "sports" | "arts" | "other";
  tags: string[];                       // lowercase, unique, at most 8, each 1 to 24 characters
  startsAt: string;
  endsAt: string;
  location: { buildingId: string; room: string };  // buildingId from campus.json
  routeId: string | null;               // derived by the server: the room's most recently confirmed route, else null
  capacity: number | null;              // display only; see Capacity
  registeredCount: number;
  status: "active" | "cancelled";       // see Cancelled events
};
```

**Seed form.** `events.seed.json` holds the same objects, but with `startsInMin` (negative means already started) and `durationMin` in place of `startsAt` and `endsAt`. The server at startup, and the app when it falls back to fixtures, convert them using the current time. The demo therefore always has live and upcoming events. Events created through `POST /api/events` are stored by the server with their exact `startsAt` and `endsAt`; they never go into the seed file.

**Ranges.** Both the server and the app in fixture mode use these. Ended and cancelled events are always left out, and results are sorted by `startsAt`.

| Range | Events included |
|---|---|
| `today` | start less than 24 hours from now. The map shows these. |
| `week` | start less than 7 days from now. Includes everything in `today`. |

Created events follow the same ranges as seeded ones. A created event therefore shows in `week` at once, and on the map once its start is less than 24 hours away.

**Flag rule.** The map and the event card must both use this.

| State | Condition | Flag |
|---|---|---|
| `live` | `startsAt <= now < endsAt` | live color, height 30 m, pulsing |
| `soon` | starts in 60 min or less | soon color |
| `later` | starts in more than 60 min | later color |
| ended | `now >= endsAt` | not shown |

For `soon` and `later`, `heightM = 12 + 18 * (1 - clamp(minutesUntilStart / 240, 0, 1))`. A flag stands at its building's `entrance`. Several flags at one building fan out around it.

**Capacity.** Capacity is display only. The app shows `registeredCount / capacity`, for example "34 / 50", and "Full" when `registeredCount >= capacity`. With `capacity: null` it shows only the count. Capacity never blocks registering.

**Times in the app.** The app shows every time in campus time (America/New_York), labeled "ET", whatever the phone's time zone.

**Room label.** One function names a room everywhere: in the app, on route doors, and in the same-room rule. A room that starts with a digit is "Room " plus the room ("Room 204"). Any other room is the name as entered, trimmed ("Atrium").

**Room directions.** A route belongs to a room: its `buildingId` plus its `destination`. An event is in a route's room when `location.buildingId` equals the route's `buildingId` and the room label of `location.room` equals the route's `destination`, ignoring case and surrounding spaces.

- Every event uses its room's most recently confirmed route, so `routeId` is never stored per event: the server derives it whenever it returns an event.
- Moving an event to another room, or confirming a route, changes `routeId` for every event in the affected rooms at once.
- Seed events carry `routeId` too. It must equal the derived value for bundled routes, so the app's offline fixtures agree with the server.

**Cancelled events.**

- `GET /api/events` never returns them, so they leave the map, Events and Discover.
- `GET /api/events/{id}` still returns them, with `status: "cancelled"`.
- A registered user sees them labeled "Cancelled" in Profile, with no "Take me there".
- The host organization's owner sees them in the organization's events.
- Registering for or editing a cancelled event is `409 event_cancelled`. Cancelling can't be undone.

**Organizations.** Organizations are stored by the server.

- Any signed-in user can create one and becomes its owner. One user can own several.
- Only the owner edits an organization and manages its events and their directions.
- The seed organizations in `organizations.json` have no owner, except `org-robotics-club`, which Noah Brooks owns.
- Logos are original initials badges, never real logos. Real-world approval of new organizations is out of scope.
- Every event's `organizationId`, and its `partnerOrganizationId` when not null, names an existing organization. The server writes `organizer` from the host's current name, so renaming an organization renames it on its events.

```ts
type Organization = {
  id: string;                   // "org-" + slug of the name at creation, plus a suffix if taken; never changes
  name: string;                 // 2 to 60 characters after trimming; unique, ignoring case
  description: string;          // 1 to 280 characters after trimming
  logo: {
    initials: string;           // 1 to 4 capital letters, e.g. "RC"
    color: "gold" | "ink";      // badge background: "gold" is ink initials on gold, "ink" is paper initials on ink
  };
  memberCount: number;          // "members": entered by the organization, a whole number from 0 to 100000
  meets: string | null;         // e.g. "Tuesdays 6 PM, Mathematics 215"; 1 to 80 characters
  contactEmail: string | null;  // trimmed and lowercased; one "@" with text on both sides; at most 254 characters
  website: string | null;       // an https:// URL, at most 200 characters
  ownerId: string | null;       // the owning user's id; null for unowned seed organizations
  followerCount: number;        // "followers": set by the server from real follows
};
```

**Organization seed form.** `organizations.json` holds `Organization` objects without `followerCount`. The app shows 0 followers until the server answers.

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

Base URL comes from `EXPO_PUBLIC_API_URL`. All paths start with `/api`. Bodies are JSON unless noted.

**Accounts.** Sign-in uses demo accounts checked by this server. It is not university sign-in and is not connected to any university system.

- `POST /api/auth/signup` creates an account that owns no organizations. Creating an organization is how anyone becomes an organizer: an organizer is a user who owns at least one.
- The server seeds two demo accounts at startup: Maya Chen (`student@ksu-go.example`) and Noah Brooks (`organizer@ksu-go.example`), who owns `org-robotics-club`. Their demo-only passwords are in `app/README.md`.
- Passwords are stored only as `scrypt` hashes, each with its own salt. A token is a random string from `secrets.token_urlsafe`. The server stores only its SHA-256 hash, and the token expires 7 days after it was issued.
- Accounts, sessions, profiles, follows, registrations, organizations and created or edited events persist in `server/data/state.json`.
- The server never logs a password or a token.

**Auth header.** A signed-in request sends `Authorization: Bearer <token>`. Open endpoints ignore the header.

- An endpoint that needs sign-in answers `401 unauthenticated` when the header is missing or the token is unknown or expired.
- It answers `403 forbidden` when the signed-in user doesn't own the organization the call needs.
- Sign-in and ownership are checked before the body for every endpoint whose ids are in the path or query, so a request with no token is `401`, and a non-owner is `403`, even when the body is invalid. The one exception is `POST /api/events`, whose `organizationId` is in the body.

```ts
type User = {
  id: string;
  name: string;                         // 1 to 80 characters after trimming
  email: string;                        // stored trimmed and lowercased
  profile: {
    major: string | null;               // 1 to 60 characters
    classYear: number | null;           // graduation year, from the current year - 1 to the current year + 7
    bio: string | null;                 // 1 to 160 characters
    avatarColor: "gold" | "ink" | "amber";
  };
  ownedOrganizationIds: string[];       // organizations whose ownerId is this user
  followingOrganizationIds: string[];   // in follow order
};

type AuthResponse = { token: string; user: User };

/** A registration of the signed-in user, for Profile. */
type MyRegistration = { event: Event; registeredAt: string };
```

**Who may call what.**

| Access | Endpoints |
|---|---|
| Open | `GET /api/health`, `GET /api/events`, `GET /api/events/{id}`, `GET /api/routes/{id}`, `GET /api/organizations`, `GET /api/organizations/{id}`, `GET /api/organizations/{id}/events`, `POST /api/auth/signup`, `POST /api/auth/login` |
| Signed in | `GET /api/me`, `PUT /api/me/profile`, `GET /api/me/registrations`, `POST /api/auth/logout`, `POST /api/events/{id}/register`, `POST /api/organizations`, `POST /api/organizations/{id}/follow`, `DELETE /api/organizations/{id}/follow`, `POST /api/events` (then owner of its `organizationId`) |
| Owner of the organization | `PUT /api/organizations/{id}` |
| Owner of the event's host organization | `PUT /api/events/{id}`, `POST /api/events/{id}/cancel`, `GET /api/events/{id}/registrations`, `GET /api/events/{id}/directions`, `POST /api/routes?eventId={id}` |
| Owner of the host organization of the route's event | `PUT /api/routes/{id}/steps`, `POST /api/routes/{id}/confirm` |

A route belongs to the event it was uploaded for. The bundled stage draft `route-math-113-draft` belongs to `ev-25`.

**Offline.** Signing in, signing up and creating events need the server. With no server, the sign-in screen offers "Browse offline": a read-only guest who can browse events, open event details and walk confirmed routes, all from fixtures. Registering and organizer actions need a sign-in. Organizations, profiles, follows and event management need the server too; offline, the bundled organizations show read-only. If a signed-in user's server stops answering, the app falls back to fixtures as before, and anything that needs the server says so. The "Offline data" badge rule in section 7 is unchanged.

| Method and path | Request | Response |
|---|---|---|
| `GET /api/health` | | `{ "ok": true, "pipelineMode": "mock" \| "live" }` |
| `GET /api/events` | optional query `range=today` (default) or `range=week` | `Event[]` in that range (section 2) |
| `GET /api/events/{id}` | | `Event` |
| `POST /api/events` | `CreateEventRequest` | `201` with the new `Event`. See **Creating events** below. |
| `PUT /api/events/{id}` | `EditEventRequest` | `Event`. The rules of **Creating events**, except `startsAt` may also stay exactly what it was. A cancelled event is `409 event_cancelled`; an ended one is `invalid_request`. |
| `POST /api/events/{id}/cancel` | | `Event` with `status: "cancelled"`. Repeating it changes nothing. An ended event is `invalid_request`. |
| `POST /api/events/{id}/register` | no body | `{ "registered": true, "registeredCount": number }`. Recorded per signed-in user, with the time. Repeating it for the same user changes nothing. A cancelled event is `409 event_cancelled`. |
| `GET /api/events/{id}/registrations` | | `{ "registeredCount": number, "people": { "userId": string, "name": string, "registeredAt": string }[] }`, newest first. `registeredCount` also counts seeded and device registrations, which have no name. |
| `GET /api/events/{id}/directions` | | `{ "state": "confirmed" \| "processing" \| "draft" \| "failed" \| "none", "route": Route \| null }`: the room's confirmed route if there is one; else the newest unconfirmed route uploaded for this event while it was in this room; else `none`. |
| `GET /api/organizations` | | `Organization[]` sorted by name |
| `GET /api/organizations/{id}` | | `Organization` |
| `GET /api/organizations/{id}/events` | optional query `when=upcoming` (default: not ended) or `when=past` (ended, newest first) | `Event[]` hosted by the organization, cancelled included |
| `POST /api/organizations` | `OrganizationRequest` | `201` with the `Organization`; the caller owns it. A name already in use, ignoring case, is `invalid_request` with the message "An organization with this name already exists." |
| `PUT /api/organizations/{id}` | `OrganizationRequest` | `Organization`. Same rules; the `id` never changes. |
| `POST /api/organizations/{id}/follow` | | `{ "following": true, "followerCount": number }`. Repeating it changes nothing. |
| `DELETE /api/organizations/{id}/follow` | | `{ "following": false, "followerCount": number }`. Repeating it changes nothing. |
| `PUT /api/me/profile` | `ProfileRequest` | `User` |
| `GET /api/me/registrations` | | `MyRegistration[]`: every account registration of the caller, ended and cancelled included, sorted by the event's `startsAt`. |
| `POST /api/auth/signup` | `{ "name": string, "email": string, "password": string }` | `201` with `AuthResponse`, role `student`. `name` is 1 to 80 characters after trimming. `email` is trimmed and lowercased, at most 254 characters, has one `@` with text on both sides, and is not already in use. `password` is 8 to 128 characters. Anything else is `invalid_request`; an email already in use is `invalid_request` with the message "An account with this email already exists." |
| `POST /api/auth/login` | `{ "email": string, "password": string }` | `AuthResponse` with a new token. The email is matched trimmed and lowercased. A wrong email or a wrong password is `401 unauthenticated`, with the same message for both. |
| `POST /api/auth/logout` | | `204`, no body. The presented token stops working. |
| `GET /api/me` | | `User` |
| `POST /api/routes?eventId={id}` | query `eventId`; multipart: `video` (file), `startFloor`, `destinationFloor` | `202` with a `Route` in `processing`, whose `buildingId` and `destination` (the room label) come from the event. The caller must own the event's host organization; the event must be active and not ended. If its room already has a confirmed route, the answer is `409 room_has_route`. These checks run before any of the video is read. |
| `GET /api/routes/{id}` | | `Route`. The app polls this every 3 s while `processing`. |
| `PUT /api/routes/{id}/steps` | `{ "steps": Step[] }` | `Route` with the new steps and fresh `checks`. Only allowed in `draft`. The steps must begin and end with a `door`, or the call is an `invalid_request`. |
| `POST /api/routes/{id}/confirm` | | `Route` in `confirmed`. It becomes its room's route, so every event in the room uses it at once (**Room directions**, section 2). If the room got a confirmed route in the meantime, the answer is `409 room_has_route`. |

**Creating events.**

```ts
type CreateEventRequest = {
  title: string;                        // 1 to 120 characters after trimming
  description: string;                  // 1 to 2000 characters after trimming
  organizationId: string;               // an organization the caller owns
  partnerOrganizationId: string | null; // null, or another existing organization
  category: Event["category"];          // required; no default
  tags: string[];                       // may be empty; normalized as below
  startsAt: string;                     // ISO 8601 with an explicit offset
  durationMin: number;                  // whole minutes, 1 to 1440
  location: { buildingId: string; room: string };  // buildingId from campus.json; room 1 to 40 characters after trimming
  capacity: number | null;              // null, or a whole number of at least 1
};
```

- Every key is required. `partnerOrganizationId` and `capacity` use `null` for none; `tags` uses `[]`.
- An `organizationId` the caller doesn't own is `403 forbidden`.
- Text fields are stored trimmed. Tags are trimmed, lowercased and deduplicated, keeping the first occurrence; after that there must be at most 8, each 1 to 24 characters.
- `startsAt` needs an explicit offset (`Z` or `±hh:mm`) and must satisfy `now < startsAt < now + 7 days`, on date and time, so a new event always falls in the `week` range.
- The server sets the remaining fields: a new unique `id`; `organizer`, the host organization's name; `endsAt = startsAt + durationMin`; `registeredCount: 0`; `status: "active"`; and the derived `routeId`.
- The response's `startsAt` is the same instant that was sent; its offset may differ.
- Any other violation is `invalid_request`.
- The event is saved in `state.json`. `GET /api/events` and `GET /api/events/{id}` return it from then on, also after restarts. An edited seed event is saved the same way and keeps its exact times from then on.

```ts
/** Body of PUT /api/events/{id}. The host organization can't change. */
type EditEventRequest = Omit<CreateEventRequest, "organizationId">;

type OrganizationRequest = {
  name: string;
  description: string;
  logo: { initials: string; color: "gold" | "ink" };
  memberCount: number;
  meets: string | null;
  contactEmail: string | null;
  website: string | null;
};

/** Body of PUT /api/me/profile. Every key is required; null clears an optional field. */
type ProfileRequest = {
  name: string;
  major: string | null;
  classYear: number | null;
  bio: string | null;
  avatarColor: "gold" | "ink" | "amber";
};
```

Errors use the right HTTP status and this body:

```json
{ "error": { "code": "route_has_failed_checks", "message": "Fix the failed checks before confirming." } }
```

| Code | Status | When |
|---|---|---|
| `not_found` | 404 | unknown event, route or organization |
| `invalid_request` | 422 | body does not match this file |
| `unauthenticated` | 401 | no token, or an unknown or expired one, on an endpoint that needs sign-in; or a wrong email or password at login |
| `forbidden` | 403 | the signed-in user doesn't own the organization this call needs |
| `room_has_route` | 409 | uploading or confirming directions for a room that already has a confirmed route: "This room already has directions. Events here use them." |
| `event_cancelled` | 409 | registering for, or editing, a cancelled event |
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
