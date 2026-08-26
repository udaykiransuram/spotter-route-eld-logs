from __future__ import annotations

from datetime import UTC, datetime
from math import isfinite
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from rest_framework import serializers


class FiniteFloatField(serializers.FloatField):
    default_error_messages = {
        **serializers.FloatField.default_error_messages,
        "not_finite": "Enter a finite number.",
    }

    def to_internal_value(self, data: object) -> float:
        value = super().to_internal_value(data)
        if not isfinite(value):
            self.fail("not_finite")
        return value


class LocationSerializer(serializers.Serializer):
    id = serializers.CharField(required=False, allow_blank=True, max_length=240)
    label = serializers.CharField(max_length=300)
    lat = FiniteFloatField(min_value=-90, max_value=90)
    lon = FiniteFloatField(min_value=-180, max_value=180)
    city = serializers.CharField(required=False, allow_blank=True, max_length=120)
    state = serializers.CharField(required=False, allow_blank=True, max_length=120)
    country = serializers.CharField(required=False, allow_blank=True, max_length=120)


class TripMetadataSerializer(serializers.Serializer):
    driver_name = serializers.CharField(required=False, allow_blank=True, max_length=120)
    carrier_name = serializers.CharField(required=False, allow_blank=True, max_length=160)
    main_office_address = serializers.CharField(required=False, allow_blank=True, max_length=200)
    home_terminal_address = serializers.CharField(required=False, allow_blank=True, max_length=200)
    vehicle_number = serializers.CharField(required=False, allow_blank=True, max_length=80)
    shipping_document_number = serializers.CharField(
        required=False, allow_blank=True, max_length=100
    )


class TripPlanRequestSerializer(serializers.Serializer):
    current_location = LocationSerializer()
    pickup_location = LocationSerializer()
    dropoff_location = LocationSerializer()
    current_cycle_used_hours = FiniteFloatField(min_value=0, max_value=70)
    departure_at = serializers.CharField(required=False, allow_blank=False, max_length=80)
    home_terminal_timezone = serializers.CharField(required=False, allow_blank=False, max_length=80)
    metadata = TripMetadataSerializer(required=False, default=dict)

    def validate(self, attrs: dict[str, object]) -> dict[str, object]:
        timezone_name = attrs.get("home_terminal_timezone")
        zone: ZoneInfo | None = None
        if timezone_name:
            try:
                zone = ZoneInfo(str(timezone_name))
            except (ValueError, ZoneInfoNotFoundError) as exc:
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
                roundtrip = candidate.astimezone(UTC).astimezone(zone).replace(tzinfo=None)
                if roundtrip != departure:
                    raise serializers.ValidationError(
                        {
                            "departure_at": (
                                "This local time does not exist in the selected timezone."
                            )
                        }
                    )
                alternative = departure.replace(tzinfo=zone, fold=1)
                if candidate.utcoffset() != alternative.utcoffset():
                    raise serializers.ValidationError(
                        {
                            "departure_at": (
                                "This local time occurs twice because daylight saving "
                                "time ends. Include an explicit UTC offset, such as "
                                "-04:00 or -05:00."
                            )
                        }
                    )
                departure = candidate
            attrs["departure_at"] = departure

        coordinates = {
            field: (
                round(float(attrs[field]["lat"]), 6),
                round(float(attrs[field]["lon"]), 6),
            )
            for field in ("current_location", "pickup_location", "dropoff_location")
        }
        duplicate_pairs = (
            (
                "pickup_location",
                "current_location",
                "Pickup location must differ from current location.",
            ),
            (
                "dropoff_location",
                "current_location",
                "Drop-off location must differ from current location.",
            ),
            (
                "dropoff_location",
                "pickup_location",
                "Drop-off location must differ from pickup location.",
            ),
        )
        for field, other_field, message in duplicate_pairs:
            if coordinates[field] == coordinates[other_field]:
                raise serializers.ValidationError({field: message})
        return attrs


class LocationQuerySerializer(serializers.Serializer):
    q = serializers.CharField(min_length=2, max_length=200, trim_whitespace=True)
