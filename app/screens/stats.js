window.Aion = window.Aion || {};
window.Aion.screens = window.Aion.screens || {};

(function () {
  "use strict";

  // Stats: the bot's own stats text (one source for chat and app), laid out as the same cards and chips as every other
  // screen. The text has a title line, then either loose "label: value" lines or a heading line followed by indented rows;
  // a row is "label  value" (two or more spaces between).
  var STATS_VIEWS = ["absences", "attendance", "deadlines", "tasks", "week", "habits", "sleep", "punctuality"];
  var statsViewsEl, statsBodyEl, currentView = "week", built = false;

  function element(tag, className, text) {
    var node = document.createElement(tag);
    if (className) { node.className = className; }
    if (text !== undefined) { node.textContent = text; }
    return node;
  }

  function isRow(line) { return /^\s{2,}\S/.test(line); }

  function rowNode(line) {
    var row = element("div", "stat-row");
    var text = line.trim();
    var split = /^(.*?\S)\s{2,}(\S.*)$/.exec(text);
    if (split === null) { split = /^([^:]+):\s+(\S.*)$/.exec(text); }
    if (split === null) { row.appendChild(element("span", "stat-label", text)); return row; }
    row.appendChild(element("span", "stat-label", split[1]));
    row.appendChild(element("span", "tag", split[2]));
    return row;
  }

  function render(text) {
    statsBodyEl.innerHTML = "";
    var lines = String(text).split("\n").filter(function (line) { return line.trim() !== ""; });
    if (lines.length === 0) { return; }
    var head = /^(.*?)\.\s+(\S.*)$/.exec(lines[0]);
    var title = element("div", "title", head ? head[1] : lines[0]);
    statsBodyEl.appendChild(title);
    if (head) { statsBodyEl.appendChild(element("div", "due", head[2])); }
    var rest = lines.slice(1), card = null, loose = null;
    rest.forEach(function (line, index) {
      if (isRow(line)) {
        if (card === null) { card = element("div", "stat-card"); statsBodyEl.appendChild(card); }
        card.appendChild(rowNode(line));
        return;
      }
      var next = rest[index + 1];
      if (next !== undefined && isRow(next)) {
        card = element("div", "stat-card");
        card.appendChild(element("div", "card-title", line.trim()));
        statsBodyEl.appendChild(card);
        loose = null;
        return;
      }
      if (loose === null) { loose = element("div", "stat-card"); statsBodyEl.appendChild(loose); }
      loose.appendChild(rowNode(line));
      card = null;
    });
    if (rest.length === 1 && /^Nothing/.test(rest[0])) {
      statsBodyEl.innerHTML = "";
      statsBodyEl.appendChild(title);
      statsBodyEl.appendChild(element("div", "stat-empty", rest[0]));
    }
  }

  // Chart cards, shown above the plain-text detail (progressive disclosure: the visual summary first, the same full
  // text still underneath, nothing removed or replaced). Not every view has chart_data yet - the response says so
  // plainly (chart_data is null, never guessed at from the text), and only "absences" does today.
  var CHART_RENDERERS = {
    absences: function (rows, container) {
      return window.Aion.loadChart("proportion").then(function () { return window.Aion.loadChart("ring"); }).then(function () {
        rows.forEach(function (row) {
          if (row.limit === null) { return; }  // nothing to chart against with no known limit
          var card = element("div", "stat-card");
          var head = element("div", "card-title", row.code + (row.name ? "  " + row.name : ""));
          card.appendChild(head);
          var line = element("div", "due");
          line.appendChild(window.Aion.charts.proportion.create({ current: row.absent, limit: row.limit, invertColors: true }, "medium"));
          if (row.rate !== null) {
            line.appendChild(window.Aion.charts.ring.create({ current: row.rate, max: 100, label: row.rate + "%" }, "medium"));
          }
          card.appendChild(line);
          container.appendChild(card);
        });
      });
    },
    attendance: function (rows, container) {
      return window.Aion.loadChart("ring").then(function () {
        rows.forEach(function (row) {
          var card = element("div", "stat-card");
          var head = element("div", "card-title", row.code + (row.name ? "  " + row.name : ""));
          card.appendChild(head);
          var line = element("div", "due");
          line.appendChild(window.Aion.charts.ring.create({ current: row.rate, max: 100, label: row.rate + "%" }, "medium"));
          card.appendChild(line);
          container.appendChild(card);
        });
      });
    },
    tasks: function (rows, container) {
      return window.Aion.loadChart("proportion").then(function () {
        rows.forEach(function (row) {
          var card = element("div", "stat-card");
          var head = element("div", "card-title", row.title);
          card.appendChild(head);
          var line = element("div", "due");
          line.appendChild(window.Aion.charts.proportion.create({ current: row.done, limit: row.total }, "medium"));
          card.appendChild(line);
          container.appendChild(card);
        });
      });
    },
    week: function (data, container) {
      return window.Aion.loadChart("bullet").then(function () {
        container.appendChild(window.Aion.charts.bullet.create({ actual: data.actual, target: data.target }, "large"));
      });
    },
    habits: function (rows, container) {
      return window.Aion.loadChart("stackedBar").then(function () {
        container.appendChild(window.Aion.charts.stackedBar.create(rows, "large"));
      });
    },
    sleep: function (values, container) {
      return window.Aion.loadChart("sparkline").then(function () {
        container.appendChild(window.Aion.charts.sparkline.create(values, "large"));
      });
    },
    punctuality: function (values, container) {
      return window.Aion.loadChart("sparkline").then(function () {
        container.appendChild(window.Aion.charts.sparkline.create(values, "large"));
      });
    }
  };

  function renderCharts(view, data) {
    var renderer = CHART_RENDERERS[view];
    if (renderer === undefined || data === null || data.length === 0) { return Promise.resolve(); }
    // render(text) already cleared and rebuilt statsBodyEl by the time this runs - the chart card goes in as the
    // first child, so the visual summary sits above the same full text detail, never replacing it.
    var container = element("div", "stat-card");
    container.id = "stats-charts";
    statsBodyEl.insertBefore(container, statsBodyEl.firstChild);
    return renderer(data, container);
  }

  function loadView(view) {
    currentView = view;
    window.Aion.setStatus("Loading...");
    window.Aion.api("/api/stats/" + view, "GET")
      .then(function (body) {
        window.Aion.setStatus("");
        render(body.text);
        return renderCharts(view, body.chart_data);
      })
      .catch(function (error) { window.Aion.setStatus("Could not load that view: " + error.message, true); });
  }

  function build() {
    statsViewsEl = document.getElementById("stats-views");
    statsBodyEl = document.getElementById("stats-body");
    STATS_VIEWS.forEach(function (view) {
      var button = element("button", "chip" + (view === currentView ? " selected" : ""), view.charAt(0).toUpperCase() + view.slice(1));
      button.type = "button";
      button.addEventListener("click", function () {
        Array.prototype.forEach.call(statsViewsEl.children, function (child) { child.classList.remove("selected"); });
        button.classList.add("selected");
        loadView(view);
      });
      statsViewsEl.appendChild(button);
    });
    built = true;
  }

  function load() {
    if (!built) { build(); }
    loadView(currentView);
  }

  window.Aion.screens.stats = { load: load };
})();
