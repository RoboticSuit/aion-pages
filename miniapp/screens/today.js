window.Aion = window.Aion || {};
window.Aion.screens = window.Aion.screens || {};

(function () {
  "use strict";

  // Today: the landing screen. Today's events with their status (a lecture gets Present / Absent until it is answered) and
  // the deadlines due soon with a Done button. It reads /api/today and writes through the same endpoints the other screens use.
  var viewEl;
  var pendingNote = "";

  function api() { return window.Aion.api.apply(null, arguments); }
  function status(text, isError) { window.Aion.setStatus(text, isError); }

  function element(tag, className, text) {
    var node = document.createElement(tag);
    if (className) { node.className = className; }
    if (text !== undefined) { node.textContent = text; }
    return node;
  }

  function actionButton(label, className, onClick) {
    var button = element("button", className, label);
    button.type = "button";
    button.addEventListener("click", onClick);
    return button;
  }

  function clock(iso) { return iso.slice(11, 16); }

  // A lecture's place is its room; any other event shows its place as typed.
  function placeLabel(event) {
    if (event.location === "") { return ""; }
    if (event.type === "lecture") { return "room " + event.location; }
    return event.location;
  }

  function dueLabel(item) {
    if (item.days_left < 0) { return "overdue by " + (-item.days_left) + (item.days_left === -1 ? " day" : " days"); }
    if (item.days_left === 0) { return "due today"; }
    if (item.days_left === 1) { return "due tomorrow"; }
    return "due in " + item.days_left + " days";
  }

  function pill(text, tone) { return element("span", "pill " + (tone || ""), text); }

  function record(event, outcome) {
    api("/api/attendance/" + event.id, "POST", { status: outcome })
      .then(function (result) {
        window.Aion.haptic("success");
        var note = outcome === "absent"
          ? "Absent. " + result.used + (result.limit === null ? " absences so far, limit unknown." : " of " + result.limit + " absences used.")
          : "Present.";
        if (result.mark_error) { note += " (The calendar title was not updated: " + result.mark_error + ")"; }
        pendingNote = note;
        load();
      })
      .catch(function (error) { status("Could not record it: " + error.message, true); });
  }

  function setDone(event, done) {
    api("/api/today/done", "POST", { event_id: event.id, done: done })
      .then(function () { window.Aion.haptic("success"); pendingNote = done ? "Marked done: " + event.title : "Reopened: " + event.title; load(); })
      .catch(function (error) { status("Could not change it: " + error.message, true); });
  }

  function complete(item) {
    api("/api/tasks/" + item.id + "/done", "POST", {})
      .then(function () { window.Aion.haptic("success"); pendingNote = "Marked done: " + item.title; load(); })
      .catch(function (error) { status("Could not mark it done: " + error.message, true); });
  }

  function render(body) {
    viewEl.innerHTML = "";
    var when = new Date(body.day + "T12:00:00");
    viewEl.appendChild(element("div", "title", when.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" })));

    var events = element("ul");
    if (body.events.length === 0) { viewEl.appendChild(element("div", "due", "Nothing on the calendar today.")); }
    body.events.forEach(function (event) {
      var li = element("li", "task");
      var left = element("div");
      left.appendChild(element("div", "title", event.title));
      left.appendChild(window.Aion.tags([clock(event.start) + " - " + clock(event.end), placeLabel(event)]));
      if (event.leave !== null) { left.appendChild(element("div", "due", "leave " + event.leave.time + " (" + event.leave.source + ")")); }
      var meta = element("div", "due");
      if (event.type === "lecture") {
        var absences = event.absences.limit === null ? event.absences.used + " absences" : event.absences.used + " of " + event.absences.limit + " absences";
        meta.appendChild(pill(event.status || "not asked yet", event.status === "present" ? "good" : event.status === "absent" ? "bad" : ""));
        meta.appendChild(document.createTextNode("  " + absences));
      } else {
        meta.appendChild(pill(event.status, event.status === "done" || event.status === "logged" ? "good" : ""));
      }
      left.appendChild(meta);
      li.appendChild(left);
      if (event.type === "lecture" && event.status === null) {
        var actions = element("div", "actions");
        actions.appendChild(actionButton("Present", "done", function () { record(event, "present"); }));
        actions.appendChild(actionButton("Absent", "primary", function () { record(event, "absent"); }));
        li.appendChild(actions);
      }
      if (event.type !== "lecture" && event.status !== "logged") {  // a logged entry is a record of something done: nothing to press
        var doneActions = element("div", "actions");
        var finished = event.status === "done";
        doneActions.appendChild(actionButton(finished ? "Undo" : "Done", finished ? "primary" : "done", function () { setDone(event, !finished); }));
        li.appendChild(doneActions);
      }
      events.appendChild(li);
    });
    viewEl.appendChild(events);

    viewEl.appendChild(element("div", "title", "Due soon"));
    var deadlines = element("ul");
    if (body.deadlines.length === 0) { viewEl.appendChild(element("div", "due", "No deadlines in the next 7 days.")); }
    body.deadlines.forEach(function (item) {
      var li = element("li", "task");
      var left = element("div");
      left.appendChild(element("div", "title", item.title));
      var meta = element("div", "due");
      meta.appendChild(pill(dueLabel(item), item.days_left < 0 ? "bad" : ""));
      meta.appendChild(document.createTextNode("  " + item.blocks_left + " block" + (item.blocks_left === 1 ? "" : "s") + " left"));
      left.appendChild(meta);
      li.appendChild(left);
      var actions = element("div", "actions");
      actions.appendChild(actionButton("Done", "done", function () { complete(item); }));
      li.appendChild(actions);
      deadlines.appendChild(li);
    });
    viewEl.appendChild(deadlines);
  }

  function load() {
    viewEl = viewEl || document.getElementById("today-view");
    window.Aion.hideMainButton();
    window.Aion.hideSecondaryButton();
    status("Loading...");
    api("/api/today", "GET")
      .then(function (body) { status(pendingNote); pendingNote = ""; render(body); })
      .catch(function (error) { status("Could not load today: " + error.message, true); });
  }

  window.Aion.screens.today = { load: load };
})();
