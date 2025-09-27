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

  name?: string;                   // Name (Ersteller:in)
  unterschrift?: string;
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

/** ---------- Semester-Helpers (wie zuvor) ---------- */
const computeSemesterFromDate = (d = new Date()): { kind: 'SoSe'|'WiSe'; year: number } => {
  const y = d.getFullYear(), m = d.getMonth()+1;
  return (m >= 4 && m <= 9) ? { kind:'SoSe', year:y } : { kind:'WiSe', year:y };
};
const nextSemester = (sem = computeSemesterFromDate()) =>
  sem.kind === 'SoSe' ? { kind:'WiSe' as const, year: sem.year } : { kind:'SoSe' as const, year: sem.year + 1 };
const yy = (y: number) => String(y % 100).padStart(2, '0');

/** Programme für Gruppenberechnung */
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

/** ---------- KW-Optionen je geplantem Semester ---------- */
const pad2 = (n: number) => String(n).padStart(2, '0');
const kw = (n: number) => `KW${pad2(n)}`;

/** Praktische, erwartungskonforme Bereiche:
 *  WiSe -> KW42..KW52 + KW01..KW06
 *  SoSe -> KW14..KW28
 */
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
const mapModuleToForm = (mod: RawMod): Partial<Modul> => {
  if (!mod) return {};
  const swsV = mod?.Lehrveranstaltungen?.SWS_V ?? '';
  const swsS = mod?.Lehrveranstaltungen?.SWS_S ?? '';
  const swsP = mod?.Lehrveranstaltungen?.SWS_P ?? '';
  const mv = mod?.Modulverantwortliche || {};
  const anrede = (mv?.Anrede ?? '').toString().trim();
  const vor    = (mv?.Vorname ?? '').toString().trim();
  const nach   = (mv?.Nachname ?? '').toString().trim();
  const displayName = [anrede, vor, nach].filter(Boolean).join(' ').trim();
  return {
    fakultaet: mod?.['Fakultät'] ?? '',
    studiengang: Array.isArray(mod?.ZusammenMit) ? mod.ZusammenMit.join(', ') : '',
    fs: mod?.['Fachsemester'] ?? '',
    modulnr: mod?.['Modulnummer'] ?? '',
    modulname: mod?.['Modulbezeichnung'] ?? '',
    swsVorlesung: swsV !== '' ? String(swsV) : '',
    swsSeminar:  swsS !== '' ? String(swsS) : '',
    swsPraktikum: swsP !== '' ? String(swsP) : '',
    name: displayName
  };
};

const AUTO_KEYS: (keyof Modul)[] = [
  'fakultaet','studiengang','fs','modulnr','modulname','swsVorlesung','swsSeminar','swsPraktikum','name'
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

/** ---------- Stabile IDs (modulnr + Dozent ohne Titel) ---------- */
const toSlug = (s: string): string => {
  const map: Record<string,string>={ä:'ae',ö:'oe',ü:'ue',ß:'ss',Ä:'ae',Ö:'oe',Ü:'ue'};
  const r = s.replace(/[ÄÖÜäöüß]/g,(c)=>map[c]??c);
  return r.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9]+/g,'-').replace(/^-+|-+$/g,'').toLowerCase();
};
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
const pickLecturerName = (m?: Modul): string => {
  const c = [m?.lesende?.[0]?.name, m?.seminarleiter?.[0]?.name, m?.praktikumsleiter?.[0]?.name, m?.name].filter((x): x is string => !!x && x.trim().length>0);
  return stripTitles(c[0] ?? '');
};
const computeStableId = (it: Item): string | undefined => {
  const nr = it?.modul?.modulnr?.trim() ?? '';
  const lecturer = pickLecturerName(it?.modul);
  if (!nr || !lecturer) return undefined;
  return `${toSlug(nr)}__${toSlug(lecturer)}`;
};

/** IDs nur für NEUE Items vergeben; bestehende IDs bleiben */
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

  return (
    <Autocomplete
      freeSolo
      disabled={!enabled}
      options={allValues}
      value={data ?? ''}
      onChange={(_, val) => handleChange(path, typeof val === 'string' ? val : '')}
      onInputChange={(_, val, reason) => {
        if (reason !== 'reset') handleChange(path, val ?? '');
      }}
      getOptionLabel={(opt) => labelMap.get(opt as string) ?? String(opt ?? '')}
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

/** ---------- Custom Control: KW-Checkboxen für kwHinweise ---------- */
type KWProps = {
  data: any;
  handleChange: (path: string, value: any) => void;
  path: string;
  label?: string;
  enabled?: boolean;
};

const KwHinweiseControlBase = ({ data, handleChange, path, label = 'KW-Hinweise', enabled = true }: KWProps) => {
  // Optionen anhand des geplanten Semesters
  const options = useMemo(() => getKWOptionsForPlannedSemester(), []);

  // Aus dem String "KW42, KW43, ..." -> Set für schnelle Checks
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
    // Als String in definierter Options-Reihenfolge zurückschreiben
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

// Hoher Rank, damit unser Control das Default-Textfeld ersetzt
const kwHinweiseTester = rankWith(
  6,
  and(
    uiTypeIs('Control'),
    scopeEndsWith('kwHinweise'),
    schemaMatches((s) => (s as any)?.type === 'string')
  )
);

/** ---------- Custom Control: Checkboxen für planungshinweise ---------- */
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
  // Auswahl aus vorhandenem String rekonstruieren
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

  // Vorschläge (reine Suggestions, kein Zwang)
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

  // Renderer: Material + unser Free-Solo + KW-Control + Planungshinweise-Control
  const renderers = useMemo(() => {
    return [
      ...materialRenderers,
      { tester: freeSoloTester, renderer: (p: any) => (<FreeSoloModulnrControl {...p} options={modulnrOptions} />) },
      { tester: kwHinweiseTester, renderer: (p: any) => (<KwHinweiseControl {...p} />) },
      { tester: planungshinweiseTester, renderer: (p: any) => (<PlanungshinweiseControl {...p} />) }
    ];
  }, [modulnrOptions]);

  /** Laden – keine Auto-Overrides; prevRef initialisieren */
  const prevRef = useRef<Model>([]);
  const load = async () => {
    try {
      setStatus('loading');
      const res = await fetch(API);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const raw = await res.json();

      const items: Item[] = (Array.isArray(raw) ? raw : [raw])
        .filter(Boolean)
        .map((inObj: any) => normalizeItem({
          id: inObj?.id ?? undefined,
          modul: inObj?.modul ?? {}
        }));

      setData(items);
      prevRef.current = items; // WICHTIG: IDs im Prev-Ref speichern
      setStatus('idle');
    } catch {
      setStatus('error');
    }
  };

  useEffect(() => { load(); }, []);

  /** Speichern – IDs nur vergeben, wenn sie fehlen; sonst alles unverändert */
  const save = async () => {
    if (hasErrors) return;
    try {
      setStatus('saving');

      // existierende IDs
      const existingRes = await fetch(API);
      const existing: any[] = existingRes.ok ? await existingRes.json() : [];
      const existingIds = new Set((existing ?? []).map((e) => e?.id).filter(Boolean));

      // Arbeitskopie (ohne Auto-Overrides)
      let working: Model = data ?? [];

      // Nur fehlende IDs vergeben; bestehende IDs bleiben
      working = assignIdsIfMissing(working, existingIds);

      // Diff
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
        const bodyObj = normalizeItem(item);
        const body = JSON.stringify(bodyObj);

        if (item.id && existingIds.has(item.id)) {
          const res = await fetch(`${API}/${encodeURIComponent(item.id)}`, { method: 'PUT', headers, body });
          if (!res.ok) throw new Error('PUT');
          const saved = await res.json().catch(() => bodyObj);
          updated.push(normalizeItem(saved));
        } else {
          const res = await fetch(API, { method: 'POST', headers, body });
          if (!res.ok) throw new Error('POST');
          const created = await res.json();
          updated.push(normalizeItem({ ...item, id: created?.id ?? item.id }));
        }
      }

      setData(updated);
      prevRef.current = updated; // Prev-Ref aktualisieren
      setStatus('saved');
      setTimeout(() => setStatus('idle'), 900);
    } catch {
      setStatus('error');
    }
  };

  /** Change-Handler – Auto nur beim Modulwechsel; ID aus prevRef immer beibehalten */
  const handleChange = ({ data: next, errors }: { data: any; errors?: any[] }) => {
    const incoming: Model = (next ?? []) as Model;
    const prev: Model = prevRef.current ?? [];

    const patched: Model = incoming.map((item, idx) => {
      const prevItem = prev[idx] ?? {};
      const prevId = (prevItem as Item)?.id;

      const curNr = item?.modul?.modulnr ?? '';
      const oldNr = (prevItem as Item)?.modul?.modulnr ?? '';

      let result = item;

      // *** NUR hier automatisch vorbelegen: beim Wechsel der Modulnummer ***
      if (curNr && curNr !== oldNr) {
        const rawMod = moduByNr.get(String(curNr).trim());
        const auto = mapModuleToForm(rawMod);

        // 1) Basisdaten aus Modulquelle (nur jetzt; danach frei editierbar)
        let merged = mergeAutoFill(item, auto);

        // 2) Dozierenden-Felder ggf. vorbelegen
        merged = applyLeadersIfNeeded(merged, auto, rawMod);

        // 3) Gruppen *einmalig jetzt* setzen – aber nie überschreiben, wenn Nutzer schon geändert hatte
        const prevGroups = (prevItem as Item)?.modul?.gruppen?.trim() ?? '';
        const prevSuggested = computeGruppenForNextSemester((prevItem as Item)?.modul);
        const userTouched = prevGroups.length > 0 && prevGroups !== prevSuggested;
        const nextGroups = userTouched ? prevGroups : computeGruppenForNextSemester(merged.modul);

        merged = { ...merged, modul: { ...(merged.modul ?? {}), gruppen: nextGroups } };
        result = merged;
      }

      // *** WICHTIG: Immer alte ID beibehalten! ***
      if (prevId) result = { ...result, id: prevId };

      return result;
    });

    prevRef.current = patched; // neuen Stand als „alt“ merken
    setData(patched);
    setHasErrors((errors?.length ?? 0) > 0);
  };

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
