if (window.Aion === undefined) { window.Aion = {}; }
if (window.Aion.screens === undefined) { window.Aion.screens = {}; }

(function () {
  "use strict";

  // Events: an upcoming list (Move / Reminder / Edit / Delete per event), a New event form (with Who and Where, pre-filled
  // when the chat's "Edit in app" button opened it from a draft), the move form, the reminder form and the Edit form (title, day,
  // start and end time, guests, invitations and place),
  // which works on ANY event: a one-off, a lecture or exam, one date of a series or the whole series.
  // Every write shows what it would run into first (overlaps, or a deadline/exam that halts a move) and only then commits.
  // The form parts (chips, people picker, place picker, draft loader) are the shared ones in pickers.js (window.Aion.ui).
  // Governed by Authadia REF_IDs SYN_001 and SYN_003.
  var REMINDERS = [["Default", null], ["At start", [0]], ["10 min", [10]], ["30 min", [30]], ["1 hour", [60]], ["1 day", [1440]]];
  var DRAFT_ID_LENGTH = 9;  // "d" + the 8 characters of the draft id, as the chat button puts it in the link
  var listEl, emptyEl, formEl;
  var pendingNote = "";  // what the last form did ("Invited ..."), shown once when the list comes back

  function api() { return window.Aion.api.apply(null, arguments); }
  function status(text, isError) { window.Aion.setStatus(text, isError); }
  function ui() { return window.Aion.ui; }
  function element(tag, className, text) { return ui().element(tag, className, text); }
  function input(type, value) { return ui().input(type, value); }
  function fieldRow(labelText, control) { return ui().fieldRow(labelText, control); }
  function chipRow(options, selectedIndex, onPick) { return ui().chipRow(options, selectedIndex, onPick); }

  function stamp(iso) { return iso.slice(0, 10) + " " + iso.slice(11, 16); }
  function clock(iso) { return iso.slice(11, 16); }

  // The day after "YYYY-MM-DD", for an event that ends after midnight (21:00 to 00:00 ends on the next date).
  function nextDay(dateText) {
    var day = new Date(dateText + "T12:00:00");
    day.setDate(day.getDate() + 1);
    var month = String(day.getMonth() + 1);
    var date = String(day.getDate());
    if (month.length === 1) { month = "0" + month; }
    if (date.length === 1) { date = "0" + date; }
    return day.getFullYear() + "-" + month + "-" + date;
  }

  // Leaving a form: back to the list when we came from it, otherwise a scoped drawer closes.
  function done(message) {
    window.Aion.haptic("success");
    if (window.Aion.canGoBack()) { pendingNote = message; status(message); window.Aion.pop(); return; }
    window.Aion.finishProcedure(message);
  }

  function open(mode, id) {
    window.Aion.push("events", { mode: mode, id: id === undefined ? "" : String(id) });
  }

  function actionButton(label, onClick) {
    var button = element("button", "primary", label);
    button.type = "button";
    button.addEventListener("click", onClick);
    return button;
  }

  function showLists(listVisible) {
    listEl.hidden = !listVisible;
    emptyEl.hidden = true;
    formEl.hidden = listVisible;
    formEl.innerHTML = "";
  }

  // ---- list ---------------------------------------------------------------------------------------
  function guestsLabel(count) {
    if (count === 1) { return "1 guest"; }
    return count + " guests";
  }

  // The app page comes from the online copy and the API from the PC, which can be one deploy apart: tolerate a missing field.
  function guestsOf(event) {
    if (event.guests === undefined) { return []; }
    return event.guests;
  }

  var DELIVERY = [["In person", "in_person"], ["Online, live", "online_live"], ["Online, recorded", "online_recorded"]];
  var DELIVERY_LABELS = { in_person: "In person", online_live: "Online, live", online_recorded: "Online, recorded" };

  var LEADS = [["Default", null], ["0", 0], ["5", 5], ["10", 10], ["15", 15]];  // arrive early: null follows Config > Travel

  function leadOrNull(value) {
    if (typeof value === "number") { return value; }
    return null;
  }

  function leadOf(event) { return leadOrNull(event.lead_min); }
  function checkinOf(event) { return event.checkin_on === true; }

  function deliveryOf(event) {
    if (event.delivery === undefined || DELIVERY_LABELS[event.delivery] === undefined) { return "in_person"; }
    return event.delivery;
  }

  function placeOf(event) {
    if (event.location === undefined) { return ""; }
    return event.location;
  }

  // Object-card: the leading icon is a pure type signifier (lecture/exam/deadline/study/task/personal) - an event has
  // no single primary toggle action the way a task's "done" is, so this is never a tap-to-toggle checkbox, only a
  // noun identifier. Every other action (Move/Edit/Invite/Reminder/Delete) lives behind a progressive-disclosure tap
  // on the card - never shown by default. A card with none of these available (a fixed, non-removable event with no
  // email guest) gets no tray at all, and its header is never made clickable, exactly as tasks.js already does.
  function renderList(rows) {
    listEl.innerHTML = "";
    emptyEl.hidden = rows.length !== 0;
    rows.forEach(function (event) {
      var li = element("li", "oo-card");
      var header = element("div", "oo-card-header");
      header.appendChild(ui().typeIcon(event.type));
      var content = element("div", "oo-card-content");
      content.appendChild(element("div", "title", event.title));
      content.appendChild(element("div", "due", event.all_day ? event.start.slice(0, 10) + " (all day)" : stamp(event.start) + " - " + clock(event.end)));
      var facts = [];
      if (event.passed === true) { facts.push("Passed"); }
      if (placeOf(event) !== "") { facts.push(placeOf(event)); }
      if (guestsOf(event).length > 0) { facts.push(guestsLabel(guestsOf(event).length)); }
      if (deliveryOf(event) !== "in_person") { facts.push(DELIVERY_LABELS[deliveryOf(event)]); }
      if (facts.length > 0) { content.appendChild(window.Aion.tags(facts)); }
      header.appendChild(content);
      li.appendChild(header);

      var actions = [];
      if (event.movable && !event.all_day) { actions.push(["Move", function () { open("move", event.id); }]); }
      if (event.type !== "deadline") { actions.push(["Edit", function () { open("details", event.id); }]); }
      var hasEmailGuest = guestsOf(event).some(function (guest) { return guest.email !== ""; });
      if (event.type !== "deadline" && hasEmailGuest) { actions.push(["Invite", function () { open("details", event.id); }]); }  // the same form: its Invitations card is right under Who
      if (event.removable) {
        actions.push(["Reminder", function () { open("reminder", event.id); }]);
        actions.push(["Delete", function () { remove(event); }]);
      }
      if (actions.length > 0) {
        header.setAttribute("data-clickable", "");
        var tray = element("div", "oo-card-tray");
        var trayInner = element("div", "oo-tray-inner");
        actions.forEach(function (pair) {
          trayInner.appendChild(actionButton(pair[0], function (clickEvent) { clickEvent.stopPropagation(); pair[1](); }));
        });
        tray.appendChild(trayInner);
        li.appendChild(tray);
        header.addEventListener("click", function () {
          li.classList.toggle("expanded");
          window.Aion.haptic("selection");
        });
      }
      listEl.appendChild(li);
    });
  }

  function remove(event) {
    window.Aion.confirmDestructive("Delete \"" + event.title + "\" from the calendar?", "Delete", function () {
      api("/api/events/" + event.id + "/delete", "POST", {})
        .then(function (result) {
          window.Aion.haptic("success");
          showList(result.gone ? "Deleted." : "Deleted, but the calendar still shows it - check it.");
        })
        .catch(function (error) { status("Could not delete: " + error.message, true); });
    });
  }

  function showList(note) {
    showLists(true);
    window.Aion.hideSecondaryButton();
    window.Aion.mainButton("New event", function () { open("create"); });
    var shown = note;
    if (shown === undefined) { shown = pendingNote; }
    pendingNote = "";
    status("Loading...");
    api("/api/events?days=14", "GET")
      .then(function (body) { status(shown || ""); renderList(body.events || []); })
      .catch(function (error) { status("Could not load events: " + error.message, true); });
  }

  // ---- create: fill in (or arrive pre-filled from a chat draft), see the overlaps, then commit -------------------
  function guestsFromDraft(text) {
    var people = [];
    text.split("\n").forEach(function (line) {
      var parsed = ui().parseGuest(line);
      if (parsed.guest !== undefined) { people.push(parsed.guest); }
    });
    return people;
  }

  function reminderIndex(minutes) {
    var wanted = JSON.stringify(minutes);
    var index = REMINDERS.findIndex(function (option) { return JSON.stringify(option[1]) === wanted; });
    if (index === -1) { return 0; }
    return index;
  }

  // What the form starts with: empty, or what the bot understood from the sentence.
  function startingFields(draft) {
    var fields = { title: "", date: "", from: "18:00", to: "19:00", reminder: 0, location: "", people: [] };
    if (draft === null) { return fields; }
    fields.title = draft.title;
    fields.date = draft.start.slice(0, 10);
    fields.from = clock(draft.start);
    fields.to = clock(draft.end);
    fields.reminder = reminderIndex(draft.reminder_minutes);
    fields.location = draft.location;
    fields.people = guestsFromDraft(draft.guests);
    return fields;
  }

  function showCreate(choices, draft, draftId) {
    showLists(false);
    var start = startingFields(draft);
    var reminder = REMINDERS[start.reminder][1];
    var titleInput = input("text", start.title);
    titleInput.maxLength = 80;
    titleInput.placeholder = "What is it";
    var dateInput = window.Aion.ui.datePicker(start.date, function () {});
    var startInput = window.Aion.ui.timePicker(start.from, function () {});
    var endInput = window.Aion.ui.timePicker(start.to, function () {});
    formEl.appendChild(fieldRow("Title", titleInput));
    formEl.appendChild(fieldRow("Date", dateInput));
    formEl.appendChild(fieldRow("From", startInput));
    formEl.appendChild(fieldRow("To", endInput));
    var people = ui().peoplePicker({ contacts: choices.contacts, people: start.people });
    var place = ui().placePicker({ places: choices.places, value: start.location });
    formEl.appendChild(people.node);
    formEl.appendChild(place.node);
    formEl.appendChild(element("div", "card-title", "Reminder"));
    formEl.appendChild(chipRow(REMINDERS, start.reminder, function (value) { reminder = value; }));
    var noteEl = element("div", "plan");
    formEl.appendChild(noteEl);
    var previewed = false;

    function body() {
      var endDay = dateInput.value;
      if (endInput.value <= startInput.value) { endDay = nextDay(dateInput.value); }
      return {
        title: titleInput.value.trim(), start: dateInput.value + "T" + startInput.value, end: endDay + "T" + endInput.value,
        reminder_minutes: reminder, location: place.getPlace(), guests: people.getPeople(),
        save_contacts: people.getRemember(), save_place: place.getRemember(), place_found: place.getFound()
      };
    }

    function problem() {
      if (titleInput.value.trim() === "") { return "Enter what it is first."; }
      if (dateInput.value === "" || startInput.value === "" || endInput.value === "") { return "Pick the date and both times first."; }
      return people.flush();
    }

    [titleInput, dateInput, startInput, endInput].forEach(function (field) {
      field.addEventListener("change", function () { previewed = false; noteEl.innerHTML = ""; wire(); });
    });

    function wire() {
      window.Aion.mainButton(previewed ? "Create event" : "Check and create", function () {
        var issue = problem();
        if (issue !== "") { status(issue, true); return; }
        if (previewed) { create(); } else { preview(); }
      });
    }

    function preview() {
      api("/api/events/preview", "POST", body())
        .then(function (result) {
          status("");
          noteEl.innerHTML = "";
          if (result.conflicts.length === 0) { noteEl.appendChild(element("div", "due", "Nothing else is booked then.")); }
          result.conflicts.forEach(function (clash) {
            noteEl.appendChild(element("div", "block-line", "Overlaps: " + clash.title + " (" + stamp(clash.start) + " - " + clock(clash.end) + ")"));
          });
          previewed = true;
          wire();
        })
        .catch(function (error) { status("Could not check the time: " + error.message, true); });
    }

    function create() {
      var found = place.getFound();
      if (found !== null) { ui().showLoading("Checking " + found.name + " on Google Maps..."); }
      api("/api/events", "POST", body())
        .then(function (result) {
          ui().hideLoading();
          if (draftId !== "") { ui().useUpDraft(draftId); }
          done(result.seen ? "Event created." : "Created, but the calendar did not show it back - check it.");
        })
        .catch(function (error) { ui().hideLoading(); status("Could not create the event: " + error.message, true); });
    }

    if (draftId !== "" && draft === null) { status("That draft has expired. Fill the event in here."); } else { status(""); }
    wire();
  }

  // The drawer arrives here with a draft id ("d" + 8 characters) when the chat's Edit in app button opened it.
  function openCreate(id) {
    var draftId = "";
    if (typeof id === "string" && id.length === DRAFT_ID_LENGTH && id.charAt(0) === "d") { draftId = id.slice(1); }
    status("Loading...");
    showLists(false);
    var draftPromise = Promise.resolve(null);
    if (draftId !== "") { draftPromise = ui().loadDraft(draftId); }
    Promise.all([ui().loadChoices(), draftPromise])
      .then(function (both) { showCreate(both[0], both[1], draftId); })
      .catch(function (error) { status("Could not open the form: " + error.message, true); });
  }

  // ---- move: pick the new time, see what it runs into, then commit -----------------------------------
  function findEvent(id, then) {
    status("Loading...");
    api("/api/events?days=60", "GET")
      .then(function (body) {
        var event = (body.events || []).filter(function (e) { return e.id === id; })[0];
        if (!event) { status("That event has passed or is gone.", true); return; }
        status("");
        then(event);
      })
      .catch(function (error) { status("Could not load that event: " + error.message, true); });
  }

  // A deadline work block can be rescheduled two ways: pick a time by hand, or let Aion find the earliest opening
  // before its own deadline - standard risk-managed practice for deadline work, since the earlier a block sits the
  // more slack is left to absorb a later delay, instead of always sliding to the last possible moment. Anything
  // that is not a deadline-linked work block only ever gets the plain time picker: "earliest before what?" has no
  // answer without a deadline.
  function showMove(id) {
    showLists(false);
    findEvent(id, function (event) {
      var scope = "this";
      var dateInput = window.Aion.ui.datePicker(event.start.slice(0, 10), function () {});
      var timeInput = window.Aion.ui.timePicker(clock(event.start), function () {});
      formEl.appendChild(element("div", "title", event.title));
      formEl.appendChild(element("div", "due", "now " + stamp(event.start) + " - " + clock(event.end)));
      if (event.type === "study") {
        var how = 0;
        var pickBox = element("div");
        pickBox.appendChild(element("div", "card-title", "How"));
        pickBox.appendChild(chipRow([["Pick a time", "pick"], ["Find the earliest opening", "earliest"]], 0, function (value) {
          how = value === "earliest" ? 1 : 0;
          fieldsBox.hidden = how === 1;
          earliestBox.hidden = how === 0;
          if (how === 1) { findEarliest(); }
        }));
        formEl.appendChild(pickBox);
        var earliestBox = element("div", "due");
        earliestBox.hidden = true;
        formEl.appendChild(earliestBox);
      }
      var fieldsBox = element("div");
      fieldsBox.appendChild(fieldRow("Date", dateInput));
      fieldsBox.appendChild(fieldRow("Time", timeInput));
      formEl.appendChild(fieldsBox);

      function findEarliest() {
        earliestBox.textContent = "Looking...";
        api("/api/events/" + event.id + "/reschedule/earliest", "POST", {})
          .then(function (result) {
            dateInput.value = result.new_start.slice(0, 10);
            timeInput.value = clock(result.new_start);
            earliestBox.textContent = "Earliest opening: " + stamp(result.new_start) + " - " + clock(result.new_end) + ".";
            previewed = false;
            wire();
          })
          .catch(function (error) { earliestBox.textContent = "Could not find one: " + error.message; });
      }
      if (event.recurring) {
        formEl.appendChild(element("div", "card-title", "Which ones"));
        formEl.appendChild(chipRow([["This one", "this"], ["Whole series", "all"]], 0, function (value) { scope = value; }));
      }
      var noteEl = element("div", "plan");
      formEl.appendChild(noteEl);
      var previewed = false;

      function body() { return { new_start: dateInput.value + "T" + timeInput.value, scope: scope }; }

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
        api("/api/events/" + event.id + "/reschedule/preview", "POST", body())
          .then(function (result) {
            status("");
            noteEl.innerHTML = "";
            result.blocked.forEach(function (item) {
              noteEl.appendChild(element("div", "block-line", "Blocked: it would land after " + item.title + " (" + stamp(item.start) + ")"));
            });
            result.conflicts.forEach(function (clash) {
              noteEl.appendChild(element("div", "block-line", "Overlaps: " + clash.title + " (" + stamp(clash.start) + " - " + clock(clash.end) + ")"));
            });
            if (result.blocked.length > 0) { status("Pick another time.", true); return; }
            if (result.conflicts.length === 0) { noteEl.appendChild(element("div", "due", "Nothing else is booked then.")); }
            previewed = true;
            wire();
          })
          .catch(function (error) { status("Could not check the move: " + error.message, true); });
      }

      function commit() {
        api("/api/events/" + event.id + "/reschedule", "POST", body())
          .then(function () { done("Moved."); })
          .catch(function (error) { status("Could not move it: " + error.message, true); });
      }

      wire();
    });
  }

  // ---- reminder ---------------------------------------------------------------------------------------
  function showReminder(id) {
    showLists(false);
    findEvent(id, function (event) {
      var picked = null;
      var chosen = false;
      formEl.appendChild(element("div", "title", event.title));
      formEl.appendChild(element("div", "card-title", "Remind me"));
      formEl.appendChild(chipRow(REMINDERS, -1, function (value) { picked = value; chosen = true; }));
      window.Aion.mainButton("Save reminder", function () {
        if (!chosen) { status("Pick a reminder first.", true); return; }
        api("/api/events/" + event.id + "/reminder", "POST", { minutes: picked })
          .then(function () { done("Reminder saved."); })
          .catch(function (error) { status("Could not save it: " + error.message, true); });
      });
    });
  }

  // ---- invitations: make the saved guests real Google guests ------------------------------------------------------
  var NOTIFY_CHOICES = [["Add without emailing", false], ["Email them", true]];

  function guestNames(people) {
    return people.map(function (guest) { return guest.name === "" ? guest.email : guest.name; }).join(", ");
  }

  function plural(count) {
    if (count === 1) { return "1 person"; }
    return count + " people";
  }

  // The Invitations card, always shown on an event's Edit form so it can be found. It works from what the Who section
  // shows right now: tapping Invite guests first saves the place and guests, then adds the guests that have an email to the
  // event in Google. Returns { node, redraw }; call redraw() whenever the Who section changes. getScope() is "this" or "all".
  function inviteCard(people, onInvite) {
    var notify = false;
    var signedIn = false;
    var card = element("div");
    card.appendChild(element("div", "card-title", "Invitations"));
    var about = element("div", "due");
    var chips = chipRow(NOTIFY_CHOICES, 0, function (value) { notify = value; });
    var line = element("div", "due", "Checking Google...");
    var actions = element("div", "actions");
    var button = actionButton("Invite guests", ask);
    actions.appendChild(button);
    card.appendChild(about);
    card.appendChild(chips);
    card.appendChild(line);
    card.appendChild(actions);

    function withEmail() { return people.getPeople().filter(function (guest) { return guest.email !== ""; }); }

    function redraw() {
      var list = people.getPeople();
      var invitable = withEmail();
      var without = list.filter(function (guest) { return guest.email === ""; });
      about.textContent = "Add a guest with an email under Who above (a name and an email), then tap Invite guests here. Guests without an email can only be kept in the notes.";
      if (invitable.length > 0) {
        about.textContent = "Invite guests: " + guestNames(invitable) + ". Aion saves your changes first, then adds them to the event in Google.";
        if (without.length > 0) { about.textContent += " Only in the notes, no email: " + guestNames(without) + "."; }
      }
      chips.hidden = invitable.length === 0;
      button.disabled = signedIn === false || invitable.length === 0;
    }

    function summary(result) {
      var parts = [];
      if (result.invited.length > 0) { parts.push("Invited " + result.invited.join(", ") + "."); }
      if (result.already.length > 0) { parts.push("Already on the event: " + result.already.join(", ") + "."); }
      if (result.not_invited_no_email.length > 0) { parts.push("Not invited (no email): " + result.not_invited_no_email.join(", ") + "."); }
      if (result.invited.length > 0 && result.notified) { parts.push("Google emailed them."); }
      if (result.invited.length > 0 && !result.notified) { parts.push("They were added without an email."); }
      return parts.join(" ");
    }

    function send() { onInvite(notify, summary); }

    function ask() {
      var issue = people.flush();
      if (issue !== "") { status(issue, true); return; }
      var invitable = withEmail();
      if (invitable.length === 0) { status("Add a guest with an email under Who first.", true); return; }
      var message = "This adds " + plural(invitable.length) + " to the event without emailing them: " + guestNames(invitable) + ".";
      if (notify) { message = "This emails " + plural(invitable.length) + ": " + guestNames(invitable) + ". Google sends each an invitation."; }
      window.Aion.confirmDestructive(message, "Invite", send);
    }

    api("/api/google/status", "GET")
      .then(function (state) {
        signedIn = state.connected === true;
        line.textContent = "Aion is not signed in to Google, so it cannot add guests. Use Send invite in the chat, or sign in under Config > Google account.";
        if (signedIn) { line.textContent = "Signed in to Google as " + state.email + "."; }
        redraw();
      })
      .catch(function (error) { line.textContent = "Could not check Google: " + error.message; });
    redraw();
    return { node: card, redraw: redraw };
  }

  // ---- people & place of any event ----------------------------------------------------------------------
  var SERIES_WARNING = "Whole series changes the title, the time, the place and the guests on every date, including a date you changed on its own.";

  // The form can change a time only for an event that starts and ends on the same day, or ends after midnight; an all-day or several-day
  // event is changed in Google Calendar.
  function timeShapeOk(event) {
    if (event.all_day) { return false; }
    var startDay = event.start.slice(0, 10);
    var endDay = event.end.slice(0, 10);
    if (endDay === startDay) { return true; }
    return nextDay(startDay) === endDay && clock(event.end) <= clock(event.start);
  }

  function editableTime(event) { return event.movable !== false && timeShapeOk(event); }

  var PROTECTED_NOTE = "Lectures, exams and deadline markers are protected. You can always change the place and the guests. A lecture or an exam can be unlocked to change one date's title and time.";
  var DEADLINE_NOTE = "A deadline marker follows its task: change its title or date under Deadlines. You can still change the place and the guests.";
  var UNLOCK_MESSAGE = "This comes from your university portal. Unlocking lets you change the title and time of this one date. A later portal sync can write the portal's values over your change.";
  var UNLOCKED_NOTE = "Unlocked: the title and time of this one date can change. The other dates stay as they are.";
  var CHANGE_MESSAGE = "Change this one date now? Aion saves a backup of it first and logs the change. A later portal sync can undo it.";
  var ONE_DATE_ONLY = "A lecture or exam changes one date at a time. Pick Only this date.";
  var FIXED_TIME_NOTE = "The day and time of an all-day or several-day event are changed in Google Calendar.";

  // ---- repeat: the Repeat switch and the Mon-Sun day buttons of the Edit form -------------------------------------------
  var DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  var EVERY_DAY = 7;  // the last chip: every day of the week
  var STOP_MESSAGE = "This stops the repeating from today. Dates that already happened stay in your calendar.";
  var LOCKED_NOTE = "Only this date is being changed, so the repeat stays as it is. Pick All dates to change how it repeats.";

  function weekdayOf(dateText) { return (new Date(dateText + "T12:00:00").getDay() + 6) % 7; }  // Monday = 0

  function sameDays(first, second) { return JSON.stringify(first) === JSON.stringify(second); }

  // The Repeat section. A repeating event starts ticked with its own days; a one-off can be ticked to start repeating (its own
  // weekday stays on). ownDay() gives the weekday of the date now in the form. Returns { node, changed, stops, days, ready, setLocked }.
  function repeatSection(event, ownDay) {
    var state = { info: null, days: [], locked: false };
    var node = element("div");
    var box = ui().checkbox("Repeat", event.recurring === true);
    var dayRow = element("div", "chips");
    var note = element("div", "due");
    node.hidden = true;
    node.appendChild(box.row);
    node.appendChild(dayRow);
    node.appendChild(note);

    function usable() { return state.info !== null && state.info.editable === true; }

    function toggleDay(index) {
      if (index === EVERY_DAY) {
        var all = [0, 1, 2, 3, 4, 5, 6];
        if (state.days.length === 7 && event.recurring !== true) { all = [ownDay()]; }
        if (state.days.length === 7 && event.recurring === true) { all = []; }
        state.days = all;
      } else if (state.days.indexOf(index) === -1) {
        state.days.push(index);
        state.days.sort();
      } else if (event.recurring !== true && index === ownDay()) {
        status("The event's own day stays on.", true);
        return;
      } else {
        state.days.splice(state.days.indexOf(index), 1);
      }
      window.Aion.haptic("selection");
      draw();
    }

    function draw() {
      dayRow.innerHTML = "";
      dayRow.hidden = box.box.checked === false || usable() === false;
      note.textContent = "";
      if (usable() === false && state.info !== null) { note.textContent = state.info.reason; }
      if (usable() && state.locked) { note.textContent = LOCKED_NOTE; }
      box.box.disabled = usable() === false || state.locked;
      DAY_NAMES.concat(["Every day"]).forEach(function (name, index) {
        var chip = element("button", "chip", name);
        chip.type = "button";
        chip.disabled = state.locked;
        var picked = state.days.indexOf(index) !== -1;
        if (index === EVERY_DAY) { picked = state.days.length === 7; }
        if (picked) { chip.classList.add("selected"); }
        chip.addEventListener("click", function () { toggleDay(index); });
        dayRow.appendChild(chip);
      });
    }

    box.box.addEventListener("change", function () {
      if (box.box.checked && event.recurring !== true && state.days.length === 0) { state.days = [ownDay()]; }
      draw();
    });

    api("/api/events/" + event.id + "/repeat", "GET")
      .then(function (info) {
        state.info = info;
        state.days = info.days.slice();
        box.box.checked = info.repeats;
        node.hidden = false;
        draw();
      })
      .catch(function (error) {
        node.hidden = false;
        box.row.hidden = true;
        note.textContent = "Could not load the repeat settings (" + error.message + "). Close the app and open it again.";
      });

    function changed() {
      if (usable() === false || state.locked) { return false; }
      if (event.recurring === true) { return box.box.checked === false || sameDays(state.days, state.info.days) === false; }
      return box.box.checked;
    }

    function days() {
      var picked = state.days.slice();
      if (event.recurring !== true && picked.indexOf(ownDay()) === -1) { picked.push(ownDay()); }
      return picked.sort();
    }

    return {
      node: node,
      changed: changed,
      stops: function () { return event.recurring === true && changed() && box.box.checked === false; },
      days: days,
      setLocked: function (flag) { state.locked = flag; draw(); }
    };
  }

  // ---- lecture specials, shown once the form is unlocked: cancel/restore this date, or add an extra class --------------
  var CANCEL_MESSAGE = "Cancel this one date? It stays on your calendar, marked cancelled - it won't count toward held classes or absences, and Aion won't ask about it. The other dates stay untouched.";
  var RESTORE_MESSAGE = "Restore this date to normal? It will count toward held classes and absences again.";
  var EXTRA_MESSAGE = "Add one extra class at this time? The lecture series itself does not change.";

  function specialsCard(event) {
    var card = element("div");
    card.appendChild(element("div", "card-title", "Cancel or add a class"));
    var cancelled = event.lecture_mode === "cancelled";
    var cancelButton = actionButton(cancelled ? "Restore this date" : "Cancel this date", function () {
      var message = cancelled ? RESTORE_MESSAGE : CANCEL_MESSAGE;
      var label = cancelled ? "Restore date" : "Cancel date";
      window.Aion.confirmDestructive(message, label, function () {
        api("/api/events/" + event.id + "/protected", "POST", { acknowledged: true, lecture_mode: cancelled ? null : "cancelled" })
          .then(function () { done(cancelled ? "Restored this date." : "Cancelled this date - kept, marked, not removed."); })
          .catch(function (error) { status("Could not change it: " + error.message, true); });
      });
    });
    card.appendChild(cancelButton);
    var dateInput = window.Aion.ui.datePicker(event.start.slice(0, 10), function () {});
    var startInput = window.Aion.ui.timePicker(clock(event.start), function () {});
    var endInput = window.Aion.ui.timePicker(clock(event.end), function () {});
    card.appendChild(fieldRow("Extra class date", dateInput));
    card.appendChild(fieldRow("From", startInput));
    card.appendChild(fieldRow("To", endInput));
    var addButton = actionButton("Add extra class", function () {
      if (dateInput.value === "" || startInput.value === "" || endInput.value === "") { status("Pick the date and both times first.", true); return; }
      var endDay = dateInput.value;
      if (endInput.value <= startInput.value) { endDay = nextDay(dateInput.value); }
      var extra = { new_start: dateInput.value + "T" + startInput.value, new_end: endDay + "T" + endInput.value };
      window.Aion.confirmDestructive(EXTRA_MESSAGE, "Add class", function () {
        api("/api/events/" + event.id + "/protected", "POST", { acknowledged: true, extra: extra })
          .then(function (result) {
            var text = "Extra class added.";
            if (result.overlaps.length > 0) { text += " It overlaps: " + result.overlaps.join(", ") + "."; }
            done(text);
          })
          .catch(function (error) { status("Could not add it: " + error.message, true); });
      });
    });
    card.appendChild(addButton);
    return card;
  }

  function showDetails(id) {
    showLists(false);
    findEvent(id, function (event) {
      ui().loadChoices().then(function (choices) {
        var protectedEvent = event.movable === false;
        var scope = "this";
        if (event.recurring && protectedEvent === false) { scope = "all"; }  // a repeating event changes on every date unless told otherwise
        var repeat = null;
        var unlockable = protectedEvent && (event.type === "lecture" || event.type === "exam");
        var unlocked = false;
        var canEditTime = protectedEvent === false && editableTime(event);
        var titleInput = input("text", event.title);
        titleInput.maxLength = 80;
        var dateInput = window.Aion.ui.datePicker(event.start.slice(0, 10), function () {});
        var startInput = window.Aion.ui.timePicker(clock(event.start), function () {});
        var endInput = window.Aion.ui.timePicker(clock(event.end), function () {});
        formEl.appendChild(fieldRow("Title", titleInput));
        formEl.appendChild(fieldRow("Date", dateInput));
        formEl.appendChild(fieldRow("From", startInput));
        formEl.appendChild(fieldRow("To", endInput));
        titleInput.disabled = protectedEvent;
        [dateInput, startInput, endInput].forEach(function (field) { field.disabled = canEditTime === false; });
        var lockNote = element("div", "due", PROTECTED_NOTE);
        if (protectedEvent && unlockable === false) { lockNote.textContent = DEADLINE_NOTE; }
        if (protectedEvent) { formEl.appendChild(lockNote); }
        var unlockButton = null;
        if (unlockable && timeShapeOk(event)) {
          unlockButton = actionButton("Unlock changes", function () {
            window.Aion.confirmDestructive(UNLOCK_MESSAGE, "Unlock", function () {
              unlocked = true;
              canEditTime = true;
              titleInput.disabled = false;
              [dateInput, startInput, endInput].forEach(function (field) { field.disabled = false; });
              unlockButton.hidden = true;
              lockNote.textContent = UNLOCKED_NOTE;
              specials.hidden = false;
              status("");
            });
          });
          formEl.appendChild(unlockButton);
        }
        var specials = element("div");
        if (unlockable) {
          specials = specialsCard(event);
          specials.hidden = true;
          formEl.appendChild(specials);
        }
        if (protectedEvent === false && canEditTime === false) { formEl.appendChild(element("div", "due", FIXED_TIME_NOTE)); }
        var timeNote = element("div", "plan");
        formEl.appendChild(timeNote);
        if (protectedEvent === false && canEditTime) {
          repeat = repeatSection(event, function () { return weekdayOf(dateInput.value); });
          formEl.appendChild(repeat.node);
        }
        var previewed = false;
        var redrawInvitations = function () {};  // set once the Invitations card exists below
        var people = ui().peoplePicker({ contacts: choices.contacts, people: guestsOf(event), onChange: function () { redrawInvitations(); } });
        var place = ui().placePicker({ places: choices.places, value: placeOf(event), onChange: function () { showTravel(); } });
        formEl.appendChild(people.node);
        // Invitations sit right under Who, where the guests are, so they are not lost at the bottom of a long form.
        var wantInvite = null;  // set by the Invitations card: { notify, summary }; the invite then runs as part of the one save
        var invitations = inviteCard(people, function (notify, summary) { wantInvite = { notify: notify, summary: summary }; save(); });
        redrawInvitations = invitations.redraw;
        formEl.appendChild(invitations.node);
        formEl.appendChild(place.node);
        var travel = null;
        var travelBox = null;
        var lead = leadOf(event);
        function showTravel() {  // a trip needs a place: without one these two do nothing, so they are not shown
          if (travelBox !== null) { travelBox.hidden = place.getPlace().trim() === ""; }
        }
        if (event.type !== "deadline") {
          travelBox = element("div");
          travel = ui().input("text");
          travel.inputMode = "numeric";
          travel.maxLength = 3;
          travel.placeholder = "Empty: the place average";
          if (typeof event.avg_min === "number") { travel.value = String(event.avg_min); }
          travelBox.appendChild(fieldRow("Travel (min)", travel));
          travelBox.appendChild(element("div", "due", "Only used when Google Maps cannot give the time. Maps answers first, when Maps lookups are on."));
          travelBox.appendChild(element("div", "card-title", "Arrive early"));
          travelBox.appendChild(chipRow(LEADS, LEADS.findIndex(function (option) { return option[1] === lead; }), function (value) { lead = value; }));
          formEl.appendChild(travelBox);
          showTravel();
        }
        // Any event, any type, one-off or a whole series - unlike travel timing, this is not tied to going anywhere.
        var checkin = checkinOf(event);
        var checkinBox = element("div");
        checkinBox.appendChild(element("div", "card-title", "Check in when this ends"));
        checkinBox.appendChild(chipRow([["Off", false], ["On", true]], checkin === true ? 1 : 0, function (value) { checkin = value; }));
        checkinBox.appendChild(element("div", "due", "Once it ends, Live Log asks “Were you there?” and marks it done or cancelled."));
        formEl.appendChild(checkinBox);
        var noteEl = element("div", "due");
        var delivery = deliveryOf(event);
        if (event.type !== "deadline") {
          formEl.appendChild(element("div", "card-title", "How it is held"));
          formEl.appendChild(chipRow(DELIVERY, DELIVERY.findIndex(function (option) { return option[1] === delivery; }), function (value) { delivery = value; }));
        }
        if (event.recurring) {
          var pickedScope = 1;
          if (scope === "all") { pickedScope = 0; }
          formEl.appendChild(element("div", "card-title", "Which dates"));
          formEl.appendChild(chipRow([["All dates", "all"], ["Only this date", "this"]], pickedScope, function (value) {
            scope = value;
            noteEl.textContent = "";
            if (value === "all") { noteEl.textContent = SERIES_WARNING; }
            if (repeat !== null) { repeat.setLocked(value === "this"); }
          }));
          if (scope === "all") { noteEl.textContent = SERIES_WARNING; }
          formEl.appendChild(noteEl);
        }
        function repeatChanged() { return repeat !== null && repeat.changed(); }
        function titleChanged() { return (protectedEvent === false || unlocked) && titleInput.value.trim() !== event.title; }

        function timeChanged() {
          return canEditTime && (dateInput.value !== event.start.slice(0, 10) || startInput.value !== clock(event.start) || endInput.value !== clock(event.end));
        }

        function travelValue() {
          if (travel === null || travel.value.trim() === "") { return null; }
          if (/^[0-9]{1,3}$/.test(travel.value.trim()) === false) { return NaN; }
          return Number(travel.value.trim());
        }

        function travelChanged() {
          return travel !== null && (travelValue() !== leadOrNull(event.avg_min) || lead !== leadOf(event));
        }

        function checkinChanged() { return checkin !== checkinOf(event); }

        function extrasChanged() {
          return JSON.stringify(people.getPeople()) !== JSON.stringify(guestsOf(event)) || place.getPlace() !== placeOf(event) || delivery !== deliveryOf(event) || travelChanged() || checkinChanged();
        }

        function minutesOf(text) { return Number(text.slice(0, 2)) * 60 + Number(text.slice(3, 5)); }

        function lengthMinutes() {
          var minutes = minutesOf(endInput.value) - minutesOf(startInput.value);
          if (minutes <= 0) { minutes += 1440; }  // ends after midnight
          return minutes;
        }

        function timeBody() {
          var endDay = dateInput.value;
          if (endInput.value <= startInput.value) { endDay = nextDay(dateInput.value); }  // ends after midnight
          return { new_start: dateInput.value + "T" + startInput.value, new_end: endDay + "T" + endInput.value, scope: scope };
        }

        function wire() {
          var label = "Save";
          if (timeChanged() && previewed === false) { label = "Check and save"; }
          window.Aion.mainButton(label, save);
        }

        [titleInput, dateInput, startInput, endInput].forEach(function (field) {
          field.addEventListener("change", function () { previewed = false; timeNote.innerHTML = ""; wire(); });
        });

        function preview() {
          api("/api/events/" + event.id + "/reschedule/preview", "POST", timeBody())
            .then(function (result) {
              status("");
              timeNote.innerHTML = "";
              result.blocked.forEach(function (item) {
                timeNote.appendChild(element("div", "block-line", "Blocked: it would land after " + item.title + " (" + stamp(item.start) + ")"));
              });
              result.conflicts.forEach(function (clash) {
                timeNote.appendChild(element("div", "block-line", "Overlaps: " + clash.title + " (" + stamp(clash.start) + " - " + clock(clash.end) + ")"));
              });
              if (result.blocked.length > 0) { status("Pick another time.", true); return; }
              if (result.conflicts.length === 0) { timeNote.appendChild(element("div", "due", "Nothing else is booked then.")); }
              previewed = true;
              wire();
            })
            .catch(function (error) { status("Could not check the time: " + error.message, true); });
        }

        function protectedBody() {
          var sent = { acknowledged: true };
          if (titleChanged()) { sent.title = titleInput.value.trim(); }
          if (timeChanged()) {
            var moved = timeBody();
            sent.new_start = moved.new_start;
            sent.new_end = moved.new_end;
          }
          return sent;
        }

        function commit() {
          var placeFound = place.getFound();
          if (placeFound !== null && extrasChanged()) { ui().showLoading("Checking " + placeFound.name + " on Google Maps..."); }
          var chain = Promise.resolve();
          if (unlocked && (titleChanged() || timeChanged())) {
            chain = chain.then(function () { return api("/api/events/" + event.id + "/protected", "POST", protectedBody()); });
          } else if (titleChanged()) {
            chain = chain.then(function () { return api("/api/events/" + event.id + "/rename", "POST", { title: titleInput.value.trim(), scope: scope }); });
          }
          // new weekdays on a series carry the time and length too, so the separate move is skipped then
          var daysChange = repeatChanged() && event.recurring && repeat.stops() === false;
          if (timeChanged() && daysChange === false && unlocked === false) {
            chain = chain.then(function () { return api("/api/events/" + event.id + "/reschedule", "POST", timeBody()); });
          }
          var seen = true;
          var inviteText = "";
          if (extrasChanged() || wantInvite !== null) {
            var sent = { location: place.getPlace(), guests: people.getPeople(), scope: scope, save_contacts: people.getRemember(), save_place: place.getRemember(), place_found: place.getFound() };
            if (delivery !== deliveryOf(event)) { sent.delivery = delivery; }
            if (travelChanged()) {
              sent.avg_min = travelValue();
              sent.lead_min = lead;
            }
            if (checkinChanged()) { sent.checkin_on = checkin; }
            chain = chain.then(function () { return api("/api/events/" + event.id + "/details", "POST", sent); }).then(function (result) { seen = result.seen; });
          }
          if (wantInvite !== null) {
            chain = chain.then(function () { return api("/api/events/" + event.id + "/invite", "POST", { notify: wantInvite.notify, scope: scope }); })
              .then(function (result) { inviteText = wantInvite.summary(result); });
          }
          // the repeat change goes last: it can give the dates new ids
          if (repeatChanged()) {
            var repeatBody = { days: repeat.days(), start: startInput.value, length: lengthMinutes() };
            if (repeat.stops()) { repeatBody = { days: [] }; }
            chain = chain.then(function () { return api("/api/events/" + event.id + "/repeat", "POST", repeatBody); });
          }
          chain
            .then(function () {
              ui().hideLoading();
              if (inviteText !== "") { done("Saved. " + inviteText); return; }
              done(seen ? "Saved." : "Saved, but the calendar did not show it back - check it.");
            })
            .catch(function (error) { ui().hideLoading(); wantInvite = null; status("Could not save it: " + error.message, true); });
        }

        function save() {
          var issue = people.flush();
          if (issue !== "") { status(issue, true); return; }
          if ((protectedEvent === false || unlocked) && titleInput.value.trim() === "") { status("Enter a title first.", true); return; }
          var minutes = travelValue();
          if (Number.isNaN(minutes) || (minutes !== null && (minutes < 1 || minutes > 300))) { status("Travel time is a whole number from 1 to 300 minutes, or empty.", true); return; }
          if (canEditTime && (dateInput.value === "" || startInput.value === "" || endInput.value === "")) { status("Pick the date and both times first.", true); return; }
          if (titleChanged() === false && timeChanged() === false && extrasChanged() === false && repeatChanged() === false && wantInvite === null) { status("Nothing changed."); return; }
          if (repeatChanged() && repeat.stops() === false && repeat.days().length === 0) { status("Pick at least one day, or untick Repeat.", true); return; }
          if (unlocked && (titleChanged() || timeChanged()) && scope !== "this") { status(ONE_DATE_ONLY, true); return; }
          if (timeChanged() && previewed === false) { preview(); return; }
          if (unlocked && (titleChanged() || timeChanged())) { window.Aion.confirmDestructive(CHANGE_MESSAGE, "Change it", commit); return; }
          if (repeatChanged() && repeat.stops()) { window.Aion.confirmDestructive(STOP_MESSAGE, "Stop repeating", commit); return; }
          commit();
        }

        wire();
      });
    });
  }

  function load(data) {
    listEl = document.querySelector("#events");
    emptyEl = document.querySelector("#events-empty");
    formEl = document.querySelector("#event-form");
    window.Aion.hideSecondaryButton();
    if (ui() === undefined) { status("Could not load the form parts. Close the app and open it again.", true); return; }
    var view = data;
    if (view === null || view === undefined) { view = { mode: window.Aion.params.get("mode"), id: window.Aion.params.get("id") }; }
    if (view.mode === "create") { return openCreate(view.id); }
    if (view.mode === "move") { return showMove(view.id); }
    if (view.mode === "reminder") { return showReminder(view.id); }
    if (view.mode === "details") { return showDetails(view.id); }
    showList();
  }

  window.Aion.screens.events = { load: load, open: open };
})();
