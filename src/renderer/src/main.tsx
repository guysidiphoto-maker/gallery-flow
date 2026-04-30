import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './App.css'
import { initSentry } from './lib/sentry'

// Init early so any subsequent throw is captured.
initSentry()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
