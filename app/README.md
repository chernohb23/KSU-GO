# KSU-GO in Expo Go

The original APP-1 corridor prototype checked the in-app WebView path: the corridor HTML contains the three.js module, makes no network requests, and exchanges the existing `route:goto` and `route:stepChanged` messages from `CONTRACTS.md` section 6. The `FPS` label in the scene reports the measured render rate while orbiting.

## Run on Windows

Requirements: Node 22.13+ (Expo SDK 58).

Open PowerShell in the `app/` directory (not the repository root). The `.cmd` suffix avoids PowerShell's script-execution restriction on `npm.ps1` and `npx.ps1`:

```powershell
npm.cmd install
npx.cmd expo start --lan
```

Keep the PC and iPhone on the same Wi-Fi network or connect both to a phone hotspot. Scan the Expo QR code with the iPhone camera and open it in Expo Go.

### Accounts and sign-in

The app opens on **Sign in**. Accounts are demo accounts checked by our own server: there is no university sign-in (SSO) and no connection to real university systems. These two accounts exist on every server start. Their passwords are public and for the demo only:

| Account | Email | Password | Tabs |
|---|---|---|---|
| Maya Chen, student | `student@ksu-go.example` | `StudentDemo!26` | Map, Events, Profile |
| Noah Brooks, owner of Robotics Club | `organizer@ksu-go.example` | `OrganizerDemo!26` | Map, Events, Organization, Profile |

- **Create an account** starts without organization ownership. Any signed-in user can create an organization from Profile, own several and switch between them in the Organization tab. Only an owner manages the organization and its events; seeded clubs have no owner except Noah's Robotics Club. Real-world approval is outside the demo's scope.
- Signing in, registering, profiles, organizations and follows need the server. Registrations (including cancellation status and registration time) come from the account on the server. Saved events, swipes, editable Interests, selected organization and upload history stay on this phone per account. Phase C sessions retain their token but are read-only until `/api/me` refreshes the user; legacy phone registration ids are discarded.
- **Sign out** is in Profile. It ends the session only: the server address and every account’s data on the phone stay. A session lasts 7 days; if the server ends it, the app returns to Sign in with “Your session ended. Sign in again.”
- **Demo mode.** With `EXPO_PUBLIC_DEMO_MODE=1`, Sign in shows **Maya Chen** and **Noah Brooks**, which fill the form. Without the variable they are hidden. Start Expo with it like this:

  ```bash
  EXPO_PUBLIC_DEMO_MODE=1 npx expo start --tunnel        # WSL / macOS / Linux
  ```
  ```powershell
  $env:EXPO_PUBLIC_DEMO_MODE = "1"; npx.cmd expo start --lan   # PowerShell
  ```

  The two passwords are in the app bundle either way, because they are public demo values.

### Run against the server

Start the server in mock mode (`server/README.md`), then point the app at it: long-press **KSU-GO** in the header, also on the Sign in screen, and enter the server address without `/api`, for example `http://192.168.1.20:8000` or the tunnel URL. `EXPO_PUBLIC_API_URL` sets the default. While the server answers, the header shows no badge; **Offline data** appears when the app falls back to bundled data.

### Offline demo on iPhone (guest)

With no server, choose **Browse offline** on Sign in. The guest sees Map, Events and Profile from bundled data, with **Offline data** in the header. In this checkout, choose Drone Club Build Session (Room 204) in **Today's events**, then **Take me there**, and follow **Next** or **Play** to the door. Back returns to the same event. **Register** asks you to sign in. The guest can swipe and save in Events, on this phone only. The planned student stage demo uses Robotics Club Meeting in Math D Room 215; ROUTE-5 must add its confirmed hand route first (Room 215 currently has no bundled directions).

A signed-in user whose server stops answering keeps the session, read-only, with **Offline data** showing; registering says it needs the server until the badge disappears.

To rehearse again, long-press **KSU-GO**, choose **Reset app**, and confirm. This signs you out and clears every account's local saved events, swipes, Interests and upload history, plus the server address override. Account registrations, profiles, follows and organizations stay on the server. The same screen has **Preview directions**, which opens an event with directions.

The student route follows the room's confirmed route. Confirmed JSON routes under `shared/fixtures/routes/` are bundled by Metro alongside the existing sample. There is no route-drafts tab or list: a draft opens only from its event's Directions row.

## Try the WSL tunnel

Run these commands in a WSL terminal such as Ubuntu, not in PowerShell. Node.js 22.13 or later and npm must be installed inside WSL; Windows installations are separate. Navigate to your checkout's repository root (the folder containing `app/`), then run:

```bash
cd app
npm install
npx expo login
npx expo start --tunnel
```

If the checkout is on the Windows drive, its WSL path commonly starts with `/mnt/c/Users/`; use your own checkout location. Sign in to Expo Go with the same account used by `npx expo login`, then scan the QR code. Record the time from saving an edit to seeing the refreshed screen. Tunnel access requires an internet connection; airplane mode is only for checking the already-loaded scene.

## APP-1 prototype test record

Both setups loaded in Expo Go on a physical Android phone. The Windows LAN run loaded in about 2 seconds and reported 120 FPS while orbiting, operation in airplane mode after loading, and working messages in both directions. The WSL tunnel run used Linux Node 22.23.5 and passed airplane-mode and two-way messaging checks. Its reload took about 5 seconds; FPS was usually 120, with occasional dips into the 100–120 range.

iPhone check pending.

| Setup | Connected in Expo Go | Airplane mode after load | Load or reload time | FPS while orbiting | Messages both ways | Steps or notes |
|---|---|---|---|---|---|---|
| WSL `expo start --tunnel` | Yes | Yes | About 5 seconds | Usually 120; occasional drops to 100–120 | Yes | Linux Node 22.23.5. Checkout is under `/mnt/c`; initial startup took about 90 seconds. |
| Expo on Windows, LAN | Yes | Yes | About 2 seconds to load | 120 FPS reported while orbiting | Yes | Scene loaded before airplane mode was enabled. |

## If Expo Go or WebGL fails

Follow the APP-1 fallback in `SCOPE.md` risk 1 in order: first load the viewer from a URL served by the laptop; if WebGL itself fails, try `expo-gl` with three.js. Record which fallback was attempted and what happened in the PR. No change to section 6 is expected unless the phone run reveals that one of its message shapes cannot pass through the WebView.

## App shell

The app starts in Expo Router on **Sign in**. Everyone browsing gets **Map**, **Events** and **Profile**; accounts owning at least one organization also get **Organization**. The tab appears after the first organization is created, without restarting. Protected routes hide the tab for nonowners; the server enforces ownership for management calls.

- **Map** shows today’s flags. Tapping one opens the event card over the map.
- **Events** has **All** (this week, by day), **Discover** (the swipe deck) and **Saved**. Saving is separate from registering.
- **Profile** has an editable avatar, major, class year and short bio; real registration/follow insights; Upcoming registrations with countdowns and directions; Saved; editable Interests; followed organizations; Create organization; and Sign out. The Saved count is this phone only. Monthly registration counts use the ET calendar month. Cancelled registrations stay labeled, with no Take me there.
- **Organization** shows the club card, owner-entered members and actual followers, Edit organization, Create event and Upcoming/Past events (including cancellations). When you own several organizations, use the switcher. Manage event has details, named registrations, Edit, a destructive Cancel confirmation sheet, and Directions.
- **Public organization pages** open from the organizer name on event cards and from Profile's following list. They show the club card, Follow/Unfollow and upcoming active events.
- **Event forms** use seven campus-day chips, a 15-minute time list and duration chips. Times are always labeled ET; room labels use `shared/rooms.ts`.

Directions has five states: **Directions ready** (view only), **Add directions** (upload), **Directions in progress**, **Review draft**, and **Try again**. Upload fixes the event and sends `eventId` in the query string; the server checks ownership and existing room directions before reading the video. A room with confirmed directions refuses new uploads. Editing an event's room rechecks directions; confirming gives the route to every event in that room. Review reuses the existing draft editor without changes.

**Stage rehearsal:** restart the mock server, sign in as Noah → Organization → Robotics Build Night (Math D Room 113) → Directions → Review draft → inspect the flagged step → **Looks right** → **Confirm route**. The real route2 draft is `shared/fixtures/routes/room-113.draft.json`; it needs no turn correction. The Game Development Club event in Room 113 immediately gets directions too. No video is uploaded on stage. Restarting the server restores this fixture draft.

Every event card is the same component, wherever it opens. Times are always campus time, labeled **ET**, whatever the phone's time zone. Capacity shows as “34 / 50”, or “Full” once reached; it never blocks registering. **Take me there** opens directions above the tabs. Cancelled events leave Map, Events and Discover; event details can still fetch them directly and show a Cancelled banner with no registration or directions action.

If the app has no configured server URL, it starts in fixture mode. The title can be long-pressed on any screen, including Sign in, to open hidden **Settings**. Enter the server base URL without `/api`; the app saves it on the device and checks it immediately. Leaving the field blank clears the override and returns to `EXPO_PUBLIC_API_URL`, if configured. Health is rechecked every 10 seconds, with a 2-second timeout.

The typed API client lives in `src/api/client.ts`. Fixture conversion and fallback live in `src/data/`. `ViewerWebView` and the typed section 6 bridge live in `src/viewer/` and load HTML strings as required by the contract.

From `app/`, install and run with Expo Go:

```powershell
npm.cmd ci
npx.cmd expo start --lan
```

Run the local checks with Node 22.13 or later:

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run check:routes
```

For a Metro iOS export without reading local dotenv files:

```bash
EXPO_NO_DOTENV=1 CI=1 npx expo export --platform ios --output-dir /tmp/ksugo-ios
```

`check:routes` discovers the full tree using the installed Expo Router. It checks that seeded and declared tabs match (`index, events, organization, profile/index`) and root screens stay outside tabs, preserving the phase C ROUTE_NAMES_CHANGED fix.

Phase D still needs a real iPhone check in Expo Go:

- As Maya, edit the profile and Interests, follow/unfollow a public club, create an organization, and check the new tab appears while mounted without LogBox. Create a second and try the switcher.
- As Noah, create/edit an event with ET day/time/duration inputs. Check confirmed Room 204 directions are view only; Room 113 offers the prepared draft. Confirm it and check both Room 113 events gain directions. Test an actual camera-roll selection, upload progress, a failed upload and retry.
- Register Maya for a Noah event, cancel as Noah, and verify it leaves Map/Events/Discover but remains Cancelled in Maya's Profile. Check named registrations and real counts.
- Check navigation back from review and directions, keyboard/sheets, layout, touch targets, WebView rendering and offline fallback on the device. Add ROUTE-5's Room 215 fixture before trying the student stage path.
