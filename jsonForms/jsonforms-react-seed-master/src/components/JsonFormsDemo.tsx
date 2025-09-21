import { useEffect, useMemo, useRef, useState } from 'react';
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

/** ---------- externe Modulquelle ---------- */
// Pfad ggf. anpassen:
import modulesJson from '../../config/INB_module.json';

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

/** ---------- Mapping von INB_module.json -> Formularfelder ---------- */
type RawMod = any;

const mapModuleToForm = (mod: RawMod): Partial<Modul> => {
  if (!mod) return {};
  const swsV = mod?.Lehrveranstaltungen?.SWS_V ?? '';
  const swsS = mod?.Lehrveranstaltungen?.SWS_S ?? '';
  const swsP = mod?.Lehrveranstaltungen?.SWS_P ?? '';

  const aufteilung = Array.isArray(mod?.Lehrveranstaltungen?.Aufteilung)
    ? mod.Lehrveranstaltungen.Aufteilung
    : [];

  const firstTyp = aufteilung[0]?.Typ ? ` ${aufteilung[0].Typ}` : '';

  // Einzigartige Gruppen aus allen Aufteilungen zusammenführen
  const gruppenSet = new Set(
    aufteilung.map((a: any) => (a?.Gruppen || '').trim()).filter(Boolean)
  );
  const gruppen = Array.from(gruppenSet).join('; ');

  return {
    fakultaet: mod?.['Fakultät'] ?? '',
    studiengang: Array.isArray(mod?.ZusammenMit) ? mod.ZusammenMit.join(', ') : '',
    fs: mod?.['Fachsemester'] ?? '',
    gruppen,
    modulnr: mod?.['Modulnummer'] ?? '',
    modulname: mod?.['Modulbezeichnung'] ?? '',
    lehrveranstaltung: (mod?.['Modulbezeichnung'] || '') + firstTyp,
    swsVorlesung: swsV !== '' ? String(swsV) : '',
    swsSeminar: swsS !== '' ? String(swsS) : '',
    swsPraktikum: swsP !== '' ? String(swsP) : ''
  };
};

/** Felder, die beim Modulwechsel automatisch gesetzt werden */
const AUTO_KEYS: (keyof Modul)[] = [
  'fakultaet',
  'studiengang',
  'fs',
  'gruppen',
  'modulnr',
  'modulname',
  'lehrveranstaltung',
  'swsVorlesung',
  'swsSeminar',
  'swsPraktikum'
];

/** Merge: nur die obigen Auto-Felder überschreiben; alles andere bleibt wie eingegeben */
const mergeAutoFill = (oldItem: Item, auto: Partial<Modul>): Item => {
  const oldMod = oldItem?.modul ?? {};
  const next: Modul = { ...oldMod };
  for (const k of AUTO_KEYS) {
    const v = (auto as any)[k];
    if (v !== undefined) (next as any)[k] = v;
  }
  return { ...oldItem, modul: next };
};

export const JsonFormsDemo = () => {
  const [data, setData] = useState<Model>([]); // Array wie früher
  const [hasErrors, setHasErrors] = useState(false);
  const [status, setStatus] = useState<'idle'|'loading'|'saving'|'saved'|'error'>('idle');

  // --- Lookup & Dropdown-Optionen für modulnr ---
  const moduByNr = useMemo(() => {
    const m = new Map<string, RawMod>();
    for (const mod of modulesJson as RawMod[]) {
      const key = String(mod?.['Modulnummer'] ?? '').trim();
      if (key) m.set(key, mod);
    }
    return m;
  }, []);

  const modulnrOptions = useMemo(
    () =>
      (modulesJson as RawMod[])
        .map((m) => ({
          value: String(m['Modulnummer']).trim(),
          label: `${String(m['Modulnummer']).trim()} – ${String(m['Modulbezeichnung']).trim()}`
        }))
        .filter((o) => o.value),
    []
  );

  // --- Schema mit enum für modulnr (Dropdown) ---
  const schemaWithEnum = useMemo(() => {
    const clone = JSON.parse(JSON.stringify(schema)) as any;
    const target = clone?.items?.properties?.modul?.properties?.modulnr;
    if (target) {
      target.oneOf = modulnrOptions.map((o) => ({ const: o.value, title: o.label }));
    }
    return clone;
  }, [modulnrOptions]);

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

  /** --- Auto-Fill bei Änderung der modulnr --- */
  const prevRef = useRef<Model>(data);
  const handleChange = ({ data: next, errors }: { data: any; errors?: any[] }) => {
    const incoming: Model = (next ?? []) as Model;
    const prev: Model = prevRef.current ?? [];

    let mutated = false;
    const patched: Model = incoming.map((item, idx) => {
      const curNr = item?.modul?.modulnr ?? '';
      const oldNr = prev[idx]?.modul?.modulnr ?? '';
      if (curNr && curNr !== oldNr) {
        const mod = moduByNr.get(String(curNr).trim());
        const auto = mapModuleToForm(mod);
        mutated = true;
        // Nur definierte Auto-Felder überschreiben; id etc. bleibt erhalten
        return mergeAutoFill(item, auto);
      }
      return item;
    });

    prevRef.current = mutated ? patched : incoming;
    setData(mutated ? patched : incoming);
    setHasErrors((errors?.length ?? 0) > 0);
  };

  return (
    <Box sx={{ maxWidth: 1100, mx: 'auto', p: 2 }}>
      <Typography variant="h5" sx={{ mb: 2 }}>Zuarbeitsblätter (Array)</Typography>

      <JsonForms
        schema={schemaWithEnum as any}   // <-- mit Dropdown für modulnr
        uischema={uischema as any}
        data={data}                      // Array!
        renderers={materialRenderers}
        cells={materialCells}
        onChange={handleChange}
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
