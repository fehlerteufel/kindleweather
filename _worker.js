const WEATHER_API_BASE = "https://dataset.api.hub.geosphere.at/v1/station";
const NOWCAST_API_BASE =
  "https://dataset.api.hub.geosphere.at/v1/timeseries/forecast/nowcast-v1-15min-1km";
const STATION_ID = "11381";
const PARAMETERS = ["RR", "P", "TL", "RF"];
const NOWCAST_PARAMETERS = ["t2m", "fx", "rr"];
const NOWCAST_LAT_LON = "47.703,16.013";
const WEATHER_TIME_ZONE = "Europe/Vienna";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/weather") {
      return handleWeatherRequest();
    }

    if (url.pathname === "/api/nowcast") {
      return handleNowcastRequest();
    }

    if (url.pathname === "/api/time") {
      return handleTimeRequest();
    }

    return env.ASSETS.fetch(request);
  },
};

function handleTimeRequest() {
  const now = new Date();

  return json(
    {
      epochMs: now.getTime(),
      iso: now.toISOString(),
    },
    200,
    "no-store",
  );
}

async function handleWeatherRequest() {
  try {
    const [current, historical] = await Promise.all([
      fetchWeatherJson(buildCurrentWeatherUrl()),
      fetchWeatherJson(buildHistoricalWeatherUrl()),
    ]);

    const latest = findLatestMeasurement(current);
    const extreme = findTemperatureExtremes(historical);

    if (!latest) {
      return json({ error: "No temperature and humidity values found" }, 502);
    }

    return json({
      temperature: latest.temperature,
      humidity: latest.humidity,
      timestamp: formatDisplayTimestamp(latest.timestamp),
      minTemperature: extreme ? extreme.min : null,
      maxTemperature: extreme ? extreme.max : null,
    });
  } catch (error) {
    return json({ error: "Unable to fetch weather data" }, 502);
  }
}

async function handleNowcastRequest() {
  try {
    const nowcast = await fetchWeatherJson(buildNowcastUrl());
    const forecast = extractNowcast(nowcast);

    if (!forecast) {
      return json({ error: "No nowcast values found" }, 502);
    }

    return json(forecast, 200, "public, max-age=60");
  } catch (error) {
    return json({ error: "Unable to fetch nowcast data" }, 502);
  }
}

function buildCurrentWeatherUrl() {
  const url = new URL(`${WEATHER_API_BASE}/current/tawes-v1-10min`);
  addCommonWeatherParams(url.searchParams);
  return url.toString();
}

function buildNowcastUrl() {
  const url = new URL(NOWCAST_API_BASE);

  NOWCAST_PARAMETERS.forEach((parameter) => {
    url.searchParams.append("parameters", parameter);
  });
  url.searchParams.set("lat_lon", NOWCAST_LAT_LON);
  url.searchParams.set("forecast_offset", "0");
  url.searchParams.set("output_format", "geojson");

  return url.toString();
}

function buildHistoricalWeatherUrl(now = new Date()) {
  const range = getCurrentLocalDayUtcRange(now);
  const url = new URL(`${WEATHER_API_BASE}/historical/tawes-v1-10min`);

  addCommonWeatherParams(url.searchParams);
  url.searchParams.set("start", formatApiTimestamp(range.start));
  url.searchParams.set("end", formatApiTimestamp(range.end));

  return url.toString();
}

function addCommonWeatherParams(searchParams) {
  PARAMETERS.forEach((parameter) => {
    searchParams.append("parameters", parameter);
  });
  searchParams.set("station_ids", STATION_ID);
  searchParams.set("output_format", "geojson");
}

async function fetchWeatherJson(url) {
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Weather source returned ${response.status}`);
  }

  return response.json();
}

function findLatestMeasurement(collection) {
  const feature = getStationFeature(collection);

  if (!feature || !Array.isArray(collection.timestamps)) {
    return null;
  }

  const temperature = getParameterData(feature, "TL");
  const humidity = getParameterData(feature, "RF");

  for (let index = collection.timestamps.length - 1; index >= 0; index -= 1) {
    if (
      typeof collection.timestamps[index] === "string" &&
      typeof temperature[index] === "number" &&
      typeof humidity[index] === "number"
    ) {
      return {
        temperature: temperature[index],
        humidity: humidity[index],
        timestamp: collection.timestamps[index],
      };
    }
  }

  return null;
}

function findTemperatureExtremes(collection) {
  const feature = getStationFeature(collection);

  if (!feature) {
    return null;
  }

  const temperatures = getParameterData(feature, "TL").filter((value) => {
    return typeof value === "number";
  });

  if (temperatures.length === 0) {
    return null;
  }

  return {
    min: Math.min(...temperatures),
    max: Math.max(...temperatures),
  };
}

function extractNowcast(collection) {
  const feature = getFirstFeature(collection);

  if (!feature || !Array.isArray(collection.timestamps)) {
    return null;
  }

  return {
    timestamps: collection.timestamps,
    temperature: getParameterData(feature, "t2m"),
    rain: getParameterData(feature, "rr"),
    wind: getParameterData(feature, "fx"),
  };
}

function getStationFeature(collection) {
  if (!collection || !Array.isArray(collection.features)) {
    return null;
  }

  return collection.features.find((feature) => {
    return (
      feature &&
      feature.properties &&
      feature.properties.station === STATION_ID
    );
  });
}

function getFirstFeature(collection) {
  if (!collection || !Array.isArray(collection.features)) {
    return null;
  }

  return collection.features[0] || null;
}

function getParameterData(feature, parameter) {
  const values =
    feature.properties &&
    feature.properties.parameters &&
    feature.properties.parameters[parameter] &&
    feature.properties.parameters[parameter].data;

  return Array.isArray(values) ? values : [];
}

function getCurrentLocalDayUtcRange(now) {
  const parts = getZonedDateParts(now, WEATHER_TIME_ZONE);
  const nextDay = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + 1));

  return {
    start: zonedTimeToUtc(parts.year, parts.month, parts.day),
    end: zonedTimeToUtc(
      nextDay.getUTCFullYear(),
      nextDay.getUTCMonth() + 1,
      nextDay.getUTCDate(),
    ),
  };
}

function zonedTimeToUtc(year, month, day) {
  const utcGuess = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
  const offsetMinutes = getTimeZoneOffsetMinutes(utcGuess, WEATHER_TIME_ZONE);

  return new Date(utcGuess.getTime() - offsetMinutes * 60 * 1000);
}

function getTimeZoneOffsetMinutes(date, timeZone) {
  const parts = getZonedDateTimeParts(date, timeZone);
  const zonedAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );

  return Math.round((zonedAsUtc - date.getTime()) / (60 * 1000));
}

function getZonedDateParts(date, timeZone) {
  const parts = getZonedDateTimeParts(date, timeZone);

  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
  };
}

function getZonedDateTimeParts(date, timeZone) {
  const values = {};
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  formatter.formatToParts(date).forEach((part) => {
    if (part.type !== "literal") {
      values[part.type] = Number(part.value);
    }
  });

  return values;
}

function formatApiTimestamp(date) {
  return [
    date.getUTCFullYear(),
    "-",
    pad(date.getUTCMonth() + 1),
    "-",
    pad(date.getUTCDate()),
    "T",
    pad(date.getUTCHours()),
    ":",
    pad(date.getUTCMinutes()),
  ].join("");
}

function formatDisplayTimestamp(timestamp) {
  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const parts = getZonedDateTimeParts(date, WEATHER_TIME_ZONE);

  return [
    parts.year,
    "-",
    pad(parts.month),
    "-",
    pad(parts.day),
    " ",
    pad(parts.hour),
    ":",
    pad(parts.minute),
    ":",
    pad(parts.second),
  ].join("");
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function json(data, status = 200, cacheControl = "public, max-age=30") {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": cacheControl,
    },
  });
}
