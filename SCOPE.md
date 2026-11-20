# KSU-GO scope

KSU-GO is a 3D campus events app. The campus is a stylized 3D map, every event today is a flag, and an AI-built indoor route takes the student from the building entrance to the room door.

**Calendar.** Build days are Tue Nov 17, Wed Nov 18 and Thu Nov 19. Features freeze Thursday evening. Fri Nov 20 is for rehearsal, fixes and the demo.

**Settled decisions.**

- The app is React Native with Expo in TypeScript, running in Expo Go on an iPhone. No Mac or native build is needed.
- Both 3D views are three.js inside a WebView, so they can be built and tested in a desktop browser.
- The campus map is a stylized 3D model made with AI from a reference image (a campus map screenshot or overhead photo). It does not need to match the real campus. See "Campus map approach" below.
- The organizer flow (upload video, confirm turns) lives in the same app.
- The backend is FastAPI on Juan's laptop behind a tunnel. That laptop holds the API keys, and every paid run goes through Juan.
- Event data is fake. Spend has a soft cap of $20 in total: up to $4 for 3D model generation, and the server refuses new pipeline runs at $14. Any tool or paid model is fine inside that.

## Demo story (5 minutes)

| Time | What the judges see | Criterion it serves |
|---|---|---|
| 0:00 | The problem, with our numbers: how many events KSU lists a week, and what share of surveyed students have skipped or been late to one because they could not find the room. | Campus impact |
| 0:40 | A student, signed in as Maya Chen, opens the app. The 3D campus has a flag per event; tall flags start soonest and the pulsing ones are live. They tap one, read the card, and register. | Creativity |
| 1:30 | They tap "Take me there". A low-poly 3D route walks them from the Math D entrance to the door of Room 215, using ROUTE-5's confirmed hand route. | Creativity, use of AI |
| 2:20 | Where the route came from: an organizer filmed one plain phone video. Sign in as Noah Brooks, who owns Robotics Club → Organization tab → Robotics Build Night (Math D, Room 113) → Directions → review the prepared draft from the real route2 run → "Looks right" → confirm. The Game Development Club event in Room 113 now has directions too. This draft needed no turn correction; code flagged uncertainty and the organizer checked it. We mention Add directions without uploading on stage. Rooms that already have confirmed directions are view only. | Use of AI |
| 3:40 | What it costs KSU: the measured cost and time per route, no beacons or floor plans, one route per room reused by every event there, and a rollout that starts with one building. | Feasibility |
| 4:30 | Close: the survey number again, and the ask. | Pitch |

**Wording.** Two rules for the pitch, the deck and the app:

- **The route.** It is "drafted by AI from the video and drawn from the step list". We never call it a 3D reconstruction or a scan of the building.
- **The verifier.** Say only what shipped. If the motion cross-check in AI-7 passes its test: "code compares each AI turn with the camera's motion in the video and flags the ones that disagree". If it is removed: "low-confidence turns are flagged".

**The prepared draft.** No upload runs on stage. Noah opens Organization → Robotics Build Night (Room 113) → Directions → Review draft. The real route2 output is bundled as `shared/fixtures/routes/room-113.draft.json`, attached to that event by the server. Review the flagged step, tap "Looks right" and confirm; do not claim a wrong turn was corrected. Both events in Room 113 get directions immediately. Restarting the server restores this fixture draft for rehearsal. Nobody plants an error in a real draft.

**Student route.** ROUTE-5's confirmed hand route for Math D Room 215 is bundled, and every event in that room uses it. Room 113 starts without confirmed directions so the prepared draft can be reviewed; its hand route is retained only as an unlinked fallback outside the loaded routes.

**Timing claims.** The earlier reference of about 10 minutes per route was mostly MapAnything (about 8 of the 10). Slides and script quote the time and cost measured in AI-6 for the pipeline that actually shipped.

## Campus map approach

**Recommendation: a procedural base with a few AI-generated hero models, decided by a Tuesday comparison test (MAP-1).**

| Path | What it is | Strength | Weakness |
|---|---|---|---|
| A. Procedural | A coding agent looks at the reference image and writes three.js code: ground, roads, paths, trees and simple low-poly buildings. | One consistent style that matches the route viewer. Tiny, fast, easy to edit, no asset files. | Buildings are simple shapes unless time is spent on them. |
| B. Image-to-3D | Meshy, Tripo, Hunyuan3D or similar turn an image into a model for a hero building or prop. | The most detailed single objects. | Styles differ between models, files are heavy, and each model must be inlined into the viewer's single HTML file. |
| C. OpenStreetMap | Real footprints extruded and styled. | Always works; an hour of work. | Looks like a map, not a game world. |

Path A is the base because it carries the least risk: it is code, so it fits the single-file viewer, runs fast on the phone, and keeps one look. Path B is added only for one to three hero pieces (the demo building, a landmark), and only if the Tuesday test shows they match the base style and stay small. Path C is the fallback if A looks poor by Tuesday evening.

Whichever path wins, `campus.json` stays the logical layout (building ids, names, entrances), so flags, events and the app are unaffected by the choice.

## Must-haves

1. **Campus map.** One polished campus section in 3D, with flags that follow the flag rule in CONTRACTS.md and can be tapped.
2. **Event card and register.** Card with title, time, place and organizer; a register button that sticks.
3. **Route viewer.** Corridor-style 3D route with stairs, turns, doors and a destination marker, plus a step-by-step walk-through with text instructions.
4. **Video-to-route pipeline.** Video in, draft route out: Gemini timeline, lengths from walking time, stair heights from the floors the organizer enters, verifier checks. The timeline is stored per video file, so the same video never costs twice. Every draft can be finished by the organizer: no check blocks confirming unless the app's edits can clear it.
5. **Organization and directions flow.** An owner opens Organization → event → Directions. A room with confirmed directions is view only. Otherwise Add directions lets them enter the two floors, pick a video, watch progress and review its draft. Review opens at the first flagged step, with change, delete or insert turn, split walk, flip stairs and "Looks right" controls, then confirm for every event in the room. The stage draft opens from Robotics Build Night's Directions row, with no drafts tab or list. Finishing a typical draft takes under a minute.
6. **Real routes.** At least two confirmed routes in one real KSU building, bundled in the app.
7. **Offline demo.** With no server, a guest can browse today's and this week's events and walk any confirmed route from bundled data; registering and organizer actions need a sign-in.
8. **Impact data.** Survey results and OwlLife event counts, collected by us.
9. **Feasibility slide and a rehearsed 5-minute pitch,** with a backup screen recording.

## Nice-to-haves, in order

1. MapAnything-measured leg lengths and ceiling height (AI-5). Without it, lengths come from walking time.
2. Editing leg lengths in the confirm screen.
3. A timed hallway test: a few students find a room with and without the app.
4. A swipe deck of this week's events (APP-8): swipe right to save, left to skip; saved events are highlighted on the map, and the deck reorders toward what the student saves. It starts only after the map and event card work.
5. The AI detecting elevators in the video. Elevator steps are in the route format and the viewer either way, so hand-written routes and organizers can use them.
6. Blurring faces before upload.
7. Map polish: trees, building labels, animated flags, a legend.
8. A live pipeline run started during the pitch and shown finished in Q&A.

**Cut line.** If MapAnything lengths are not working by Thursday 2 pm, the demo ships with time-based lengths.

## Cut

- Real OwlLife data and university sign-in (SSO). The app has server-checked demo accounts only. The feasibility slide covers how SSO and OwlLife data would plug in.
- Android, and any native build.
- Outdoor navigation and live GPS position on the map.
- The whole campus, and matching the real campus exactly. One stylized section only.
- Repeating events, un-cancelling, replacing a room's confirmed directions, approving new organizations, and creating events more than seven days ahead. Owners can create, edit and cancel one-off events; anyone signed in can create and own organizations.
- Multi-building routes and room interiors.
- AR, and anything captured in-app. The organizer picks a video from the camera roll.
- Stitching the raw 3D reconstruction. The route is drawn from the step list.

## Risks and day-1 de-risk tasks

| # | Risk | De-risk on Tuesday | Fallback |
|---|---|---|---|
| 1 | three.js in a WebView is slow or will not load inside Expo Go on a real iPhone. | **First task (APP-1):** a corridor scene running on a real iPhone in Expo Go, with messages passing both ways. | Load the viewer from a URL on the laptop. If WebGL itself is the problem, try `expo-gl` with three.js. |
| 2 | The pipeline has only been tried on two house walks, and by its own rules that test was inconclusive. Gemini got two of four indoor turns wrong, sign reading was never tested, and scale varied from 0.87 to 1.74 between MapAnything calls. | Film the real demo building on Tuesday, on routes with right-angle corridors and a switchback stairwell (AI-2). Run Gemini on that video Tuesday evening (AI-3). | A demo route must need at most one correction; otherwise pick a simpler route or use a hand-measured one (ROUTE-5). Floors and the room come from the organizer, not from signs. |
| 3 | A wrong left or right turn still makes a valid-looking route, so ordinary checks cannot see it. | The motion cross-check in AI-7, time-boxed to three hours. | Low-confidence flags only, and the pitch wording changes to match. |
| 4 | The AI-made campus looks rough or runs slowly on the phone. | MAP-1 compares the three campus paths on the demo iPhone and picks one by Tuesday evening. | Extruded OpenStreetMap footprints, styled. |
| 5 | Four people block each other. | Fixtures and types land first (S-1). The server ships in mock mode on Tuesday (AI-1). | Every part runs from fixtures alone. |
| 6 | Wi-Fi or the tunnel fails on stage. Expo Go also needs to reach the laptop to load the app, and the organizer part needs the server. | Test on a phone hotspot on Tuesday. The app shows an "Offline data" badge and lets us change the server address without a rebuild (APP-2). | The student flow runs offline from bundled fixtures. The organizer part falls back to the backup screen recording. |
| 7 | Impact data needs days to collect. | The survey goes out Tuesday morning (PITCH-1). | Fewer responses, reported honestly with the count. |
| 8 | Budget. A route cost about $0.06 for Gemini and $0.31 with MapAnything in the earlier test, so the $14 pipeline cap is at least 45 runs. | The spend log and cap ship with the first live call (AI-3). | Mock mode for all app work; stored timelines for repeat videos. |
| 9 | Privacy: iPhone videos carry GPS, and hallways have people in them. | The ingest step strips metadata and refuses to upload if GPS is still present. Film in empty hallways. Use a paid Gemini tier, since free-tier inputs may be used by the provider; read the paid tier's terms before claiming anything in the pitch. | Face blur, if time allows. |

## Open questions

These need an answer from the organizers. None of them blocks Tuesday's work.

1. **Friday submission time.** When is the submission due, and what is submitted (repo link, video, slides)? The Thursday freeze assumes Friday morning is free for rehearsal.
2. **Track and rubric.** Confirm we are entered in the AI Club track and that the rubric is the five criteria and weights used here (25, 25, 20, 15, 15).
3. **Prior-work rule.** The video-to-route approach was tested before the hackathon started. Confirm that is allowed and whether it must be disclosed. The plan already rebuilds from the findings and reuses no earlier code.

## How the scope maps to the score

| Criterion | Points | What earns it |
|---|---|---|
| Campus impact | 25 | PITCH-1 survey, PITCH-2 OwlLife counts, PITCH-6 hallway test |
| Use of AI | 25 | The pipeline (AI-3 to AI-7) and the organizer flow (APP-5, APP-6a, APP-6b): AI drafts, code verifies, a person confirms |
| Feasibility | 20 | PITCH-3 slide from measured cost and time; routes reused per room; no hardware |
| Creativity | 15 | The AI-modeled campus and flag map (MAP-1, MAP-3, MAP-4) and the 3D route (ROUTE-2, ROUTE-3). Bonus: the swipe deck (APP-8) |
| Pitch | 15 | PITCH-4 deck and script, PITCH-5 backup, PITCH-7 rehearsals |
