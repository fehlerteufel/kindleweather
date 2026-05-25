const SOURCE_URL =
  "https://messwerte.tawes.at/NOE/11381_Pottschach/ajax/temperaturverlauf.php";

export async function onRequestGet() {
  try {
    const response = await fetch(SOURCE_URL, {
      headers: {
        accept: "application/json",
        "user-agent": "kindleweather-cloudflare-pages",
      },
    });

    if (!response.ok) {
      return json(
        { error: `Weather source returned ${response.status}` },
        response.status,
      );
    }

    const measurements = await response.json();
    const latest = findLatestMeasurement(measurements);

    if (!latest) {
      return json({ error: "No temperature and humidity values found" }, 502);
    }

    return json({
      temperature: latest.tl,
      humidity: latest.rf,
      timestamp: latest.datum,
    });
  } catch (error) {
    return json({ error: "Unable to fetch weather data" }, 502);
  }
}

function findLatestMeasurement(measurements) {
  if (!Array.isArray(measurements)) {
    return null;
  }

  return measurements
    .filter((item) => {
      return (
        item &&
        typeof item.tl === "number" &&
        typeof item.rf === "number" &&
        typeof item.datum === "string" &&
        item.datum !== "extremwerte"
      );
    })
    .sort((left, right) => {
      return parseTimestamp(right.datum) - parseTimestamp(left.datum);
    })[0];
}

function parseTimestamp(value) {
  return Date.parse(value.replace(" ", "T"));
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=120",
    },
  });
}
