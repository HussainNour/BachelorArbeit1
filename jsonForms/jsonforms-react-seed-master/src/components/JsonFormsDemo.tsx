import { useEffect, useMemo, useRef, useState } from 'react';
import { JsonForms } from '@jsonforms/react';
import {
  rankWith,
  and,
  schemaMatches,
  uiTypeIs,
  scopeEndsWith
} from '@jsonforms/core';
import { withJsonFormsControlProps } from '@jsonforms/react';
import { materialCells, materialRenderers } from '@jsonforms/material-renderers';
import schema from '../schema.json';
import uischema from '../uischema.json';
import {
  Box, Button, Alert, Stack, Typography, TextField, Autocomplete,
  FormGroup, FormControlLabel, Checkbox
} from '@mui/material';
import { createFilterOptions } from '@mui/material/Autocomplete';

/** ---------- Typen ---------- */
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

  name?: string;                   // Name (Ersteller:in) — ohne Titel
  unterschrift?: string;           // Hier darf der Titel enthalten sein
  rueckgabedatum?: string;         // YYYY-MM-DD

  profUnterschrift?: string;
  dekanUnterschrift?: string;
  datumUnterschrift?: string;      // YYYY-MM-DD

  lesende?: Person[];
  seminarleiter?: Person[];
  praktikumsleiter?: Person[];
};

type Item = {
  id?: string;   // interne ID (Dateiname)
  modul?: Modul;
};

type Model = Item[];

/** ---------- API ---------- */
const API = 'http://localhost:5050/blaetter';

/** ---------- externe Modulquelle ---------- */
import modulesJson from '../../config/INB_module.json';

/** ---------- Utils ---------- */
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

const normalizeItem = (it: Item): Item => {
  const modul = it?.modul ?? {};
  return trimStringsDeep({
    ...it,
    modul: {
      ...modul,
      lesende: ensureArray<Person>(modul.lesende),
      seminarleiter: ensureArray<Person>(modul.seminarleiter),
      praktikumsleiter: ensureArray<Person>(modul.praktikumsleiter)
    }
  });
};

/** Nur für LOAD: Arrays sicherstellen, aber Strings NICHT trimmen */
const normalizeForLoad = (inObj: any): Item => {
  const id = inObj?.id ?? undefined;
  const modul = inObj?.modul ?? {};
  return {
    id,
    modul: {
      ...modul,
      lesende: ensureArray<Person>(modul.lesende),
      seminarleiter: ensureArray<Person>(modul.seminarleiter),
      praktikumsleiter: ensureArray<Person>(modul.praktikumsleiter)
    }
  };
};

/** ---------- Semester-Helpers ---------- */
const computeSemesterFromDate = (d = new Date()): { kind: 'SoSe'|'WiSe'; year: number } => {
  const y = d.getFullYear(), m = d.getMonth()+1;
  return (m >= 4 && m <= 9) ? { kind:'SoSe', year:y } : { kind:'WiSe', year:y };
};
const nextSemester = (sem = computeSemesterFromDate()) =>
  sem.kind === 'SoSe' ? { kind:'WiSe' as const, year: sem.year } : { kind:'SoSe' as const, year: sem.year + 1 };
const yy = (y: number) => String(y % 100).padStart(2, '0');

/** Semester-String für ID */
const formatSemesterForId = (sem: { kind: 'SoSe'|'WiSe'; year: number }): string => {
  return sem.kind === 'WiSe'
    ? `wise${yy(sem.year)}${yy(sem.year + 1)}` // WiSe 2025/26 -> wise2526
    : `sose${sem.year}`;                        // SoSe 2026    -> sose2026
};

/** ---------- Programme/Gruppen ---------- */
const extractPrograms = (m?: Modul): string[] => {
  const s = (m?.studiengang ?? '').toUpperCase();
  const set = new Set<string>();
  if (/\bINB\b/.test(s)) set.add('INB');
  if (/\bMIB\b/.test(s)) set.add('MIB');
  return set.size ? Array.from(set) : ['INB', 'MIB'];
};

const computeGruppenForNextSemester = (m?: Modul): string => {
  const sem = nextSemester(computeSemesterFromDate());
  const programs = extractPrograms(m);
  const cohorts: number[] = sem.kind === 'WiSe'
    ? [sem.year + 1, sem.year, sem.year - 1]
    : [sem.year, sem.year - 1];

  const parts: string[] = [];
  for (const prog of programs) {
    for (const c of cohorts) parts.push(`${prog}${yy(c)}`);
  }
  return parts.join(' + ');
};

/** ---------- KW-Optionen ---------- */
const pad2 = (n: number) => String(n).padStart(2, '0');
const kw = (n: number) => `KW${pad2(n)}`;

const getKWOptionsForPlannedSemester = () => {
  const sem = nextSemester(computeSemesterFromDate());
  if (sem.kind === 'WiSe') {
    const a = Array.from({ length: 52 - 42 + 1 }, (_, i) => kw(42 + i));
    const b = Array.from({ length: 6 }, (_, i) => kw(1 + i));
    return [...a, ...b];
  } else {
    return Array.from({ length: 28 - 14 + 1 }, (_, i) => kw(14 + i));
  }
};

/** ---------- Mapping aus Modul-JSON ---------- */
type RawMod = any;

// Titles aus Namen entfernen (falls irgendwo doch Titel drin landen)
const stripTitles = (s?: string): string => {
  if (!s) return '';
  let name = s.trim();
  const prefixes = ['herr','frau','jun\\.?-?prof\\.?','apl\\.?-?prof\\.?','prof\\.?','pd','priv\\.?-?doz\\.?','doz\\.?','doktor','dr\\.?','dott?\\.?','med\\.?'];
  const prefixRe = new RegExp(`^(?:${prefixes.join('|')})\\s+`,'i');
  while (prefixRe.test(name)) name = name.replace(prefixRe,'');
  const anywhere = ['prof\\.?','dr\\.?','ph\\.?d\\.?','mba','msc','m\\.?sc\\.?','bsc','b\\.?sc\\.?','ba','ma','med','jur','rer\\.?\\s*nat\\.?','h\\.?c\\.?','dipl\\.?-?\\w+\\.?'];
  name = name.replace(new RegExp(`\\b(?:${anywhere.join('|')})\\b\\.?`,'gi'),'').replace(/\s+/g,' ').trim();
  return name.replace(/\s*,\s*/g,' ').replace(/\s{2,}/g,' ').trim();
};

const mapModuleToForm = (mod: RawMod): Partial<Modul> => {
  if (!mod) return {};
  const swsV = mod?.Lehrveranstaltungen?.SWS_V ?? '';
  const swsS = mod?.Lehrveranstaltungen?.SWS_S ?? '';
  const swsP = mod?.Lehrveranstaltungen?.SWS_P ?? '';
  const mv = mod?.Modulverantwortliche || {};
  const anrede = (mv?.Anrede ?? '').toString().trim();
  const vor    = (mv?.Vorname ?? '').toString().trim();
  const nach   = (mv?.Nachname ?? '').toString().trim();

  // Name ohne Titel:
  const displayName = stripTitles([vor, nach].filter(Boolean).join(' ').trim());
  // Unterschrift darf Titel enthalten:
  const displayNameWithTitle = [anrede, vor, nach].filter(Boolean).join(' ').trim();

  return {
    fakultaet: mod?.['Fakultät'] ?? '',
    studiengang: Array.isArray(mod?.ZusammenMit) ? mod.ZusammenMit.join(', ') : '',
    fs: mod?.['Fachsemester'] ?? '',
    modulnr: mod?.['Modulnummer'] ?? '',
    modulname: mod?.['Modulbezeichnung'] ?? '',
    swsVorlesung: swsV !== '' ? String(swsV) : '',
    swsSeminar:  swsS !== '' ? String(swsS) : '',
    swsPraktikum: swsP !== '' ? String(swsP) : '',
    name: displayName,                 // ← ohne Titel
    unterschrift: displayNameWithTitle // ← mit Titel
  };
};

const AUTO_KEYS: (keyof Modul)[] = [
  'fakultaet','studiengang','fs','modulnr','modulname','swsVorlesung','swsSeminar','swsPraktikum','name','unterschrift'
];

const mergeAutoFill = (oldItem: Item, auto: Partial<Modul>): Item => {
  const oldMod = oldItem?.modul ?? {};
  const next: Modul = { ...oldMod };
  for (const k of AUTO_KEYS) {
    const v = (auto as any)[k];
    if (v !== undefined) (next as any)[k] = v;
  }
  return { ...oldItem, modul: next };
};

const numOrZero = (v: any): number => {
  if (v == null) return 0;
  const s = String(v).trim();
  if (s === '') return 0;
  const n = Number(s);
  if (!Number.isNaN(n)) return n;
  return 1;
};

const applyLeadersIfNeeded = (oldItem: Item, auto: Partial<Modul>, raw: RawMod): Item => {
  const mv = raw?.Modulverantwortliche || {};
  const anrede = (mv?.Anrede ?? '').toString().trim();
  const vor    = (mv?.Vorname ?? '').toString().trim();
  const nach   = (mv?.Nachname ?? '').toString().trim();

  // Name ohne Titel
  const displayName = stripTitles([vor, nach].filter(Boolean).join(' ').trim());

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
    if (anrede && !p.titel) p.titel = anrede;         // Titel separat speichern
    if (displayName && !p.name) p.name = displayName; // Name ohne Titel
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

  // Optional: Unterschrift automatisch inkl. Titel setzen, falls leer
  const withTitle = [anrede, vor, nach].filter(Boolean).join(' ').trim();
  if (!next.modul!.unterschrift && withTitle) {
    next.modul!.unterschrift = withTitle;
  }

  return next;
};

/** ---------- Stabile IDs ---------- */
const toSlug = (s: string): string => {
  const map: Record<string,string>={ä:'ae',ö:'oe',ü:'ue',ß:'ss',Ä:'ae',Ö:'oe',Ü:'ue'};
  const r = s.replace(/[ÄÖÜäöüß]/g,(c)=>map[c]??c);
  return r.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9]+/g,'-').replace(/^-+|-+$/g,'').toLowerCase();
};
const pickLecturerName = (m?: Modul): string => {
  const c = [m?.lesende?.[0]?.name, m?.seminarleiter?.[0]?.name, m?.praktikumsleiter?.[0]?.name, m?.name].filter((x): x is string => !!x && x.trim().length>0);
  return stripTitles(c[0] ?? '');
};

/** Semester ans Ende der ID: modulnr__dozent__semester */
const computeStableId = (it: Item): string | undefined => {
  const nr = it?.modul?.modulnr?.trim() ?? '';
  const lecturer = pickLecturerName(it?.modul);
  if (!nr || !lecturer) return undefined;

  const planned = nextSemester(computeSemesterFromDate());
  const semPart = formatSemesterForId(planned);

  return `${toSlug(nr)}__${toSlug(lecturer)}__${semPart}`;
};

const assignIdsIfMissing = (items: Model, existingIds: Set<string>): Model => {
  const used = new Set<string>([
    ...existingIds,
    ...(items.map(i => i.id).filter(Boolean) as string[])
  ]);
  const out: Model = [];
  for (const it of items) {
    if (it.id && String(it.id).trim() !== '') { out.push(it); continue; }
    const base = computeStableId(it);
    if (!base) { out.push(it); continue; }
    let candidate = base, i = 2;
    while (used.has(candidate)) candidate = `${base}-${i++}`;
    used.add(candidate);
    out.push({ ...it, id: candidate });
  }
  return out;
};

/** ---------- Free-Solo Autocomplete für modul.modulnr ---------- */
type FSProps = {
  data: any;
  handleChange: (path: string, value: any) => void;
  path: string;
  label?: string;
  errors?: string;
  enabled?: boolean;
  uischema?: any;
};

const FreeSoloModulnrControlBase = (props: FSProps & { options: { value: string; label: string }[] }) => {
  const { data, handleChange, path, label, enabled = true, options } = props;

  const labelMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const o of options) m.set(o.value, o.label);
    return m;
  }, [options]);

  const allValues = useMemo(() => options.map(o => o.value), [options]);

  // Suche sowohl nach Nummer als auch nach Bezeichnung
  const filterOptions = useMemo(() => {
    return createFilterOptions<string>({
      stringify: (opt) => `${opt} ${labelMap.get(opt) ?? ''}`,
    });
  }, [labelMap]);

  return (
    <Autocomplete<string, false, false, true>
      freeSolo
      disabled={!enabled}
      options={allValues}
      filterOptions={filterOptions}
      value={data ?? ''}
      isOptionEqualToValue={(opt, val) => opt === val}
      onChange={(_, val) => handleChange(path, typeof val === 'string' ? val : '')}
      onInputChange={(_, val, reason) => {
        if (reason !== 'reset') handleChange(path, val ?? '');
      }}
      // Im Textfeld NUR die Modulnummer anzeigen
      getOptionLabel={(opt) => String(opt ?? '')}
      // In der Dropdown-Liste "Nummer – Bezeichnung" zeigen
      renderOption={(liProps, option) => (
        <li {...liProps} key={option}>
          {labelMap.get(option) ?? option}
        </li>
      )}
      renderInput={(params) => (
        <TextField {...params} label={label ?? 'Modulnummer'} variant="outlined" />
      )}
    />
  );
};
const FreeSoloModulnrControl = withJsonFormsControlProps(FreeSoloModulnrControlBase);

const freeSoloTester = rankWith(
  5,
  and(
    uiTypeIs('Control'),
    scopeEndsWith('modulnr'),
    schemaMatches((s) => (s as any)?.type === 'string')
  )
);

/** ---------- Custom Control: KW-Checkboxen ---------- */
type KWProps = {
  data: any;
  handleChange: (path: string, value: any) => void;
  path: string;
  label?: string;
  enabled?: boolean;
};

const KwHinweiseControlBase = ({ data, handleChange, path, label = 'KW-Hinweise', enabled = true }: KWProps) => {
  const options = useMemo(() => getKWOptionsForPlannedSemester(), []);
  const selectedSet = useMemo(() => {
    const set = new Set<string>();
    const s = String(data ?? '').trim();
    if (!s) return set;
    for (const part of s.split(',').map(p => p.trim()).filter(Boolean)) {
      set.add(part.toUpperCase());
    }
    return set;
  }, [data]);

  const toggle = (code: string) => {
    const next = new Set(selectedSet);
    if (next.has(code)) next.delete(code); else next.add(code);
    const out = options.filter(o => next.has(o)).join(', ');
    handleChange(path, out);
  };

  return (
    <Box sx={{ border: '1px solid #e0e0e0', borderRadius: 1.5, p: 1.5 }}>
      <Typography variant="subtitle2" sx={{ mb: 1 }}>{label}</Typography>
      <FormGroup row>
        {options.map(code => (
          <FormControlLabel
            key={code}
            control={
              <Checkbox
                size="small"
                disabled={!enabled}
                checked={selectedSet.has(code)}
                onChange={() => toggle(code)}
              />
            }
            label={code}
            sx={{ mr: 1.5 }}
          />
        ))}
      </FormGroup>
    </Box>
  );
};

const KwHinweiseControl = withJsonFormsControlProps(KwHinweiseControlBase);
const kwHinweiseTester = rankWith(
  6,
  and(
    uiTypeIs('Control'),
    scopeEndsWith('kwHinweise'),
    schemaMatches((s) => (s as any)?.type === 'string')
  )
);

/** ---------- Custom Control: Planungshinweise ---------- */
type PlanProps = {
  data: any;
  handleChange: (path: string, value: any) => void;
  path: string;
  label?: string;
  enabled?: boolean;
};

const PLAN_OPTIONS: { id: string; label: string; text: string }[] = [
  {
    id: 'even-odd-balanced',
    label: 'gleichmäßige Verteilung von Vorlesungen und Seminaren auf gerade und ungerade Wochen.',
    text: 'gleichmäßige Verteilung von Vorlesungen und Seminaren auf gerade und ungerade Wochen.'
  },
  {
    id: 'split-weeks',
    label: 'Vorlesungen in der einen und Seminare in der anderen Woche.',
    text: 'Vorlesungen in der einen und Seminare in der anderen Woche.'
  },
  {
    id: 'block-yes',
    label: 'Blockplanung (2 x 90 min hintereinander) von Vorlesungen, Seminaren oder Praktika einer Seminargruppe.',
    text: 'Blockplanung (2 x 90 min hintereinander) von Vorlesungen, Seminaren oder Praktika einer Seminargruppe.'
  },
  {
    id: 'block-no',
    label: 'keine Blockplanung in einer Seminargruppe.',
    text: 'keine Blockplanung in einer Seminargruppe.'
  },
  {
    id: 'lecture-before-seminar',
    label: 'Vorlesung zwingend vor Seminar.',
    text: 'Vorlesung zwingend vor Seminar.'
  }
];

const PlanungshinweiseControlBase = ({
  data,
  handleChange,
  path,
  label = 'Planungshinweise',
  enabled = true
}: PlanProps) => {
  const selectedSet = useMemo(() => {
    const s = String(data ?? '');
    const set = new Set<string>();
    for (const o of PLAN_OPTIONS) if (s.includes(o.text)) set.add(o.id);
    return set;
  }, [data]);

  const toggle = (id: string) => {
    const next = new Set(selectedSet);
    if (next.has(id)) next.delete(id); else next.add(id);
    const out = PLAN_OPTIONS
      .filter(o => next.has(o.id))
      .map(o => o.text)
      .join('\n');
    handleChange(path, out);
  };

  return (
    <Box sx={{ border: '1px solid #e0e0e0', borderRadius: 1.5, p: 1.5 }}>
      <Typography variant="subtitle2" sx={{ mb: 1 }}>{label}</Typography>
      <FormGroup>
        {PLAN_OPTIONS.map(o => (
          <FormControlLabel
            key={o.id}
            control={
              <Checkbox
                size="small"
                disabled={!enabled}
                checked={selectedSet.has(o.id)}
                onChange={() => toggle(o.id)}
              />
            }
            label={o.label}
            sx={{ mr: 1.5 }}
          />
        ))}
      </FormGroup>
    </Box>
  );
};

const PlanungshinweiseControl = withJsonFormsControlProps(PlanungshinweiseControlBase);
const planungshinweiseTester = rankWith(
  6,
  and(
    uiTypeIs('Control'),
    scopeEndsWith('planungshinweise'),
    schemaMatches((s) => (s as any)?.type === 'string')
  )
);

/** ---------- Komponente ---------- */
export const JsonFormsDemo = () => {
  const [data, setData] = useState<Model>([]);
  const [hasErrors, setHasErrors] = useState(false);
  const [status, setStatus] = useState<'idle'|'loading'|'saving'|'saved'|'error'>('idle');

  // Hält pro Index die letzte Modulnummer und die zuletzt bekannte ID (nur zur Wieder-Einfügung, kein Zurücksetzen anderer Felder)
  const lastModNrRef = useRef<string[]>([]);
  const idRef = useRef<(string|undefined)[]>([]);

  // Vorschläge
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

  const renderers = useMemo(() => {
    return [
      ...materialRenderers,
      { tester: freeSoloTester, renderer: (p: any) => (<FreeSoloModulnrControl {...p} options={modulnrOptions} />) },
      { tester: kwHinweiseTester, renderer: (p: any) => (<KwHinweiseControl {...p} />) },
      { tester: planungshinweiseTester, renderer: (p: any) => (<PlanungshinweiseControl {...p} />) }
    ];
  }, [modulnrOptions]);

  /** Laden – Arrays sichern, Strings nicht trimmen */
  const load = async () => {
    try {
      setStatus('loading');
      const res = await fetch(API);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const raw = await res.json();

      const items: Item[] = (Array.isArray(raw) ? raw : [raw])
        .filter(Boolean)
        .map((inObj: any) => normalizeForLoad(inObj));

      setData(items);
      // Merker aktualisieren
      lastModNrRef.current = items.map(it => it?.modul?.modulnr?.trim() ?? '');
      idRef.current = items.map(it => it?.id);
      setStatus('idle');
    } catch {
      setStatus('error');
    }
  };

  useEffect(() => { load(); }, []);

  /** Speichern – IDs nur vergeben, wenn sie fehlen; Normalisierung (inkl. trim) erst hier */
  const save = async () => {
    if (hasErrors) return;
    try {
      setStatus('saving');

      // existierende IDs laden
      const existingRes = await fetch(API);
      const existing: any[] = existingRes.ok ? await existingRes.json() : [];
      const existingIds = new Set((existing ?? []).map((e) => e?.id).filter(Boolean));

      // Arbeitskopie
      let working: Model = data ?? [];

      // Fehlende IDs vergeben; bestehende behalten
      working = assignIdsIfMissing(working, existingIds);

      // Diff: Deletes
      const currentIds = new Set((working ?? []).map((b) => b.id).filter(Boolean) as string[]);
      const toDelete = Array.from(existingIds).filter((id) => !currentIds.has(id as string));
      await Promise.all(
        toDelete.map((id) =>
          fetch(`${API}/${encodeURIComponent(id as string)}`, { method: 'DELETE' })
            .then((r) => { if (!r.ok) throw new Error('DELETE'); })
        )
      );

      // Upsert
      const headers = { 'Content-Type': 'application/json' };
      const updated: Model = [];
      for (const item of working ?? []) {
        const bodyObj = normalizeItem(item); // hier wird „sauber“ gemacht
        const body = JSON.stringify(bodyObj);

        if (item.id && existingIds.has(item.id)) {
          const res = await fetch(`${API}/${encodeURIComponent(item.id)}`, { method: 'PUT', headers, body });
          if (!res.ok) throw new Error('PUT');
          const saved = await res.json().catch(() => bodyObj);
          updated.push(normalizeItem(saved));
        } else {
          const res = await fetch(API, { method: 'POST', headers, body });
          if (!res.ok) throw new Error('POST');
          // Server-Antwort kann abweichen; wir behalten unsere bereits vergebene ID bei.
          const created = await res.json().catch(() => ({}));
          const effectiveId = item.id ?? (created as any)?.id;
          updated.push(normalizeItem({ ...item, id: effectiveId }));
        }
      }

      setData(updated);
      // Merker aktualisieren
      lastModNrRef.current = updated.map(it => it?.modul?.modulnr?.trim() ?? '');
      idRef.current = updated.map(it => it?.id);
      setStatus('saved');
      setTimeout(() => setStatus('idle'), 900);
    } catch {
      setStatus('error');
    }
  };

  /** onChange – nur übernehmen, keine Auto-Logik hier */
  const handleChange = ({ data: next, errors }: { data: any; errors?: any[] }) => {
    setData(next as Model);
    setHasErrors((errors?.length ?? 0) > 0);
  };

  /** Effekt 1: Beim echten Wechsel der Modulnummer einmalig Auto-Felder setzen */
  useEffect(() => {
    const src: Model = data ?? [];
    let changed = false;

    const patched: Model = src.map((item, idx) => {
      const curNr = item?.modul?.modulnr?.trim() ?? '';
      const last  = lastModNrRef.current[idx] ?? '';
      if (!curNr || curNr === last) return item;

      const rawMod = moduByNr.get(curNr) as RawMod | undefined;
      const auto   = mapModuleToForm(rawMod);

      // 1) Basisdaten
      let merged = mergeAutoFill(item, auto);

      // 2) Dozierende
      merged = applyLeadersIfNeeded(merged, auto, rawMod);

      // 3) Gruppen nur jetzt setzen, falls Nutzer nicht schon abgewichen ist
      const prevSuggested = computeGruppenForNextSemester(item.modul);
      const userTouched   = !!item.modul?.gruppen && item.modul!.gruppen!.trim() !== prevSuggested;
      const nextGroups    = userTouched ? item.modul!.gruppen : computeGruppenForNextSemester(merged.modul);
      merged = { ...merged, modul: { ...(merged.modul ?? {}), gruppen: nextGroups } };

      changed = true;
      return merged;
    });

    if (changed) {
      setData(patched);
    }

    // letzte Modulnummern updaten
    lastModNrRef.current = (data ?? []).map(it => it?.modul?.modulnr?.trim() ?? '');
  }, [data, moduByNr]);

  /** Effekt 2: Falls JsonForms die IDs „vergisst“, fügen wir sie nur wieder ein (ohne andere Felder anzutasten) */
  useEffect(() => {
    const src: Model = data ?? [];
    let needPatch = false;
    const patched = src.map((it, idx) => {
      if (!it) return it;
      if (it.id) return it;
      const remembered = idRef.current[idx];
      if (!remembered) return it;
      needPatch = true;
      return { ...it, id: remembered };
    });
    if (needPatch) {
      setData(patched);
    } else {
      // IDs merken (z. B. nach Load / Save)
      idRef.current = src.map(it => it?.id);
    }
  }, [data]);

  return (
    <Box sx={{ maxWidth: 1100, mx: 'auto', p: 2 }}>
      <Typography variant="h5" sx={{ mb: 2 }}>Zuarbeitsblätter (Array)</Typography>

      <JsonForms
        schema={schema as any}
        uischema={uischema as any}
        data={data}
        renderers={renderers}
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
