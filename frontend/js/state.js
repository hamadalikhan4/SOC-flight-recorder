"use strict";

export const state = {
  token: "",
  view: "overview",
  incidentId: null,
  offset: 0,
  limit: 50,
  endpoints: [],
  generation: 0,
  session: 0,
  fleetCapturedAt: null,

  recordingFilters: {
    query: "",
    endpoint: "",
    window: ""
  },

  fleetFilters: {
    query: "",
    status: "",
    platform: "",
    sort: "recent",
    page: 0
  }
};

export const auditFilters = {
  query: "",
  action: ""
};

export const FLEET_PAGE_SIZE = 20;