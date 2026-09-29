window.Aion = window.Aion || {};
window.Aion.ui = window.Aion.ui || {};

// A Matrix-styled calendar date picker: a compact trigger showing the chosen date as text, opening a month-grid
// overlay on tap. Standalone, loaded on demand (window.Aion.loadScript("/app/screens/date_picker.js")), same as
// pickers.js's other shared components. Replaces a bare <input type="date"> wherever a real calendar feel is
// wanted; keeps the exact same "YYYY-MM-DD" value the rest of the codebase already reads/writes.
// window.Aion.ui.datePicker(value, onChange, options) -> a DOM node with a live .value getter/setter.
// options: {maxDate: "YYYY-MM-DD"} disables any day after it (never a future date, for a habit log entry).
// Governed by Authadia REF_IDs SYN_001 and SYN_003.
(function () {
  "use strict";

  function pad(n) { return n < 10 ? "0" + n : String(n); }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) { node.className = className; }
    if (text !== undefined) { node.textContent = text; }
    return node;
  }

  function parseISOLocal(isoString) {
    if (!isoString) { return new Date(); }
    var parts = isoString.split("-");
    if (parts.length !== 3) { return new Date(); }
    return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
  }

  function datePicker(value, onChange, options) {
    var maxDateStr = options && options.maxDate;
    var maxTime = maxDateStr ? parseISOLocal(maxDateStr).getTime() : null;
    var minDateStr = options && options.minDate;
    var minTime = minDateStr ? parseISOLocal(minDateStr).getTime() : null;
    var currentValue = value || "";

    var trigger = el("div", "picker-trigger" + (currentValue ? "" : " empty"), currentValue || "YYYY-MM-DD");

    trigger.addEventListener("click", function () {
      var viewDate = parseISOLocal(currentValue);
      var viewMonth = viewDate.getMonth();
      var viewYear = viewDate.getFullYear();

      var overlay = el("div", "picker-modal-overlay");
      var modal = el("div", "picker-modal");
      var header = el("div", "picker-header");
      var btnPrev = el("button", "picker-btn-icon", "<");
      var btnNext = el("button", "picker-btn-icon", ">");
      var title = el("div", "");
      header.appendChild(btnPrev);
      header.appendChild(title);
      header.appendChild(btnNext);
      modal.appendChild(header);

      var weekdays = el("div", "calendar-weekdays");
      var days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      for (var i = 0; i < 7; i++) { weekdays.appendChild(el("div", "", days[i])); }
      modal.appendChild(weekdays);

      var grid = el("div", "calendar-grid");
      modal.appendChild(grid);

      var actions = el("div", "picker-actions");
      var btnCancel = el("button", "done", "Cancel");
      actions.appendChild(btnCancel);
      modal.appendChild(actions);
      overlay.appendChild(modal);

      function close() { document.body.removeChild(overlay); }

      function renderGrid() {
        grid.innerHTML = "";
        var months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
        title.textContent = months[viewMonth] + " " + viewYear;
        var firstDay = new Date(viewYear, viewMonth, 1).getDay();
        var daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
        var today = new Date();
        var todayStr = today.getFullYear() + "-" + pad(today.getMonth() + 1) + "-" + pad(today.getDate());
        var j;
        for (j = 0; j < firstDay; j++) { grid.appendChild(el("div", "calendar-cell empty")); }
        for (var d = 1; d <= daysInMonth; d++) {
          var dateStr = viewYear + "-" + pad(viewMonth + 1) + "-" + pad(d);
          var cellTime = new Date(viewYear, viewMonth, d).getTime();
          var cellClass = "calendar-cell";
          if (dateStr === todayStr) { cellClass += " today"; }
          if (dateStr === currentValue) { cellClass += " selected"; }
          var disabled = (maxTime !== null && cellTime > maxTime) || (minTime !== null && cellTime < minTime);
          if (disabled) { cellClass += " disabled"; }
          var cell = el("div", cellClass, String(d));
          if (!disabled) {
            (function (selectedDateStr) {
              cell.addEventListener("click", function () {
                currentValue = selectedDateStr;
                trigger.textContent = currentValue;
                trigger.className = "picker-trigger";
                if (onChange) { onChange(currentValue); }
                trigger.dispatchEvent(new Event("change"));  // so an existing addEventListener("change", ...) at the call site still fires, unchanged
                close();
              });
            })(dateStr);
          }
          grid.appendChild(cell);
        }
      }

      btnPrev.addEventListener("click", function () {
        viewMonth -= 1;
        if (viewMonth < 0) { viewMonth = 11; viewYear -= 1; }
        renderGrid();
      });
      btnNext.addEventListener("click", function () {
        viewMonth += 1;
        if (viewMonth > 11) { viewMonth = 0; viewYear += 1; }
        renderGrid();
      });
      btnCancel.addEventListener("click", close);
      overlay.addEventListener("click", function (e) { if (e.target === overlay) { close(); } });

      renderGrid();
      document.body.appendChild(overlay);
    });

    Object.defineProperty(trigger, "value", {
      get: function () { return currentValue; },
      set: function (val) {
        currentValue = val || "";
        trigger.textContent = currentValue || "YYYY-MM-DD";
        trigger.className = "picker-trigger" + (currentValue ? "" : " empty");
      }
    });

    return trigger;
  }

  window.Aion.ui.datePicker = datePicker;
})();
