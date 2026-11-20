// TypeScript version of CONTRACTS.md sections 2 to 5 (section 5: request and response bodies).
// If this file and CONTRACTS.md disagree, CONTRACTS.md wins.

// ---- Section 2: Events ----

/** All times are ISO 8601 with offset. All ids are strings. */
export type Event = {
  id: string;
  title: string;
  description: string;
  /** Hosting organization, from organizations.json. */
  organizationId: string;
  /** Display name; equals the hosting organization's name. */
  organizer: string;
  /** Optional co-host from organizations.json; never the host. */
  partnerOrganizationId: string | null;
  category: "academic" | "social" | "career" | "sports" | "arts" | "other";
  /** Lowercase, unique, at most 8, each 1 to 24 characters. */
  tags: string[];
  startsAt: string;
  endsAt: string;
  /** `buildingId` comes from campus.json. */
  location: { buildingId: string; room: string };
  /** Confirmed route to the room; several events may share one. */
  routeId: string | null;
  /** Display only: shown as "registeredCount / capacity", "Full" when reached. Never blocks registering. */
  capacity: number | null;
  registeredCount: number;
};

/**
 * Seed form used in `events.seed.json`: an Event with `startsInMin` and
 * `durationMin` in place of `startsAt` and `endsAt`.
 */
export type EventSeed = Omit<Event, "startsAt" | "endsAt"> & {
  /** Minutes from now; negative means already started. */
  startsInMin: number;
  durationMin: number;
};

/** A demo organization from `organizations.json`. Static: there is no organizations endpoint. */
export type Organization = {
  /** e.g. "org-robotics-club" */
  id: string;
  name: string;
  /** One or two sentences. */
  description: string;
  /** Display only. */
  memberCount: number;
  /** Original initials badge, never a real logo. */
  logo: {
    /** 1 to 4 capital letters, e.g. "RC". */
    initials: string;
    /** Badge background: "gold" is ink initials on gold, "ink" is paper initials on ink. */
    color: "gold" | "ink";
  };
};

// ---- Section 3: Campus ----

/** Local meters: `x` is east, `z` is south (north is `-z`), `y` is up. Origin is the section's center. */
export type Campus = {
  /** Credit the map screen must show, e.g. "© OpenStreetMap contributors" if OSM data is used. */
  attribution: string | null;
  buildings: {
    /** e.g. "b-engineering" */
    id: string;
    name: string;
    /** [x, z] ring, not closed; approximate outline of the building. */
    footprint: [number, number][];
    heightM: number;
    /** [x, z] */
    entrance: [number, number];
  }[];
  /** Walkway polylines, [x, z]. */
  paths: [number, number][][];
};

// ---- Section 4: Route ----

export type Route = {
  id: string;
  version: 1;
  status: "processing" | "draft" | "confirmed" | "failed";
  progress: { stage: "ingest" | "timeline" | "geometry" | "assemble" | "verify"; pct: number } | null;
  /** Set when status is "failed". */
  error: string | null;
  buildingId: string;
  /** e.g. "Room 204" */
  destination: string;
  /** e.g. "1"; entered by the organizer. */
  startFloor: string;
  /** e.g. "2"; entered by the organizer. */
  destinationFloor: string;
  /** Default 2.0. */
  corridorWidthM: number;
  /** Default 2.7. */
  ceilingHeightM: number;
  /** Empty while processing. Always begins and ends with a `door`; the last door's label is the `destination`. */
  steps: Step[];
  /** Verifier results. */
  checks: Check[];
  stats: { videoSec: number; processingSec: number; costUsd: number } | null;
  createdAt: string;
  confirmedAt: string | null;
};

export type StepBase = {
  /** Unique within the route. */
  id: string;
  source: "ai" | "organizer";
  /** 0 to 1, from the AI. */
  confidence: number | null;
  /** Time in the source video. */
  tSec: number | null;
  /** Landmark or sign text, e.g. "past the vending machines". */
  note: string | null;
};

export type Step = StepBase &
  (
    | { type: "walk"; lengthM: number }
    | { type: "turn"; direction: "left" | "right" | "u_left" | "u_right" }
    | { type: "stairs"; direction: "up" | "down"; riseM: number; runM: number; toFloor: string | null }
    | { type: "elevator"; toFloor: string }
    | { type: "door"; label: string | null }
  );

export type Check = {
  /** e.g. "leg_length_range" */
  id: string;
  level: "pass" | "warn" | "fail";
  /** Shown to the organizer. */
  message: string;
  stepId: string | null;
};

// ---- Section 5: API bodies ----

/** Body of `POST /api/events`. Every key is required; `null` and `[]` mean none. */
export type CreateEventRequest = {
  /** 1 to 120 characters after trimming. */
  title: string;
  /** 1 to 2000 characters after trimming. */
  description: string;
  /** The signed-in organizer's organizationId; anything else is 403 forbidden. */
  organizationId: string;
  /** Null, or a different organization from organizations.json. */
  partnerOrganizationId: string | null;
  /** Required; no default. */
  category: Event["category"];
  /** May be empty. Trimmed, lowercased and deduplicated; then at most 8, each 1 to 24 characters. */
  tags: string[];
  /** ISO 8601 with an explicit offset; now < startsAt < now + 7 days. */
  startsAt: string;
  /** Whole minutes, 1 to 1440. */
  durationMin: number;
  /** `buildingId` from campus.json; `room` 1 to 40 characters after trimming. */
  location: { buildingId: string; room: string };
  /** Null, or a whole number of at least 1. */
  capacity: number | null;
};

/** A demo account checked by the server. Not university sign-in. */
export type User = {
  id: string;
  name: string;
  /** Stored trimmed and lowercased. */
  email: string;
  role: "student" | "organizer";
  /** Set exactly when role is "organizer". */
  organizationId: string | null;
};

/** Body of `POST /api/auth/signup`. Always creates a student. */
export type SignupRequest = {
  /** 1 to 80 characters after trimming. */
  name: string;
  /** Trimmed and lowercased; at most 254 characters, one "@" with text on both sides, not already in use. */
  email: string;
  /** 8 to 128 characters. */
  password: string;
};

/** Body of `POST /api/auth/login`. */
export type LoginRequest = {
  email: string;
  password: string;
};

/** Response of `POST /api/auth/signup` and `POST /api/auth/login`. Send the token as `Authorization: Bearer <token>`. */
export type AuthResponse = {
  token: string;
  user: User;
};
