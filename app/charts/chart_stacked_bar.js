window.Aion = window.Aion || {};
window.Aion.charts = window.Aion.charts || {};

// A continuous stacked bar: one bar split proportionally across categories. Best for work-block time allocation
// across courses/tasks in a single day. Data: an array of {value, color}. Sizes: small (120x10), medium (240x16),
// large (340x24).
// Governed by Authadia REF_IDs SYN_001 and SYN_003.
(function () {
  "use strict";

  var SIZES = { small: { w: 120, h: 10 }, medium: { w: 240, h: 16 }, large: { w: 340, h: 24 } };

  function create(data, size) {
    var dim = SIZES[size] || SIZES.medium;
    var ns = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 " + dim.w + " " + dim.h);
    svg.setAttribute("width", dim.w);
    svg.setAttribute("height", dim.h);

    var total = 0;
    for (var t = 0; t < data.length; t++) { total += data[t].value; }
    if (total === 0) { total = 1; }

    var bg = document.createElementNS(ns, "rect");
    bg.setAttribute("width", dim.w);
    bg.setAttribute("height", dim.h);
    bg.setAttribute("fill", "var(--card-elevated)");
    svg.appendChild(bg);

    var currentX = 0;
    data.forEach(function (segment) {
      var segWidth = (segment.value / total) * dim.w;
      if (segWidth <= 0) { return; }
      var rect = document.createElementNS(ns, "rect");
      rect.setAttribute("x", currentX);
      rect.setAttribute("y", "0");
      rect.setAttribute("width", segWidth);
      rect.setAttribute("height", dim.h);
      rect.setAttribute("fill", segment.color);
      rect.setAttribute("stroke", "var(--bg)");
      rect.setAttribute("stroke-width", "1");
      svg.appendChild(rect);
      currentX += segWidth;
    });
    return svg;
  }

  window.Aion.charts.stackedBar = { create: create };
})();
