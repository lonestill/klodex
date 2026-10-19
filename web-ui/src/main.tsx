import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/ui/error-boundary.tsx'

const savedTheme = (localStorage.getItem("klodex_theme") as "dark" | "light" | "system") || "dark";
const isDark =
  savedTheme === "dark" ||
  (savedTheme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
if (isDark) {
  document.documentElement.classList.add("dark");
} else {
  document.documentElement.classList.remove("dark");
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
