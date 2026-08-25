const fs = require("fs");
const path = require("path");

const ROOT = process.env.TIMEZONES_ROOT
  ? path.resolve(process.env.TIMEZONES_ROOT)
  : path.resolve(__dirname, "..");
const LAND_SOURCE = path.join(ROOT, "data-src", "ne_10m_land.geojson");
const BORDER_SOURCE = path.join(ROOT, "data-src", "ne_10m_admin_0_boundary_lines_land.geojson");
const TIMEZONE_SOURCE = path.join(ROOT, "data-src", "timezones", "combined-with-oceans-now.json");
const OUTPUT = path.join(ROOT, "map-data.js");

const VIEWBOX = {
  width: 1440,
  height: 760,
  north: 85,
  south: -85
};

const TOLERANCE = {
  land: 0.08,
  countryBorders: 0.1,
  timezones: 0.34
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function projectCoord(coord) {
  const lon = clamp(coord[0], -180, 180);
  const lat = clamp(coord[1], VIEWBOX.south, VIEWBOX.north);
  return [
    ((lon + 180) / 360) * VIEWBOX.width,
    ((VIEWBOX.north - lat) / (VIEWBOX.north - VIEWBOX.south)) * VIEWBOX.height,
    lon
  ];
}

function pointDistanceSq(point, previous) {
  const dx = point[0] - previous[0];
  const dy = point[1] - previous[1];
  return dx * dx + dy * dy;
}

function perpendicularDistanceSq(point, start, end) {
  let x = start[0];
  let y = start[1];
  const dx = end[0] - x;
  const dy = end[1] - y;

  if (dx !== 0 || dy !== 0) {
    const t = clamp(((point[0] - x) * dx + (point[1] - y) * dy) / (dx * dx + dy * dy), 0, 1);
    x += dx * t;
    y += dy * t;
  }

  const distX = point[0] - x;
  const distY = point[1] - y;
  return distX * distX + distY * distY;
}

function radialSimplify(points, toleranceSq) {
  if (points.length <= 2) {
    return points;
  }

  const simplified = [points[0]];
  let previous = points[0];

  for (let index = 1; index < points.length - 1; index += 1) {
    const point = points[index];
    if (pointDistanceSq(point, previous) > toleranceSq) {
      simplified.push(point);
      previous = point;
    }
  }

  simplified.push(points[points.length - 1]);
  return simplified;
}

function douglasPeucker(points, toleranceSq) {
  if (points.length <= 2) {
    return points;
  }

  const keep = new Uint8Array(points.length);
  const stack = [[0, points.length - 1]];
  keep[0] = 1;
  keep[points.length - 1] = 1;

  while (stack.length > 0) {
    const [first, last] = stack.pop();
    let maxDistance = 0;
    let maxIndex = 0;

    for (let index = first + 1; index < last; index += 1) {
      const distance = perpendicularDistanceSq(points[index], points[first], points[last]);
      if (distance > maxDistance) {
        maxDistance = distance;
        maxIndex = index;
      }
    }

    if (maxDistance > toleranceSq) {
      keep[maxIndex] = 1;
      stack.push([first, maxIndex], [maxIndex, last]);
    }
  }

  return points.filter((_point, index) => keep[index]);
}

function simplify(points, tolerance) {
  if (points.length <= 2) {
    return points;
  }

  const toleranceSq = tolerance * tolerance;
  return douglasPeucker(radialSimplify(points, toleranceSq), toleranceSq);
}

function projectedSegments(ring, splitAtDateline) {
  const segments = [];
  let current = [];
  let previous = null;

  for (const coord of ring) {
    const point = projectCoord(coord);
    if (
      splitAtDateline &&
      previous &&
      Math.abs(point[2] - previous[2]) > 180
    ) {
      if (current.length > 1) {
        segments.push(current);
      }
      current = [point];
    } else {
      current.push(point);
    }
    previous = point;
  }

  if (current.length > 1) {
    segments.push(current);
  }

  return segments;
}

function segmentArea(points) {
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const next = (index + 1) % points.length;
    area += points[index][0] * points[next][1] - points[next][0] * points[index][1];
  }
  return Math.abs(area / 2);
}

function formatNumber(value) {
  return Number(value.toFixed(1)).toString();
}

function segmentToPath(points, closePath) {
  const minLength = closePath ? 3 : 2;
  if (points.length < minLength) {
    return "";
  }

  const commands = [`M${formatNumber(points[0][0])} ${formatNumber(points[0][1])}`];
  for (let index = 1; index < points.length; index += 1) {
    commands.push(`L${formatNumber(points[index][0])} ${formatNumber(points[index][1])}`);
  }
  if (closePath) {
    commands.push("Z");
  }
  return commands.join("");
}

function geometryRings(geometry) {
  if (geometry.type === "Polygon") {
    return geometry.coordinates;
  }
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.flat();
  }
  return [];
}

function geometryLines(geometry) {
  if (geometry.type === "LineString") {
    return [geometry.coordinates];
  }
  if (geometry.type === "MultiLineString") {
    return geometry.coordinates;
  }
  return [];
}

function geometryToPath(geometry, options) {
  const parts = [];
  const closePath = options.closePath;
  const tolerance = options.tolerance;
  const splitAtDateline = options.splitAtDateline;
  const minArea = options.minArea || 0;

  for (const ring of geometryRings(geometry)) {
    for (const segment of projectedSegments(ring, splitAtDateline)) {
      const simplified = simplify(segment, tolerance);
      if (closePath && segmentArea(simplified) < minArea) {
        continue;
      }
      const pathData = segmentToPath(simplified, closePath);
      if (pathData) {
        parts.push(pathData);
      }
    }
  }

  return parts.join("");
}

function lineGeometryToPath(geometry, options) {
  const parts = [];
  const tolerance = options.tolerance;
  const splitAtDateline = options.splitAtDateline;

  for (const line of geometryLines(geometry)) {
    for (const segment of projectedSegments(line, splitAtDateline)) {
      const simplified = simplify(segment, tolerance);
      const pathData = segmentToPath(simplified, false);
      if (pathData) {
        parts.push(pathData);
      }
    }
  }

  return parts.join("");
}

function buildLandPaths(collection) {
  return collection.features
    .filter((feature) => feature.properties.featurecla !== "Null island")
    .map((feature) => geometryToPath(feature.geometry, {
      closePath: true,
      splitAtDateline: false,
      tolerance: TOLERANCE.land,
      minArea: 0.08
    }))
    .filter(Boolean);
}

function buildCountryBorderPaths(collection) {
  return collection.features
    .filter((feature) => feature.properties.TYPE === "Land")
    .map((feature) => lineGeometryToPath(feature.geometry, {
      splitAtDateline: true,
      tolerance: TOLERANCE.countryBorders
    }))
    .filter(Boolean);
}

function buildTimezonePaths(collection) {
  return collection.features
    .map((feature) => ({
      tzid: feature.properties.tzid,
      path: geometryToPath(feature.geometry, {
        closePath: false,
        splitAtDateline: true,
        tolerance: TOLERANCE.timezones
      })
    }))
    .filter((feature) => feature.path);
}

function main() {
  const land = JSON.parse(fs.readFileSync(LAND_SOURCE, "utf8"));
  const borders = JSON.parse(fs.readFileSync(BORDER_SOURCE, "utf8"));
  const timezones = JSON.parse(fs.readFileSync(TIMEZONE_SOURCE, "utf8"));
  const data = {
    meta: {
      projection: "equirectangular",
      viewBox: `0 0 ${VIEWBOX.width} ${VIEWBOX.height}`,
      landSource: "Natural Earth ne_10m_land.geojson",
      countryBorderSource: "Natural Earth ne_10m_admin_0_boundary_lines_land.geojson",
      timezoneSource: "timezone-boundary-builder 2026c timezones-with-oceans-now.geojson",
      tolerancePx: TOLERANCE
    },
    landPaths: buildLandPaths(land),
    countryBorderPaths: buildCountryBorderPaths(borders),
    timezonePaths: buildTimezonePaths(timezones)
  };

  const body = `window.MAP_DATA = ${JSON.stringify(data)};\n`;
  fs.writeFileSync(OUTPUT, body, "utf8");

  const landChars = data.landPaths.reduce((sum, value) => sum + value.length, 0);
  const borderChars = data.countryBorderPaths.reduce((sum, value) => sum + value.length, 0);
  const timezoneChars = data.timezonePaths.reduce((sum, value) => sum + value.path.length, 0);
  console.log(`land paths: ${data.landPaths.length}, ${landChars.toLocaleString()} chars`);
  console.log(`country border paths: ${data.countryBorderPaths.length}, ${borderChars.toLocaleString()} chars`);
  console.log(`timezone paths: ${data.timezonePaths.length}, ${timezoneChars.toLocaleString()} chars`);
  console.log(`output: ${path.relative(ROOT, OUTPUT)}, ${body.length.toLocaleString()} chars`);
}

main();
