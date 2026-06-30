import { Session } from "../domain/index.js";
import { PlanPreview } from "./plan-preview.js";
import { Selection } from "./selection.js";

export const AppMode = Object.freeze({
  CAPTURE: "Capture",
  SEARCH: "Search",
  COMMAND: "Command",
  SELECTION: "Selection",
  PLAN: "Plan"
});

export class AppState {
  constructor({
    currentSession = null,
    currentQuery = null,
    currentSelection = new Selection(),
    currentMode = AppMode.COMMAND,
    planPreview = null
  } = {}) {
    this.currentSession = currentSession ? Session.from(currentSession) : null;
    this.currentQuery = currentQuery ?? defaultQueryFor(this.currentSession);
    this.currentSelection = Selection.from(currentSelection);
    this.currentMode = normalizeMode(currentMode);
    this.planPreview = planPreview ? PlanPreview.from(planPreview) : null;
  }

  canCaptureFact() {
    return this.currentSession !== null;
  }

  requireCaptureSession() {
    if (!this.canCaptureFact()) {
      throw new Error("A current session is required before capturing facts");
    }
  }

  switchSession(session) {
    this.currentSession = Session.from(session);
    this.currentQuery = defaultQueryFor(this.currentSession);
    this.currentSelection.clear();
    this.planPreview = null;
    this.currentMode = AppMode.CAPTURE;
  }

  setQuery(query) {
    if (typeof query !== "string" || query.trim().length === 0) {
      throw new Error("Current query is required");
    }

    this.currentQuery = query.trim();
    this.currentSelection.clear();
    this.planPreview = null;
    this.currentMode = AppMode.SEARCH;
  }

  setMode(mode) {
    this.currentMode = normalizeMode(mode);

    if (this.currentMode !== AppMode.PLAN) {
      this.planPreview = null;
    }
  }

  setSelection(selection) {
    this.currentSelection = Selection.from(selection);
    this.currentMode = AppMode.SELECTION;
  }

  setPlanPreview(planPreview) {
    this.planPreview = PlanPreview.from(planPreview);
    this.currentMode = AppMode.PLAN;
  }

  clearPlanPreview() {
    this.planPreview = null;
  }

  restart() {
    this.currentSession = null;
    this.currentQuery = null;
    this.currentSelection.clear();
    this.currentMode = AppMode.COMMAND;
    this.planPreview = null;
  }
}

function defaultQueryFor(session) {
  return session ? `session:${session.name}` : null;
}

function normalizeMode(mode) {
  if (!Object.values(AppMode).includes(mode)) {
    throw new Error(`Unknown app mode: ${mode}`);
  }

  return mode;
}
