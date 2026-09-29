window.Aion = window.Aion || {};
window.Aion.screens = window.Aion.screens || {};

(function () {
  "use strict";

  // Config: the owner's settings. In the general app every setting is on one scrollable screen; a chat button opens just
  // that setting (mode = tz | report | delay | window | block | cap | pref). Only what changed is sent, one key per call,
  // and the server re-checks every value (services/settings_rules.py).
  var formEl;

  // Each group: a heading and the controls in it. kind "text" = typed value, "chips" = pick one of the server's choices.
  var GROUPS = {
    tz: { title: "Timezone", fields: [{ key: "tz", kind: "text", placeholder: "Europe/Athens" }] },
    report: { title: "Daily report time", fields: [{ key: "report_time", kind: "time" }] },
    delay: { title: "Check-in delay", note: "Minutes after a class starts before I ask if you are there.",
             fields: [{ key: "checkin_delay_min", kind: "number", min: 5, max: 20, step: 5, suffix: "min" }] },
    window: { title: "Work window", note: "Study blocks are only planned inside this window.",
              fields: [{ key: "work_start", kind: "time", heading: "Opens" },
                       { key: "work_end", kind: "time", heading: "Closes" }] },
    block: { title: "Block length", fields: [{ key: "block_min", kind: "number", min: 60, max: 180, step: 30, suffix: "min" }] },
    cap: { title: "Daily cap", note: "The most task work planned in one day.",
           fields: [{ key: "max_day_min", kind: "number", min: 120, max: 360, step: 60, suffix: "min" }] },
    pref: { title: "Preferred start", note: "Work blocks are placed as close to this hour as the day allows.",
            fields: [{ key: "preferred_hour", kind: "time", step: 3600, toInput: hourToClock, fromInput: clockToHour }] },
    sleep: { title: "Sleep goal", note: "Off by default. Bedtime = wake-up time - sleep target - time to fall asleep. At bedtime I tell you to go to sleep; \"not yet\" makes me ask again.",
             fields: [{ key: "sleep_on", kind: "chips", heading: "Sleep goal", label: function (v) { return v ? "On" : "Off"; } },
                      { key: "sleep_target_min", kind: "number", heading: "Sleep target (minutes)", min: 300, max: 600, step: 30, suffix: "min" },
                      { key: "wake_time", kind: "time", heading: "Wake-up time" },
                      { key: "wake_time_weekend", kind: "time", heading: "Weekend wake-up (Sat, Sun)", clearable: "Same every day" },
                      { key: "fall_asleep_min", kind: "number", heading: "Time to fall asleep", min: 5, max: 60, step: 5, suffix: "min" },
                      { key: "sleep_repeat_min", kind: "number", heading: "Ask again every", min: 5, max: 30, step: 5, suffix: "min" },
                      { key: "sleep_stop_min", kind: "number", heading: "Stop asking after", min: 30, max: 120, step: 30, suffix: "min" },
                      { key: "wake_check", kind: "chips", heading: "Wake-up check", label: function (v) { return v ? "On" : "Off"; },
                        note: "When On, the good-night message reminds you to tell me when you are up, and I ask once in the morning. Say \"I woke up\" or tap the button." },
                      { key: "wake_grace_min", kind: "number", heading: "On time within", min: 0, max: 30, step: 5, suffix: "min",
                        note: "How many minutes after your wake-up time still count as on time. Waking earlier is always on time." }] },
    // Only in the full app (never a chat-button drawer): where "a day" ends, for habits' once-a-day rule.
    day: { title: "End of day", note: "For night owls and night shifts: something done before this hour counts for the day before. Midnight is the usual end of a day.",
           fields: [{ key: "day_end_hour", kind: "time", step: 3600, toInput: hourToClock, fromInput: clockToHour }] }
  };

  // preferred_hour/day_end_hour are stored as a plain hour number (0-23), never minutes - the setting is genuinely
  // hour-grained. A native time field still gives the calendar-adjacent picker feel instead of a disconnected chip
  // row; step=3600 keeps its own picker UI to whole hours, and these two functions convert at the edges only, so
  // nothing server-side (services/planner.py, services/habits_ops.py) has to change what it stores or reads.
  function hourToClock(hour) { return ("0" + hour).slice(-2) + ":00"; }
  function clockToHour(clock) { return parseInt(clock.split(":")[0], 10); }
  // Also full-app only: whether Today lists entries that are already a log of something done (habit entries, finished work
  // blocks). On by default so Today also works as a log; the chat drawers always keep marked items, whatever this says.
  GROUPS.logged = { title: "Today screen", note: "Entries that already record something done are shown as logged, so Today doubles as a log. Hide them to see only what is still open.",
                    fields: [{ key: "show_logged", kind: "chips", heading: "Logged entries", label: function (v) { return v ? "Show" : "Hide"; } }] };
  // Getting to events on time (full app only; the place and the average travel time are set on the places and on the events themselves).
  GROUPS.travel = { title: "Travel", note: "For any event that has a location, repeating ones such as your course lectures included, I remind you in Live Log when to leave. The time comes from Google Maps when Maps lookups are On, otherwise from the average travel time of its place. Arrive early is how long before the start you want to be there.",
                    fields: [{ key: "travel_on", kind: "chips", heading: "Leave reminders", label: function (v) { return v ? "On" : "Off"; } },
                             { key: "travel_lead_min", kind: "number", heading: "Arrive early", min: 0, max: 15, step: 5, suffix: "min" },
                             { key: "travel_reminders", kind: "chips", heading: "If I do not answer", label: function (v) { return v === "strict" ? "Keep asking" : "Stop at the start"; } },
                             { key: "travel_gap_h", kind: "number", heading: "Still at the last place if it ended within", min: 1, max: 4, step: 1, suffix: "h",
                               note: "If the event before this one ended within this time, I plan the trip from its place. Otherwise I plan it from your Starting point." },
                             { key: "notify_guests", kind: "chips", heading: "Notify guests by default", label: function (v) { return v ? "Yes" : "No"; } },
                             { key: "travel_lookup", kind: "chips", heading: "Maps lookups", label: function (v) { return v ? "On" : "Off"; },
                               note: "Off by default. When On and your PC is running, I read Google Maps' public pages the way a browser does, a few times a day and only on pages Google's robots.txt allows, to get the real public-transport times for your leave time. Google can still block or change them at any time; then I use your average travel time instead." },
                             { key: "travel_origin", kind: "text", search: true, heading: "Starting point", placeholder: "Type a place: suggestions from Google Maps appear",
                               note: "Where you usually start from. Needed for Maps lookups. Leave empty to turn it off." }] };
  var ORDER = ["tz", "report", "delay", "window", "block", "cap", "pref", "sleep", "travel", "logged", "day"];
  var FULL_ONLY = { day: true, logged: true, travel: true };  // settings with no scoped drawer

  function element(tag, className, text) {
    var node = document.createElement(tag);
    if (className) { node.className = className; }
    if (text !== undefined) { node.textContent = text; }
    return node;
  }

  // ---- Google account (the full app only) ---------------------------------------------------------------------------------
  // Aion's own permission to add guests to the owner's Google Calendar events. The texts say what signing in and out does in plain
  // words; nothing here handles a password (Google asks for it in its own page, on the PC).
  var SIGN_IN_MEANS = "Signing in lets Aion add your guests to your Google Calendar events, so Google sends them the invitation. Aion only does this when you tap Invite on an event and confirm. Aion never sees your Google password, and the permission covers calendar events only.";
  var SIGN_OUT_MEANS = "Signing out tells Google to forget Aion's permission. Aion can then no longer add guests to your events. Guests you already invited stay invited, and your events, notes and the Send invite button keep working. You can sign in again any time.";
  var SIGN_IN_STEPS = "Google opens in your phone's browser. If it asks you to sign in, use your own Google account, then tap Allow. Then come back here.";
  var SIGN_IN_SETUP = "Signing in from the phone needs a one-time Google key added on the PC first. Until then, run \"python -m services.google_owner\" once on the PC and tap Allow in the browser window that opens.";
  var SIGN_IN_WAIT_MS = 2000;
  var SIGN_IN_WAIT_TRIES = 60;
  var SIGN_OUT_ASK = "Sign out of Google? Aion will no longer be able to add guests to your events. Guests you already invited stay invited.";

  function googleCard() {
    var card = element("div");
    card.appendChild(element("div", "title", "Google account"));
    var line = element("div", "due", "Checking...");
    var means = element("div", "due");
    var actions = element("div", "actions");
    card.appendChild(line);
    card.appendChild(means);
    card.appendChild(actions);

    function signOut() {
      window.Aion.api("/api/google/signout", "POST", {})
        .then(function () {
          window.Aion.haptic("success");
          window.Aion.setStatus("Signed out. Aion can no longer add guests to your events. You can sign in again any time.");
          refresh();
        })
        .catch(function (error) { window.Aion.setStatus("Could not sign out: " + error.message, true); });
    }

    function show(state) {
      actions.innerHTML = "";
      if (state.connected) {
        line.textContent = "Signed in.";
        if (state.email !== "") { line.textContent = "Signed in as " + state.email + "."; }
        means.textContent = SIGN_OUT_MEANS;
        var out = element("button", "primary", "Sign out");
        out.type = "button";
        out.addEventListener("click", function () { window.Aion.confirmDestructive(SIGN_OUT_ASK, "Sign out", signOut); });
        actions.appendChild(out);
        return;
      }
      line.textContent = "Not signed in.";
      if (state.signin_ready !== true) {
        means.textContent = SIGN_IN_MEANS + " " + SIGN_IN_SETUP;
        return;
      }
      means.textContent = SIGN_IN_MEANS + " " + SIGN_IN_STEPS;
      var signIn = element("button", "primary", "Sign in");
      signIn.type = "button";
      signIn.addEventListener("click", startSignIn);
      actions.appendChild(signIn);
    }

    // Google opens in the phone's real browser (never inside the app: Google refuses that); the app keeps asking whether the
    // sign-in has arrived and shows it as soon as it has.
    function openGoogle(url) {
      var app = window.Telegram && window.Telegram.WebApp;
      if (app && typeof app.openLink === "function") { app.openLink(url); return; }
      window.open(url, "_blank");
    }

    function waitForSignIn(triesLeft) {
      if (triesLeft === 0) {
        window.Aion.setStatus("Still waiting. If you tapped Allow on Google's page, tap Sign in again or come back to this screen to check.");
        return;
      }
      window.setTimeout(function () {
        window.Aion.api("/api/google/status", "GET")
          .then(function (state) {
            if (state.connected) {
              window.Aion.haptic("success");
              window.Aion.setStatus("Signed in" + (state.email === "" ? "." : " as " + state.email + ". Aion can now add guests to your events when you confirm."));
              show(state);
              return;
            }
            waitForSignIn(triesLeft - 1);
          })
          .catch(function () { waitForSignIn(triesLeft - 1); });
      }, SIGN_IN_WAIT_MS);
    }

    function startSignIn() {
      window.Aion.api("/api/google/signin/start", "POST", {})
        .then(function (started) {
          window.Aion.setStatus("Google is open in your browser. Tap Allow there, then come back here.");
          openGoogle(started.url);
          waitForSignIn(SIGN_IN_WAIT_TRIES);
        })
        .catch(function (error) { window.Aion.setStatus("Could not start signing in: " + error.message, true); });
    }

    function refresh() {
      window.Aion.api("/api/google/status", "GET")
        .then(show)
        .catch(function (error) { line.textContent = "Could not check Google: " + error.message; });
    }

    refresh();
    return card;
  }

  // ---- Phone Maps helper (the full app only) -------------------------------------------------------------------------------
  // The owner's own Android phone can answer Google Maps lookups instead of the PC's browser: the real Maps app or page,
  // under his real signed-in account, over his real mobile network. Pairing gives the phone script a one-time secret; the
  // token is shown only once here and never asked for again.
  var PHONE_MEANS = "Lets your own phone answer Google Maps lookups instead of the PC's browser, so leave times stay fresh even while the PC is off. The phone reads Google Maps under your own account; Aion never sees your Google password.";
  var PHONE_GET_APP_URL = "/phone-helper.apk";
  var PHONE_UNPAIR_ASK = "Unpair the phone? It will stop answering lookups until you pair it again.";

  function copyField(value) {
    var row = element("div", "actions");
    var box = element("input");
    box.type = "text";
    box.value = value;
    box.readOnly = true;
    var copyButton = element("button", "primary", "Copy");
    copyButton.type = "button";
    copyButton.addEventListener("click", function () {
      var done = function () { window.Aion.haptic("success"); window.Aion.setStatus("Copied."); };
      var fallback = function () {
        box.select();
        try { document.execCommand("copy"); done(); } catch (error) { window.Aion.setStatus("Could not copy: select the text and copy it yourself.", true); }
      };
      if (navigator.clipboard !== undefined && typeof navigator.clipboard.writeText === "function") {
        navigator.clipboard.writeText(value).then(done).catch(fallback);
        return;
      }
      fallback();
    });
    row.appendChild(box);
    row.appendChild(copyButton);
    return row;
  }

  function getAppButton() {
    var button = element("button", "primary", "Get Aion Injection - Android");
    button.type = "button";
    button.addEventListener("click", function () {
      var url = window.location.origin + PHONE_GET_APP_URL;
      var telegram = window.Telegram !== undefined ? window.Telegram.WebApp : undefined;
      if (telegram !== undefined && typeof telegram.openLink === "function") { telegram.openLink(url); return; }
      window.open(url, "_blank");
    });
    return button;
  }

  function scanNote() {
    return element("div", "due", "The phone may show “this file might be harmful” - that is expected, not a real " +
      "problem: it is Android's generic warning for any app that can install its own updates, shown the same regardless " +
      "of what the update actually contains. Safe to continue.");
  }

  function phoneCard() {
    var card = element("div");
    card.appendChild(element("div", "title", "Phone Maps helper"));
    var line = element("div", "due", "Checking...");
    var means = element("div", "due", PHONE_MEANS);
    var codeArea = element("div");
    var versionArea = element("div");
    var actions = element("div", "actions");
    card.appendChild(line);
    card.appendChild(means);
    card.appendChild(codeArea);
    card.appendChild(versionArea);
    card.appendChild(actions);

    function unpair() {
      window.Aion.api("/api/phone/unpair", "POST", {})
        .then(function () { window.Aion.haptic("success"); window.Aion.setStatus("Unpaired."); refresh(); })
        .catch(function (error) { window.Aion.setStatus("Could not unpair: " + error.message, true); });
    }

    function showCode(token, note) {
      var combined = window.location.origin + "|" + token;
      codeArea.innerHTML = "";
      codeArea.appendChild(element("div", "due", note));
      codeArea.appendChild(copyField(combined));
      codeArea.appendChild(getAppButton());
      codeArea.appendChild(scanNote());
    }

    function pair() {
      window.Aion.api("/api/phone/pairing", "POST", {})
        .then(function (result) {
          window.Aion.haptic("success");
          showCode(result.token, "Your code (shown once): copy it, then get the app below and paste it in.");
          window.Aion.setStatus("Copy the code above, tap Get Aion Injection - Android, then paste it there.");
          show({ paired: true, paired_at: null, last_seen_at: null });
        })
        .catch(function (error) { window.Aion.setStatus("Could not pair: " + error.message, true); });
    }

    function newCode() {
      window.Aion.api("/api/phone/pairing", "POST", {})
        .then(function (result) {
          window.Aion.haptic("success");
          showCode(result.token, "New code (shown once): only needed if you fully uninstalled the app first - a normal update keeps the old one working.");
          window.Aion.setStatus("Copied a fresh code. The phone needs it only after a full uninstall, not for an ordinary update.");
        })
        .catch(function (error) { window.Aion.setStatus("Could not get a new code: " + error.message, true); });
    }

    function loadVersion() {
      window.Aion.api("/api/phone/version", "GET")
        .then(function (info) {
          versionArea.innerHTML = "";
          if (info.available === null) {
            return;
          }
          var reported = "an older build that cannot report its own version yet";
          if (info.phone_reports !== null) { reported = "v" + info.phone_reports.versionName; }
          if (info.update_available === true) {
            versionArea.appendChild(element("div", "due", "Update available: your phone is on " + reported + ", the latest is v" + info.available.versionName + "."));
            versionArea.appendChild(getAppButton());
            versionArea.appendChild(scanNote());
            var newCodeButton = element("button", "primary", "Get a new pairing code");
            newCodeButton.type = "button";
            newCodeButton.addEventListener("click", newCode);
            versionArea.appendChild(newCodeButton);
          } else {
            versionArea.appendChild(element("div", "due", "Your phone reports " + reported + ", the current version."));
          }
        })
        .catch(function (error) { versionArea.innerHTML = ""; versionArea.appendChild(element("div", "due", "Could not check for an update: " + error.message)); });
    }

    function show(state) {
      actions.innerHTML = "";
      versionArea.innerHTML = "";
      if (state.paired !== true) {
        line.textContent = "Not paired.";
        var pairButton = element("button", "primary", "Pair a phone");
        pairButton.type = "button";
        pairButton.addEventListener("click", pair);
        actions.appendChild(pairButton);
        return;
      }
      line.textContent = "Paired.";
      if (state.last_seen_at !== null) { line.textContent = "Paired, last checked in at " + new Date(state.last_seen_at).toLocaleTimeString(); }
      var unpairButton = element("button", "primary", "Unpair");
      unpairButton.type = "button";
      unpairButton.addEventListener("click", function () { window.Aion.confirmDestructive(PHONE_UNPAIR_ASK, "Unpair", unpair); });
      actions.appendChild(unpairButton);
      loadVersion();
    }

    function refresh() {
      window.Aion.api("/api/phone/pairing", "GET")
        .then(show)
        .catch(function (error) { line.textContent = "Could not check: " + error.message; });
    }

    refresh();
    return card;
  }

  function build(groupNames, current, choices, onDone) {
    formEl.innerHTML = "";
    var chosen = {};
    var inputs = {};
    var fieldsByKey = {};
    groupNames.forEach(function (name) {
      var group = GROUPS[name];
      if (groupNames.length > 1) { formEl.appendChild(element("div", "title", group.title)); }
      if (group.note) { formEl.appendChild(element("div", "due", group.note)); }
      group.fields.forEach(function (field) {
        chosen[field.key] = current[field.key];
        if (field.heading) { formEl.appendChild(element("div", "due", field.heading)); }
        if (field.note) { formEl.appendChild(element("div", "due", field.note)); }
        if (field.kind === "chips") {
          var chips = element("div", "chips");
          (choices[field.key] || []).forEach(function (value) {
            var chip = element("button", "chip" + (value === current[field.key] ? " selected" : ""), field.label(value));
            chip.type = "button";
            chip.addEventListener("click", function () {
              chosen[field.key] = value;
              Array.prototype.forEach.call(chips.children, function (other) { other.className = "chip" + (other === chip ? " selected" : ""); });
            });
            chips.appendChild(chip);
          });
          formEl.appendChild(chips);
          return;
        }
        var shown = current[field.key];
        if (field.toInput && shown !== undefined && shown !== null) { shown = field.toInput(shown); }
        var input;
        if (field.kind === "time") {
          input = window.Aion.ui.timePicker(shown || "", function () {}, field.step ? { step: field.step } : undefined);
        } else {
          input = element("input");
          input.type = field.kind === "number" ? "number" : "text";
          input.id = "config-" + field.key;
          if (field.placeholder) { input.placeholder = field.placeholder; }
          if (field.kind === "number") {
            if (field.step) { input.step = field.step; }
            if (field.min !== undefined) { input.min = field.min; }
            if (field.max !== undefined) { input.max = field.max; }
          }
          input.value = shown || "";
        }
        inputs[field.key] = input;
        fieldsByKey[field.key] = field;
        var row = element("div", "field-row");
        row.appendChild(input);
        if (field.suffix) { row.appendChild(element("span", "due", field.suffix)); }
        if (field.clearable) {  // an optional time: this button empties it ("same as the other days")
          var clear = element("button", "chip", field.clearable);
          clear.type = "button";
          clear.addEventListener("click", function () { input.value = ""; });
          row.appendChild(clear);
        }
        formEl.appendChild(row);
        if (field.search && window.Aion.ui !== undefined) {  // the shared Google Maps search: a tap fills the text with the place's name and street
          window.Aion.ui.attachPlaceSearch(input, {
            anchor: row,
            onPick: function (found) {
              var text = found.name;
              if (found.address !== "") { text += ", " + found.address; }
              if (text.length > 300) {  // never cut an address: a text too long is left out
                window.Aion.setStatus("That address is too long to save exactly. Type a shorter one.", true);
                return;
              }
              input.value = text;
            }
          });
        }
      });
    });

    if (groupNames.length > 1) { formEl.appendChild(googleCard()); }  // the full app only, never a chat-button drawer
    if (groupNames.length > 1) { formEl.appendChild(phoneCard()); }  // the full app only, never a chat-button drawer
    if (groupNames.length > 1) {  // the full app only: the entry to the saved people and places
      formEl.appendChild(element("div", "title", "People and places"));
      formEl.appendChild(element("div", "due", "The contacts and places you chose to remember when adding guests and a place to an event."));
      var openPeople = element("button", "primary", "Open");
      openPeople.type = "button";
      openPeople.addEventListener("click", function () { window.Aion.push("people"); });
      formEl.appendChild(openPeople);
    }

    window.Aion.mainButton("Save", function () {
      var changes = [];
      Object.keys(chosen).forEach(function (key) {
        var value = chosen[key];
        if (inputs[key]) {
          value = inputs[key].value.trim();
          if (fieldsByKey[key].fromInput && value !== "") { value = fieldsByKey[key].fromInput(value); }
          else if (fieldsByKey[key].kind === "number" && value !== "") { value = parseInt(value, 10); }
        }
        if (value !== current[key]) { changes.push([key, value]); }
      });
      if (changes.length === 0) { window.Aion.setStatus("Nothing changed."); return; }
      var saved = 0;
      (function next() {
        if (saved === changes.length) { onDone(saved); return; }
        var pair = changes[saved];
        window.Aion.api("/api/config", "POST", { key: pair[0], value: pair[1] })
          .then(function () { saved += 1; current[pair[0]] = pair[1]; next(); })
          .catch(function (error) {
            window.Aion.setStatus((saved > 0 ? saved + " saved, then: " : "") + "Could not save " + pair[0] + ": " + error.message, true);
          });
      })();
    });
  }

  function load(data) {
    formEl = formEl || document.getElementById("config-form");
    window.Aion.hideSecondaryButton();
    var mode = data ? data.mode : window.Aion.params.get("mode");
    var scoped = GROUPS[mode] !== undefined && !FULL_ONLY[mode];
    var groupNames = scoped ? [mode] : ORDER;
    window.Aion.setStatus("Loading...");
    window.Aion.api("/api/config", "GET")
      .then(function (body) {
        window.Aion.setStatus("");
        build(groupNames, body, body.choices || {}, function (count) {
          window.Aion.haptic("success");
          if (scoped) { window.Aion.finishProcedure("Saved."); return; }
          window.Aion.setStatus("Saved " + count + " setting" + (count === 1 ? "" : "s") + ".");
        });
      })
      .catch(function (error) { window.Aion.setStatus("Could not load config: " + error.message, true); });
  }

  window.Aion.screens.config = { load: load };
})();
