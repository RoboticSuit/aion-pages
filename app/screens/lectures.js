window.Aion = window.Aion || {};
window.Aion.screens = window.Aion.screens || {};

(function () {
  "use strict";

  // Lectures: today's (or the next week's) classes with their attendance, and the narrow edits allowed on ONE date -
  // its room, its time, or cancelling that date. The whole series and every other date are never touched.
  var listEl, emptyEl, formEl;
  var span = 1;
  var pendingNote = "";

  function api() { return window.Aion.api.apply(null, arguments); }
  function status(text, isError) { window.Aion.setStatus(text, isError); }

  function element(tag, className, text) {
    var node = document.createElement(tag);
    if (className) { node.className = className; }
    if (text !== undefined) { node.textContent = text; }
    return node;
  }

  function fieldRow(labelText, input) {
    var row = element("div", "field-row");
    row.appendChild(element("label", "", labelText));
    row.appendChild(input);
    return row;
  }

  function input(type, value) {
    var node = element("input");
    node.type = type;
    if (value !== undefined) { node.value = value; }
    return node;
  }

  function stamp(iso) { return iso.slice(0, 10) + " " + iso.slice(11, 16); }
  function clock(iso) { return iso.slice(11, 16); }

  function actionButton(label, className, onClick) {
    var button = element("button", className, label);
    button.type = "button";
    button.addEventListener("click", onClick);
    return button;
  }

  function open(mode, id) {
    window.Aion.push("lectures", { mode: mode, id: id === undefined ? "" : String(id) });
  }

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

  function findLecture(id, then) {
    status("Loading...");
    api("/api/lectures?days=14", "GET")
      .then(function (body) {
        var lecture = (body.lectures || []).filter(function (l) { return l.id === id; })[0];
        if (!lecture) { status("That lecture is gone.", true); return; }
        status(pendingNote);
        pendingNote = "";
        then(lecture);
      })
      .catch(function (error) { status("Could not load that lecture: " + error.message, true); });
  }

  function pill(lecture) {
    var text = lecture.attendance || "not asked yet";
    return element("span", "pill " + (lecture.attendance === "present" ? "good" : lecture.attendance === "absent" ? "bad" : ""), text);
  }

  // ---- list ------------------------------------------------------------------------------------------
  function record(lecture, outcome) {
    api("/api/attendance/" + lecture.id, "POST", { status: outcome })
      .then(function (result) {
        window.Aion.haptic("success");
        var note = outcome === "absent"
          ? "Absent. " + result.used + (result.limit === null ? " absences so far, limit unknown." : " of " + result.limit + " absences used.")
          : "Present.";
        if (result.mark_error) { note += " (The calendar title was not updated: " + result.mark_error + ")"; }
        pendingNote = note;
        showList();
      })
      .catch(function (error) { status("Could not record it: " + error.message, true); });
  }

  // A place saved from Google Maps reads "Name, street"; an older room code like "AP / CN / 1114" reads as it is.
  function placeTag(lecture) {
    if (lecture.location === undefined || lecture.location === null) { return ""; }
    return lecture.location;
  }

  var DELIVERY_TAGS = { online_live: "Online, live", online_recorded: "Online, recorded" };

  function deliveryTag(lecture) {
    if (lecture.delivery === undefined || DELIVERY_TAGS[lecture.delivery] === undefined) { return ""; }
    return DELIVERY_TAGS[lecture.delivery];
  }

  function showList() {
    showLists(true);
    window.Aion.hideSecondaryButton();
    window.Aion.hideMainButton();
    status("Loading...");
    api("/api/lectures?days=" + span, "GET")
      .then(function (body) {
        status(pendingNote);
        pendingNote = "";
        listEl.innerHTML = "";
        var rows = body.lectures || [];
        emptyEl.hidden = rows.length !== 0;
        emptyEl.textContent = span === 1 ? "No lectures today." : "No lectures this week.";
        rows.forEach(function (lecture) {
          var li = element("li", "oo-card");
          var header = element("div", "oo-card-header");

          // Attendance is a genuine two-way choice (present or absent), not a single toggle - both stay tappable
          // side by side while unanswered; once answered, a single plain state icon replaces them (no un-answering
          // from here - Edit still reaches the full record if that is ever really needed).
          if (lecture.attendance === null) {
            var presentBtn = element("div", "oo-signifier oo-signifier-choice");
            presentBtn.setAttribute("role", "button");
            presentBtn.setAttribute("aria-label", "Present");
            presentBtn.appendChild(window.Aion.ui.checkIcon());
            presentBtn.addEventListener("click", function (clickEvent) { clickEvent.stopPropagation(); record(lecture, "present"); });
            var absentBtn = element("div", "oo-signifier oo-signifier-choice oo-signifier-danger");
            absentBtn.setAttribute("role", "button");
            absentBtn.setAttribute("aria-label", "Absent");
            absentBtn.appendChild(window.Aion.ui.xIcon());
            absentBtn.addEventListener("click", function (clickEvent) { clickEvent.stopPropagation(); record(lecture, "absent"); });
            var pair = element("div", "oo-signifier-pair");
            pair.appendChild(presentBtn);
            pair.appendChild(absentBtn);
            header.appendChild(pair);
          } else {
            var stateIcon = element("div", "oo-signifier" + (lecture.attendance === "absent" ? " is-absent" : " is-completed"));
            stateIcon.appendChild(lecture.attendance === "absent" ? window.Aion.ui.xIcon() : window.Aion.ui.checkIcon());
            header.appendChild(stateIcon);
          }

          var content = element("div", "oo-card-content");
          content.appendChild(element("div", "title", lecture.title));
          content.appendChild(window.Aion.tags([stamp(lecture.start) + " - " + clock(lecture.end), placeTag(lecture), deliveryTag(lecture)]));
          var absences = lecture.absences.limit === null ? lecture.absences.used + " absences" : lecture.absences.used + " of " + lecture.absences.limit + " absences";
          var meta = element("div", "due");
          meta.appendChild(pill(lecture));
          meta.appendChild(document.createTextNode("  " + absences));
          content.appendChild(meta);
          header.appendChild(content);
          li.appendChild(header);

          header.setAttribute("data-clickable", "");  // Edit/Place & more are always available here
          var tray = element("div", "oo-card-tray");
          var trayInner = element("div", "oo-tray-inner");
          trayInner.appendChild(actionButton("Edit", "primary", function (clickEvent) { clickEvent.stopPropagation(); open("edit", lecture.id); }));
          trayInner.appendChild(actionButton("Place & more", "primary", function (clickEvent) {  // the full Edit form: place search, how it is held, one date or all dates
            clickEvent.stopPropagation();
            window.Aion.push("events", { mode: "details", id: lecture.id });
          }));
          tray.appendChild(trayInner);
          li.appendChild(tray);
          header.addEventListener("click", function () {
            li.classList.toggle("expanded");
            window.Aion.haptic("selection");
          });
          listEl.appendChild(li);
        });
        var toggle = element("div", "chips");
        [["Today", 1], ["Next 7 days", 7]].forEach(function (pair) {
          var chip = element("button", "chip" + (span === pair[1] ? " selected" : ""), pair[0]);
          chip.type = "button";
          chip.addEventListener("click", function () { span = pair[1]; showList(); });
          toggle.appendChild(chip);
        });
        listEl.appendChild(toggle);
      })
      .catch(function (error) { status("Could not load lectures: " + error.message, true); });
  }

  // ---- edit menu: room / move / cancel THIS date --------------------------------------------------------
  function showEdit(id) {
    showLists(false);
    window.Aion.hideMainButton();
    findLecture(id, function (lecture) {
      formEl.appendChild(element("div", "title", lecture.title));
      formEl.appendChild(element("div", "due", stamp(lecture.start) + " - " + clock(lecture.end) + ". One date only: the series and every other date stay as they are."));
      var choices = element("div", "stack");
      [["Change room", "room"], ["Move this date's time", "move"]].forEach(function (choice) {
        choices.appendChild(actionButton(choice[0], "primary", function () { open(choice[1], lecture.id); }));
      });
      choices.appendChild(actionButton("Cancel this date", "primary", function () {
        window.Aion.confirmDestructive("Cancel \"" + lecture.title + "\" on " + lecture.start.slice(0, 10) + "? Only this date.", "Cancel it", function () {
          api("/api/lectures/" + lecture.id + "/cancel", "POST", {})
            .then(function () { done("Cancelled this date."); })
            .catch(function (error) { status("Could not cancel it: " + error.message, true); });
        });
      }));
      formEl.appendChild(choices);
    });
  }

  function showRoom(id) {
    showLists(false);
    findLecture(id, function (lecture) {
      var roomInput = input("text", lecture.location);
      roomInput.maxLength = 60;
      roomInput.placeholder = "Room";
      formEl.appendChild(element("div", "title", lecture.title));
      formEl.appendChild(fieldRow("Room", roomInput));
      window.Aion.mainButton("Save room", function () {
        if (roomInput.value.trim() === "") { status("Type the room.", true); return; }
        api("/api/lectures/" + lecture.id + "/room", "POST", { location: roomInput.value.trim() })
          .then(function () { done("Room changed for this date."); })
          .catch(function (error) { status("Could not change it: " + error.message, true); });
      });
    });
  }

  function showMove(id) {
    showLists(false);
    findLecture(id, function (lecture) {
      var dateInput = window.Aion.ui.datePicker(lecture.start.slice(0, 10), function () {});
      var timeInput = window.Aion.ui.timePicker(clock(lecture.start), function () {});
      formEl.appendChild(element("div", "title", lecture.title));
      formEl.appendChild(element("div", "due", "now " + stamp(lecture.start) + " - " + clock(lecture.end) + " (this date only)"));
      formEl.appendChild(fieldRow("Date", dateInput));
      formEl.appendChild(fieldRow("Time", timeInput));
      var noteEl = element("div", "plan");
      formEl.appendChild(noteEl);
      var previewed = false;

      function body() { return { new_start: dateInput.value + "T" + timeInput.value }; }

      function wire() {
        window.Aion.mainButton(previewed ? "Move" : "Check the move", function () {
          if (dateInput.value === "" || timeInput.value === "") { status("Pick the new date and time.", true); return; }
          if (previewed) { commit(); } else { preview(); }
        });
      }

      [dateInput, timeInput].forEach(function (field) {
        field.addEventListener("change", function () { previewed = false; noteEl.innerHTML = ""; wire(); });
      });

      function preview() {
        api("/api/lectures/" + lecture.id + "/reschedule/preview", "POST", body())
          .then(function (result) {
            status("");
            noteEl.innerHTML = "";
            result.blocked.forEach(function (item) { noteEl.appendChild(element("div", "block-line", "Blocked: it would land after " + item.title + " (" + stamp(item.start) + ")")); });
            result.conflicts.forEach(function (clash) { noteEl.appendChild(element("div", "block-line", "Overlaps: " + clash.title + " (" + stamp(clash.start) + " - " + clock(clash.end) + ")")); });
            if (result.blocked.length > 0) { status("Pick another time.", true); return; }
            if (result.conflicts.length === 0) { noteEl.appendChild(element("div", "due", "Nothing else is booked then.")); }
            previewed = true;
            wire();
          })
          .catch(function (error) { status("Could not check the move: " + error.message, true); });
      }

      function commit() {
        api("/api/lectures/" + lecture.id + "/reschedule", "POST", body())
          .then(function () { done("Moved this date."); })
          .catch(function (error) { status("Could not move it: " + error.message, true); });
      }

      wire();
    });
  }

  function load(data) {
    listEl = listEl || document.getElementById("lectures");
    emptyEl = emptyEl || document.getElementById("lectures-empty");
    formEl = formEl || document.getElementById("lecture-form");
    window.Aion.hideSecondaryButton();
    var view = data || { mode: window.Aion.params.get("mode"), id: window.Aion.params.get("id") };
    if (view.mode === "edit") { return showEdit(view.id); }
    if (view.mode === "room") { return showRoom(view.id); }
    if (view.mode === "move") { return showMove(view.id); }
    showList();
  }

  window.Aion.screens.lectures = { load: load, open: open };
})();
