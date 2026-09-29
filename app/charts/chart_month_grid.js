window.Aion = window.Aion || {};
window.Aion.charts = window.Aion.charts || {};

// A calendar month-grid: a real month laid out as a 7-wide grid, each day cell shaded by how busy/free it was -
// "which weeks are heavy" (distinct from chart_heatmap.js's sequential strip - this lays out as a real calendar).
// Data: {offsetDays, days} - offsetDays is the weekday index (0-6) the 1st of the month falls on, days is an array
// of intensity values 0.0-1.0, one per day of the month. Sizes: medium (18px cells), large (28px cells).
// Governed by Authadia REF_IDs SYN_001 and SYN_003.
(function () {
  "use strict";

  var CELL_SIZES = { medium: 18, large: 28 };
  var COLS = 7;
  var GAP = 2;

  function create(data, size) {
    var cellSize = CELL_SIZES[size] || CELL_SIZES.medium;
    var rows = Math.ceil((data.offsetDays + data.days.length) / COLS);
    var w = COLS * cellSize + (COLS - 1) * GAP;
    var h = rows * cellSize + (rows - 1) * GAP;
    var ns = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 " + w + " " + h);
    svg.setAttribute("width", w);
    svg.setAttribute("height", h);

    for (var i = 0; i < data.days.length; i++) {
      var gridPos = i + data.offsetDays;
      var c = gridPos % COLS;
      var r = Math.floor(gridPos / COLS);
      var intensity = data.days[i];
      var rect = document.createElementNS(ns, "rect");
      rect.setAttribute("x", c * (cellSize + GAP));
      rect.setAttribute("y", r * (cellSize + GAP));
      rect.setAttribute("width", cellSize);
      rect.setAttribute("height", cellSize);
      rect.setAttribute("rx", "2");
      if (intensity === 0) {
        rect.setAttribute("fill", "var(--card-high)");
        rect.setAttribute("stroke", "var(--border)");
      } else {
        rect.setAttribute("fill", "rgba(0, 255, 65, " + (0.2 + 0.8 * intensity) + ")");
      }
      svg.appendChild(rect);
    }
    return svg;
  }

  window.Aion.charts.monthGrid = { create: create };
})();
