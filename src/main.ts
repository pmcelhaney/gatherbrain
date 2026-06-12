import { VaultService } from './store/vault';

function getAppRoot(): HTMLDivElement {
  const app = document.querySelector<HTMLDivElement>('#app');

  if (!app) {
    throw new Error('App root element not found.');
  }

  return app;
}

const app = getAppRoot();
const vaultService = new VaultService();

function renderHeading(): void {
  app.innerHTML = '<h1>GatherBrain</h1>';
}

function renderVaultName(name: string): void {
  renderHeading();

  const status = document.createElement('p');
  status.textContent = `Vault: ${name}`;
  app.append(status);
}

function renderOpenVaultButton(): void {
  renderHeading();

  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Open Vault';
  button.addEventListener('click', async () => {
    await vaultService.open();
    renderVaultName(vaultService.getHandle().name);
  });

  app.append(button);
}

async function initialize(): Promise<void> {
  const restored = await vaultService.restore();

  if (restored) {
    renderVaultName(vaultService.getHandle().name);
    return;
  }

  renderOpenVaultButton();
}

void initialize();
