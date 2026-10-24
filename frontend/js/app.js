"use strict";


/* =========================================================
   State
   ========================================================= */

import {
  state,
  auditFilters
} from "./state.js";


/* =========================================================
   API
   ========================================================= */

import {
  api
} from "./api.js";


/* =========================================================
   Utilities
   ========================================================= */

import {
  $,
  element,
  button,
  message,
  setContent,
  hostname
} from "./utils.js";


/* =========================================================
   Shared components
   ========================================================= */

import {
  table
} from "./components/table.js";


import {
  badge
} from "./components/badges.js";


import {
  pager
} from "./components/pagination.js";


/* =========================================================
   Navigation
   ========================================================= */

import {
  configureNavigation,
  navigate
} from "./navigation.js";


/* =========================================================
   Views
   ========================================================= */

import {
  updateFleet,
  renderFleet
} from "./views/endpoints.js";


import {
  eventTable,
  buildEventQueryParams,
  renderEventResultCount,
  resetEventFilters
} from "./views/events.js";


import {
  renderOverview
} from "./views/overview.js";


import {
  renderRecordings
} from "./views/recordings.js";


import {
  renderPolicy
} from "./views/policy.js";


import {
  renderAuditSearch
} from "./views/audit.js";


import {
  investigate
} from "./views/investigations.js";


/* =========================================================
   View names
   ========================================================= */

const VIEW_TITLES = {

  overview:
    "Operations overview",

  endpoints:
    "Endpoint fleet",

  events:
    "Threat hunting",

  incidents:
    "Investigations",

  recordings:
    "Recordings & evidence",

  policy:
    "Policy & settings",

  audit:
    "Audit trail"

};


/* =========================================================
   Session lock
   ========================================================= */

function lockDashboard() {

  state.session++;

  state.generation++;


  state.token =
    "";


  state.incidentId =
    null;


  state.endpoints =
    [];


  state.fleetCapturedAt =
    null;


  state.recordingFilters = {

    query:
      "",

    endpoint:
      "",

    window:
      ""

  };


  state.fleetFilters = {

    query:
      "",

    status:
      "",

    platform:
      "",

    sort:
      "recent",

    page:
      0

  };


  auditFilters.query =
    "";


  auditFilters.action =
    "";


  /*
   * Clear all threat-hunting controls.
   */
  resetEventFilters();


  document.body
    .classList
    .remove(
      "authenticated"
    );


  $("sidebar").hidden =
    true;


  $("refresh").hidden =
    true;


  $("logout").hidden =
    true;


  $("workspace").hidden =
    true;


  $("login").hidden =
    false;


  $("last-updated")
    .textContent =
    "";


  $("current-view")
    .textContent =
    "Analyst console";


  $("title")
    .textContent =
    "";


  $("description")
    .textContent =
    "";


  $("token").value =
    "";


  $("content")
    .replaceChildren();


  $("endpoint")
    .replaceChildren();


  /*
   * Restore All endpoints placeholder after locking.
   */
  const option =
    element(
      "option",
      "All endpoints"
    );

  option.value =
    "";

  $("endpoint").append(
    option
  );


  if (
    $("endpoint-details").open
  ) {

    $("endpoint-details")
      .close();

  }


  $("endpoint-detail-title")
    .textContent =
    "";


  $("endpoint-detail-body")
    .replaceChildren();


  if (
    $("details").open
  ) {

    $("details")
      .close();

  }


  $("detail-title")
    .textContent =
    "";


  $("detail-json")
    .textContent =
    "";


  $("detail-summary")
    .replaceChildren();


  $("detail-actions")
    .replaceChildren();

}


/* =========================================================
   Main view loader
   ========================================================= */

async function load() {

  const generation =
    ++state.generation;


  const view =
    state.view;


  $("pagination").hidden =
    true;


  $("filters").hidden =
    view !==
    "events";


  $("title").textContent =
    VIEW_TITLES[
      view
    ] ||
    "Dashboard";


  $("current-view").textContent =
    $("title")
      .textContent;


  $("main-panel")
    .classList
    .toggle(

      "overview-panel",

      view ===
      "overview"

    );


  $("last-updated")
    .textContent =
    "Refreshing…";


  $("description")
    .textContent =
    "Loading…";


  setContent(

    element(
      "p",
      "Requesting data from your backend…"
    )

  );


  message(
    ""
  );


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
            view

          );

      }
    );


  try {

    /*
     * Endpoint fleet is loaded for every authenticated view.
     * It provides endpoint names for investigation and telemetry
     * presentation.
     */

    const fleet =
      await api(
        "/endpoints"
      );


    if (
      generation !==
      state.generation
    ) {
      return;
    }


    updateFleet(
      fleet
    );


    $("last-updated")
      .textContent =

      "Snapshot · " +
      new Date()
        .toLocaleTimeString();


    /* =====================================================
       Overview
       ===================================================== */

    if (
      view ===
      "overview"
    ) {

      const data =
        await api(
          "/overview"
        );


      if (
        generation !==
        state.generation
      ) {
        return;
      }


      renderOverview(
        data,
        fleet
      );


      $("description")
        .textContent =

        "Your endpoint telemetry and investigation workload. " +
        "Refresh to update.";


      $("last-updated")
        .textContent =

        "Snapshot · " +
        new Date(
          data.captured_at
        ).toLocaleTimeString();


      return;
    }


    /* =====================================================
       Endpoint fleet
       ===================================================== */

    if (
      view ===
      "endpoints"
    ) {

      renderFleet();


      $("description")
        .textContent =

        "Search enrolled devices and inspect collector reports.";


      return;
    }


    /* =====================================================
       Policy
       ===================================================== */

    if (
      view ===
      "policy"
    ) {

      const data =
        await api(
          "/policy"
        );


      if (
        generation !==
        state.generation
      ) {
        return;
      }


      renderPolicy(
        data
      );


      $("description")
        .textContent =

        "Active server settings and detection logic.";


      $("last-updated")
        .textContent =

        "Policy snapshot · " +
        new Date()
          .toLocaleTimeString();


      return;
    }


    /* =====================================================
       Audit
       ===================================================== */

    if (
      view ===
      "audit"
    ) {

      const params =
        new URLSearchParams({

          q:
            auditFilters.query,

          action:
            auditFilters.action,

          offset:
            state.offset,

          limit:
            state.limit +
            1

        });


      const result =
        await api(

          "/audit?" +
          params.toString()

        );


      if (
        generation !==
        state.generation
      ) {
        return;
      }


      const rows =
        result.slice(
          0,
          state.limit
        );


      renderAuditSearch(
        rows
      );


      pager(

        rows.length,

        result.length >
        state.limit

      );


      $("description")
        .textContent =

        "Search enrollment, revocation, incident updates and evidence exports.";


      $("last-updated")
        .textContent =

        "Audit snapshot · " +
        new Date()
          .toLocaleTimeString();


      return;
    }


    /* =====================================================
       Threat Hunting / Event Explorer
       ===================================================== */

    if (
      view ===
      "events"
    ) {

      const params =
        buildEventQueryParams();


      const data =
        await api(

          "/events?" +
          params.toString()

        );


      if (
        generation !==
        state.generation
      ) {
        return;
      }


      const rows =
        data.items;


      setContent(

        eventTable(
          rows
        )

      );


      renderEventResultCount(
        data.total
      );


      $("description")
        .textContent =

        "Search retained telemetry across endpoints and pivot between related activity.";


      pager(

        rows.length,

        data.has_more

      );


      if (
        data.total
      ) {

        $("page-label")
          .textContent =

          (
            data.offset +
            1
          ) +
          "–" +

          Math.min(

            data.offset +
            rows.length,

            data.total

          ) +

          " of " +
          data.total +
          " events";

      } else {

        $("page-label")
          .textContent =
          "0 matching events";

      }


      $("last-updated")
        .textContent =

        "Hunt snapshot · " +
        new Date()
          .toLocaleTimeString();


      return;
    }


    /* =====================================================
       Recordings
       ===================================================== */

    if (
      view ===
      "recordings"
    ) {

      const filters =
        state.recordingFilters;


      const params =
        new URLSearchParams({

          q:
            filters.query,

          window_state:
            filters.window,

          limit:
            state.limit,

          offset:
            state.offset

        });


      if (
        filters.endpoint
      ) {

        params.set(

          "endpoint_id",

          filters.endpoint

        );

      }


      const data =
        await api(

          "/recordings?" +
          params.toString()

        );


      if (
        generation !==
        state.generation
      ) {
        return;
      }


      renderRecordings(
        data
      );


      $("description")
        .textContent =

        "Browse incident recording windows and generate evidence snapshots.";


      $("last-updated")
        .textContent =

        "Recording snapshot · " +
        new Date(
          data.captured_at
        ).toLocaleTimeString();


      pager(

        data.items.length,

        data.offset +
        data.items.length <
        data.total

      );


      $("page-label")
        .textContent =

        data.items.length

          ? (

              data.offset +
              1

            ) +

            "–" +

            (

              data.offset +
              data.items.length

            ) +

            " of " +
            data.total +
            " recordings"

          : (

              "No recordings on this page · " +
              data.total +
              " total"

            );


      return;
    }


    /* =====================================================
       Incident inventory
       ===================================================== */

    if (
      view ===
      "incidents"
    ) {

      const result =
        await api(

          "/incidents?limit=" +
          (
            state.limit +
            1
          ) +

          "&offset=" +
          state.offset

        );


      if (
        generation !==
        state.generation
      ) {
        return;
      }


      const rows =
        result.slice(
          0,
          state.limit
        );


      setContent(

        table(

          [
            "Incident",
            "Endpoint",
            "Severity",
            "Status",
            "Recording",
            "Actions"
          ],


          rows.map(
            incident => [

              incident.title,


              hostname(
                incident.endpoint_id
              ),


              badge(
                incident.severity
              ),


              badge(
                incident.status
              ),


              incident.window_state,


              button(
                "Investigate",

                () =>
                  investigate(
                    incident.id
                  )
              )

            ]
          )

        )

      );


      $("description")
        .textContent =

        "An elapsed recording window does not guarantee complete telemetry.";


      pager(

        rows.length,

        result.length >
        state.limit

      );


      return;
    }

  }


  catch (
    error
  ) {

    if (
      generation ===
      state.generation
    ) {

      setContent(

        element(
          "p",

          "Unable to load this view. Use Refresh to retry."
        )

      );


      $("description")
        .textContent =
        "";


      $("last-updated")
        .textContent =
        "Refresh failed";


      message(
        error.message,
        true
      );

    }


    else if (
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
   Connect navigation loader
   ========================================================= */

configureNavigation(
  load
);


/* =========================================================
   Unauthorized session event
   ========================================================= */

window.addEventListener(

  "spectra:unauthorized",

  () => {

    lockDashboard();

  }

);


/* =========================================================
   Login
   ========================================================= */

$("login-form")
  .addEventListener(

    "submit",

    async event => {

      event.preventDefault();


      const value =
        $("token")
          .value
          .trim();


      /*
       * Prevent accidentally pasting the PowerShell command
       * instead of the actual token.
       */
      if (
        value.startsWith(
          "("
        ) ||
        value.includes(
          "Get-Content"
        )
      ) {

        message(
          "Paste the actual token, not the PowerShell command.",
          true
        );

        return;
      }


      if (!value) {
        return;
      }


      const submit =
        event
          .currentTarget
          .querySelector(
            'button[type="submit"]'
          );


      submit.disabled =
        true;


      state.session++;


      const session =
        state.session;


      state.token =
        value;


      $("token").value =
        "";


      try {

        /*
         * Validate token before exposing the dashboard.
         */
        await api(
          "/endpoints"
        );


        if (
          session !==
          state.session
        ) {
          return;
        }


        $("login").hidden =
          true;


        $("workspace").hidden =
          false;


        $("logout").hidden =
          false;


        $("sidebar").hidden =
          false;


        $("refresh").hidden =
          false;


        document.body
          .classList
          .add(
            "authenticated"
          );


        navigate(
          "overview"
        );

      }


      catch (
        error
      ) {

        if (
          session ===
          state.session
        ) {

          lockDashboard();

        }


        if (
          !state.token
        ) {

          message(
            error.message,
            true
          );

        }

      }


      finally {

        submit.disabled =
          false;

      }

    }

  );


/* =========================================================
   Lock dashboard
   ========================================================= */

$("logout").onclick =
  () => {

    lockDashboard();


    message(
      "Dashboard locked."
    );

  };


/* =========================================================
   Dialog controls
   ========================================================= */

$("close-endpoint").onclick =
  () => {

    $("endpoint-details")
      .close();

  };


$("close-details").onclick =
  () => {

    $("details")
      .close();

  };


/* =========================================================
   Refresh
   ========================================================= */

$("refresh").onclick =
  () => {

    if (
      state.incidentId
    ) {

      investigate(
        state.incidentId
      );

    } else {

      load();

    }

  };


/* =========================================================
   Sidebar navigation
   ========================================================= */

document
  .querySelectorAll(
    "[data-view]"
  )
  .forEach(
    navButton => {

      navButton.onclick =
        () =>
          navigate(
            navButton
              .dataset
              .view
          );

    }
  );


/* =========================================================
   Threat hunting form
   ========================================================= */

$("filter-form").onsubmit =
  event => {

    event.preventDefault();


    state.offset =
      0;


    load();

  };


/* =========================================================
   Clear threat-hunting filters
   ========================================================= */

$("clear").onclick =
  () => {

    resetEventFilters();


    state.offset =
      0;


    load();

  };


/* =========================================================
   Pagination
   ========================================================= */

$("previous").onclick =
  () => {

    state.offset =
      Math.max(

        0,

        state.offset -
        state.limit

      );


    load();

  };


$("next").onclick =
  () => {

    state.offset +=
      state.limit;


    load();

  };