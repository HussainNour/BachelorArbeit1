import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";

// ➜ Korrekt für survey-core 2.x:
import "survey-core/defaultV2.min.css";
// Optional (aktiviert das Theme programmatisch):
import { StylesManager } from "survey-core";
StylesManager.applyTheme("defaultV2");

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
