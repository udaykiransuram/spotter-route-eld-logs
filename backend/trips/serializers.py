from __future__ import annotations

from datetime import UTC, datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from rest_framework import serializers


class LocationSerializer(serializers.Serializer):
    id = serializers.CharField(required=False, allow_blank=True, max_length=240)
    label = serializers.CharField(max_length=300)
    lat = serializers.FloatField(min_value=-90, max_value=90)
    lon = serializers.FloatField(min_value=-180, max_value=180)
    city = serializers.CharField(required=False, allow_blank=True, max_length=120)
    state = serializers.CharField(required=False, allow_blank=True, max_length=120)
    country = serializers.CharField(required=False, allow_blank=True, max_length=120)


class TripMetadataSerializer(serializers.Serializer):
    driver_name = serializers.CharField(required=False, allow_blank=True, max_length=120)
    carrier_name = serializers.CharField(required=False, allow_blank=True, max_length=160)
    vehicle_number = serializers.CharField(required=False, allow_blank=True, max_length=80)
    shipping_document_number = serializers.CharField(
        required=False, allow_blank=True, max_length=100
    )


class TripPlanRequestSerializer(serializers.Serializer):
    current_location = LocationSerializer()
    pickup_location = LocationSerializer()
    dropoff_location = LocationSerializer()
    current_cycle_used_hours = serializers.FloatField(min_value=0, max_value=70)
    departure_at = serializers.CharField(required=False, allow_blank=False, max_length=80)
    home_terminal_timezone = serializers.CharField(
        required=False, allow_blank=False, max_length=80
    )
    metadata = TripMetadataSerializer(required=False, default=dict)

    def validate(self, attrs: dict[str, object]) -> dict[str, object]:
        timezone_name = attrs.get("home_terminal_timezone")
        zone: ZoneInfo | None = None
        if timezone_name:
            try:
                zone = ZoneInfo(str(timezone_name))
            except ZoneInfoNotFoundError as exc:
                raise serializers.ValidationError(
                    {"home_terminal_timezone": "Enter a valid IANA timezone."}
                ) from exc

        departure_value = attrs.get("departure_at")
        if departure_value:
            try:
                normalized = str(departure_value).replace("Z", "+00:00")
                departure = datetime.fromisoformat(normalized)
            except ValueError as exc:
                raise serializers.ValidationError(
                    {"departure_at": "Enter a valid ISO-8601 date and time."}
                ) from exc
            if departure.tzinfo is None and zone is not None:
                candidate = departure.replace(tzinfo=zone)
                # ZoneInfo accepts nonexistent spring-forward wall times. A UTC
                # roundtrip detects those values and returns a useful field error.
                roundtrip = (
                    candidate.astimezone(UTC).astimezone(zone).replace(tzinfo=None)
                )
                if roundtrip != departure:
                    raise serializers.ValidationError(
                        {
                            "departure_at": (
                                "This local time does not exist in the selected timezone."
                            )
                        }
                    )
                departure = candidate
            attrs["departure_at"] = departure

        locations = [
            attrs["current_location"],
            attrs["pickup_location"],
            attrs["dropoff_location"],
        ]
        coordinates = [
            (round(float(location["lat"]), 6), round(float(location["lon"]), 6))
            for location in locations
        ]
        if len(set(coordinates)) != len(coordinates):
            raise serializers.ValidationError(
                {"dropoff_location": "Current, pickup, and drop-off locations must differ."}
            )
        return attrs


class LocationQuerySerializer(serializers.Serializer):
    q = serializers.CharField(min_length=2, max_length=200, trim_whitespace=True)
