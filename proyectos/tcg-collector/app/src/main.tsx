import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { CarpetaDB } from './data/db';
import { Repo } from './data/repo';
import { App } from './ui/App';
import { StoreProvider } from './ui/store';
import './styles.css';

registerSW({ immediate: true });

const repo = new Repo(new CarpetaDB());

createRoot(document.getElementById('root')!).render(
  <StoreProvider repo={repo} fetchImpl={(url, init) => fetch(url, init)}>
    <App />
  </StoreProvider>,
);
