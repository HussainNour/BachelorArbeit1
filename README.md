# JSON Forms + json-server (Personenliste mit stabilem Speichern)

## Vorschau
![frontendJsonForms](/jsonForms/Bilder/frontendJsonForms.png)
![backend1](/jsonForms/Bilder/backend1.png)
![backend2](/jsonForms/Bilder/backend2.png)

Dieses Projekt demonstriert, wie man mit **JSON Forms (React)** und **json-server** eine **Personenliste** als Formular baut.
Die Daten werden über eine REST-API (`/persons`) geladen und beim **Klick auf „Speichern“** per **diff-basierter Synchronisation** zurückgeschrieben:

* **Neue** Personen → `POST /persons` (Server vergibt ID)
* **Geänderte** Personen → `PATCH /persons/:id`
* **Gelöschte** Personen → `DELETE /persons/:id`
* **Reihenfolge** bleibt erhalten via Feld `order` (wird automatisch gepflegt)

Die **IDs bleiben stabil**, sind im **UI nicht sichtbar**, aber in `db.json` vorhanden (json-server nutzt sie intern).

---

## Features

* JSON-Schema-basiertes Formular mit **Hinzufügen / Löschen / Sortieren**
* **Validierung** (Vorname & Nachname Pflicht; Alter optional)
* **Diff-basiertes Speichern**: nur echte Änderungen werden geschrieben
* **Stabile IDs** (keine Neuvergabe bei jedem Speichern)
* **Kein Backend-Code** nötig – nur `json-server`

---

## Voraussetzungen

* Node.js (LTS)
* npm
* Klon des Starters: [`eclipsesource/jsonforms-react-seed`](https://github.com/eclipsesource/jsonforms-react-seed)

---

## Installation

```bash
# Projekt klonen
git clone https://github.com/eclipsesource/jsonforms-react-seed.git
cd jsonforms-react-seed

# Abhängigkeiten installieren
npm install

# json-server als Dev-Dependency
npm i -D json-server
```

### Skripte ergänzen (`package.json`)

```json
{
  "scripts": {
    "dev": "vite",
    "api": "json-server --watch db.json --port 5050"
  }
}
```

### Datenbasis anlegen (`db.json` im Projekt-Root)

```json
{
  "persons": []
}
```

---

## Starten

In **zwei Terminals**:

```bash
# Abhängigkeiten installieren mit:
npm ci


# API (http://localhost:5050)
npm run api
```

```bash
# Frontend (z. B. http://localhost:5173)
npm run dev
```

Öffne die Frontend-URL, füge Personen hinzu, bearbeite, sortiere – und klicke **Speichern**.

---

## Wichtige Dateien

### `src/schema.json`  *(Formdatenmodell)*

```json
{
  "type": "object",
  "properties": {
    "persons": {
      "type": "array",
      "title": "Personen",
      "items": {
        "type": "object",
        "properties": {
          "id":        { "type": "integer", "readOnly": true },
          "order":     { "type": "integer", "readOnly": true },
          "salutation":{ "type": "string",  "title": "Anrede",   "enum": ["Herr","Frau","Divers"] },
          "firstName": { "type": "string",  "title": "Vorname",  "minLength": 1 },
          "lastName":  { "type": "string",  "title": "Nachname", "minLength": 1 },
          "age":       { "type": ["integer","null"], "title": "Alter", "minimum": 0, "default": null }
        },
        "required": ["firstName","lastName"]
      }
    }
  }
}
```

> `id` und `order` sind **readOnly** (werden nicht editiert), bleiben aber im Modell erhalten, damit die Synchronisation zuverlässig ist.

### `src/uischema.json`  *(UI-Layout)*

```json
{
  "type": "VerticalLayout",
  "elements": [
    {
      "type": "Control",
      "scope": "#/properties/persons",
      "options": {
        "showSortButtons": true,
        "elementLabelProp": "lastName",
        "detail": {
          "type": "VerticalLayout",
          "elements": [
            { "type": "Control", "label": "Anrede",   "scope": "#/properties/salutation" },
            { "type": "Control", "label": "Vorname",  "scope": "#/properties/firstName" },
            { "type": "Control", "label": "Nachname", "scope": "#/properties/lastName" },
            { "type": "Control", "label": "Alter",    "scope": "#/properties/age" }
          ]
        }
      }
    }
  ]
}
```

> ID/Order **werden nicht gerendert**, die Listen-Vorschau nutzt den Nachnamen als Label.

### `src/components/JsonFormsDemo.tsx`  *(Logik: Laden & diff-basiert speichern)*

* Lädt mit `GET /persons`
* Schreibt beim Speichern:

  * **POST** für neue Einträge (ohne `id`)
  * **PATCH** für geänderte (mit `id`)
  * **DELETE** für gelöschte
* Pflegt `order` automatisch (Index in der Liste)
* Normalisiert `age` (leere Eingabe → `null`, `"12"` → `12`), damit Validierung nicht blockiert

> Nutze die vollständige Komponente aus unserer letzten Antwort („**stabile IDs, im UI verborgen**“).
> Falls du sie noch nicht eingefügt hast, sag Bescheid – ich paste sie dir hier komplett rein.

---

## API-Endpunkte (json-server)

* `GET    /persons`
* `POST   /persons`
* `PATCH  /persons/:id`
* `DELETE /persons/:id`

**Beispiel** nach ein paar Speichervorgängen (IDs vom Server vergeben, bleiben stabil):

```json
{
  "persons": [
    { "id": 1, "order": 0, "salutation": "Herr",  "firstName": "Max",   "lastName": "Mustermann", "age": 30 },
    { "id": 2, "order": 1, "salutation": "Frau",  "firstName": "Erika", "lastName": "Muster",      "age": null }
  ]
}
```

---

## Troubleshooting

* **Speichern-Button ist deaktiviert (grau):**
  Mindestens ein Eintrag hat einen **Validierungsfehler**. `firstName` und `lastName` sind **Pflicht**.
  Das Feld `age` darf leer sein (wir erlauben `null` im Schema und normalisieren im Code).

* **Es speichert nur den ersten Eintrag:**
  In älteren Versionen lag das oft am `age`-Typ (leerer String ≠ Integer). Mit der Normalisierung & `type: ["integer","null"]` ist das behoben.

* **Nichts kommt beim Server an:**
  Prüfe, ob `npm run api` auf **Port 5050** läuft und die Komponente wirklich `http://localhost:5050/persons` verwendet (kein Port-Mix).

* **Sortierung geht verloren:**
  Stelle sicher, dass beim Speichern `order` aus dem Listen-Index gesetzt wird (ist in der Komponente enthalten).

---

## Alternative: Ganz ohne IDs in den Personen

Wenn du **gar keine IDs** im Personen-Array sehen willst (auch nicht in `db.json`), nutze statt `/persons` die Variante **„ein Dokument“**:

* `db.json`:

  ```json
  { "doc": [ { "id": 1, "persons": [] } ] }
  ```
* Laden/Speichern über **`GET/PUT /doc/1`** (ein Request, komplette Liste).
* Dafür gibt es in der vorherigen Antwort eine fertige Komponente.

---

## Lizenz / Credits

* JSON Forms: © EclipseSource / Eclipse Public License
* json-server: © typicode / MIT
