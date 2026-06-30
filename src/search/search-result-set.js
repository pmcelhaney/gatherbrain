export class SearchResultSet {
  constructor(facts) {
    this.facts = [...facts];
    this.numberByFactId = new Map();

    this.facts.forEach((fact, index) => {
      this.numberByFactId.set(fact.id, index + 1);
    });
  }

  get count() {
    return this.facts.length;
  }

  factIdForNumber(number) {
    const fact = this.facts[number - 1];

    if (!fact) {
      throw new Error(`No fact numbered ${number}`);
    }

    return fact.id;
  }

  factIdAtVisibleIndex(index) {
    const fact = this.facts[index];

    if (!fact) {
      throw new Error(`No visible fact at index ${index}`);
    }

    return fact.id;
  }

  numberForFactId(factId) {
    return this.numberByFactId.get(factId) ?? null;
  }

  toRows() {
    return this.facts.map((fact, index) => ({
      number: index + 1,
      fact
    }));
  }
}
