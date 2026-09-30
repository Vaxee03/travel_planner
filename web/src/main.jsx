import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/app.css'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { installGlobalErrorHandlers } from './lib/errorReporting'
import { isNativeApp } from './lib/platform'

installGlobalErrorHandlers()

// The app keeps the system splash up until AppLoader replaces it; if the
// app ever failed to start, don't leave the user staring at the splash.
if (isNativeApp) {
  setTimeout(() => import('@capacitor/splash-screen').then(({ SplashScreen }) => SplashScreen.hide()).catch(() => {}), 8000)
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
)
