from __future__ import annotations

from typing import Any, Literal

import httpx
from pydantic import BaseModel, ConfigDict, Field

"""
Typed async client for the subset of the website's public API the bot calls
as the signal-bot account (see web/src/domain/auth/auth_service.ts's
getBotUser) - exactly the endpoints registered in web/scripts/generate-openapi.ts,
also the source of web/openapi.json.

Hand-written today, not literally generated - wiring `openapi-python-client
generate --url ../web/openapi.json` into the dev shell to replace this file
is a documented fast-follow (see bot/README.md), not required for this to
be correct now. The types below mirror web/src/routes/api/events/event.schema.ts's
EventRequestSchema/EventJsonSchema and web/src/routes/api/places/search.schema.ts
field-for-field - keep them in sync by hand until that codegen step exists.
"""


class EventRequest(BaseModel):
    """Mirrors EventRequestSchema (event.schema.ts) - the body POST /api/events and PATCH /api/events/{id} share."""

    model_config = ConfigDict(populate_by_name=True)

    title_nl: str | None = Field(alias="titleNl")
    title_en: str | None = Field(alias="titleEn")
    description_nl: str | None = Field(alias="descriptionNl")
    description_en: str | None = Field(alias="descriptionEn")
    start_at: str = Field(alias="startAt")
    """ISO 8601 datetime string, e.g. from datetime.isoformat() on a tz-aware datetime."""
    start_time_known: bool = Field(alias="startTimeKnown")
    end_at: str | None = Field(alias="endAt")
    end_time_known: bool = Field(alias="endTimeKnown")
    location_kind: Literal["precise_address", "meeting_point_city_only"] = Field(
        alias="locationKind"
    )
    place_id: str | None = Field(alias="placeId")
    location_description: str = Field(alias="locationDescription")
    pdok_address_id: str | None = Field(default=None, alias="pdokAddressId")
    map_url: str | None = Field(default=None, alias="mapUrl")
    external_event_url: str | None = Field(default=None, alias="externalEventUrl")
    registration_url: str | None = Field(default=None, alias="registrationUrl")
    org_id: str | None = Field(default=None, alias="orgId")
    status: Literal["draft", "visible"] | None = None
    """Omitted from the wire request when None (see to_request_body) - EventRequestSchema's
    status is z.enum([...]).optional(), which rejects an explicit null, unlike every other
    field here (all .nullable(), where an explicit null is required, not an absent key)."""

    def to_request_body(self) -> dict[str, Any]:
        body = self.model_dump(by_alias=True)
        if body.get("status") is None:
            body.pop("status", None)
        return body


class EventJson(BaseModel):
    """Mirrors EventJsonSchema (event.schema.ts) - only the fields the bot's tools actually use (matching, display, ids). extra="ignore" so new server-side fields don't break parsing."""

    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    id: str
    slug: str
    title_nl: str | None = Field(alias="titleNl")
    title_en: str | None = Field(alias="titleEn")
    description_nl: str | None = Field(alias="descriptionNl")
    description_en: str | None = Field(alias="descriptionEn")
    start_at: str = Field(alias="startAt")
    start_time_known: bool = Field(alias="startTimeKnown")
    end_at: str | None = Field(alias="endAt")
    end_time_known: bool = Field(alias="endTimeKnown")
    location_kind: str = Field(alias="locationKind")
    place_id: str = Field(alias="placeId")
    location_description: str = Field(alias="locationDescription")
    map_url: str | None = Field(alias="mapUrl")
    external_event_url: str | None = Field(alias="externalEventUrl")
    registration_url: str | None = Field(alias="registrationUrl")
    flyer_full_image_id: str | None = Field(alias="flyerFullImageId")
    status: Literal["draft", "hidden", "visible", "cancelled"]
    status_reason: str | None = Field(alias="statusReason")
    source: Literal["manual", "signal_import", "external_import"]


class PlaceJson(BaseModel):
    """Mirrors SearchPlacesResponseSchema's place entries (places/search.schema.ts)."""

    model_config = ConfigDict(populate_by_name=True)

    id: str
    name: str
    municipality_name: str = Field(alias="municipalityName")
    province: str


class EventWebClientError(RuntimeError):
    def __init__(self, message: str, *, status_code: int | None = None) -> None:
        super().__init__(message)
        self.status_code = status_code


class EventWebClient:
    """
    Calls the website's public API as the signal-bot account. Every event
    the bot creates/updates goes through EventService's normal validation
    and authorization exactly as a human publisher's browser would trigger
    it - this client never bypasses that (see the Signal ingestion plan's
    "two separate channels" note: the bot never writes to events/users
    directly, only through this API; its direct Postgres access, via
    ArchiveDb, is scoped to its own archive tables only).
    """

    def __init__(
        self,
        *,
        base_url: str,
        api_token: str,
        timeout_seconds: float = 30.0,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self._client = httpx.AsyncClient(
            base_url=base_url,
            headers={"authorization": f"Bearer {api_token}"},
            timeout=timeout_seconds,
            transport=transport,
        )

    async def close(self) -> None:
        await self._client.aclose()

    async def create_event(self, request: EventRequest) -> EventJson:
        response = await self._client.post(
            "/api/events", json=request.to_request_body()
        )
        return self._parse_event_response(response, expected_status=201)

    async def update_event(self, event_id: str, request: EventRequest) -> EventJson:
        response = await self._client.patch(
            f"/api/events/{event_id}", json=request.to_request_body()
        )
        return self._parse_event_response(response, expected_status=200)

    async def upload_flyer(
        self, event_id: str, *, content_type: str, data: bytes
    ) -> EventJson:
        response = await self._client.post(
            f"/api/events/{event_id}/flyer",
            content=data,
            headers={"content-type": content_type},
        )
        return self._parse_event_response(response, expected_status=200)

    async def list_my_events(self) -> list[EventJson]:
        response = await self._client.get("/api/events/mine")
        if response.status_code != 200:
            raise EventWebClientError(
                f"GET /api/events/mine failed: {response.status_code} {response.text}",
                status_code=response.status_code,
            )
        body = response.json()
        return [EventJson.model_validate(item) for item in body["events"]]

    async def list_visible_events(self) -> list[EventJson]:
        """
        Every currently-visible event, regardless of publisher - not just
        the bot's own (list_my_events). Matching against the bot's own
        history alone isn't enough to avoid duplicates: a human may already
        have manually published the same event, or it may already exist via
        the ARC feed import.
        """
        response = await self._client.get("/api/events")
        if response.status_code != 200:
            raise EventWebClientError(
                f"GET /api/events failed: {response.status_code} {response.text}",
                status_code=response.status_code,
            )
        body = response.json()
        return [EventJson.model_validate(item) for item in body["events"]]

    async def search_places(self, query: str) -> list[PlaceJson]:
        response = await self._client.get("/api/places/search", params={"q": query})
        if response.status_code != 200:
            raise EventWebClientError(
                f"GET /api/places/search failed: {response.status_code} {response.text}",
                status_code=response.status_code,
            )
        body = response.json()
        return [PlaceJson.model_validate(item) for item in body["places"]]

    def _parse_event_response(
        self, response: httpx.Response, *, expected_status: int
    ) -> EventJson:
        if response.status_code != expected_status:
            raise EventWebClientError(
                f"{response.request.method} {response.request.url} failed: "
                f"{response.status_code} {response.text}",
                status_code=response.status_code,
            )
        return EventJson.model_validate(response.json())
