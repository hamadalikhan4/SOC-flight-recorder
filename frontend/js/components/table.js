"use strict";

import {
  element
} from "../utils.js";


export function table(
  headers,
  rows
) {
  const wrap =
    element(
      "div",
      undefined,
      "table-wrap"
    );

  const tableNode =
    element("table");

  const head =
    element("thead");

  const heading =
    element("tr");

  headers.forEach(text => {
    heading.append(
      element(
        "th",
        text
      )
    );
  });

  head.append(heading);
  tableNode.append(head);

  const body =
    element("tbody");

  rows.forEach(cells => {
    const row =
      element("tr");

    cells.forEach(value => {
      const cell =
        element("td");

      if (
        value instanceof Node
      ) {
        cell.append(value);

      } else {
        cell.textContent =
          value ?? "—";
      }

      row.append(cell);
    });

    body.append(row);
  });

  tableNode.append(body);
  wrap.append(tableNode);

  if (!rows.length) {
    wrap.append(
      element(
        "p",
        "No matching records."
      )
    );
  }

  return wrap;
}