if (window.Aion === undefined) { window.Aion = {}; }
if (window.Aion.screens === undefined) { window.Aion.screens = {}; }

(function () {
  "use strict";

  // People and places: the contacts and places the owner chose to remember (the "Remember" switches in the event form), with
  // add and delete. Reached from Config ("People and places" > Open) or as its own drawer (screen "people"). index.html is never
  // edited, so this file creates its own screen section. Nothing here is shared with anyone; deleting is permanent.
  // Governed by Authadia REF_IDs SYN_001 and SYN_003.
  var MAX_NAME_LENGTH = 80;
  var MAX_EMAIL_LENGTH = 254;
  var MAX_ADDRESS_LENGTH = 300;  // a Google Maps address is kept whole: one too long is refused, never cut
  var view;

  function api() { return window.Aion.api.apply(null, arguments); }
  function status(text, isError) { window.Aion.setStatus(text, isError); }
  function ui() { return window.Aion.ui; }
  function element(tag, className, text) { return ui().element(tag, className, text); }

  // The screen's own section, placed where the other screens are (before the footer), hidden until it is opened.
  function ensureSection() {
    var existing = document.querySelector("#screen-people");
    if (existing !== null) { return document.querySelector("#people-view"); }
    var section = document.createElement("section");
    section.id = "screen-people";
    section.hidden = true;
    var body = document.createElement("div");
    body.id = "people-view";
    section.appendChild(body);
    var footer = document.querySelector("footer");
    if (footer !== null) { document.body.insertBefore(section, footer); } else { document.body.appendChild(section); }
    return body;
  }

  function actionButton(label, onClick) {
    var button = element("button", "primary", label);
    button.type = "button";
    button.addEventListener("click", onClick);
    return button;
  }

  function askAndDelete(question, path, doneText) {
    window.Aion.confirmDestructive(question, "Delete", function () {
      api(path, "POST", {})
        .then(function () { window.Aion.haptic("success"); refresh(doneText); })
        .catch(function (error) { status("Could not delete: " + error.message, true); });
    });
  }

  // The typed average travel time to a place: empty means none (null), else 1 to 300 whole minutes; anything else is a text to tell the owner.
  function minutesValue(control) {
    var text = control.value.trim();
    if (text === "") { return { value: null, problem: "" }; }
    var number = Number(text);
    if (/^[0-9]{1,3}$/.test(text) === false || number < 1 || number > 300) { return { value: null, problem: "Average minutes is a whole number from 1 to 300, or empty." }; }
    return { value: number, problem: "" };
  }

  function minutesField(value) {
    var field = textField("Minutes", "Average travel minutes (optional)", 3);
    field.control.inputMode = "numeric";
    if (value !== null && value !== undefined) { field.control.value = String(value); }
    return field;
  }

  function textField(labelText, placeholder, maxLength) {
    var control = ui().input("text");
    control.placeholder = placeholder;
    control.maxLength = maxLength;
    return { row: ui().fieldRow(labelText, control), control: control };
  }

  // An editor in place of a row: two fields with what is saved now, Save and Cancel. Saving asks the server, which checks it
  // again; Cancel just draws the lists again.
  function editRow(li, labels, values, limits, save) {
    li.innerHTML = "";
    var minutes = null;
    var first = textField(labels[0], labels[0], limits[0]);
    var second = textField(labels[1], labels[1], limits[1]);
    first.control.value = values[0];
    second.control.value = values[1];
    var isPlace = labels[0] === "Name" && labels[1] === "Where";
    var find = null;
    if (isPlace) {  // a place: Google Maps fills the address, the name stays the owner's own label
      find = textField("Find", "Search Google Maps to fill the address", MAX_ADDRESS_LENGTH);
      li.appendChild(find.row);
    }
    li.appendChild(first.row);
    li.appendChild(second.row);
    if (isPlace) {
      minutes = minutesField(values[2]);
      li.appendChild(minutes.row);
    }
    var actions = element("div", "actions");
    actions.appendChild(actionButton("Cancel", function () { refresh(""); }));
    var searched = null;
    actions.appendChild(actionButton("Save", function () {
      var position = positionFor(searched, second.control);
      var average = { value: undefined, problem: "" };
      if (minutes !== null) { average = minutesValue(minutes.control); }
      if (average.problem !== "") { status(average.problem, true); return; }
      save(first.control.value.trim(), second.control.value.trim(), position, droppedNote(searched, position), average.value,
           isPlace ? foundNameFor(searched, second.control) : "");
    }));
    li.appendChild(actions);
    if (isPlace) { searched = searchPlace(find, first, second); }
  }

  // The exact position of a place picked from the Google Maps search, only while the address still says what was picked.
  function positionFor(state, addressControl) {
    if (state === null || state.found === null) { return {}; }
    if (addressControl.value.trim() !== state.found.address) { return {}; }
    return { lat: state.found.lat, lng: state.found.lng };
  }

  // The place's official name as Google Maps gave it, only while the address still says what was found (same rule as its position):
  // sent as found_name so the server can check that this exact text opens the same point, and remember it for the Open on maps link.
  function foundNameFor(state, addressControl) {
    if (state === null || state.found === null) { return ""; }
    if (addressControl.value.trim() !== state.found.address) { return ""; }
    return state.found.name;
  }

  // Adds the shared Google Maps search to a place form. A tap registers what Google found: the address (so nobody has to type it) and the
  // exact position. The name is the owner's own label (Home, Work, University): it is only suggested when it is still empty.
  function searchPlace(findField, nameField, addressField) {
    var state = { found: null };
    ui().attachPlaceSearch(findField.control, {
      anchor: findField.row,
      onPick: function (found) {
        var address = found.address;
        if (address === "") { address = found.name; }
        if (address.length > MAX_ADDRESS_LENGTH) {
          status("That address is too long to save exactly. Type a shorter one.", true);
          return;
        }
        addressField.control.value = address;
        if (nameField.control.value.trim() === "" && found.name.length <= MAX_NAME_LENGTH) { nameField.control.value = found.name; }
        findField.control.value = "";
        state.found = { address: address, lat: found.lat, lng: found.lng, name: found.name };
      }
    });
    return state;
  }

  // What to tell the owner when a place found on Google Maps is saved without its exact position because its address was changed by hand.
  var DROPPED_NOTE = " The address was changed after Google found it, so its exact position was not saved.";

  function droppedNote(state, position) {
    if (state !== null && state.found !== null && position.lat === undefined) { return DROPPED_NOTE; }
    return "";
  }

  function saveEdit(path, body, note, foundName) {
    if (foundName) { ui().showLoading("Checking " + foundName + " on Google Maps..."); }
    api(path, "POST", body)
      .then(function () { ui().hideLoading(); window.Aion.haptic("success"); refresh("Saved." + note); })
      .catch(function (error) { ui().hideLoading(); status(error.message, true); });
  }

  function renderPeople(contacts) {
    view.appendChild(element("div", "title", "People"));
    var list = element("ul");
    if (contacts.length === 0) { view.appendChild(element("div", "due", "No saved people yet. Tick Remember when you add guests to an event, or add one below.")); }
    contacts.forEach(function (contact) {
      var li = element("li", "task");
      var left = element("div");
      var shown = contact.name;
      if (shown === "") { shown = contact.email; }
      left.appendChild(element("div", "title", shown));
      if (contact.name !== "" && contact.email !== "") { left.appendChild(window.Aion.tags([contact.email])); }
      li.appendChild(left);
      var actions = element("div", "actions");
      actions.appendChild(actionButton("Edit", function () {
        editRow(li, ["Name", "Email"], [contact.name, contact.email], [MAX_NAME_LENGTH, MAX_EMAIL_LENGTH], function (name, email) {
          saveEdit("/api/contacts/" + contact.id + "/edit", { name: name, email: email }, "");
        });
      }));
      actions.appendChild(actionButton("Delete", function () {
        askAndDelete("Delete " + shown + " from your saved people?", "/api/contacts/" + contact.id + "/delete", "Deleted " + shown + ".");
      }));
      li.appendChild(actions);
      list.appendChild(li);
    });
    view.appendChild(list);

    var form = element("form", "card");
    form.addEventListener("submit", function (event) { event.preventDefault(); });
    form.appendChild(element("div", "card-title", "Add a person"));
    var name = textField("Name", "Name (optional)", MAX_NAME_LENGTH);
    var email = textField("Email", "Email (optional)", MAX_EMAIL_LENGTH);
    form.appendChild(name.row);
    form.appendChild(email.row);
    form.appendChild(actionButton("Add", function () {
      api("/api/contacts", "POST", { name: name.control.value.trim(), email: email.control.value.trim() })
        .then(function () { window.Aion.haptic("success"); refresh("Added."); })
        .catch(function (error) { status(error.message, true); });
    }));
    view.appendChild(form);
  }

  function renderPlaces(places) {
    view.appendChild(element("div", "title", "Places"));
    var list = element("ul");
    if (places.length === 0) { view.appendChild(element("div", "due", "No saved places yet. Tick Remember this place when you add one to an event, or add one below.")); }
    places.forEach(function (place) {
      var li = element("li", "task");
      var left = element("div");
      left.appendChild(element("div", "title", place.name));
      var facts = [];
      if (place.address !== "") { facts.push(place.address); }
      if (place.avg_min !== null && place.avg_min !== undefined) { facts.push("about " + place.avg_min + " min"); }
      if (facts.length > 0) { left.appendChild(window.Aion.tags(facts)); }
      li.appendChild(left);
      var actions = element("div", "actions");
      actions.appendChild(actionButton("Edit", function () {
        editRow(li, ["Name", "Where"], [place.name, place.address, place.avg_min], [MAX_NAME_LENGTH, MAX_ADDRESS_LENGTH], function (name, address, position, note, average, foundName) {
          saveEdit("/api/places/" + place.id + "/edit", Object.assign({ name: name, address: address, avg_min: average, found_name: foundName }, position), note, foundName);
        });
      }));
      actions.appendChild(actionButton("Delete", function () {
        askAndDelete("Delete " + place.name + " from your saved places?", "/api/places/" + place.id + "/delete", "Deleted " + place.name + ".");
      }));
      li.appendChild(actions);
      list.appendChild(li);
    });
    view.appendChild(list);

    var form = element("form", "card");
    form.addEventListener("submit", function (event) { event.preventDefault(); });
    form.appendChild(element("div", "card-title", "Add a place"));
    var find = textField("Find", "Search Google Maps to fill the address", MAX_ADDRESS_LENGTH);
    var name = textField("Name", "Your label: Home, Work, University", MAX_NAME_LENGTH);
    var address = textField("Where", "Filled from Google Maps, or type it", MAX_ADDRESS_LENGTH);  // "Address" is wider than the label column
    form.appendChild(find.row);
    form.appendChild(name.row);
    form.appendChild(address.row);
    var average = minutesField(null);
    form.appendChild(average.row);
    var searched = searchPlace(find, name, address);
    form.appendChild(actionButton("Add", function () {
      var typed = minutesValue(average.control);
      if (typed.problem !== "") { status(typed.problem, true); return; }
      var position = positionFor(searched, address.control);
      var foundName = foundNameFor(searched, address.control);
      var body = { name: name.control.value.trim(), address: address.control.value.trim(), avg_min: typed.value, found_name: foundName };
      if (foundName) { ui().showLoading("Checking " + foundName + " on Google Maps..."); }
      api("/api/places", "POST", Object.assign(body, position))
        .then(function () { ui().hideLoading(); window.Aion.haptic("success"); refresh("Added." + droppedNote(searched, position)); })
        .catch(function (error) { ui().hideLoading(); status(error.message, true); });
    }));
    view.appendChild(form);
  }

  function refresh(note) {
    Promise.all([api("/api/contacts", "GET"), api("/api/places", "GET")])
      .then(function (both) {
        status(note);
        view.innerHTML = "";
        renderPeople(both[0].contacts);
        renderPlaces(both[1].places);
      })
      .catch(function (error) { status("Could not load: " + error.message, true); });
  }

  function load() {
    view = ensureSection();
    window.Aion.hideSecondaryButton();
    if (ui() === undefined) { status("Could not load the form parts. Close the app and open it again.", true); return; }
    status("Loading...");
    refresh("");
  }

  ensureSection();
  window.Aion.screens.people = { load: load };
})();
