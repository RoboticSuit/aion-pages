window.Aion = window.Aion || {};
window.Aion.screens = window.Aion.screens || {};

(function () {
  "use strict";

  var API_BASE = "";
  // Read from app.css's own :root custom properties instead of a second hard-coded copy of the same colors -
  // these three theme Telegram's own native chrome (header/background/bottom-bar, the SecondaryButton color),
  // which cannot be styled with plain CSS, so this is the one place the theme still has to reach into JS.
  // Hard-coded fallbacks only matter if CSS somehow failed to load at all.
  function cssColor(name, fallback) {
    var value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return value !== "" ? value : fallback;
  }
  var COLOR_BG = cssColor("--bg", "#000000");
  var COLOR_FG = cssColor("--fg", "#00FF41");
  var COLOR_CARD = cssColor("--card", "#040804");
  var TAB_LABELS = { today: "Today", tasks: "Deadlines", events: "Events", routines: "Routines", lectures: "Lectures", courses: "Courses", deadlines: "Deadlines", habits: "Habits", home: "Home hours", stats: "Stats", config: "Config" };
  var statusEl = document.getElementById("status");
  // A scoped drawer arrives as a Direct Link start_param "<screen>_<mode>" (Telegram gives no query string).
  var startParam = window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initDataUnsafe
    ? window.Telegram.WebApp.initDataUnsafe.start_param : "";
  var startParts = (startParam || "").split("_");
  var params = new URLSearchParams(startParts[0]  // the id may itself contain "_" (a recurring event's instance id does)
    ? { screen: startParts[0], mode: startParts[1] || "", id: startParts.slice(2).join("_") } : window.location.search);
  var scopedScreen = params.get("screen");
  var isScoped = scopedScreen !== null;
  var stack = [scopedScreen || "today"];
  var stackData = [null];  // what each stack entry was opened with (a screen's own sub-view), so Back restores it

  function getInitData() {
    if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData) {
      return window.Telegram.WebApp.initData;
    }
    return "";
  }

  function apiFetch(path, options) {
    var initData = getInitData();
    var headers = Object.assign({}, (options && options.headers) || {}, { "X-Telegram-Init-Data": initData });
    return fetch(API_BASE + path, Object.assign({}, options, { headers: headers }));
  }

  function apiJson(path, method, body) {
    var options = { method: method, headers: {} };
    if (body !== undefined) {
      options.headers["Content-Type"] = "application/json";
      options.body = JSON.stringify(body);
    }
    return apiFetch(path, options).then(function (response) {
      return response.json().then(function (parsed) {
        if (!response.ok) { throw new Error(parsed.error || ("request failed: " + response.status)); }
        return parsed;
      });
    });
  }

  function setStatus(text, isError) {
    statusEl.textContent = text;
    statusEl.className = isError ? "error" : "";
  }

  function haptic(kind, style) {
    if (!(window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.HapticFeedback)) { return; }
    var feedback = window.Telegram.WebApp.HapticFeedback;
    if (kind === "success" || kind === "error" || kind === "warning") { feedback.notificationOccurred(kind); }
    else if (kind === "impact") { feedback.impactOccurred(style || "light"); }
    else if (kind === "selection") { feedback.selectionChanged(); }
  }

  function hideMainButton() {
    if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.MainButton) {
      window.Telegram.WebApp.MainButton.hide();
    }
  }

  function hideSecondaryButton() {
    if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.SecondaryButton) {
      window.Telegram.WebApp.SecondaryButton.hide();
    }
  }

  // What fits in Telegram's own controls (mirrors bot/ui_limits.py). Telegram's documented caps are larger (a popup message
  // 256, a popup button 64) but the text is cut with "..." on a phone well before that, so text is written to fit.
  var BOTTOM_BUTTON_FIT = 24;
  var POPUP_BUTTON_FIT = 24;
  var POPUP_MESSAGE_MAX = 256;

  // text unchanged if it fits; otherwise shortened to `limit` characters ending in one ellipsis, keeping the start
  // (or, with keepEnd, the start and the last keepEnd characters - a question's ending matters in a popup).
  function fit(text, limit, keepEnd) {
    text = String(text);
    if (text.length <= limit) { return text; }
    if (keepEnd && limit > keepEnd + 2) {
      return text.slice(0, limit - keepEnd - 1).replace(/\s+$/, "") + "…" + text.slice(text.length - keepEnd);
    }
    return text.slice(0, limit - 1).replace(/\s+$/, "") + "…";
  }

  function mainButton(text, onClick) {
    if (!(window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.MainButton)) { return null; }
    var button = window.Telegram.WebApp.MainButton;
    if (button._aionHandler) { button.offClick(button._aionHandler); }
    button._aionHandler = onClick;
    button.setParams({ text: fit(text, BOTTOM_BUTTON_FIT), color: COLOR_FG, text_color: COLOR_BG });
    button.onClick(onClick);
    button.show();
    return button;
  }

  function secondaryButton(text, onClick) {
    if (!(window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.SecondaryButton)) { return null; }
    var button = window.Telegram.WebApp.SecondaryButton;
    if (button._aionHandler) { button.offClick(button._aionHandler); }
    button._aionHandler = onClick;
    button.setParams({ text: fit(text, BOTTOM_BUTTON_FIT), color: COLOR_CARD, text_color: COLOR_FG });
    button.onClick(onClick);
    button.show();
    return button;
  }

  // Five top-level tabs; each groups the screens that belong together, switched by a small bar under the tabs. The screens
  // keep their own names, so every scoped drawer (screen=events, mode=create ...) still opens exactly as before.
  var GROUPS = [
    { tab: "today", screens: ["today", "stats"], labels: ["Today", "Stats"] },
    { tab: "schedule", screens: ["events", "routines", "lectures"], labels: ["Events", "Routines", "Lectures"] },
    { tab: "tasks", screens: ["tasks"], labels: ["Deadlines"] },
    { tab: "habits", screens: ["habits"], labels: ["Habits"] },
    { tab: "config", screens: ["config", "home", "courses"], labels: ["Settings", "Home hours", "Courses"] }
  ];
  var lastScreen = {};  // the screen last open in each group, so switching tabs comes back to where you were

  function groupOf(screenName) {
    return GROUPS.filter(function (group) { return group.screens.indexOf(screenName) !== -1; })[0] || null;
  }

  function renderSubnav(group) {
    var bar = document.getElementById("subnav");
    if (!bar) { return; }
    bar.innerHTML = "";
    var visible = !isScoped && group !== null && group.screens.length > 1 && stack.length === 1;
    bar.hidden = !visible;
    if (!visible) { return; }
    group.screens.forEach(function (name, index) {
      var chip = document.createElement("button");
      chip.type = "button";
      chip.className = "chip" + (name === stack[0] ? " selected" : "");
      chip.textContent = group.labels[index];
      chip.addEventListener("click", function () { showTab(name); });
      bar.appendChild(chip);
    });
  }

  function render() {
    var top = stack[stack.length - 1];
    var group = groupOf(stack[0]);
    if (group !== null) { lastScreen[group.tab] = stack[0]; }
    Array.prototype.forEach.call(document.querySelectorAll("nav#tabs button"), function (button) {
      button.classList.toggle("active", group !== null && button.getAttribute("data-tab") === group.tab);
    });
    renderSubnav(group);
    Array.prototype.forEach.call(document.querySelectorAll("section[id^='screen-']"), function (section) {
      section.hidden = section.id !== "screen-" + top;
    });
    document.getElementById("tabLabel").textContent = TAB_LABELS[top] || top;
    if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.BackButton) {
      if (stack.length > 1) { window.Telegram.WebApp.BackButton.show(); }
      else { window.Telegram.WebApp.BackButton.hide(); }
    }
    hideMainButton();
    hideSecondaryButton();
    var screen = window.Aion.screens[top];
    if (screen && typeof screen.load === "function") { screen.load(stackData[stackData.length - 1]); }
  }

  // A destructive action asks first, in Telegram's own native popup (its "destructive" button style).
  function confirmDestructive(message, actionLabel, onConfirm) {
    var app = window.Telegram && window.Telegram.WebApp;
    if (!app || typeof app.showPopup !== "function") { onConfirm(); return; }
    app.showPopup({
      message: fit(message, POPUP_MESSAGE_MAX, 40),
      buttons: [{ id: "go", type: "destructive", text: fit(actionLabel, POPUP_BUTTON_FIT) }, { id: "no", type: "cancel" }]
    }, function (buttonId) { if (buttonId === "go") { onConfirm(); } });
  }

  function finishProcedure(message) {
    setStatus(message || "Done.", false);
    if (isScoped && window.Telegram && window.Telegram.WebApp) {
      window.setTimeout(function () { window.Telegram.WebApp.close(); }, 700);
    }
  }

  function showTab(tab) {
    stack = [tab];
    stackData = [null];
    render();
  }

  function push(screenName, data) {
    stack.push(screenName);
    stackData.push(data === undefined ? null : data);
    render();
  }

  function pop() {
    if (stack.length > 1) {
      stack.pop();
      stackData.pop();
      render();
    }
  }

  if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.BackButton) {
    window.Telegram.WebApp.BackButton.onClick(pop);
  }

  Array.prototype.forEach.call(document.querySelectorAll("nav#tabs button"), function (tabButton) {
    tabButton.addEventListener("click", function () {
      var tab = tabButton.getAttribute("data-tab");
      var group = GROUPS.filter(function (candidate) { return candidate.tab === tab; })[0];
      showTab(lastScreen[tab] || group.screens[0]);
    });
  });

  window.Aion.api = apiJson;
  window.Aion.setStatus = setStatus;
  window.Aion.haptic = haptic;
  window.Aion.mainButton = mainButton;
  window.Aion.secondaryButton = secondaryButton;
  window.Aion.hideMainButton = hideMainButton;
  window.Aion.hideSecondaryButton = hideSecondaryButton;
  window.Aion.getInitData = getInitData;
  window.Aion.push = push;
  window.Aion.pop = pop;
  window.Aion.canGoBack = function () { return stack.length > 1; };
  window.Aion.params = params;
  window.Aion.isScoped = isScoped;
  window.Aion.finishProcedure = finishProcedure;
  window.Aion.confirmDestructive = confirmDestructive;
  window.Aion.fit = fit;
  // A line of small facts under a card's title ("30 min", "once a day", "needs me home"). Each is its own tag, so a narrow
  // screen wraps between facts and never in the middle of one.
  window.Aion.tags = function (items) {
    var box = document.createElement("div");
    box.className = "due";
    items.filter(function (item) { return item !== "" && item !== null && item !== undefined; }).forEach(function (item) {
      var tag = document.createElement("span");
      tag.className = "tag";
      tag.textContent = item;
      box.appendChild(tag);
    });
    return box;
  };

  if (isScoped) {
    // A contextual drawer for one procedure: no tab bar, no wandering into other screens -
    // exactly the configuration of the thing the user just started, nothing else.
    var tabsEl = document.getElementById("tabs");
    if (tabsEl) { tabsEl.hidden = true; }
    var subnavEl = document.getElementById("subnav");
    if (subnavEl) { subnavEl.hidden = true; }
    var footerEl = document.querySelector("footer");
    if (footerEl) { footerEl.hidden = true; }
  }

  if (window.Telegram && window.Telegram.WebApp) {
    var tg = window.Telegram.WebApp;
    tg.ready();
    // Deliberately no expand() here: Telegram opens a Mini App as a partial-height
    // bottom-sheet "drawer" by default - forcing full height would defeat that.
    if (typeof tg.setHeaderColor === "function") { tg.setHeaderColor(COLOR_BG); }
    if (typeof tg.setBackgroundColor === "function") { tg.setBackgroundColor(COLOR_BG); }
    if (typeof tg.setBottomBarColor === "function") { tg.setBottomBarColor(COLOR_BG); }
  }
  // Shared components (window.Aion.ui) live in their own file, added here because index.html is never edited. A failed
  // load still lets the app start: screens that want the components check window.Aion.ui first.
  function loadScript(path) {
    return new Promise(function (resolve) {
      var script = document.createElement("script");
      script.src = path;
      script.addEventListener("load", function () { resolve(true); });
      script.addEventListener("error", function () { resolve(false); });
      document.head.appendChild(script);
    });
  }
  // The People and places screen needs those components, so it loads after them (it adds its own section to the page).
  window.Aion.uiReady = loadScript("/app/screens/pickers.js?v=2").then(function () { return loadScript("/app/screens/people.js?v=1"); })
    .then(function () { return loadScript("/app/screens/date_picker.js?v=1"); })
    .then(function () { return loadScript("/app/screens/time_picker.js?v=1"); });

  // The chart component library (bot/miniapp/charts/) is loaded on demand, one chart type at a time, wherever a
  // screen actually needs one - never all twelve on every page load. window.Aion.charts.<name> only exists once the
  // matching loadChart(name) promise has resolved; each name is only ever fetched once per session (cached here).
  var CHART_FILES = {
    ring: "chart_ring.js", proportion: "chart_proportion.js", heatmap: "chart_heatmap.js",
    sparkline: "chart_sparkline.js", stackedBar: "chart_stacked_bar.js", bullet: "chart_bullet.js",
    dayTimeline: "chart_day_timeline.js", monthGrid: "chart_month_grid.js", radar: "chart_radar.js",
    groupedBar: "chart_grouped_bar.js", countdown: "chart_countdown.js", dotMatrix: "chart_dot_matrix.js"
  };
  var chartLoads = {};
  window.Aion.loadChart = function (name) {
    if (chartLoads[name] === undefined) {
      var file = CHART_FILES[name];
      chartLoads[name] = file === undefined ? Promise.resolve(false) : loadScript("/app/charts/" + file + "?v=1");
    }
    return chartLoads[name];
  };

  if (getInitData() === "") {
    setStatus("Open this from the Aion:\\Trinity bot in Telegram - it did not load with real Telegram data.", true);
  } else {
    // Not before "load": the screens/*.js files are separate scripts that run after this one, so an
    // immediate render() would find no screen to load and every screen would sit on "Loading..." forever.
    // And not before the shared components have loaded (or failed), so a screen's first load() can use them.
    window.addEventListener("load", function () { window.Aion.uiReady.then(render); });
  }
})();
