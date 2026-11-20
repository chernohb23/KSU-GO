"""Wire models for the event and route contracts."""

from typing import Annotated, Literal

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field


PipelineMode = Literal["mock", "live"]
EventRange = Literal["today", "week"]
Stage = Literal["ingest", "timeline", "geometry", "assemble", "verify"]
Category = Literal["academic", "social", "career", "sports", "arts", "other"]
EventStatus = Literal["active", "cancelled"]
AvatarColor = Literal["gold", "ink", "amber"]
LogoColor = Literal["gold", "ink"]


class ContractModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, allow_inf_nan=False)


class Health(ContractModel):
    ok: Literal[True] = True
    pipelineMode: PipelineMode


class Location(ContractModel):
    buildingId: str
    room: str


class EventDetails(ContractModel):
    id: str
    title: str
    description: str
    organizationId: str
    organizer: str
    partnerOrganizationId: str | None
    category: Category
    tags: list[str]
    location: Location
    routeId: str | None
    capacity: int | None
    registeredCount: int
    status: EventStatus


class Event(EventDetails):
    startsAt: AwareDatetime
    endsAt: AwareDatetime


class EventSeed(EventDetails):
    startsInMin: float
    durationMin: float


class Building(ContractModel):
    id: str
    name: str
    footprint: list[tuple[float, float]]
    heightM: float
    entrance: tuple[float, float]


class Campus(ContractModel):
    attribution: str | None
    buildings: list[Building]
    paths: list[list[tuple[float, float]]]


class OrganizationLogo(ContractModel):
    initials: str
    color: LogoColor


class OrganizationSeed(ContractModel):
    """An organization as stored: the seed file and state.json. Followers are counted on read."""
    id: str
    name: str
    description: str
    memberCount: int
    logo: OrganizationLogo
    meets: str | None
    contactEmail: str | None
    website: str | None
    ownerId: str | None


class Organization(OrganizationSeed):
    followerCount: int


class OrganizationRequest(ContractModel):
    """Shape only; org_rules.py applies the contract's value rules."""
    name: str
    description: str
    logo: OrganizationLogo
    memberCount: int
    meets: str | None
    contactEmail: str | None
    website: str | None


class FollowResponse(ContractModel):
    following: bool
    followerCount: int


class Registration(ContractModel):
    registered: Literal[True] = True
    registeredCount: int


class EditEventRequest(ContractModel):
    """Body of PUT /api/events/{id}: CreateEventRequest without organizationId."""
    title: str
    description: str
    partnerOrganizationId: str | None
    category: Category
    tags: list[str]
    startsAt: str
    durationMin: int
    location: Location
    capacity: int | None


class CreateEventRequest(ContractModel):
    """Shape only; event_rules.py applies the contract's value rules."""
    title: str
    description: str
    organizationId: str
    partnerOrganizationId: str | None
    category: Category
    tags: list[str]
    # A string: FastAPI validates bodies in Python mode, where strict datetimes refuse strings.
    startsAt: str
    durationMin: int
    location: Location
    capacity: int | None


class Profile(ContractModel):
    major: str | None = None
    classYear: int | None = None
    bio: str | None = None
    avatarColor: AvatarColor = "gold"


class User(ContractModel):
    id: str
    name: str
    email: str
    profile: Profile
    ownedOrganizationIds: list[str]
    followingOrganizationIds: list[str]


class ProfileRequest(ContractModel):
    """Shape only; profile_rules.py applies the contract's value rules."""
    name: str
    major: str | None
    classYear: int | None
    bio: str | None
    avatarColor: AvatarColor


class MyRegistration(ContractModel):
    event: "Event"
    registeredAt: AwareDatetime


class RegisteredPerson(ContractModel):
    userId: str
    name: str
    registeredAt: AwareDatetime


class EventRegistrations(ContractModel):
    registeredCount: int
    people: list[RegisteredPerson]


class AuthResponse(ContractModel):
    token: str
    user: User


class SignupRequest(ContractModel):
    name: str
    email: str
    password: str


class LoginRequest(ContractModel):
    email: str
    password: str


class StepBase(ContractModel):
    id: str
    source: Literal["ai", "organizer"]
    confidence: Annotated[float, Field(ge=0, le=1)] | None
    tSec: float | None
    note: str | None


class Walk(StepBase):
    type: Literal["walk"]
    lengthM: float


class Turn(StepBase):
    type: Literal["turn"]
    direction: Literal["left", "right", "u_left", "u_right"]


class Stairs(StepBase):
    type: Literal["stairs"]
    direction: Literal["up", "down"]
    riseM: float
    runM: float
    toFloor: str | None


class Elevator(StepBase):
    type: Literal["elevator"]
    toFloor: str


class Door(StepBase):
    type: Literal["door"]
    label: str | None


Step = Annotated[Walk | Turn | Stairs | Elevator | Door, Field(discriminator="type")]


class StepsRequest(ContractModel):
    steps: list[Step]


class Check(ContractModel):
    id: str
    level: Literal["pass", "warn", "fail"]
    message: str
    stepId: str | None


class Progress(ContractModel):
    stage: Stage
    pct: float


class Stats(ContractModel):
    videoSec: float
    processingSec: float
    costUsd: float


class Route(ContractModel):
    id: str
    version: Literal[1] = 1
    status: Literal["processing", "draft", "confirmed", "failed"]
    progress: Progress | None
    error: str | None
    buildingId: str
    destination: str
    startFloor: str
    destinationFloor: str
    corridorWidthM: float = 2.0
    ceilingHeightM: float = 2.7
    steps: list[Step]
    checks: list[Check]
    stats: Stats | None
    createdAt: AwareDatetime
    confirmedAt: AwareDatetime | None


class EventDirections(ContractModel):
    state: Literal["confirmed", "processing", "draft", "failed", "none"]
    route: Route | None
