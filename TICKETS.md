# KSU-GO tickets (draft)

These are the source for the GitHub issues (34 tickets: the motion cross-check moved out of AI-4 into a new ticket, AI-7). Tickets are grouped into four build parts plus setup and the pitch.

**Libraries.** A ticket's "Pre-approved libraries" line lists what may be added without asking. Anything else needs the human's OK (AGENTS.md, "How we work").

**Every ticket assumes the reader has `AGENTS.md` and `CONTRACTS.md`.** Coding agents load `AGENTS.md` automatically. 🤖 AI + server tickets also need `docs/pipeline.md`. Together with the ticket, that is the full context.

**Milestones:** `Tue` Nov 17, `Wed` Nov 18, `Thu` Nov 19 (feature freeze in the evening), `Fri` Nov 20 (rehearsal and demo; fixes only).

**Labels.** Each ticket has one part label, one priority label, and any flags that apply.

| Label | Meaning |
|---|---|
| 📱 App | The Expo app (`app/`) |
| 🗺️ Campus map | The campus scene and the viewer build (`viewer/src/campus/`) |
| 🧭 Indoor route | The route scene and step instructions (`viewer/src/route/`) |
| 🤖 AI + server | The API and the video-to-route pipeline (`server/`) |
| 🎤 Pitch | Survey, counts, slides, rehearsal (`pitch/`) |
| 🧱 Setup | Shared skeleton, types and fixtures |
| ✅ Must have | Needed for the demo |
| ✨ Bonus | Only after the must-haves it depends on work |
| 🚦 Do first | Start of Tuesday; other work waits on it or it removes a big risk |
| 💳 Costs money | Makes paid calls. Paid runs happen on Juan's laptop, with his OK. |
| 🐛 Bug | For bugs found later; no ticket here uses it yet |

**Assignments.** Only MAP-1, MAP-3 and AI-6 are assigned, to Juan. Every other ticket is open to grab. All paid keys live only on Juan's laptop, so every live paid run happens there.

**Grab first:** S-1 blocks five Tuesday tickets (APP-2, MAP-2, ROUTE-1, ROUTE-4, AI-1) and is about an hour of work. PITCH-1 must go out Tuesday morning, because responses need days. Both are 🚦 Do first and open to grab.

| Day | 📱 App | 🗺️ Campus map | 🧭 Indoor route | 🤖 AI + server | 🎤 Pitch |
|---|---|---|---|---|---|
| Tue | APP-1, APP-2 | MAP-1, MAP-2 | ROUTE-1, ROUTE-4 | AI-1, AI-2, first Gemini run of AI-3 in the evening | PITCH-1 |
| Wed | APP-3, APP-4, APP-5, APP-6a | MAP-3, MAP-4 | ROUTE-2, ROUTE-3, ROUTE-5 (JSON) | AI-3, AI-4, AI-7 | PITCH-2, PITCH-4 (draft) |
| Thu | APP-6b, APP-7, APP-8 (bonus) | MAP-5 | ROUTE-5 (polish) | AI-5, AI-6 | PITCH-3, PITCH-4, PITCH-5, PITCH-6 |
| Fri | | | | | PITCH-7 |

S-1 comes before everything in the grid.

## Dependencies: read this before grabbing a ticket

Every ticket lists its dependencies in four fields:

| Field | Meaning | What you do |
|---|---|---|
| **Blocked by** | You cannot start until these are **merged** (their issues closed). These are the GitHub "blocked by" links on the board. | Don't take the ticket. Pick another, or help finish a blocker. |
| **Done needs** | Some acceptance checks can only run once these merge. They do **not** stop you starting or merging. | Build against fixtures and mock mode, merge when everything else passes, and list the checks you could not run in the PR ("Waiting on MAP-4: tap test on iPhone"). The issue closes on merge. |
| **Uses if ready** | Optional. If it has landed, use it; never wait for it. | Nothing. |
| **Blocks** | Tickets that cannot start until this one merges. | Prefer tickets with a long Blocks list. |
| **When merged, check** | Tickets that left acceptance checks waiting on this one. | When your PR merges, run their pending checks (listed in their PRs) and post the result there. A failure becomes a 🐛 Bug ticket. |

A ticket closed as "removed" (AI-7, a cut Bonus) counts as done for anything that needs it.

**Merging closes the issue.** GitHub shows a ticket as blocked until every **Blocked by** issue is closed, so never leave a merged ticket open waiting on its Done needs: that would falsely block everything downstream.

**Ready right now (nothing blocks them):** S-1, APP-1, AI-2, PITCH-1, PITCH-2, MAP-1 (Juan). PITCH-4 and PITCH-5 can also start now, but their real deadline is Thursday.
**Ready once S-1 merges:** APP-2, MAP-2, ROUTE-1, ROUTE-4, AI-1. **Once AI-2 has videos:** AI-3 (first paid run on Juan's laptop), ROUTE-5 (hand-route JSON).

**Critical path** (the chains with the least slack, by time): the demo-route chain **AI-2 (film Tue) → AI-3 (first Gemini run Tue evening) → AI-4 → AI-6 (bake Thu) → PITCH-3 → PITCH-4 → PITCH-7**, fed on the app side by **S-1 → APP-2 → APP-5 / APP-6a → AI-6**. A slip on these moves the demo; ROUTE-5's hand routes are the fallback if the AI-3 → AI-6 chain slips.

**Biggest unblockers:** S-1, MAP-2 and AI-1 each block five tickets; APP-2 blocks four; APP-6a and AI-4 block three.

| Ticket | Blocked by (can't start) | Done needs (checks wait on) | Blocks |
|---|---|---|---|
| S-1 | **ready** | — | APP-2, MAP-2, ROUTE-1, ROUTE-4, AI-1 |
| APP-1 | **ready** | — | — |
| APP-2 | S-1 | — | APP-3, APP-4, APP-5, APP-6a |
| APP-3 | APP-2, MAP-2 | MAP-4 | APP-7, APP-8 |
| APP-4 | APP-2, MAP-2, ROUTE-4 | ROUTE-3 | APP-7, PITCH-6 |
| APP-5 | APP-2, AI-1 | — | AI-6 |
| APP-6a | APP-2, AI-1, ROUTE-4 | APP-5, MAP-2 | APP-6b, APP-7, AI-6 |
| APP-6b | APP-6a, ROUTE-2, AI-4 | — | — |
| APP-7 | APP-3, APP-4, APP-6a | ROUTE-5 | — |
| APP-8 | APP-3, AI-1 | — | — |
| MAP-1 | **ready** | S-1, APP-1 | MAP-3 |
| MAP-2 | S-1 | APP-2 | APP-3, APP-4, MAP-3, MAP-4, ROUTE-2 |
| MAP-3 | MAP-1, MAP-2 | — | MAP-5 |
| MAP-4 | MAP-2 | — | MAP-5 |
| MAP-5 | MAP-3, MAP-4 | — | — |
| ROUTE-1 | S-1 | — | ROUTE-2 |
| ROUTE-2 | ROUTE-1, MAP-2 | — | APP-6b, ROUTE-3 |
| ROUTE-3 | ROUTE-2 | — | — |
| ROUTE-4 | S-1 | — | APP-4, APP-6a |
| ROUTE-5 | AI-2 | ROUTE-2 | PITCH-6 |
| AI-1 | S-1 | — | APP-5, APP-6a, APP-8, AI-4, AI-7 |
| AI-2 | **ready** | — | ROUTE-5, AI-3, AI-7 |
| AI-3 | AI-2 | AI-1 | — |
| AI-4 | AI-1 | AI-3 | APP-6b, AI-5, AI-6 |
| AI-5 | AI-4 | ROUTE-5 | — |
| AI-6 | AI-4, APP-5, APP-6a | APP-3 | — |
| AI-7 | AI-1, AI-2 | AI-4 | — |
| PITCH-1 | **ready** | — | — |
| PITCH-2 | **ready** | — | PITCH-3 |
| PITCH-3 | PITCH-2 | AI-6 | — |
| PITCH-4 | **ready** | PITCH-1, PITCH-2, PITCH-3, AI-7, AI-6 | PITCH-7 |
| PITCH-5 | **ready** | APP-7 | PITCH-7 |
| PITCH-6 | APP-4, ROUTE-5 | — | — |
| PITCH-7 | PITCH-4, PITCH-5 | — | — |

---

## 🧱 Setup

### S-1: Repo skeleton, shared types and fixtures
- **Assignee:** open
- **Goal:** Give every part something to build against before any other part exists.
- **Work:** Create the directories in CONTRACTS.md section 1 and write `shared/types.ts` from sections 2 to 4. Add `server/.env.example`. Write these fixtures in `shared/fixtures/`:
  - `events.seed.json`: about 12 fake events for today across the buildings (2 live, 3 soon, the rest later), plus about 12 more spread over the following six days with mixed categories and organizers. At least two of today's events share `routeId: "route-sample"`. One more event is in the same building and room as the sample route's destination and has `routeId: null`; confirming a route for that room is what gives it one.
  - `route.sample.json`: the sample in section 4, with every `StepBase` field filled.
  - `route.draft-flawed.json`: the sample route as a `draft` with three planted problems, each with its check: step `s9` turns `right` where it should turn `left` (confidence 0.4, a `turn_motion_mismatch` warn on it); step `s3` is correct but has confidence 0.5 and a `low_confidence` warn; and an extra 0.2 m walk after `s8` carries a `leg_length_range` fail.
  - `campus.json`: a placeholder with 4 rectangular buildings, replaced by MAP-1.
  - `routes/placeholder.draft.json`: a copy of `route.draft-flawed.json` with id `route-placeholder-draft`, so APP-5's drafts list and AI-1's route loading have a file to work with before AI-6 bakes the real stage draft. AI-6 deletes it.
- **Pre-approved libraries:** `typescript`, `vitest` (for the fixture check).
- **Acceptance:**
  - `shared/types.ts` compiles under `tsc --strict`, and each fixture is checked against its type in a small test.
  - Building ids used in events exist in `campus.json`.
  - No app, viewer or server logic is included.
- **Blocked by:** nothing, start now
- **Blocks:** APP-2, MAP-2, ROUTE-1, ROUTE-4, AI-1
- **When merged, check:** MAP-1
- **Dependency note:** Do this first on Tuesday. It unblocks five tickets.
- **Labels:** 🧱 Setup, ✅ Must have, 🚦 Do first · **Milestone:** Tue

---

## 📱 App (`app/`)

### APP-1: three.js corridor in Expo Go on a real iPhone
- **Assignee:** open
- **Goal:** Prove the riskiest assumption: a three.js scene inside a WebView runs well in Expo Go on a real iPhone and can exchange messages with the app.
- **Work:** A throwaway Expo screen with a `react-native-webview` that loads one self-contained HTML string (three.js inlined, no network). The scene is a hard-coded corridor: floor, two walls, one turn, one flight of stairs, and touch controls to orbit. One button in React Native sends a message that moves the camera; tapping in the scene sends a message back that the app shows as text.
- **Dev setup to test:** The team develops in WSL, and an iPhone has already failed to reach an Expo server running in WSL (WSL sits behind its own virtual network, so the phone cannot see its address). Try two setups and record which works: (1) `npx expo start --tunnel` from WSL; (2) running Expo from Windows itself (Node installed on Windows, the repo on the Windows side or opened through `\\wsl$`), with phone and PC on the same Wi-Fi or a phone hotspot.
- **Pre-approved libraries:** `react-native-webview`, `three`.
- **Acceptance:**
  - Runs on a physical iPhone in Expo Go with the phone in airplane mode after the app has loaded.
  - Holds a smooth frame rate while orbiting (measure and write down the fps).
  - Messages work in both directions using the mechanism in CONTRACTS.md section 6.
  - The PR records, for each dev setup tried (tunnel from WSL, Expo on Windows): whether the iPhone connected, how long a reload takes, and any setup steps needed. The working setup is written into `app/README.md` for the rest of the team.
  - A short note in the PR says which loading method worked, and anything that needs to change in section 6. If it fails, the note says which fallback from SCOPE.md risk 1 was tried and what happened.
- **Blocked by:** nothing, start now
- **Blocks:** nothing
- **When merged, check:** MAP-1
- **Dependency note:** Start first thing Tuesday.
- **Labels:** 📱 App, ✅ Must have, 🚦 Do first · **Milestone:** Tue

### APP-2: App shell, API client and fixture fallback
- **Assignee:** open
- **Goal:** A navigable app that can show data from the server or, without one, from fixtures, and always shows which of the two it is using.
- **Work:**
  - Expo app with Expo Router and strict TypeScript. Screens as stubs: Map, Route, Organizer.
  - A typed API client for every endpoint in CONTRACTS.md section 5.
  - **Fixture fallback:** if no server URL is set or `/api/health` does not answer in 2 seconds, load events from `events.seed.json` (converted and filtered as section 2 describes) and routes from `shared/fixtures/`. Check health again every 10 seconds and switch back when the server answers. Show a small "Offline data" badge whenever fixtures are in use, so nobody mistakes it for the live server.
  - **Hidden settings screen** (for example, a long press on the app title): a text field for the server URL that overrides `EXPO_PUBLIC_API_URL` and is stored on the device. A tunnel address changes when the tunnel restarts, and this avoids rebuilding the app.
  - Configure Metro so the app can import from `../shared` (add it to `watchFolders`).
  - A stable `deviceId` stored on the device.
  - A reusable `ViewerWebView` component that wraps the bridge in section 6: it waits for `ready`, sends typed messages, and reports typed messages back.
- **Pre-approved libraries:** `expo-router`, `react-native-webview`, `@react-native-async-storage/async-storage` (device id, server address, registrations).
- **Acceptance:**
  - `npx expo start` opens in Expo Go; `npm run typecheck` passes.
  - With no server, the Map stub lists today's fixture events with correct live, soon and later states, and the badge shows.
  - With the mock server running, the same list comes from the server and the badge is gone.
  - Stopping the server makes the badge appear within about 10 seconds; starting it makes the badge go away.
  - Changing the server URL in the hidden screen takes effect without restarting Expo.
  - The app does not import three.js.
- **Blocked by:** S-1
- **Uses if ready:** APP-1
- **Blocks:** APP-3, APP-4, APP-5, APP-6a
- **When merged, check:** MAP-2
- **Dependency note:** Build `ViewerWebView` to the default in CONTRACTS.md section 6 until APP-1 reports which loading method works.
- **Labels:** 📱 App, ✅ Must have · **Milestone:** Tue

### APP-3: Map screen, event card and register
- **Assignee:** open
- **Goal:** The student flow up to registering.
- **Work:** The Map screen hosts the campus scene through `ViewerWebView` and sends `campus:load` with the campus, today's events and the current time. On `campus:flagTapped`, open a bottom-sheet card: title, organizer, category, time ("Live now" or "Starts in 25 min"), building name and room, registered count, a Register button, and a "Take me there" button when `routeId` is set. Register calls the API, or in fixture mode updates local state. Show `campus.attribution` on the map when it is not null.
- **Acceptance:**
  - Tapping a flag opens the right card, and the viewer receives `campus:select`.
  - Registering updates the count and the button state, and survives an app restart.
  - "Take me there" opens the Route screen with that route.
  - The whole flow works in airplane mode.
- **Blocked by:** APP-2, MAP-2
- **Done needs:** MAP-4 (merge without them; list the checks you could not run in your PR)
- **Blocks:** APP-7, APP-8
- **When merged, check:** AI-6
- **Dependency note:** Until MAP-4 lands there are no flags to tap: fire `campus:flagTapped` from a dev button to build the card.
- **Labels:** 📱 App, ✅ Must have · **Milestone:** Wed

### APP-4: Route screen with step-by-step instructions
- **Assignee:** open
- **Goal:** The student follows the route to the door.
- **Work:** The Route screen loads a `confirmed` route and sends `route:load`. Below the 3D view, an instruction bar shows the current step's text from `shared/instructions.ts` (ROUTE-4), with Back, Next and Play. Next and Back send `route:goto`; Play sends `route:play`; `route:stepChanged` moves the bar. Show the destination and total walking distance at the top.
- **Acceptance:**
  - The sample route can be stepped through from the entrance to "Room 204", and played as a walk-through.
  - The bar and the 3D view never disagree about the current step.
  - A route that is not `confirmed` is not shown to students.
- **Blocked by:** APP-2, MAP-2, ROUTE-4
- **Done needs:** ROUTE-3 (merge without them; list the checks you could not run in your PR)
- **Blocks:** APP-7, PITCH-6
- **Dependency note:** Build against the placeholder scene. Play and the bar/3D sync can only be accepted once ROUTE-3 sends `route:stepChanged`.
- **Labels:** 📱 App, ✅ Must have · **Milestone:** Wed

### APP-5: Organizer upload, progress and drafts list
- **Assignee:** open
- **Goal:** An organizer sends a walk video and watches the AI work, or opens a draft that is already waiting.
- **Work:**
  - Organizer mode behind a switch in the app.
  - **New route form.** The organizer picks one of the fake events, which supplies `eventId`, `buildingId` and `destination` ("Room " plus the event's room). They enter `startFloor` (default "1") and `destinationFloor` (pre-filled with the first digit of the room number when it has one, and editable). The form shows the filming rules from `docs/pipeline.md`.
  - **Pick and upload.** Pick a video from the camera roll with `expo-image-picker`. The export setting (original or 720p) is one constant in the code; AI-2 reports on Tuesday which to use. Upload with `POST /api/routes` as multipart, with an upload progress bar and a Retry button if the upload fails partway.
  - **Progress.** Poll `GET /api/routes/{id}` every 3 seconds and show the pipeline stage by name: ingest, timeline, geometry, assemble, verify. A stage the server skips is simply never shown. Handle `failed`, `video_rejected` and `budget_exceeded` with clear messages.
  - **Drafts list.** Organizer mode opens on a list of routes waiting for confirmation: every route this device uploaded (ids stored on the device), plus the bundled `shared/fixtures/routes/*.draft.json` routes, each fetched from the server by id. Tapping a draft opens the confirm screen. The organizer can leave a running upload and open another draft; this is how the stage demo works (see SCOPE.md).
- **Pre-approved libraries:** `expo-image-picker`.
- **Acceptance:**
  - Against the mock server, a picked video goes from upload to a `draft` route, and the app moves on to the confirm screen.
  - Videos over 3 minutes or 100 MB are refused before upload with a clear message.
  - Leaving and reopening the screen resumes polling for the same route.
  - A draft fixture loaded by the server appears in the drafts list and opens.
  - With the server stopped mid-upload, the app shows the failure and Retry works after the server is back.
- **Blocked by:** APP-2, AI-1
- **Uses if ready:** AI-2
- **Blocks:** AI-6
- **When merged, check:** APP-6a
- **Dependency note:** The export setting is one constant; AI-2/AI-3 decide its value on Tuesday.
- **Labels:** 📱 App, ✅ Must have · **Milestone:** Wed

### APP-6a: Organizer confirms turns (core)
- **Assignee:** open
- **Goal:** The person corrects the AI's draft and confirms it. This screen is the "organizer confirms" part of the pitch.
- **Work:**
  - A screen with the route preview on top (`ViewerWebView`, `route:load` re-sent after each edit; a placeholder scene until ROUTE-2 lands) and the step list below.
  - Each step shows its instruction text, a low-confidence marker when `confidence` is under 0.6, and any `checks` attached to it by `stepId`. Route-level checks show above the list.
  - **Auto-focus:** on opening, scroll to the first step that has a `fail` or `warn` check, highlight it, and send `route:goto` for it. A "Next issue" button is always available and moves to the next flagged step.
  - **Edits:** change a turn's direction (left, right, U-turn left, U-turn right), and delete a step. The first and last door steps cannot be deleted.
  - **Looks right:** one tap on a flagged step that is actually correct. It changes nothing but the step's `source`.
  - An edited or approved step gets `source: "organizer"`. The server then drops the AI-doubt checks on it (low confidence, motion), so every warning can be resolved one way or the other.
  - Each edit calls `PUT /api/routes/{id}/steps` and shows the fresh checks. If the call fails, keep the edit on screen, say so, and offer Retry.
  - Tapping a step sends `route:goto`.
  - Confirm is disabled while any check is `fail`, and calls `POST /api/routes/{id}/confirm`.
- **Acceptance:**
  - Against the mock server, the flawed draft (`route.draft-flawed.json`) opens focused on its first flagged step.
  - **A teammate who has not seen the screen fixes the flawed draft and confirms it in under one minute, timed.** Write the time in the PR.
  - A route with a `fail` check cannot be confirmed; after fixing it, it can.
  - After confirming, `GET /api/events` shows the new `routeId` on the uploaded event and on the other seed event in the same room. (The card-level check is in APP-7, so this ticket never waits on the map.)
- **Blocked by:** APP-2, AI-1, ROUTE-4
- **Done needs:** APP-5, MAP-2 (merge without them; list the checks you could not run in your PR)
- **Blocks:** APP-6b, APP-7, AI-6
- **Dependency note:** Does not wait for APP-5: open the mock draft by id from a dev entry point, then hook into the drafts list when APP-5 lands. This lets two people work the organizer flow in parallel on Wednesday. The "Take me there" card check moved to APP-7 so this ticket never waits on the map.
- **Labels:** 📱 App, ✅ Must have · **Milestone:** Wed

### APP-6b: Organizer confirms turns (more edits)
- **Assignee:** open
- **Goal:** Let the organizer fix what the AI missed, not only what it got wrong.
- **Work:** Add to the confirm screen, in this order:
  1. **Real preview:** the route scene from ROUTE-2 replaces the placeholder, and the screen is tested against live drafts from AI-4.
  2. **Insert a turn** between two steps.
  3. **Split a walk:** "Add turn here" on a walk of 2 m or more replaces it with two walks of half the length and a turn between them. A missed turn sits inside one walk, so this is how it gets added.
  4. **Stairs switch:** change a stairs step between up and down, using the same control as turn direction.
  5. **Insert an elevator** step with its `toFloor`. Do this last; drop it if Thursday runs short.
  Inserted steps get new unique ids and `source: "organizer"`.
- **Acceptance:**
  - Changing a wrong turn updates the 3D preview within a second of the server's answer.
  - A draft with a missed mid-corridor turn can be fixed by splitting the walk, in three taps or fewer.
  - A draft that ends on the wrong floor can be brought to the right one with the stairs switch or by deleting a flight, and the `ends_on_destination_floor` warning clears.
  - Every `fail` check the server can produce can be cleared with the edits on this screen.
- **Blocked by:** APP-6a, ROUTE-2, AI-4
- **Blocks:** nothing
- **Labels:** 📱 App, ✅ Must have · **Milestone:** Thu

### APP-7: Visual polish and offline demo check
- **Assignee:** open
- **Goal:** The app looks finished and survives a dead network.
- **Work:** One consistent look: colors, type, icons, app name and splash, all original art. Loading and empty states. Bundle the routes from `shared/fixtures/routes/` (AI-6, ROUTE-5). Add a "demo reset" action to the hidden settings screen that clears registrations and anything else stored on the device.
- **Acceptance:**
  - The full student flow from SCOPE.md runs in airplane mode on the demo iPhone.
  - No screen shows placeholder text or a default Expo asset.
  - After an organizer confirms a draft, the event's card shows "Take me there" and opens the new route; so does the other seed event in the same room.
  - Nothing in the app copies names or art from an existing game.
- **Blocked by:** APP-3, APP-4, APP-6a
- **Done needs:** ROUTE-5 (merge without them; list the checks you could not run in your PR)
- **Uses if ready:** AI-6
- **Blocks:** nothing
- **When merged, check:** PITCH-5
- **Dependency note:** Bundles the hand routes (ROUTE-5) at minimum; swaps in AI-6's routes if they exist.
- **Labels:** 📱 App, ✅ Must have · **Milestone:** Thu

### APP-8: Swipe deck of this week's events
- **Assignee:** open
- **Goal:** A fast, playful way to find events for the week. **Do not start until APP-3 works on the demo iPhone.**
- **Work:**
  - A "This week" screen showing a deck of event cards from `GET /api/events?range=week`, or from the seed in fixture mode.
  - Swipe right saves the event; swipe left skips it. Two buttons do the same for people who do not swipe.
  - Saved event ids are stored on the device. A "Saved" list shows them and lets the student remove one.
  - **Map highlight:** the Map screen passes `savedEventIds` in `campus:load` (CONTRACTS.md section 6). Drawing the highlight is an item in MAP-5; without it, nothing breaks.
  - **Reordering:** keep a score per category and per organizer on the device: a right swipe adds 1 to that event's category and organizer, a left swipe subtracts 1. After each swipe, sort the remaining cards by their category score plus organizer score, highest first, then by start time. This is plain arithmetic; do not describe it as AI anywhere.
  - Use `react-native-gesture-handler` and `react-native-reanimated`, which Expo Go includes.
  - "Demo reset" (APP-7) also clears saved events and scores.
- **Pre-approved libraries:** `react-native-gesture-handler`, `react-native-reanimated` (both included in Expo Go).
- **Acceptance:**
  - Swiping is smooth on the demo iPhone, and a half swipe springs back.
  - A unit test on the ordering function shows that after saving two events of one category and skipping two of another, a later-starting card of the saved category comes before an earlier-starting card of the skipped one.
  - Saved events survive an app restart.
  - A saved event that is on today's map is highlighted once MAP-5's highlight exists.
  - The screen works in airplane mode.
- **Blocked by:** APP-3, AI-1
- **Uses if ready:** MAP-5
- **Blocks:** nothing
- **Dependency note:** Bonus. APP-3 must work on the demo iPhone, not just be merged.
- **Labels:** 📱 App, ✨ Bonus · **Milestone:** Thu

---

## 🗺️ Campus map (`viewer/src/campus/`, viewer build)

### MAP-1: Campus look test and layout
- **Assignee:** Juan
- **Goal:** Decide on Tuesday how the stylized campus is made, by comparing the three paths in SCOPE.md on the demo iPhone. Also produce the real `campus.json`.
- **Work:**
  - Pick the section: about 6 to 10 buildings around the demo building. Collect the reference: a campus map screenshot and an overhead image of that section. References guide the model; they are not shipped in the app.
  - Write `shared/fixtures/campus.json` (CONTRACTS.md section 3) for the section by reading positions off the reference: ids, names, approximate footprints, heights, entrances, main walkways. It only needs to be roughly right.
  - **Path A, procedural (about 2 hours):** give a coding agent the reference image and `campus.json` and have it write three.js code for the section in a game-like low-poly style: ground, roads, walkways, trees, and buildings with some character (roof shapes, windows, entrances) placed where `campus.json` says.
  - **Path B, image-to-3D (about 1 hour, at most $2):** generate the demo building as one model with an image-to-3D service (Meshy, Tripo, Hunyuan3D or similar; check the price before each run and write down what was spent). Export GLB, reduce it to at most 1.5 MB, and place it in the Path A scene.
  - **Path C, OpenStreetMap baseline (about 30 minutes):** only if A looks poor. Extrude real footprints from the Overpass API and style them.
  - Compare on the demo iPhone: how it looks in a screenshot next to the route viewer, frame rate while panning, size added to the viewer's HTML file, and hours spent. The built viewer file should stay under 8 MB.
- **Pre-approved libraries:** `@gltf-transform/cli` (GLB compression with meshopt, for Path B). The image-to-3D service is Juan's account and key.
- **Acceptance:**
  - `campus.json` validates against the `Campus` type, includes the demo building, and every `buildingId` in `events.seed.json` exists in it (update the seed in the same PR if ids change).
  - Screenshots of each path tried, taken on the iPhone, are in the PR with frame rate and file size for each.
  - The PR states the decision: A alone, A with named hero models from B, or C. The team agrees by Tuesday evening.
  - Money spent on model generation is written in `pitch/pipeline-numbers.md` and is at most $4 for the whole project.
- **Blocked by:** nothing, start now
- **Done needs:** S-1, APP-1 (merge without them; list the checks you could not run in your PR)
- **Blocks:** MAP-3
- **Gate:** Juan (image-to-3D account and spend)
- **Dependency note:** Reference images and the Path A/B experiments start now in a desktop browser. The `campus.json` PR waits for S-1; the on-iPhone comparison uses APP-1's screen.
- **Labels:** 🗺️ Campus map, ✅ Must have, 🚦 Do first, 💳 Costs money · **Milestone:** Tue

### MAP-2: Viewer scaffold, bridge and single-file build
- **Assignee:** open
- **Goal:** The shell both 3D scenes live in, usable from the app and from a desktop browser.
- **Work:** A Vite and TypeScript project in `viewer/` with three.js. `src/bridge.ts` implements CONTRACTS.md section 6: `window.ksugo.receive`, typed outgoing messages, the `ready` message, and browser mode (`?scene=campus` and `?scene=route` load fixtures; outgoing messages go to the console). `npm run build` produces one self-contained HTML file with no network requests and hands it to the app in the form APP-1 found to work. Each scene starts as a placeholder (a colored ground and a cube) in `src/campus/` and `src/route/`, behind a small scene interface: `load`, `handle(message)`, `dispose`.
- **Pre-approved libraries:** `vite`, `three`, `@types/three`, `vite-plugin-singlefile`, `vitest`.
- **Acceptance:**
  - `npm run dev` shows either placeholder scene in a desktop browser.
  - After `npm run build`, the app's `ViewerWebView` shows the same scene on an iPhone in airplane mode.
  - An unknown message type produces an `error` message and does not crash.
- **Blocked by:** S-1
- **Done needs:** APP-2 (merge without them; list the checks you could not run in your PR)
- **Uses if ready:** APP-1
- **Blocks:** APP-3, APP-4, MAP-3, MAP-4, ROUTE-2
- **When merged, check:** APP-6a
- **Dependency note:** The "shows on an iPhone" acceptance needs APP-2's `ViewerWebView`.
- **Labels:** 🗺️ Campus map, ✅ Must have · **Milestone:** Tue

### MAP-3: Stylized campus scene
- **Assignee:** Juan
- **Goal:** A campus section that looks good in the first five seconds of the demo.
- **Work:** Build the scene on the path chosen in MAP-1. On `campus:load`, show the section in one consistent game-like low-poly style: ground, roads and walkways, trees, and every building from `campus.json` at its stated position. If hero models are used, inline them in the build and load them without network requests; every other building is procedural. Soft lighting and a simple sky color. Camera: tilted view, one-finger pan, pinch zoom, two-finger rotate, clamped so the user cannot leave the section or go under the ground. Each building is one pickable object tagged with its id, so flags and labels can attach to it.
- **Pre-approved libraries:** three.js's own `GLTFLoader` and meshopt decoder (from `three/examples`), if hero models are used.
- **Acceptance:**
  - Every building in `campus.json` appears at its position, with north at the top by default.
  - Smooth on the demo iPhone while panning and zooming, and the built viewer file is under 8 MB.
  - The look uses a small named palette defined in one file, shared with the route scene.
  - Nothing copies art or models from an existing game.
- **Blocked by:** MAP-1, MAP-2
- **Blocks:** MAP-5
- **Labels:** 🗺️ Campus map, ✅ Must have · **Milestone:** Wed

### MAP-4: Event flags
- **Assignee:** open
- **Goal:** Every event is a flag that can be read at a glance and tapped.
- **Work:** For each event in `campus:load`, draw a flag at its building's entrance following the flag rule in CONTRACTS.md section 2 exactly: state from `now`, height from the formula, live flags pulsing, ended events hidden. Several flags at one building fan out so each can be tapped. A tap on a flag (with a generous touch target) sends `campus:flagTapped`. `campus:select` highlights that flag and eases the camera to it; `null` clears it. A second `campus:load` updates flags without rebuilding the buildings.
- **Acceptance:**
  - A unit test covers the state and height function, including the boundaries at 0, 60 and 240 minutes.
  - On an iPhone, every flag in the seed data can be tapped on the first try.
  - Live, soon and later flags are distinguishable without relying on color alone (height and pulse also differ).
- **Blocked by:** MAP-2
- **Uses if ready:** MAP-3
- **Blocks:** MAP-5
- **When merged, check:** APP-3
- **Dependency note:** Flags need only building entrances from `campus.json` and the scene interface, so this runs alongside MAP-3 on the placeholder buildings. Keep flags in their own file (e.g. `viewer/src/campus/flags.ts`) to avoid conflicts with MAP-3.
- **Labels:** 🗺️ Campus map, ✅ Must have · **Milestone:** Wed

### MAP-5: Map polish
- **Assignee:** open
- **Goal:** Make the map memorable.
- **Work:** In this order, as time allows: building name labels; a small legend for flag colors and height; a highlight (for example a star or a ring) on flags whose event id is in `savedEventIds` from `campus:load`, which APP-8 uses; flag cloth animation; low-poly trees; an opening camera move. Check frame rate on the demo iPhone after each addition.
- **Acceptance:**
  - Labels and legend are in. Each further item is either done or left out cleanly.
  - A `campus:load` without `savedEventIds` behaves exactly as before.
  - Still smooth on the demo iPhone.
- **Blocked by:** MAP-3, MAP-4
- **Blocks:** nothing
- **Labels:** 🗺️ Campus map, ✨ Bonus · **Milestone:** Thu

---

## 🧭 Indoor route (`viewer/src/route/`, `shared/instructions.ts`)

### ROUTE-1: Route layout function
- **Assignee:** open
- **Goal:** Turn a `Route` into geometry inputs with pure, tested code.
- **Work:** `layoutRoute(route)` in `viewer/src/route/layout.ts`, with no three.js imports. It applies the layout rules in CONTRACTS.md section 4 and returns, for each step, its start and end position, heading and floor index; the centerline polyline; and per floor, the corridor footprint (the union of rectangles `corridorWidthM` wide around each walk). A new floor starts when a `stairs` step sets `toFloor`, or at an `elevator` step, which keeps the horizontal position and changes the height as section 4 says.
- **Pre-approved libraries:** `polygon-clipping` (corridor merge: the union of corridor rectangles per floor).
- **Acceptance:**
  - Unit tests cover: a straight walk, left and right turns, both U-turns (position shifts sideways by `corridorWidthM`), stairs up and down, an elevator (numeric floors, and a non-numeric `toFloor`), and the full sample route with its expected end position.
  - The two stair flights in the sample route do not overlap in plan view.
  - Any step list the contract allows lays out without throwing, however odd: turns next to each other, corridors that overlap, stairs going below the start floor. An organizer's half-finished edit must still draw. The flawed draft fixture is one of the test inputs.
  - Only input that breaks the contract (negative length, empty steps) throws, with a clear error.
- **Blocked by:** S-1
- **Blocks:** ROUTE-2
- **Labels:** 🧭 Indoor route, ✅ Must have · **Milestone:** Tue

### ROUTE-2: Corridor scene
- **Assignee:** open
- **Goal:** The low-poly indoor route the pitch is built around.
- **Work:** On `route:load`, build the scene from `layoutRoute`: per floor, a floor slab following the corridor footprint and walls along its outline, cut low or drawn translucent so the inside is visible from above. Stairs as visible steps between floors using the real `riseM` and `runM`. Door frames at `door` steps with their labels. An `elevator` step is drawn as a shaft: a box at that position joining the two floors, with a label such as "Elevator to floor 3". A bright route line exactly on the centerline. A clear destination marker and label at the end, and an entrance marker at the start. Floor labels ("Floor 2") from `startFloor` and `toFloor`. Sending `route:load` again rebuilds the scene.
- **Acceptance:**
  - The sample route renders with two floors, two stair flights, three turns and both doors, in a desktop browser and on an iPhone.
  - The route line sits on the corridor centerline everywhere, and runs vertically through an elevator shaft.
  - A test route with an elevator renders with the next floor's corridor starting at the shaft.
  - The flawed draft fixture renders without errors.
  - Rebuilding ten times does not leak memory or slow down (old geometry is disposed).
- **Blocked by:** ROUTE-1, MAP-2
- **Blocks:** APP-6b, ROUTE-3
- **When merged, check:** ROUTE-5
- **Labels:** 🧭 Indoor route, ✅ Must have · **Milestone:** Wed

### ROUTE-3: Walk-through camera
- **Assignee:** open
- **Goal:** GPS-style guidance: the camera takes the student along the route.
- **Work:** Two camera modes: an overview that frames the whole route, and a follow view behind and above a moving marker. `route:goto` eases the marker and camera to the start of that step. `route:play` moves the marker along the centerline at a steady pace, climbing stairs, rising through elevators and rotating smoothly through turns, and sends `route:stepChanged` whenever it enters a new step. Play stops at the destination. A drag switches to free orbit until the next `goto` or `play`.
- **Acceptance:**
  - Playing the sample route reaches "Room 204" and reports every step index in order, once each.
  - `route:goto` during play stops play and jumps cleanly.
  - On floor changes, the floor being walked is always visible.
- **Blocked by:** ROUTE-2
- **Blocks:** nothing
- **When merged, check:** APP-4
- **Labels:** 🧭 Indoor route, ✅ Must have · **Milestone:** Wed

### ROUTE-4: Step instructions
- **Assignee:** open
- **Goal:** One place that turns steps into the words students and organizers read.
- **Work:** `shared/instructions.ts` with `stepInstruction(route, stepIndex): string` and `routeSummary(route): { totalM: number; floors: number; turns: number }`. Examples: "Go through the main entrance", "Walk 8 m", "Walk 5 m, past the vending machines" (uses `note`), "Turn right", "Make a U-turn to the right", "Take the stairs up to floor 2", "Take the elevator to floor 3", "Room 204 is here". Lengths are rounded to the nearest meter. Pure TypeScript, no dependencies, so both the app and the viewer can import it.
- **Acceptance:**
  - Unit tests cover every step type and direction, and the sample route's full instruction list reads naturally.
  - The last step of a route always names the destination.
- **Blocked by:** S-1
- **Blocks:** APP-4, APP-6a
- **Labels:** 🧭 Indoor route, ✅ Must have · **Milestone:** Tue

### ROUTE-5: Hand-measured demo routes and polish
- **Assignee:** open
- **Goal:** A guaranteed good route for the demo, whatever the AI pipeline does.
- **Work:** As soon as AI-2 has picked the routes, walk the two demo routes in the real building (the same ones filmed in AI-2) and write them by hand as `Route` JSON with paced or measured lengths (an elevator step is fine where the walk uses one), saved as `shared/fixtures/routes/<name>.hand.json` with `status: "confirmed"` and every step `source: "organizer"`. Then polish the scene: readable door and floor labels, lighting, colors that match the campus map's palette.
- **Acceptance:**
  - Both hand routes validate against the `Route` type and render correctly.
  - A teammate who knows the building agrees each route matches the real walk.
  - The seed events for the demo building point at these routes until AI-6 replaces them.
- **Blocked by:** AI-2
- **Done needs:** ROUTE-2 (merge without them; list the checks you could not run in your PR)
- **Blocks:** PITCH-6
- **When merged, check:** APP-7, AI-5
- **Dependency note:** This is the demo's safety net, so do not wait for ROUTE-3: write the hand-route JSON as soon as AI-2 has picked the routes (Wednesday). Rendering checks and polish need ROUTE-2.
- **Labels:** 🧭 Indoor route, ✅ Must have · **Milestone:** Thu

---

## 🤖 AI + server (`server/`)

The server and its API keys run on Juan's laptop. Tickets marked 💳 make paid calls; whoever builds them, the live runs go through Juan.

### AI-1: API server in mock mode
- **Assignee:** open
- **Goal:** The whole API from CONTRACTS.md section 5, working with no keys, so the app is never blocked.
- **Work:**
  - FastAPI app in `server/main.py` with pydantic models in `server/models.py` mirroring CONTRACTS.md. Implement every endpoint and error code, including `GET /api/events?range=week` and the room rule on confirm.
  - **Events** load from `events.seed.json` at startup with times converted as section 2 describes.
  - **Fixture routes:** `route.sample.json` and every file in `shared/fixtures/routes/` load at startup, so `GET /api/routes/{id}` serves them. They are re-read from the files at every start, so restarting the server resets a fixture draft that was edited or confirmed.
  - **Uploaded routes** and registrations are kept in memory and saved to JSON under `server/data/`. At startup, any saved route still in `processing` becomes `failed` with the error "The server restarted. Upload the video again."
  - **Mock pipeline:** with `PIPELINE_MODE=mock`, an upload walks through the progress stages over about 10 seconds and then returns `route.draft-flawed.json` as a `draft` with a new id. `PUT .../steps` runs a stub verifier: it recomputes `leg_length_range`, and keeps each other planted check until its step is deleted or its `source` becomes `"organizer"` (edited, or marked "Looks right").
  - **The pipeline never blocks the API.** Run it in a worker thread, in mock mode too, so the same structure serves the live pipeline.
  - `PUT .../steps` rejects a step list that does not begin and end with a `door` (`invalid_request`).
  - Allow all CORS origins. Add a `server/README.md` section on running the server behind a tunnel (for example `cloudflared tunnel --url http://localhost:8000`) and entering the address in the app's hidden settings screen.
- **Pre-approved libraries:** `fastapi`, `uvicorn`, `pydantic`, `python-multipart` (uploads), `python-dotenv` (env loading), `pytest`, `httpx` (test client).
- **Acceptance:**
  - `pytest` covers each endpoint's success case and each error code in the table.
  - `GET /api/health` answers in under half a second while a mock pipeline run is in progress.
  - A phone on a different network can reach `/api/health` through the tunnel.
  - No API key is needed in mock mode.
- **Blocked by:** S-1
- **Blocks:** APP-5, APP-6a, APP-8, AI-4, AI-7
- **When merged, check:** AI-3
- **Labels:** 🤖 AI + server, ✅ Must have · **Milestone:** Tue

### AI-2: Film the demo building, and the ingest step
- **Assignee:** open
- **Goal:** Real campus test videos chosen to suit the route format, and a safe way to prepare any video for the AI services.
- **Work (people):**
  - **Choose routes the format can express.** The route format only has 90° turns and U-turns. Pick a building and two rooms on different floors where the walk has right-angle corridors, a switchback stairwell, and three to five turns. Avoid atriums crossed diagonally, curved corridors and angled wings.
  - **Camera settings:** 1080p at 30 fps, HDR video off.
  - Film each route twice, following the filming rules in `docs/pipeline.md`, when the hallways are empty. End each take with the room number filling about a third of the frame, held for two seconds.
  - Write down, for each route: the true sequence of turns and stairs, the start floor and the destination floor.
  - Keep the videos out of git.
- **Work (code):** `server/pipeline/ingest.py`: take an uploaded video; reject it if it is longer than 3 minutes or unreadable; strip all metadata with a stream copy (no re-encode); **assert that no GPS location remains and abort if it does**; compute the SHA-256 of the upload. Details are in `docs/pipeline.md` under "Video handling". The stripped file is what later stages use. There is no reduced copy at this stage; AI-5 makes its own.
- **Measure and report on Tuesday:** the file size of each video, and the size of a 720p copy of it. Whoever has AI-3 combines this with a reading test to decide the export setting in APP-5.
- **Pre-approved libraries:** `imageio-ffmpeg>=0.8.1`.
- **Acceptance:**
  - Four campus videos exist, each with its true turns, stairs and floors written down.
  - A test with a small video that carries a location tag shows the output has none, and that the assertion fires if stripping is skipped.
  - The stripped file plays with the right orientation.
  - The size report is posted to the team.
- **Blocked by:** nothing, start now
- **Blocks:** ROUTE-5, AI-3, AI-7
- **Dependency note:** Film Tuesday morning; the Tuesday-evening Gemini run needs these videos.
- **Labels:** 🤖 AI + server, ✅ Must have, 🚦 Do first · **Milestone:** Tue

### AI-3: Gemini timeline
- **Assignee:** open
- **Goal:** The AI watches the walk and writes down what happened, as structured data, accurately enough that a demo route needs at most one correction.
- **Schedule:** Make the first run on a campus video on **Tuesday evening**, with a throwaway script, as soon as AI-2 has videos. **Every paid run, including this one and the frame-rate experiment, happens on Juan's laptop** (by Juan, or by the ticket holder at his machine, with his OK). The key never leaves it. Wednesday is then spent improving the prompt, not finding out whether it works. In that first run, send one video twice, as the original and as a 720p copy, and note whether the room number at the end is read correctly in each. Together with the file sizes from AI-2, this decides the export setting in APP-5: 720p only if the upload would otherwise pass 100 MB or the reading is no worse.
- **Work:** `server/pipeline/timeline.py`.
  - **Input:** send Gemini the metadata-stripped upload itself, at full quality, as described in `docs/pipeline.md` under "Gemini". Use a paid-tier key; inputs sent on the free tier may be used by the provider.
  - **Schema:** a list of timed events. Types: `walk`, `turn_left`, `turn_right`, `u_turn_left`, `u_turn_right`, `turn_into_room`, `stairs_up`, `stairs_down`, `door`, `sign`, `pan`. Every event has `startSec`, `endSec`, a `confidence` from 0 to 1 and a short `note` (landmark, or the sign's text). Also: a motion log with one entry per two seconds of video (`forward`, `rotating_left`, `rotating_right`, `still`, `on_stairs`), listed before the events so the model commits to what it saw first; the floor seen at the start; and the room number read at the end.
  - **Prompt.** State these plainly:
    - Left and right are from the walker's point of view. In a left turn the scene slides to the right across the frame.
    - A turn is about 90° and the walker continues in the new direction. A U-turn is about 180°; the usual case is the landing between two flights of stairs.
    - A pan is when the walker stands still and looks around. It is not a turn.
    - The last turn through the room's doorway is `turn_into_room`.
    - Only report a sign's text if it is readable.
  - **Frame rate experiment:** run the four campus videos at 1, 2 and 4 frames per second and compare turn accuracy. Budget about $1. Keep the lowest rate that gives the best accuracy.
  - **Validation:** besides the schema, check that events are in order, have positive length, fall inside the video's duration and do not overlap. Trim small overlaps and fill gaps as `walk`.
  - **Failures:** a 3-minute timeout on the whole call. On a timeout, a rate-limit or server error, or an answer that fails validation, retry once. Then the route becomes `failed` with a clear `error`.
  - **Store and spend:** save the validated timeline under the video's SHA-256. A later upload of the same file skips the paid call. Record every call's cost in the spend log and enforce the cap (`docs/pipeline.md`, "Spend guard"), returning `budget_exceeded` when it is reached.
- **Pre-approved libraries:** `google-genai>=3.3.0` (Gemini SDK).
- **Acceptance:**
  - For each of the four campus videos, the PR lists the true sequence, the returned sequence and the edit distance, at each frame rate tried.
  - **Threshold:** the two takes chosen for the demo need at most one correction each. If they do not, say so on Wednesday: the team then picks a simpler route, or the demo uses the hand routes from ROUTE-5.
  - The PR says whether the room number at the end was read correctly in each video.
  - **Tests use recorded responses.** Save real Gemini answers from the live runs under `server/tests/recordings/` and replay them; no test calls Gemini or needs a key. Tests cover parsing, validation, the retry, the timeout and the cap (with the cap at 0, the client is never called).
  - **Manual live checks on Juan's server**, written in the PR: uploading the same file twice makes one paid call (shown by the spend log).
- **Bonus:** an `elevator` event type (with the floor reached, if a sign or the panel shows it), which AI-4 turns into an `elevator` step. Not needed for the demo.
- **Blocked by:** AI-2
- **Done needs:** AI-1 (merge without them; list the checks you could not run in your PR)
- **Blocks:** nothing
- **When merged, check:** AI-4
- **Gate:** Juan's laptop and OK for every paid run
- **Dependency note:** The Tuesday-evening throwaway run needs only the videos. Wiring the spend cap into the API needs AI-1.
- **Labels:** 🤖 AI + server, ✅ Must have, 💳 Costs money · **Milestone:** Wed (first run Tue evening)

### AI-4: Assemble and verify
- **Assignee:** open
- **Goal:** A complete `live` pipeline from upload to a checked draft route that the organizer can always finish.
- **Why the motion check moved to AI-7:** APP-6b, AI-5 and AI-6 wait only on assemble and verify. The motion cross-check (AI-7) is time-boxed and may be removed, so it must not hold them up.
- **Work:**
  - **Assemble** (`assemble.py`): convert the timeline to `Route` steps.
    - **Doors:** the route always starts with a door ("Main entrance", or Gemini's note for it) and always ends with a door labelled with the route's `destination`, whether or not Gemini reported them. `turn_into_room` becomes a turn followed by that final door.
    - **Walks:** `lengthM` is the walk's duration times 0.7 m/s, not counting time inside `sign` or `pan` events. Walks shorter than 0.5 m are merged into a neighbor or raised to 0.5 m. Pans are dropped.
    - **Stairs:** the organizer's `startFloor` and `destinationFloor` decide the height, not the video. With N floors between them and F flights in that direction, each flight rises `N × 3.6 / F` meters and runs 1.6 times its rise. The last flight gets `toFloor` equal to `destinationFloor`; when F divides evenly by N, the flight that ends each floor in between gets that floor. If the flights do not fit the floors (floors differ but no stairs were found, stairs were found but the floors are the same, or flights go both ways), use 1.8 m per flight and add a `warn`.
    - **Switchbacks:** between two flights in the same direction less than 8 seconds apart, a single left or right turn becomes a U-turn to that side with a `warn`; two turns to the same side merge into one U-turn; no turn at all gets a U-turn inserted with a `warn`, using the side the motion check saw, or the right if it saw nothing.
    - **Notes:** a sign or landmark becomes the `note` on the nearest walk only when its confidence is 0.8 or more.
    - `confidence` and `tSec` are carried over; `source` is `"ai"`.
  - **Verify** (`verify.py`): plain code that returns `checks`, run on every draft and on every `PUT .../steps`.
    - `fail`: `leg_length_range` (a walk shorter than 0.5 m; cleared by deleting it); `elevator_floor` (an elevator whose `toFloor` is the floor it is already on).
    - `warn`: `long_walk` (a walk over 80 m, which the organizer cannot shorten); `ends_on_destination_floor` (the floor after the last step is not `destinationFloor`); `total_length` (total length does not fit the video's duration at 0.4 to 1.5 m/s); `stair_rise` (a flight outside 1.0 to 4.5 m); `low_confidence` (a step under 0.6, naming the step); the two motion checks; and the assemble warnings above.
    - `low_confidence` and the motion checks are skipped for steps with `source: "organizer"`.
    - **Rule:** a check may be `fail` only if the edits in APP-6a and APP-6b can clear it. Anything else is a `warn`.
  - **Robustness:** the live pipeline runs in the worker thread from AI-1. Fill `stats` with the video length, processing time and cost.
  - **Hook for AI-7:** leave a clear place in assemble and verify where the motion results plug in (the switchback side, and the two motion checks). Until AI-7 lands, an inserted switchback U-turn goes to the right.
- **Pre-approved libraries:** `numpy`.
- **Acceptance:**
  - **Tests use recorded timelines** from `server/tests/recordings/` (AI-3) and hand-written ones; no test calls a paid service or needs a key.
  - **Manual live check on Juan's server**, written in the PR: with `PIPELINE_MODE=live`, uploading a campus video yields a `draft` that renders in the route viewer and can be confirmed after edits.
  - Unit tests cover each assemble rule above with a small hand-written timeline, including: no final door reported, a single left turn between two flights, two flights with no turn, and a 0.2-second walk.
  - Unit tests cover each verifier check with a passing and a failing route.
  - `GET /api/health` answers in under half a second during a live run.
- **Blocked by:** AI-1
- **Done needs:** AI-3 (merge without them; list the checks you could not run in your PR)
- **Blocks:** APP-6b, AI-5, AI-6
- **When merged, check:** AI-7
- **Gate:** Juan's laptop for the live check
- **Dependency note:** Assemble and verify are plain code: build them on hand-written timelines (schema in AI-3) while AI-3 runs. Its recorded-response tests and live check wait on AI-3.
- **Labels:** 🤖 AI + server, ✅ Must have, 💳 Costs money · **Milestone:** Wed

### AI-5: Measured lengths from MapAnything
- **Assignee:** open
- **Goal:** Replace time-based lengths with measured ones. **Cut line: if this is not working by Thursday 2 pm, stop and ship without it.**
- **Work:** `server/pipeline/geometry.py`.
  - **Its own video copy:** from the stripped upload, make a 720 px, constant frame rate copy capped at 1.5 Mb/s, tonemapped to SDR if the source is HDR (`docs/pipeline.md`, "Video handling"). This copy is only for MapAnything; Gemini keeps the full-quality file.
  - Split that copy at timeline boundaries into segments of at most 30 seconds with 2 seconds of overlap, and run each through MapAnything as described in `docs/pipeline.md` under "MapAnything on Replicate".
  - From the camera poses of each segment take only: the path length of each walk, and the ceiling height where visible. Stair heights stay as AI-4 sets them from the floors. Do not join segments into one model.
  - Sanity-check each segment's scale (camera height 1.1 to 1.6 m on flat floor). If a segment fails, keep the time-based length for its steps and add a `warn` check.
  - Report progress as the `geometry` stage. Record every call in the spend log.
- **Pre-approved libraries:** `replicate>=1.0.7` (Replicate client).
- **Acceptance:**
  - On one campus video, measured walk lengths are compared with paced lengths from ROUTE-5 and the differences are written in the PR.
  - A failed or timed-out segment degrades to time-based lengths; the route still reaches `draft`.
  - No clip over 15 MB is ever sent.
  - An HDR `.mov` produces a normal-looking SDR copy.
- **Blocked by:** AI-4
- **Done needs:** ROUTE-5 (merge without them; list the checks you could not run in your PR)
- **Blocks:** nothing
- **Gate:** Juan's laptop (Replicate)
- **Dependency note:** Bonus. Cut line Thursday 2 pm. The comparison needs ROUTE-5's paced lengths.
- **Labels:** 🤖 AI + server, ✨ Bonus, 💳 Costs money · **Milestone:** Thu

### AI-6: Bake the demo routes and record the numbers
- **Assignee:** Juan
- **Goal:** Real AI-drafted, organizer-confirmed routes in the app, the draft for the stage, and measured numbers for the slides.
- **Work:**
  - **Run** the best take of each demo route through the live pipeline, uploaded from the demo iPhone through the app, so the input is the same kind of file the stage will use.
  - **Stage draft:** save the AI's draft of the stage route, before any correction, as `shared/fixtures/routes/<name>.draft.json`, and delete `routes/placeholder.draft.json` from S-1. The server loads it at startup and the app lists it under drafts (APP-5). The best stage draft has one wrong turn that the code flagged. Look for one among the takes and routes, and never plant an error in a real draft. If no draft has one, tell whoever has PITCH-4 which case applies, so the script matches: (a) the draft is right and its flags are false alarms, so the organizer taps "Looks right" and confirms, and the pitch says this draft needed no correction; or (b) a turn is wrong but not flagged, so the organizer fixes it and the pitch credits the organizer, not the code.
  - **Confirm** each route in the app's organizer flow (or, if APP-6b is not ready, with APP-6a plus direct calls to `PUT /api/routes/{id}/steps`), writing down how many steps had to change. Save the confirmed routes to `shared/fixtures/routes/` and point the seed events at them, leaving the one seed event with no route (S-1) in the stage route's room.
  - **Rehearse the stage flow** once from a fresh server start: sign in as the organizer (Noah Brooks), open the prepared stage draft in the Organizer tab, fix, confirm, and see "Take me there" appear on the event with no route. No upload is run on stage; the upload flow is only mentioned.
  - **Numbers:** write `pitch/pipeline-numbers.md`. For each run: video length, upload time from the phone, processing time, cost, number of steps and number of organizer corrections. State whether MapAnything was part of the run. Add total spend so far.
- **Acceptance:**
  - Two AI-drafted, organizer-confirmed routes are in fixtures and open from their event cards. Each needed at most one correction; if not, the hand routes from ROUTE-5 stay in place and the pitch says which is which.
  - The stage draft fixture exists, and restarting the server brings it back unconfirmed.
  - `pitch/pipeline-numbers.md` contains only measured values.
- **Blocked by:** AI-4, APP-5, APP-6a
- **Done needs:** APP-3 (merge without them; list the checks you could not run in your PR)
- **Uses if ready:** APP-6b, AI-7, AI-5
- **Blocks:** nothing
- **When merged, check:** PITCH-3, PITCH-4
- **Gate:** Juan (live runs)
- **Dependency note:** The stage rehearsal step ("Take me there" appears) needs APP-3.
- **Labels:** 🤖 AI + server, ✅ Must have, 💳 Costs money · **Milestone:** Thu

### AI-7: Motion cross-check
- **Assignee:** open
- **Goal:** Catch wrong left/right turns, which ordinary checks cannot see. **Time-box: three hours.** If it does not pass its bar, it is removed, and that is a valid way to close this ticket.
- **Order:** Wednesday after AI-4's core, or Thursday morning ahead of AI-5.
- **Work** (`server/pipeline/motion.py`), tested on Tuesday's videos:
  - Decode the video to small grayscale frames (about 160 px wide, 10 per second). For each pair of frames, estimate how far the image slid sideways (phase correlation). Sideways slide is rotation: calibrate the scale so the known 90° turns in Tuesday's videos add up to about 90.
  - For each turn in the timeline, add up the rotation from 2 seconds before to 2 seconds after. If the side disagrees, or the size is clearly the other kind (about 90 against about 180), attach a `turn_motion_mismatch` warn to the step, such as "The video turns left here."
  - Where the video rotates 60° or more within 4 seconds and the timeline has no turn or pan, split the walk at that time and insert a turn with confidence 0.3 and a `turn_from_motion` warn: "The video turns here but the AI did not report it. Keep or delete."
  - Save the per-second rotation with the route under `server/data/`, so `PUT .../steps` can re-run the check without the video. Steps with `source: "organizer"` are never checked against motion; the organizer has the last word.
  - This check verifies and supplements Gemini's turns. It does not replace them.
  - **Pass bar:** on the four campus videos, at least 9 in 10 true turns get the right side, with no more than one false "unreported turn" per video. **If it does not pass in three hours, remove it,** keep the low-confidence check, and tell whoever has PITCH-4: the pitch wording changes to "low-confidence turns are flagged" (see SCOPE.md).
  - **Cleanup after a removal, done by a person in one PR** (coding agents may not change contracts): delete step 3 from the pipeline section of `docs/pipeline.md`; delete `turn_motion_mismatch` and `turn_from_motion` from the checks table in CONTRACTS.md; and change the planted check on `s9` in `route.draft-flawed.json` to `low_confidence`. In assemble, an inserted switchback U-turn then always goes to the right.
- **Pre-approved libraries:** `numpy`, `opencv-python-headless<5` (frame decoding and phase correlation).
- **Acceptance:**
  - The motion check is tested on short clips cut from the campus videos, which cost nothing.
  - The PR reports the result against the pass bar, and states whether the check stays or is removed. If removed, the cleanup PR above is done and whoever holds PITCH-4 is told.
- **Blocked by:** AI-1, AI-2
- **Done needs:** AI-4 (merge without them; list the checks you could not run in your PR)
- **Blocks:** nothing
- **When merged, check:** PITCH-4
- **Dependency note:** Time-boxed to 3 hours. Calibrate on AI-2's clips on their own; hooking the checks into verify needs AI-4. Closing it as removed counts as done.
- **Labels:** 🤖 AI + server, ✅ Must have · **Milestone:** Wed (overflow Thu morning)

---

## 🎤 Pitch (`pitch/`)

These are shared. PITCH-1 takes 30 minutes and must go out Tuesday morning, because responses need days.

### PITCH-1: Student survey
- **Assignee:** open
- **Goal:** Our own numbers for the campus impact score.
- **Work:** A one-minute Google Form, anonymous, sent Tuesday morning through class group chats, club Discords and a QR code shown in person at a busy spot. Questions: (1) How many campus events did you attend this semester? (0, 1 to 2, 3 to 5, 6+) (2) Have you skipped an event or arrived late because you could not find the room or building? (Yes, more than once / Yes, once / No) (3) How do you usually find out about events? (OwlLife, Instagram, friends, flyers, email, other) (4) How do you find a room in a building you have not been in? (ask someone, wander, signs, online map, other) (5) Would a map of today's events with directions to the room door make you more likely to go? (1 to 5) (6) Year, and commuter or resident.
- **Acceptance:**
  - At least 50 responses by Thursday noon; the real count is reported whatever it is.
  - `pitch/survey-results.md` gives the count, the date range, how it was distributed, and the result for each question.
  - No number is estimated or rounded in our favor.
- **Blocked by:** nothing, start now
- **Blocks:** nothing
- **When merged, check:** PITCH-4
- **Dependency note:** Send Tuesday morning; responses need days.
- **Labels:** 🎤 Pitch, ✅ Must have, 🚦 Do first · **Milestone:** Tue (send), results Thu

### PITCH-2: OwlLife event counts
- **Assignee:** open
- **Goal:** Show the size of the problem with KSU's own public data.
- **Work:** From the public OwlLife events listing, count by hand or by export: events listed this week and over the last 30 days; how many give a building and room; how many distinct rooms and buildings they use; how many organizations host them. Add KSU's enrollment from an official KSU page, with the link. For the demo building, count its events this month.
- **Acceptance:**
  - `pitch/event-counts.md` has each number with the date it was counted and how.
  - Every figure has a source link. Nothing is invented.
  - One sentence combines the counts into the reach claim used on the opening slide (events per week, rooms, students).
- **Blocked by:** nothing, start now
- **Blocks:** PITCH-3
- **When merged, check:** PITCH-4
- **Labels:** 🎤 Pitch, ✅ Must have · **Milestone:** Wed

### PITCH-3: Feasibility slide
- **Assignee:** open
- **Goal:** Answer "could KSU actually use this?" on one slide.
- **Work:** Use only the measured values in `pitch/pipeline-numbers.md` (AI-6) for cost and time per route, and say which pipeline they describe. The earlier reference of $0.31 and about 10 minutes for an 86-second walk included MapAnything, which was about 8 of those minutes and $0.25 of that cost; if the demo ships without MapAnything, those figures do not apply. Content: cost and time per route; cost to cover every room counted in PITCH-2 (rooms times cost per route, since a route belongs to a room and is reused by every event there); what KSU needs to supply (an event feed from OwlLife and one phone video per room, filmed by the organizer; no beacons, floor plans or hardware); rollout in three steps (one building as a pilot, then the busiest event buildings, then campus-wide); privacy (location stripped from every video, hallways filmed empty; before saying anything about what the AI provider does with the videos, read the terms of the tier we used and quote them); and what a person still does (confirms the turns). Describe the route with the wording in SCOPE.md, not as a 3D reconstruction.
- **Acceptance:**
  - Every number on the slide traces to `pitch/pipeline-numbers.md` or `pitch/event-counts.md`.
  - The slide can be read in 20 seconds.
- **Blocked by:** PITCH-2
- **Done needs:** AI-6 (merge without them; list the checks you could not run in your PR)
- **Blocks:** nothing
- **When merged, check:** PITCH-4
- **Dependency note:** Lay out the slide with blanks once PITCH-2 is in; the cost/time numbers come from AI-6 on Thursday.
- **Labels:** 🎤 Pitch, ✅ Must have · **Milestone:** Thu

### PITCH-4: Deck and script
- **Assignee:** open. One person holds this ticket and edits the slides; others send numbers and screenshots to them.
- **Goal:** A five-minute story that scores on all five criteria.
- **Work:** Follow the demo story in SCOPE.md. At most six slides: problem with our numbers, live demo (student), live demo (organizer and how the AI works: AI drafts, code verifies, organizer confirms), feasibility, close. Write the script with a time mark per section and name who speaks and who drives the phone.
  - **Prepared draft:** no live upload on stage. The script signs in as the organizer (Noah Brooks), mentions the upload flow in the Organizer tab, then opens the prepared draft made earlier from the same video, fixes it and confirms it. Say so plainly, and give the processing time measured in AI-6, not a fixed "10 minutes".
  - **Route wording:** the route is drafted by AI from the video and drawn from the step list. Never call it a 3D reconstruction or a scan.
  - **Verifier wording:** use the line from SCOPE.md that matches AI-7's result. If the motion check stayed: code compares each AI turn with the camera's motion and flags the ones that disagree. If it was removed: low-confidence turns are flagged.
- **Acceptance:**
  - A read-through of the script takes 4:30 or less.
  - Each judging criterion is clearly addressed by at least one section.
  - The words "3D reconstruction" and "scan" do not appear in the slides or the script as a description of the route.
  - Every claim about what the code checks matches what AI-4 and AI-7 shipped.
  - Slides and app share the same original visual style.
- **Blocked by:** nothing, start now
- **Done needs:** PITCH-1, PITCH-2, PITCH-3, AI-7, AI-6 (merge without them; list the checks you could not run in your PR)
- **Blocks:** PITCH-7
- **Dependency note:** Do not wait for the numbers: start the deck and script Wednesday from SCOPE.md's demo story with placeholders. Final numbers come from PITCH-1/2/3 and AI-6; the verifier line from AI-7's result.
- **Labels:** 🎤 Pitch, ✅ Must have · **Milestone:** Thu

### PITCH-5: Demo rig and backup recording
- **Assignee:** open
- **Goal:** The demo works on the room's screen, or we have video that does.
- **Work:** Find out how the iPhone will be shown (HDMI adapter, or mirroring to a laptop) and test it. Decide the network for the demo: phone and laptop on a phone hotspot is the default. Record the full demo flow from the iPhone screen as a backup video and put it in the deck; the organizer part needs the server, so this video is its only fallback. Write a one-page checklist for before going on: server restarted (this resets the stage draft), tunnel running and its address entered in the app's hidden settings, no "Offline data" badge, demo reset done, phone on do-not-disturb, brightness up.
- **Acceptance:**
  - The app has been shown on an external screen from the demo iPhone.
  - The backup video plays from the deck with no network.
  - The checklist exists in `pitch/`.
- **Blocked by:** nothing, start now
- **Done needs:** APP-7 (merge without them; list the checks you could not run in your PR)
- **Blocks:** PITCH-7
- **Dependency note:** Test the HDMI adapter or mirroring and the hotspot any time. The backup recording needs APP-7.
- **Labels:** 🎤 Pitch, ✅ Must have · **Milestone:** Thu

### PITCH-6: Timed hallway test
- **Assignee:** open
- **Goal:** A direct measure of whether the route helps.
- **Work:** Ask a few students who do not know the demo building to find the demo room from the entrance: half with only the room number, half with the app's route. Time each and note wrong turns.
- **Acceptance:**
  - `pitch/hallway-test.md` reports every participant's time and condition, and the group size, without overstating a small sample.
- **Blocked by:** APP-4, ROUTE-5
- **Uses if ready:** AI-6
- **Blocks:** nothing
- **Dependency note:** Bonus. Needs a confirmed route on the phone; the hand route is enough.
- **Labels:** 🎤 Pitch, ✨ Bonus · **Milestone:** Thu

### PITCH-7: Rehearsals
- **Assignee:** open
- **Goal:** A calm, on-time pitch.
- **Work:** At least three full timed run-throughs on Friday with the real rig, including one with the network off and one where the backup video is used. Prepare answers for likely questions: accuracy of the routes; what happens when the AI is wrong (checks, the confirm screen, and re-filming when a draft needs more than about four corrections); cost at campus scale; privacy; accessibility (stairs-only routes, elevator steps); and how it connects to OwlLife.
- **Acceptance:**
  - The last run-through is under five minutes.
  - Everyone knows their part and the fallback if the phone fails.
- **Blocked by:** PITCH-4, PITCH-5
- **Blocks:** nothing
- **Labels:** 🎤 Pitch, ✅ Must have · **Milestone:** Fri
