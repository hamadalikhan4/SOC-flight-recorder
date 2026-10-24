
"use strict";

import {
  state
} from "../state.js";

import {
  api
} from "../api.js";

import {
  $,
  element,
  button,
  hostname,
  normalizeProcessGuid
} from "../utils.js";

import {
  table
} from "../components/table.js";

import {
  badge
} from "../components/badges.js";

import {
  showDetails
} from "../components/dialog.js";

import {
  signalBadge,
  signalPanel
} from "../components/signals.js";

import {
  reloadCurrentView
} from "../navigation.js";


/* =========================================================
   BASIC HELPERS
   ========================================================= */

function processName(value) {
  return String(value || "")
    .replaceAll("\\", "/")
    .split("/")
    .pop() || "Unknown process";
}


function setControl(id, value) {
  const control = $(id);

  if (control) {
    control.value = value ?? "";
  }
}


function localTimeToIso(value) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime())
    ? null
    : parsed.toISOString();
}


function toLocalInputValue(value) {
  const date =
    value instanceof Date
      ? value
      : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const pad = number =>
    String(number).padStart(2, "0");

  return (
    date.getFullYear()
    + "-"
    + pad(date.getMonth() + 1)
    + "-"
    + pad(date.getDate())
    + "T"
    + pad(date.getHours())
    + ":"
    + pad(date.getMinutes())
    + ":"
    + pad(date.getSeconds())
  );
}


function getTimeWindow(timestamp, minutes) {
  const center = new Date(timestamp);

  if (Number.isNaN(center.getTime())) {
    return null;
  }

  const milliseconds =
    minutes * 60 * 1000;

  return {
    start: new Date(
      center.getTime() - milliseconds
    ),

    end: new Date(
      center.getTime() + milliseconds
    )
  };
}


function eventDelay(event) {
  if (
    !event.timestamp
    || !event.received_at
  ) {
    return "Unknown";
  }

  const eventTime =
    Date.parse(event.timestamp);

  const receivedTime =
    Date.parse(event.received_at);

  if (
    !Number.isFinite(eventTime)
    || !Number.isFinite(receivedTime)
  ) {
    return "Unknown";
  }

  const seconds =
    (receivedTime - eventTime) / 1000;

  if (seconds < 0) {
    return (
      Math.abs(seconds).toFixed(2)
      + "s before event timestamp"
    );
  }

  if (seconds < 60) {
    return seconds.toFixed(2) + "s";
  }

  return (
    (seconds / 60).toFixed(2)
    + "m"
  );
}


function formatUtcTimestamp(value) {
  if (!value) {
    return {
      date: "Unknown",
      time: "—"
    };
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return {
      date: String(value),
      time: "—"
    };
  }

  const pad = number =>
    String(number).padStart(2, "0");

  return {
    date:
      date.getUTCFullYear()
      + "-"
      + pad(date.getUTCMonth() + 1)
      + "-"
      + pad(date.getUTCDate()),

    time:
      pad(date.getUTCHours())
      + ":"
      + pad(date.getUTCMinutes())
      + ":"
      + pad(date.getUTCSeconds())
  };
}


function eventTimeCell(timestamp) {
  const formatted =
    formatUtcTimestamp(timestamp);

  const root = element(
    "div",
    undefined,
    "event-time-cell"
  );

  root.title =
    timestamp || "Timestamp unavailable";

  root.append(
    element("strong", formatted.time),
    element("small", formatted.date)
  );

  return root;
}


function categoryBadge(category) {
  const value =
    category || "unknown";

  return element(
    "span",
    value,
    "badge event-category-badge category-" + value
  );
}


function sourceBadge(synthetic) {
  const node = badge(
    synthetic ? "replay" : "endpoint"
  );

  node.classList.add(
    synthetic
      ? "event-source-replay"
      : "event-source-endpoint"
  );

  return node;
}


function signalCell(hunting) {
  const root = element(
    "div",
    undefined,
    "event-signal-cell"
  );

  root.append(
    signalBadge(hunting)
  );

  if (
    hunting
    && Number.isFinite(Number(hunting.score))
  ) {
    root.append(
      element(
        "small",
        "Score " + Number(hunting.score),
        "event-signal-score"
      )
    );
  }

  return root;
}


/* =========================================================
   MILESTONE 7B — COLLECTOR TAGGING
   ========================================================= */

function collectorActivity(event) {
  const activity =
    event?.hunting?.collector_activity;

  return activity?.tagged === true
    ? activity
    : null;
}


function collectorTag(event, compact = false) {
  const activity =
    collectorActivity(event);

  if (!activity) {
    return null;
  }

  const tag = element(
    compact ? "small" : "span",

    compact
      ? "Spectra collector · tagged"
      : "Collector activity",

    compact
      ? "event-collector-tag"
      : "badge event-collector-tag"
  );

  tag.title =
    activity.reason
    || "Likely Spectra-generated activity";

  return tag;
}


/* =========================================================
   THREAT HUNTING FILTER STATE
   ========================================================= */

export function resetEventFilters() {

  [
    "endpoint",
    "category",
    "query",
    "guid",
    "event-id",
    "source",
    "start-time",
    "end-time"
  ].forEach(
    id => setControl(id, "")
  );

  setControl(
    "order",
    "desc"
  );

  // Milestone 7B:
  // Show all events by default.

  setControl(
    "collector-activity",
    "all"
  );

  const count =
    $("event-result-count");

  if (count) {
    count.textContent =
      "No search yet";
  }
}


/* =========================================================
   BUILD BACKEND SEARCH PARAMETERS
   ========================================================= */

export function buildEventQueryParams() {

  const params = new URLSearchParams({
    offset: state.offset,
    limit: state.limit,
    order: $("order").value
  });

  const endpointId =
    $("endpoint").value.trim();

  const category =
    $("category").value.trim();

  const query =
    $("query").value.trim();

  const eventId =
    $("event-id").value.trim();

  const source =
    $("source").value.trim();

  const guid =
    normalizeProcessGuid(
      $("guid").value
    );

  const startTime =
    localTimeToIso(
      $("start-time").value
    );

  const endTime =
    localTimeToIso(
      $("end-time").value
    );

  // Collector filter defaults to all activity.

  const collectorControl =
    $("collector-activity");

  const collectorActivityMode =
    collectorControl?.value || "all";


  if (endpointId) {
    params.set(
      "endpoint_id",
      endpointId
    );
  }

  if (category) {
    params.set(
      "category",
      category
    );
  }

  if (query) {
    params.set(
      "q",
      query
    );
  }

  if (eventId) {
    params.set(
      "event_id",
      eventId
    );
  }

  if (source) {
    params.set(
      "source",
      source
    );
  }

  if (guid) {
    params.set(
      "process_guid",
      guid
    );
  }

  if (startTime) {
    params.set(
      "start_time",
      startTime
    );
  }

  if (endTime) {
    params.set(
      "end_time",
      endTime
    );
  }

  // Server-side collector filtering.
  // Count and pagination are handled by the backend.

  params.set(
    "collector_activity",
    collectorActivityMode
  );

  return params;
}


/* =========================================================
   RESULT COUNT
   ========================================================= */

export function renderEventResultCount(total) {
  const node =
    $("event-result-count");

  if (!node) {
    return;
  }

  node.textContent =
    Number(total).toLocaleString()
    + " matching event"
    + (total === 1 ? "" : "s");
}


/* =========================================================
   GENERIC HUNT LAUNCHER
   ========================================================= */

function launchHunt({
  endpointId = "",
  category = "",
  query = "",
  processGuid = "",
  eventId = "",
  source = "",
  order = "desc",
  startTime = "",
  endTime = ""
} = {}) {

  resetEventFilters();

  setControl("endpoint", endpointId);
  setControl("category", category);
  setControl("query", query);
  setControl("guid", processGuid);
  setControl("event-id", eventId);
  setControl("source", source);
  setControl("order", order);
  setControl("start-time", startTime);
  setControl("end-time", endTime);

  state.offset = 0;

  if ($("details")?.open) {
    $("details").close();
  }

  return reloadCurrentView();
}


/* =========================================================
   ANALYST PIVOTS
   ========================================================= */

function huntProcess(event) {
  if (!event.process_guid) {
    return;
  }

  launchHunt({
    endpointId: event.endpoint_id || "",
    processGuid: event.process_guid,
    order: "asc"
  });
}


function huntParentProcess(event) {
  if (!event.parent_guid) {
    return;
  }

  launchHunt({
    endpointId: event.endpoint_id || "",
    processGuid: event.parent_guid,
    category: "process",
    order: "asc"
  });
}


function huntEndpoint(event) {
  launchHunt({
    endpointId: event.endpoint_id || "",
    order: "desc"
  });
}


function huntEventId(event) {
  if (!event.event_id) {
    return;
  }

  launchHunt({
    endpointId: event.endpoint_id || "",
    eventId: event.event_id,
    order: "desc"
  });
}


function huntValue(event) {
  const value =
    event.target
    || event.image
    || event.command_line;

  if (!value) {
    return;
  }

  launchHunt({
    endpointId: event.endpoint_id || "",
    query: String(value),
    order: "desc"
  });
}


function huntProcessCategory(event, category) {
  if (!event.process_guid) {
    return;
  }

  launchHunt({
    endpointId: event.endpoint_id || "",
    processGuid: event.process_guid,
    category,
    order: "asc"
  });
}


function huntTimeWindow(event, minutes) {
  const window = getTimeWindow(
    event.timestamp,
    minutes
  );

  if (!window) {
    return;
  }

  launchHunt({
    endpointId: event.endpoint_id || "",

    startTime: toLocalInputValue(
      window.start
    ),

    endTime: toLocalInputValue(
      window.end
    ),

    order: "asc"
  });
}


/* =========================================================
   DETAIL FIELD
   ========================================================= */

function detailField(label, value) {
  const field = element(
    "div",
    undefined,
    "detail-field event-detail-field"
  );

  field.append(
    element("dt", label),

    element(
      "dd",
      String(value ?? "Unavailable")
    )
  );

  return field;
}


/* =========================================================
   EVENT INSPECTION SUMMARY
   ========================================================= */

function eventSummary(
  event,
  processContext,
  relatedContext
) {

  const root = element(
    "section",
    undefined,
    "event-inspection-summary enterprise-event-inspection"
  );

  const heading = element(
    "div",
    undefined,
    "inspection-heading"
  );

  const headingText =
    element("div");


  headingText.append(

    element(
      "span",
      "INVESTIGATION CONTEXT",
      "eyebrow"
    ),

    element(
      "h3",
      processName(event.image)
    ),

    element(
      "p",

      "Review event metadata, explainable hunting signals, "
      + "process relationships and nearby retained telemetry.",

      "inspection-subtitle"
    )

  );


  const headingBadges = element(
    "div",
    undefined,
    "inspection-badges"
  );


  headingBadges.append(
    categoryBadge(event.category),
    sourceBadge(Boolean(event.synthetic))
  );


  // Milestone 7B collector badge.

  const tagged =
    collectorTag(event);

  if (tagged) {
    headingBadges.append(tagged);
  }


  heading.append(
    headingText,
    headingBadges
  );


  root.append(
    heading
  );


  root.append(
    signalPanel(event.hunting)
  );


  /* -------------------------------------------------------
     Event identity
     ------------------------------------------------------- */

  const identityHeading = element(
    "div",
    undefined,
    "event-context-heading"
  );

  identityHeading.append(

    element(
      "span",
      "EVENT RECORD",
      "eyebrow"
    ),

    element(
      "h3",
      "Telemetry details"
    )

  );

  root.append(
    identityHeading
  );


  const fields = element(
    "dl",
    undefined,
    "detail-grid event-detail-grid"
  );


  const values = [

    [
      "Endpoint",
      hostname(event.endpoint_id)
    ],

    [
      "Endpoint ID",
      event.endpoint_id || "Unavailable"
    ],

    [
      "Event ID",
      event.event_id || "Unavailable"
    ],

    [
      "Category",
      event.category || "Unavailable"
    ],

    [
      "Event time (UTC)",
      event.timestamp || "Unavailable"
    ],

    [
      "Server received (UTC)",
      event.received_at || "Unavailable"
    ],

    [
      "Receipt delay",
      eventDelay(event)
    ],

    [
      "Process",
      event.image || "Not recorded"
    ],

    [
      "Process GUID",
      event.process_guid || "Not recorded"
    ],

    [
      "Parent process",
      event.parent_image || "Not recorded"
    ],

    [
      "Parent GUID",
      event.parent_guid || "Not recorded"
    ],

    [
      "Target",
      event.target || "Not recorded"
    ],

    [
      "Command line",
      event.command_line || "Not recorded"
    ]

  ];


  const activity =
    collectorActivity(event);

  if (activity) {

    values.push(
      [
        "Collector classification",
        activity.kind || "Tagged"
      ],

      [
        "Classification reason",
        activity.reason || "Not reported"
      ]
    );

  }


  values.forEach(
    ([label, value]) => {

      fields.append(
        detailField(label, value)
      );

    }
  );


  root.append(
    fields
  );


  /* -------------------------------------------------------
     Process relationship
     ------------------------------------------------------- */

  const processSection = element(
    "section",
    undefined,
    "hunt-context-section enterprise-context-section"
  );

  const processHeading = element(
    "div",
    undefined,
    "context-section-heading"
  );

  const processCopy = element(
    "div",
    undefined,
    "context-section-copy"
  );


  processCopy.append(

    element(
      "span",
      "PROCESS GRAPH",
      "eyebrow"
    ),

    element(
      "h3",
      "Process relationship"
    ),

    element(
      "p",
      "Reconstructed from retained process GUID relationships."
    )

  );


  processHeading.append(
    processCopy
  );

  processSection.append(
    processHeading,
    processContext
  );


  /* -------------------------------------------------------
     Related telemetry
     ------------------------------------------------------- */

  const relatedSection = element(
    "section",
    undefined,
    "hunt-context-section enterprise-context-section"
  );

  const relatedHeading = element(
    "div",
    undefined,
    "context-section-heading"
  );

  const relatedCopy = element(
    "div",
    undefined,
    "context-section-copy"
  );


  relatedCopy.append(

    element(
      "span",
      "CORRELATION",
      "eyebrow"
    ),

    element(
      "h3",
      "Related telemetry"
    ),

    element(
      "p",
      "Nearby retained events provide context around the selected record."
    )

  );


  relatedHeading.append(
    relatedCopy
  );

  relatedSection.append(
    relatedHeading,
    relatedContext
  );


  root.append(
    processSection,
    relatedSection
  );

  return root;
}


/* =========================================================
   PROCESS RELATIONSHIP LOADING
   ========================================================= */

async function loadProcessContext(
  event,
  container
) {

  container.replaceChildren(
    element(
      "div",
      "Loading process context…",
      "context-loading-state"
    )
  );


  if (!event.process_guid) {

    container.replaceChildren(
      element(
        "div",

        "This event has no recorded process GUID, "
        + "so process relationships cannot be reconstructed.",

        "context-empty-state"
      )
    );

    return;
  }


  try {

    const requests = [];


    /* Parent process */

    if (event.parent_guid) {

      const parentParams = new URLSearchParams({
        endpoint_id: event.endpoint_id,
        category: "process",
        process_guid: event.parent_guid,
        order: "desc",
        offset: "0",
        limit: "10"
      });

      requests.push(
        api(
          "/events?" + parentParams.toString()
        )
      );

    } else {

      requests.push(
        Promise.resolve({
          items: []
        })
      );

    }


    /* Child processes */

    const childParams = new URLSearchParams({
      endpoint_id: event.endpoint_id,
      category: "process",
      q: event.process_guid,
      order: "asc",
      offset: "0",
      limit: "100"
    });


    requests.push(
      api(
        "/events?" + childParams.toString()
      )
    );


    const [
      parentResult,
      childResult
    ] = await Promise.all(requests);


    const parentEvent =
      parentResult.items?.find(
        item =>
          item.process_guid === event.parent_guid
      );


    const children = (
      childResult.items || []
    ).filter(
      item =>
        item.parent_guid === event.process_guid
    );


    const trail = element(
      "div",
      undefined,
      "process-trail enterprise-process-trail"
    );


    /* Parent card */

    const parentCard = element(
      "div",
      undefined,
      "process-trail-node process-parent"
    );

    parentCard.append(
      element("small", "PARENT")
    );


    if (parentEvent) {

      parentCard.append(

        element(
          "strong",
          processName(parentEvent.image)
        ),

        element(
          "span",
          parentEvent.timestamp
        ),

        element(
          "code",
          parentEvent.process_guid
        )

      );

    } else {

      parentCard.append(

        element(
          "strong",
          event.parent_image
          || "Parent record unavailable"
        ),

        element(
          "span",
          event.parent_guid
          || "No parent GUID recorded"
        )

      );

    }


    /* Current process */

    const currentCard = element(
      "div",
      undefined,
      "process-trail-node current"
    );


    currentCard.append(

      element("small", "CURRENT"),

      element(
        "strong",
        processName(event.image)
      ),

      element(
        "span",
        event.timestamp
        || "Unknown timestamp"
      ),

      element(
        "code",
        event.process_guid
      )

    );


    trail.append(
      parentCard,
      currentCard
    );


    /* Child cards */

    if (children.length) {

      children.slice(0, 8).forEach(
        child => {

          const childCard = element(
            "div",
            undefined,
            "process-trail-node child"
          );

          childCard.append(

            element(
              "small",
              "CHILD"
            ),

            element(
              "strong",
              processName(child.image)
            ),

            element(
              "span",
              child.timestamp
            ),

            element(
              "code",
              child.process_guid
            )

          );

          trail.append(
            childCard
          );

        }
      );

    } else {

      const noChildren = element(
        "div",
        undefined,
        "process-trail-node child no-children"
      );


      noChildren.append(

        element(
          "small",
          "CHILDREN"
        ),

        element(
          "strong",
          "None found"
        ),

        element(
          "span",

          "No retained child process records "
          + "matched this GUID."
        )

      );


      trail.append(
        noChildren
      );

    }


    container.replaceChildren(
      trail
    );


    if (children.length > 8) {

      container.append(
        element(
          "p",

          children.length
          + " child processes matched; "
          + "showing the first 8.",

          "context-note"
        )
      );

    }

  } catch (error) {

    container.replaceChildren(
      element(
        "div",

        "Unable to load process context: "
        + error.message,

        "context-error-state"
      )
    );

  }
}


/* =========================================================
   RELATED TELEMETRY LOADING
   ========================================================= */

function categorySummary(events) {

  const counts =
    new Map();


  events.forEach(
    event => {

      const category =
        event.category || "unknown";

      counts.set(
        category,
        (counts.get(category) || 0) + 1
      );

    }
  );


  const summary = element(
    "div",
    undefined,
    "related-category-summary"
  );


  for (
    const [category, count] of counts
  ) {

    summary.append(
      element(
        "span",

        category + " · " + count,

        "badge related-category-badge category-" + category
      )
    );

  }


  return summary;
}


async function loadRelatedTelemetry(
  event,
  container
) {

  container.replaceChildren(
    element(
      "div",
      "Loading related telemetry…",
      "context-loading-state"
    )
  );


  if (!event.endpoint_id) {

    container.replaceChildren(
      element(
        "div",

        "Endpoint context is unavailable for this event.",

        "context-empty-state"
      )
    );

    return;
  }


  try {

    const window =
      getTimeWindow(event.timestamp, 5);


    const params = new URLSearchParams({
      endpoint_id: event.endpoint_id,
      order: "asc",
      offset: "0",
      limit: "50"
    });


    /*
     * Prefer same-process activity.
     */

    if (event.process_guid) {

      params.set(
        "process_guid",
        event.process_guid
      );

    }


    if (window) {

      params.set(
        "start_time",
        window.start.toISOString()
      );

      params.set(
        "end_time",
        window.end.toISOString()
      );

    }


    const data = await api(
      "/events?" + params.toString()
    );


    const events =
      data.items || [];


    const root = element(
      "div",
      undefined,
      "related-telemetry-content"
    );


    const toolbar = element(
      "div",
      undefined,
      "related-telemetry-toolbar"
    );


    toolbar.append(
      categorySummary(events)
    );


    const description =
      event.process_guid

        ? "Same process GUID within ±5 minutes of the selected event."

        : "Same endpoint within ±5 minutes of the selected event.";


    toolbar.append(
      element(
        "p",
        description,
        "related-telemetry-description"
      )
    );


    root.append(
      toolbar
    );


    const recent =
      events.slice(0, 12);


    if (recent.length) {

      const relatedTable = table(

        [
          "Time",
          "Category",
          "Process",
          "Target",
          "Signal"
        ],


        recent.map(
          related => [

            eventTimeCell(
              related.timestamp
            ),

            categoryBadge(
              related.category
            ),

            processName(
              related.image
            ),

            related.target
            || related.command_line
            || "—",

            signalCell(
              related.hunting
            )

          ]
        )

      );


      const wrap = element(
        "div",
        undefined,
        "related-table-wrap"
      );

      wrap.append(
        relatedTable
      );

      root.append(
        wrap
      );

    } else {

      root.append(
        element(
          "div",

          "No related retained telemetry matched "
          + "this context window.",

          "context-empty-state"
        )
      );

    }


    if (data.total > recent.length) {

      root.append(
        element(
          "p",

          data.total.toLocaleString()
          + " related event(s) matched. "
          + "Showing the first "
          + recent.length
          + ".",

          "context-note"
        )
      );

    }


    container.replaceChildren(
      root
    );

  } catch (error) {

    container.replaceChildren(
      element(
        "div",

        "Unable to load related telemetry: "
        + error.message,

        "context-error-state"
      )
    );

  }
}


/* =========================================================
   EVENT INSPECTION
   ========================================================= */

async function inspectEvent(event) {

  const actions = [];


  /* Process pivots */

  if (event.process_guid) {

    const huntProcessButton = button(
      "Hunt this process",
      () => huntProcess(event)
    );

    huntProcessButton.classList.add(
      "primary"
    );

    actions.push(
      huntProcessButton
    );


    actions.push(
      button(
        "Process activity",

        () => launchHunt({
          endpointId: event.endpoint_id || "",
          processGuid: event.process_guid,
          order: "asc"
        })
      )
    );


    actions.push(
      button(
        "Network activity",
        () => huntProcessCategory(event, "network")
      )
    );


    actions.push(
      button(
        "DNS activity",
        () => huntProcessCategory(event, "dns")
      )
    );


    actions.push(
      button(
        "File activity",
        () => huntProcessCategory(event, "file")
      )
    );

  }


  /* Parent pivot */

  if (event.parent_guid) {

    actions.push(
      button(
        "Hunt parent",
        () => huntParentProcess(event)
      )
    );

  }


  /* Endpoint pivot */

  if (event.endpoint_id) {

    actions.push(
      button(
        "Hunt endpoint",
        () => huntEndpoint(event)
      )
    );

  }


  /* Exact event pivot */

  if (event.event_id) {

    actions.push(
      button(
        "Exact event",
        () => huntEventId(event)
      )
    );

  }


  /* Value pivot */

  if (
    event.target
    || event.image
    || event.command_line
  ) {

    actions.push(
      button(
        "Hunt value",
        () => huntValue(event)
      )
    );

  }


  /* Time-window pivots */

  actions.push(

    button(
      "±1 minute",
      () => huntTimeWindow(event, 1)
    ),

    button(
      "±5 minutes",
      () => huntTimeWindow(event, 5)
    ),

    button(
      "±10 minutes",
      () => huntTimeWindow(event, 10)
    )

  );


  const processContext = element(
    "div",
    undefined,
    "async-context"
  );


  const relatedContext = element(
    "div",
    undefined,
    "async-context"
  );


  const summary = eventSummary(
    event,
    processContext,
    relatedContext
  );


  showDetails(
    "Telemetry event",
    event,
    actions,
    summary
  );


  await Promise.allSettled(

    [
      loadProcessContext(
        event,
        processContext
      ),

      loadRelatedTelemetry(
        event,
        relatedContext
      )
    ]

  );
}


/* =========================================================
   CURRENT-PAGE HUNTING SUMMARY
   ========================================================= */

function huntingPageSummary(events) {

  const root = element(
    "div",
    undefined,
    "hunt-results-summary"
  );


  const high = events.filter(
    event =>
      event.hunting?.level === "high_signal"
  ).length;


  const review = events.filter(
    event =>
      event.hunting?.level === "needs_review"
  ).length;


  const context =
    events.length - high - review;


  const stats = [

    [
      "LOADED",
      events.length,
      "Current page",
      "neutral"
    ],

    [
      "HIGH SIGNAL",
      high,
      "Priority review",
      "high"
    ],

    [
      "NEEDS REVIEW",
      review,
      "Analyst attention",
      "review"
    ],

    [
      "CONTEXT",
      context,
      "No configured high-signal match",
      "context"
    ]

  ];


  stats.forEach(
    ([label, value, note, tone]) => {

      const stat = element(
        "div",
        undefined,
        "hunt-result-stat " + tone
      );


      stat.append(

        element(
          "span",
          label
        ),

        element(
          "strong",
          String(value)
        ),

        element(
          "small",
          note
        )

      );


      root.append(
        stat
      );

    }
  );


  return root;
}


/* =========================================================
   MAIN EVENT TABLE
   ========================================================= */

export function eventTable(events) {

  const root = element(
    "div",
    undefined,
    "threat-results"
  );


  root.append(
    huntingPageSummary(events)
  );


  /* Empty state */

  if (!events.length) {

    const empty = element(
      "div",
      undefined,
      "hunt-empty-state"
    );


    empty.append(

      element(
        "strong",
        "No telemetry matched"
      ),

      element(
        "p",

        "Adjust the hunting filters, search another endpoint "
        + "or widen the selected time range."
      )

    );


    root.append(
      empty
    );

    return root;
  }


  /* Results table */

  const results = table(

    [
      "Time (UTC)",
      "Endpoint",
      "Category",
      "Process",
      "Target",
      "Signal",
      "Source",
      "Inspect"
    ],


    events.map(
      event => {

        /* Endpoint */

        const endpoint = element(
          "div",
          undefined,
          "event-endpoint"
        );


        endpoint.append(

          element(
            "strong",
            hostname(event.endpoint_id)
          ),

          element(
            "small",
            event.endpoint_id || "Unavailable"
          )

        );


        /* Process */

        const process = element(
          "div",
          undefined,
          "event-process"
        );


        process.append(
          element(
            "strong",
            processName(event.image)
          )
        );


        /* Milestone 7B collector tag */

        const tag =
          collectorTag(event, true);

        if (tag) {
          process.append(tag);
        }


        /* Process GUID */

        if (event.process_guid) {

          process.append(
            element(
              "small",
              event.process_guid
            )
          );

        }


        /* Target */

        const targetValue =
          event.target
          || event.command_line
          || "—";


        const target = element(
          "span",
          targetValue,
          "event-target"
        );


        target.title =
          targetValue;


        /* Inspect */

        const inspect = button(
          "Inspect",
          () => inspectEvent(event)
        );

        inspect.classList.add(
          "inspect-event-button"
        );


        return [

          eventTimeCell(
            event.timestamp
          ),

          endpoint,

          categoryBadge(
            event.category
          ),

          process,

          target,

          signalCell(
            event.hunting
          ),

          sourceBadge(
            Boolean(event.synthetic)
          ),

          inspect

        ];

      }
    )

  );


  const wrap = element(
    "div",
    undefined,
    "hunt-results-table"
  );


  wrap.append(
    results
  );

  root.append(
    wrap
  );


  root.append(
    element(
      "p",

      "Signal labels are deterministic analyst-priority heuristics. "
      + "Collector filtering affects search visibility only. "
      + "Neither is a malicious/benign verdict.",

      "hunt-results-disclaimer"
    )
  );


  return root;
}
