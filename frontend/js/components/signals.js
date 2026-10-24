"use strict";

import {
  element
} from "../utils.js";


export function signalBadge(
  hunting
) {
  if (!hunting) {
    return element(
      "span",
      "Context only",
      "badge signal-context"
    );
  }

  const className = {
    high_signal:
      "signal-high",

    needs_review:
      "signal-review",

    context_only:
      "signal-context"
  }[
    hunting.level
  ] || "signal-context";

  return element(
    "span",
    hunting.label ||
      "Context only",
    "badge " + className
  );
}


export function signalPanel(
  hunting
) {
  const root =
    element(
      "section",
      undefined,
      "signal-panel"
    );

  const heading =
    element(
      "div",
      undefined,
      "signal-panel-heading"
    );

  heading.append(
    element(
      "h3",
      "Hunting assessment"
    ),

    signalBadge(
      hunting
    )
  );

  root.append(
    heading
  );


  if (!hunting) {
    root.append(
      element(
        "p",
        "No hunting assessment is available.",
        "muted"
      )
    );

    return root;
  }


  root.append(
    element(
      "p",
      "Priority score: "
        + hunting.score
        + " / 100",
      "signal-score"
    )
  );


  const signals =
    hunting.signals || [];


  if (!signals.length) {
    root.append(
      element(
        "p",
        (
          "No configured high-signal heuristic "
          + "matched this event."
        ),
        "muted"
      )
    );

  } else {
    const list =
      element(
        "div",
        undefined,
        "signal-list"
      );


    signals.forEach(
      signal => {
        const card =
          element(
            "div",
            undefined,
            "signal-item"
          );

        const top =
          element(
            "div",
            undefined,
            "signal-item-heading"
          );

        top.append(
          element(
            "strong",
            signal.title
          ),

          element(
            "span",
            "+" + signal.weight,
            "badge"
          )
        );

        card.append(
          top,

          element(
            "p",
            signal.reason
          )
        );

        list.append(
          card
        );
      }
    );


    root.append(
      list
    );
  }


  root.append(
    element(
      "p",
      hunting.disclaimer,
      "coverage-note"
    )
  );

  return root;
}