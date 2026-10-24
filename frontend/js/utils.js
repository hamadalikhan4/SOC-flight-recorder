"use strict";

import { state } from "./state.js";

export const $ = id =>
  document.getElementById(id);


export function element(
  tag,
  text,
  className
) {
  const node =
    document.createElement(tag);

  if (text !== undefined) {
    node.textContent = text;
  }

  if (className) {
    node.className = className;
  }

  return node;
}


export function button(
  text,
  action
) {
  const node =
    element("button", text);

  node.type = "button";

  node.addEventListener(
    "click",
    action
  );

  return node;
}


export function message(
  text,
  error = false
) {
  $("message").textContent =
    text;

  $("message").className =
    error ? "error" : "";
}


export function setContent(node) {
  $("content").replaceChildren(node);
}


export function hostname(id) {
  return (
    state.endpoints.find(
      endpoint =>
        endpoint.id === id
    )?.hostname || id
  );
}


export function normalizeProcessGuid(
  value
) {
  const guid =
    String(value || "")
      .trim()
      .toLowerCase();

  if (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      .test(guid)
  ) {
    return `{${guid}}`;
  }

  return guid;
}