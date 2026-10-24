"use strict";

import {
  state
} from "../state.js";

import {
  $
} from "../utils.js";


export function pager(
  count,
  hasMore =
    count === state.limit
) {
  $("pagination").hidden =
    false;

  $("previous").disabled =
    state.offset === 0;

  $("next").disabled =
    !hasMore;

  $("page-label").textContent =
    "Page " +
    (
      state.offset /
      state.limit +
      1
    ) +
    " · " +
    count +
    " records";
}