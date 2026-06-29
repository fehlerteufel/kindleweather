const SOURCE_URL =
  "https://messwerte.tawes.at/NOE/11381_Pottschach/ajax/temperaturverlauf.php";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/weather") {
      return handleWeatherRequest();
    }
    if (url.pathname === "/api/historical") {
      return handleHistoricalRequest(url);
    }
    return env.ASSETS.fetch(request);
  },
};

async function handleWeatherRequest() {
  try {
    const response = await fetch("https://dataset.api.hub.geosphere.at/v1/station/current/tawes-v1-10min?parameters=RR&parameters=P&parameters=TL&parameters=RF&station_ids=11381&output_format=geojson", {
      headers: { accept: "application/json" },
    });
    if (!response.ok) {
      return json({ error: `Weather source returned ${response.status}` }, response.status);
    }
    const data = await response.json();
    const feature = data.features && data.features[0];
    if (!feature) {
      return json({ error: "No data received" }, 502);
    }
    const params = feature.properties?.parameters;
    const timestamp = data.timestamps && data.timestamps[0];
    if (!params || !timestamp) {
      return json({ error: "Incomplete data" }, 502);
    }
    const temp = params.TL?.data?.[0];
    const hum = params.RF?.data?.[0];
    return json({
      temperature: temp,
      humidity: hum,
      timestamp,
      minTemperature: null,
      maxTemperature: null,
    });
  } catch (error) {
    return json({ error: "Unable to fetch weather data" }, 502);
  }
}

async function handleHistoricalRequest(url) {
  try {
    const start = url.searchParams.get("start");
    const end = url.searchParams.get("end");
    if (!start || !end) {
      return json({ error: "Missing start or end query parameter" }, 400);
    }
    const endpoint = `https://dataset.api.hub.geosphere.at/v1/station/historical/tawes-v1-10min?parameters=RR&parameters=P&parameters=TL&parameters=RF&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&station_ids=11381&output_format=geojson`;
    const response = await fetch(endpoint, {
      headers: { accept: "application/json" },
    });
    if (!response.ok) {
      return json({ error: `Weather source returned ${response.status}` }, response.status);
    }
    const data = await response.json();
    const features = data.features || [];
    const result = features.map(f => {
      const params = f.properties?.parameters;
      const timestamp = data.timestamps?.[features.indexOf(f)];
      return {
        temperature: params?.TL?.data?.[0] ?? null,
        humidity: params?.RF?.data?.[0] ?? null,
        timestamp: timestamp ?? null,
      };
    });
    return json(result, 200);
  } catch (error) {
    return json({ error: "Unable to fetch historical data" }, 502);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=30",
    },
  });
}

  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=30",
    },
  });
}

