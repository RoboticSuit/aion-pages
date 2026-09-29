window.Aion = window.Aion || {};
window.Aion.charts = window.Aion.charts || {};

// A day-timeline bar: one whole day mapped left-to-right as colored blocks against real clock hours - "what does
// today actually look like at a glance." Data: an array of {startHour, duration, color} (hours 0-24, e.g. 14.5 is
// 2:30 PM). Sizes: medium (240x24, a card header), large (340x32, a dashboard hero).
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

    var track = document.createElementNS(ns, "rect");
    track.setAttribute("width", dim.w);
    track.setAttribute("height", dim.h);
    track.setAttribute("fill", "var(--card-elevated)");
    track.setAttribute("rx", "4");
    svg.appendChild(track);

    for (var i = 1; i <= 3; i++) {
      var tick = document.createElementNS(ns, "line");
      var tx = (i * 6 / 24) * dim.w;
      tick.setAttribute("x1", tx);
      tick.setAttribute("y1", "0");
      tick.setAttribute("x2", tx);
      tick.setAttribute("y2", dim.h);
      tick.setAttribute("stroke", "var(--border)");
      tick.setAttribute("stroke-width", "1");
      svg.appendChild(tick);
    }

    data.forEach(function (block) {
      var x = (block.startHour / 24) * dim.w;
      var w = (block.duration / 24) * dim.w;
      if (w <= 0) { return; }
      var color = block.color || "var(--fg)";
      var rect = document.createElementNS(ns, "rect");
      rect.setAttribute("x", x);
      rect.setAttribute("y", "2");
      rect.setAttribute("width", w);
      rect.setAttribute("height", dim.h - 4);
      rect.setAttribute("fill", color);
      rect.setAttribute("rx", "2");
      rect.style.filter = "drop-shadow(0 0 2px " + color + ")";
      svg.appendChild(rect);
    });
    return svg;
  }

  window.Aion.charts.dayTimeline = { create: create };
})();
