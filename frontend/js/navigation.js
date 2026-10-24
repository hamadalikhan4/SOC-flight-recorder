"use strict";

import {
  state
} from "./state.js";

import {
  $
} from "./utils.js";


let loadHandler = null;


export function configureNavigation(
  handler
) {
  loadHandler = handler;
}


export function reloadCurrentView() {
  if (!loadHandler) {
    throw new Error(
      "Navigation loader has not been configured."
    );
  }

  return loadHandler();
}


export function navigate(view) {
  state.incidentId =
    null;

  state.view =
    view;

  state.offset =
    0;

  return reloadCurrentView();
}


function setEventControl(
  id,
  value
) {
  const node = $(id);

  if (node) {
    node.value =
      value;
  }
}


function clearEventControls() {
  setEventControl(
    "query",
    ""
  );

  setEventControl(
    "guid",
    ""
  );

  setEventControl(
    "event-id",
    ""
  );

  setEventControl(
    "category",
    ""
  );

  setEventControl(
    "source",
    ""
  );

  setEventControl(
    "start-time",
    ""
  );

  setEventControl(
    "end-time",
    ""
  );
}


export function linkedEvents(
  event,
  endpointId
) {
  if (
    $("details")?.open
  ) {
    $("details").close();
  }

  if (
    $("endpoint-details")?.open
  ) {
    $("endpoint-details")
      .close();
  }

  clearEventControls();

  setEventControl(
    "endpoint",
    endpointId
  );

  setEventControl(
    "guid",
    event.process_guid || ""
  );

  setEventControl(
    "order",
    "asc"
  );

  navigate(
    "events"
  );
}


export function openEndpointEvents(
  endpoint,
  category = ""
) {
  if (
    $("endpoint-details")?.open
  ) {
    $("endpoint-details")
      .close();
  }

  clearEventControls();

  setEventControl(
    "endpoint",
    endpoint.id
  );

  setEventControl(
    "category",
    category
  );

  setEventControl(
    "order",
    "desc"
  );

  navigate(
    "events"
  );
}