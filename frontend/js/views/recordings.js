"use strict";

import {
  state
} from "../state.js";

import {
  element,
  button,
  setContent,
  message
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
  showDetails
} from "../components/dialog.js";

import {
  navigate,
  openEndpointEvents,
  reloadCurrentView
} from "../navigation.js";

import {
  investigate,
  downloadEvidence
} from "./investigations.js";


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


function sourceLabel(
  synthetic
) {
  if (
    synthetic === true
  ) {
    return "Replay trigger";
  }

  if (
    synthetic === false
  ) {
    return "Endpoint trigger";
  }

  return "Source unknown";
}


function sourceClass(
  synthetic
) {
  if (
    synthetic === true
  ) {
    return "recording-source-replay";
  }

  if (
    synthetic === false
  ) {
    return "recording-source-endpoint";
  }

  return "recording-source-unknown";
}


function recordingStat(
  label,
  value,
  note,
  tone = ""
) {
  const card =
    element(
      "article",
      undefined,
      "recording-stat" +
        (
          tone
            ? " " + tone
            : ""
        )
    );


  card.append(
    element(
      "span",
      label,
      "recording-stat-label"
    ),

    element(
      "strong",
      String(value),
      "recording-stat-value"
    ),

    element(
      "small",
      note,
      "recording-stat-note"
    )
  );


  return card;
}


function sourceBadge(
  synthetic
) {
  return element(
    "span",
    sourceLabel(
      synthetic
    ),
    "badge " +
      sourceClass(
        synthetic
      )
  );
}


function recordingIdentity(
  recording
) {
  const root =
    element(
      "div",
      undefined,
      "recording-identity"
    );


  root.append(
    element(
      "strong",
      recording.title
    ),

    element(
      "small",
      recording.hostname +
        " · " +
        recording.id,
      "device-id"
    )
  );


  const badges =
    element(
      "div",
      undefined,
      "recording-identity-badges"
    );


  badges.append(
    badge(
      recording.status
    ),

    sourceBadge(
      recording.synthetic
    )
  );


  root.append(
    badges
  );


  return root;
}


function recordingWindow(
  recording
) {
  const root =
    element(
      "div",
      undefined,
      "recording-window-cell"
    );


  root.append(
    badge(
      recording.window_state
    ),

    element(
      "small",
      recording.window_start,
      "recording-window-time"
    ),

    element(
      "span",
      "→",
      "recording-window-arrow"
    ),

    element(
      "small",
      recording.window_end,
      "recording-window-time"
    )
  );


  return root;
}


function recordingEventCount(
  recording
) {
  const root =
    element(
      "div",
      undefined,
      "recording-count-cell"
    );


  root.append(
    element(
      "strong",
      formatNumber(
        recording.event_count
      )
    ),

    element(
      "small",
      formatNumber(
        recording.health_count
      ) +
        " health record" +
        (
          number(
            recording.health_count
          ) === 1
            ? ""
            : "s"
        )
    )
  );


  return root;
}


function exportState(
  recording,
  limit
) {
  const root =
    element(
      "div",
      undefined,
      "recording-export-state"
    );


  if (
    recording.export_available
  ) {
    root.append(
      element(
        "span",
        "Ready",
        "recording-export-ready"
      ),

      element(
        "small",
        recording.last_export_at
          ? (
              "Last generated " +
              recording.last_export_at
            )
          : "Not generated yet"
      )
    );

  } else {

    root.append(
      element(
        "span",
        "Unavailable",
        "recording-export-blocked"
      ),

      element(
        "small",

        "Exceeds " +
        formatNumber(
          limit
        ) +
        "-event lab export limit"
      )
    );

  }


  return root;
}


/* =========================================================
   Main recordings view
   ========================================================= */

export function renderRecordings(
  data
) {
  const items =
    data.items ||
    [];


  const recentExports =
    data.recent_exports ||
    [];


  const root =
    element(
      "div",
      undefined,
      "recordings-page"
    );


  /* =======================================================
     Evidence command hero
     ======================================================= */

  const hero =
    element(
      "section",
      undefined,
      "recordings-hero"
    );


  const heroCopy =
    element(
      "div",
      undefined,
      "recordings-hero-copy"
    );


  heroCopy.append(
    element(
      "span",
      "EVIDENCE OPERATIONS",
      "eyebrow"
    ),

    element(
      "h2",
      "Recording & evidence inventory",
      "recordings-hero-title"
    ),

    element(
      "p",

      "Review incident recording windows, retained event counts, evidence export " +
      "availability and previous package-generation activity.",

      "recordings-hero-description"
    )
  );


  const heroAction =
    button(
      "Open audit trail",

      () =>
        navigate(
          "audit"
        )
    );


  hero.append(
    heroCopy,
    heroAction
  );


  root.append(
    hero
  );


  /* =======================================================
     Summary statistics
     ======================================================= */

  const collecting =
    items.filter(
      recording =>
        recording.window_state ===
        "collecting"
    ).length;


  const elapsed =
    items.filter(
      recording =>
        recording.window_state ===
        "window_elapsed"
    ).length;


  const exportable =
    items.filter(
      recording =>
        recording.export_available
    ).length;


  const retainedEvents =
    items.reduce(
      (
        sum,
        recording
      ) =>
        sum +
        number(
          recording.event_count
        ),
      0
    );


  const statistics =
    element(
      "div",
      undefined,
      "recording-stat-grid"
    );


  statistics.append(
    recordingStat(
      "RECORDINGS",
      formatNumber(
        items.length
      ),
      "Matching current filters",
      "info"
    ),

    recordingStat(
      "COLLECTING",
      formatNumber(
        collecting
      ),
      elapsed +
        " window(s) elapsed",
      collecting
        ? "warning"
        : "healthy"
    ),

    recordingStat(
      "EXPORT READY",
      formatNumber(
        exportable
      ),
      items.length
        ? (
            items.length -
            exportable +
            " unavailable"
          )
        : "No recordings",
      exportable
        ? "healthy"
        : "neutral"
    ),

    recordingStat(
      "AVAILABLE EVENTS",
      formatNumber(
        retainedEvents
      ),
      "Across displayed recordings",
      "accent"
    )
  );


  root.append(
    statistics
  );


  /* =======================================================
     Filter console
     ======================================================= */

  const filterPanel =
    element(
      "section",
      undefined,
      "panel recordings-filter-panel"
    );


  const filterHeading =
    element(
      "div",
      undefined,
      "section-heading"
    );


  const filterCopy =
    element(
      "div"
    );


  filterCopy.append(
    element(
      "span",
      "EVIDENCE SEARCH",
      "eyebrow"
    ),

    element(
      "h2",
      "Find recording windows"
    )
  );


  filterHeading.append(
    filterCopy
  );


  filterPanel.append(
    filterHeading
  );


  const form =
    element(
      "form"
    );


  const controls =
    element(
      "div",
      undefined,
      "fleet-controls recordings-controls"
    );


  const filters =
    state.recordingFilters;


  const search =
    inputField(
      controls,
      "Search recordings",
      filters.query,
      "Incident title, hostname, rule or ID"
    );


  search.type =
    "search";


  search.maxLength =
    200;


  const endpoint =
    selectField(
      controls,
      "Endpoint",

      [
        [
          "",
          "All endpoints"
        ],

        ...state.endpoints.map(
          item => [
            item.id,
            item.hostname
          ]
        )
      ],

      filters.endpoint
    );


  const windowSelect =
    selectField(
      controls,
      "Recording window",

      [
        [
          "",
          "All windows"
        ],

        [
          "collecting",
          "Collecting"
        ],

        [
          "window_elapsed",
          "Window elapsed"
        ]
      ],

      filters.window
    );


  const submit =
    element(
      "button",
      "Apply filters",
      "primary"
    );


  submit.type =
    "submit";


  controls.append(
    submit
  );


  form.append(
    controls
  );


  form.addEventListener(
    "submit",

    event => {

      event.preventDefault();


      state.recordingFilters = {
        query:
          search.value.trim(),

        endpoint:
          endpoint.value,

        window:
          windowSelect.value
      };


      state.offset =
        0;


      reloadCurrentView();
    }
  );


  const filterFooter =
    element(
      "div",
      undefined,
      "recordings-filter-footer"
    );


  filterFooter.append(
    element(
      "p",
      data.scope ||
        "Current retained recording inventory.",
      "report-note"
    ),

    button(
      "Clear filters",

      () => {

        state.recordingFilters = {
          query: "",
          endpoint: "",
          window: ""
        };


        state.offset =
          0;


        reloadCurrentView();
      }
    )
  );


  filterPanel.append(
    form,
    filterFooter
  );


  root.append(
    filterPanel
  );


  /* =======================================================
     Recording inventory
     ======================================================= */

  const inventory =
    element(
      "section",
      undefined,
      "panel recordings-inventory-panel"
    );


  const inventoryHeading =
    element(
      "div",
      undefined,
      "section-heading recording-inventory-heading"
    );


  const inventoryCopy =
    element(
      "div"
    );


  inventoryCopy.append(
    element(
      "span",
      "RECORDED WINDOWS",
      "eyebrow"
    ),

    element(
      "h2",

      items.length +
        " recording" +
        (
          items.length === 1
            ? ""
            : "s"
        )
    )
  );


  inventoryHeading.append(
    inventoryCopy
  );


  inventory.append(
    inventoryHeading
  );


  if (
    items.length
  ) {

    inventory.append(
      table(
        [
          "Recording",
          "Window (UTC)",
          "Events",
          "Coverage",
          "Evidence",
          "Actions"
        ],

        items.map(
          recording => {

            const actions =
              element(
                "div",
                undefined,
                "actions recording-actions"
              );


            const details =
              button(
                "Details",

                () =>
                  showDetails(
                    "Recording metadata",
                    recording
                  )
              );


            const download =
              button(
                "Export ZIP",

                async () => {

                  const generation =
                    state.generation;


                  download.disabled =
                    true;


                  download.textContent =
                    "Generating…";


                  try {

                    const ok =
                      await downloadEvidence(
                        recording.id
                      );


                    if (
                      ok &&
                      generation ===
                        state.generation &&
                      state.view ===
                        "recordings"
                    ) {

                      await reloadCurrentView();


                      if (
                        state.token &&
                        state.view ===
                          "recordings"
                      ) {

                        message(
                          "Download started. Verify the saved ZIP locally."
                        );

                      }

                    }

                  } finally {

                    download.disabled =
                      !recording.export_available;


                    download.textContent =
                      "Export ZIP";

                  }
                }
              );


            download.classList.add(
              "recording-export-button"
            );


            download.disabled =
              !recording.export_available;


            actions.append(
              details,
              download
            );


            if (
              recording.export_available
            ) {

              const investigateButton =
                button(
                  "Investigate",

                  () =>
                    investigate(
                      recording.id
                    )
                );


              investigateButton.classList.add(
                "recording-investigate-button"
              );


              actions.append(
                investigateButton
              );

            }


            const target =
              state.endpoints.find(
                item =>
                  item.id ===
                  recording.endpoint_id
              );


            const endpointEvents =
              button(
                "Endpoint events",

                () => {

                  if (
                    target
                  ) {
                    openEndpointEvents(
                      target
                    );
                  }

                }
              );


            endpointEvents.disabled =
              !target;


            actions.append(
              endpointEvents
            );


            return [
              recordingIdentity(
                recording
              ),

              recordingWindow(
                recording
              ),

              recordingEventCount(
                recording
              ),

              element(
                "span",
                "Unknown",
                "recording-coverage-value"
              ),

              exportState(
                recording,
                data.export_event_limit
              ),

              actions
            ];
          }
        )
      )
    );

  } else {

    const empty =
      element(
        "div",
        undefined,
        "recording-empty-state"
      );


    empty.append(
      element(
        "strong",
        "No recordings matched"
      ),

      element(
        "p",

        "Change the current filters or wait for an incident recording window to be created."
      )
    );


    inventory.append(
      empty
    );

  }


  inventory.append(
    element(
      "p",

      "Counts cover retained endpoint events inside each recording window. " +
      "Delayed events can change counts, and overlapping windows can include the same event.",

      "recordings-coverage-note"
    )
  );


  root.append(
    inventory
  );


  /* =======================================================
     Evidence verification
     ======================================================= */

  const verification =
    element(
      "section",
      undefined,
      "panel evidence-verification-panel"
    );


  const verificationHeading =
    element(
      "div",
      undefined,
      "section-heading"
    );


  const verificationCopy =
    element(
      "div"
    );


  verificationCopy.append(
    element(
      "span",
      "INTEGRITY CHECK",
      "eyebrow"
    ),

    element(
      "h2",
      "Verify a downloaded evidence package"
    ),

    element(
      "p",

      "Validate the SHA-256 manifest against the exact bytes contained in the exported ZIP."
    )
  );


  verificationHeading.append(
    verificationCopy
  );


  verification.append(
    verificationHeading
  );


  const verificationGrid =
    element(
      "div",
      undefined,
      "evidence-verification-grid"
    );


  const contents =
    element(
      "div",
      undefined,
      "evidence-verification-card"
    );


  contents.append(
    element(
      "span",
      "PACKAGE CONTENTS",
      "evidence-card-label"
    ),

    element(
      "strong",
      "Three generated records"
    ),

    element(
      "ul",
      undefined,
      "evidence-file-list"
    )
  );


  [
    "incident.json",
    "events.json",
    "manifest.json"
  ].forEach(
    filename => {

      contents
        .lastElementChild
        .append(
          element(
            "li",
            filename
          )
        );

    }
  );


  const verifyCommand =
    element(
      "div",
      undefined,
      "evidence-verification-card verification-command-card"
    );


  verifyCommand.append(
    element(
      "span",
      "LOCAL VERIFICATION",
      "evidence-card-label"
    ),

    element(
      "strong",
      "Run from project root"
    ),

    element(
      "pre",

      '.\\.venv\\Scripts\\python.exe -m scripts.verify_evidence "C:\\path\\to\\evidence.zip"'
    )
  );


  verificationGrid.append(
    contents,
    verifyCommand
  );


  verification.append(
    verificationGrid,

    element(
      "div",
      undefined,
      "evidence-integrity-warning"
    )
  );


  verification
    .lastElementChild
    .append(
      element(
        "strong",
        "Integrity scope"
      ),

      element(
        "p",

        "Hashes verify packaged bytes, not source authenticity or complete telemetry. " +
        "Evidence packages contain recorded metadata, not original file contents or memory images."
      )
    );


  root.append(
    verification
  );


  /* =======================================================
     Recent evidence exports
     ======================================================= */

  const exportsPanel =
    element(
      "section",
      undefined,
      "panel recent-exports-panel"
    );


  const exportHeading =
    element(
      "div",
      undefined,
      "section-heading"
    );


  const exportCopy =
    element(
      "div"
    );


  exportCopy.append(
    element(
      "span",
      "AUDIT ACTIVITY",
      "eyebrow"
    ),

    element(
      "h2",
      "Recent evidence exports"
    ),

    element(
      "p",

      "Latest export-generation audit records across endpoints."
    )
  );


  exportHeading.append(
    exportCopy,

    button(
      "Full audit trail →",

      () =>
        navigate(
          "audit"
        )
    )
  );


  exportsPanel.append(
    exportHeading
  );


  if (
    recentExports.length
  ) {

    exportsPanel.append(
      table(
        [
          "Generated (UTC)",
          "Recording",
          "Endpoint",
          "Recorded detail"
        ],

        recentExports.map(
          record => [
            record.timestamp,

            record.title ||
              record.resource,

            record.hostname ||
              "Unavailable",

            record.detail
          ]
        )
      )
    );

  } else {

    exportsPanel.append(
      element(
        "div",

        "No evidence-export audit records are available yet.",

        "recording-empty-state"
      )
    );

  }


  exportsPanel.append(
    element(
      "p",

      "Audit records confirm package generation by the server. They do not confirm browser download completion or local verification.",

      "recordings-coverage-note"
    )
  );


  root.append(
    exportsPanel
  );


  setContent(
    root
  );
}