window.Aion = window.Aion || {};
window.Aion.charts = window.Aion.charts || {};

// A segmented proportion bar: discrete filled blocks out of a limit, replacing plain "3 of 5" text with something
// readable at a glance regardless of language. Best for lecture absences against a per-course limit.
// Data: {current, limit, invertColors?} - invertColors true means filling up is bad (an absence count), turning
// warning then danger as it climbs; false (the default) means filling up is good (ordinary progress).
// Sizes: small (80x8, inline next to a tag), medium (200x12, inside a card), large (340x16, full phone width).
// Governed by Authadia REF_IDs SYN_001 and SYN_003.
(function () {
  "use strict";

  var SIZES = { small: { w: 80, h: 8 }, medium: { w: 200, h: 12 }, large: { w: 340, h: 16 } };

  function create(data, size) {
    var dim = SIZES[size] || SIZES.medium;
    var limit = Math.max(data.limit, 1);  // a limit of 0 would divide by zero below; nothing to draw either way
    var ns = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 " + dim.w + " " + dim.h);
    svg.setAttribute("width", dim.w);
    svg.setAttribute("height", dim.h);
    svg.style.display = "block";

    var gap = 2;
    var blockWidth = (dim.w - gap * (limit - 1)) / limit;
    var activeColor = "var(--success)";
    if (data.invertColors === true) {
      var ratio = data.current / limit;
      activeColor = ratio > 0.8 ? "var(--danger)" : ratio > 0.5 ? "var(--warning)" : "var(--fg)";
    }
    for (var i = 0; i < limit; i++) {
      var rect = document.createElementNS(ns, "rect");
      rect.setAttribute("x", i * (blockWidth + gap));
      rect.setAttribute("y", "0");
      rect.setAttribute("width", blockWidth);
      rect.setAttribute("height", dim.h);
      rect.setAttribute("rx", "2");
      if (i < data.current) {
        rect.setAttribute("fill", activeColor);
        rect.style.filter = "drop-shadow(0 0 2px " + activeColor + ")";
      } else {
        rect.setAttribute("fill", "var(--card-high)");
        rect.setAttribute("stroke", "var(--border)");
        rect.setAttribute("stroke-width", "1");
      }
      svg.appendChild(rect);
    }
    return svg;
  }

  window.Aion.charts.proportion = { create: create };
})();
