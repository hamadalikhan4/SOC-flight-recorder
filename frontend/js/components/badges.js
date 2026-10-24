"use strict";

import {
  element
} from "../utils.js";


export function badge(value) {
  return element(
    "span",
    value,
    "badge " + value
  );
}