window.Aion = window.Aion || {};
window.Aion.charts = window.Aion.charts || {};

// A progress ring/donut: how much of `max` is reached, as a filling circular arc. Best for daily task completion %,
// a single habit's success rate, or the sleep goal's percentage. Standalone, loaded on demand wherever it is needed
// (window.Aion.loadScript("/app/charts/chart_ring.js")), same as pickers.js/people.js already are.
// Data: {current, max, label?, color?}. Sizes: small (32x32, inline next to text, no label drawn), medium (80x80,
// a card's own hero), large (160x160, a future dashboard).
// Governed by Authadia REF_IDs SYN_001 and SYN_003.
(function () {
  "use strict";

  var SIZES = { small: { dim: 32, stroke: 3 }, medium: { dim: 80, stroke: 6 }, large: { dim: 160, stroke: 10 } };

  function create(data, size) {
    var chosen = SIZES[size] || SIZES.medium;
    var ns = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 100 100");
    svg.setAttribute("width", chosen.dim);
    svg.setAttribute("height", chosen.dim);
    svg.style.display = "block";
    var center = 50;
    var radius = 50 - chosen.stroke / 2;
    var circumference = 2 * Math.PI * radius;
    var fillPercent = Math.min(Math.max(data.current / data.max, 0), 1);
    var dashoffset = circumference * (1 - fillPercent);
    var color = data.color || "var(--fg)";

    var track = document.createElementNS(ns, "circle");
    track.setAttribute("cx", center);
    track.setAttribute("cy", center);
    track.setAttribute("r", radius);
    track.setAttribute("fill", "none");
    track.setAttribute("stroke", "var(--border)");
    track.setAttribute("stroke-width", chosen.stroke);
    svg.appendChild(track);

    var progress = document.createElementNS(ns, "circle");
    progress.setAttribute("cx", center);
    progress.setAttribute("cy", center);
    progress.setAttribute("r", radius);
    progress.setAttribute("fill", "none");
    progress.setAttribute("stroke", color);
    progress.setAttribute("stroke-width", chosen.stroke);
    progress.setAttribute("stroke-dasharray", circumference);
    progress.setAttribute("stroke-dashoffset", dashoffset);
    progress.setAttribute("stroke-linecap", "round");
    progress.setAttribute("transform", "rotate(-90 50 50)");
    progress.style.filter = "drop-shadow(0 0 4px " + color + ")";
    svg.appendChild(progress);

    if (data.label && size !== "small") {
      var text = document.createElementNS(ns, "text");
      text.setAttribute("x", "50");
      text.setAttribute("y", "50");
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("dominant-baseline", "central");
      text.setAttribute("fill", "var(--fg)");
      text.setAttribute("font-family", "inherit");
      text.setAttribute("font-size", size === "large" ? "18px" : "14px");
      text.textContent = data.label;
      svg.appendChild(text);
    }
    return svg;
  }

  window.Aion.charts.ring = { create: create };
})();
