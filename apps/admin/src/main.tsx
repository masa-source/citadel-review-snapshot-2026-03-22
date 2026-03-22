import React from "react";
import ReactDOM from "react-dom/client";
import { initCitadelSentry } from "@citadel/monitoring";
import { App } from "./App";
import "./styles/globals.css";

const dsn = import.meta.env.VITE_SENTRY_DSN_ADMIN;
if (dsn) {
  initCitadelSentry({
    dsn,
    app: "admin",
    platform: "web",
    environment: import.meta.env.VITE_SENTRY_ENVIRONMENT ?? "development",
  });
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
