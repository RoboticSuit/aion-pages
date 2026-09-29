window.Aion = window.Aion || {};
window.Aion.charts = window.Aion.charts || {};

// A countdown/deadline ring: time remaining as a shrinking arc, distinct from chart_ring.js (which fills up) - this
// one depletes, and flips color as it gets close. Best for time remaining until a deadline or the next lecture.
// Data: {remaining, total, warningThreshold, dangerThreshold} (all in the same unit, e.g. hours or minutes).
// Sizes: small (32x32), medium (80x80), large (160x160).
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
    var radius = 50 - chosen.stroke / 2;
    var circum = 2 * Math.PI * radius;
    var ratio = Math.max(data.remaining / data.total, 0);
    var dashoffset = circum * (1 - ratio);

    var color = "var(--fg)";
    if (data.remaining <= data.dangerThreshold) { color = "var(--danger)"; }
    else if (data.remaining <= data.warningThreshold) { color = "var(--warning)"; }

    var track = document.createElementNS(ns, "circle");
    track.setAttribute("cx", 50);
    track.setAttribute("cy", 50);
    track.setAttribute("r", radius);
    track.setAttribute("fill", "none");
    track.setAttribute("stroke", "var(--card-high)");
    track.setAttribute("stroke-width", chosen.stroke);
    svg.appendChild(track);

    var arc = document.createElementNS(ns, "circle");
    arc.setAttribute("cx", 50);
    arc.setAttribute("cy", 50);
    arc.setAttribute("r", radius);
    arc.setAttribute("fill", "none");
    arc.setAttribute("stroke", color);
    arc.setAttribute("stroke-width", chosen.stroke);
    arc.setAttribute("stroke-dasharray", circum);
    arc.setAttribute("stroke-dashoffset", dashoffset);
    arc.setAttribute("stroke-linecap", "round");
    // Mirrors the arc vertically (around its own centre, via translate+scale) before the usual -90deg start
    // rotation, so it depletes counter-clockwise instead of chart_ring.js's clockwise fill - the one deliberate
    // visual difference between "counting down" and "filling up".
    arc.setAttribute("transform", "rotate(-90 50 50) scale(1, -1) translate(0, -100)");
    arc.style.filter = "drop-shadow(0 0 6px " + color + ")";
    svg.appendChild(arc);
    return svg;
  }

  window.Aion.charts.countdown = { create: create };
})();
