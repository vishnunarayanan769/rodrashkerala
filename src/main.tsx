import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/bungee/latin-400.css";
import "@fontsource/rajdhani/latin-500.css";
import "@fontsource/rajdhani/latin-700.css";
import "@fontsource/noto-sans-malayalam/malayalam-700.css";
import "./index.css";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
