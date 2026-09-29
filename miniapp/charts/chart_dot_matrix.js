window.Aion = window.Aion || {};
window.Aion.charts = window.Aion.charts || {};

// A dot-matrix counter: a lightweight grid of dots tallying a plain count with no real ceiling to show proportion
// against (contrast chart_proportion.js, which needs a real limit) - e.g. "5 things logged today."
// Data: {count, columns?, color?}. Sizes: small (60x20, ~3x2), medium (120x40), large (240x80).
// Governed by Authadia REF_IDs SYN_001 and SYN_003.
(function () {
  "use strict";

  var SIZES = { small: { w: 60, h: 20 }, medium: { w: 120, h: 40 }, large: { w: 240, h: 80 } };

  function create(data, size) {
    var dim = SIZES[size] || SIZES.medium;
    var ns = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 " + dim.w + " " + dim.h);
    svg.setAttribute("width", dim.w);
    svg.setAttribute("height", dim.h);

    var cols = data.columns || 10;
    var pointSize = (dim.w / cols) * 0.7;
    var gap = (dim.w / cols) * 0.3;
    var maxRows = Math.floor(dim.h / (pointSize + gap));
    var maxCapacity = cols * maxRows;
    var color = data.color || "var(--fg)";

    for (var i = 0; i < maxCapacity; i++) {
      var col = i % cols;
      var row = Math.floor(i / cols);
      var dot = document.createElementNS(ns, "circle");
      dot.setAttribute("cx", col * (pointSize + gap) + pointSize / 2);
      dot.setAttribute("cy", row * (pointSize + gap) + pointSize / 2);
      dot.setAttribute("r", pointSize / 2);
      if (i < data.count) {
        dot.setAttribute("fill", color);
        dot.style.filter = "drop-shadow(0 0 2px " + color + ")";
      } else {
        dot.setAttribute("fill", "var(--card-elevated)");
        dot.setAttribute("stroke", "var(--border)");
      }
      svg.appendChild(dot);
    }
    return svg;
  }

  window.Aion.charts.dotMatrix = { create: create };
})();
