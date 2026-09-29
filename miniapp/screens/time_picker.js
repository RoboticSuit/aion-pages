window.Aion = window.Aion || {};
window.Aion.ui = window.Aion.ui || {};

// A Matrix-styled time picker: a compact trigger showing the chosen time as text, opening a scrollable hour/minute
// wheel on tap. Standalone, loaded on demand (window.Aion.loadScript("/app/screens/time_picker.js")). Replaces a
// bare <input type="time"> wherever a real clock feel is wanted; keeps the exact same "HH:MM" value the rest of
// the codebase already reads/writes.
// window.Aion.ui.timePicker(value, onChange, options) -> a DOM node with a live .value getter/setter.
// options: {step: 3600} hides the minute wheel (an hour-only setting, e.g. preferred start / end of day).
// Governed by Authadia REF_IDs SYN_001 and SYN_003.
(function () {
  "use strict";
  var WHEEL_ROW = 44;

  function pad(n) { return n < 10 ? "0" + n : String(n); }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) { node.className = className; }
    if (text !== undefined) { node.textContent = text; }
    return node;
  }

  function timePicker(value, onChange, options) {
    var hourOnly = options && options.step === 3600;
    var currentValue = value || "";

    var trigger = el("div", "picker-trigger" + (currentValue ? "" : " empty"), currentValue || "HH:MM");

    trigger.addEventListener("click", function () {
      var h = 0, m = 0;
      if (currentValue) {
        var parts = currentValue.split(":");
        h = parseInt(parts[0], 10) || 0;
        m = parseInt(parts[1], 10) || 0;
      }

      var overlay = el("div", "picker-modal-overlay");
      var modal = el("div", "picker-modal");
      var header = el("div", "picker-header", hourOnly ? "Select hour" : "Select time");
      modal.appendChild(header);

      var wheelsContainer = el("div", "time-wheels-container");
      var highlight = el("div", "time-wheel-highlight");

      function createWheel(max, selectedVal) {
        var wheel = el("div", "time-wheel");
        wheel.appendChild(el("div", "time-wheel-pad"));
        for (var i = 0; i <= max; i++) { wheel.appendChild(el("div", "wheel-item", pad(i))); }
        wheel.appendChild(el("div", "time-wheel-pad"));
        window.setTimeout(function () { wheel.scrollTop = selectedVal * WHEEL_ROW; }, 10);
        return wheel;
      }

      var hourWheel = createWheel(23, h);
      wheelsContainer.appendChild(hourWheel);
      var minuteWheel = null;
      if (!hourOnly) {
        minuteWheel = createWheel(59, m);
        wheelsContainer.appendChild(minuteWheel);
      }
      wheelsContainer.appendChild(highlight);
      modal.appendChild(wheelsContainer);

      var actions = el("div", "picker-actions");
      var btnCancel = el("button", "done", "Cancel");
      var btnConfirm = el("button", "primary", "Set");
      actions.appendChild(btnCancel);
      actions.appendChild(btnConfirm);
      modal.appendChild(actions);
      overlay.appendChild(modal);

      function close() { document.body.removeChild(overlay); }

      btnCancel.addEventListener("click", close);
      overlay.addEventListener("click", function (e) { if (e.target === overlay) { close(); } });
      btnConfirm.addEventListener("click", function () {
        var selectedH = Math.round(hourWheel.scrollTop / WHEEL_ROW);
        var selectedM = hourOnly ? 0 : Math.round(minuteWheel.scrollTop / WHEEL_ROW);
        selectedH = Math.max(0, Math.min(23, selectedH));
        selectedM = Math.max(0, Math.min(59, selectedM));
        currentValue = pad(selectedH) + ":" + pad(selectedM);
        trigger.textContent = currentValue;
        trigger.className = "picker-trigger";
        if (onChange) { onChange(currentValue); }
        trigger.dispatchEvent(new Event("change"));  // so an existing addEventListener("change", ...) at the call site still fires, unchanged
        close();
      });

      document.body.appendChild(overlay);
    });

    Object.defineProperty(trigger, "value", {
      get: function () { return currentValue; },
      set: function (val) {
        currentValue = val || "";
        trigger.textContent = currentValue || "HH:MM";
        trigger.className = "picker-trigger" + (currentValue ? "" : " empty");
      }
    });

    return trigger;
  }

  window.Aion.ui.timePicker = timePicker;
})();
