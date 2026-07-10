import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import { AuthProvider } from './lib/auth';
import { PresenceProvider } from './lib/presence';
import { PauseProvider } from './game/pause';
import { BotGameSessionProvider } from './game/BotGameSession';
import { SocialNotificationsProvider } from './lib/socialNotifications';
import { NavGuardProvider } from './lib/navGuard';
import './styles/index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <PresenceProvider>
            <SocialNotificationsProvider>
              <PauseProvider>
                <BotGameSessionProvider>
                  <NavGuardProvider>
                    <App />
                  </NavGuardProvider>
                </BotGameSessionProvider>
              </PauseProvider>
            </SocialNotificationsProvider>
          </PresenceProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>,
);
