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
  setContent,
  message,
  hostname
} from "../utils.js";

import {
  selectField
} from "../components/forms.js";

import {
  badge
} from "../components/badges.js";

import {
  showDetails
} from "../components/dialog.js";

import {
  navigate,
  linkedEvents
} from "../navigation.js";


/* =========================================================
   Helpers
   ========================================================= */

function processName(
  path
) {
  return (
    String(
      path ||
      "Unknown process"
    )
      .split(/[\\/]/)
      .pop()
    ||
    path
  );
}


function formatNumber(
  value
) {
  const parsed =
    Number(value);

  return Number.isFinite(parsed)
    ? parsed.toLocaleString()
    : "0";
}


function sourceLabel(
  synthetic
) {
  if (
    synthetic === true
  ) {
    return "Replay";
  }

  if (
    synthetic === false
  ) {
    return "Endpoint";
  }

  return "Unknown";
}


function createIncidentStat(
  label,
  value,
  note,
  tone = ""
) {
  const stat =
    element(
      "div",
      undefined,
      "incident-stat" +
        (
          tone
            ? " " + tone
            : ""
        )
    );


  stat.append(
    element(
      "span",
      label,
      "incident-stat-label"
    ),

    element(
      "strong",
      String(value),
      "incident-stat-value"
    ),

    element(
      "small",
      note,
      "incident-stat-note"
    )
  );


  return stat;
}


function detailField(
  label,
  value
) {
  const field =
    element(
      "div",
      undefined,
      "incident-process-field"
    );


  field.append(
    element(
      "span",
      label
    ),

    element(
      "strong",
      String(
        value ??
        "Unavailable"
      )
    )
  );


  return field;
}


function timelineTimestamp(
  value
) {
  if (!value) {
    return "Unknown time";
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return String(value);
  }

  return (
    date
      .toISOString()
      .replace(
        "T",
        " "
      )
      .replace(
        "Z",
        " UTC"
      )
  );
}


/* =========================================================
   Timeline filtering
   ========================================================= */

function filterIncidentEvents(
  events,
  filters,
  triggerTime
) {
  const query =
    filters.query
      .trim()
      .toLowerCase();


  const trigger =
    Date.parse(
      triggerTime
    );


  return events

    .filter(
      event => {

        const stamp =
          Date.parse(
            event.timestamp
          );


        return (
          (
            !filters.category ||
            event.category ===
              filters.category
          ) &&

          (
            !filters.guid ||
            event.process_guid ===
              filters.guid
          ) &&

          (
            !filters.source ||
            (
              filters.source ===
                "replay"
                ? event.synthetic ===
                  true
                : event.synthetic ===
                  false
            )
          ) &&

          (
            !filters.period ||
            (
              filters.period ===
                "before"
                ? stamp <
                  trigger
                : stamp >=
                  trigger
            )
          ) &&

          (
            !query ||

            JSON.stringify(
              event
            )
              .toLowerCase()
              .includes(
                query
              )
          )
        );
      }
    )


    .sort(
      (
        a,
        b
      ) =>
        Date.parse(
          a.timestamp
        ) -
        Date.parse(
          b.timestamp
        ) ||

        String(
          a.event_id
        ).localeCompare(
          String(
            b.event_id
          )
        )
    );
}


/* =========================================================
   Process graph normalization
   ========================================================= */

function processForest(
  graph
) {
  const graphNodes =
    graph.nodes ||
    [];


  const graphEdges =
    graph.edges ||
    [];


  const nodes =
    new Map(
      graphNodes.map(
        node => [
          node.process_guid,
          node
        ]
      )
    );


  const children =
    new Map();


  const hasParent =
    new Set();


  for (
    const edge of
    graphEdges
  ) {

    if (
      !nodes.has(
        edge.parent
      ) ||
      !nodes.has(
        edge.child
      )
    ) {
      continue;
    }


    if (
      !children.has(
        edge.parent
      )
    ) {
      children.set(
        edge.parent,
        []
      );
    }


    if (
      !children
        .get(
          edge.parent
        )
        .includes(
          edge.child
        )
    ) {
      children
        .get(
          edge.parent
        )
        .push(
          edge.child
        );
    }


    hasParent.add(
      edge.child
    );
  }


  const rows =
    [];


  const visited =
    new Set();


  function walk(
    id,
    extra
  ) {
    const stack = [
      {
        id,
        depth: 0,
        extra
      }
    ];


    while (
      stack.length
    ) {
      const item =
        stack.pop();


      if (
        visited.has(
          item.id
        )
      ) {
        continue;
      }


      visited.add(
        item.id
      );


      rows.push({
        ...item,

        node:
          nodes.get(
            item.id
          )
      });


      const childIds =
        children.get(
          item.id
        ) ||
        [];


      for (
        let index =
          childIds.length -
          1;

        index >= 0;

        index--
      ) {
        stack.push({
          id:
            childIds[index],

          depth:
            item.depth +
            1,

          extra:
            false
        });
      }
    }
  }


  for (
    const id of
    nodes.keys()
  ) {

    if (
      !hasParent.has(
        id
      )
    ) {
      walk(
        id,
        false
      );
    }

  }


  /*
   * Malformed cycles or disconnected components must
   * remain visible and must never trap the renderer.
   */

  for (
    const id of
    nodes.keys()
  ) {

    if (
      !visited.has(
        id
      )
    ) {
      walk(
        id,
        true
      );
    }

  }


  return rows;
}


/* =========================================================
   Investigation workspace
   ========================================================= */

function renderInvestigation(
  incident,
  graph
) {
  const events =
    incident.events ||
    [];


  const graphNodes =
    graph.nodes ||
    [];


  const unresolvedParents =
    graph.unresolved_parents ||
    [];


  const trigger =
    events.find(
      event =>
        event.event_id ===
        incident.trigger_event_id
    );


  const health =
    incident.known_gaps ||
    events.filter(
      event =>
        event.category ===
        "health"
    );


  const root =
    element(
      "div",
      undefined,
      "investigation-workspace"
    );


  /* =======================================================
     Command bar
     ======================================================= */

  const commandBar =
    element(
      "div",
      undefined,
      "incident-command-bar"
    );


  const back =
    button(
      "← Investigations",

      () =>
        navigate(
          "incidents"
        )
    );


  back.classList.add(
    "incident-back-button"
  );


  const primaryActions =
    element(
      "div",
      undefined,
      "actions incident-primary-actions"
    );


  const evidence =
    button(
      "Download evidence ZIP",

      () =>
        downloadEvidence(
          incident.id
        )
    );


  const statusAction =
    button(
      incident.status ===
        "resolved"
        ? "Reopen incident"
        : "Resolve incident",

      () =>
        changeStatus(
          incident
        )
    );


  statusAction.classList.add(
    "incident-status-action"
  );


  if (
    incident.status !==
    "resolved"
  ) {
    statusAction.classList.add(
      "primary"
    );
  }


  primaryActions.append(
    evidence,
    statusAction
  );


  commandBar.append(
    back,
    primaryActions
  );


  root.append(
    commandBar
  );


  /* =======================================================
     Incident hero
     ======================================================= */

  const hero =
    element(
      "section",
      undefined,
      "incident-hero"
    );


  const heroCopy =
    element(
      "div",
      undefined,
      "incident-hero-copy"
    );


  heroCopy.append(
    element(
      "span",
      "INCIDENT RESPONSE",
      "eyebrow"
    ),

    element(
      "h2",
      "Recorded incident analysis",
      "incident-hero-title"
    ),

    element(
      "p",

      "Reconstruct available process ancestry and retained endpoint activity " +
      "around the alert trigger without assuming complete telemetry coverage.",

      "incident-hero-description"
    )
  );


  const meta =
    element(
      "div",
      undefined,
      "incident-meta-badges"
    );


  meta.append(
    badge(
      incident.severity
    ),

    badge(
      incident.status
    ),

    element(
      "span",
      incident.rule_id ||
        "Rule unavailable",
      "badge incident-rule-badge"
    ),

    element(
      "span",
      incident.technique ||
        "Technique unavailable",
      "badge incident-technique-badge"
    ),

    element(
      "span",

      incident.window_state ===
        "collecting"
        ? "Collecting"
        : "Window elapsed",

      "badge incident-window-badge"
    ),

    element(
      "span",

      trigger
        ? sourceLabel(
            trigger.synthetic
          ) +
          " trigger"
        : "Trigger source unavailable",

      "badge incident-source-badge"
    )
  );


  hero.append(
    heroCopy,
    meta
  );


  root.append(
    hero
  );


  /* =======================================================
     Incident statistics
     ======================================================= */

  const stats =
    element(
      "div",
      undefined,
      "incident-stat-grid"
    );


  stats.append(
    createIncidentStat(
      "WINDOW EVENTS",
      formatNumber(
        events.length
      ),
      "Available incident-window records",
      "info"
    ),

    createIncidentStat(
      "PROCESSES",
      formatNumber(
        graphNodes.length
      ),
      "Recorded process nodes",
      "healthy"
    ),

    createIncidentStat(
      "UNRESOLVED",
      formatNumber(
        unresolvedParents.length
      ),
      "Parent references",
      unresolvedParents.length
        ? "warning"
        : "healthy"
    ),

    createIncidentStat(
      "HEALTH RECORDS",
      formatNumber(
        health.length
      ),
      "May indicate collection gaps",
      health.length
        ? "warning"
        : "neutral"
    )
  );


  root.append(
    stats
  );


  /* =======================================================
     Recording window
     ======================================================= */

  const windowPanel =
    element(
      "section",
      undefined,
      "incident-window-panel"
    );


  const windowHeading =
    element(
      "div",
      undefined,
      "incident-window-heading"
    );


  windowHeading.append(
    element(
      "span",
      "RECORDED WINDOW",
      "eyebrow"
    ),

    element(
      "strong",
      incident.window_state ===
        "collecting"
        ? "Post-alert collection active"
        : "Recording window elapsed"
    )
  );


  const windowDetails =
    element(
      "div",
      undefined,
      "incident-window-times"
    );


  windowDetails.append(
    detailField(
      "Window start",
      incident.window_start
    ),

    detailField(
      "Alert trigger",
      incident.triggered_at
    ),

    detailField(
      "Window end",
      incident.window_end
    )
  );


  windowPanel.append(
    windowHeading,
    windowDetails
  );


  root.append(
    windowPanel
  );


  /* =======================================================
     Coverage warning
     ======================================================= */

  const coverage =
    element(
      "div",
      undefined,
      "incident-coverage-banner"
    );


  coverage.append(
    element(
      "div",
      "!",
      "incident-coverage-icon"
    ),

    element(
      "div",
      undefined,
      "incident-coverage-copy"
    )
  );


  coverage.lastElementChild.append(
    element(
      "strong",
      "Telemetry coverage remains unknown"
    ),

    element(
      "p",

      unresolvedParents.length +
        " unresolved parent reference(s) · " +
        health.length +
        " health record(s). Health records may describe collection gaps; " +
        "their absence does not prove complete coverage. An elapsed recording " +
        "window does not mean every event arrived."
    )
  );


  root.append(
    coverage
  );


  /* =======================================================
     Investigation grid
     ======================================================= */

  const grid =
    element(
      "div",
      undefined,
      "investigation-grid enterprise-investigation-grid"
    );


  const left =
    element(
      "section",
      undefined,
      "investigation-card process-tree-card"
    );


  const right =
    element(
      "section",
      undefined,
      "investigation-card timeline-card"
    );


  /* =======================================================
     Process Tree Header
     ======================================================= */

  const processHeading =
    element(
      "div",
      undefined,
      "investigation-card-heading"
    );


  const processHeadingCopy =
    element(
      "div"
    );


  processHeadingCopy.append(
    element(
      "span",
      "PROCESS GRAPH",
      "eyebrow"
    ),

    element(
      "h2",
      "Process tree"
    ),

    element(
      "p",

      "Recorded parent-child relationships inside this incident window. " +
      "Select a process to focus the timeline."
    )
  );


  processHeading.append(
    processHeadingCopy
  );


  left.append(
    processHeading
  );


  const tree =
    element(
      "div",
      undefined,
      "process-tree"
    );


  tree.setAttribute(
    "aria-label",
    "Recorded process relationships"
  );


  const inspector =
    element(
      "div",
      undefined,
      "process-inspector enterprise-process-inspector"
    );


  left.append(
    tree
  );


  /* =======================================================
     Timeline Header
     ======================================================= */

  const timelineHeading =
    element(
      "div",
      undefined,
      "investigation-card-heading"
    );


  const timelineHeadingCopy =
    element(
      "div"
    );


  timelineHeadingCopy.append(
    element(
      "span",
      "RECORDED ACTIVITY",
      "eyebrow"
    ),

    element(
      "h2",
      "Incident timeline"
    ),

    element(
      "p",

      "Filter the available incident-window events without changing the evidence package."
    )
  );


  timelineHeading.append(
    timelineHeadingCopy
  );


  right.append(
    timelineHeading
  );


  grid.append(
    left,
    right
  );


  root.append(
    grid
  );


  /* =======================================================
     Timeline Filter State
     ======================================================= */

  const filters = {
    query: "",
    category: "",
    guid: "",
    source: "",
    period: "",
    page: 0
  };


  const controls =
    element(
      "div",
      undefined,
      "timeline-controls enterprise-timeline-controls"
    );


  const searchLabel =
    element(
      "label",
      "Search recorded fields",
      "timeline-search"
    );


  const search =
    element(
      "input"
    );


  search.type =
    "search";


  search.placeholder =
    "Command, filename, IP, DNS name or event ID";


  searchLabel.append(
    search
  );


  controls.append(
    searchLabel
  );


  const names =
    new Map(
      graphNodes.map(
        node => [
          node.process_guid,
          node
        ]
      )
    );


  const allGuids = [
    ...new Set(
      [
        ...graphNodes.map(
          node =>
            node.process_guid
        ),

        ...events.map(
          event =>
            event.process_guid
        )
      ]
        .filter(
          Boolean
        )
    )
  ];


  const categories = [
    ...new Set(
      events
        .map(
          event =>
            event.category
        )
        .filter(
          Boolean
        )
    )
  ]
    .sort();


  const category =
    selectField(
      controls,
      "Category",

      [
        [
          "",
          "All categories"
        ],

        ...categories.map(
          value => [
            value,
            value
          ]
        )
      ]
    );


  const process =
    selectField(
      controls,
      "Process",

      [
        [
          "",
          "All processes"
        ],

        ...allGuids.map(
          id => [
            id,

            names.has(
              id
            )
              ? (
                  processName(
                    names.get(
                      id
                    ).image
                  ) +
                  " · " +
                  id
                )

              : (
                  id +
                  " · process record missing"
                )
          ]
        )
      ]
    );


  const source =
    selectField(
      controls,
      "Source",

      [
        [
          "",
          "All sources"
        ],

        [
          "endpoint",
          "Endpoint"
        ],

        [
          "replay",
          "Synthetic replay"
        ]
      ]
    );


  const period =
    selectField(
      controls,
      "Relative to alert",

      [
        [
          "",
          "Full window"
        ],

        [
          "before",
          "Before alert"
        ],

        [
          "after",
          "At / after alert"
        ]
      ]
    );


  const timeline =
    element(
      "div",
      undefined,
      "timeline-list enterprise-timeline"
    );


  const selection =
    element(
      "p",
      "",
      "timeline-selection"
    );


  selection.setAttribute(
    "role",
    "status"
  );


  const inputs = {
    query:
      search,

    category,

    guid:
      process,

    source,

    period
  };


  const processButtons =
    new Map();


  /* =======================================================
     Filter update
     ======================================================= */

  function updateFilters() {

    for (
      const [
        key,
        input
      ] of
      Object.entries(
        inputs
      )
    ) {
      filters[key] =
        input.value;
    }


    filters.page =
      0;


    updateProcess();
    renderTimeline();
  }


  search.addEventListener(
    "input",
    updateFilters
  );


  [
    category,
    process,
    source,
    period
  ].forEach(
    input =>
      input.addEventListener(
        "change",
        updateFilters
      )
  );


  const reset =
    button(
      "Clear timeline filters",

      () => {

        Object.values(
          inputs
        ).forEach(
          input => {
            input.value =
              "";
          }
        );


        updateFilters();
      }
    );


  reset.classList.add(
    "timeline-reset-button"
  );


  right.append(
    controls,
    reset,
    selection,
    timeline
  );


  /* =======================================================
     Process Tree
     ======================================================= */

  const forest =
    processForest(
      graph
    );


  let shown =
    0;


  const more =
    button(
      "Show more processes",
      showMoreProcesses
    );


  more.classList.add(
    "process-more-button"
  );


  left.append(
    more,
    inspector
  );


  function showMoreProcesses() {

    const end =
      Math.min(
        shown +
        200,

        forest.length
      );


    for (
      ;
      shown < end;
      shown++
    ) {
      const item =
        forest[shown];


      const nodeData =
        item.node;


      if (!nodeData) {
        continue;
      }


      const row =
        element(
          "div",
          undefined,
          "process-row"
        );


      row.style.setProperty(
        "--indent",

        Math.min(
          item.depth,
          10
        ) *
        12 +
        "px"
      );


      const node =
        button(
          "",

          () => {

            process.value =
              nodeData.process_guid;


            updateFilters();
          }
        );


      node.className =
        "process-node enterprise-process-node";


      node.classList.toggle(
        "selected",

        filters.guid ===
          nodeData.process_guid
      );


      node.setAttribute(
        "aria-pressed",

        String(
          filters.guid ===
            nodeData.process_guid
        )
      );


      const identity =
        element(
          "div",
          undefined,
          "process-node-identity"
        );


      identity.append(
        element(
          "strong",
          processName(
            nodeData.image
          )
        ),

        element(
          "small",

          "PID " +
          (
            nodeData.process_id ??
            "unknown"
          ) +
          " · " +
          (
            nodeData.synthetic
              ? "Replay"
              : "Endpoint"
          )
        )
      );


      node.append(
        identity
      );


      if (
        nodeData.process_guid ===
        incident.process_guid
      ) {
        node.append(
          element(
            "span",
            "ALERT PROCESS",
            "process-alert-label"
          )
        );
      }


      if (
        item.extra
      ) {
        node.append(
          element(
            "small",

            "Cycle or disconnected component; ancestry is not fully represented",

            "process-warning-label"
          )
        );
      }


      if (
        item.depth >
        10
      ) {
        node.append(
          element(
            "small",

            "Depth " +
            item.depth +
            " · indentation capped",

            "process-warning-label"
          )
        );
      }


      node.title =
        (
          nodeData.image ||
          "Unknown process"
        ) +
        "\n" +
        nodeData.process_guid;


      row.append(
        node
      );


      tree.append(
        row
      );


      processButtons.set(
        nodeData.process_guid,
        node
      );
    }


    more.hidden =
      shown >=
      forest.length;


    more.textContent =
      "Show more processes (" +
      (
        forest.length -
        shown
      ) +
      " remaining)";
  }


  /* =======================================================
     Selected Process Inspector
     ======================================================= */

  function updateProcess() {

    for (
      const [
        id,
        node
      ] of
      processButtons
    ) {

      node.classList.toggle(
        "selected",
        id ===
          filters.guid
      );


      node.setAttribute(
        "aria-pressed",

        String(
          id ===
            filters.guid
        )
      );
    }


    inspector.replaceChildren();


    const inspectorHeading =
      element(
        "div",
        undefined,
        "process-inspector-heading"
      );


    inspectorHeading.append(
      element(
        "span",
        "PROCESS INSPECTOR",
        "eyebrow"
      ),

      element(
        "h3",
        "Selected process"
      )
    );


    inspector.append(
      inspectorHeading
    );


    if (
      !filters.guid
    ) {

      inspector.append(
        element(
          "div",

          "Choose a process node or use the Process filter to inspect its recorded context.",

          "process-inspector-empty"
        )
      );


      return;
    }


    const nodeData =
      names.get(
        filters.guid
      );


    if (!nodeData) {

      inspector.append(
        element(
          "div",

          "This GUID has related events but no process execution record inside this recording window.",

          "process-inspector-empty"
        ),

        element(
          "pre",
          filters.guid,
          "process-guid-block"
        )
      );


      return;
    }


    inspector.append(
      element(
        "strong",
        processName(
          nodeData.image
        ),
        "selected-process-name"
      )
    );


    const details =
      element(
        "div",
        undefined,
        "incident-process-detail-grid"
      );


    details.append(
      detailField(
        "Process GUID",
        nodeData.process_guid
      ),

      detailField(
        "PID",
        nodeData.process_id ??
          "Unknown"
      ),

      detailField(
        "Recorded parent",
        nodeData.parent_image ||
          "Unknown"
      ),

      detailField(
        "Parent GUID",
        nodeData.parent_guid ||
          "No parent GUID"
      ),

      detailField(
        "Source",
        nodeData.synthetic
          ? "Replay"
          : "Endpoint"
      )
    );


    inspector.append(
      details
    );


    const commandSection =
      element(
        "div",
        undefined,
        "process-command-section"
      );


    commandSection.append(
      element(
        "span",
        "COMMAND LINE"
      ),

      element(
        "pre",

        nodeData.command_line ||
        "Not recorded"
      )
    );


    inspector.append(
      commandSection
    );


    const inspectorActions =
      element(
        "div",
        undefined,
        "actions process-inspector-actions"
      );


    inspectorActions.append(
      button(
        "Inspect process event",

        () =>
          showDetails(
            "Process execution",
            nodeData
          )
      ),

      button(
        "Explore linked telemetry",

        () =>
          linkedEvents(
            nodeData,
            incident.endpoint_id
          )
      )
    );


    inspector.append(
      inspectorActions
    );
  }


  /* =======================================================
     Timeline
     ======================================================= */

  function renderTimeline() {

    const rows =
      filterIncidentEvents(
        events,
        filters,
        incident.triggered_at
      );


    const size =
      50;


    filters.page =
      Math.max(
        0,

        Math.min(
          filters.page,

          Math.ceil(
            rows.length /
            size
          ) -
          1
        )
      );


    const start =
      filters.page *
      size;


    timeline.replaceChildren();


    selection.textContent =
      rows.length +
      " of " +
      events.length +
      " window events · oldest first · filters affect this view only";


    rows
      .slice(
        start,
        start +
        size
      )
      .forEach(
        event => {

          const isTrigger =
            event.event_id ===
            incident.trigger_event_id;


          const row =
            element(
              "article",
              undefined,

              "timeline-event enterprise-timeline-event" +
              (
                isTrigger
                  ? " trigger"
                  : ""
              )
            );


          const head =
            element(
              "div",
              undefined,
              "timeline-event-head"
            );


          head.append(
            element(
              "small",
              timelineTimestamp(
                event.timestamp
              ),
              "timeline-event-time"
            ),

            badge(
              event.category
            ),

            element(
              "span",

              event.synthetic
                ? "Replay"
                : "Endpoint",

              "badge"
            )
          );


          if (
            isTrigger
          ) {
            head.append(
              element(
                "span",
                "ALERT TRIGGER",
                "badge high"
              )
            );
          }


          const body =
            element(
              "div",
              undefined,
              "timeline-event-body"
            );


          body.append(
            element(
              "strong",
              processName(
                event.image
              )
            ),

            element(
              "p",

              event.target ||
              event.command_line ||
              "No target or command recorded"
            )
          );


          const eventActions =
            element(
              "div",
              undefined,
              "actions timeline-event-actions"
            );


          eventActions.append(
            button(
              "Inspect event",

              () =>
                showDetails(
                  "Recorded event",
                  event,

                  event.process_guid
                    ? [
                        button(
                          "Explore linked telemetry",

                          () =>
                            linkedEvents(
                              event,
                              incident.endpoint_id
                            )
                        )
                      ]
                    : []
                )
            )
          );


          body.append(
            eventActions
          );


          row.append(
            head,
            body
          );


          timeline.append(
            row
          );
        }
      );


    if (!rows.length) {

      timeline.append(
        element(
          "div",

          "No events match these filters. Clear the timeline filters to inspect the available incident window.",

          "timeline-empty-state"
        )
      );

    }


    if (
      rows.length >
      size
    ) {

      const pager =
        element(
          "div",
          undefined,
          "pager timeline-pager"
        );


      const previous =
        button(
          "Previous",

          () => {

            filters.page--;

            renderTimeline();
          }
        );


      const next =
        button(
          "Next",

          () => {

            filters.page++;

            renderTimeline();
          }
        );


      previous.disabled =
        start === 0;


      next.disabled =
        start +
        size >=
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
            size,
            rows.length
          ) +
          " of " +
          rows.length
        ),

        next
      );


      timeline.append(
        pager
      );
    }
  }


  /* =======================================================
     Initial Render
     ======================================================= */

  showMoreProcesses();


  if (
    !forest.length
  ) {

    tree.append(
      element(
        "div",

        "No process execution records are available in this incident window. Other event types may still reference process GUIDs.",

        "process-tree-empty"
      )
    );

  }


  updateProcess();
  renderTimeline();


  setContent(
    root
  );
}


/* =========================================================
   Load Investigation
   ========================================================= */

export async function investigate(
  id
) {
  state.incidentId =
    id;


  state.view =
    "incidents";


  const generation =
    ++state.generation;


  $("filters").hidden =
    true;


  $("pagination").hidden =
    true;


  $("main-panel")
    .classList
    .remove(
      "overview-panel"
    );


  $("current-view").textContent =
    "Investigations / Incident";


  $("title").textContent =
    "Investigation workspace";


  $("description").textContent =
    "Loading incident evidence…";


  $("last-updated").textContent =
    "Refreshing…";


  setContent(
    element(
      "div",
      "Loading incident workspace…",
      "investigation-loading-state"
    )
  );


  message("");


  document
    .querySelectorAll(
      "[data-view]"
    )
    .forEach(
      navButton => {

        navButton
          .classList
          .toggle(
            "active",

            navButton
              .dataset
              .view ===
              "incidents"
          );

      }
    );


  try {

    const [
      incident,
      graph
    ] =
      await Promise.all([
        api(
          "/incidents/" +
          encodeURIComponent(
            id
          )
        ),

        api(
          "/incidents/" +
          encodeURIComponent(
            id
          ) +
          "/process-tree"
        )
      ]);


    if (
      generation !==
      state.generation
    ) {
      return;
    }


    renderInvestigation(
      incident,
      graph
    );


    $("title").textContent =
      incident.title;


    $("description").textContent =
      hostname(
        incident.endpoint_id
      ) +
      " · " +
      incident.status +
      " · Coverage: unknown";


    $("last-updated").textContent =
      "Incident snapshot · " +
      new Date()
        .toLocaleTimeString();


  } catch (
    error
  ) {

    if (
      generation ===
      state.generation
    ) {

      const failure =
        element(
          "div",
          undefined,
          "investigation-load-error"
        );


      failure.append(
        element(
          "strong",
          "Unable to load this investigation"
        ),

        element(
          "p",
          error.message
        ),

        button(
          "Back to investigations",

          () =>
            navigate(
              "incidents"
            )
        )
      );


      setContent(
        failure
      );


      $("description").textContent =
        "";


      $("last-updated").textContent =
        "Refresh failed";


      message(
        error.message,
        true
      );


    } else if (
      error.message.includes(
        "token"
      ) &&
      !state.token
    ) {

      message(
        error.message,
        true
      );

    }

  }
}


/* =========================================================
   Evidence Export
   ========================================================= */

export async function downloadEvidence(
  id
) {
  const session =
    state.session;


  try {

    const blob =
      await api(
        "/incidents/" +
        encodeURIComponent(
          id
        ) +
        "/evidence",

        {},

        true
      );


    if (
      session !==
      state.session
    ) {
      return false;
    }


    const url =
      URL.createObjectURL(
        blob
      );


    const link =
      document.createElement(
        "a"
      );


    link.href =
      url;


    link.download =
      "evidence-" +
      id +
      ".zip";


    document.body.append(
      link
    );


    link.click();
    link.remove();


    setTimeout(
      () =>
        URL.revokeObjectURL(
          url
        ),

      1000
    );


    message(
      "Evidence download started. The package contains its SHA-256 manifest."
    );


    return true;


  } catch (
    error
  ) {

    if (
      session ===
        state.session ||
      error.message.includes(
        "token"
      )
    ) {

      message(
        error.message,
        true
      );

    }


    return false;
  }
}


/* =========================================================
   Incident Status
   ========================================================= */

async function changeStatus(
  incident
) {
  const status =
    incident.status ===
      "resolved"
      ? "open"
      : "resolved";


  const note =
    prompt(
      "Enter an analyst note for this status change:"
    );


  if (
    !note?.trim()
  ) {
    return;
  }


  if (
    note.length >
    2000
  ) {

    message(
      "The note must be 2,000 characters or fewer.",
      true
    );


    return;
  }


  const generation =
    state.generation;


  try {

    await api(
      "/incidents/" +
      encodeURIComponent(
        incident.id
      ),

      {
        method:
          "PATCH",

        body:
          JSON.stringify({
            status,

            note:
              note.trim()
          })
      }
    );


    if (
      generation !==
      state.generation
    ) {
      return;
    }


    await investigate(
      incident.id
    );


    if (
      state.token &&
      state.incidentId ===
        incident.id
    ) {

      message(
        "Incident updated and action recorded in the audit trail."
      );

    }


  } catch (
    error
  ) {

    if (
      generation ===
        state.generation ||
      error.message.includes(
        "token"
      )
    ) {

      message(
        error.message,
        true
      );

    }

  }
}