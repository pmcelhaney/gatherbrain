export interface Router {
  navigateTo(id: string): void;
}

export function navigateTo(id: string): void {
  window.location.hash = `#/entity/${id}`;
}

export function parseRoute(hash: string): { view: 'home' } | { view: 'entity'; id: string } {
  const entityMatch = /^#\/entity\/(.+)$/.exec(hash);

  if (entityMatch) {
    return { view: 'entity', id: decodeURIComponent(entityMatch[1]) };
  }

  return { view: 'home' };
}
