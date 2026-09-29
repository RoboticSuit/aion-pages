window.Aion = window.Aion || {};
window.Aion.screens = window.Aion.screens || {};

(function () {
  "use strict";

  var listEl, emptyEl;

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

  // Object-card: the signifier IS the primary noun/state (tap it, it completes the task directly - no separate
  // "Done" button); a deadline's Edit/Blocks live behind a tap on the rest of the card (progressive disclosure). A
  // plain task has no secondary actions at all, so it gets no tray and the header is never clickable to begin with.
  function renderTasks(tasks) {
    listEl.innerHTML = "";
    emptyEl.hidden = tasks.length !== 0;
    tasks.forEach(function (task) {
      var li = element("li", "oo-card");
      var header = element("div", "oo-card-header");
      var signifier = element("div", "oo-signifier");
      signifier.setAttribute("role", "button");
      signifier.setAttribute("aria-label", "Mark done");
      signifier.appendChild(window.Aion.ui.checkIcon());
      var content = element("div", "oo-card-content");
      content.appendChild(element("div", "title", task.title));
      if (task.due_date) { content.appendChild(element("div", "due", "due " + task.due_date)); }
      header.appendChild(signifier);
      header.appendChild(content);
      li.appendChild(header);

      var isDeadline = task.kind === "deadline";
      var trayInner = null;
      if (isDeadline) {
        header.setAttribute("data-clickable", "");
        var tray = element("div", "oo-card-tray");
        trayInner = element("div", "oo-tray-inner");
        trayInner.appendChild(actionButton("Edit", "primary", function (event) {
          event.stopPropagation();
          window.Aion.screens.deadlines.open("edit", task.id);
        }));
        trayInner.appendChild(actionButton("Blocks", "primary", function (event) {
          event.stopPropagation();
          window.Aion.screens.deadlines.open("blocks", task.id);
        }));
        tray.appendChild(trayInner);
        li.appendChild(tray);
        header.addEventListener("click", function () {
          li.classList.toggle("expanded");
          window.Aion.haptic("selection");
        });
      }
      signifier.addEventListener("click", function (event) {
        event.stopPropagation();
        complete(task, li, trayInner);
      });
      listEl.appendChild(li);
    });
  }

  // Marking done keeps the card visible (dimmed title, checked signifier) rather than removing it - a deadline's
  // real Undo affordance depends on that, so this is a deliberate difference from a "swipe it away" pattern: nothing
  // here is actually deleted, only marked, and the owner may still want to undo it in the same session.
  function complete(task, li, trayInner) {
    window.Aion.api("/api/tasks/" + task.id + "/done", "POST")
      .then(function () {
        window.Aion.haptic("success");
        li.classList.add("is-completed");
        if (task.kind === "deadline") {
          trayInner.innerHTML = "";
          trayInner.appendChild(actionButton("Undo", "primary", function (event) {
            event.stopPropagation();
            window.Aion.api("/api/deadlines/" + task.id + "/undo", "POST", {})
              .then(function () { load(); })
              .catch(function (error) { window.Aion.setStatus("Could not undo: " + error.message, true); });
          }));
          li.classList.add("expanded");  // the Undo option is shown right away, not one more tap away
        }
      })
      .catch(function (error) { window.Aion.setStatus("Could not complete that task: " + error.message, true); });
  }

  function load() {
    listEl = listEl || document.getElementById("tasks");
    emptyEl = emptyEl || document.getElementById("empty");
    window.Aion.mainButton("New deadline", function () { window.Aion.screens.deadlines.open("create", ""); });
    window.Aion.setStatus("Loading...");
    window.Aion.api("/api/tasks", "GET")
      .then(function (body) { window.Aion.setStatus(""); renderTasks(body.tasks || []); })
      .catch(function (error) { window.Aion.setStatus("Could not load tasks: " + error.message, true); });
  }

  window.Aion.screens.tasks = { load: load };
})();
