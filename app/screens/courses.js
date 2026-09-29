window.Aion = window.Aion || {};
window.Aion.screens = window.Aion.screens || {};

(function () {
  "use strict";

  // Courses: each course with its absences, the allowance for it, syncing the timetable from the portal's pasted JSON, and
  // deleting a course. Sync and delete are two-step: check first (what would change + a digest), then apply.
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

  function actionButton(label, className, onClick) {
    var button = element("button", className, label);
    button.type = "button";
    button.addEventListener("click", onClick);
    return button;
  }

  function open(mode, id) {
    window.Aion.push("courses", { mode: mode, id: id === undefined ? "" : String(id) });
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

  function allowance(course) {
    return course.limit === null ? course.used + " absences, limit unknown" : course.used + " of " + course.limit + " absences";
  }

  function findCourse(code, then) {
    status("Loading...");
    api("/api/courses", "GET")
      .then(function (body) {
        var course = (body.courses || []).filter(function (c) { return c.code === code; })[0];
        if (!course) { status("That course is gone.", true); return; }
        status(pendingNote);
        pendingNote = "";
        then(course);
      })
      .catch(function (error) { status("Could not load that course: " + error.message, true); });
  }

  // ---- list ------------------------------------------------------------------------------------------
  function showList() {
    showLists(true);
    window.Aion.hideSecondaryButton();
    window.Aion.mainButton("Sync timetable", function () { open("sync"); });
    status("Loading...");
    api("/api/courses", "GET")
      .then(function (body) {
        status(pendingNote);
        pendingNote = "";
        listEl.innerHTML = "";
        var rows = body.courses || [];
        emptyEl.hidden = rows.length !== 0;
        emptyEl.textContent = "No courses yet. Sync a timetable to add them.";
        rows.forEach(function (course) {
          var li = element("li", "task");
          var left = element("div");
          left.appendChild(element("div", "title", course.code + "  " + course.name));
          if (course.professor || course.room) { left.appendChild(window.Aion.tags([course.professor, course.room])); }
          var meta = element("div", "due");
          var over = course.limit !== null && course.used >= course.limit;
          meta.appendChild(element("span", "pill " + (over ? "bad" : ""), allowance(course)));
          left.appendChild(meta);
          li.appendChild(left);
          var actions = element("div", "actions");
          actions.appendChild(actionButton("Limit", "primary", function () { open("limit", course.code); }));
          actions.appendChild(actionButton("Delete", "primary", function () { open("delete", course.code); }));
          li.appendChild(actions);
          listEl.appendChild(li);
        });
      })
      .catch(function (error) { status("Could not load courses: " + error.message, true); });
  }

  // ---- absence limit: one screen, pick the number, save -----------------------------------------------------
  function showLimit(code) {
    showLists(false);
    findCourse(code, function (course) {
      var chosen = course.limit;
      formEl.appendChild(element("div", "title", course.code + "  " + course.name));
      formEl.appendChild(element("div", "due", "Now: " + allowance(course) + ". How many absences are allowed?"));
      var chips = element("div", "chips");
      var options = [["Unknown", null]];
      for (var n = 0; n <= 10; n++) { options.push([String(n), n]); }
      options.forEach(function (pair) {
        var chip = element("button", "chip" + (chosen === pair[1] ? " selected" : ""), pair[0]);
        chip.type = "button";
        chip.addEventListener("click", function () {
          chosen = pair[1];
          Array.prototype.forEach.call(chips.children, function (other) { other.className = "chip" + (other === chip ? " selected" : ""); });
        });
        chips.appendChild(chip);
      });
      formEl.appendChild(chips);
      window.Aion.mainButton("Save allowance", function () {
        api("/api/courses/" + encodeURIComponent(course.code) + "/limit", "POST", { limit: chosen })
          .then(function () { done(chosen === null ? "Allowance cleared (absences still counted)." : "Allowance set to " + chosen + "."); })
          .catch(function (error) { status("Could not save it: " + error.message, true); });
      });
    });
  }

  // ---- sync: paste the portal JSON, check, apply ---------------------------------------------------------------
  function showSync() {
    showLists(false);
    formEl.appendChild(element("div", "title", "Sync timetable"));
    formEl.appendChild(element("div", "due", "Paste the portal's course list (JSON). Nothing changes until you check it and apply."));
    var box = element("textarea", "json-box");
    box.id = "course-json";
    box.placeholder = "[ { \"code\": \"ITC4030\", ... } ]";
    formEl.appendChild(box);
    var noteEl = element("div", "plan");
    formEl.appendChild(noteEl);
    var digest = "";

    function wire() {
      window.Aion.mainButton(digest ? "Apply sync" : "Check the sync", function () {
        if (box.value.trim() === "") { status("Paste the course JSON first.", true); return; }
        if (digest) { apply(); } else { check(); }
      });
    }

    box.addEventListener("input", function () { digest = ""; noteEl.innerHTML = ""; wire(); });

    function check() {
      api("/api/courses/sync/preview", "POST", { json: box.value })
        .then(function (result) {
          status("");
          noteEl.innerHTML = "";
          result.lines.forEach(function (line) { noteEl.appendChild(element("div", line.indexOf("WARNING") !== -1 ? "block-line" : "due", line)); });
          digest = result.digest;
          wire();
        })
        .catch(function (error) { status("Could not check it: " + error.message, true); });
    }

    function apply() {
      api("/api/courses/sync/apply", "POST", { json: box.value, digest: digest })
        .then(function (result) {
          var failed = (result.verify || []).filter(function (row) { return row.result !== "PASS"; });
          if (failed.length > 0) { status("Applied, but " + failed.length + " course(s) did not read back cleanly: " + failed.map(function (row) { return row.code; }).join(", "), true); return; }
          done("Synced " + result.applied + " course(s), all read back.");
        })
        .catch(function (error) {
          if (/changed/i.test(error.message)) { digest = ""; wire(); }
          status("Could not apply it: " + error.message, true);
        });
    }

    wire();
  }

  // ---- delete: check, type the exact code, confirm -----------------------------------------------------------
  function showDelete(code) {
    showLists(false);
    findCourse(code, function (course) {
      formEl.appendChild(element("div", "title", "Delete " + course.code + "  " + course.name));
      var noteEl = element("div", "plan");
      formEl.appendChild(noteEl);
      var codeInput = element("input");
      codeInput.type = "text";
      codeInput.placeholder = "Type " + course.code + " to confirm";
      codeInput.autocomplete = "off";
      api("/api/courses/" + encodeURIComponent(course.code) + "/delete/preview", "POST", {})
        .then(function (plan) {
          plan.summary.forEach(function (line) { noteEl.appendChild(element("div", "block-line", line)); });
          formEl.appendChild(codeInput);
          window.Aion.mainButton("Delete course", function () {
            if (codeInput.value.trim().toUpperCase() !== course.code) { status("Type the course code exactly: " + course.code, true); return; }
            window.Aion.confirmDestructive("Delete " + course.code + "? Past classes are kept.", "Delete", function () {
              api("/api/courses/" + encodeURIComponent(course.code) + "/delete", "POST", { confirm_code: codeInput.value.trim(), digest: plan.digest })
                .then(function (result) { done(result.verified ? "Course deleted." : "Deleted, but it did not read back cleanly - check the calendar."); })
                .catch(function (error) { status("Could not delete it: " + error.message, true); });
            });
          });
        })
        .catch(function (error) { status("Could not check the deletion: " + error.message, true); });
    });
  }

  function load(data) {
    listEl = listEl || document.getElementById("courses");
    emptyEl = emptyEl || document.getElementById("courses-empty");
    formEl = formEl || document.getElementById("course-form");
    window.Aion.hideSecondaryButton();
    var view = data || { mode: window.Aion.params.get("mode"), id: window.Aion.params.get("id") };
    if (view.mode === "limit") { return showLimit(view.id); }
    if (view.mode === "sync") { return showSync(); }
    if (view.mode === "delete") { return showDelete(view.id); }
    showList();
  }

  window.Aion.screens.courses = { load: load, open: open };
})();
