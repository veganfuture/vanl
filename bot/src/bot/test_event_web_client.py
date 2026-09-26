from __future__ import annotations

import json
import unittest

import httpx

from bot.event_web_client import (
    EventJson,
    EventRequest,
    EventWebClient,
    EventWebClientError,
)

_SAMPLE_EVENT_JSON = {
    "id": "11111111-1111-1111-1111-111111111111",
    "slug": "cube-of-truth-amsterdam",
    "titleNl": None,
    "titleEn": "Cube of Truth",
    "descriptionNl": None,
    "descriptionEn": "Join us",
    "startAt": "2026-10-01T13:00:00.000Z",
    "startTimeKnown": True,
    "endAt": None,
    "endTimeKnown": True,
    "locationKind": "meeting_point_city_only",
    "placeId": "22222222-2222-2222-2222-222222222222",
    "locationDescription": "Dam square",
    "mapUrl": None,
    "externalEventUrl": None,
    "registrationUrl": None,
    "flyerFullImageId": None,
    "status": "draft",
    "statusReason": None,
    "source": "manual",
    # Extra field a real response includes that this hand-written client
    # doesn't model - must not break parsing (extra="ignore").
    "canEdit": True,
}


def _sample_request() -> EventRequest:
    return EventRequest(
        titleNl=None,
        titleEn="Cube of Truth",
        descriptionNl=None,
        descriptionEn="Join us",
        startAt="2026-10-01T13:00:00.000Z",
        startTimeKnown=True,
        endAt=None,
        endTimeKnown=True,
        locationKind="meeting_point_city_only",
        placeId="22222222-2222-2222-2222-222222222222",
        locationDescription="Dam square",
    )


class EventRequestSerializationTests(unittest.TestCase):
    def test_status_is_omitted_from_the_wire_body_when_unset(self) -> None:
        body = _sample_request().to_request_body()
        self.assertNotIn("status", body)
        # Every other field is .nullable() in EventRequestSchema (a required
        # key, nullable value) rather than .optional() - so unlike status,
        # they must stay present even when None.
        self.assertIn("titleNl", body)
        self.assertIsNone(body["titleNl"])

    def test_status_is_included_when_set(self) -> None:
        request = _sample_request().model_copy(update={"status": "draft"})
        body = request.to_request_body()
        self.assertEqual(body["status"], "draft")


class EventWebClientTests(unittest.IsolatedAsyncioTestCase):
    async def test_create_event_sends_a_bearer_token_and_parses_the_response(
        self,
    ) -> None:
        captured: dict[str, httpx.Request] = {}

        def handler(request: httpx.Request) -> httpx.Response:
            captured["request"] = request
            return httpx.Response(201, json=_SAMPLE_EVENT_JSON)

        client = EventWebClient(
            base_url="https://veganactivists.nl",
            api_token="test-token",
            transport=httpx.MockTransport(handler),
        )
        try:
            event = await client.create_event(_sample_request())
        finally:
            await client.close()

        self.assertEqual(event.id, "11111111-1111-1111-1111-111111111111")
        self.assertEqual(event.status, "draft")
        request = captured["request"]
        self.assertEqual(request.method, "POST")
        self.assertEqual(request.url.path, "/api/events")
        self.assertEqual(request.headers["authorization"], "Bearer test-token")
        sent_body = json.loads(request.content)
        self.assertNotIn("status", sent_body)

    async def test_create_event_raises_on_an_unexpected_status(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(403, json={"error": "forbidden"})

        client = EventWebClient(
            base_url="https://veganactivists.nl",
            api_token="test-token",
            transport=httpx.MockTransport(handler),
        )
        try:
            with self.assertRaises(EventWebClientError) as ctx:
                await client.create_event(_sample_request())
            self.assertEqual(ctx.exception.status_code, 403)
        finally:
            await client.close()

    async def test_list_my_events_parses_every_event_in_the_response(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            self.assertEqual(request.url.path, "/api/events/mine")
            return httpx.Response(200, json={"events": [_SAMPLE_EVENT_JSON]})

        client = EventWebClient(
            base_url="https://veganactivists.nl",
            api_token="test-token",
            transport=httpx.MockTransport(handler),
        )
        try:
            events: list[EventJson] = await client.list_my_events()
        finally:
            await client.close()

        self.assertEqual(len(events), 1)
        self.assertEqual(events[0].slug, "cube-of-truth-amsterdam")

    async def test_list_visible_events_hits_the_public_listing_not_mine(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            self.assertEqual(request.url.path, "/api/events")
            return httpx.Response(200, json={"events": [_SAMPLE_EVENT_JSON]})

        client = EventWebClient(
            base_url="https://veganactivists.nl",
            api_token="test-token",
            transport=httpx.MockTransport(handler),
        )
        try:
            events = await client.list_visible_events()
        finally:
            await client.close()

        self.assertEqual(len(events), 1)

    async def test_search_places_sends_the_query_param(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            self.assertEqual(request.url.params["q"], "Amsterdam")
            return httpx.Response(
                200,
                json={
                    "places": [
                        {
                            "id": "22222222-2222-2222-2222-222222222222",
                            "name": "Amsterdam",
                            "municipalityName": "Amsterdam",
                            "province": "Noord-Holland",
                        }
                    ]
                },
            )

        client = EventWebClient(
            base_url="https://veganactivists.nl",
            api_token="test-token",
            transport=httpx.MockTransport(handler),
        )
        try:
            places = await client.search_places("Amsterdam")
        finally:
            await client.close()

        self.assertEqual(places[0].municipality_name, "Amsterdam")

    async def test_upload_flyer_sends_raw_bytes_with_content_type(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            self.assertEqual(
                request.url.path,
                "/api/events/11111111-1111-1111-1111-111111111111/flyer",
            )
            self.assertEqual(request.headers["content-type"], "image/jpeg")
            self.assertEqual(request.content, b"fake-jpeg-bytes")
            return httpx.Response(200, json=_SAMPLE_EVENT_JSON)

        client = EventWebClient(
            base_url="https://veganactivists.nl",
            api_token="test-token",
            transport=httpx.MockTransport(handler),
        )
        try:
            await client.upload_flyer(
                "11111111-1111-1111-1111-111111111111",
                content_type="image/jpeg",
                data=b"fake-jpeg-bytes",
            )
        finally:
            await client.close()
