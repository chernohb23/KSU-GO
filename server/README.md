# KSU-GO mock API

Run these commands from `server/` with Python 3.11 or newer.

```sh
python -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
uvicorn main:app --reload
```

On Windows PowerShell, activate the environment with
`.\.venv\Scripts\Activate.ps1` instead.

Open `http://localhost:8000/api/health` to check for
`{"ok":true,"pipelineMode":"mock"}`. Mock mode is the default and needs no keys.
The mock server accepts MP4 and MOV uploads up to 100 MB and 3 minutes. It checks
the container and sample metadata locally and reads durations from movie
fragments when needed.
Each upload returns a processing route and becomes a sample draft with planted
checks after about ten seconds of processing. Two uploads can run at once.
Additional uploads wait at the ingest stage for a worker.

Run `pytest` from this directory to check the API. The tests use temporary
storage and require no external services.

The server loads all fixture routes and resets edits to those routes when it
starts, including confirmation of the prepared stage draft. It saves uploaded
routes, timestamped account registrations, device registrations, created events,
edits and cancellations of seeded events, organizations, profiles, follows,
signed-up accounts and sessions in `data/state.json`. Old account registrations
receive the migration time as `registeredAt`. Run one server process for this data directory. An upload
interrupted by a restart is marked failed and can be uploaded again. If
`data/spend.jsonl` is present, each line's `costUsd` counts toward
`BUDGET_CAP_USD`, which defaults to 14.

## Demo accounts

Sign-in uses demo accounts checked by this server. It is not university sign-in
(SSO) and is not connected to any university system.

- Two accounts exist at every start: Maya Chen (`student@ksu-go.example`)
  and Noah Brooks (`organizer@ksu-go.example`, owner of the
  Robotics Club). Their demo-only passwords are listed in `../app/README.md`
  and defined in `demo_accounts.py`. They are rebuilt in memory at startup and
  never written to `data/state.json`.
- `POST /api/auth/signup` creates an account with no organizations. Any signed-in
  user can create an organization and own several. There is no role field:
  an organizer is someone who owns at least one organization. Seed organizations
  have no owner except Robotics Club, owned by Noah.
- Passwords are stored as salted scrypt hashes (N=2^17, r=8, p=1). Tokens are
  stored only as SHA-256 hashes and expire 7 days after sign-in. The server
  never logs passwords, tokens or `Authorization` headers.

Sign in, then send the token as a Bearer header. Browsing events, routes and
organizations needs no token. Registering, following, editing your profile and
creating an organization need an account. Editing an organization and managing
its events or directions require ownership of that organization.

```sh
curl -s -X POST http://localhost:8000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email": "organizer@ksu-go.example", "password": "<password>"}'
# → {"token": "<token>", "user": {...}}

curl -s http://localhost:8000/api/me -H 'Authorization: Bearer <token>'
curl -s -X POST http://localhost:8000/api/events/ev-04/register -H 'Authorization: Bearer <token>'
curl -s -X POST http://localhost:8000/api/auth/logout -H 'Authorization: Bearer <token>'
```

A missing, unknown or expired token gets `401 unauthenticated`. An account
that does not own the required organization gets `403 forbidden`.
`CONTRACTS.md` section 5 has the full access table.

## Organizations, events and room directions

- Organizations are stored on the server. `memberCount` is the owner's entered
  number of members; `followerCount` counts actual account follows.
- Owners can create, edit and cancel active, unended events, including seeds.
  Cancelled events leave the map and public ranges; registering or editing them
  returns `409 event_cancelled`. Registered users still see them in
  `GET /api/me/registrations`, and the owner sees them in the organization's list.
- Every event derives its `routeId` from its room's confirmed route, using the
  room-label rule ("Room 204", or a name such as "Atrium"). Changing the room
  rechecks it. Confirmation gives the route to every event in that room.
- `GET /api/events/{id}/directions` returns confirmed, processing, draft, failed
  or none. An unconfirmed draft belongs only to the event it was uploaded for.
- Upload through `POST /api/routes?eventId={id}`, with multipart `video`,
  `startFloor` and `destinationFloor`. The server takes the building and room
  from the event. Ownership and the room's existing-directions check run before
  reading the video. A confirmed room refuses uploads and another confirmation
  with `409 room_has_route`.

Rehearse in mock mode: Noah → Organization → Robotics Build Night (Math D
Room 113) → Directions → Review draft. The prepared
`shared/fixtures/routes/room-113.draft.json` is the real route2 output, tied to
ev-25. Tap "Looks right", then confirm; ev-23, the Game Development Club event
in Room 113, gains directions too. Restart the server to restore the fixture
draft for another rehearsal. Do not upload on stage. The student demo uses
Room 215, whose confirmed `route-room-215-hand` route is already bundled.
The Room 113 hand route is retained only in
`shared/fixtures/fallbacks/room-113.hand.json`. The server's nonrecursive
`routes/*.json` loader and the app's route bundle exclude that fallback, so
Room 113 starts without confirmed directions.

## Test from a phone on a different network

With the mock server running, open a second terminal and start a tunnel:

```sh
cloudflared tunnel --url http://localhost:8000
```

1. On the phone, turn off Wi-Fi and open the printed HTTPS address with
   `/api/health` added. Check that it returns `{"ok":true,"pipelineMode":"mock"}`.
2. In the app's hidden settings, enter the HTTPS address as the server URL
   without `/api/health`. Update it if the tunnel address changes.
3. Stop the tunnel after testing. The demo API uses sample data and demo accounts
   only; anyone with the tunnel address can sign in with them.
