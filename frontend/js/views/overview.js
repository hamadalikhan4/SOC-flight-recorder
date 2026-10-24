"use strict";

import {
  element,
  button,
  setContent
} from "../utils.js";

import {
  table
} from "../components/table.js";

import {
  badge
} from "../components/badges.js";

import {
  navigate
} from "../navigation.js";

import {
  investigate
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


function sourceBadge(
  synthetic
) {
  const label =
    synthetic == null
      ? "Unknown"
      : synthetic
        ? "Replay"
        : "Endpoint";

  return element(
    "span",
    label,
    "badge " +
      (
        synthetic === true
          ? "source-replay"
          : synthetic === false
            ? "source-endpoint"
            : ""
      )
  );
}


function createMetricCard({
  label,
  value,
  note,
  tone = "",
  eyebrow = "",
  action = null
}) {
  const card =
    element(
      "article",
      undefined,
      "metric enterprise-metric" +
        (
          tone
            ? " metric-" + tone
            : ""
        )
    );


  const top =
    element(
      "div",
      undefined,
      "metric-top"
    );


  const copy =
    element(
      "div",
      undefined,
      "metric-copy"
    );


  if (eyebrow) {
    copy.append(
      element(
        "span",
        eyebrow,
        "metric-eyebrow"
      )
    );
  }


  copy.append(
    element(
      "small",
      label
    )
  );


  const indicator =
    element(
      "span",
      "",
      "metric-indicator"
    );


  top.append(
    copy,
    indicator
  );


  const valueNode =
    element(
      "strong",
      String(value),
      "metric-value"
    );


  card.append(
    top,
    valueNode,
    element(
      "p",
      note,
      "metric-note"
    )
  );


  if (action) {
    card.tabIndex =
      0;

    card.setAttribute(
      "role",
      "button"
    );

    card.addEventListener(
      "click",
      action
    );

    card.addEventListener(
      "keydown",
      event => {
        if (
          event.key ===
            "Enter" ||
          event.key ===
            " "
        ) {
          event.preventDefault();
          action();
        }
      }
    );
  }


  return card;
}


function createPanel(
  grid,
  {
    title,
    eyebrow = "",
    subtitle = "",
    action = null,
    wide = false,
    className = ""
  }
) {
  const section =
    element(
      "section",
      undefined,
      "panel overview-section" +
        (
          wide
            ? " wide"
            : ""
        ) +
        (
          className
            ? " " + className
            : ""
        )
    );


  const heading =
    element(
      "div",
      undefined,
      "section-heading overview-section-heading"
    );


  const copy =
    element(
      "div",
      undefined,
      "section-heading-copy"
    );


  if (eyebrow) {
    copy.append(
      element(
        "span",
        eyebrow,
        "eyebrow"
      )
    );
  }


  copy.append(
    element(
      "h2",
      title
    )
  );


  if (subtitle) {
    copy.append(
      element(
        "p",
        subtitle,
        "section-subtitle"
      )
    );
  }


  heading.append(
    copy
  );


  if (action) {
    heading.append(
      action
    );
  }


  section.append(
    heading
  );

  grid.append(
    section
  );

  return section;
}


function createStat(
  label,
  value,
  note = "",
  tone = ""
) {
  const stat =
    element(
      "div",
      undefined,
      "overview-stat" +
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
      "overview-stat-label"
    ),

    element(
      "strong",
      String(value),
      "overview-stat-value"
    )
  );


  if (note) {
    stat.append(
      element(
        "small",
        note
      )
    );
  }


  return stat;
}


/* =========================================================
   Main overview renderer
   ========================================================= */

export function renderOverview(
  data,
  fleet
) {
  const root =
    element(
      "div",
      undefined,
      "enterprise-overview"
    );


  const totals =
    data.totals || {};


  const totalEvents =
    number(
      totals.events
    );


  const replayEvents =
    number(
      totals.replay_events
    );


  const endpointEvents =
    Math.max(
      0,
      totalEvents -
        replayEvents
    );


  const openIncidents =
    number(
      totals.open_incidents
    );


  const highPriority =
    number(
      totals.high_priority
    );


  const online =
    fleet.filter(
      endpoint =>
        endpoint.status ===
        "online"
    ).length;


  const offline =
    fleet.filter(
      endpoint =>
        endpoint.status ===
        "offline"
    ).length;


  const neverSeen =
    fleet.filter(
      endpoint =>
        endpoint.status ===
        "never_seen"
    ).length;


  const revoked =
    fleet.filter(
      endpoint =>
        endpoint.status ===
        "revoked"
    ).length;


  const reportedQueue =
    fleet.reduce(
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


  /* =======================================================
     Update sidebar investigation badge
     ======================================================= */

  const sidebarCount =
    document.getElementById(
      "sidebar-incident-count"
    );


  if (sidebarCount) {
    sidebarCount.textContent =
      String(
        openIncidents
      );

    sidebarCount.hidden =
      openIncidents === 0;
  }


  /* =======================================================
     Overview hero
     ======================================================= */

  const hero =
    element(
      "section",
      undefined,
      "overview-hero"
    );


  const heroCopy =
    element(
      "div",
      undefined,
      "overview-hero-copy"
    );


  heroCopy.append(
    element(
      "span",
      "SECURITY OPERATIONS",
      "eyebrow"
    ),

    element(
      "h2",
      "Flight Recorder command view",
      "overview-hero-title"
    ),

    element(
      "p",
      "Live operational context across retained endpoint telemetry, investigations, collector health and recorded analyst activity.",
      "overview-hero-description"
    )
  );


  const heroActions =
    element(
      "div",
      undefined,
      "overview-hero-actions"
    );


  const huntButton =
    button(
      "Hunt telemetry",
      () =>
        navigate(
          "events"
        )
    );

  huntButton.classList.add(
    "primary"
  );


  heroActions.append(
    huntButton,

    button(
      "Open investigations",
      () =>
        navigate(
          "incidents"
        )
    ),

    button(
      "Endpoint fleet",
      () =>
        navigate(
          "endpoints"
        )
    )
  );


  hero.append(
    heroCopy,
    heroActions
  );


  root.append(
    hero
  );


  /* =======================================================
     KPI cards
     ======================================================= */

  const metrics =
    element(
      "div",
      undefined,
      "metrics enterprise-metrics"
    );


  metrics.append(
    createMetricCard({
      eyebrow:
        "FLEET",

      label:
        "ONLINE ENDPOINTS",

      value:
        online +
        " / " +
        fleet.length,

      note:
        offline +
        " offline · " +
        neverSeen +
        " never seen",

      tone:
        online > 0
          ? "healthy"
          : "neutral",

      action:
        () =>
          navigate(
            "endpoints"
          )
    }),


    createMetricCard({
      eyebrow:
        "CASELOAD",

      label:
        "OPEN INVESTIGATIONS",

      value:
        formatNumber(
          openIncidents
        ),

      note:
        highPriority +
        " high or critical priority",

      tone:
        highPriority > 0
          ? "danger"
          : openIncidents > 0
            ? "warning"
            : "healthy",

      action:
        () =>
          navigate(
            "incidents"
          )
    }),


    createMetricCard({
      eyebrow:
        "TELEMETRY",

      label:
        "RETAINED EVENTS",

      value:
        formatNumber(
          totalEvents
        ),

      note:
        formatNumber(
          replayEvents
        ) +
        " synthetic replay records",

      tone:
        "info",

      action:
        () =>
          navigate(
            "events"
          )
    }),


    createMetricCard({
      eyebrow:
        "ENDPOINT DATA",

      label:
        "ENDPOINT EVENTS",

      value:
        formatNumber(
          endpointEvents
        ),

      note:
        "Retained events not marked synthetic",

      tone:
        "accent",

      action:
        () =>
          navigate(
            "events"
          )
    })
  );


  root.append(
    metrics
  );


  /* =======================================================
     Main grid
     ======================================================= */

  const grid =
    element(
      "div",
      undefined,
      "overview-grid enterprise-overview-grid"
    );


  /* =======================================================
     Telemetry activity
     ======================================================= */

  const activity =
    createPanel(
      grid,
      {
        eyebrow:
          "INGESTION",

        title:
          "Telemetry activity",

        subtitle:
          "Events received by the server during the last 24 UTC hourly buckets.",

        className:
          "telemetry-panel"
      }
    );


  const activityTotal =
    (
      data.activity ||
      []
    ).reduce(
      (
        sum,
        bucket
      ) =>
        sum +
        number(
          bucket.count
        ),
      0
    );


  const activityHeader =
    element(
      "div",
      undefined,
      "telemetry-summary"
    );


  activityHeader.append(
    createStat(
      "24H RECEIVED",
      formatNumber(
        activityTotal
      ),
      "Includes replay"
    ),

    createStat(
      "RETAINED",
      formatNumber(
        totalEvents
      ),
      "All retained time"
    ),

    createStat(
      "QUEUE",
      formatNumber(
        reportedQueue
      ),
      "Latest endpoint reports",
      reportedQueue > 0
        ? "warning"
        : ""
    )
  );


  activity.append(
    activityHeader
  );


  const chart =
    element(
      "div",
      undefined,
      "telemetry-chart"
    );


  const bars =
    element(
      "div",
      undefined,
      "bars enterprise-bars"
    );


  const activityRows =
    data.activity ||
    [];


  const maximum =
    Math.max(
      1,
      ...activityRows.map(
        bucket =>
          number(
            bucket.count
          )
      )
    );


  activityRows.forEach(
    (
      bucket,
      index
    ) => {
      const slot =
        element(
          "div",
          undefined,
          "bar-slot enterprise-bar-slot"
        );


      const count =
        number(
          bucket.count
        );


      const label =
        bucket.hour +
        ": " +
        count.toLocaleString() +
        " events received";


      slot.title =
        label;


      slot.setAttribute(
        "aria-label",
        label
      );


      slot.setAttribute(
        "role",
        "img"
      );


      slot.tabIndex =
        0;


      const bar =
        element(
          "div",
          undefined,
          "bar enterprise-bar"
        );


      bar.style.height =
        (
          count /
          maximum *
          100
        ) +
        "%";


      if (
        index ===
        activityRows.length - 1
      ) {
        bar.classList.add(
          "current"
        );
      }


      slot.append(
        bar
      );

      bars.append(
        slot
      );
    }
  );


  chart.append(
    bars
  );


  const labels =
    element(
      "div",
      undefined,
      "chart-labels enterprise-chart-labels"
    );


  const firstHour =
    activityRows[0]
      ?.hour
      ?.slice(
        11,
        16
      ) || "—";


  const middleHour =
    activityRows[
      Math.floor(
        activityRows.length /
        2
      )
    ]?.hour?.slice(
      11,
      16
    ) || "";


  labels.append(
    element(
      "span",
      firstHour +
        " UTC"
    ),

    element(
      "span",
      middleHour
        ? middleHour +
            " UTC"
        : ""
    ),

    element(
      "span",
      "Current hour"
    )
  );


  chart.append(
    labels
  );

  activity.append(
    chart
  );


  if (!activityTotal) {
    activity.append(
      element(
        "div",
        "No telemetry was received during this interval.",
        "overview-empty-state"
      )
    );
  }


  /* =======================================================
     Operational health
     ======================================================= */

  const operations =
    createPanel(
      grid,
      {
        eyebrow:
          "OPERATIONS",

        title:
          "Operational health",

        subtitle:
          "Current fleet state from the most recent server snapshot.",

        action:
          button(
            "View fleet →",
            () =>
              navigate(
                "endpoints"
              )
          ),

        className:
          "operations-health-panel"
      }
    );


  const healthGrid =
    element(
      "div",
      undefined,
      "operations-health-grid"
    );


  healthGrid.append(
    createStat(
      "ONLINE",
      online,
      "Recent contact",
      "healthy"
    ),

    createStat(
      "OFFLINE",
      offline,
      "Contact stale",
      offline > 0
        ? "danger"
        : ""
    ),

    createStat(
      "NEVER SEEN",
      neverSeen,
      "No contact yet",
      neverSeen > 0
        ? "warning"
        : ""
    ),

    createStat(
      "REVOKED",
      revoked,
      "Credentials disabled"
    )
  );


  operations.append(
    healthGrid
  );


  const operationalNote =
    element(
      "p",
      "Connectivity reflects recent server contact only and does not prove telemetry completeness.",
      "operations-note"
    );


  operations.append(
    operationalNote
  );


  /* =======================================================
     Event category composition
     ======================================================= */

  const categories =
    createPanel(
      grid,
      {
        eyebrow:
          "COMPOSITION",

        title:
          "Retained event categories",

        subtitle:
          "Distribution across all currently retained telemetry.",

        className:
          "categories-panel"
      }
    );


  (
    data.categories ||
    []
  ).forEach(
    category => {
      const count =
        number(
          category.count
        );


      const percentage =
        totalEvents > 0
          ? (
              count /
              totalEvents *
              100
            )
          : 0;


      const row =
        element(
          "div",
          undefined,
          "category-row enterprise-category-row"
        );


      const label =
        element(
          "div",
          undefined,
          "category-label"
        );


      label.append(
        element(
          "strong",
          category.category
        ),

        element(
          "small",
          percentage.toFixed(
            percentage < 1
              ? 2
              : 1
          ) +
          "%"
        )
      );


      const track =
        element(
          "div",
          undefined,
          "track"
        );


      const fill =
        element(
          "div",
          undefined,
          "fill"
        );


      fill.style.width =
        Math.max(
          0,
          Math.min(
            100,
            percentage
          )
        ) +
        "%";


      track.append(
        fill
      );


      row.append(
        label,

        track,

        element(
          "span",
          count.toLocaleString(),
          "category-count"
        )
      );


      categories.append(
        row
      );
    }
  );


  if (
    !data.categories ||
    !data.categories.length
  ) {
    categories.append(
      element(
        "div",
        "No retained telemetry categories are available yet.",
        "overview-empty-state"
      )
    );
  }


  categories.append(
    element(
      "small",
      "All retained time · includes synthetic replay telemetry."
    )
  );


  /* =======================================================
     Open investigations
     ======================================================= */

  const incidents =
    createPanel(
      grid,
      {
        eyebrow:
          "DETECTION",

        title:
          "Open investigations",

        subtitle:
          "Newest active cases requiring analyst review.",

        action:
          button(
            "View investigations →",
            () =>
              navigate(
                "incidents"
              )
          ),

        wide:
          true,

        className:
          "investigation-overview-panel"
      }
    );


  if (
    data.recent_incidents &&
    data.recent_incidents.length
  ) {
    incidents.append(
      table(
        [
          "Incident",
          "Endpoint",
          "Severity",
          "Source",
          "Action"
        ],

        data.recent_incidents.map(
          incident => {
            const incidentName =
              element(
                "div",
                undefined,
                "overview-incident-name"
              );


            incidentName.append(
              element(
                "strong",
                incident.title
              )
            );


            if (
              incident.rule_id
            ) {
              incidentName.append(
                element(
                  "small",
                  incident.rule_id,
                  "device-id"
                )
              );
            }


            const action =
              button(
                "Investigate",
                () =>
                  investigate(
                    incident.id
                  )
              );


            if (
              incident.severity ===
                "high" ||
              incident.severity ===
                "critical"
            ) {
              action.classList.add(
                "investigate-action"
              );
            }


            return [
              incidentName,

              incident.hostname ||
                "Unknown endpoint",

              badge(
                incident.severity
              ),

              sourceBadge(
                incident.synthetic
              ),

              action
            ];
          }
        )
      )
    );
  } else {
    incidents.append(
      element(
        "div",
        undefined,
        "overview-success-state"
      )
    );


    const state =
      incidents.lastElementChild;


    state.append(
      element(
        "span",
        "✓",
        "overview-success-icon"
      ),

      element(
        "div",
        undefined,
        "overview-success-copy"
      )
    );


    state.lastElementChild.append(
      element(
        "strong",
        "No open investigations"
      ),

      element(
        "p",
        "There are currently no active incident records requiring review."
      )
    );
  }


  incidents.append(
    element(
      "small",
      "An elapsed recording window does not establish complete telemetry coverage."
    )
  );


  /* =======================================================
     Collector health
     ======================================================= */

  const collectorHealth =
    createPanel(
      grid,
      {
        eyebrow:
          "ENDPOINT OPERATIONS",

        title:
          "Collector health",

        subtitle:
          "Latest reported collector state for enrolled endpoints.",

        action:
          button(
            "Endpoint fleet →",
            () =>
              navigate(
                "endpoints"
              )
          ),

        wide:
          true,

        className:
          "collector-overview-panel"
      }
    );


  collectorHealth.append(
    table(
      [
        "Endpoint",
        "Connection",
        "Collector",
        "Last contact (UTC)",
        "Queue"
      ],

      fleet
        .slice(
          0,
          8
        )
        .map(
          endpoint => {
            const endpointName =
              element(
                "div",
                undefined,
                "event-endpoint"
              );


            endpointName.append(
              element(
                "strong",
                endpoint.hostname
              ),

              element(
                "small",
                endpoint.platform ||
                  "Unknown platform"
              )
            );


            const queue =
              endpoint
                .heartbeat
                ?.queued_events;


            const queueNode =
              element(
                "span",
                queue == null
                  ? "—"
                  : Number(
                      queue
                    ).toLocaleString(),
                queue > 0
                  ? "queue-warning"
                  : ""
              );


            return [
              endpointName,

              badge(
                endpoint.status
              ),

              endpoint
                .heartbeat
                ?.collector_status ||
                "Not reported",

              endpoint.last_seen ||
                "Never",

              queueNode
            ];
          }
        )
    )
  );


  collectorHealth.append(
    element(
      "small",
      "Showing up to eight endpoints. Queue values are snapshots from the latest collector report and may be stale."
    )
  );


  /* =======================================================
     Audit activity
     ======================================================= */

  const audit =
    createPanel(
      grid,
      {
        eyebrow:
          "ACCOUNTABILITY",

        title:
          "Recent audit activity",

        subtitle:
          "Latest persistent analyst and system actions recorded by the backend.",

        action:
          button(
            "Audit trail →",
            () =>
              navigate(
                "audit"
              )
          ),

        wide:
          true,

        className:
          "audit-overview-panel"
      }
    );


  audit.append(
    table(
      [
        "Time (UTC)",
        "Actor",
        "Action",
        "Resource"
      ],

      (
        data.recent_audit ||
        []
      ).map(
        record => {
          const action =
            element(
              "span",
              record.action,
              "audit-action-name"
            );


          return [
            record.timestamp,
            record.actor,
            action,
            record.resource
          ];
        }
      )
    )
  );


  if (
    !data.recent_audit ||
    !data.recent_audit.length
  ) {
    audit.append(
      element(
        "p",
        "No recent audit records are available.",
        "overview-empty-state"
      )
    );
  }


  root.append(
    grid
  );


  setContent(
    root
  );
}