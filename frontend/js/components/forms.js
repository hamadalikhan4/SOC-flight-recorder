"use strict";

import {
  element
} from "../utils.js";


export function selectField(
  container,
  labelText,
  options,
  value = ""
) {
  const label =
    element(
      "label",
      labelText
    );

  const select =
    element("select");

  options.forEach(
    ([key, text]) => {
      const option =
        element(
          "option",
          text
        );

      option.value = key;

      select.append(option);
    }
  );

  select.value = value;

  label.append(select);
  container.append(label);

  return select;
}


export function inputField(
  container,
  labelText,
  value = "",
  placeholder = ""
) {
  const label =
    element(
      "label",
      labelText
    );

  const input =
    element("input");

  input.value =
    value;

  input.placeholder =
    placeholder;

  label.append(input);
  container.append(label);

  return input;
}