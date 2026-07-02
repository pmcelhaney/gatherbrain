import { Context } from "../domain/index.js";
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
    currentContext = null,
    currentQuery = null,
    currentSelection = new Selection(),
    currentMode = AppMode.COMMAND,
    planPreview = null
  } = {}) {
    this.currentContext = currentContext ? Context.from(currentContext) : null;
    this.currentQuery = currentQuery ?? defaultQueryFor(this.currentContext);
    this.currentSelection = Selection.from(currentSelection);
    this.currentMode = normalizeMode(currentMode);
    this.planPreview = planPreview ? PlanPreview.from(planPreview) : null;
  }

  canCaptureFact() {
    return this.currentContext !== null;
  }

  requireCaptureContext() {
    if (!this.canCaptureFact()) {
      throw new Error("A current context is required before capturing facts");
    }
  }

  switchContext(context) {
    this.currentContext = Context.from(context);
    this.currentQuery = defaultQueryFor(this.currentContext);
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
    this.currentContext = null;
    this.currentQuery = null;
    this.currentSelection.clear();
    this.currentMode = AppMode.COMMAND;
    this.planPreview = null;
  }
}

function defaultQueryFor(context) {
  return context ? `context:${context.name}` : null;
}

function normalizeMode(mode) {
  if (!Object.values(AppMode).includes(mode)) {
    throw new Error(`Unknown app mode: ${mode}`);
  }

  return mode;
}
