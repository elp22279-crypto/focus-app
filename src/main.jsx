import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { useStore } from './store/useStore.js'

// Загружаем API-ключ из защищённого хранилища до первого рендера
useStore.getState().loadApiKey();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
