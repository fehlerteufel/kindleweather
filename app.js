(function () {
  var refreshMs = 10 * 60 * 1000;
  var temperatureEl = document.getElementById("temperature");
  var humidityEl = document.getElementById("humidity");
  var timestampEl = document.getElementById("timestamp");

  function requestWeather() {
    var xhr = new XMLHttpRequest();

    xhr.open("GET", "/api/weather?t=" + new Date().getTime(), true);
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) {
        return;
      }

      if (xhr.status < 200 || xhr.status >= 300) {
        timestampEl.innerHTML = "Update failed";
        return;
      }

      try {
        var data = JSON.parse(xhr.responseText);
        temperatureEl.innerHTML = Number(data.temperature).toFixed(1);
        humidityEl.innerHTML = Math.round(Number(data.humidity));
        timestampEl.innerHTML = data.timestamp || "";
      } catch (error) {
        timestampEl.innerHTML = "Invalid weather data";
      }
    };
    xhr.send();
  }

  requestWeather();
  window.setInterval(requestWeather, refreshMs);
}());
