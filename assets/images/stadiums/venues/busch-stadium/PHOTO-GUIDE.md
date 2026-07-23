# Venue photo folder guide

This folder is safe to give to a nontechnical photo researcher.

## Priority

Inside any category folder:

    day-01.webp
    day-02.webp
    dusk-01.webp
    night-01.webp

- `01` is primary.
- `02` is the first fallback.
- `03` is the next fallback.
- Incorrect filenames are ignored.
- Missing categories fall back safely.
- Legacy flat files remain supported.

## Weather folders

    weather/fair/
    weather/partly-cloudy/
    weather/cloudy/
    weather/overcast/
    weather/haze/
    weather/smoke/
    weather/fog/
    weather/windy/
    weather/drizzle/
    weather/rain/
    weather/heavy-rain/
    weather/thunderstorm/
    weather/lightning/
    weather/hail/
    weather/freezing-rain/
    weather/sleet/
    weather/snow/
    weather/heavy-snow/
    weather/dust/
    weather/extreme-heat/
    weather/extreme-cold/

Each weather folder may contain:

    day-01.webp
    dusk-01.webp
    night-01.webp
    default-01.webp

## Event-state folders

Tarp and delay photographs are not ordinary rain:

    event-state/rain-delay/
    event-state/weather-delay/
    event-state/suspended-weather/
    event-state/postponed-weather/

## Venue-state folders

    roof/open/
    roof/closed/
    roof/fixed-dome/
    roof/unknown/
    interior/
    exterior/

Examples:

    roof/closed/night-01.webp
    interior/night-01.webp
    exterior/day-01.webp

Closed indoor venues ignore outside weather. T-Mobile Park remains the explicit
weather-exposed exception.

## Image recommendations

- Landscape orientation.
- Recommended export: 1916 x 821.
- Real venue photography.
- Avoid watermarks and promotional text.
- Record source and license in `ATTRIBUTION.md` when known.

After adding photos, run:

    python3 scripts/build_venue_image_index.py
