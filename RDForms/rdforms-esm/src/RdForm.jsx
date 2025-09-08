import { useEffect, useMemo, useRef, useState } from "react";
import { ItemStore } from "@entryscape/rdforms";
import { Editor } from "@entryscape/rdforms/renderers/react";
import { Graph } from "@entryscape/rdfjson";

function PersonEditor({ graph, resource, template, onDelete }) {
  const hostRef = useRef(null);

  useEffect(() => {
    const editor = new Editor(
      { resource, graph, template, includeLevel: "optional" },
      hostRef.current
    );
    return () => editor?.destroy?.();
  }, [graph, resource, template]);

  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 16, margin: "12px 0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
        <strong>{resource.split("/").pop()}</strong>
        <button onClick={() => onDelete(resource)}>Person löschen</button>
      </div>
      <div ref={hostRef} />
    </div>
  );
}

// 1. kleinen Helfer zum Lesen von Literalen
function firstLiteral(graph, s, p) {
  const list = graph.find(s, p, null) || [];
  for (const st of list) if (st.isLiteral && st.isLiteral()) return st.getValue();
  return "";
}

// 2. Downloader (JSON-Datei im Browser speichern)
function download(filename, text, mime = "application/json") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function RdPersons() {
  // Template wie in der Doku – mit max:1 bei Alter (=> kein “+” mehr)
  const template = useMemo(() => {
    const store = new ItemStore();
    store.registerBundle({
      source: {
        templates: [
          {
            id: "foaf::givenName",
            type: "text",
            property: "http://xmlns.com/foaf/0.1/givenName",
            nodetype: "ONLY_LITERAL",
            label: { de: "Vorname" },
            cardinality: { min: 1, max: 1 },
          },
          {
            id: "foaf::familyName",
            type: "text",
            property: "http://xmlns.com/foaf/0.1/familyName",
            nodetype: "ONLY_LITERAL",
            label: { de: "Nachname" },
            cardinality: { min: 1, max: 1 },
          },
          {
            id: "schema::age",
            type: "text",
            property: "http://schema.org/age",
            nodetype: "DATATYPE_LITERAL",
            datatype: "http://www.w3.org/2001/XMLSchema#integer",
            label: { de: "Alter" },
            cardinality: { max: 1 } // <<< WICHTIG: nur ein Alter pro Person
          },
          { id: "personForm", type: "group", items: ["foaf::givenName", "foaf::familyName", "schema::age"] }
        ]
      }
    });
    return store.getTemplate("personForm");
  }, []);

  // Gemeinsamer Graph für alle Personen
  const dataRef = useRef({});             // rohes RDF/JSON
  const [graph] = useState(() => new Graph(dataRef.current));
  const [uris, setUris] = useState([]);

  const addPerson = () => {
    const id = `person-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const uri = `http://example.com/${id}`;

    // leere Struktur für die neue Person
    dataRef.current[uri] = {
      "http://xmlns.com/foaf/0.1/givenName": [],
      "http://xmlns.com/foaf/0.1/familyName": [],
      "http://schema.org/age": []
    };

    setUris(prev => [...prev, uri]);
  };

  const deletePerson = (uri) => {
    const list = graph.find(uri, null, null) || [];
    for (const st of list) {
      const p = st.getPredicate ? st.getPredicate() : st.getProperty();
      graph.remove(st.getSubject(), p, st.getValue());
    }
    delete dataRef.current[uri];
    setUris(prev => prev.filter(u => u !== uri));
  };

  // Übersicht aus dem Graph lesen
  const rows = uris.map((u) => ({
    uri: u,
    given: firstLiteral(graph, u, "http://xmlns.com/foaf/0.1/givenName"),
    family: firstLiteral(graph, u, "http://xmlns.com/foaf/0.1/familyName"),
    age: firstLiteral(graph, u, "http://schema.org/age"),
  }));

  // SPEICHERN: kompletten RDF/JSON-Graph als Datei herunterladen
  const saveToFile = () => {
    const pretty = JSON.stringify(dataRef.current, null, 2);
    download("persons.rdf.json", pretty, "application/json");
  };

  // Optional: beim Laden der Seite mit einer leeren Person starten
  useEffect(() => {
    if (uris.length === 0) addPerson();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ padding: 20, fontFamily: "system-ui, sans-serif" }}>
      <h2>RDForms (Vorname / Nachname / Alter) — Personenliste</h2>

      <div style={{ display: "flex", gap: 8, margin: "12px 0" }}>
        <button onClick={addPerson}>+ Person hinzufügen</button>
        <button onClick={saveToFile}>💾 Speichern (Download)</button>
      </div>

      {/* Übersichtstabelle */}
      <table style={{ borderCollapse: "collapse", width: "100%", marginBottom: 16 }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: "6px 4px" }}>Vorname</th>
            <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: "6px 4px" }}>Nachname</th>
            <th style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: "6px 4px" }}>Alter</th>
            <th style={{ borderBottom: "1px solid #ddd" }}></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.uri}>
              <td style={{ padding: "6px 4px" }}>{r.given || <em>–</em>}</td>
              <td style={{ padding: "6px 4px" }}>{r.family || <em>–</em>}</td>
              <td style={{ padding: "6px 4px" }}>{r.age || <em>–</em>}</td>
              <td style={{ padding: "6px 4px", textAlign: "right" }}>
                <button onClick={() => deletePerson(r.uri)}>Löschen</button>
              </td>
            </tr>
          ))}
          {!rows.length && (
            <tr>
              <td colSpan="4" style={{ padding: "8px 4px", color: "#666" }}>
                Noch keine Personen – klicke auf „+ Person hinzufügen“.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {/* RDForms-Editoren – einer pro Person */}
      {uris.map((u) => (
        <PersonEditor
          key={u}
          graph={graph}
          resource={u}
          template={template}
          onDelete={deletePerson}
        />
      ))}
    </div>
  );
}
