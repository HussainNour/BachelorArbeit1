import SurveyPersons from "./components/SurveyPersons.jsx";

export default function App() {
  return (
    <div style={{ maxWidth: 900, margin: "24px auto", padding: 16 }}>
      <h2>SurveyJS • Personenliste</h2>
      <p style={{ marginTop: -8, color: "#555" }}>
        Erfasse/bearbeite Personen; „Speichern“ schreibt nach <code>db.json</code> (json-server).
      </p>
      <SurveyPersons />
    </div>
  );
}
