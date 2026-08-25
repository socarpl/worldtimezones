# Live Time Zone Map

A standalone HTML/SVG world time-zone map with live clocks for UTC-12 through UTC+14.

The page is built with plain HTML, CSS, and vanilla JavaScript. It does not use React or any frontend framework.

## Features

- Responsive SVG world map.
- Live HH:MM clocks for each UTC offset column.
- Clock colors change by local hour using a 24-hour daylight/dusk/night palette.
- Browser-local timezone detection using `Intl.DateTimeFormat`.
- Home icon under the user's current timezone column.
- DST badges with tooltip text.
- Clock square tooltips showing 12-hour `am/pm` time.
- Clickable timezone names that open related English Wikipedia pages in a new tab.
- Optional geopolitical timezone boundary overlay.
- Windows 98-style About dialog.

## Run Locally

Open `index.html` directly in a browser.

No build step is required for normal use because `map-data.js` is already generated and committed.

## Repository Files

- `index.html` - the complete page UI and runtime logic.
- `map-data.js` - generated SVG path data used by the page.
- `tools/build-map-data.js` - script used to regenerate `map-data.js` from raw GeoJSON sources.

## Map Data

The committed `map-data.js` is generated from:

- Natural Earth land polygons.
- Natural Earth country boundary lines.
- timezone-boundary-builder 2026c timezone polygons.

The raw source files are intentionally not committed because they are large. They are expected under `data-src/`, which is ignored by Git.

## Regenerating Map Data

To regenerate `map-data.js`, place these files in `data-src/`:

- `ne_10m_land.geojson`
- `ne_10m_admin_0_boundary_lines_land.geojson`
- `timezones/combined-with-oceans-now.json`

Then run:

```bash
node --max-old-space-size=4096 tools/build-map-data.js
```

On Windows, if running from another working directory, set `TIMEZONES_ROOT` to the project folder before running the script.

## Credits

Developed by SOCAR and OpenAI Codex.

Map data:

- Natural Earth
- OpenStreetMap contributors via timezone-boundary-builder

## License

Copyright 2026 SOCAR.
