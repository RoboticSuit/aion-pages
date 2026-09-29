window.Aion = window.Aion || {};
window.Aion.charts = window.Aion.charts || {};

// A sparkline/trend line: a value over recent time as one simple filled line. Best for punctuality (minutes late per
// trip over the last month) or sleep duration over the last two weeks.
// Data: a plain array of numbers, oldest first. Sizes: small (behind a number), medium (a standard card graph),
// large (a hero view). Grounds the fill to zero, so a negative value (e.g. "early" as a negative lateness) still
// reads clearly below the baseline.
// Governed by Authadia REF_IDs SYN_001 and SYN_003.
(function () {
  "use strict";

  var SIZES = { small: { w: 80, h: 24 }, medium: { w: 160, h: 48 }, large: { w: 320, h: 80 } };

  function create(data, size, colorToken) {
    var color = colorToken || "var(--fg)";
    if (!data || data.length < 2) { return document.createElement("div"); }
    var dim = SIZES[size] || SIZES.medium;
    var max = Math.max.apply(null, data);
    var min = Math.min.apply(null, data.concat([0]));
    var range = max - min || 1;
    var ns = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 " + dim.w + " " + dim.h);
    svg.setAttribute("width", dim.w);
    svg.setAttribute("height", dim.h);
    svg.style.overflow = "visible";
    var stepX = dim.w / (data.length - 1);

    var lineD = "";
    var areaD = "";
    data.forEach(function (val, i) {
      var x = i * stepX;
      var y = dim.h - ((val - min) / range) * (dim.h - 4) - 2;
      var prefix = i === 0 ? "M" : "L";
      lineD += prefix + " " + x + " " + y + " ";
      areaD += (i === 0 ? "M " + x + " " + dim.h + " L " + x + " " + y + " " : "L " + x + " " + y + " ");
    });
    areaD += "L " + dim.w + " " + dim.h + " Z";

    var area = document.createElementNS(ns, "path");
    area.setAttribute("d", areaD);
    area.setAttribute("fill", color);
    area.setAttribute("opacity", "0.15");
    svg.appendChild(area);

    var line = document.createElementNS(ns, "path");
    line.setAttribute("d", lineD);
    line.setAttribute("fill", "none");
    line.setAttribute("stroke", color);
    line.setAttribute("stroke-width", "2");
    line.setAttribute("stroke-linecap", "round");
    line.setAttribute("stroke-linejoin", "round");
    line.style.filter = "drop-shadow(0 2px 4px " + color + ")";
    svg.appendChild(line);
    return svg;
  }

  window.Aion.charts.sparkline = { create: create };
})();
