window.Aion = window.Aion || {};
window.Aion.charts = window.Aion.charts || {};

// A streak/heatmap strip: one small cell per day, shaded by how much happened that day. Best for habit logging and
// daily consistency (does not lay out as a real calendar month - see chart_month_grid.js for that).
// Data: an array of {count}, oldest first, sequential days. Sizes: small (the last 7 days as one row), medium (a
// 4-week/28-day grid), large (a 12-week/84-day grid).
// Governed by Authadia REF_IDs SYN_001 and SYN_003.
(function () {
  "use strict";

  var COLS = { small: 1, medium: 4, large: 12 };
  var ROWS = 7;

  function buildRect(ns, x, y, size, count, maxCount) {
    var rect = document.createElementNS(ns, "rect");
    rect.setAttribute("x", x);
    rect.setAttribute("y", y);
    rect.setAttribute("width", size);
    rect.setAttribute("height", size);
    rect.setAttribute("rx", "2");
    if (count === 0) {
      rect.setAttribute("fill", "var(--card-elevated)");
      rect.setAttribute("stroke", "var(--border)");
    } else {
      var intensity = 0.3 + 0.7 * (count / maxCount);
      rect.setAttribute("fill", "rgba(0, 255, 65, " + intensity + ")");
    }
    return rect;
  }

  function create(data, size) {
    var cols = COLS[size] || COLS.medium;
    var cellSize = size === "small" ? 8 : 10;
    var gap = 2;
    var w = cols * cellSize + (cols - 1) * gap;
    var h = size === "small" ? cellSize : ROWS * cellSize + (ROWS - 1) * gap;
    var ns = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 " + w + " " + h);
    svg.setAttribute("width", w);
    svg.setAttribute("height", h);

    var maxCount = 1;
    for (var m = 0; m < data.length; m++) { maxCount = Math.max(maxCount, data[m].count); }

    if (size === "small") {
      var recent = data.slice(-7);
      recent.forEach(function (entry, i) {
        svg.appendChild(buildRect(ns, i * (cellSize + gap), 0, cellSize, entry.count, maxCount));
      });
      return svg;
    }
    var dataIndex = Math.max(0, data.length - cols * ROWS);
    for (var c = 0; c < cols; c++) {
      for (var r = 0; r < ROWS; r++) {
        var entry = data[dataIndex];
        dataIndex += 1;
        if (entry === undefined) { continue; }
        svg.appendChild(buildRect(ns, c * (cellSize + gap), r * (cellSize + gap), cellSize, entry.count, maxCount));
      }
    }
    return svg;
  }

  window.Aion.charts.heatmap = { create: create };
})();
