# APP-1: three.js corridor in Expo Go

This throwaway screen checks the in-app WebView path: the corridor HTML contains the three.js module, makes no network requests, and exchanges the existing `route:goto` and `route:stepChanged` messages from `CONTRACTS.md` section 6. The `FPS` label in the scene reports the measured render rate while orbiting.

## Run on Windows

This app uses Expo SDK 58, matching the Expo Go version currently installed on the test iPhone. SDK 58 requires Node.js 22.13 or later. From this directory, run:

```powershell
npm.cmd install
npx.cmd expo start --lan
```

Keep the PC and iPhone on the same Wi-Fi network or connect both to a phone hotspot. Scan the Expo QR code with the iPhone camera and open it in Expo Go. After the scene loads, turn on airplane mode, orbit the scene for at least 10 seconds, and record the FPS shown in the upper-left corner. Press **Move camera** and tap the scene; the app status area should show messages in each direction.

## Try the WSL tunnel

Node.js 22.13 or later must also be installed inside WSL. Open this project through its Windows-mounted path and run:

```bash
cd /mnt/c/Users/perfe/Downloads/KSU-GO/app
npm install
npx expo start --tunnel
```

Scan the QR code in Expo Go. Record the time from saving an edit to seeing the refreshed screen. This setup requires WSL and a working tunnel connection.

## Device test record

No physical iPhone scene run has been recorded yet. The first Windows launch reached Expo Go but was rejected because the project used SDK 57 while the phone had SDK 58; the project has since been upgraded and needs a retry. WSL is unavailable in the environment used to prepare this spike. Do not treat the entries below as a successful device test; fill them in during the APP-1 phone check.

| Setup | Connected in Expo Go | Reload time | FPS while orbiting | Steps or notes |
|---|---|---|---|---|
| WSL `expo start --tunnel` | Not tried (WSL is not installed here) | Not measured | Not measured | Run from WSL as described above. |
| Expo on Windows, same Wi-Fi/hotspot | Initial launch rejected (SDK 57 project, SDK 58 Expo Go); retry pending | Not measured | Not measured | Project upgraded to SDK 58; retry phone check with Node.js 22.13 or later. |

## If Expo Go or WebGL fails

Follow the APP-1 fallback in `SCOPE.md` risk 1 in order: first load the viewer from a URL served by the laptop; if WebGL itself fails, try `expo-gl` with three.js. Record which fallback was attempted and what happened in the PR. No change to section 6 is expected unless the phone run reveals that one of its message shapes cannot pass through the WebView.
