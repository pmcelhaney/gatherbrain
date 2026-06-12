import { App } from './app';

function getAppRoot(): HTMLDivElement {
  const appElement = document.querySelector<HTMLDivElement>('#app');

  if (!appElement) {
    throw new Error('App root element not found.');
  }

  return appElement;
}

const app = new App(getAppRoot());
void app.boot();
