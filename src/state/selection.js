export class Selection {
  constructor(factIds = []) {
    this.factIds = [...new Set(factIds.map(normalizeFactId))];
  }

  get size() {
    return this.factIds.length;
  }

  isEmpty() {
    return this.factIds.length === 0;
  }

  clear() {
    this.factIds = [];
  }

  includes(factId) {
    return this.factIds.includes(normalizeFactId(factId));
  }

  toArray() {
    return [...this.factIds];
  }

  static from(value) {
    if (value instanceof Selection) {
      return new Selection(value.factIds);
    }

    if (Array.isArray(value)) {
      return new Selection(value);
    }

    if (value && Array.isArray(value.factIds)) {
      return new Selection(value.factIds);
    }

    throw new Error("Selection must be built from fact ids");
  }

  static resolve(selectors, resultSet) {
    if (!Array.isArray(selectors) || selectors.length === 0) {
      throw new Error("At least one selector is required");
    }

    const factIds = selectors.map((selector) => resolveSelector(selector, resultSet));
    return new Selection(factIds);
  }
}

function resolveSelector(selector, resultSet) {
  if (typeof selector !== "string") {
    throw new Error("Selection selector must be a string");
  }

  if (/^\d+$/.test(selector)) {
    return resultSet.factIdForNumber(Number(selector));
  }

  if (/^\.+$/.test(selector)) {
    return resultSet.factIdAtVisibleIndex(selector.length - 1);
  }

  throw new Error(`Unsupported selector: ${selector}`);
}

function normalizeFactId(factId) {
  if (typeof factId !== "string" || factId.trim().length === 0) {
    throw new Error("Selection fact id is required");
  }

  return factId.trim();
}
