// src/App.jsx
import { useEffect, useRef, useState } from "react";
import { Model } from "survey-core";
import { Survey } from "survey-react-ui";

const API = "http://localhost:5050/persons";

const surveyJson = {
  title: "Personenliste",
  showCompletedPage: false,
  showNavigationButtons: "none",
  widthMode: "static",
  width: "1024",
  pages: [
    {
      name: "p1",
      elements: [
        {
          type: "paneldynamic",
          name: "persons",
          title: "Personen",
          panelAddText: "Person hinzufügen",
          panelRemoveText: "Löschen",
          allowReorder: true,
          minPanelCount: 0,
          templateElements: [
            { type: "text", name: "id", visible: false },
            { type: "text", name: "order", visible: false },
            {
              type: "dropdown",
              name: "salutation",
              title: "Anrede",
              choices: ["Herr", "Frau", "Divers"],
              width: "25%",
              minWidth: "180px"
            },
            {
              type: "text",
              name: "firstName",
              title: "Vorname",
              isRequired: true,
              width: "35%",
              minWidth: "220px",
              startWithNewLine: false
            },
            {
              type: "text",
              name: "lastName",
              title: "Nachname",
              isRequired: true,
              width: "35%",
              minWidth: "220px",
              startWithNewLine: false
            },
            {
              type: "text",
              name: "age",
              title: "Alter",
              inputType: "number",
              width: "20%",
              minWidth: "160px"
            }
          ],
          templateTitle: "{lastName} {firstName}"
        }
      ]
    }
  ]
};

export default function App() {
  const [model, setModel] = useState(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const originalRef = useRef([]);

  const sortByOrder = (a, b) =>
    (a.order ?? a.id ?? 0) - (b.order ?? b.id ?? 0);

  const normalizeAge = (v) =>
    v === "" || v == null ? null : Number(v);

  // Laden
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(API);
        const list = await res.json();
        list.sort(sortByOrder);
        originalRef.current = JSON.parse(JSON.stringify(list));

        const m = new Model(surveyJson);
        m.data = {
          persons: list.map((p) => ({
            id: p.id,
            order: p.order ?? null,
            salutation: p.salutation ?? "",
            firstName: p.firstName ?? "",
            lastName: p.lastName ?? "",
            age: p.age ?? null
          }))
        };
        setModel(m);
      } catch (e) {
        setMsg("Fehler beim Laden: " + (e?.message ?? e));
      }
    })();
  }, []);

  // Speichern (diff: POST/PATCH/DELETE)
  const save = async () => {
    if (!model) return;
    setSaving(true);
    setMsg("");

    try {
      const current = [...(model.data?.persons ?? [])].map((p, idx) => ({
        id: p.id ?? null,
        order: idx,
        salutation: p.salutation ?? "",
        firstName: p.firstName ?? "",
        lastName: p.lastName ?? "",
        age: normalizeAge(p.age)
      }));

      // Leere Panels ignorieren
      const keep = (p) =>
        (p.firstName?.trim?.() || "") !== "" ||
        (p.lastName?.trim?.() || "") !== "" ||
        p.salutation ||
        p.age !== null;

      const currClean = current.filter(keep);
      const original = originalRef.current ?? [];

      const mapById = (arr) =>
        new Map(arr.filter((x) => x.id != null).map((x) => [x.id, x]));

      const currMap = mapById(currClean);
      const origMap = mapById(original);

      const toCreate = currClean.filter((p) => p.id == null);
      const toDelete = original.filter((p) => p.id != null && !currMap.has(p.id));
      const toUpdate = currClean.filter((p) => {
        if (p.id == null) return false;
        const o = origMap.get(p.id);
        if (!o) return true;
        const pick = (x) => ({
          salutation: x.salutation ?? "",
          firstName: x.firstName ?? "",
          lastName: x.lastName ?? "",
          age: x.age ?? null,
          order: x.order ?? null
        });
        return JSON.stringify(pick(p)) !== JSON.stringify(pick(o));
      });

      // CREATE
      for (const p of toCreate) {
        const res = await fetch(API, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            salutation: p.salutation,
            firstName: p.firstName,
            lastName: p.lastName,
            age: p.age,
            order: p.order
          })
        });
        const created = await res.json();
        // ID zurück ins Model schreiben
        const items = model.data.persons;
        const idx = items.findIndex(
          (row) =>
            (row.firstName ?? "") === p.firstName &&
            (row.lastName ?? "") === p.lastName &&
            (row.age ?? null) === (p.age ?? null) &&
            (row.id ?? null) == null
        );
        if (idx >= 0) items[idx].id = created.id;
      }

      // UPDATE
      for (const p of toUpdate) {
        await fetch(`${API}/${p.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            salutation: p.salutation,
            firstName: p.firstName,
            lastName: p.lastName,
            age: p.age,
            order: p.order
          })
        });
      }

      // DELETE
      for (const p of toDelete) {
        await fetch(`${API}/${p.id}`, { method: "DELETE" });
      }

      // Neu laden & Model auffrischen
      const res2 = await fetch(API);
      const list = await res2.json();
      list.sort(sortByOrder);
      originalRef.current = JSON.parse(JSON.stringify(list));
      model.data = {
        persons: list.map((p) => ({
          id: p.id,
          order: p.order ?? null,
          salutation: p.salutation ?? "",
          firstName: p.firstName ?? "",
          lastName: p.lastName ?? "",
          age: p.age ?? null
        }))
      };

      setMsg("Gespeichert ✅");
    } catch (e) {
      setMsg("Fehler beim Speichern: " + (e?.message ?? e));
    } finally {
      setSaving(false);
    }
  };

  if (!model) return <div style={{ padding: 16 }}>Lade …</div>;

  return (
    <div style={{ maxWidth: 1024, margin: "0 auto", padding: 16 }}>
      <Survey model={model} />
      <div style={{ marginTop: 12 }}>
        <button onClick={save} disabled={saving}>
          {saving ? "Speichere …" : "Speichern"}
        </button>
        {msg && <div style={{ marginTop: 8 }}>{msg}</div>}
      </div>
    </div>
  );
}
