"use strict";

import {
  $
} from "../utils.js";


export function showDetails(
  title,
  value,
  actions = [],
  summary = null
) {
  $("detail-title").textContent =
    title;

  $("detail-json").textContent =
    JSON.stringify(
      value,
      null,
      2
    );

  const summaryContainer =
    $("detail-summary");

  summaryContainer
    .replaceChildren();

  if (summary) {
    summaryContainer.append(
      summary
    );
  }

  $("detail-actions")
    .replaceChildren(
      ...actions
    );

  if (
    !$("details").open
  ) {
    $("details").showModal();
  }
}