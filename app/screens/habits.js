window.Aion = window.Aion || {};
window.Aion.screens = window.Aion.screens || {};

(function () {
  "use strict";

  // Habits live in Aion only. The owner says a habit is done (here or in chat); Aion never asks whether it was. After "Done" it
  // asks how long it took (or uses the habit's usual size) and when it finished, then writes a Google Calendar log entry.
  // Views: list (default) | done | create | edit | log.
  var barEl, listEl, emptyEl, formEl;
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

  function open(mode, id) {
    window.Aion.push("habits", { mode: mode, id: id === undefined ? "" : String(id) });
  }

  function done(message) {
    window.Aion.haptic("success");
    if (window.Aion.canGoBack()) { pendingNote = message; window.Aion.pop(); return; }
    window.Aion.finishProcedure(message);
  }

  function show(listVisible) {
    barEl.hidden = !listVisible;
    listEl.hidden = !listVisible;
    emptyEl.hidden = true;
    formEl.hidden = listVisible;
    formEl.innerHTML = "";
    barEl.innerHTML = "";
    window.Aion.hideSecondaryButton();
    window.Aion.hideMainButton();
  }

  function minutes(value) {
    if (value < 60) { return value + " min"; }
    return value % 60 === 0 ? (value / 60) + " h" : Math.floor(value / 60) + " h " + (value % 60);
  }

  function clock(iso) { return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }

  function stamp(iso) {
    if (!iso) { return "?"; }
    var date = new Date(iso);
    return isNaN(date.getTime()) ? iso : date.toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  }

  // One row of choose-one chips: options are [label, value]; onPick gets the value.
  function chipRow(options, selected, onPick) {
    var row = element("div", "chips");
    options.forEach(function (pair) {
      var chip = element("button", "chip" + (pair[1] === selected ? " selected" : ""), pair[0]);
      chip.type = "button";
      chip.addEventListener("click", function () {
        Array.prototype.forEach.call(row.children, function (other) { other.className = "chip" + (other === chip ? " selected" : ""); });
        onPick(pair[1]);
      });
      row.appendChild(chip);
    });
    return row;
  }

  function sizeOptions(durations) { return durations.map(function (v) { return [minutes(v), v]; }); }

  function loadAll(then) {
    status("Loading...");
    api("/api/habits", "GET")
      .then(function (body) { status(pendingNote); pendingNote = ""; then(body); })
      .catch(function (error) { status("Could not load habits: " + error.message, true); });
  }

  function findHabit(id, then) {
    loadAll(function (body) {
      var habit = (body.habits || []).filter(function (h) { return String(h.id) === id; })[0];
      if (!habit) { status("That habit is gone.", true); return; }
      then(habit, body);
    });
  }

  // ---- list --------------------------------------------------------------------------------------------
  function undo(habit, entry) {
    window.Aion.confirmDestructive("Undo the " + clock(entry.finished_at) + " entry for \"" + habit.title + "\"? Its calendar entry is removed.", "Undo it", function () {
      api("/api/habits/entries/" + entry.id + "/undo", "POST", {})
        .then(function (result) {
          window.Aion.haptic("success");
          pendingNote = result.calendar_error ? "Undone, but the calendar entry: " + result.calendar_error : "Undone.";
          showList();
        })
        .catch(function (error) { status("Could not undo it: " + error.message, true); });
    });
  }

  function showList() {
    show(true);
    [["Add habit", "create"], ["Log", "log"]].forEach(function (pair) {
      barEl.appendChild(actionButton(pair[0], "primary", function () { open(pair[1]); }));
    });
    loadAll(function (body) {
      listEl.innerHTML = "";
      var habits = body.habits || [];
      emptyEl.hidden = habits.length !== 0;
      habits.forEach(function (habit) {
        var li = element("li", "oo-card");
        var header = element("div", "oo-card-header");
        header.appendChild(window.Aion.ui.typeIcon("repeat"));  // no single "done" state - a habit can be logged more than once a day
        var content = element("div", "oo-card-content");
        content.appendChild(element("div", "title", habit.title));
        content.appendChild(window.Aion.tags([minutes(habit.default_min), habit.once_a_day ? "once a day" : "several a day",
                                           habit.needs_home ? "needs me home" : ""]));
        habit.entries_today.forEach(function (entry) {
          var line = element("div", "due");
          line.appendChild(element("span", "pill good", "done " + clock(entry.finished_at) + ", " + minutes(entry.spent_min)));
          line.appendChild(actionButton("Undo", "primary", function (clickEvent) { clickEvent.stopPropagation(); undo(habit, entry); }));
          content.appendChild(line);
        });
        header.appendChild(content);
        // "Done" stays directly in the header, visible, not behind a disclosure tap - it is the whole point of this
        // screen and something logged several times a day; only "Edit" (occasional) goes behind progressive disclosure.
        if (habit.can_log) {
          header.appendChild(actionButton("Done", "primary", function (clickEvent) { clickEvent.stopPropagation(); open("done", habit.id); }));
        }
        li.appendChild(header);

        header.setAttribute("data-clickable", "");
        var tray = element("div", "oo-card-tray");
        var trayInner = element("div", "oo-tray-inner");
        trayInner.appendChild(actionButton("Edit", "primary", function (clickEvent) { clickEvent.stopPropagation(); open("edit", habit.id); }));
        tray.appendChild(trayInner);
        li.appendChild(tray);
        header.addEventListener("click", function () {
          li.classList.toggle("expanded");
          window.Aion.haptic("selection");
        });
        listEl.appendChild(li);
      });
    });
  }

  // ---- done: how long, and when ---------------------------------------------------------------------------
  function pad(n) { return ("0" + n).slice(-2); }
  function dayString(date) { return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate()); }

  function showDone(id) {
    show(false);
    findHabit(id, function (habit, body) {
      var state = { spent: null, touched: false };
      var now = new Date();
      formEl.appendChild(element("div", "title", habit.title));
      formEl.appendChild(element("div", "due", "How long did it take?"));
      var options = [["Skip: usual " + minutes(habit.default_min), null]].concat(sizeOptions(body.durations));
      formEl.appendChild(chipRow(options, null, function (value) { state.spent = value; }));
      formEl.appendChild(element("div", "due", "When did you finish?"));
      var dateInput = window.Aion.ui.datePicker(dayString(now), function () {}, { maxDate: dayString(now) });  // never a future date
      dateInput.addEventListener("change", function () { state.touched = true; });
      formEl.appendChild(window.Aion.ui.fieldRow("Date", dateInput));
      var timeInput = window.Aion.ui.timePicker(pad(now.getHours()) + ":" + pad(now.getMinutes()), function () {});
      timeInput.addEventListener("change", function () { state.touched = true; });
      formEl.appendChild(window.Aion.ui.fieldRow("Time", timeInput));
      window.Aion.mainButton("Log it", function () {
        var payload = {};
        if (state.spent !== null) { payload.spent_min = state.spent; }
        if (state.touched) {
          if (dateInput.value === "" || timeInput.value === "") { status("Pick the date and time you finished.", true); return; }
          var finished = new Date(dateInput.value + "T" + timeInput.value);  // the device's own clock
          if (finished > new Date()) { status("That time has not happened yet.", true); return; }
          payload.finished_at = finished.toISOString();  // an exact moment, so the bot's timezone setting cannot shift it
        }
        api("/api/habits/" + habit.id + "/done", "POST", payload)
          .then(function (result) {
            var note = "Logged " + habit.title + ": " + minutes(result.spent_min) + ", ended " + clock(result.finished_at) + ".";
            if (result.calendar_error) { note += " The calendar entry was not written: " + result.calendar_error; }
            done(note);
          })
          .catch(function (error) { status("Could not log it: " + error.message, true); });
      });
    });
  }

  // ---- create ------------------------------------------------------------------------------------------
  function showCreate() {
    show(false);
    status("Loading...");
    api("/api/habits", "GET").then(function (body) {
      status("");
      var state = { size: 30, once: true };
      formEl.appendChild(element("div", "title", "Add a habit"));
      formEl.appendChild(element("div", "due", "It lives in Aion only. When you say it is done, a log entry goes on your calendar."));
      var title = element("input");
      title.type = "text";
      title.id = "habit-title";
      title.placeholder = "Habit title";
      title.maxLength = 80;
      formEl.appendChild(title);
      formEl.appendChild(element("div", "due", "Usual size"));
      formEl.appendChild(chipRow(sizeOptions(body.durations), 30, function (value) { state.size = value; }));
      formEl.appendChild(element("div", "due", "How often a day"));
      formEl.appendChild(chipRow([["Once a day", true], ["Several a day", false]], true, function (value) { state.once = value; }));
      var row = element("div", "checkbox-row");
      var box = element("input");
      box.type = "checkbox";
      box.id = "habit-needs-home";
      var label = element("label", "", "Needs me home");
      label.htmlFor = "habit-needs-home";
      row.appendChild(box);
      row.appendChild(label);
      formEl.appendChild(row);
      window.Aion.mainButton("Add habit", function () {
        if (title.value.trim() === "") { status("Enter a habit title first.", true); return; }
        api("/api/habits", "POST", { title: title.value.trim(), needs_home: box.checked, default_min: state.size, once_a_day: state.once })
          .then(function () { done("Habit added."); })
          .catch(function (error) { status("Could not add that habit: " + error.message, true); });
      });
    }).catch(function (error) { status("Could not load: " + error.message, true); });
  }

  // ---- edit: size, how often, home flag, delete -------------------------------------------------------------
  function showEdit(id) {
    show(false);
    findHabit(id, function (habit, body) {
      var state = { size: habit.default_min, once: habit.once_a_day, home: habit.needs_home };
      formEl.appendChild(element("div", "title", habit.title));
      formEl.appendChild(element("div", "due", "Usual size: the length of its calendar entry when you don't say how long it took."));
      formEl.appendChild(chipRow(sizeOptions(body.durations), habit.default_min, function (value) { state.size = value; }));
      formEl.appendChild(element("div", "due", "How often a day"));
      formEl.appendChild(chipRow([["Once a day", true], ["Several a day", false]], habit.once_a_day, function (value) { state.once = value; }));
      formEl.appendChild(element("div", "due", "Needs me home: I only ask 'are you home?' for habits with this on."));
      formEl.appendChild(chipRow([["Needs me home", true], ["No home flag", false]], habit.needs_home, function (value) { state.home = value; }));
      var stack = element("div", "stack");
      stack.appendChild(actionButton("Delete habit", "primary", function () {
        window.Aion.confirmDestructive("Delete \"" + habit.title + "\"? Calendar entries already written stay.", "Delete it", function () { remove(habit); });
      }));
      formEl.appendChild(stack);
      window.Aion.mainButton("Save", function () {
        var changes = {};
        if (state.size !== habit.default_min) { changes.default_min = state.size; }
        if (state.once !== habit.once_a_day) { changes.once_a_day = state.once; }
        if (state.home !== habit.needs_home) { changes.needs_home = state.home; }
        if (Object.keys(changes).length === 0) { status("Nothing changed."); return; }
        api("/api/habits/" + habit.id + "/settings", "POST", changes)
          .then(function () { done("Saved."); })
          .catch(function (error) { status("Could not save it: " + error.message, true); });
      });
    });
  }

  function remove(habit) {
    api("/api/habits/" + habit.id + "/delete", "POST", {})
      .then(function () { done("Habit deleted."); })
      .catch(function (error) { status("Could not delete it: " + error.message, true); });
  }

  // ---- log -----------------------------------------------------------------------------------------------------
  function showLog() {
    show(false);
    status("Loading...");
    formEl.appendChild(element("div", "title", "Habit log"));
    var box = element("ul");
    formEl.appendChild(box);
    api("/api/habits/log", "GET")
      .then(function (body) {
        status("");
        if ((body.log || []).length === 0) { formEl.appendChild(element("div", "due", "Nothing logged yet.")); }
        (body.log || []).forEach(function (row) {
          // Read-only history, nothing to act on - the plain shared card look, no signifier or tray needed.
          var li = element("li", "card");
          li.appendChild(element("div", "title", row.title));
          var detail = row.legacy ? "done " + stamp(row.completed_at) + " (from Google Tasks)"
            : "done " + stamp(row.completed_at) + ", " + minutes(row.spent_min) + (row.spent_was_asked ? "" : " (usual size)");
          li.appendChild(element("div", "due", detail));
          box.appendChild(li);
        });
      })
      .catch(function (error) { status("Could not load the log: " + error.message, true); });
  }

  function load(data) {
    barEl = barEl || document.getElementById("habit-bar");
    listEl = listEl || document.getElementById("habits");
    emptyEl = emptyEl || document.getElementById("habits-empty");
    formEl = formEl || document.getElementById("habit-form");
    var view = data || { mode: window.Aion.params.get("mode"), id: window.Aion.params.get("id") };
    if (view.mode === "done") { return showDone(view.id); }
    if (view.mode === "create") { return showCreate(); }
    if (view.mode === "edit") { return showEdit(view.id); }
    if (view.mode === "log") { return showLog(); }
    showList();
  }

  window.Aion.screens.habits = { load: load, open: open };
})();
