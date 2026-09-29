window.Aion = window.Aion || {};
window.Aion.charts = window.Aion.charts || {};

// A bullet target gauge: an actual value against a target marker, on one bar. Best for the sleep goal (a target
// duration, with the actual last night's duration as the bar and a marker at the goal). Data: {actual, target, max?}
// (max defaults to a padded value above whichever of actual/target is larger). Sizes: medium (240x24), large
// (340x32) - too fine-grained to read at a "small" size, so only these two are offered.
// Governed by Authadia REF_IDs SYN_001 and SYN_003.
(function () {
  "use strict";

  var SIZES = { medium: { w: 240, h: 24 }, large: { w: 340, h: 32 } };

  function create(data, size) {
    var dim = SIZES[size] || SIZES.medium;
    var ns = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 " + dim.w + " " + dim.h);
    svg.setAttribute("width", dim.w);
    svg.setAttribute("height", dim.h);
    var maxValue = data.max || Math.max(data.target, data.actual) * 1.2;
    var scale = dim.w / maxValue;

    var bg = document.createElementNS(ns, "rect");
    bg.setAttribute("width", dim.w);
    bg.setAttribute("height", dim.h);
    bg.setAttribute("fill", "var(--card-high)");
    bg.setAttribute("rx", "4");
    svg.appendChild(bg);

    var barH = dim.h * 0.4;
    var barY = (dim.h - barH) / 2;
    var actualBar = document.createElementNS(ns, "rect");
    actualBar.setAttribute("x", "0");
    actualBar.setAttribute("y", barY);
    actualBar.setAttribute("width", Math.min(data.actual * scale, dim.w));
    actualBar.setAttribute("height", barH);
    actualBar.setAttribute("fill", data.actual >= data.target ? "var(--success)" : "var(--fg)");
    actualBar.setAttribute("rx", "2");
    svg.appendChild(actualBar);

    var targetX = Math.min(data.target * scale, dim.w - 2);
    var marker = document.createElementNS(ns, "rect");
    marker.setAttribute("x", targetX);
    marker.setAttribute("y", "2");
    marker.setAttribute("width", "3");
    marker.setAttribute("height", dim.h - 4);
    marker.setAttribute("fill", "var(--warning)");
    marker.setAttribute("rx", "1");
    marker.style.filter = "drop-shadow(0 0 4px var(--warning))";
    svg.appendChild(marker);
    return svg;
  }

  window.Aion.charts.bullet = { create: create };
})();
