export class FactIndex {
  constructor(factRepository) {
    this.factRepository = factRepository;
    this.cachedFacts = null;
  }

  async list() {
    if (!this.cachedFacts) {
      this.cachedFacts = await this.factRepository.list();
    }

    return this.cachedFacts;
  }

  invalidate() {
    this.cachedFacts = null;
  }
}
