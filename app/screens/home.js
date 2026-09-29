window.Aion = window.Aion || {};
window.Aion.screens = window.Aion.screens || {};

(function () {
  "use strict";

  var DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  var homeRowsEl;

  function saveHomeWindow(weekday, startHhmm) {
    window.Aion.api("/api/home-windows", "POST", { weekday: weekday, start_hhmm: startHhmm })
      .then(function () { window.Aion.setStatus(""); window.Aion.haptic("success"); })
      .catch(function (error) { window.Aion.setStatus("Could not save that home hour: " + error.message, true); });
  }

  function renderHomeWindows(windows) {
    homeRowsEl.innerHTML = "";
    DAYS.forEach(function (dayLabel, weekday) {
      var row = document.createElement("div");
      row.className = "field-row";
      var label = document.createElement("label");
      label.textContent = dayLabel;
      row.appendChild(label);
      var input = window.Aion.ui.timePicker(windows[String(weekday)] || "", function () {});
      row.appendChild(input);
      var saveButton = document.createElement("button");
      saveButton.type = "button";
      saveButton.className = "primary";
      saveButton.textContent = "Set";
      saveButton.addEventListener("click", function () {
        if (input.value === "") { return; }
        saveHomeWindow(weekday, input.value);
      });
      row.appendChild(saveButton);
      var clearButton = document.createElement("button");
      clearButton.type = "button";
      clearButton.className = "primary";
      clearButton.textContent = "Clear";
      clearButton.addEventListener("click", function () { input.value = ""; saveHomeWindow(weekday, null); });
      row.appendChild(clearButton);
      homeRowsEl.appendChild(row);
    });
  }

  function load() {
    homeRowsEl = homeRowsEl || document.getElementById("home-rows");
    window.Aion.setStatus("Loading...");
    window.Aion.api("/api/home-windows", "GET")
      .then(function (body) { window.Aion.setStatus(""); renderHomeWindows(body.windows || {}); })
      .catch(function (error) { window.Aion.setStatus("Could not load home hours: " + error.message, true); });
  }

  window.Aion.screens.home = { load: load };
})();
