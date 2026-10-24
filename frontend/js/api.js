"use strict";

import { state } from "./state.js";


export async function api(
  path,
  options = {},
  binary = false
) {
  const session =
    state.session;

  const token =
    state.token;

  const controller =
    new AbortController();

  const timeout =
    setTimeout(
      () => controller.abort(),
      20000
    );

  try {
    const response =
      await fetch(
        "/api/v1" + path,
        {
          ...options,

          signal:
            controller.signal,

          cache:
            "no-store",

          headers: {
            Authorization:
              "Bearer " + token,

            ...(options.body
              ? {
                  "Content-Type":
                    "application/json"
                }
              : {}),

            ...(options.headers || {})
          }
        }
      );

    if (
      session !==
      state.session
    ) {
      throw new Error(
        "Session changed."
      );
    }

    if (!response.ok) {
      if (
        response.status === 401
      ) {
        window.dispatchEvent(
          new CustomEvent(
            "spectra:unauthorized"
          )
        );

        throw new Error(
          "Invalid or expired token. Connect again."
        );
      }

      let body = {};

      try {
        body =
          await response.json();
      } catch {}

      throw new Error(
        typeof body.detail ===
          "string"
          ? body.detail
          : "Request failed: HTTP " +
            response.status
      );
    }

    const result =
      await (
        binary
          ? response.blob()
          : response.json()
      );

    if (
      session !==
      state.session
    ) {
      throw new Error(
        "Session changed."
      );
    }

    return result;

  } finally {
    clearTimeout(timeout);
  }
}