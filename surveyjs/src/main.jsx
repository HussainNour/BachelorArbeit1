import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";

// Klassisches Theme (bei dir vorhanden):
import "survey-core/survey-core.min.css";
// oder, wenn du keine eingebetteten Webfonts willst:
// import "survey-core/survey-core.fontless.min.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
