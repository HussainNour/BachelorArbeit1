# SurveyJS + json-server (Personenliste mit stabilem Speichern)

Dieses Beispiel zeigt, wie du mit **SurveyJS (React)** ein Formular zur **Erfassung und Bearbeitung einer Personenliste** baust und die Daten mit **json-server** als REST-API in `db.json` **persistierst**:

* **Neue** Personen → `POST /persons`
* **Geänderte** Personen → `PATCH /persons/:id`
* **Gelöschte** Personen → `DELETE /persons/:id`
* **Reihenfolge** bleibt erhalten via Feld `order` (wird automatisch gepflegt)
* **IDs** sind stabil (werden vom Server vergeben, im UI nicht angezeigt)

---

## Inhalt

* [Voraussetzungen](#voraussetzungen)
* [Installation](#installation)
* [Skripte (`package.json`)](#skripte-packagejson)
* [Datenbasis (`db.json`)](#datenbasis-dbjson)
* [Frontend-Code](#frontend-code)
* [Starten](#starten)
* [API-Endpunkte](#api-endpunkte)
* [Troubleshooting](#troubleshooting)
* [Hinweise / Credits](#hinweise--credits)

---

## Voraussetzungen

* **Node.js** (LTS empfohlen)
* **npm**

---

## Installation

```bash
# Projektordner erstellen und hineingehen
mkdir surveyjs-persons
cd surveyjs-persons

# Vite-React Grundgerüst (JS)
npm create vite@latest . -- --template react

# Abhängigkeiten
npm i react react-dom survey-core survey-react-ui

# Dev-Tools
npm i -D json-server vite
```

---

## Skripte (`package.json`)

Öffne `package.json` und ergänze (oder ersetze) so:

```json
{
  "name": "surveyjs-persons",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "api": "json-server --watch db.json --port 5050"
  },
  "dependencies": {
    "react": "^19.1.1",
    "react-dom": "^19.1.1",
    "survey-core": "^2.3.5",
    "survey-react-ui": "^2.3.5"
  },
  "devDependencies": {
    "json-server": "^1.0.0-beta.3",
    "vite": "^5.4.0"
  }
}
```

> **Wichtig:** Die `scripts` gehören in **`package.json`** (nicht in die Lockdatei).

---

## Datenbasis (`db.json`)

Lege im **Projekt-Root** eine Datei **`db.json`** an:

```json
{
  "persons": []
}
```

**Alternativ per Terminal anlegen:**

* **macOS / Linux**

  ```bash
  printf '{\n  "persons": []\n}\n' > db.json
  ```
* **Windows PowerShell**

  ```powershell
  @'
  {
    "persons": []
  }
  '@ | Set-Content -Path db.json -Encoding UTF8
  ```

---

## Frontend-Code

### Struktur (minimal)

```
surveyjs-persons/
├─ db.json
├─ package.json
├─ index.html
├─ src/
│  ├─ main.jsx
│  ├─ App.jsx
│  └─ components/
│     └─ SurveyPersons.jsx
└─ ...
```

### `src/main.jsx`

> Lädt das SurveyJS-Standardtheme, damit das Formular korrekt aussieht.

```jsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "survey-core/defaultV2.css"; // SurveyJS Theme

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

### `src/App.jsx`

```jsx
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
```

### `src/components/SurveyPersons.jsx`

> Rendert die Personenliste (Dynamic Panel), lädt per `GET /persons` und speichert **diff-basiert** (POST/PATCH/DELETE).
> Felder `id`/`order` bleiben unsichtbar im UI, sind aber Teil der Daten (für stabile Synchronisation).

```jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { Model } from "survey-core";
import { Survey } from "survey-react-ui";

const API = "http://localhost:5050/persons";

// SurveyJS-Definition (Dynamic Panel für Personenliste)
const surveyJson = {
  title: "Personen",
  showQuestionNumbers: "off",
  elements: [
    {
      type: "paneldynamic",
      name: "persons",
      title: "Personen",
      minPanelCount: 0,
      panelAddText: "Person hinzufügen",
      panelRemoveText: "Entfernen",
      templateElements: [
        {
          type: "dropdown",
          name: "salutation",
          title: "Anrede",
          choices: ["Herr", "Frau", "Divers"],
          placeholder: "Bitte wählen"
        },
        { type: "text", name: "firstName", title: "Vorname", isRequired: true },
        { type: "text", name: "lastName",  title: "Nachname", isRequired: true },
        {
          type: "text",
          name: "age",
          title: "Alter",
          inputType: "number",
          min: 0,
          description: "Optional"
        }
      ]
    }
  ]
};

export default function SurveyPersons() {
  const survey = useMemo(() => new Model(surveyJson), []);
  const originalRef = useRef([]); // letzte Serverversion
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  // Normalisierung: Age -> Zahl oder null; order -> Listenindex
  const normalizePerson = (p, idx) => {
    const age =
      p.age === "" || p.age === undefined || p.age === null ? null : Number(p.age);
    return {
      id: p.id ?? null,
      order: idx,
      salutation: p.salutation ?? "",
      firstName: p.firstName ?? "",
      lastName: p.lastName ?? "",
      age
    };
  };

  const pickComparable = (p) => ({
    salutation: p.salutation ?? "",
    firstName: p.firstName ?? "",
    lastName: p.lastName ?? "",
    age: p.age ?? null,
    order: p.order ?? null
  });

  // Laden
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(API);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const list = await res.json();
        list.sort((a, b) => (a.order ?? a.id ?? 0) - (b.order ?? b.id ?? 0));
        if (!alive) return;
        originalRef.current = JSON.parse(JSON.stringify(list));
        survey.data = { persons: list };
        setMsg("Daten geladen.");
      } catch (e) {
        if (alive) setMsg(`Fehler beim Laden: ${e.message ?? e}`);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [survey]);

  // Speichern (diff-basiert)
  const save = async () => {
    setMsg("");

    // SurveyJS-Validierung (Pflichtfelder)
    const ok = survey.validate(true);
    if (!ok) {
      setMsg("Bitte Pflichtfelder ausfüllen.");
      return;
    }

    const currentRaw = Array.isArray(survey.data?.persons) ? survey.data.persons : [];
    const current = currentRaw.map((p, i) => normalizePerson(p, i));
    const original = originalRef.current ?? [];

    const byId = (arr) => new Map(arr.filter((p) => p.id != null).map((p) => [p.id, p]));
    const currMap = byId(current);
    const origMap = byId(original);

    const toCreate = current.filter((p) => p.id == null);
    const toDelete = original.filter((p) => p.id != null && !currMap.has(p.id));
    const toUpdate = current.filter((p) => {
      if (p.id == null) return false;
      const o = origMap.get(p.id);
      if (!o) return true;
      return JSON.stringify(pickComparable(p)) !== JSON.stringify(pickComparable(o));
    });

    setSaving(true);
    try {
      // Create
      for (const p of toCreate) {
        const res = await fetch(API, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(p)
        });
        if (!res.ok) throw new Error(`POST fail: ${res.status}`);
      }

      // Update
      for (const p of toUpdate) {
        const res = await fetch(`${API}/${encodeURIComponent(p.id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(pickComparable(p))
        });
        if (!res.ok) throw new Error(`PATCH fail: ${res.status}`);
      }

      // Delete
      for (const p of toDelete) {
        const res = await fetch(`${API}/${encodeURIComponent(p.id)}`, { method: "DELETE" });
        if (!res.ok) throw new Error(`DELETE fail: ${res.status}`);
      }

      // Reload (IDs/Order sicherstellen)
      const res = await fetch(API);
      const list = await res.json();
      list.sort((a, b) => (a.order ?? a.id ?? 0) - (b.order ?? b.id ?? 0));
      originalRef.current = JSON.parse(JSON.stringify(list));
      survey.data = { persons: list };

      setMsg("Gespeichert.");
    } catch (e) {
      setMsg(`Fehler beim Speichern: ${e.message ?? e}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      {loading ? (
        <p>Lade Daten …</p>
      ) : (
        <>
          <Survey model={survey} />
          <button
            onClick={save}
            disabled={saving}
            style={{
              marginTop: 12,
              padding: "8px 14px",
              border: "1px solid #ccc",
              borderRadius: 8,
              background: saving ? "#eee" : "#2f6df6",
              color: saving ? "#666" : "#fff",
              cursor: saving ? "not-allowed" : "pointer"
            }}
          >
            {saving ? "Speichere …" : "Speichern"}
          </button>
          {msg && <p style={{ marginTop: 8 }}>{msg}</p>}
        </>
      )}
    </div>
  );
}
```

---

## Starten

In **zwei Terminals** im Projekt-Root:

```bash
# Terminal 1: API (json-server)
npm run api
# -> http://localhost:5050/persons
```

```bash
# Terminal 2: Frontend (Vite)
npm run dev
# -> z. B. http://localhost:5173
```

Öffne die Frontend-URL, füge Personen hinzu, bearbeite, lösche – und klicke **Speichern**.
Die Änderungen stehen in `db.json`.

---

## API-Endpunkte

* `GET    /persons`
* `POST   /persons`
* `PATCH  /persons/:id`
* `DELETE /persons/:id`

**Beispiel `db.json` nach ein paar Speichervorgängen:**

```json
{
  "persons": [
    { "id": 1, "order": 0, "salutation": "Herr", "firstName": "Max",   "lastName": "Mustermann", "age": 30 },
    { "id": 2, "order": 1, "salutation": "Frau", "firstName": "Erika", "lastName": "Muster",      "age": null }
  ]
}
```

---

## Troubleshooting

* **Formular wirkt „kaputt“ (ohne Styles):**
  Stelle sicher, dass **`import "survey-core/defaultV2.css";`** in `src/main.jsx` eingebunden ist.
* **Speichern tut nichts:**
  Läuft `npm run api` auf **Port 5050** und stimmt die `API`-URL in der Komponente (`http://localhost:5050/persons`)?
* **Button „Speichern“ meldet Fehler:**
  Pflichtfelder (`Vorname`, `Nachname`) ausfüllen. Leeres `Alter` ist erlaubt (wird zu `null`).
* **IDs ändern sich:**
  Unser diff-Speichern nutzt `PATCH` für bestehende Einträge → IDs bleiben stabil. Nur beim `POST` neuer Einträge vergibt der Server neue IDs (einmalig).

---

## Hinweise / Credits

* **SurveyJS**: © Devsoft Baltic OÜ — MIT-Lizenz
* **json-server**: © typicode — MIT-Lizenz
* Dieses Beispiel dient **Prototyping/Entwicklung** (nicht für Produktion).

