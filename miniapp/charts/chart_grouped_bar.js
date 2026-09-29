window.Aion = window.Aion || {};
window.Aion.charts = window.Aion.charts || {};

// A grouped/comparison bar chart: several categories side by side, each with one or more bars - e.g. absence count
// per course, all at once, not one at a time. Data: {max, groups} where groups is an array of arrays of
// {value, color} (one inner array per category/group). Sizes: medium (200x100), large (340x160).
// Governed by Authadia REF_IDs SYN_001 and SYN_003.
(function () {
  "use strict";

  var SIZES = { medium: { w: 200, h: 100 }, large: { w: 340, h: 160 } };

  function create(data, size) {
    var dim = SIZES[size] || SIZES.medium;
    var ns = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 " + dim.w + " " + dim.h);
    svg.setAttribute("width", dim.w);
    svg.setAttribute("height", dim.h);

    var groupCount = data.groups.length;
    if (groupCount === 0) { return svg; }
    var groupWidth = dim.w / groupCount;
    var padding = groupWidth * 0.2;
    var availableGroupW = groupWidth - padding;

    data.groups.forEach(function (group, gIndex) {
      var barsInGroup = group.length;
      var barWidth = availableGroupW / barsInGroup;
      var startX = gIndex * groupWidth + padding / 2;
      group.forEach(function (bar, bIndex) {
        var ratio = Math.min(bar.value / data.max, 1);
        var barH = ratio * dim.h;
        var y = dim.h - barH;
        var x = startX + bIndex * barWidth;
        var rect = document.createElementNS(ns, "rect");
        rect.setAttribute("x", x);
        rect.setAttribute("y", barH <= 0 ? dim.h - 2 : y);
        rect.setAttribute("width", barWidth - 1);
        rect.setAttribute("height", barH <= 0 ? 2 : barH);
        rect.setAttribute("fill", bar.color || "var(--fg)");
        rect.setAttribute("rx", "2");
        svg.appendChild(rect);
      });
    });
    return svg;
  }

  window.Aion.charts.groupedBar = { create: create };
})();
