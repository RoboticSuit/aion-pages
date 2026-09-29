// Shared drawer components for the Mini App: chip rows, a people picker (typed name and/or email, saved contacts), a place
// picker (typed text, saved places) and the draft loader that pre-fills a drawer from what the bot understood from a sentence.
// Loaded by app.js (index.html is never edited) and exposed as window.Aion.ui. Every check here is only a convenience for the
// person typing; the server validates again and is the authority.
// Governed by Authadia REF_IDs SYN_001 and SYN_003.
(function () {
  "use strict";

  if (window.Aion === undefined) { window.Aion = {}; }
  var ui = {};

  var MAX_GUESTS = 30;
  var MAX_NAME_LENGTH = 80;
  var MAX_ADDRESS_LENGTH = 254;
  var MAX_PLACE_LENGTH = 300;  // a Google Maps address is kept whole: a place too long for this is refused, never cut
  var EMAIL_SHAPE = /^[A-Za-z0-9._%+\-]+@[A-Za-z0-9\-]+(\.[A-Za-z0-9\-]+)+$/;

  function element(tag, className, text) {
    var node = document.createElement(tag);
    if (className) { node.className = className; }
    if (text !== undefined) { node.textContent = text; }
    return node;
  }

  function input(type, value) {
    var node = element("input");
    node.type = type;
    if (value !== undefined) { node.value = value; }
    return node;
  }

  function fieldRow(labelText, control) {
    var row = element("div", "field-row");
    row.appendChild(element("label", "", labelText));
    row.appendChild(control);
    return row;
  }

  // One row of chips; tapping one selects it alone and reports its value. selectedIndex -1 selects none.
  function chipRow(options, selectedIndex, onPick) {
    var row = element("div", "chips");
    options.forEach(function (option, index) {
      var chip = element("button", "chip", option[0]);
      if (index === selectedIndex) { chip.classList.add("selected"); }
      chip.type = "button";
      chip.addEventListener("click", function () {
        Array.prototype.forEach.call(row.children, function (other) { other.classList.remove("selected"); });
        chip.classList.add("selected");
        window.Aion.haptic("selection");
        onPick(option[1], index);
      });
      row.appendChild(chip);
    });
    return row;
  }

  // "Remember ..." style switch: returns { row, box } so the caller reads box.checked.
  function checkbox(labelText, checked) {
    var row = element("label", "checkbox-row");
    var box = input("checkbox");
    box.checked = checked;
    row.appendChild(box);
    row.appendChild(element("span", "", labelText));
    return { row: row, box: box };
  }

  // ---- people ------------------------------------------------------------------------------------------------------
  // "Maria <maria@example.com>", "maria@example.com" or "Maria" -> { guest: { name, email } } or { error: reason }.
  function parseGuest(raw) {
    var text = raw.trim();
    var name = "";
    var address = "";
    if (text === "") { return { error: "" }; }
    var open = text.indexOf("<");
    if (open !== -1) {
      if (text.charAt(text.length - 1) !== ">") { return { error: "Close the bracket: Name <email>" }; }
      name = text.slice(0, open);
      address = text.slice(open + 1, text.length - 1);
    } else if (text.indexOf("@") !== -1) {
      address = text;
    } else {
      name = text;
    }
    name = name.replace(/[,;<>"]/g, " ").replace(/\s+/g, " ").trim();
    address = address.trim().toLowerCase();
    if (address !== "" && (address.length > MAX_ADDRESS_LENGTH || EMAIL_SHAPE.test(address) === false)) {
      return { error: "That email does not look right: " + address };
    }
    if (name.length > MAX_NAME_LENGTH) { return { error: "That name is too long." }; }
    if (name === "" && address === "") { return { error: "Give a name, an email, or both." }; }
    return { guest: { name: name, email: address } };
  }

  function sameGuest(first, second) {
    if (first.email !== "" && second.email !== "") { return first.email === second.email; }
    return first.name !== "" && first.name.toLowerCase() === second.name.toLowerCase();
  }

  function guestLabel(guest) {
    if (guest.name !== "") { return guest.name; }
    return guest.email;
  }

  // options: { contacts: [{name, email}], people: [{name, email}], onChange: function(people) }
  // returns { node, getPeople(), getRemember(), setPeople(list), flush() }; flush() adds text typed but not yet added and
  // returns "" or the reason it could not (call it before submitting).
  ui.peoplePicker = function (options) {
    var state = { people: options.people.slice() };
    var root = element("div");
    var chosenRow = element("div", "chips");
    var savedRow = element("div", "chips");
    var message = element("div", "due");
    var typed = input("text");
    var addButton = element("button", "primary", "Add");
    var remember = checkbox("Remember these people", true);

    typed.placeholder = "Name and/or email";
    typed.maxLength = MAX_ADDRESS_LENGTH;
    addButton.type = "button";
    root.appendChild(element("div", "card-title", "Who"));
    root.appendChild(chosenRow);
    root.appendChild(savedRow);
    var typedRow = element("div", "field-row");
    typedRow.appendChild(typed);
    typedRow.appendChild(addButton);
    root.appendChild(typedRow);
    root.appendChild(message);
    root.appendChild(remember.row);

    function announce() {
      if (typeof options.onChange === "function") { options.onChange(state.people.slice()); }
    }

    function isChosen(contact) {
      return state.people.some(function (guest) { return sameGuest(guest, contact); });
    }

    function draw() {
      chosenRow.innerHTML = "";
      savedRow.innerHTML = "";
      state.people.forEach(function (guest, index) {
        var chip = element("button", "chip selected", guestLabel(guest) + " ×");
        chip.type = "button";
        chip.addEventListener("click", function () {
          state.people.splice(index, 1);
          message.textContent = "";
          draw();
          announce();
        });
        chosenRow.appendChild(chip);
      });
      options.contacts.forEach(function (contact) {
        if (isChosen(contact)) { return; }
        var chip = element("button", "chip", guestLabel(contact));
        chip.type = "button";
        chip.addEventListener("click", function () { add({ name: contact.name, email: contact.email }); });
        savedRow.appendChild(chip);
      });
      chosenRow.hidden = state.people.length === 0;
      savedRow.hidden = savedRow.children.length === 0;
    }

    function add(guest) {
      var index = state.people.findIndex(function (existing) { return sameGuest(existing, guest); });
      if (index === -1 && state.people.length >= MAX_GUESTS) {
        message.textContent = "At most " + MAX_GUESTS + " guests.";
        return false;
      }
      if (index === -1) {
        state.people.push(guest);
      } else {
        if (state.people[index].name === "") { state.people[index].name = guest.name; }
        if (state.people[index].email === "") { state.people[index].email = guest.email; }
      }
      message.textContent = "";
      draw();
      announce();
      window.Aion.haptic("selection");
      return true;
    }

    function flush() {
      var raw = typed.value.trim();
      if (raw === "") { return ""; }
      var parsed = parseGuest(raw);
      if (parsed.error !== undefined) {
        message.textContent = parsed.error;
        return parsed.error;
      }
      if (add(parsed.guest) === false) { return message.textContent; }
      typed.value = "";
      return "";
    }

    addButton.addEventListener("click", flush);
    typed.addEventListener("keydown", function (event) {
      if (event.key === "Enter") {
        event.preventDefault();
        flush();
      }
    });
    draw();
    return {
      node: root,
      getPeople: function () { return state.people.slice(); },
      getRemember: function () { return remember.box.checked; },
      setPeople: function (list) { state.people = list.slice(); draw(); announce(); },
      flush: flush
    };
  };

  // ---- place -------------------------------------------------------------------------------------------------------
  // ---- Google Maps search: suggestions as the owner types in a location field ----------------------------------------------
  var SEARCH_PAUSE_MS = 500;
  var SEARCH_MIN_CHARACTERS = 3;

  function foundText(found) {
    if (found.address === "") { return found.name; }
    return found.name + ", " + found.address;
  }

  // Adds the search to a text input: it warms the PC's browser page when the field gets focus, shows up to six suggestions after a short
  // pause in typing, and on a tap looks the place up and reports it through options.onPick({ name, address, lat, lng, top_of_several }).
  // options.anchor is the element the suggestion area goes after (default: the input's row). Typing the place by hand always still works.
  ui.attachPlaceSearch = function (inputNode, options) {
    var holder = element("div");
    var note = element("div", "due");
    var list = element("div", "chips");
    holder.appendChild(note);
    holder.appendChild(list);
    var anchor = options.anchor;
    if (anchor === undefined) { anchor = inputNode.parentNode; }
    anchor.parentNode.insertBefore(holder, anchor.nextSibling);
    var timer = null;
    var serial = 0;
    var warmed = false;

    function clearList() { list.innerHTML = ""; }
    function show(text) { note.textContent = text; }

    function suggestionButton(place) {
      var text = place.name;
      if (place.address !== "") { text += ", " + place.address; }
      var button = element("button", "chip", text);
      button.type = "button";
      button.addEventListener("click", function () { choose(place); });
      return button;
    }

    function ask() {
      var typed = inputNode.value.trim();
      serial += 1;
      var mine = serial;
      if (typed.length < SEARCH_MIN_CHARACTERS) { clearList(); show(""); return; }
      show("Searching Google Maps...");
      window.Aion.api("/api/places/suggest", "POST", { q: typed })
        .then(function (answer) {
          if (mine !== serial) { return; }  // a newer keystroke pause has its own answer coming
          clearList();
          if (answer.superseded === true) { return; }
          show("");
          if (answer.places.length === 0) { show("No place found on Google Maps. You can type it as it is."); return; }
          answer.places.forEach(function (place) { list.appendChild(suggestionButton(place)); });
        })
        .catch(function (error) {
          if (mine !== serial) { return; }
          clearList();
          show(error.message);
        });
    }

    function choose(place) {
      serial += 1;  // any suggestion still on its way is out of date now
      clearList();
      show("");
      ui.showLoading("Checking " + place.name + " on Google Maps...");
      var request = { name: place.name, address: place.address };
      if (place.href !== undefined) { request.href = place.href; }  // a result of the full search: open that very place
      window.Aion.api("/api/places/resolve", "POST", request)
        .then(function (found) {
          ui.hideLoading();
          var message = "Found: " + foundText(found) + ".";
          if (found.top_of_several) { message += " Google lists it under this name. Check that it is the right place."; }
          show(message);
          window.Aion.haptic("success");
          options.onPick(found);
        })
        .catch(function (error) { ui.hideLoading(); show(error.message + " You can use the typed text."); });
    }

    inputNode.addEventListener("focus", function () {
      if (warmed) { return; }
      warmed = true;
      window.Aion.api("/api/places/warm", "POST", {}).catch(function () { return null; });
    });
    inputNode.addEventListener("input", function () {
      if (timer !== null) { window.clearTimeout(timer); }
      timer = window.setTimeout(ask, SEARCH_PAUSE_MS);
    });
    return { clear: function () { serial += 1; clearList(); show(""); } };
  };

  function placeText(place) {
    if (place.address === "") { return place.name; }
    return place.name + ", " + place.address;
  }

  // options: { places: [{name, address}], value: "", onChange: function(text) }
  // returns { node, getPlace(), getRemember(), getFound(), setPlace(text) }; getRemember() is true only for a NEW place the owner ticked;
  // getFound() is the place the owner picked from the Google Maps search ({ name, address, lat, lng }) while the text still says so.
  ui.placePicker = function (options) {
    var root = element("div");
    var savedRow = element("div", "chips");
    var typed = input("text", options.value);
    var remember = checkbox("Remember this place", false);

    typed.placeholder = "Place or address";
    typed.maxLength = MAX_PLACE_LENGTH;
    root.appendChild(element("div", "card-title", "Where"));
    root.appendChild(savedRow);
    var typedRow = element("div", "field-row");
    typedRow.appendChild(typed);
    root.appendChild(typedRow);
    root.appendChild(remember.row);
    var picked = null;

    function current() { return typed.value.trim(); }

    function pickedText() { return foundText(picked); }

    function isSaved(text) {
      return options.places.some(function (place) { return placeText(place).toLowerCase() === text.toLowerCase(); });
    }

    function draw() {
      savedRow.innerHTML = "";
      options.places.forEach(function (place) {
        var chip = element("button", "chip", placeText(place));
        if (placeText(place).toLowerCase() === current().toLowerCase()) { chip.classList.add("selected"); }
        chip.type = "button";
        chip.addEventListener("click", function () { setPlace(placeText(place)); });
        savedRow.appendChild(chip);
      });
      savedRow.hidden = options.places.length === 0;
      remember.row.hidden = current() === "" || isSaved(current());
    }

    function setPlace(text) {
      typed.value = text;
      draw();
      window.Aion.haptic("selection");
      if (typeof options.onChange === "function") { options.onChange(current()); }
    }

    typed.addEventListener("input", function () {
      draw();
      if (typeof options.onChange === "function") { options.onChange(current()); }
    });
    ui.attachPlaceSearch(typed, { anchor: typedRow, onPick: function (found) {
      if (foundText(found).length > MAX_PLACE_LENGTH) {
        window.Aion.setStatus("That place's name and address are too long to save exactly. Type a shorter place.", true);
        return;
      }
      picked = found;
      setPlace(pickedText());
    } });
    draw();

    function getFound() {
      if (picked === null || current() !== pickedText()) { return null; }
      return { name: picked.name, address: picked.address, lat: picked.lat, lng: picked.lng };
    }

    return {
      node: root,
      getPlace: current,
      getRemember: function () { return getFound() === null && remember.box.checked && current() !== "" && isSaved(current()) === false; },
      getFound: getFound,
      setPlace: setPlace
    };
  };

  // ---- loading: the drawer shown while Google Maps is checked (a place search resolve, or saving a place/event that gets its Maps
  // text checked) -----------------------------------------------------------------------------------------------------
  // One shared panel, built once and reused: an overlay that blocks taps, a sheet that slides up from the bottom holding a small
  // spinning ring graphic (two rings, a bright arc turning around the outer one, a slow pulse in the middle - all inline SVG, no
  // library, drawn in the app's own green) and one line of text. A second line appears after LOADING_SLOW_MS to say it is still
  // working. Reduced-motion: the rings hold still and only the text moves. Screen readers get one live region.
  var LOADING_SLOW_MS = 6000;
  var loadingPanel = null;
  var loadingLine = null;
  var loadingSlowLine = null;
  var loadingSlowTimer = null;
  var reduceMotion = window.matchMedia !== undefined && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function buildLoadingPanel() {
    var overlay = element("div");
    overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:900;display:flex;align-items:flex-end;justify-content:center;";
    var sheet = element("div");
    sheet.style.cssText = "width:100%;max-width:480px;background:var(--card);border-top:1px solid var(--border);border-radius:14px 14px 0 0;" +
      "padding:22px 16px calc(22px + env(safe-area-inset-bottom, 0px));text-align:center;transform:translateY(0);" +
      (reduceMotion ? "" : "animation:aion-sheet-up 0.22s ease-out;");
    var svgNs = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(svgNs, "svg");
    svg.setAttribute("viewBox", "0 0 64 64");
    svg.setAttribute("width", "56");
    svg.setAttribute("height", "56");
    svg.style.display = "block";
    svg.style.margin = "0 auto 12px";
    function circle(r, opacity) {
      var c = document.createElementNS(svgNs, "circle");
      c.setAttribute("cx", "32"); c.setAttribute("cy", "32"); c.setAttribute("r", String(r));
      c.setAttribute("fill", "none"); c.setAttribute("stroke", "var(--fg-dim)"); c.setAttribute("stroke-opacity", String(opacity));
      c.setAttribute("stroke-width", "3");
      return c;
    }
    svg.appendChild(circle(27, 0.5));
    svg.appendChild(circle(14, 0.35));
    var arc = document.createElementNS(svgNs, "circle");
    arc.setAttribute("cx", "32"); arc.setAttribute("cy", "32"); arc.setAttribute("r", "27");
    arc.setAttribute("fill", "none"); arc.setAttribute("stroke", "var(--fg)"); arc.setAttribute("stroke-width", "3");
    arc.setAttribute("stroke-linecap", "round");
    arc.setAttribute("stroke-dasharray", (2 * Math.PI * 27 * 0.22).toFixed(1) + " " + (2 * Math.PI * 27).toFixed(1));
    arc.style.transformOrigin = "32px 32px";
    if (reduceMotion === false) { arc.style.animation = "aion-ring-spin 1.1s linear infinite"; }
    svg.appendChild(arc);
    var pulse = document.createElementNS(svgNs, "circle");
    pulse.setAttribute("cx", "32"); pulse.setAttribute("cy", "32"); pulse.setAttribute("r", "6"); pulse.setAttribute("fill", "var(--fg)");
    if (reduceMotion === false) { pulse.style.animation = "aion-pulse 1.6s ease-in-out infinite"; }
    svg.appendChild(pulse);
    var live = element("div");
    live.setAttribute("role", "status");
    live.setAttribute("aria-live", "polite");
    var line = element("div", "due", "");
    line.style.color = "var(--fg)";
    line.style.fontSize = "13px";
    var slow = element("div", "due", "Still working. This can take up to 15 seconds.");
    slow.style.marginTop = "4px";
    slow.hidden = true;
    live.appendChild(line);
    live.appendChild(slow);
    sheet.appendChild(svg);
    sheet.appendChild(live);
    overlay.appendChild(sheet);
    if (document.querySelector("#aion-loading-keyframes") === null && reduceMotion === false) {
      var style = element("style");
      style.id = "aion-loading-keyframes";
      style.textContent = "@keyframes aion-ring-spin{to{transform:rotate(360deg);}}" +
        "@keyframes aion-pulse{0%,100%{opacity:0.55;}50%{opacity:1;}}" +
        "@keyframes aion-sheet-up{from{transform:translateY(100%);}to{transform:translateY(0);}}";
      document.head.appendChild(style);
    }
    return { overlay: overlay, line: line, slow: slow };
  }

  // Shows the loading drawer with `text` (the first line). Call again to change the text without re-showing it.
  ui.showLoading = function (text) {
    if (loadingPanel === null) {
      var built = buildLoadingPanel();
      loadingPanel = built.overlay;
      loadingLine = built.line;
      loadingSlowLine = built.slow;
    }
    loadingLine.textContent = text;
    loadingSlowLine.hidden = true;
    if (loadingPanel.parentNode === null) { document.body.appendChild(loadingPanel); }
    if (loadingSlowTimer !== null) { window.clearTimeout(loadingSlowTimer); }
    loadingSlowTimer = window.setTimeout(function () { loadingSlowLine.hidden = false; }, LOADING_SLOW_MS);
  };

  ui.hideLoading = function () {
    if (loadingSlowTimer !== null) { window.clearTimeout(loadingSlowTimer); loadingSlowTimer = null; }
    if (loadingPanel !== null && loadingPanel.parentNode !== null) { loadingPanel.parentNode.removeChild(loadingPanel); }
  };

  // ---- drafts and saved choices -------------------------------------------------------------------------------------
  // The draft the bot made from a sentence (null when it has expired or was used), and the call that uses it up.
  ui.loadDraft = function (id) {
    return window.Aion.api("/api/drafts/" + encodeURIComponent(id), "GET")
      .then(function (body) { return body.draft; })
      .catch(function () { return null; });
  };

  ui.useUpDraft = function (id) {
    return window.Aion.api("/api/drafts/" + encodeURIComponent(id) + "/consume", "POST", {}).catch(function () { return null; });
  };

  // The saved contacts and places for the pickers; a failure gives empty lists so a form still opens.
  ui.loadChoices = function () {
    var empty = { contacts: [], places: [] };
    return Promise.all([
      window.Aion.api("/api/contacts", "GET").then(function (body) { return body.contacts; }).catch(function () { return empty.contacts; }),
      window.Aion.api("/api/places", "GET").then(function (body) { return body.places; }).catch(function () { return empty.places; })
    ]).then(function (both) { return { contacts: both[0], places: both[1] }; });
  };

  // The object-card noun signifier: one small inline SVG per Aion type (services/calendar_service.py's
  // FIXED_TYPES/MOVABLE_TYPES - lecture, exam, deadline, study, task, personal), non-interactive - it identifies
  // what kind of thing the card is, never implying a tap-to-toggle affordance (that is the plain .oo-signifier's job,
  // only for objects with one clear primary action, which not every screen has). Feather-icon-style paths, matching
  // the tab bar's own icon language.
  var TYPE_ICON_PATHS = {
    lecture: '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
    exam: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 15l2 2 4-4"/>',
    deadline: '<path d="M5 2h14"/><path d="M5 22h14"/><path d="M5 2c0 5 5 6 5 10s-5 5-5 10"/><path d="M19 2c0 5-5 6-5 10s5 5 5 10"/>',
    study: '<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    task: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
    personal: '<circle cx="12" cy="7" r="4"/><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>',
    // Not one of Aion's six event types - for screens whose items have no type field at all, only a uniform nature
    // (a routine or a habit is always "a recurring thing"), so one shared icon fits every row on that screen.
    repeat: '<polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>'
  };
  ui.typeIcon = function (type) {
    var span = element("span", "oo-type-icon");
    span.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      (TYPE_ICON_PATHS[type] || TYPE_ICON_PATHS.personal) + "</svg>";
    return span;
  };

  // The .oo-signifier's own icon, built via createElementNS (not innerHTML) since - unlike typeIcon's static
  // decoration - its scale is animated by CSS (checked/unchecked), matching the SVG-building convention the loading
  // drawer above already uses for the same reason.
  function signifierIcon(className, points) {
    var ns = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(ns, "svg");
    svg.setAttribute("class", className);
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "3");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    points.forEach(function (shape) {
      var el = document.createElementNS(ns, shape.tag);
      Object.keys(shape.attrs).forEach(function (key) { el.setAttribute(key, shape.attrs[key]); });
      svg.appendChild(el);
    });
    return svg;
  }
  ui.checkIcon = function () {
    return signifierIcon("oo-check-icon", [{ tag: "polyline", attrs: { points: "20 6 9 17 4 12" } }]);
  };
  ui.xIcon = function () {
    return signifierIcon("oo-check-icon", [
      { tag: "line", attrs: { x1: "18", y1: "6", x2: "6", y2: "18" } },
      { tag: "line", attrs: { x1: "6", y1: "6", x2: "18", y2: "18" } }
    ]);
  };

  ui.element = element;
  ui.input = input;
  ui.fieldRow = fieldRow;
  ui.chipRow = chipRow;
  ui.checkbox = checkbox;
  ui.parseGuest = parseGuest;
  window.Aion.ui = ui;
})();
