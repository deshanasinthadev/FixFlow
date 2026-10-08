import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { DbProvider } from './db/store'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <DbProvider>
      <App />
    </DbProvider>
  </React.StrictMode>,
)
