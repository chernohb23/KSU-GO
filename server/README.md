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
starts. It saves uploaded routes, their confirmed event links, registrations,
created events, signed-up accounts and sessions in `data/state.json`. Run one server process for this data directory. An upload
interrupted by a restart is marked failed and can be uploaded again. If
`data/spend.jsonl` is present, each line's `costUsd` counts toward
`BUDGET_CAP_USD`, which defaults to 14.

## Demo accounts

Sign-in uses demo accounts checked by this server. It is not university sign-in
(SSO) and is not connected to any university system.

- Two accounts exist at every start: Maya Chen (`student@ksu-go.example`,
  student) and Noah Brooks (`organizer@ksu-go.example`, organizer for the
  Robotics Club). Their demo-only passwords are listed in `../app/README.md`
  and defined in `demo_accounts.py`. They are rebuilt in memory at startup and
  never written to `data/state.json`.
- `POST /api/auth/signup` always creates a student. No endpoint creates
  organizers.
- Passwords are stored as salted scrypt hashes (N=2^17, r=8, p=1). Tokens are
  stored only as SHA-256 hashes and expire 7 days after sign-in. The server
  never logs passwords, tokens or `Authorization` headers.

Sign in, then send the token as a Bearer header. Reading events and routes needs
no token. Registering needs any account. Creating events and uploading, editing
or confirming routes need the organizer.

```sh
curl -s -X POST http://localhost:8000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email": "organizer@ksu-go.example", "password": "<password>"}'
# → {"token": "<token>", "user": {...}}

curl -s http://localhost:8000/api/me -H 'Authorization: Bearer <token>'
curl -s -X POST http://localhost:8000/api/events/ev-04/register -H 'Authorization: Bearer <token>'
curl -s -X POST http://localhost:8000/api/auth/logout -H 'Authorization: Bearer <token>'
```

A missing, unknown or expired token gets `401 unauthenticated`. A student
calling an organizer endpoint gets `403 forbidden`. `CONTRACTS.md` section 5 has
the full access table and the rules for `POST /api/events`.

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
