"use strict";

import {
  state,
  FLEET_PAGE_SIZE
} from "../state.js";

import {
  $,
  element,
  button,
  setContent
} from "../utils.js";

import {
  inputField,
  selectField
} from "../components/forms.js";

import {
  table
} from "../components/table.js";

import {
  badge
} from "../components/badges.js";

import {
  navigate,
  openEndpointEvents
} from "../navigation.js";


/* =========================================================
   Helpers
   ========================================================= */

function number(
  value
) {
  const parsed =
    Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : 0;
}


function formatNumber(
  value
) {
  return number(
    value
  ).toLocaleString();
}


function processStatusLabel(
  value
) {
  if (!value) {
    return "Not reported";
  }

  const text =
    String(value)
      .replaceAll(
        "_",
        " "
      )
      .trim();

  if (!text) {
    return "Not reported";
  }

  return (
    text.charAt(0)
      .toUpperCase() +
    text.slice(1)
  );
}


function telemetryStateLabel(
  value
) {
  switch (value) {

    case "caught_up":
      return "Caught up";

    case "near_realtime":
      return "Near real-time";

    case "catching_up":
      return "Catching up";

    case "unknown":
    case undefined:
    case null:
    case "":
      return "Not reported";

    default:
      return processStatusLabel(
        value
      );
  }
}


function telemetryStateTone(
  value
) {
  switch (value) {

    case "caught_up":
      return "healthy";

    case "near_realtime":
      return "info";

    case "catching_up":
      return "warning";

    default:
      return "neutral";
  }
}


function recordLag(
  endpoint
) {
  const value =
    endpoint
      .heartbeat
      ?.record_lag;

  if (
    value === null ||
    value === undefined ||
    !Number.isFinite(
      Number(value)
    )
  ) {
    return null;
  }

  return Math.max(
    0,
    Number(value)
  );
}


function telemetrySummary(
  endpoint
) {
  const heartbeat =
    endpoint.heartbeat;

  if (!heartbeat) {
    return "Telemetry health not reported";
  }

  const stateLabel =
    telemetryStateLabel(
      heartbeat.telemetry_state
    );

  const lag =
    recordLag(
      endpoint
    );

  if (lag === null) {
    return stateLabel;
  }

  return (
    stateLabel +
    " · lag " +
    formatNumber(
      lag
    )
  );
}


function queueTone(
  endpoint
) {
  const queued =
    number(
      endpoint
        .heartbeat
        ?.queued_events
    );

  if (queued >= 100) {
    return "danger";
  }

  if (queued > 0) {
    return "warning";
  }

  return "healthy";
}


function fleetCard(
  label,
  value,
  note,
  tone = ""
) {
  const card =
    element(
      "article",
      undefined,

      "fleet-kpi-card" +
        (
          tone
            ? " fleet-kpi-" +
              tone
            : ""
        )
    );


  const top =
    element(
      "div",
      undefined,
      "fleet-kpi-top"
    );


  top.append(

    element(
      "span",
      label,
      "fleet-kpi-label"
    ),

    element(
      "span",
      "",
      "fleet-kpi-indicator"
    )

  );


  card.append(

    top,

    element(
      "strong",
      String(value),
      "fleet-kpi-value"
    ),

    element(
      "small",
      note,
      "fleet-kpi-note"
    )

  );


  return card;
}


function infoField(
  label,
  value
) {
  const field =
    element(
      "div",
      undefined,
      "detail-field endpoint-detail-field"
    );


  field.append(

    element(
      "dt",
      label
    ),

    element(
      "dd",

      String(
        value ??
        "Not reported"
      )
    )

  );


  return field;
}


/* =========================================================
   Fleet state
   ========================================================= */

export function updateFleet(
  fleet
) {
  const selected =
    $("endpoint").value;


  state.endpoints =
    fleet;


  state.fleetCapturedAt =
    Date.now();


  $("endpoint")
    .replaceChildren();


  /*
   * Threat Hunting can operate across all endpoints.
   */

  const allOption =
    element(
      "option",
      "All endpoints"
    );


  allOption.value =
    "";


  $("endpoint").append(
    allOption
  );


  fleet.forEach(
    endpoint => {

      const option =
        element(
          "option",

          endpoint.hostname +
            " · " +
            (
              endpoint.platform ||
              "unknown"
            )
        );


      option.value =
        endpoint.id;


      $("endpoint").append(
        option
      );

    }
  );


  /*
   * Preserve the analyst's current endpoint selection
   * when it still exists.
   */

  if (
    selected &&
    fleet.some(
      endpoint =>
        endpoint.id ===
        selected
    )
  ) {

    $("endpoint").value =
      selected;

  } else {

    $("endpoint").value =
      "";

  }
}


/* =========================================================
   Contact age
   ========================================================= */

function heartbeatAge(
  lastSeen,
  capturedAt
) {
  if (!lastSeen) {
    return "Never reported";
  }


  const stamp =
    Date.parse(
      lastSeen
    );


  if (
    !Number.isFinite(
      stamp
    ) ||
    !Number.isFinite(
      capturedAt
    )
  ) {
    return "Unknown";
  }


  const seconds =
    Math.floor(
      (
        capturedAt -
        stamp
      ) /
      1000
    );


  if (seconds < 0) {
    return (
      "Ahead of browser clock"
    );
  }


  if (seconds < 60) {
    return (
      seconds +
      "s ago"
    );
  }


  if (seconds < 3600) {
    return (
      Math.floor(
        seconds / 60
      ) +
      "m ago"
    );
  }


  if (seconds < 86400) {
    return (
      Math.floor(
        seconds / 3600
      ) +
      "h ago"
    );
  }


  return (
    Math.floor(
      seconds / 86400
    ) +
    "d ago"
  );
}


/* =========================================================
   Fleet filtering
   ========================================================= */

function selectFleet(
  fleet,
  filters
) {
  const query =
    filters.query
      .trim()
      .toLowerCase();


  return fleet

    .filter(
      endpoint => {

        const matchesStatus =
          !filters.status ||
          endpoint.status ===
            filters.status;


        const matchesPlatform =
          !filters.platform ||
          endpoint.platform ===
            filters.platform;


        const matchesQuery =
          !query ||

          [
            endpoint.hostname,
            endpoint.id,
            endpoint.platform,

            endpoint
              .heartbeat
              ?.collector_status,

            endpoint
              .heartbeat
              ?.telemetry_state,

            telemetryStateLabel(
              endpoint
                .heartbeat
                ?.telemetry_state
            ),

            endpoint
              .heartbeat
              ?.record_lag,

            endpoint
              .heartbeat
              ?.message

          ].some(
            value =>

              String(
                value ||
                ""
              )
                .toLowerCase()
                .includes(
                  query
                )
          );


        return (
          matchesStatus &&
          matchesPlatform &&
          matchesQuery
        );

      }
    )


    .sort(
      (
        a,
        b
      ) => {

        if (
          filters.sort ===
          "hostname"
        ) {
          return (
            a.hostname.localeCompare(
              b.hostname
            ) ||

            a.id.localeCompare(
              b.id
            )
          );
        }


        if (
          filters.sort ===
          "queue"
        ) {
          return (
            (
              b.heartbeat
                ?.queued_events ??
              -1
            ) -
            (
              a.heartbeat
                ?.queued_events ??
              -1
            ) ||

            a.id.localeCompare(
              b.id
            )
          );
        }


        if (
          filters.sort ===
          "lag"
        ) {
          return (
            (
              recordLag(
                b
              ) ??
              -1
            ) -
            (
              recordLag(
                a
              ) ??
              -1
            ) ||

            a.id.localeCompare(
              b.id
            )
          );
        }


        return (
          (
            Date.parse(
              b.last_seen
            ) ||
            0
          ) -
          (
            Date.parse(
              a.last_seen
            ) ||
            0
          ) ||

          a.id.localeCompare(
            b.id
          )
        );

      }
    );

}


/* =========================================================
   Fleet view
   ========================================================= */

export function renderFleet() {

  const root =
    element(
      "div",
      undefined,
      "fleet-page"
    );


  /* =======================================================
     Command hero
     ======================================================= */

  const command =
    element(
      "section",
      undefined,
      "fleet-command"
    );


  const commandCopy =
    element(
      "div",
      undefined,
      "fleet-command-copy"
    );


  commandCopy.append(

    element(
      "span",
      "ENDPOINT OPERATIONS",
      "eyebrow"
    ),

    element(
      "h2",
      "Fleet command center",
      "fleet-command-title"
    ),

    element(
      "p",

      "Monitor enrolled recorder endpoints, inspect collector health, " +
        "review telemetry lag and pivot directly into retained telemetry.",

      "fleet-command-description"
    )

  );


  const hunt =
    button(
      "Hunt all endpoints",

      () => {

        $("endpoint").value =
          "";

        navigate(
          "events"
        );

      }
    );


  hunt.classList.add(
    "primary"
  );


  command.append(
    commandCopy,
    hunt
  );


  root.append(
    command
  );


  /* =======================================================
     Fleet KPI summary
     ======================================================= */

  const total =
    state.endpoints.length;


  const online =
    state.endpoints.filter(
      endpoint =>
        endpoint.status ===
        "online"
    ).length;


  const offline =
    state.endpoints.filter(
      endpoint =>
        endpoint.status ===
        "offline"
    ).length;


  const neverSeen =
    state.endpoints.filter(
      endpoint =>
        endpoint.status ===
        "never_seen"
    ).length;


  const revoked =
    state.endpoints.filter(
      endpoint =>
        endpoint.status ===
        "revoked"
    ).length;


  const catchingUp =
    state.endpoints.filter(
      endpoint =>
        endpoint
          .heartbeat
          ?.telemetry_state ===
        "catching_up"
    ).length;


  const queued =
    state.endpoints.reduce(
      (
        sum,
        endpoint
      ) =>

        sum +
        number(
          endpoint
            .heartbeat
            ?.queued_events
        ),

      0
    );


  const attention =
    offline +
    neverSeen +
    catchingUp;


  const summary =
    element(
      "div",
      undefined,
      "fleet-kpi-grid"
    );


  summary.append(

    fleetCard(
      "ENROLLED",

      formatNumber(
        total
      ),

      "Known recorder identities",

      "info"
    ),


    fleetCard(
      "ONLINE",

      formatNumber(
        online
      ),

      total
        ? (
            Math.round(
              online /
              total *
              100
            ) +
            "% of fleet"
          )
        : "No endpoints enrolled",

      online > 0
        ? "healthy"
        : "neutral"
    ),


    fleetCard(
      "ATTENTION",

      formatNumber(
        attention
      ),

      offline +
        " offline · " +
        neverSeen +
        " never seen · " +
        catchingUp +
        " catching up",

      attention > 0
        ? "warning"
        : "healthy"
    ),


    fleetCard(
      "QUEUED EVENTS",

      formatNumber(
        queued
      ),

      revoked +
        " revoked · latest reports",

      queued > 0
        ? "warning"
        : "healthy"
    )

  );


  root.append(
    summary
  );


  /* =======================================================
     Fleet filter console
     ======================================================= */

  const filterSection =
    element(
      "section",
      undefined,
      "panel fleet-filter-panel"
    );


  const filterHeading =
    element(
      "div",
      undefined,
      "section-heading"
    );


  const headingCopy =
    element(
      "div"
    );


  headingCopy.append(

    element(
      "span",
      "FLEET SEARCH",
      "eyebrow"
    ),

    element(
      "h2",
      "Find endpoints"
    )

  );


  filterHeading.append(
    headingCopy
  );


  filterSection.append(
    filterHeading
  );


  const controls =
    element(
      "div",
      undefined,
      "fleet-controls enterprise-fleet-controls"
    );


  const filters =
    state.fleetFilters;


  const search =
    inputField(
      controls,

      "Search fleet",

      filters.query,

      "Hostname, device ID, platform, collector or telemetry state"
    );


  search.type =
    "search";


  const connection =
    selectField(
      controls,

      "Connection",

      [
        [
          "",
          "All statuses"
        ],

        [
          "online",
          "Online"
        ],

        [
          "offline",
          "Offline"
        ],

        [
          "never_seen",
          "Never seen"
        ],

        [
          "revoked",
          "Revoked"
        ]
      ],

      filters.status
    );


  const platforms =
    [
      ...new Set(
        state.endpoints
          .map(
            endpoint =>
              endpoint.platform
          )
          .filter(
            Boolean
          )
      )
    ]
      .sort();


  const platform =
    selectField(
      controls,

      "Platform",

      [
        [
          "",
          "All platforms"
        ],

        ...platforms.map(
          value => [
            value,
            value
          ]
        )
      ],

      filters.platform
    );


  const sort =
    selectField(
      controls,

      "Sort by",

      [
        [
          "recent",
          "Latest contact"
        ],

        [
          "hostname",
          "Hostname A–Z"
        ],

        [
          "queue",
          "Highest reported queue"
        ],

        [
          "lag",
          "Highest telemetry lag"
        ]
      ],

      filters.sort
    );


  const results =
    element(
      "section",
      undefined,
      "panel fleet-results-panel"
    );


  function update() {

    Object.assign(
      filters,

      {
        query:
          search.value,

        status:
          connection.value,

        platform:
          platform.value,

        sort:
          sort.value,

        page:
          0
      }
    );


    renderFleetRows(
      results
    );

  }


  search.addEventListener(
    "input",
    update
  );


  [
    connection,
    platform,
    sort
  ].forEach(
    node => {

      node.addEventListener(
        "change",
        update
      );

    }
  );


  filterSection.append(
    controls
  );


  root.append(
    filterSection,
    results
  );


  setContent(
    root
  );


  renderFleetRows(
    results
  );

}


/* =========================================================
   Fleet table
   ========================================================= */

function renderFleetRows(
  container
) {

  const filters =
    state.fleetFilters;


  const rows =
    selectFleet(
      state.endpoints,
      filters
    );


  const totalPages =
    Math.max(
      1,

      Math.ceil(
        rows.length /
        FLEET_PAGE_SIZE
      )
    );


  filters.page =
    Math.max(
      0,

      Math.min(
        filters.page,
        totalPages - 1
      )
    );


  const start =
    filters.page *
    FLEET_PAGE_SIZE;


  /* =======================================================
     Results heading
     ======================================================= */

  const heading =
    element(
      "div",
      undefined,
      "fleet-result-heading enterprise-fleet-result-heading"
    );


  const headingCopy =
    element(
      "div"
    );


  headingCopy.append(

    element(
      "span",
      "ENDPOINT INVENTORY",
      "eyebrow"
    ),

    element(
      "h2",

      rows.length +
        " matching endpoint" +
        (
          rows.length === 1
            ? ""
            : "s"
        )
    )

  );


  const clear =
    button(
      "Clear filters",

      () => {

        state.fleetFilters = {
          query: "",
          status: "",
          platform: "",
          sort: "recent",
          page: 0
        };


        renderFleet();

      }
    );


  heading.append(
    headingCopy,
    clear
  );


  container.replaceChildren(
    heading
  );


  /* =======================================================
     Endpoint table
     ======================================================= */

  if (rows.length) {

    const grid =
      table(

        [
          "Endpoint",
          "Connection",
          "Collector / Telemetry",
          "Contact",
          "Buffer / Queue",
          "Actions"
        ],


        rows
          .slice(
            start,
            start +
            FLEET_PAGE_SIZE
          )

          .map(
            endpoint => {


              /* -------------------------------------------
                 Endpoint identity
                 ------------------------------------------- */

              const name =
                element(
                  "div",
                  undefined,
                  "fleet-device"
                );


              const identity =
                element(
                  "div",
                  undefined,
                  "fleet-device-name"
                );


              identity.append(

                element(
                  "strong",
                  endpoint.hostname
                ),

                element(
                  "span",

                  endpoint.platform ||
                    "Unknown platform"
                )

              );


              name.append(

                identity,

                element(
                  "small",
                  endpoint.id,
                  "device-id"
                )

              );


              /* -------------------------------------------
                 Collector + telemetry health
                 ------------------------------------------- */

              const collector =
                element(
                  "div",
                  undefined,
                  "endpoint-collector-cell"
                );


              collector.append(

                element(
                  "strong",

                  processStatusLabel(
                    endpoint
                      .heartbeat
                      ?.collector_status
                  )
                ),

                element(
                  "small",

                  telemetrySummary(
                    endpoint
                  )
                )

              );


              if (
                endpoint
                  .heartbeat
                  ?.message
              ) {

                collector.append(

                  element(
                    "small",

                    endpoint
                      .heartbeat
                      .message
                  )

                );

              }


              /* -------------------------------------------
                 Contact state
                 ------------------------------------------- */

              const age =
                element(
                  "div",
                  undefined,
                  "endpoint-contact-cell"
                );


              const ageValue =
                heartbeatAge(
                  endpoint.last_seen,
                  state.fleetCapturedAt
                );


              age.append(

                element(
                  "strong",
                  ageValue
                ),

                element(
                  "small",

                  endpoint.last_seen
                    ? "Server contact recorded"
                    : "No contact recorded"
                )

              );


              age.title =
                endpoint.last_seen ||
                "No server contact recorded";


              /* -------------------------------------------
                 Buffer / Queue
                 ------------------------------------------- */

              const bufferEvents =
                endpoint
                  .heartbeat
                  ?.buffer_events;


              const queuedEvents =
                endpoint
                  .heartbeat
                  ?.queued_events;


              const queue =
                element(
                  "div",
                  undefined,

                  "endpoint-queue-cell " +
                    queueTone(
                      endpoint
                    )
                );


              queue.append(

                element(
                  "strong",

                  (
                    bufferEvents ??
                    "—"
                  ) +
                    " / " +
                    (
                      queuedEvents ??
                      "—"
                    )
                ),

                element(
                  "small",
                  "Buffered / queued"
                )

              );


              /* -------------------------------------------
                 Actions
                 ------------------------------------------- */

              const actions =
                element(
                  "div",
                  undefined,
                  "actions fleet-row-actions"
                );


              const details =
                button(
                  "Details",

                  () =>
                    showEndpoint(
                      endpoint
                    )
                );


              details.classList.add(
                "fleet-details-button"
              );


              const events =
                button(
                  "Events",

                  () =>
                    openEndpointEvents(
                      endpoint
                    )
                );


              events.classList.add(
                "fleet-events-button"
              );


              actions.append(
                details,
                events
              );


              return [

                name,

                badge(
                  endpoint.status
                ),

                collector,

                age,

                queue,

                actions

              ];

            }
          )
      );


    container.append(
      grid
    );

  } else {

    const empty =
      element(
        "div",
        undefined,
        "fleet-empty-state"
      );


    empty.append(

      element(
        "strong",

        state.endpoints.length
          ? "No endpoints match these filters"
          : "No endpoints enrolled"
      ),

      element(
        "p",

        state.endpoints.length
          ? (
              "Change the fleet filters or clear them to restore the full inventory."
            )
          : (
              "Enroll an endpoint using the existing recorder enrollment workflow."
            )
      )

    );


    container.append(
      empty
    );

  }


  /* =======================================================
     Pagination
     ======================================================= */

  if (
    rows.length >
    FLEET_PAGE_SIZE
  ) {

    const pager =
      element(
        "div",
        undefined,
        "pager fleet-pager"
      );


    const previous =
      button(
        "Previous",

        () => {

          filters.page--;

          renderFleetRows(
            container
          );

        }
      );


    const next =
      button(
        "Next",

        () => {

          filters.page++;

          renderFleetRows(
            container
          );

        }
      );


    previous.disabled =
      filters.page ===
      0;


    next.disabled =
      start +
      FLEET_PAGE_SIZE >=
      rows.length;


    pager.append(

      previous,

      element(
        "span",

        start +
          1 +
          "–" +
          Math.min(
            start +
            FLEET_PAGE_SIZE,
            rows.length
          ) +
          " of " +
          rows.length,

        "fleet-page-label"
      ),

      next

    );


    container.append(
      pager
    );

  }


  /* =======================================================
     Coverage note
     ======================================================= */

  container.append(

    element(
      "p",

      "Contact age is measured at refresh using your browser clock. " +
        "Event batches and heartbeats both update last contact. " +
        "Telemetry lag is the Sysmon record-position difference between " +
        "the newest record observed by the collector and its last checkpoint; " +
        "it is not an exact count of retained Spectra events. " +
        "Heartbeat values may be stale for offline endpoints.",

      "fleet-coverage-note"
    )

  );

}


/* =========================================================
   Endpoint Details Drawer
   ========================================================= */

function showEndpoint(
  endpoint
) {

  $("endpoint-detail-title")
    .textContent =
    endpoint.hostname;


  const root =
    $("endpoint-detail-body");


  root.replaceChildren();


  const heartbeat =
    endpoint.heartbeat;


  const lag =
    recordLag(
      endpoint
    );


  const telemetryState =
    heartbeat
      ?.telemetry_state;


  /* =======================================================
     Drawer Summary
     ======================================================= */

  const statusHeader =
    element(
      "section",
      undefined,
      "endpoint-drawer-summary"
    );


  const statusCopy =
    element(
      "div",
      undefined,
      "endpoint-drawer-summary-copy"
    );


  statusCopy.append(

    element(
      "span",

      endpoint.platform ||
        "Unknown platform",

      "endpoint-platform-label"
    ),

    element(
      "strong",

      heartbeatAge(
        endpoint.last_seen,
        state.fleetCapturedAt
      ),

      "endpoint-contact-value"
    ),

    element(
      "small",
      "Last observed server contact"
    )

  );


  const statusBadges =
    element(
      "div",
      undefined,
      "endpoint-status-badges"
    );


  statusBadges.append(

    badge(
      endpoint.status
    ),

    element(
      "span",

      processStatusLabel(
        heartbeat
          ?.collector_status
      ),

      "badge"
    )

  );


  if (
    telemetryState &&
    telemetryState !==
    "unknown"
  ) {

    statusBadges.append(

      element(
        "span",

        telemetryStateLabel(
          telemetryState
        ),

        "badge " +
          telemetryStateTone(
            telemetryState
          )
      )

    );

  }


  statusHeader.append(
    statusCopy,
    statusBadges
  );


  root.append(
    statusHeader
  );


  /* =======================================================
     Health Status
     ======================================================= */

  let statusText;


  if (
    endpoint.status ===
    "revoked"
  ) {

    statusText =
      "Device credentials are revoked. " +
      "Previously retained evidence remains searchable.";

  } else if (
    endpoint.status ===
    "never_seen"
  ) {

    statusText =
      "This endpoint is enrolled but has not contacted the recorder server.";

  } else if (
    endpoint.status ===
    "offline"
  ) {

    statusText =
      "No recent server contact. Collector, telemetry-lag and queue values " +
      "describe the last available heartbeat report.";

  } else if (
    telemetryState ===
    "catching_up"
  ) {

    statusText =
      "Recent contact confirms communication with the server. " +
      "The collector is running but is still catching up with Sysmon" +
      (
        lag === null
          ? "."
          : (
              " and is " +
              formatNumber(
                lag
              ) +
              " record positions behind the newest observed Sysmon record."
            )
      );

  } else if (
    telemetryState ===
    "near_realtime"
  ) {

    statusText =
      "Recent contact confirms communication with the server. " +
      "The collector reports near real-time telemetry" +
      (
        lag === null
          ? "."
          : (
              " with a record-position lag of " +
              formatNumber(
                lag
              ) +
              "."
            )
      );

  } else if (
    telemetryState ===
    "caught_up"
  ) {

    statusText =
      "Recent contact confirms communication with the server. " +
      "The collector reports that its Sysmon checkpoint is caught up with " +
      "the newest record observed during the latest collection cycle.";

  } else {

    statusText =
      "Recent contact confirms communication with the server. " +
      "Collector health is available, but telemetry-lag reporting has not " +
      "been provided by this endpoint.";

  }


  const healthBanner =
    element(
      "div",
      undefined,

      "endpoint-health-banner " +
        endpoint.status
    );


  healthBanner.append(

    element(
      "span",
      "",
      "endpoint-health-dot"
    ),

    element(
      "p",
      statusText
    )

  );


  root.append(
    healthBanner
  );


  /* =======================================================
     Identity & Health
     ======================================================= */

  const identitySection =
    element(
      "section",
      undefined,
      "endpoint-drawer-section"
    );


  identitySection.append(

    element(
      "span",
      "IDENTITY & HEALTH",
      "eyebrow"
    ),

    element(
      "h3",
      "Endpoint details"
    )

  );


  const fields =
    element(
      "dl",
      undefined,
      "detail-grid endpoint-detail-grid"
    );


  [
    [
      "Endpoint ID",
      endpoint.id
    ],

    [
      "Platform",

      endpoint.platform ||
        "Unknown"
    ],

    [
      "Enrolled (UTC)",
      endpoint.created_at
    ],

    [
      "Last server contact (UTC)",

      endpoint.last_seen ||
        "Never reported"
    ],

    [
      "Contact age",

      heartbeatAge(
        endpoint.last_seen,
        state.fleetCapturedAt
      )
    ],

    [
      "Collector",

      processStatusLabel(
        heartbeat
          ?.collector_status
      )
    ],

    [
      "Telemetry state",

      telemetryStateLabel(
        heartbeat
          ?.telemetry_state
      )
    ],

    [
      "Record-position lag",

      heartbeat
        ?.record_lag ===
        null ||

      heartbeat
        ?.record_lag ===
        undefined

        ? "Not reported"

        : formatNumber(
            heartbeat.record_lag
          )
    ],

    [
      "Last source checkpoint",

      heartbeat
        ?.last_record_id ??
        "Not reported"
    ],

    [
      "Newest Sysmon record",

      heartbeat
        ?.latest_record_id ??
        "Not reported"
    ],

    [
      "Oldest available Sysmon record",

      heartbeat
        ?.oldest_record_id ??
        "Not reported"
    ],

    [
      "Last collection (UTC)",

      heartbeat
        ?.last_collection_at ??
        "Not reported"
    ],

    [
      "Last collection age",

      heartbeat
        ?.last_collection_at

        ? heartbeatAge(
            heartbeat.last_collection_at,
            state.fleetCapturedAt
          )

        : "Not reported"
    ],

    [
      "Raw records in last collection",

      heartbeat
        ?.last_collection_count ??
        "Not reported"
    ],

    [
      "Buffered events",

      heartbeat
        ?.buffer_events ??
        "Not reported"
    ],

    [
      "Queued events",

      heartbeat
        ?.queued_events ??
        "Not reported"
    ]

  ].forEach(
    (
      [
        label,
        value
      ]
    ) => {

      fields.append(

        infoField(
          label,
          value
        )

      );

    }
  );


  identitySection.append(
    fields
  );


  root.append(
    identitySection
  );


  /* =======================================================
     Replay Warning
     ======================================================= */

  if (
    endpoint.platform ===
      "replay" ||

    heartbeat
      ?.collector_status ===
      "replay"
  ) {

    root.append(

      element(
        "p",

        "Synthetic replay endpoint. These records exist for demonstration " +
          "and validation; no attack execution is implied.",

        "coverage-note"
      )

    );

  }


  /* =======================================================
     Collector Report
     ======================================================= */

  const collectorSection =
    element(
      "section",
      undefined,
      "endpoint-drawer-section"
    );


  collectorSection.append(

    element(
      "span",
      "COLLECTOR REPORT",
      "eyebrow"
    ),

    element(
      "h3",
      "Latest collector report"
    )

  );


  const reportLines =
    [

      "Collector: " +
        processStatusLabel(
          heartbeat
            ?.collector_status
        ),

      "Telemetry: " +
        telemetryStateLabel(
          heartbeat
            ?.telemetry_state
        ),

      "Record-position lag: " +
        (
          lag === null
            ? "Not reported"
            : formatNumber(
                lag
              )
        ),

      "Upload queue: " +
        (
          heartbeat
            ?.queued_events ??
          "Not reported"
        ),

      "Last checkpoint: " +
        (
          heartbeat
            ?.last_record_id ??
          "Not reported"
        ),

      "Newest Sysmon record: " +
        (
          heartbeat
            ?.latest_record_id ??
          "Not reported"
        ),

      "Last collection: " +
        (
          heartbeat
            ?.last_collection_at ??
          "Not reported"
        ),

      "Message: " +
        (
          heartbeat
            ?.message ||
          "No collector message reported."
        )

    ];


  const collectorMessage =
    element(
      "pre",

      reportLines.join(
        "\n"
      ),

      "endpoint-collector-message"
    );


  collectorSection.append(

    collectorMessage,

    element(
      "p",

      "Record-position lag measures how far the collector checkpoint is " +
        "behind the newest Sysmon record it observed. It is not an exact " +
        "count of Spectra events waiting to be stored.",

      "coverage-note"
    )

  );


  root.append(
    collectorSection
  );


  /* =======================================================
     Analyst Pivots
     ======================================================= */

  const exploreSection =
    element(
      "section",
      undefined,
      "endpoint-drawer-section"
    );


  exploreSection.append(

    element(
      "span",
      "ANALYST PIVOTS",
      "eyebrow"
    ),

    element(
      "h3",
      "Explore retained telemetry"
    ),

    element(
      "p",

      "Open Threat Hunting with this endpoint and an optional " +
        "event category already selected."
    )

  );


  const actions =
    element(
      "div",
      undefined,
      "endpoint-quick-actions"
    );


  [
    [
      "All telemetry",
      ""
    ],

    [
      "Processes",
      "process"
    ],

    [
      "Files",
      "file"
    ],

    [
      "Network",
      "network"
    ],

    [
      "DNS",
      "dns"
    ],

    [
      "Health",
      "health"
    ]

  ].forEach(
    (
      [
        label,
        category
      ]
    ) => {

      const action =
        button(
          label,

          () =>
            openEndpointEvents(
              endpoint,
              category
            )
        );


      if (!category) {

        action.classList.add(
          "primary"
        );

      }


      actions.append(
        action
      );

    }
  );


  exploreSection.append(
    actions
  );


  root.append(
    exploreSection
  );


  /* =======================================================
     Snapshot Footer
     ======================================================= */

  root.append(

    element(
      "p",

      "Snapshot captured at " +
        new Date(
          state.fleetCapturedAt
        ).toLocaleString() +
        ". Refresh the dashboard to request newer endpoint reports.",

      "endpoint-snapshot-note"
    )

  );


  /* =======================================================
     Open Drawer
     ======================================================= */

  if (
    !$("endpoint-details")
      .open
  ) {

    $("endpoint-details")
      .showModal();

  }

}