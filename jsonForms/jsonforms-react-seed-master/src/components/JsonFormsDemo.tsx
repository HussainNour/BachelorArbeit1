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

  name?: string;                   // Name (Ersteller:in)
  unterschrift?: string;
  rueckgabedatum?: string;         // YYYY-MM-DD

  profUnterschrift?: string;
  dekanUnterschrift?: string;
  datumUnterschrift?: string;      // YYYY-MM-DD

  lesende?: Person[];              // Arrays
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
  if (v == null) return [];
  return [v as T];
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

  const gruppenSet = new Set(
    aufteilung.map((a: any) => (a?.Gruppen || '').trim()).filter(Boolean)
  );
  const gruppen = Array.from(gruppenSet).join('; ');

  const mv = mod?.Modulverantwortliche || {};
  const anrede = (mv?.Anrede ?? '').toString().trim();
  const vor    = (mv?.Vorname ?? '').toString().trim();
  const nach   = (mv?.Nachname ?? '').toString().trim();
  const displayName = [anrede, vor, nach].filter(Boolean).join(' ').trim();

  return {
    fakultaet: mod?.['Fakultät'] ?? '',
    studiengang: Array.isArray(mod?.ZusammenMit) ? mod.ZusammenMit.join(', ') : '',
    fs: mod?.['Fachsemester'] ?? '',
    gruppen,
    modulnr: mod?.['Modulnummer'] ?? '',
    modulname: mod?.['Modulbezeichnung'] ?? '',
    // lehrveranstaltung: NICHT automatisch
    swsVorlesung: swsV !== '' ? String(swsV) : '',
    swsSeminar:  swsS !== '' ? String(swsS) : '',
    swsPraktikum: swsP !== '' ? String(swsP) : '',
    // Name (Ersteller:in)
    name: displayName
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
  // 'lehrveranstaltung',   // NICHT automatisch
  'swsVorlesung',
  'swsSeminar',
  'swsPraktikum',
  'name'                    // Name (Ersteller:in)
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

/** Zahlen-/Vorhandensein-Check für SWS */
const numOrZero = (v: any): number => {
  if (v == null) return 0;
  const s = String(v).trim();
  if (s === '') return 0;
  const n = Number(s);
  if (!Number.isNaN(n)) return n;
  // Fallback: nicht-numerisch aber nicht leer -> als „vorhanden“ interpretieren
  return 1;
};

/** Titel + Name in Arrays füllen (nur wenn leer) */
const applyLeadersIfNeeded = (oldItem: Item, auto: Partial<Modul>, raw: RawMod): Item => {
  const mv = raw?.Modulverantwortliche || {};
  const anrede = (mv?.Anrede ?? '').toString().trim();
  const vor    = (mv?.Vorname ?? '').toString().trim();
  const nach   = (mv?.Nachname ?? '').toString().trim();
  const displayName = [anrede, vor, nach].filter(Boolean).join(' ').trim();

  const prevMod = oldItem?.modul ?? {};

  const effV = numOrZero((auto.swsVorlesung ?? prevMod.swsVorlesung));
  const effS = numOrZero((auto.swsSeminar   ?? prevMod.swsSeminar));
  const effP = numOrZero((auto.swsPraktikum ?? prevMod.swsPraktikum));

  const next: Item = { ...oldItem, modul: { ...prevMod } };

  const ensureFirst = (arr?: Person[]): Person[] => {
    const a = Array.isArray(arr) ? [...arr] : [];
    if (!a[0]) a[0] = {};
    return a;
  };

  const fillIfEmpty = (p: Person) => {
    if (anrede && !p.titel) p.titel = anrede;
    if (displayName && !p.name) p.name = displayName;
  };

  if (effV > 0) {
    const a = ensureFirst(next.modul!.lesende);
    fillIfEmpty(a[0]);
    next.modul!.lesende = a;
  }

  if (effS > 0) {
    const a = ensureFirst(next.modul!.seminarleiter);
    fillIfEmpty(a[0]);
    next.modul!.seminarleiter = a;
  }

  if (effP > 0) {
    const a = ensureFirst(next.modul!.praktikumsleiter);
    fillIfEmpty(a[0]);
    next.modul!.praktikumsleiter = a;
  }

  return next;
};

/** ---------- NEU: stabile IDs (Modulnummer + Dozentenname OHNE Titel) ---------- */

/** Umlaute & Sonderzeichen in einen slug umwandeln */
const toSlug = (s: string): string => {
  const map: Record<string, string> = {
    ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss',
    Ä: 'ae', Ö: 'oe', Ü: 'ue'
  };
  const replaced = s.replace(/[ÄÖÜäöüß]/g, (c) => map[c] ?? c);
  return replaced
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
};

/** Titel/Honorifics aus einem Namen entfernen (z. B. "Prof. Dr. Max Muster" -> "Max Muster") */
const stripTitles = (s?: string): string => {
  if (!s) return '';
  let name = s.trim();

  // Präfixe (mehrfach möglich)
  const prefixes = [
    'herr', 'frau',
    'jun\\.?-?prof\\.?', 'apl\\.?-?prof\\.?', 'prof\\.?',
    'pd', 'priv\\.?-?doz\\.?', 'doz\\.?', 'doktor',
    'dr\\.?', 'dott?\\.?', 'med\\.?'
  ];
  const prefixRe = new RegExp(`^(?:${prefixes.join('|')})\\s+`, 'i');
  while (prefixRe.test(name)) name = name.replace(prefixRe, '');

  // Grade/Titel überall
  const anywhere = [
    'prof\\.?', 'dr\\.?', 'ph\\.?d\\.?', 'mba', 'msc', 'm\\.?sc\\.?', 'bsc', 'b\\.?sc\\.?',
    'ba', 'ma', 'med', 'jur', 'rer\\.?\\s*nat\\.?', 'h\\.?c\\.?',
    'dipl\\.?-?\\w+\\.?'
  ];
  name = name
    .replace(new RegExp(`\\b(?:${anywhere.join('|')})\\b\\.?`, 'gi'), '')
    .replace(/\s+/g, ' ')
    .trim();

  // Kommas/Mehrfach-Whitespaces säubern
  return name.replace(/\s*,\s*/g, ' ').replace(/\s{2,}/g, ' ').trim();
};

/** Dozentenname OHNE Titel ermitteln: bevorzugt aus Arrays; Fallback modul.name */
const pickLecturerName = (m?: Modul): string => {
  const candidates: string[] = [
    m?.lesende?.[0]?.name,
    m?.seminarleiter?.[0]?.name,
    m?.praktikumsleiter?.[0]?.name,
    m?.name
  ].filter((x): x is string => !!x && x.trim().length > 0);

  const first = candidates[0] ?? '';
  return stripTitles(first);
};

/** Aus Modulnummer + (titelbereinigtem) Dozentennamen die stabile ID */
const computeStableId = (it: Item): string | undefined => {
  const nr = it?.modul?.modulnr?.trim() ?? '';
  const lecturer = pickLecturerName(it?.modul);
  if (!nr || !lecturer) return undefined;
  return `${toSlug(nr)}__${toSlug(lecturer)}`;
};

/** IDs zuweisen; Kollisionen vermeiden (…-2, …-3, …) */
const assignStableIds = (items: Model, existingIds: Set<string>): Model => {
  const used = new Set<string>([...existingIds]); // IDs, die bereits auf dem Server sind
  const out: Model = [];

  for (const it of items) {
    const base = computeStableId(it);
    if (!base) { out.push(it); continue; } // wenn nicht bestimmbar, alte Logik beibehalten

    let candidate = base;
    let i = 2;
    while (used.has(candidate)) {
      candidate = `${base}-${i++}`;
    }
    used.add(candidate);

    out.push({ ...it, id: candidate });
  }
  return out;
};

export const JsonFormsDemo = () => {
  const [data, setData] = useState<Model>([]); // Array wie früher
  const [hasErrors, setHasErrors] = useState(false);
  const [status, setStatus] = useState<'idle'|'loading'|'saving'|'saved'|'error'>('idle');

  // --- Lookup & Dropdown-Optionen für modulnr ---
  const moduByNr = useMemo(() => {
    const m = new Map<string, RawMod>();
    for (const mod of (modulesJson as RawMod[])) {
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

  /** Speichern: DELETE fehlende, PUT vorhandene, POST neue – mit stabilen IDs */
  const save = async () => {
    if (hasErrors) return;
    try {
      setStatus('saving');

      // 1) IDs holen, die aktuell auf dem Server existieren
      const existingRes = await fetch(API);
      const existing: any[] = existingRes.ok ? await existingRes.json() : [];
      const existingIds = new Set((existing ?? []).map((e) => e?.id).filter(Boolean));

      // 2) Lokale Daten kopieren
      let working: Model = data ?? [];

      // 2b) NEU: stabile IDs aus Modulnummer + Dozent (ohne Titel) berechnen
      working = assignStableIds(working, existingIds);

      // 3) IDs, die wir lokal haben (nach Recompute)
      const currentIds = new Set((working ?? []).map((b) => b.id).filter(Boolean) as string[]);

      // 4) Löschen, was auf dem Server existiert, aber lokal entfernt/umbenannt wurde
      const toDelete = Array.from(existingIds).filter((id) => !currentIds.has(id as string));
      await Promise.all(
        toDelete.map((id) =>
          fetch(`${API}/${encodeURIComponent(id as string)}`, { method: 'DELETE' })
            .then((r) => { if (!r.ok) throw new Error('DELETE'); })
        )
      );

      // 5) Upsert (PUT für vorhandene, POST für neue) – mit **unseren** stabilen IDs
      const headers = { 'Content-Type': 'application/json' };
      const updated: Model = [];

      for (const item of working ?? []) {
        const bodyObj = normalizeItem(item);
        const body = JSON.stringify(bodyObj);

        if (item.id && existingIds.has(item.id)) {
          // Update
          const res = await fetch(`${API}/${encodeURIComponent(item.id)}`, { method: 'PUT', headers, body });
          if (!res.ok) throw new Error('PUT');
          const saved = await res.json().catch(() => bodyObj);
          updated.push(normalizeItem(saved));
        } else {
          // Neu anlegen (mit vorab gesetzter stabiler ID)
          const res = await fetch(API, { method: 'POST', headers, body });
          if (!res.ok) throw new Error('POST');
          const created = await res.json(); // enthält id (gleich der von uns gesendeten)
          updated.push(normalizeItem({ ...item, id: created?.id }));
        }
      }

      // 6) State aktualisieren
      setData(updated);

      setStatus('saved');
      setTimeout(() => setStatus('idle'), 900);
    } catch {
      setStatus('error');
    }
  };

  /** --- Auto-Fill bei Änderung der modulnr --- */
  const prevRef = useRef<Model>([]);
  const handleChange = ({ data: next, errors }: { data: any; errors?: any[] }) => {
    const incoming: Model = (next ?? []) as Model;
    const prev: Model = prevRef.current ?? [];

    let mutated = false;
    const patched: Model = incoming.map((item, idx) => {
      const curNr = item?.modul?.modulnr ?? '';
      const oldNr = prev[idx]?.modul?.modulnr ?? '';
      if (curNr && curNr !== oldNr) {
        const rawMod = moduByNr.get(String(curNr).trim());
        const auto = mapModuleToForm(rawMod);
        mutated = true;

        // 1) numerische/grundlegende Felder übernehmen (ohne lehrveranstaltung)
        let merged = mergeAutoFill(item, auto);

        // 2) je nach SWS die Personen-Arrays füllen
        merged = applyLeadersIfNeeded(merged, auto, rawMod);

        return merged;
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
