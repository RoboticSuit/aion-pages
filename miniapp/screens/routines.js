window.Aion = window.Aion || {};
window.Aion.screens = window.Aion.screens || {};

(function () {
  "use strict";

  // Routines (repeating tasks): a list, a detail view that keeps the three kinds of change apart - rename, change the
  // schedule (the old series ends today, a new one starts tomorrow, history stays as it was), change the pattern (the
  // SAME series continues under the new pattern) - plus End and Delete, and one-scroll-screen forms.
  var DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  var HOURS = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22];
  var MINUTES = [0, 15, 30, 45];
  var LENGTHS = [30, 45, 60, 90, 120];
  var listEl, emptyEl, formEl;
  var pendingNote = "";

  function api() { return window.Aion.api.apply(null, arguments); }
  function status(text, isError) { window.Aion.setStatus(text, isError); }

  function element(tag, className, text) {
    var node = document.createElement(tag);
    if (className) { node.className = className; }
    if (text !== undefined) { node.textContent = text; }
    return node;
  }

  function two(number) { return ("0" + number).slice(-2); }

  function describeDays(days) { return days.length === 7 ? "every day" : days.map(function (d) { return DAYS[d]; }).join("/"); }

  function actionButton(label, className, onClick) {
    var button = element("button", className, label);
    button.type = "button";
    button.addEventListener("click", onClick);
    return button;
  }

  function open(mode, id) {
    window.Aion.push("routines", { mode: mode, id: id === undefined ? "" : String(id) });
  }

  // Leaving a form: back one level (the list or the detail view reloads), or a scoped drawer that has no level closes.
  function done(message) {
    window.Aion.haptic("success");
    if (window.Aion.canGoBack()) { pendingNote = message; window.Aion.pop(); return; }
    window.Aion.finishProcedure(message);
  }

  function showLists(listVisible) {
    listEl.hidden = !listVisible;
    emptyEl.hidden = true;
    formEl.hidden = listVisible;
    formEl.innerHTML = "";
  }

  function findRoutine(id, then) {
    status("Loading...");
    api("/api/routines", "GET")
      .then(function (body) {
        var routine = (body.routines || []).filter(function (r) { return r.master === id; })[0];
        if (!routine) { status("That routine has ended or is gone.", true); return; }
        status(pendingNote);
        pendingNote = "";
        then(routine);
      })
      .catch(function (error) { status("Could not load that routine: " + error.message, true); });
  }

  // ---- the shared schedule picker: days, hour, minute and length on ONE scrollable screen -----------
  function chips(labels, isSelected, onPick) {
    var row = element("div", "chips");
    labels.forEach(function (label, index) {
      var chip = element("button", "chip" + (isSelected(index) ? " selected" : ""), label);
      chip.type = "button";
      chip.addEventListener("click", function () {
        onPick(index);
        Array.prototype.forEach.call(row.children, function (other, otherIndex) { other.classList.toggle("selected", isSelected(otherIndex)); });
        window.Aion.haptic("selection");
      });
      row.appendChild(chip);
    });
    return row;
  }

  function schedulePicker(container, initial, onChange) {
    var state = { days: initial.days.slice(), hour: initial.hour, minute: initial.minute, length: initial.length };
    container.appendChild(element("div", "card-title", "Days"));
    container.appendChild(chips(DAYS.concat(["Every day"]), function (i) {
      return i === 7 ? state.days.length === 7 : state.days.indexOf(i) !== -1;
    }, function (i) {
      if (i === 7) { state.days = state.days.length === 7 ? [] : [0, 1, 2, 3, 4, 5, 6]; }
      else if (state.days.indexOf(i) === -1) { state.days.push(i); state.days.sort(); }
      else { state.days.splice(state.days.indexOf(i), 1); }
      onChange();
    }));
    container.appendChild(element("div", "card-title", "Hour"));
    container.appendChild(chips(HOURS.map(two), function (i) { return state.hour === HOURS[i]; }, function (i) { state.hour = HOURS[i]; onChange(); }));
    container.appendChild(element("div", "card-title", "Minute"));
    container.appendChild(chips(MINUTES.map(two), function (i) { return state.minute === MINUTES[i]; }, function (i) { state.minute = MINUTES[i]; onChange(); }));
    container.appendChild(element("div", "card-title", "Length"));
    container.appendChild(chips(LENGTHS.map(function (m) { return m + " min"; }), function (i) { return state.length === LENGTHS[i]; },
      function (i) { state.length = LENGTHS[i]; onChange(); }));
    return {
      get: function () { return { days: state.days.slice(), hour: state.hour, minute: state.minute, length: state.length }; },
      problem: function () {
        if (state.days.length === 0) { return "Pick at least one day."; }
        if (state.hour === null) { return "Pick the hour."; }
        return "";
      }
    };
  }

  // ---- list ----------------------------------------------------------------------------------------
  function showList() {
    showLists(true);
    window.Aion.hideSecondaryButton();
    window.Aion.mainButton("Add routine", function () { open("create"); });
    status("Loading...");
    api("/api/routines", "GET")
      .then(function (body) {
        status(pendingNote);
        pendingNote = "";
        listEl.innerHTML = "";
        var rows = body.routines || [];
        emptyEl.hidden = rows.length !== 0;
        rows.forEach(function (routine) {
          var li = element("li", "oo-card");
          var header = element("div", "oo-card-header");
          header.appendChild(window.Aion.ui.typeIcon("repeat"));  // no per-item type field: every row here is uniformly "a recurring thing"
          var content = element("div", "oo-card-content");
          content.appendChild(element("div", "title", routine.title));
          content.appendChild(element("div", "due", describeDays(routine.days) + " " + routine.time + " - " + routine.length + " min"));
          if (routine.location !== undefined && routine.location !== "") { content.appendChild(window.Aion.tags([routine.location])); }
          header.appendChild(content);
          li.appendChild(header);

          header.setAttribute("data-clickable", "");  // Edit is always available here, so the tray always exists
          var tray = element("div", "oo-card-tray");
          var trayInner = element("div", "oo-tray-inner");
          trayInner.appendChild(actionButton("Edit", "primary", function (clickEvent) { clickEvent.stopPropagation(); open("detail", routine.master); }));
          if (routine.next_id !== undefined) {  // the full Edit form for the next date: place search, guests, repeat days, all dates or one
            trayInner.appendChild(actionButton("Place & more", "primary", function (clickEvent) {
              clickEvent.stopPropagation();
              window.Aion.push("events", { mode: "details", id: routine.next_id });
            }));
          }
          tray.appendChild(trayInner);
          li.appendChild(tray);
          header.addEventListener("click", function () {
            li.classList.toggle("expanded");
            window.Aion.haptic("selection");
          });
          listEl.appendChild(li);
        });
      })
      .catch(function (error) { status("Could not load routines: " + error.message, true); });
  }

  // ---- create ----------------------------------------------------------------------------------------
  function showCreate() {
    showLists(false);
    var titleInput = element("input");
    titleInput.type = "text";
    titleInput.maxLength = 60;
    titleInput.placeholder = "What is it called";
    var row = element("div", "field-row");
    row.appendChild(element("label", "", "Name"));
    row.appendChild(titleInput);
    formEl.appendChild(row);
    var picker = schedulePicker(formEl, { days: [], hour: null, minute: 0, length: 60 }, function () {});
    status("");
    window.Aion.mainButton("Create routine", function () {
      var issue = titleInput.value.trim() === "" ? "Enter its name first." : picker.problem();
      if (issue !== "") { status(issue, true); return; }
      var body = picker.get();
      body.title = titleInput.value.trim();
      api("/api/routines", "POST", body)
        .then(function () { done("Routine created. It starts tomorrow."); })
        .catch(function (error) { status("Could not create it: " + error.message, true); });
    });
  }

  // ---- detail: three different kinds of change, then End / Delete --------------------------------------
  function showDetail(id) {
    showLists(false);
    window.Aion.hideMainButton();
    findRoutine(id, function (routine) {
      formEl.appendChild(element("div", "title", routine.title));
      formEl.appendChild(element("div", "due", describeDays(routine.days) + " " + routine.time + " - " + routine.length + " min"));
      var choices = element("div", "stack");
      [["Rename", "The whole series, past occurrences included.", "rename"],
       ["Change schedule", "The old schedule ends today, a new one starts tomorrow. History stays as it was.", "schedule"],
       ["Change pattern", "The SAME series continues; past occurrences show the new pattern too.", "pattern"]].forEach(function (choice) {
        var block = element("div", "choice");
        block.appendChild(actionButton(choice[0], "primary", function () { open(choice[2], routine.master); }));
        block.appendChild(element("div", "due", choice[1]));
        choices.appendChild(block);
      });
      formEl.appendChild(choices);
      var danger = element("div", "choice");
      danger.appendChild(actionButton("End from today", "primary", function () {
        window.Aion.confirmDestructive("End \"" + routine.title + "\" from today? Past occurrences stay.", "End it", function () {
          api("/api/routines/" + routine.master + "/end", "POST", {})
            .then(function () { done("Ended. Past occurrences stay."); })
            .catch(function (error) { status("Could not end it: " + error.message, true); });
        });
      }));
      danger.appendChild(actionButton("Delete everything", "primary", function () {
        window.Aion.confirmDestructive("Delete \"" + routine.title + "\" completely, past occurrences too?", "Continue", function () {
          window.Aion.confirmDestructive("Really delete every occurrence? This cannot be undone.", "Delete", function () {
            api("/api/routines/" + routine.master + "/delete", "POST", { confirm: "delete", title: routine.title })
              .then(function () { done("Deleted."); })
              .catch(function (error) { status("Could not delete it: " + error.message, true); });
          });
        });
      }));
      formEl.appendChild(danger);
    });
  }

  function showRename(id) {
    showLists(false);
    findRoutine(id, function (routine) {
      var titleInput = element("input");
      titleInput.type = "text";
      titleInput.maxLength = 60;
      titleInput.value = routine.title;
      var row = element("div", "field-row");
      row.appendChild(element("label", "", "Name"));
      row.appendChild(titleInput);
      formEl.appendChild(row);
      window.Aion.mainButton("Rename", function () {
        var title = titleInput.value.trim();
        if (title === "" || title === routine.title) { status("Type a different name.", true); return; }
        api("/api/routines/" + routine.master + "/rename", "POST", { title: title })
          .then(function () { done("Renamed."); })
          .catch(function (error) { status("Could not rename it: " + error.message, true); });
      });
    });
  }

  function showSchedule(id, inPlace) {
    showLists(false);
    findRoutine(id, function (routine) {
      var hour = parseInt(routine.time.slice(0, 2), 10);
      var minute = parseInt(routine.time.slice(3, 5), 10);
      formEl.appendChild(element("div", "title", routine.title));
      formEl.appendChild(element("div", "due", inPlace
        ? "The same series continues under the new pattern; past occurrences will show it too."
        : "The old schedule ends today and the new one starts tomorrow; history stays."));
      var noteEl = element("div", "plan");
      var previewed = false;
      var digest = "";
      var picker = schedulePicker(formEl, { days: routine.days, hour: hour, minute: MINUTES.indexOf(minute) === -1 ? 0 : minute,
                                            length: LENGTHS.indexOf(routine.length) === -1 ? 60 : routine.length }, function () {
        previewed = false;
        noteEl.innerHTML = "";
        wire();
      });
      formEl.appendChild(noteEl);

      function body() { var values = picker.get(); values.title = routine.title; return values; }

      function preview() {
        api("/api/routines/" + routine.master + "/pattern/preview", "POST", body())
          .then(function (result) {
            status("");
            digest = result.digest;
            noteEl.innerHTML = "";
            (result.summary || []).forEach(function (line) { noteEl.appendChild(element("div", "block-line", line)); });
            previewed = true;
            wire();
          })
          .catch(function (error) { status("Could not check the change: " + error.message, true); });
      }

      function apply() {
        var values = body();
        values.digest = digest;
        api("/api/routines/" + routine.master + "/pattern/apply", "POST", values)
          .then(function (result) { done(result.verified ? "Pattern changed." : "Changed, but the calendar did not fully read it back - check it."); })
          .catch(function (error) { status("Could not apply it: " + error.message, true); previewed = false; wire(); });
      }

      function change() {
        api("/api/routines/" + routine.master + "/reschedule", "POST", body())
          .then(function () { done("Schedule changed. The new one starts tomorrow."); })
          .catch(function (error) { status("Could not change it: " + error.message, true); });
      }

      function wire() {
        var label = inPlace ? (previewed ? "Apply change" : "Check the change") : "Change schedule";
        window.Aion.mainButton(label, function () {
          var issue = picker.problem();
          if (issue !== "") { status(issue, true); return; }
          if (!inPlace) { change(); } else if (previewed) { apply(); } else { preview(); }
        });
      }

      status("");
      wire();
    });
  }

  function load(data) {
    listEl = listEl || document.getElementById("routines");
    emptyEl = emptyEl || document.getElementById("routines-empty");
    formEl = formEl || document.getElementById("routine-form");
    window.Aion.hideSecondaryButton();
    var view = data || { mode: window.Aion.params.get("mode"), id: window.Aion.params.get("id") };
    if (view.mode === "create") { return showCreate(); }
    if (view.mode === "detail") { return showDetail(view.id); }
    if (view.mode === "rename") { return showRename(view.id); }
    if (view.mode === "schedule") { return showSchedule(view.id, false); }
    if (view.mode === "pattern") { return showSchedule(view.id, true); }
    showList();
  }

  window.Aion.screens.routines = { load: load, open: open };
})();
