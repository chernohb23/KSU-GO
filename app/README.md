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

### Offline demo on iPhone

Load the Map tab over Wi-Fi, then turn on airplane mode and turn Wi-Fi off if iOS kept it enabled. With **Offline data** in the header, tap the Robotics Club Meeting flag or choose it in **Today’s events**. Tap **Register**, then **Take me there**. Follow **Next** or **Play** to the Room 204 door. Returning to the event should show **Registered**.

To rehearse again, long-press **KSU-GO** in the header, choose **Reset demo**, and confirm. This clears this app’s device registrations, saved events and preferences, upload history, organizer mode, and server address override. It starts a new local device ID. Server records stay on the server.

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

The app now starts in Expo Router with **Map**, **This week**, **Route**, and **Organizer** tabs. The Map screen lists today’s events and labels each as live, starting soon, or later. A small header badge identifies whether data is from the server or fixtures.

If the app has no configured server URL, it starts in fixture mode. The title can be long-pressed on any screen to open hidden **Server settings**. Enter the server base URL without `/api`; the app saves it on the device and checks it immediately. Leaving the field blank clears the override and returns to `EXPO_PUBLIC_API_URL`, if configured. Health is rechecked every 10 seconds, with a 2-second timeout.

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
