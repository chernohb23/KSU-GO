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
| Noah Brooks, organizer (Robotics Club) | `organizer@ksu-go.example` | `OrganizerDemo!26` | Map, Events, Organizer, Profile |

- **Create an account** always makes a student. Organizer accounts are set up by the university.
- Signing in, signing up and registering need the server. Saved events, swipes, the "Registered" list in Profile and organizer upload history are kept on the phone per account, so each account starts fresh and keeps its own.
- **Sign out** is in Profile. It ends the session only: the server address and every account’s data on the phone stay. A session lasts 7 days; if the server ends it, the app returns to Sign in with “Your session ended. Sign in again.”
- **Demo mode.** With `EXPO_PUBLIC_DEMO_MODE=1`, Sign in shows **Use demo student** and **Use demo organizer**, which fill the form. Without the variable they are hidden. Start Expo with it like this:

  ```bash
  EXPO_PUBLIC_DEMO_MODE=1 npx expo start --tunnel        # WSL / macOS / Linux
  ```
  ```powershell
  $env:EXPO_PUBLIC_DEMO_MODE = "1"; npx.cmd expo start --lan   # PowerShell
  ```

  The two passwords are in the app bundle either way, because they are public demo values.

### Run against the server

Start the server in mock mode (`server/README.md`), then point the app at it: long-press **KSU-GO** in the header, also on the Sign in screen, and enter the server address without `/api`, for example `http://192.168.1.20:8000` or the tunnel URL. `EXPO_PUBLIC_API_URL` sets the default. The header badge shows **Server data** when the server answers.

### Offline demo on iPhone (guest)

With no server, choose **Browse offline** on Sign in. The guest sees Map, Events and Profile from the bundled data, with **Offline data** in the header. Tap the Robotics Club Meeting flag or choose it in **Today’s events**, then **Take me there**, and follow **Next** or **Play** to the Room 204 door. Back returns to the same event on the map. **Register** asks you to sign in, because registering needs the server. The guest can still swipe and save in Events, on this phone only.

A signed-in user whose server stops answering keeps the session, read-only, with **Offline data** showing; registering says it needs the server until the badge shows **Server data** again.

To rehearse again, long-press **KSU-GO**, choose **Reset demo**, and confirm. This signs you out and clears every account’s registrations record, saved events, swipes and upload history on this phone, plus the server address override. Server records stay on the server. The same screen has **Dev: event with route**, which opens the details of an event that has directions.

The student route follows the ID on the seed event. Confirmed JSON routes under `shared/fixtures/routes/` are bundled by Metro alongside the existing sample. Only drafts appear in the organizer review list.

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

The app starts in Expo Router on **Sign in**. Students and guests get **Map**, **Events** and **Profile**; the organizer also gets **Organizer**. Protected routes enforce this, so a link to an organizer screen from another account lands on the map.

- **Map** shows today’s flags. Tapping one opens the event card over the map.
- **Events** has **All** (this week, by day), **Discover** (the swipe deck) and **Saved**. Saving is separate from registering.
- **Profile** shows the account, the events registered for on this phone, and **Sign out**.
- **Organizer** holds the route drafts flow: new route, drafts, review.

Every event card is the same component, wherever it opens. Times are always campus time, labeled **ET**, whatever the phone’s time zone. Capacity shows as “34 / 50”, or “Full” once reached; it never blocks registering. **Take me there** opens the directions screen on top of the tabs, and Back returns to the same event.

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
```

The Expo bundle and TypeScript checks were verified in this worktree. The updated screens have not yet been opened on a physical phone.
