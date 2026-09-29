window.Aion = window.Aion || {};
window.Aion.charts = window.Aion.charts || {};

// A radar/spider chart: several independent metrics compared on one small chart at once. Best for this week's
// on-time rate across several different courses, or several habits' consistency side by side. Data: an array of
// {value, max}, at least 3 entries (one per axis, in the order they should appear around the circle). Sizes:
// medium (120x120), large (200x200).
// Governed by Authadia REF_IDs SYN_001 and SYN_003.
(function () {
  "use strict";

  var DIMS = { medium: 120, large: 200 };

  function create(data, size) {
    var dim = DIMS[size] || DIMS.medium;
    var center = dim / 2;
    var radius = dim / 2 - 4;
    var ns = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 " + dim + " " + dim);
    svg.setAttribute("width", dim);
    svg.setAttribute("height", dim);

    var sides = data.length;
    var angleStep = (Math.PI * 2) / sides;

    for (var level = 1; level <= 3; level++) {
      var levelRadius = radius * (level / 3);
      var points = "";
      for (var i = 0; i < sides; i++) {
        var a = i * angleStep - Math.PI / 2;
        points += (center + Math.cos(a) * levelRadius) + "," + (center + Math.sin(a) * levelRadius) + " ";
        if (level === 3) {
          var spoke = document.createElementNS(ns, "line");
          spoke.setAttribute("x1", center);
          spoke.setAttribute("y1", center);
          spoke.setAttribute("x2", center + Math.cos(a) * radius);
          spoke.setAttribute("y2", center + Math.sin(a) * radius);
          spoke.setAttribute("stroke", "var(--border)");
          svg.appendChild(spoke);
        }
      }
      var poly = document.createElementNS(ns, "polygon");
      poly.setAttribute("points", points.trim());
      poly.setAttribute("fill", "none");
      poly.setAttribute("stroke", "var(--border)");
      svg.appendChild(poly);
    }

    var dataPoints = "";
    for (var j = 0; j < sides; j++) {
      var angle = j * angleStep - Math.PI / 2;
      var ratio = Math.min(Math.max(data[j].value / data[j].max, 0), 1);
      var valRadius = radius * ratio;
      dataPoints += (center + Math.cos(angle) * valRadius) + "," + (center + Math.sin(angle) * valRadius) + " ";
    }
    var dataPoly = document.createElementNS(ns, "polygon");
    dataPoly.setAttribute("points", dataPoints.trim());
    dataPoly.setAttribute("fill", "rgba(0, 153, 255, 0.2)");
    dataPoly.setAttribute("stroke", "var(--success)");
    dataPoly.setAttribute("stroke-width", "2");
    dataPoly.style.filter = "drop-shadow(0 0 4px var(--success))";
    svg.appendChild(dataPoly);
    return svg;
  }

  window.Aion.charts.radar = { create: create };
})();
