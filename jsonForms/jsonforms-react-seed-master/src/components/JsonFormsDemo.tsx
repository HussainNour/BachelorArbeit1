import { useEffect, useState } from 'react';
import { JsonForms } from '@jsonforms/react';
import { materialCells, materialRenderers } from '@jsonforms/material-renderers';
import schema from '../schema.json';
import uischema from '../uischema.json';
import { Box, Button, Alert, Stack, Typography } from '@mui/material';

/** ---------- Typen passend zu Ziel-JSON ---------- */
type Person = {
  titel?: string;
  name?: string;
  gruppen?: string;
  erlaeuterung?: string;
};

type Modul = {
  fakultaet?: string;
  studiengang?: string;
  fs?: string;
  gruppen?: string;

  modulnr?: string;
  modulname?: string;
  lehrveranstaltung?: string;

  swsVorlesung?: string;
  swsSeminar?: string;
  swsPraktikum?: string;

  raumV?: string;
  raumS?: string;
  raumP?: string;

  technikV?: string;
  technikS?: string;
  technikP?: string;

  planungshinweise?: string;
  kwHinweise?: string;

  name?: string;
  unterschrift?: string;
  rueckgabedatum?: string;       // YYYY-MM-DD

  profUnterschrift?: string;
  dekanUnterschrift?: string;
  datumUnterschrift?: string;    // YYYY-MM-DD

  lesende?: Person[];            // Arrays
  seminarleiter?: Person[];
  praktikumsleiter?: Person[];
};

type Item = {
  /** Interne ID für Upserts/Deletes – bleibt unsichtbar in der UI */
  id?: string;
  modul?: Modul;
};

type Model = Item[]; // Root ist ein Array!

/** ---------- API ---------- */
const API = 'http://localhost:5050/blaetter';

/** ---------- kleine Hilfsfunktionen ---------- */
const ensureArray = <T,>(v: any): T[] => {
  if (Array.isArray(v)) return v as T[];
  if (v === undefined || v === null) return [];
  return [v as T]; // robust, falls der Server einmal ein einzelnes Objekt liefert
};

const trimStringsDeep = (obj: any): any => {
  if (obj == null) return obj;
  if (Array.isArray(obj)) return obj.map(trimStringsDeep);
  if (typeof obj === 'object') {
    const out: any = {};
    for (const [k, v] of Object.entries(obj)) out[k] = trimStringsDeep(v);
    return out;
  }
  if (typeof obj === 'string') return obj.trim();
  return obj;
};

/** Ein Item aufräumen (IDs NIEMALS löschen) */
const normalizeItem = (it: Item): Item => {
  const modul = it?.modul ?? {};
  return trimStringsDeep({
    ...it, // behält id
    modul: {
      ...modul,
      lesende: ensureArray<Person>(modul.lesende),
      seminarleiter: ensureArray<Person>(modul.seminarleiter),
      praktikumsleiter: ensureArray<Person>(modul.praktikumsleiter)
    }
  });
};

export const JsonFormsDemo = () => {
  const [data, setData] = useState<Model>([]); // Array wie früher
  const [hasErrors, setHasErrors] = useState(false);
  const [status, setStatus] = useState<'idle'|'loading'|'saving'|'saved'|'error'>('idle');

  /** Laden: Liste holen -> bereinigen -> Array in den State (id BEHALTEN) */
  const load = async () => {
    try {
      setStatus('loading');
      const res = await fetch(API);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const raw = await res.json();

      const items: Item[] = (Array.isArray(raw) ? raw : [raw])
        .filter(Boolean)
        .map((inObj: any) => normalizeItem({
          id: inObj?.id ?? undefined, // id übernehmen
          modul: inObj?.modul ?? {}
        }));

      setData(items);
      setStatus('idle');
    } catch {
      setStatus('error');
    }
  };

  useEffect(() => { load(); }, []);

  /** Speichern: wie im alten Code => DELETE fehlende, PUT vorhandene, POST neue */
  const save = async () => {
    if (hasErrors) return;
    try {
      setStatus('saving');

      // 1) IDs holen, die aktuell auf dem Server existieren
      const existingRes = await fetch(API);
      const existing: any[] = existingRes.ok ? await existingRes.json() : [];
      const existingIds = new Set((existing ?? []).map((e) => e?.id).filter(Boolean));

      // 2) IDs, die wir lokal haben
      const currentIds = new Set((data ?? []).map((b) => b.id).filter(Boolean) as string[]);

      // 3) Löschen, was auf dem Server existiert, aber lokal entfernt wurde
      const toDelete = [...existingIds].filter((id) => !currentIds.has(id as string));
      await Promise.all(
        toDelete.map((id) =>
          fetch(`${API}/${encodeURIComponent(id as string)}`, { method: 'DELETE' })
            .then((r) => { if (!r.ok) throw new Error('DELETE'); })
        )
      );

      // 4) Upsert (PUT für vorhandene, POST für neue)
      const headers = { 'Content-Type': 'application/json' };
      const updated: Model = [];

      for (const item of data ?? []) {
        const bodyObj = normalizeItem(item);
        const body = JSON.stringify(bodyObj);

        if (item.id) {
          // Update
          const res = await fetch(`${API}/${encodeURIComponent(item.id)}`, { method: 'PUT', headers, body });
          if (!res.ok) throw new Error('PUT');
          // Serverantwort optional übernehmen (falls transformiert)
          const saved = await res.json().catch(() => bodyObj);
          updated.push(normalizeItem(saved));
        } else {
          // Neu anlegen
          const res = await fetch(API, { method: 'POST', headers, body });
          if (!res.ok) throw new Error('POST');
          const created = await res.json(); // erwartet { ... , id }
          updated.push(normalizeItem({ ...item, id: created?.id }));
        }
      }

      // 5) State mit stabilen IDs aktualisieren
      setData(updated);

      setStatus('saved');
      setTimeout(() => setStatus('idle'), 900);
    } catch {
      setStatus('error');
    }
  };

  return (
    <Box sx={{ maxWidth: 1100, mx: 'auto', p: 2 }}>
      <Typography variant="h5" sx={{ mb: 2 }}>Zuarbeitsblätter (Array)</Typography>

      <JsonForms
        schema={schema as any}
        uischema={uischema as any}
        data={data}                     // Array!
        renderers={materialRenderers}
        cells={materialCells}
        onChange={({ data: next, errors }) => {
          setData((next ?? []) as Model); // id-Felder bleiben in den Objekten erhalten
          setHasErrors((errors?.length ?? 0) > 0);
        }}
      />

      <Stack direction="row" spacing={2} sx={{ mt: 2 }}>
        <Button variant="contained" onClick={save} disabled={hasErrors || status === 'saving'}>
          Speichern
        </Button>
        <Button variant="outlined" onClick={load} disabled={status === 'loading'}>
          Neu laden
        </Button>
      </Stack>

      {status === 'loading' && <Alert sx={{ mt: 2 }} severity="info">Lade…</Alert>}
      {status === 'saving'  && <Alert sx={{ mt: 2 }} severity="info">Speichere…</Alert>}
      {status === 'saved'   && <Alert sx={{ mt: 2 }} severity="success">Gespeichert</Alert>}
      {status === 'error'   && <Alert sx={{ mt: 2 }} severity="error">Fehler beim Laden/Speichern</Alert>}
    </Box>
  );
};
