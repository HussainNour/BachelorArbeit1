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
      // id & order werden NICHT gerendert, bleiben aber in den Daten
      templateElements: [
        {
          type: "dropdown",
          name: "salutation",
          title: "Anrede",
          isRequired: false,
          choices: ["Herr", "Frau", "Divers"],
          placeholder: "Bitte wählen"
        },
        { type: "text", name: "firstName", title: "Vorname", isRequired: true },
        { type: "text", name: "lastName", title: "Nachname", isRequired: true },
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

  // Hilfen
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

    // Validierung
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

      // Neu laden (IDs/Order sicherstellen)
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
