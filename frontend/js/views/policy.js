"use strict";

import {
  element,
  setContent
} from "../utils.js";

import {
  table
} from "../components/table.js";


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


function formatDuration(
  seconds
) {
  const value =
    number(
      seconds
    );

  if (
    value >= 60 &&
    value % 60 === 0
  ) {
    const minutes =
      value / 60;

    return (
      minutes +
      " minute" +
      (
        minutes === 1
          ? ""
          : "s"
      )
    );
  }

  return (
    value +
    " second" +
    (
      value === 1
        ? ""
        : "s"
    )
  );
}


function formatBytes(
  bytes
) {
  const value =
    number(
      bytes
    );

  if (
    value >=
    1024 * 1024
  ) {
    return (
      (
        value /
        (
          1024 *
          1024
        )
      ).toFixed(
        value %
        (
          1024 *
          1024
        ) === 0
          ? 0
          : 1
      ) +
      " MiB"
    );
  }

  if (
    value >= 1024
  ) {
    return (
      (
        value /
        1024
      ).toFixed(1) +
      " KiB"
    );
  }

  return (
    formatNumber(
      value
    ) +
    " bytes"
  );
}


function policyStat(
  label,
  value,
  note,
  tone = ""
) {
  const card =
    element(
      "article",
      undefined,
      "policy-stat" +
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
      "policy-stat-label"
    ),

    element(
      "strong",
      String(value),
      "policy-stat-value"
    ),

    element(
      "small",
      note,
      "policy-stat-note"
    )
  );


  return card;
}


function policyValue(
  value,
  className = ""
) {
  return element(
    "span",
    String(
      value ??
      "Unavailable"
    ),
    "policy-value" +
      (
        className
          ? " " +
            className
          : ""
      )
  );
}


/* =========================================================
   Recorder Policy
   ========================================================= */

export function renderPolicy(
  data
) {
  const root =
    element(
      "div",
      undefined,
      "policy-page"
    );


  const rule =
    data.rule || {};


  const limitations =
    data.limitations || [];


  const parentImages =
    rule.parent_images || [];


  const childImages =
    rule.child_images || [];


  /* =======================================================
     Policy Hero
     ======================================================= */

  const hero =
    element(
      "section",
      undefined,
      "policy-hero"
    );


  const heroCopy =
    element(
      "div",
      undefined,
      "policy-hero-copy"
    );


  heroCopy.append(
    element(
      "span",
      "RECORDER GOVERNANCE",
      "eyebrow"
    ),

    element(
      "h2",
      "Collection policy & detection scope",
      "policy-hero-title"
    ),

    element(
      "p",

      "Review the active recording window, request limits and deterministic " +
      "detection rule currently enforced by this Spectra recorder.",

      "policy-hero-description"
    )
  );


  const mode =
    element(
      "div",
      undefined,
      "policy-mode"
    );


  mode.append(
    element(
      "span",
      "ACTIVE MODE"
    ),

    element(
      "strong",
      data.mode ||
        "Not reported"
    )
  );


  hero.append(
    heroCopy,
    mode
  );


  root.append(
    hero
  );


  /* =======================================================
     Policy Statistics
     ======================================================= */

  const stats =
    element(
      "div",
      undefined,
      "policy-stat-grid"
    );


  stats.append(
    policyStat(
      "PRE-ALERT",
      formatDuration(
        data.pre_seconds
      ),
      "Recorded before detection",
      "info"
    ),

    policyStat(
      "POST-ALERT",
      formatDuration(
        data.post_seconds
      ),
      "Recorded after detection",
      "healthy"
    ),

    policyStat(
      "ZIP LIMIT",
      formatNumber(
        data.export_event_limit
      ),
      "Maximum events per evidence package",
      "warning"
    ),

    policyStat(
      "REQUEST LIMIT",
      formatBytes(
        data.max_request_bytes
      ),
      "Maximum accepted request body",
      "accent"
    )
  );


  root.append(
    stats
  );


  /* =======================================================
     Recording Configuration
     ======================================================= */

  const configuration =
    element(
      "section",
      undefined,
      "panel policy-section"
    );


  const configurationHeading =
    element(
      "div",
      undefined,
      "section-heading policy-section-heading"
    );


  const configurationCopy =
    element(
      "div"
    );


  configurationCopy.append(
    element(
      "span",
      "RECORDING CONFIGURATION",
      "eyebrow"
    ),

    element(
      "h2",
      "Active recorder settings"
    ),

    element(
      "p",

      "Read-only values currently reported by the backend configuration."
    )
  );


  configurationHeading.append(
    configurationCopy
  );


  configuration.append(
    configurationHeading,

    table(
      [
        "Setting",
        "Active value",
        "Purpose"
      ],

      [
        [
          "Before alert",

          policyValue(
            data.pre_seconds +
              " seconds"
          ),

          "Historical context retained before the alert trigger."
        ],

        [
          "After alert",

          policyValue(
            data.post_seconds +
              " seconds"
          ),

          "Post-alert context retained after the trigger."
        ],

        [
          "Maximum events per ZIP",

          policyValue(
            formatNumber(
              data.export_event_limit
            ),
            "mono"
          ),

          "Lab safety limit for one generated evidence package."
        ],

        [
          "Maximum request size",

          policyValue(
            formatNumber(
              data.max_request_bytes
            ) +
            " bytes",
            "mono"
          ),

          "Maximum accepted HTTP request body size."
        ]
      ]
    )
  );


  root.append(
    configuration
  );


  /* =======================================================
     Detection Rule
     ======================================================= */

  const detection =
    element(
      "section",
      undefined,
      "panel policy-section detection-policy-section"
    );


  const detectionHeading =
    element(
      "div",
      undefined,
      "section-heading policy-section-heading"
    );


  const detectionCopy =
    element(
      "div"
    );


  detectionCopy.append(
    element(
      "span",
      "DETECTION LOGIC",
      "eyebrow"
    ),

    element(
      "h2",
      "Active detection rule"
    ),

    element(
      "p",

      "The recorder evaluates the configured process relationship rule shown below."
    )
  );


  detectionHeading.append(
    detectionCopy,

    element(
      "span",
      rule.id ||
        "Rule unavailable",
      "policy-rule-id"
    )
  );


  detection.append(
    detectionHeading
  );


  const ruleSummary =
    element(
      "div",
      undefined,
      "policy-rule-summary"
    );


  const ruleIdentity =
    element(
      "div",
      undefined,
      "policy-rule-identity"
    );


  ruleIdentity.append(
    element(
      "span",
      "DETECTION",
      "policy-rule-label"
    ),

    element(
      "strong",
      rule.name ||
        "Unnamed detection"
    ),

    element(
      "small",

      "Category · " +
      (
        rule.category ||
        "Unavailable"
      )
    )
  );


  const requirement =
    element(
      "div",
      undefined,
      "policy-requirement"
    );


  requirement.append(
    element(
      "span",
      "PROCESS GUID"
    ),

    element(
      "strong",

      rule.requires_process_guid
        ? "Required"
        : "Not required"
    )
  );


  ruleSummary.append(
    ruleIdentity,
    requirement
  );


  detection.append(
    ruleSummary
  );


  /* =======================================================
     Parent → Child relationship
     ======================================================= */

  const relationship =
    element(
      "div",
      undefined,
      "policy-detection-flow"
    );


  const parentGroup =
    element(
      "div",
      undefined,
      "policy-process-group"
    );


  parentGroup.append(
    element(
      "span",
      "PARENT PROCESS",
      "policy-group-label"
    ),

    element(
      "strong",
      parentImages.length +
        " configured name" +
        (
          parentImages.length === 1
            ? ""
            : "s"
        )
    )
  );


  const parentTags =
    element(
      "div",
      undefined,
      "policy-image-tags"
    );


  parentImages.forEach(
    image => {

      parentTags.append(
        element(
          "code",
          image
        )
      );

    }
  );


  if (
    !parentImages.length
  ) {
    parentTags.append(
      element(
        "span",
        "No parent image names configured.",
        "policy-empty-value"
      )
    );
  }


  parentGroup.append(
    parentTags
  );


  const arrow =
    element(
      "div",
      "→",
      "policy-flow-arrow"
    );


  const childGroup =
    element(
      "div",
      undefined,
      "policy-process-group"
    );


  childGroup.append(
    element(
      "span",
      "CHILD PROCESS",
      "policy-group-label"
    ),

    element(
      "strong",
      childImages.length +
        " configured name" +
        (
          childImages.length === 1
            ? ""
            : "s"
        )
    )
  );


  const childTags =
    element(
      "div",
      undefined,
      "policy-image-tags"
    );


  childImages.forEach(
    image => {

      childTags.append(
        element(
          "code",
          image
        )
      );

    }
  );


  if (
    !childImages.length
  ) {
    childTags.append(
      element(
        "span",
        "No child image names configured.",
        "policy-empty-value"
      )
    );
  }


  childGroup.append(
    childTags
  );


  relationship.append(
    parentGroup,
    arrow,
    childGroup
  );


  detection.append(
    relationship
  );


  /* =======================================================
     Rule properties
     ======================================================= */

  detection.append(
    table(
      [
        "Property",
        "Configured value"
      ],

      [
        [
          "Rule ID",
          policyValue(
            rule.id ||
            "Unavailable",
            "mono"
          )
        ],

        [
          "Detection",
          rule.name ||
            "Unavailable"
        ],

        [
          "Event category",
          policyValue(
            rule.category ||
            "Unavailable"
          )
        ],

        [
          "Parent image names",
          parentImages.length
            ? parentImages.join(
                ", "
              )
            : "None configured"
        ],

        [
          "Child image names",
          childImages.length
            ? childImages.join(
                ", "
              )
            : "None configured"
        ],

        [
          "Process GUID required",

          rule.requires_process_guid
            ? "Yes"
            : "No"
        ]
      ]
    )
  );


  root.append(
    detection
  );


  /* =======================================================
     Scope & Limitations
     ======================================================= */

  const scope =
    element(
      "section",
      undefined,
      "panel policy-section policy-scope-section"
    );


  const scopeHeading =
    element(
      "div",
      undefined,
      "section-heading policy-section-heading"
    );


  const scopeCopy =
    element(
      "div"
    );


  scopeCopy.append(
    element(
      "span",
      "INTERPRETATION",
      "eyebrow"
    ),

    element(
      "h2",
      "Scope & limitations"
    ),

    element(
      "p",

      "Operational boundaries reported by the recorder should remain visible to analysts."
    )
  );


  scopeHeading.append(
    scopeCopy
  );


  scope.append(
    scopeHeading
  );


  const limitationsGrid =
    element(
      "div",
      undefined,
      "policy-limitations"
    );


  limitations.forEach(
    (
      text,
      index
    ) => {

      const limitation =
        element(
          "article",
          undefined,
          "policy-limitation"
        );


      limitation.append(
        element(
          "span",
          String(
            index + 1
          ).padStart(
            2,
            "0"
          ),
          "policy-limitation-number"
        ),

        element(
          "p",
          text
        )
      );


      limitationsGrid.append(
        limitation
      );

    }
  );


  if (
    !limitations.length
  ) {
    limitationsGrid.append(
      element(
        "div",
        "No additional limitations were reported by the backend.",
        "policy-empty-state"
      )
    );
  }


  scope.append(
    limitationsGrid,

    element(
      "div",
      undefined,
      "policy-readonly-note"
    )
  );


  scope
    .lastElementChild
    .append(
      element(
        "strong",
        "Read-only policy view"
      ),

      element(
        "p",

        "This page describes the active recorder configuration. It does not modify endpoint policy or backend settings."
      )
    );


  root.append(
    scope
  );


  setContent(
    root
  );
}