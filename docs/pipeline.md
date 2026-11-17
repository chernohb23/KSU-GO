# Video-to-route pipeline

Reference for 🤖 AI + server work. Other parts don't need it. The shared rules are in `AGENTS.md`, and the data shapes are in `CONTRACTS.md`.

## How the pipeline works

The organizer supplies three facts with the video: the destination (the room), the start floor and the destination floor. These are trusted over anything read from the video.

1. **Ingest.** Strip metadata with a stream copy and assert there is no GPS. The stripped file, at full quality, is what the next stages use.
2. **Timeline** 💳. Gemini watches the stripped video and returns a structured list of timed events: walking, turns (left, right, U-turn left, U-turn right), turning into a room, stairs with start and end times, doors, signs it can read, and standing pans. The validated timeline is stored by the video's SHA-256.
3. **Motion cross-check.** Plain code measures how far the image slides sideways between frames, which shows which way and how far the camera rotated. It compares that with each turn in the timeline and flags disagreements, and it flags rotation the timeline did not report. It checks and supplements the timeline; it never replaces it.
4. **Geometry (optional refinement)** 💳. MapAnything on Replicate gives metric camera poses for each segment, from a reduced copy made for it (720 px, at most 1.5 Mb/s, tonemapped to SDR). Use the poses for walk lengths and ceiling height only. Without this stage, a walk's length is its walking time multiplied by a walking speed.
5. **Assemble.** Turn the timeline into the `Route` steps defined in `CONTRACTS.md`:
   - The route always begins with an entrance door and ends with a door labelled with the destination, whether or not the timeline reported them.
   - Standing pans are left out, and time spent paused at signs does not count toward walk lengths. No walk is shorter than 0.5 m.
   - Stair heights come from the two floors, not from the video: 3.6 m per floor, shared among the flights, each flight running 1.6 times its rise. The last flight carries the destination floor.
   - Two flights in the same direction close together are a switchback. A single turn between them becomes a U-turn, and a missing turn gets a U-turn inserted. Both are flagged for the organizer.
   - Sign and landmark text is kept as a note only at confidence 0.8 or higher.
6. **Verify.** Plain code checks the draft and attaches `checks` to the route. **A check may be `fail` only if the organizer's editing tools in the app can clear it.** Anything the organizer cannot fix on the confirm screen is a `warn`, so a draft can never get stuck.
7. **Confirm.** The organizer reviews the draft in the app, starting at the first flagged step, fixes it, and confirms. A step the organizer edited is final and is not checked against the video again.

Things that are known not to work, so do not attempt them:

- **Stitching segments into one 3D model.** Each MapAnything call has its own coordinate frame and its own scale (the scale factor has ranged from 0.87 to 1.74 indoors). Joined segments show seams of up to 0.5 m and walls that disagree in direction. The route is drawn from the step list, not from the reconstruction.
- **Finding turns from camera motion or the camera path with no timeline.** Standing pans and small rooms read as false U-turns, and gradual turns are missed. The timeline says what happened. Camera motion is used only as described in step 3: to check the side and size of those turns, and to flag rotation the timeline left out, with pans excluded.
- **Measuring rooms from a standing spin.** Tracking is lost.
- **Relying on signs.** Reading floor and room signs from the video is unproven. Sign text is a helpful note, never the source of the floors or the destination.

Values the code can rely on:

| Quantity | Value |
|---|---|
| Floor-to-floor height | 3.6 m |
| Standard door height | 2.03 m |
| Stair riser | 0.17 to 0.20 m |
| Indoor ceiling | usually 2.5 to 3.0 m |
| Walking speed while filming | roughly 0.7 m/s |

## Spend guard

The server enforces the spending rules. The human rules are in `AGENTS.md` under "Money and API keys".

- Every paid call is appended to `server/data/spend.jsonl` with its cost.
- Before a pipeline run, the server refuses with `budget_exceeded` if the total has reached `BUDGET_CAP_USD`.
- A paid call is retried at most once.
- Paid results are stored by the video's SHA-256, so the same video is never paid for twice.
- Tests never call a paid service. They use recorded or hand-written responses.

## Gemini

Model `gemini-4-hydrogen`, through the Interactions API.

- Call `client.interactions.create(model, input=[video_part, text_part], response_format={"type": "text", "mime_type": "application/json", "schema": ...})`. Structured output works with video.
- Do not add `response_mime_type`; it returns a 400.
- Set `"resolution": "high"` on the video part (the default is low), and set processing to `{"type": "static", "fps": 1}`.
- Upload the file, poll until it is `ACTIVE`, and put the text prompt after the video.
- The MIME type for `.mov` is `video/mov`. HEVC with Dolby Vision is accepted as is.
- Send the full-quality stripped video, not a reduced copy.
- Use a paid-tier key. Inputs sent on the free tier may be used by the provider.
- Give the whole call a 3-minute timeout. Besides the schema, check that events are in order, inside the video's duration, and not overlapping.
- A typical 86-second video costs about $0.06 at 1 frame per second.

## MapAnything on Replicate

Model `vufinder/map-anything`, version `bb68c254a65d3ce6b173909181d2dfbd044300b3ebca25ab63f07aa7eb1eebff`.

- Send the clip as a `data:video/mp4;base64` URI with `predictions.create(..., file_encoding_strategy="base64")`. Uploads through the Files API are rejected with "0 valid videos".
- Keep each clip at or under 15 MB and 30 seconds. Larger payloads are dropped.
- Cut segments with 2 seconds of overlap on each side, sampled at 2.5 frames per second, at most 120 frames per call.
- Set `keys_to_exclude=image,pts3d_cam,ray_directions,depth_along_ray,depth_z,non_ambiguous_mask_logits,alpha_mask`. Without it the output is about 22 MB per frame.
- `camera_poses` are OpenCV camera-to-world matrices. The world frame is the first frame of the clip and is not gravity-aligned. `original_image.frame_index` gives the timestamps.
- Output URLs expire. Download as soon as the prediction finishes.
- Start the timeout when the status becomes `processing`, not at creation. Cold starts are long.
- Cost is about $0.0014 per frame. A typical 86-second video costs about $0.25 and takes about 8 minutes.

## Video handling

- iPhone video is HEVC; with HDR on, it is Dolby Vision on an HLG base. Only the copy made for MapAnything needs tonemapping. Use ffmpeg `zscale` (`npl=203`, `tonemap=mobius`).
- iPhone `.mov` files store location as ISO 6709 in the container. Remove it with a stream copy and `-map_metadata -1`, plus the same for each stream. Rotation survives the copy.
- Assert that no location remains before any part of a video goes to an outside service. If the assertion fails, abort.
- Use the ffmpeg binary from the `imageio-ffmpeg` package; it includes `zscale`. There may be no `ffprobe`, so parse the output of `ffmpeg -i`.
- If OpenCV is needed, pin it below version 5.

## Filming rules shown to organizers

The app shows these on the new-route form.

- Set the camera to 1080p at 30 fps with HDR video off.
- Film one continuous take, under 3 minutes, from outside the entrance to the room door.
- End with the room number filling about a third of the frame, held for two seconds.
- Hold the phone upright at chest height and walk steadily.
- Walk through turns. Do not stand and pan or spin.
- Climb stairs without stopping, with the steps in view.
- Pause for a second on every floor sign and room sign.
- Film when the hallway is empty, or ask the people in it first.
