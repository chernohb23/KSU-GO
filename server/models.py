"""Wire models for the event and route contracts."""

from typing import Annotated, Literal

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field


PipelineMode = Literal["mock", "live"]
EventRange = Literal["today", "week"]
Stage = Literal["ingest", "timeline", "geometry", "assemble", "verify"]


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
    category: Literal["academic", "social", "career", "sports", "arts", "other"]
    tags: list[str]
    location: Location
    routeId: str | None
    capacity: int | None
    registeredCount: int


class Event(EventDetails):
    startsAt: AwareDatetime
    endsAt: AwareDatetime


class EventSeed(EventDetails):
    startsInMin: float
    durationMin: float


class OrganizationLogo(ContractModel):
    initials: str
    color: Literal["gold", "ink"]


class Organization(ContractModel):
    id: str
    name: str
    description: str
    memberCount: int
    logo: OrganizationLogo


class RegistrationRequest(ContractModel):
    deviceId: str


class Registration(ContractModel):
    registered: Literal[True] = True
    registeredCount: int


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
