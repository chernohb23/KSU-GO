# APP-1: three.js corridor in Expo Go

This throwaway screen checks the in-app WebView path: the corridor HTML contains the three.js module, makes no network requests, and exchanges the existing `route:goto` and `route:stepChanged` messages from `CONTRACTS.md` section 6. The `FPS` label in the scene reports the measured render rate while orbiting.

## Run on Windows

This app uses Expo SDK 58, matching the Expo Go version on the test iPhone. SDK 58 requires Node.js 22.13 or later. Open PowerShell in the `app/` directory (not the repository root). The `.cmd` suffix avoids PowerShell's script-execution restriction on `npm.ps1` and `npx.ps1`:

```powershell
npm.cmd install
npx.cmd expo start --lan
```

Keep the PC and iPhone on the same Wi-Fi network or connect both to a phone hotspot. Scan the Expo QR code with the iPhone camera and open it in Expo Go. After the scene loads, turn on airplane mode, orbit the scene for at least 10 seconds, and record the FPS shown in the upper-left corner. Press **Move camera** and tap the scene; the app status area should show messages in each direction.

## Try the WSL tunnel

Run these commands in a WSL terminal such as Ubuntu, not in PowerShell. Node.js 22.13 or later and npm must be installed inside WSL; Windows installations are separate. Navigate to your checkout's repository root (the folder containing `app/`), then run:

```bash
cd app
npm install
npx expo login
npx expo start --tunnel
```

If the checkout is on the Windows drive, its WSL path commonly starts with `/mnt/c/Users/`; use your own checkout location. Sign in to Expo Go with the same account used by `npx expo login`, then scan the QR code. Record the time from saving an edit to seeing the refreshed screen. Tunnel access requires an internet connection; airplane mode is only for checking the already-loaded scene.

## Device test record

Both setups loaded in Expo Go on a physical iPhone. The Windows run reported smooth orbiting at 120 FPS, continued operation in airplane mode after loading, working messages in both directions, and an approximately 2-second reload. The true WSL run used Linux Node 22.23.5 and reported an approximately 5-second reload; FPS was usually 120, with occasional drops into the 100–120 range. Airplane-mode and two-way messaging results have not yet been reported for the true WSL run.

| Setup | Connected in Expo Go | Airplane mode after load | Reload time | FPS while orbiting | Messages both ways | Steps or notes |
|---|---|---|---|---|---|---|
| WSL `expo start --tunnel` | Yes | Not reported | About 5 seconds | Usually 120; occasional drops to 100–120 | Not reported | Linux Node 22.23.5. Checkout is under `/mnt/c`; initial startup took about 90 seconds. |
| Expo on Windows, same Wi-Fi/hotspot | Yes | Yes | About 2 seconds | 120 FPS reported while orbiting | Yes | Scene loaded before airplane mode was enabled. |

## If Expo Go or WebGL fails

Follow the APP-1 fallback in `SCOPE.md` risk 1 in order: first load the viewer from a URL served by the laptop; if WebGL itself fails, try `expo-gl` with three.js. Record which fallback was attempted and what happened in the PR. No change to section 6 is expected unless the phone run reveals that one of its message shapes cannot pass through the WebView.
