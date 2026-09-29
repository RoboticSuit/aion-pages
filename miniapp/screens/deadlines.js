window.Aion = window.Aion || {};
window.Aion.screens = window.Aion.screens || {};

(function () {
  "use strict";

  // The forms behind the Tasks list: create a deadline (with a preparation plan), edit one, manage its blocks.
  // Reached either from the Tasks drawer (open() then the router's back button returns to the list) or directly as
  // a scoped drawer (deadlines_create / deadlines_edit_<id> / deadlines_blocks_<id>) that closes when done.
  var ESTIMATES = [["1h", 60], ["2h", 120], ["4h", 240], ["8h", 480], ["12h", 720], ["20h", 1200], ["No plan", 0]];
  var formEl;

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

  function stamp(iso) { return iso.slice(0, 10) + " " + iso.slice(11, 16); }

  function tomorrowIso() {
    var next = new Date();
    next.setDate(next.getDate() + 1);
    return next.getFullYear() + "-" + ("0" + (next.getMonth() + 1)).slice(-2) + "-" + ("0" + next.getDate()).slice(-2);
  }

  // Leaving a form: back to the list when we came from it, otherwise a scoped drawer closes.
  function done(message) {
    window.Aion.haptic("success");
    if (window.Aion.canGoBack()) { status(message); window.Aion.pop(); return; }
    window.Aion.finishProcedure(message);
  }

  // ---- create: one scrollable screen, then a plan preview, then confirm ---------------------------
  function showCreate() {
    var state = { est: 120, bias: "spread", blocks: [] };
    var titleInput = element("input");
    titleInput.type = "text";
    titleInput.maxLength = 120;
    titleInput.placeholder = "What is due";
    var dateInput = window.Aion.ui.datePicker("", function () {}, { minDate: tomorrowIso() });
    formEl.appendChild(fieldRow("Title", titleInput));
    formEl.appendChild(fieldRow("Due", dateInput));
    formEl.appendChild(element("div", "card-title", "Preparation time"));
    var chips = element("div", "chips");
    ESTIMATES.forEach(function (pair) {
      var chip = element("button", "chip" + (pair[1] === state.est ? " selected" : ""), pair[0]);
      chip.type = "button";
      chip.addEventListener("click", function () {
        state.est = pair[1];
        Array.prototype.forEach.call(chips.children, function (other) { other.classList.remove("selected"); });
        chip.classList.add("selected");
        window.Aion.haptic("selection");
        planEl.innerHTML = "";
        wireEntryButtons();
      });
      chips.appendChild(chip);
    });
    formEl.appendChild(chips);
    var planEl = element("div", "plan");
    formEl.appendChild(planEl);

    function fields() {
      return { title: titleInput.value.trim(), due_date: dateInput.value, est_min: state.est, bias: state.bias };
    }

    function missing() {
      var values = fields();
      if (values.title === "") { return "Enter what is due first."; }
      if (values.due_date === "") { return "Pick the due date first."; }
      return "";
    }

    function create() {
      var values = fields();
      values.blocks = state.blocks;
      api("/api/deadlines", "POST", values)
        .then(function (body) {
          done(body.errors.length > 0 ? "Created, but a block failed: " + body.errors[0] : "Deadline created.");
        })
        .catch(function (error) { status("Could not create the deadline: " + error.message, true); });
    }

    function preview() {
      var problem = missing();
      if (problem !== "") { status(problem, true); return; }
      api("/api/deadlines/preview", "POST", fields())
        .then(function (body) {
          state.blocks = body.blocks;
          status("");
          renderPlan(body);
        })
        .catch(function (error) { status("Could not build a plan: " + error.message, true); });
    }

    function renderPlan(body) {
      planEl.innerHTML = "";
      if (body.blocks.length === 0) {
        planEl.appendChild(element("div", "due", "No free time found before the due date - it will be added without a plan."));
      }
      body.blocks.forEach(function (block, index) {
        planEl.appendChild(element("div", "block-line", (index + 1) + ". " + stamp(block.start) + " - " + block.end.slice(11, 16)));
      });
      if (body.shortfall_min > 0) {
        var got = Math.round((body.wanted_min - body.shortfall_min) / 6) / 10;
        planEl.appendChild(element("div", "due", "Only " + got + "h of " + Math.round(body.wanted_min / 6) / 10 + "h fit."));
      }
      var shifts = element("div", "chips");
      [["Earlier", "earlier"], ["Spread", "spread"], ["Later", "later"]].forEach(function (pair) {
        var chip = element("button", "chip" + (state.bias === pair[1] ? " selected" : ""), pair[0]);
        chip.type = "button";
        chip.addEventListener("click", function () { state.bias = pair[1]; preview(); });
        shifts.appendChild(chip);
      });
      planEl.appendChild(shifts);
      window.Aion.mainButton("Create deadline", create);
      window.Aion.secondaryButton("Change", function () { planEl.innerHTML = ""; wireEntryButtons(); });
    }

    function wireEntryButtons() {
      window.Aion.hideSecondaryButton();
      if (state.est === 0) {
        window.Aion.mainButton("Create deadline", function () {
          var problem = missing();
          if (problem !== "") { status(problem, true); return; }
          state.blocks = [];
          create();
        });
      } else {
        window.Aion.mainButton("Preview plan", preview);
      }
    }

    status("");
    wireEntryButtons();
  }

  // ---- edit --------------------------------------------------------------------------------------
  function showEdit(id) {
    status("Loading...");
    api("/api/deadlines", "GET")
      .then(function (body) {
        var deadline = (body.deadlines || []).filter(function (d) { return String(d.id) === String(id); })[0];
        if (!deadline) { status("That deadline is finished or gone.", true); return; }
        status("");
        var titleInput = element("input");
        titleInput.type = "text";
        titleInput.maxLength = 120;
        titleInput.value = deadline.title;
        var dateInput = window.Aion.ui.datePicker(deadline.due_date || "", function () {}, { minDate: tomorrowIso() });
        formEl.appendChild(fieldRow("Title", titleInput));
        formEl.appendChild(fieldRow("Due", dateInput));
        window.Aion.mainButton("Save changes", function () {
          var changes = {};
          if (titleInput.value.trim() !== "" && titleInput.value.trim() !== deadline.title) { changes.title = titleInput.value.trim(); }
          if (dateInput.value !== "" && dateInput.value !== deadline.due_date) { changes.due_date = dateInput.value; }
          if (Object.keys(changes).length === 0) { status("Nothing changed.", true); return; }
          api("/api/deadlines/" + deadline.id + "/edit", "POST", changes)
            .then(function (result) { done(result.errors.length > 0 ? "Saved, but: " + result.errors[0] : "Saved."); })
            .catch(function (error) { status("Could not save: " + error.message, true); });
        });
      })
      .catch(function (error) { status("Could not load that deadline: " + error.message, true); });
  }

  // ---- blocks ------------------------------------------------------------------------------------
  function showBlocks(id) {
    status("Loading...");
    api("/api/deadlines/" + id + "/blocks", "GET")
      .then(function (body) {
        status("");
        var blocks = (body.blocks || []).filter(function (b) { return b.status !== "removed"; });
        if (blocks.length === 0) { formEl.appendChild(element("div", "due", "No preparation blocks.")); }
        blocks.forEach(function (block) {
          formEl.appendChild(element("div", "block-line", stamp(block.start) + " - " + block.end.slice(11, 16) + "  [" + block.status + "]"));
        });
        if (blocks.length === 0) { return; }
        window.Aion.mainButton("Mark future blocks done", function () {
          api("/api/deadlines/" + id + "/blocks/mark-done", "POST", {})
            .then(function (result) { done("Marked " + result.marked + " done on the calendar."); })
            .catch(function (error) { status("Could not mark them: " + error.message, true); });
        });
        window.Aion.secondaryButton("Remove future blocks", function () {
          window.Aion.confirmDestructive("Remove every future block of this deadline from the calendar?", "Remove", function () {
            api("/api/deadlines/" + id + "/blocks/remove", "POST", {})
              .then(function (result) { done("Removed " + result.removed + " blocks."); })
              .catch(function (error) { status("Could not remove them: " + error.message, true); });
          });
        });
      })
      .catch(function (error) { status("Could not load the blocks: " + error.message, true); });
  }

  function open(mode, id) {
    window.Aion.push("deadlines", { mode: mode, id: String(id) });
  }

  function load(data) {
    formEl = formEl || document.getElementById("deadline-form");
    formEl.innerHTML = "";
    var view = data || { mode: window.Aion.params.get("mode"), id: window.Aion.params.get("id") };
    if (view.mode === "edit") { return showEdit(view.id); }
    if (view.mode === "blocks") { return showBlocks(view.id); }
    showCreate();
  }

  window.Aion.screens.deadlines = { load: load, open: open };
})();
