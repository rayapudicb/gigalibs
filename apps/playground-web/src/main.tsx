import * as React from 'react';
import * as ReactDOM from 'react-dom/client';
import { AuthenticatedRoot } from './AuthenticatedRoot.js';

const rootEl = document.getElementById('root');
if (rootEl) {
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <AuthenticatedRoot />
    </React.StrictMode>,
  );
}
