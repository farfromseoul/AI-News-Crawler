import { EngagementProvider } from './engagement/Engagement';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';
import './discovery.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <EngagementProvider><App /></EngagementProvider>
  </React.StrictMode>,
);
