import { App as LegacyApp } from "@/legacy/legacy-app";
import { StudioApp } from "@/studio/studio-app";

/**
 * UI v2 — "Studio" concept (aurora canvas, floating glass rail).
 * The previous layout stays reachable via localStorage: klodex_ui = "legacy".
 */
function App() {
  const ui = localStorage.getItem("klodex_ui");
  if (ui === "legacy") return <LegacyApp />;
  return <StudioApp />;
}

export default App;
