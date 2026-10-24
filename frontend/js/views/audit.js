"use strict";

import {
  auditFilters,
  state
} from "../state.js";

import {
  element,
  button,
  setContent
} from "../utils.js";

import {
  inputField
} from "../components/forms.js";

import {
  table
} from "../components/table.js";

import {
  reloadCurrentView
} from "../navigation.js";


/* =========================================================
   Helpers
   ========================================================= */

function formatNumber(
  value
) {
  const parsed =
    Number(value);

  return Number.isFinite(parsed)
    ? parsed.toLocaleString()
    : "0";
}


function formatTimestamp(
  value
) {
  if (!value) {
    return {
      date: "Unknown",
      time: "—"
    };
  }


  const date =
    new Date(value);


  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return {
      date:
        String(value),

      time:
        "—"
    };
  }


  const pad =
    number =>
      String(number)
        .padStart(
          2,
          "0"
        );


  return {
    date:
      date.getUTCFullYear()
      + "-"
      + pad(
        date.getUTCMonth() + 1
      )
      + "-"
      + pad(
        date.getUTCDate()
      ),

    time:
      pad(
        date.getUTCHours()
      )
      + ":"
      + pad(
        date.getUTCMinutes()
      )
      + ":"
      + pad(
        date.getUTCSeconds()
      )
  };
}


function auditStat(
  label,
  value,
  note,
  tone = ""
) {
  const card =
    element(
      "article",
      undefined,
      "audit-stat" +
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
      "audit-stat-label"
    ),

    element(
      "strong",
      String(value),
      "audit-stat-value"
    ),

    element(
      "small",
      note,
      "audit-stat-note"
    )
  );


  return card;
}


function timeCell(
  timestamp
) {
  const formatted =
    formatTimestamp(
      timestamp
    );


  const root =
    element(
      "div",
      undefined,
      "audit-time-cell"
    );


  root.title =
    timestamp ||
    "Timestamp unavailable";


  root.append(
    element(
      "strong",
      formatted.time
    ),

    element(
      "small",
      formatted.date
    )
  );


  return root;
}


function actionTone(
  action
) {
  const value =
    String(
      action ||
      ""
    ).toLowerCase();


  if (
    value.includes(
      "evidence"
    ) ||
    value.includes(
      "export"
    )
  ) {
    return "evidence";
  }


  if (
    value.includes(
      "revoke"
    )
  ) {
    return "danger";
  }


  if (
    value.includes(
      "incident"
    )
  ) {
    return "incident";
  }


  if (
    value.includes(
      "enroll"
    )
  ) {
    return "endpoint";
  }


  if (
    value.includes(
      "status"
    ) ||
    value.includes(
      "resolve"
    ) ||
    value.includes(
      "reopen"
    )
  ) {
    return "change";
  }


  return "default";
}


function actionBadge(
  action
) {
  const value =
    action ||
    "Unknown action";


  return element(
    "span",
    value,
    "audit-action-badge audit-action-"
      + actionTone(
        value
      )
  );
}


function actorCell(
  actor
) {
  const root =
    element(
      "div",
      undefined,
      "audit-actor-cell"
    );


  const value =
    actor ||
    "Unknown actor";


  root.append(
    element(
      "span",
      value
        .charAt(0)
        .toUpperCase(),
      "audit-actor-avatar"
    ),

    element(
      "strong",
      value
    )
  );


  return root;
}


function resourceCell(
  resource
) {
  const root =
    element(
      "div",
      undefined,
      "audit-resource-cell"
    );


  root.append(
    element(
      "code",
      resource ||
      "Unavailable"
    )
  );


  return root;
}


function detailCell(
  detail
) {
  const text =
    detail ||
    "No additional detail recorded.";


  const root =
    element(
      "span",
      text,
      "audit-detail-cell"
    );


  root.title =
    text;


  return root;
}


/* =========================================================
   Audit Trail
   ========================================================= */

export function renderAuditSearch(
  rows
) {
  const records =
    rows ||
    [];


  const root =
    element(
      "div",
      undefined,
      "audit-page"
    );


  /* =======================================================
     Audit Hero
     ======================================================= */

  const hero =
    element(
      "section",
      undefined,
      "audit-hero"
    );


  const heroCopy =
    element(
      "div",
      undefined,
      "audit-hero-copy"
    );


  heroCopy.append(
    element(
      "span",
      "SECURITY GOVERNANCE",
      "eyebrow"
    ),

    element(
      "h2",
      "Operational audit trail",
      "audit-hero-title"
    ),

    element(
      "p",

      "Review backend actions recorded by the Spectra server, including " +
      "incident changes, endpoint administration and evidence generation.",

      "audit-hero-description"
    )
  );


  const heroState =
    element(
      "div",
      undefined,
      "audit-hero-state"
    );


  heroState.append(
    element(
      "span",
      "VIEW"
    ),

    element(
      "strong",
      "Newest first"
    ),

    element(
      "small",
      "Read-only activity history"
    )
  );


  hero.append(
    heroCopy,
    heroState
  );


  root.append(
    hero
  );


  /* =======================================================
     Current-page statistics
     ======================================================= */

  const uniqueActors =
    new Set(
      records
        .map(
          row =>
            row.actor
        )
        .filter(
          Boolean
        )
    ).size;


  const uniqueActions =
    new Set(
      records
        .map(
          row =>
            row.action
        )
        .filter(
          Boolean
        )
    ).size;


  const evidenceExports =
    records.filter(
      row =>
        String(
          row.action ||
          ""
        ).toLowerCase()
          .includes(
            "evidence.export"
          )
    ).length;


  const stats =
    element(
      "div",
      undefined,
      "audit-stat-grid"
    );


  stats.append(
    auditStat(
      "LOADED RECORDS",
      formatNumber(
        records.length
      ),
      "Current page",
      "info"
    ),

    auditStat(
      "ACTORS",
      formatNumber(
        uniqueActors
      ),
      "Unique on current page",
      "healthy"
    ),

    auditStat(
      "ACTIONS",
      formatNumber(
        uniqueActions
      ),
      "Distinct action types",
      "accent"
    ),

    auditStat(
      "EVIDENCE EXPORTS",
      formatNumber(
        evidenceExports
      ),
      "Current page",
      evidenceExports
        ? "warning"
        : "neutral"
    )
  );


  root.append(
    stats
  );


  /* =======================================================
     Search Console
     ======================================================= */

  const filterPanel =
    element(
      "section",
      undefined,
      "panel audit-filter-panel"
    );


  const filterHeading =
    element(
      "div",
      undefined,
      "section-heading audit-section-heading"
    );


  const filterCopy =
    element(
      "div"
    );


  filterCopy.append(
    element(
      "span",
      "AUDIT SEARCH",
      "eyebrow"
    ),

    element(
      "h2",
      "Find recorded actions"
    ),

    element(
      "p",

      "Search across actor, action, resource and analyst-entered detail."
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
      "filters audit-search-controls"
    );


  const search =
    inputField(
      controls,
      "Search audit records",
      auditFilters.query,
      "Actor, action, resource or analyst note"
    );


  search.type =
    "search";


  search.maxLength =
    200;


  const action =
    inputField(
      controls,
      "Exact action (optional)",
      auditFilters.action,
      "Example: evidence.export"
    );


  action.maxLength =
    100;


  const actions =
    element(
      "div",
      undefined,
      "actions audit-search-actions"
    );


  const apply =
    element(
      "button",
      "Search audit",
      "primary"
    );


  apply.type =
    "submit";


  const clear =
    button(
      "Clear filters",

      () => {

        auditFilters.query =
          "";


        auditFilters.action =
          "";


        state.offset =
          0;


        reloadCurrentView();
      }
    );


  actions.append(
    apply,
    clear
  );


  form.append(
    controls,
    actions
  );


  form.addEventListener(
    "submit",

    event => {

      event.preventDefault();


      auditFilters.query =
        search.value.trim();


      auditFilters.action =
        action.value.trim();


      state.offset =
        0;


      reloadCurrentView();
    }
  );


  filterPanel.append(
    form
  );


  root.append(
    filterPanel
  );


  /* =========================================================
     Audit Integrity Notice
     ========================================================= */

  const notice =
    element(
      "section",
      undefined,
      "audit-integrity-notice"
    );


  notice.append(
    element(
      "div",
      "i",
      "audit-integrity-icon"
    ),

    element(
      "div",
      undefined,
      "audit-integrity-copy"
    )
  );


  notice
    .lastElementChild
    .append(
      element(
        "strong",
        "Audit scope"
      ),

      element(
        "p",

        "These records document backend actions performed by the application. " +
        "They are useful for operational accountability, but they do not provide " +
        "an immutable or tamper-proof chain of custody."
      )
    );


  root.append(
    notice
  );


  /* =======================================================
     Audit Inventory
     ======================================================= */

  const inventory =
    element(
      "section",
      undefined,
      "panel audit-inventory-panel"
    );


  const inventoryHeading =
    element(
      "div",
      undefined,
      "section-heading audit-section-heading"
    );


  const inventoryCopy =
    element(
      "div"
    );


  inventoryCopy.append(
    element(
      "span",
      "RECORDED ACTIVITY",
      "eyebrow"
    ),

    element(
      "h2",

      records.length +
        " audit record" +
        (
          records.length === 1
            ? ""
            : "s"
        )
    ),

    element(
      "p",
      "Newest matching records are displayed first."
    )
  );


  inventoryHeading.append(
    inventoryCopy
  );


  inventory.append(
    inventoryHeading
  );


  if (
    records.length
  ) {

    inventory.append(
      table(
        [
          "Time (UTC)",
          "Actor",
          "Action",
          "Resource",
          "Detail"
        ],

        records.map(
          row => [

            timeCell(
              row.timestamp
            ),

            actorCell(
              row.actor
            ),

            actionBadge(
              row.action
            ),

            resourceCell(
              row.resource
            ),

            detailCell(
              row.detail
            )

          ]
        )
      )
    );

  } else {

    const empty =
      element(
        "div",
        undefined,
        "audit-empty-state"
      );


    empty.append(
      element(
        "strong",
        "No audit records matched"
      ),

      element(
        "p",

        auditFilters.query ||
        auditFilters.action
          ? (
              "Change the audit search or clear the current filters."
            )
          : (
              "No backend audit activity is currently available."
            )
      )
    );


    inventory.append(
      empty
    );

  }


  root.append(
    inventory
  );


  /* =======================================================
     Analyst guidance
     ======================================================= */

  const guidance =
    element(
      "section",
      undefined,
      "panel audit-guidance-panel"
    );


  const guidanceHeading =
    element(
      "div",
      undefined,
      "section-heading audit-section-heading"
    );


  const guidanceCopy =
    element(
      "div"
    );


  guidanceCopy.append(
    element(
      "span",
      "ANALYST REFERENCE",
      "eyebrow"
    ),

    element(
      "h2",
      "Useful exact-action searches"
    ),

    element(
      "p",

      "Use the exact action field when reviewing a specific administrative or evidence workflow."
    )
  );


  guidanceHeading.append(
    guidanceCopy
  );


  guidance.append(
    guidanceHeading
  );


  const examples =
    element(
      "div",
      undefined,
      "audit-action-examples"
    );


  [
    [
      "evidence.export",
      "Evidence package generation activity"
    ],

    [
      "endpoint.enroll",
      "Endpoint enrollment activity"
    ],

    [
      "endpoint.revoke",
      "Endpoint credential revocation"
    ],

    [
      "incident.status",
      "Incident resolve or reopen changes"
    ]
  ].forEach(
    (
      [
        actionName,
        description
      ]
    ) => {

      const item =
        element(
          "button",
          undefined,
          "audit-example"
        );


      item.type =
        "button";


      item.append(
        element(
          "code",
          actionName
        ),

        element(
          "span",
          description
        )
      );


      item.addEventListener(
        "click",

        () => {

          auditFilters.query =
            "";


          auditFilters.action =
            actionName;


          state.offset =
            0;


          reloadCurrentView();
        }
      );


      examples.append(
        item
      );

    }
  );


  guidance.append(
    examples
  );


  root.append(
    guidance
  );


  setContent(
    root
  );
}