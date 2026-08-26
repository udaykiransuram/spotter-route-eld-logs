import type { TripPlan } from "../types";

export const tripPlanFixture: TripPlan = {
  "id": "plan-1",
  "created_at": "2026-08-25T10:00:00Z",
  "route": {
    "type": "Feature",
    "geometry": {
      "type": "LineString",
      "coordinates": [
        [
          -77.436,
          37.5407
        ],
        [
          -86.7816,
          36.1627
        ],
        [
          -96.797,
          32.7767
        ]
      ]
    },
    "properties": {
      "distance_miles": 1312.57,
      "duration_hours": 22.63
    }
  },
  "instructions": [
    {
      "id": "instruction-1",
      "leg_index": 0,
      "sequence": 1,
      "instruction": "Drive from Richmond, VA, USA to Nashville, TN, USA",
      "distance_miles": 603.94,
      "duration_minutes": 624.8,
      "start_mile": 0,
      "end_mile": 603.94
    },
    {
      "id": "instruction-2",
      "leg_index": 1,
      "sequence": 2,
      "instruction": "Drive from Nashville, TN, USA to Dallas, TX, USA",
      "distance_miles": 708.64,
      "duration_minutes": 733.1,
      "start_mile": 603.94,
      "end_mile": 1312.57
    }
  ],
  "summary": {
    "distance_miles": 1312.57,
    "driving_hours": 22.63,
    "total_elapsed_hours": 47.13,
    "trip_days": 3,
    "stop_count": 6,
    "departure_at": "2026-08-25T10:00:00Z",
    "arrival_at": "2026-08-27T09:07:50.015891Z",
    "home_terminal_timezone": "America/New_York"
  },
  "stops": [
    {
      "id": "event-3",
      "sequence": 1,
      "type": "meal_break",
      "label": "Nashville, TN",
      "lat": 36.47988408456299,
      "lon": -84.63045661778528,
      "scheduled_at": "2026-08-25T18:30:00Z",
      "end_at": "2026-08-25T19:00:00Z",
      "duration_minutes": 30,
      "duty_status": "off_duty",
      "reason": "30-minute Meal/rest break after eight cumulative driving hours.",
      "route_mile": 464
    },
    {
      "id": "event-5",
      "sequence": 2,
      "type": "pickup",
      "label": "Nashville, TN, USA",
      "lat": 36.1627,
      "lon": -86.7816,
      "scheduled_at": "2026-08-25T21:24:45.675592Z",
      "end_at": "2026-08-25T22:24:45.675592Z",
      "duration_minutes": 60,
      "duty_status": "on_duty",
      "reason": "One hour on duty for pickup.",
      "route_mile": 603.94
    },
    {
      "id": "event-8",
      "sequence": 3,
      "type": "rest",
      "label": "Nashville, TN",
      "lat": 35.99727277221199,
      "lon": -87.27091478357589,
      "scheduled_at": "2026-08-25T23:00:00Z",
      "end_at": "2026-08-26T09:00:00Z",
      "duration_minutes": 600,
      "duty_status": "sleeper_berth",
      "reason": "10 consecutive hours of qualifying rest: a one-hour Off Duty meal/dinner break followed by nine hours in the Sleeper Berth.",
      "route_mile": 638
    },
    {
      "id": "event-11",
      "sequence": 4,
      "type": "fuel",
      "label": "Memphis, TN",
      "lat": 34.49447341921407,
      "lon": -91.71602306473817,
      "scheduled_at": "2026-08-26T14:52:45.517241Z",
      "end_at": "2026-08-26T15:22:45.517241Z",
      "duration_minutes": 30,
      "duty_status": "on_duty",
      "reason": "Fuel stop scheduled before 1,000 miles since the previous fueling point. Nearby fuel suggestion: Planned fuel stop (0.0 mi from the scheduled route point; not added to route).",
      "route_mile": 950
    },
    {
      "id": "event-14",
      "sequence": 5,
      "type": "rest",
      "label": "Dallas, TX",
      "lat": 32.94874238081432,
      "lon": -96.28811835179923,
      "scheduled_at": "2026-08-26T21:00:00Z",
      "end_at": "2026-08-27T07:00:00Z",
      "duration_minutes": 600,
      "duty_status": "sleeper_berth",
      "reason": "10 consecutive hours of qualifying rest: a one-hour Off Duty meal/dinner break followed by nine hours in the Sleeper Berth.",
      "route_mile": 1276
    },
    {
      "id": "event-17",
      "sequence": 6,
      "type": "dropoff",
      "label": "Dallas, TX, USA",
      "lat": 32.7767,
      "lon": -96.797,
      "scheduled_at": "2026-08-27T08:07:50.015891Z",
      "end_at": "2026-08-27T09:07:50.015891Z",
      "duration_minutes": 60,
      "duty_status": "on_duty",
      "reason": "One hour on duty for drop-off.",
      "route_mile": 1312.57
    }
  ],
  "duty_events": [
    {
      "id": "event-1",
      "status": "on_duty",
      "event_type": "pretrip_inspection",
      "start_at": "2026-08-25T10:00:00Z",
      "end_at": "2026-08-25T10:30:00Z",
      "duration_hours": 0.5,
      "start_location": "Richmond, VA, USA",
      "end_location": "Richmond, VA, USA",
      "start_coordinates": [
        -77.436,
        37.5407
      ],
      "end_coordinates": [
        -77.436,
        37.5407
      ],
      "start_mile": 0,
      "end_mile": 0,
      "miles_driven": 0,
      "note": "30-minute pre-trip inspection before the driving shift (planning assumption)."
    },
    {
      "id": "event-2",
      "status": "driving",
      "event_type": "driving",
      "start_at": "2026-08-25T10:30:00Z",
      "end_at": "2026-08-25T18:30:00Z",
      "duration_hours": 8,
      "start_location": "Richmond, VA, USA",
      "end_location": "Nashville, TN",
      "start_coordinates": [
        -77.436,
        37.5407
      ],
      "end_coordinates": [
        -84.63045661778528,
        36.47988408456299
      ],
      "start_mile": 0,
      "end_mile": 464,
      "miles_driven": 464,
      "note": "Drive toward Nashville, TN, USA."
    },
    {
      "id": "event-3",
      "status": "off_duty",
      "event_type": "meal_break",
      "start_at": "2026-08-25T18:30:00Z",
      "end_at": "2026-08-25T19:00:00Z",
      "duration_hours": 0.5,
      "start_location": "Nashville, TN",
      "end_location": "Nashville, TN",
      "start_coordinates": [
        -84.63045661778528,
        36.47988408456299
      ],
      "end_coordinates": [
        -84.63045661778528,
        36.47988408456299
      ],
      "start_mile": 464,
      "end_mile": 464,
      "miles_driven": 0,
      "note": "30-minute Meal/rest break after eight cumulative driving hours."
    },
    {
      "id": "event-4",
      "status": "driving",
      "event_type": "driving",
      "start_at": "2026-08-25T19:00:00Z",
      "end_at": "2026-08-25T21:24:45.675592Z",
      "duration_hours": 2.413,
      "start_location": "Nashville, TN",
      "end_location": "Nashville, TN, USA",
      "start_coordinates": [
        -84.63045661778528,
        36.47988408456299
      ],
      "end_coordinates": [
        -86.7816,
        36.1627
      ],
      "start_mile": 464,
      "end_mile": 603.94,
      "miles_driven": 139.94,
      "note": "Drive toward Nashville, TN, USA."
    },
    {
      "id": "event-5",
      "status": "on_duty",
      "event_type": "pickup",
      "start_at": "2026-08-25T21:24:45.675592Z",
      "end_at": "2026-08-25T22:24:45.675592Z",
      "duration_hours": 1,
      "start_location": "Nashville, TN, USA",
      "end_location": "Nashville, TN, USA",
      "start_coordinates": [
        -86.7816,
        36.1627
      ],
      "end_coordinates": [
        -86.7816,
        36.1627
      ],
      "start_mile": 603.94,
      "end_mile": 603.94,
      "miles_driven": 0,
      "note": "One hour on duty for pickup."
    },
    {
      "id": "event-6",
      "status": "driving",
      "event_type": "driving",
      "start_at": "2026-08-25T22:24:45.675592Z",
      "end_at": "2026-08-25T23:00:00Z",
      "duration_hours": 0.587,
      "start_location": "Nashville, TN, USA",
      "end_location": "Nashville, TN",
      "start_coordinates": [
        -86.7816,
        36.1627
      ],
      "end_coordinates": [
        -87.27091478357589,
        35.99727277221199
      ],
      "start_mile": 603.94,
      "end_mile": 638,
      "miles_driven": 34.06,
      "note": "Drive toward Dallas, TX, USA."
    },
    {
      "id": "event-7",
      "status": "off_duty",
      "event_type": "meal_break",
      "start_at": "2026-08-25T23:00:00Z",
      "end_at": "2026-08-26T00:00:00Z",
      "duration_hours": 1,
      "start_location": "Nashville, TN",
      "end_location": "Nashville, TN",
      "start_coordinates": [
        -87.27091478357589,
        35.99727277221199
      ],
      "end_coordinates": [
        -87.27091478357589,
        35.99727277221199
      ],
      "start_mile": 638,
      "end_mile": 638,
      "miles_driven": 0,
      "note": "One-hour meal/dinner break beginning 10 consecutive hours of qualifying rest; 11-hour driving limit reached."
    },
    {
      "id": "event-8",
      "status": "sleeper_berth",
      "event_type": "rest",
      "start_at": "2026-08-26T00:00:00Z",
      "end_at": "2026-08-26T09:00:00Z",
      "duration_hours": 9,
      "start_location": "Nashville, TN",
      "end_location": "Nashville, TN",
      "start_coordinates": [
        -87.27091478357589,
        35.99727277221199
      ],
      "end_coordinates": [
        -87.27091478357589,
        35.99727277221199
      ],
      "start_mile": 638,
      "end_mile": 638,
      "miles_driven": 0,
      "note": "Nine hours in the sleeper berth complete 10 consecutive hours of qualifying rest after the one-hour Off Duty meal/dinner break."
    },
    {
      "id": "event-9",
      "status": "on_duty",
      "event_type": "pretrip_inspection",
      "start_at": "2026-08-26T09:00:00Z",
      "end_at": "2026-08-26T09:30:00Z",
      "duration_hours": 0.5,
      "start_location": "Nashville, TN",
      "end_location": "Nashville, TN",
      "start_coordinates": [
        -87.27091478357589,
        35.99727277221199
      ],
      "end_coordinates": [
        -87.27091478357589,
        35.99727277221199
      ],
      "start_mile": 638,
      "end_mile": 638,
      "miles_driven": 0,
      "note": "30-minute pre-trip inspection before the driving shift (planning assumption)."
    },
    {
      "id": "event-10",
      "status": "driving",
      "event_type": "driving",
      "start_at": "2026-08-26T09:30:00Z",
      "end_at": "2026-08-26T14:52:45.517241Z",
      "duration_hours": 5.379,
      "start_location": "Nashville, TN",
      "end_location": "Memphis, TN",
      "start_coordinates": [
        -87.27091478357589,
        35.99727277221199
      ],
      "end_coordinates": [
        -91.71602306473817,
        34.49447341921407
      ],
      "start_mile": 638,
      "end_mile": 950,
      "miles_driven": 312,
      "note": "Drive toward Dallas, TX, USA."
    },
    {
      "id": "event-11",
      "status": "on_duty",
      "event_type": "fuel",
      "start_at": "2026-08-26T14:52:45.517241Z",
      "end_at": "2026-08-26T15:22:45.517241Z",
      "duration_hours": 0.5,
      "start_location": "Memphis, TN",
      "end_location": "Memphis, TN",
      "start_coordinates": [
        -91.71602306473817,
        34.49447341921407
      ],
      "end_coordinates": [
        -91.71602306473817,
        34.49447341921407
      ],
      "start_mile": 950,
      "end_mile": 950,
      "miles_driven": 0,
      "note": "Fuel stop scheduled before 1,000 miles since the previous fueling point. Nearby fuel suggestion: Planned fuel stop (0.0 mi from the scheduled route point; not added to route)."
    },
    {
      "id": "event-12",
      "status": "driving",
      "event_type": "driving",
      "start_at": "2026-08-26T15:22:45.517241Z",
      "end_at": "2026-08-26T21:00:00Z",
      "duration_hours": 5.621,
      "start_location": "Memphis, TN",
      "end_location": "Dallas, TX",
      "start_coordinates": [
        -91.71602306473817,
        34.49447341921407
      ],
      "end_coordinates": [
        -96.28811835179923,
        32.94874238081432
      ],
      "start_mile": 950,
      "end_mile": 1276,
      "miles_driven": 326,
      "note": "Drive toward Dallas, TX, USA."
    },
    {
      "id": "event-13",
      "status": "off_duty",
      "event_type": "meal_break",
      "start_at": "2026-08-26T21:00:00Z",
      "end_at": "2026-08-26T22:00:00Z",
      "duration_hours": 1,
      "start_location": "Dallas, TX",
      "end_location": "Dallas, TX",
      "start_coordinates": [
        -96.28811835179923,
        32.94874238081432
      ],
      "end_coordinates": [
        -96.28811835179923,
        32.94874238081432
      ],
      "start_mile": 1276,
      "end_mile": 1276,
      "miles_driven": 0,
      "note": "One-hour meal/dinner break beginning 10 consecutive hours of qualifying rest; 11-hour driving limit reached."
    },
    {
      "id": "event-14",
      "status": "sleeper_berth",
      "event_type": "rest",
      "start_at": "2026-08-26T22:00:00Z",
      "end_at": "2026-08-27T07:00:00Z",
      "duration_hours": 9,
      "start_location": "Dallas, TX",
      "end_location": "Dallas, TX",
      "start_coordinates": [
        -96.28811835179923,
        32.94874238081432
      ],
      "end_coordinates": [
        -96.28811835179923,
        32.94874238081432
      ],
      "start_mile": 1276,
      "end_mile": 1276,
      "miles_driven": 0,
      "note": "Nine hours in the sleeper berth complete 10 consecutive hours of qualifying rest after the one-hour Off Duty meal/dinner break."
    },
    {
      "id": "event-15",
      "status": "on_duty",
      "event_type": "pretrip_inspection",
      "start_at": "2026-08-27T07:00:00Z",
      "end_at": "2026-08-27T07:30:00Z",
      "duration_hours": 0.5,
      "start_location": "Dallas, TX",
      "end_location": "Dallas, TX",
      "start_coordinates": [
        -96.28811835179923,
        32.94874238081432
      ],
      "end_coordinates": [
        -96.28811835179923,
        32.94874238081432
      ],
      "start_mile": 1276,
      "end_mile": 1276,
      "miles_driven": 0,
      "note": "30-minute pre-trip inspection before the driving shift (planning assumption)."
    },
    {
      "id": "event-16",
      "status": "driving",
      "event_type": "driving",
      "start_at": "2026-08-27T07:30:00Z",
      "end_at": "2026-08-27T08:07:50.015891Z",
      "duration_hours": 0.631,
      "start_location": "Dallas, TX",
      "end_location": "Dallas, TX, USA",
      "start_coordinates": [
        -96.28811835179923,
        32.94874238081432
      ],
      "end_coordinates": [
        -96.797,
        32.7767
      ],
      "start_mile": 1276,
      "end_mile": 1312.57,
      "miles_driven": 36.57,
      "note": "Drive toward Dallas, TX, USA."
    },
    {
      "id": "event-17",
      "status": "on_duty",
      "event_type": "dropoff",
      "start_at": "2026-08-27T08:07:50.015891Z",
      "end_at": "2026-08-27T09:07:50.015891Z",
      "duration_hours": 1,
      "start_location": "Dallas, TX, USA",
      "end_location": "Dallas, TX, USA",
      "start_coordinates": [
        -96.797,
        32.7767
      ],
      "end_coordinates": [
        -96.797,
        32.7767
      ],
      "start_mile": 1312.57,
      "end_mile": 1312.57,
      "miles_driven": 0,
      "note": "One hour on duty for drop-off."
    }
  ],
  "daily_logs": [
    {
      "date": "2026-08-25",
      "timezone": "America/New_York",
      "from_location": "Richmond, VA, USA",
      "to_location": "Nashville, TN",
      "total_miles": 638,
      "status_totals": {
        "off_duty": 7.5,
        "sleeper_berth": 4,
        "driving": 11,
        "on_duty": 1.5
      },
      "grid_note": null,
      "cycle_used_hours": 42.5,
      "recap": {
        "on_duty_today": 12.5,
        "cycle_used_at_start": 30,
        "cycle_used_at_end": 42.5,
        "remaining_cycle_hours": 27.5,
        "restart_completed": false,
        "seventy_hour_a": 42.5,
        "seventy_hour_b": 27.5,
        "seventy_hour_c": 42.5,
        "estimated": true,
        "estimate_basis": "Conservative 70-hour/8-day estimate: no prior hours are assumed to age out before a scheduled 34-hour restart."
      },
      "segments": [
        {
          "status": "off_duty",
          "start_minute": 0,
          "end_minute": 360
        },
        {
          "status": "on_duty",
          "start_minute": 360,
          "end_minute": 390
        },
        {
          "status": "driving",
          "start_minute": 390,
          "end_minute": 870
        },
        {
          "status": "off_duty",
          "start_minute": 870,
          "end_minute": 900
        },
        {
          "status": "driving",
          "start_minute": 900,
          "end_minute": 1044.761
        },
        {
          "status": "on_duty",
          "start_minute": 1044.761,
          "end_minute": 1104.761
        },
        {
          "status": "driving",
          "start_minute": 1104.761,
          "end_minute": 1140
        },
        {
          "status": "off_duty",
          "start_minute": 1140,
          "end_minute": 1200
        },
        {
          "status": "sleeper_berth",
          "start_minute": 1200,
          "end_minute": 1440
        }
      ],
      "remarks": [
        {
          "event_id": "event-1",
          "time": "06:00",
          "minute": 360,
          "status": "on_duty",
          "location": "Richmond, VA, USA",
          "activity": "Pre-trip inspection",
          "note": "30-minute pre-trip inspection before the driving shift (planning assumption).",
          "timezone_abbreviation": "EDT"
        },
        {
          "event_id": "event-2",
          "time": "06:30",
          "minute": 390,
          "status": "driving",
          "location": "Richmond, VA, USA",
          "activity": "Driving",
          "note": "Drive toward Nashville, TN, USA.",
          "timezone_abbreviation": "EDT"
        },
        {
          "event_id": "event-3",
          "time": "14:30",
          "minute": 870,
          "status": "off_duty",
          "location": "Nashville, TN",
          "activity": "Meal/rest break",
          "note": "30-minute Meal/rest break after eight cumulative driving hours.",
          "timezone_abbreviation": "EDT"
        },
        {
          "event_id": "event-4",
          "time": "15:00",
          "minute": 900,
          "status": "driving",
          "location": "Nashville, TN",
          "activity": "Driving",
          "note": "Drive toward Nashville, TN, USA.",
          "timezone_abbreviation": "EDT"
        },
        {
          "event_id": "event-5",
          "time": "17:24",
          "minute": 1044.761,
          "status": "on_duty",
          "location": "Nashville, TN, USA",
          "activity": "Pickup",
          "note": "One hour on duty for pickup.",
          "timezone_abbreviation": "EDT"
        },
        {
          "event_id": "event-6",
          "time": "18:24",
          "minute": 1104.761,
          "status": "driving",
          "location": "Nashville, TN, USA",
          "activity": "Driving",
          "note": "Drive toward Dallas, TX, USA.",
          "timezone_abbreviation": "EDT"
        },
        {
          "event_id": "event-7",
          "time": "19:00",
          "minute": 1140,
          "status": "off_duty",
          "location": "Nashville, TN",
          "activity": "Meal/dinner break",
          "note": "One-hour meal/dinner break beginning 10 consecutive hours of qualifying rest; 11-hour driving limit reached.",
          "timezone_abbreviation": "EDT"
        },
        {
          "event_id": "event-8",
          "time": "20:00",
          "minute": 1200,
          "status": "sleeper_berth",
          "location": "Nashville, TN",
          "activity": "Sleeper berth",
          "note": "Nine hours in the sleeper berth complete 10 consecutive hours of qualifying rest after the one-hour Off Duty meal/dinner break.",
          "timezone_abbreviation": "EDT"
        }
      ]
    },
    {
      "date": "2026-08-26",
      "timezone": "America/New_York",
      "from_location": "Nashville, TN",
      "to_location": "Dallas, TX",
      "total_miles": 638,
      "status_totals": {
        "off_duty": 1,
        "sleeper_berth": 11,
        "driving": 11,
        "on_duty": 1
      },
      "grid_note": null,
      "cycle_used_hours": 54.5,
      "recap": {
        "on_duty_today": 12,
        "cycle_used_at_start": 42.5,
        "cycle_used_at_end": 54.5,
        "remaining_cycle_hours": 15.5,
        "restart_completed": false,
        "seventy_hour_a": 54.5,
        "seventy_hour_b": 15.5,
        "seventy_hour_c": 54.5,
        "estimated": true,
        "estimate_basis": "Conservative 70-hour/8-day estimate: no prior hours are assumed to age out before a scheduled 34-hour restart."
      },
      "segments": [
        {
          "status": "sleeper_berth",
          "start_minute": 0,
          "end_minute": 300
        },
        {
          "status": "on_duty",
          "start_minute": 300,
          "end_minute": 330
        },
        {
          "status": "driving",
          "start_minute": 330,
          "end_minute": 652.759
        },
        {
          "status": "on_duty",
          "start_minute": 652.759,
          "end_minute": 682.759
        },
        {
          "status": "driving",
          "start_minute": 682.759,
          "end_minute": 1020
        },
        {
          "status": "off_duty",
          "start_minute": 1020,
          "end_minute": 1080
        },
        {
          "status": "sleeper_berth",
          "start_minute": 1080,
          "end_minute": 1440
        }
      ],
      "remarks": [
        {
          "event_id": "event-8",
          "time": "00:00",
          "minute": 0,
          "status": "sleeper_berth",
          "location": "Nashville, TN",
          "activity": "Continued sleeper berth",
          "note": "Continued: Nine hours in the sleeper berth complete 10 consecutive hours of qualifying rest after the one-hour Off Duty meal/dinner break.",
          "timezone_abbreviation": "EDT"
        },
        {
          "event_id": "event-9",
          "time": "05:00",
          "minute": 300,
          "status": "on_duty",
          "location": "Nashville, TN",
          "activity": "Pre-trip inspection",
          "note": "30-minute pre-trip inspection before the driving shift (planning assumption).",
          "timezone_abbreviation": "EDT"
        },
        {
          "event_id": "event-10",
          "time": "05:30",
          "minute": 330,
          "status": "driving",
          "location": "Nashville, TN",
          "activity": "Driving",
          "note": "Drive toward Dallas, TX, USA.",
          "timezone_abbreviation": "EDT"
        },
        {
          "event_id": "event-11",
          "time": "10:52",
          "minute": 652.759,
          "status": "on_duty",
          "location": "Memphis, TN",
          "activity": "Fueling",
          "note": "Fuel stop scheduled before 1,000 miles since the previous fueling point. Nearby fuel suggestion: Planned fuel stop (0.0 mi from the scheduled route point; not added to route).",
          "timezone_abbreviation": "EDT"
        },
        {
          "event_id": "event-12",
          "time": "11:22",
          "minute": 682.759,
          "status": "driving",
          "location": "Memphis, TN",
          "activity": "Driving",
          "note": "Drive toward Dallas, TX, USA.",
          "timezone_abbreviation": "EDT"
        },
        {
          "event_id": "event-13",
          "time": "17:00",
          "minute": 1020,
          "status": "off_duty",
          "location": "Dallas, TX",
          "activity": "Meal/dinner break",
          "note": "One-hour meal/dinner break beginning 10 consecutive hours of qualifying rest; 11-hour driving limit reached.",
          "timezone_abbreviation": "EDT"
        },
        {
          "event_id": "event-14",
          "time": "18:00",
          "minute": 1080,
          "status": "sleeper_berth",
          "location": "Dallas, TX",
          "activity": "Sleeper berth",
          "note": "Nine hours in the sleeper berth complete 10 consecutive hours of qualifying rest after the one-hour Off Duty meal/dinner break.",
          "timezone_abbreviation": "EDT"
        }
      ]
    },
    {
      "date": "2026-08-27",
      "timezone": "America/New_York",
      "from_location": "Dallas, TX",
      "to_location": "Dallas, TX, USA",
      "total_miles": 36.57,
      "status_totals": {
        "off_duty": 18.87,
        "sleeper_berth": 3,
        "driving": 0.63,
        "on_duty": 1.5
      },
      "grid_note": null,
      "cycle_used_hours": 56.63,
      "recap": {
        "on_duty_today": 2.13,
        "cycle_used_at_start": 54.5,
        "cycle_used_at_end": 56.63,
        "remaining_cycle_hours": 13.37,
        "restart_completed": false,
        "seventy_hour_a": 56.63,
        "seventy_hour_b": 13.37,
        "seventy_hour_c": 56.63,
        "estimated": true,
        "estimate_basis": "Conservative 70-hour/8-day estimate: no prior hours are assumed to age out before a scheduled 34-hour restart."
      },
      "segments": [
        {
          "status": "sleeper_berth",
          "start_minute": 0,
          "end_minute": 180
        },
        {
          "status": "on_duty",
          "start_minute": 180,
          "end_minute": 210
        },
        {
          "status": "driving",
          "start_minute": 210,
          "end_minute": 247.834
        },
        {
          "status": "on_duty",
          "start_minute": 247.834,
          "end_minute": 307.834
        },
        {
          "status": "off_duty",
          "start_minute": 307.834,
          "end_minute": 1440
        }
      ],
      "remarks": [
        {
          "event_id": "event-14",
          "time": "00:00",
          "minute": 0,
          "status": "sleeper_berth",
          "location": "Dallas, TX",
          "activity": "Continued sleeper berth",
          "note": "Continued: Nine hours in the sleeper berth complete 10 consecutive hours of qualifying rest after the one-hour Off Duty meal/dinner break.",
          "timezone_abbreviation": "EDT"
        },
        {
          "event_id": "event-15",
          "time": "03:00",
          "minute": 180,
          "status": "on_duty",
          "location": "Dallas, TX",
          "activity": "Pre-trip inspection",
          "note": "30-minute pre-trip inspection before the driving shift (planning assumption).",
          "timezone_abbreviation": "EDT"
        },
        {
          "event_id": "event-16",
          "time": "03:30",
          "minute": 210,
          "status": "driving",
          "location": "Dallas, TX",
          "activity": "Driving",
          "note": "Drive toward Dallas, TX, USA.",
          "timezone_abbreviation": "EDT"
        },
        {
          "event_id": "event-17",
          "time": "04:07",
          "minute": 247.834,
          "status": "on_duty",
          "location": "Dallas, TX, USA",
          "activity": "Drop-off",
          "note": "One hour on duty for drop-off.",
          "timezone_abbreviation": "EDT"
        }
      ]
    }
  ],
  "metadata": {
    "driver_name": "Alex Driver",
    "carrier_name": "Spotter Logistics",
    "main_office_address": "123 Dispatch Way, Richmond, VA 23219",
    "home_terminal_address": "880 Terminal Road, Richmond, VA 23224",
    "vehicle_number": "101",
    "shipping_document_number": "BOL-9921"
  },
  "assumptions": [
    "Property-carrying driver using the 70-hour/8-day cycle with no adverse-condition extension.",
    "The driver completed 10 consecutive hours off duty immediately before the selected duty start.",
    "Each driving shift begins with a 30-minute On Duty—not driving pre-trip inspection.",
    "Driving is limited to 11 hours within a 14-hour window after the qualifying 10-hour rest.",
    "A 34-hour restart is inserted when the simplified cycle is exhausted or its remaining balance cannot support the next pre-trip inspection plus additional driving.",
    "The planner shows a full 34-hour restart and does not credit the separate 10-hour pre-departure rest because prior-duty records are not supplied.",
    "Pickup and drop-off each take exactly one hour and are logged On Duty—not driving.",
    "A dedicated 30-minute break is shown as an Off Duty Meal/rest break; another qualifying non-driving stop can satisfy the eight-hour driving-break rule.",
    "A normal daily rest is shown as one hour Off Duty for a meal/dinner break followed by nine consecutive hours in the Sleeper Berth; together they provide 10 consecutive qualifying hours.",
    "Off Duty meal/rest time assumes the driver is relieved of work, vehicle, and cargo responsibility and is free to pursue personal activities.",
    "The vehicle is assumed to have a compliant sleeper berth that the driver uses for the modeled Sleeper Berth periods.",
    "The home-terminal 24-hour log period is assumed to run from midnight to midnight.",
    "Time before plan start on the first log day and after trip completion is assumed Off Duty.",
    "The truck begins with a full tank and fuels near mile 950, before any 1,000-mile interval.",
    "Each scheduled fuel stop is modeled as 30 minutes On Duty—not driving.",
    "No separate fixed-duration post-trip event is assumed; any inspection or reporting work actually performed must be logged On Duty—not driving.",
    "Traffic, weather, split sleeper berth, short-haul exceptions, team driving, and personal conveyance are excluded."
  ],
  "warnings": [
    "Demo routing is active. Configure Geoapify for road-level heavy-truck routes and real places.",
    "The 70-hour/8-day paper recap is a conservative estimate: no prior hours are assumed to age out during this trip, A and C equal the simplified cycle total at each day's end, B is the remaining balance floored at zero, and a scheduled 34-hour restart resets the estimate.",
    "Break and rest markers are planning positions along the route; confirm safe, legal truck parking before driving."
  ],
  "notice": "Generated trip plan — not a certified ELD record.",
  "attribution": {
    "routing": "Deterministic demo route (replace with Geoapify for road routing)",
    "map": "© OpenFreeMap © OpenStreetMap contributors"
  },
  "request": {
    "current_location": {
      "id": "richmond",
      "label": "Richmond, VA, USA",
      "lat": 37.5407,
      "lon": -77.436
    },
    "pickup_location": {
      "id": "nashville",
      "label": "Nashville, TN, USA",
      "lat": 36.1627,
      "lon": -86.7816
    },
    "dropoff_location": {
      "id": "dallas",
      "label": "Dallas, TX, USA",
      "lat": 32.7767,
      "lon": -96.797
    },
    "current_cycle_used_hours": 30,
    "departure_at": "2026-08-25T06:00",
    "home_terminal_timezone": "America/New_York",
    "metadata": {
      "driver_name": "Alex Driver",
      "carrier_name": "Spotter Logistics",
      "main_office_address": "123 Dispatch Way, Richmond, VA 23219",
      "home_terminal_address": "880 Terminal Road, Richmond, VA 23224",
      "vehicle_number": "101",
      "shipping_document_number": "BOL-9921"
    }
  }
};
