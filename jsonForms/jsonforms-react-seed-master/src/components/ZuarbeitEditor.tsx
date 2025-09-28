// components/ZuarbeitEditor.tsx
import { useEffect, useMemo, useState } from 'react';
import { useParams, Link as RouterLink } from 'react-router-dom';
import { JsonForms } from '@jsonforms/react';
import { materialCells, materialRenderers } from '@jsonforms/material-renderers';
import { rankWith, and, schemaMatches, uiTypeIs, scopeEndsWith } from '@jsonforms/core';
import { withJsonFormsControlProps } from '@jsonforms/react';
import schemaAll from '../schema.json';
import uischemaAll from '../uischema.json';

import {
  Box, Button, Alert, Stack, Typography, TextField, Autocomplete,
  FormGroup, FormControlLabel, Checkbox, Link
} from '@mui/material';
import { createFilterOptions } from '@mui/material/Autocomplete';

const API = 'http://localhost:5050/Zuarbeit';

/* ---------- Typen ---------- */
type Person = { titel?: string; name?: string; gruppen?: string; erlaeuterung?: string; };
type Modul = {
  fakultaet?: string; studiengang?: string; fs?: string; gruppen?: string;
  modulnr?: string; modulname?: string; lehrveranstaltung?: string;
  swsVorlesung?: string; swsSeminar?: string; swsPraktikum?: string;
  raumV?: string; raumS?: string; raumP?: string;
  technikV?: string; technikS?: string; technikP?: string;
  planungshinweise?: string; kwHinweise?: string;
  name?: string; unterschrift?: string; rueckgabedatum?: string;
  profUnterschrift?: string; dekanUnterschrift?: string; datumUnterschrift?: string;
  lesende?: Person[]; seminarleiter?: Person[]; praktikumsleiter?: Person[];
};
type Item = { id?: string; modul?: Modul };

/* ---------- Utils aus deiner Demo (kurzfassung) ---------- */
const ensureArray = <T,>(v: any): T[] => Array.isArray(v) ? v as T[] : (v == null ? [] : [v as T]);
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
const trimStringsDeep = (obj: any): any => {
  if (obj == null) return obj;
  if (Array.isArray(obj)) return obj.map(trimStringsDeep);
  if (typeof obj === 'object') {
    const out: any = {};
    for (const [k, v] of Object.entries(obj)) out[k] = trimStringsDeep(v);
    return out;
  }
  return typeof obj === 'string' ? obj.trim() : obj;
};

/* ---------- Custom Controls (kompatibel zu deiner Liste) ---------- */
type FSProps = {
  data: any; handleChange: (path: string, value: any) => void; path: string;
  label?: string; enabled?: boolean; options?: any;
};
const FreeSoloModulnrControlBase = (props: FSProps & { options: { value: string; label: string }[] }) => {
  const { data, handleChange, path, label, enabled = true, options } = props;
  const labelMap = useMemo(() => new Map(options.map(o => [o.value, o.label])), [options]);
  const allValues = useMemo(() => options.map((o: any) => o.value), [options]);
  const filterOptions = useMemo(
    () => createFilterOptions<string>({ stringify: (opt) => `${opt} ${labelMap.get(opt) ?? ''}` }),
    [labelMap]
  );
  return (
    <Autocomplete<string, false, false, true>
      freeSolo disabled={!enabled} options={allValues} filterOptions={filterOptions}
      value={data ?? ''} isOptionEqualToValue={(opt, val) => opt === val}
      onChange={(_, val) => handleChange(path, typeof val === 'string' ? val : '')}
      onInputChange={(_, val, reason) => { if (reason !== 'reset') handleChange(path, val ?? ''); }}
      getOptionLabel={(opt) => String(opt ?? '')}
      renderOption={(liProps, option) => <li {...liProps} key={option}>{labelMap.get(option) ?? option}</li>}
      renderInput={(params) => (<TextField {...params} label={label ?? 'Modulnummer'} variant="outlined" />)}
    />
  );
};
const FreeSoloModulnrControl = withJsonFormsControlProps(FreeSoloModulnrControlBase);
const freeSoloTester = rankWith(5, and(uiTypeIs('Control'), scopeEndsWith('modulnr'), schemaMatches((s) => (s as any)?.type === 'string')));

type KWProps = { data: any; handleChange: (path: string, value: any) => void; path: string; label?: string; enabled?: boolean; };
const pad2 = (n: number) => String(n).padStart(2, '0');
const kw = (n: number) => `KW${pad2(n)}`;
const getKWOptionsForPlannedSemester = () => {
  // gleiche Logik wie bei dir (vereinfachte Fassung)
  const m = new Date().getMonth() + 1;
  const isWiSe = !(m >= 4 && m <= 9);
  return isWiSe
    ? [...Array(52 - 42 + 1).keys()].map(i => kw(42 + i)).concat([...Array(6).keys()].map(i => kw(1 + i)))
    : [...Array(28 - 14 + 1).keys()].map(i => kw(14 + i));
};
const KwHinweiseControlBase = ({ data, handleChange, path, label = 'KW-Hinweise', enabled = true }: KWProps) => {
  const options = useMemo(() => getKWOptionsForPlannedSemester(), []);
  const selectedSet = useMemo(() => {
    const set = new Set<string>();
    const s = String(data ?? '').trim();
    if (!s) return set;
    for (const part of s.split(',').map(p => p.trim()).filter(Boolean)) set.add(part.toUpperCase());
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
          <FormControlLabel key={code}
            control={<Checkbox size="small" disabled={!enabled} checked={selectedSet.has(code)} onChange={() => toggle(code)} />}
            label={code} sx={{ mr: 1.5 }}
          />
        ))}
      </FormGroup>
    </Box>
  );
};
const KwHinweiseControl = withJsonFormsControlProps(KwHinweiseControlBase);
const kwHinweiseTester = rankWith(6, and(uiTypeIs('Control'), scopeEndsWith('kwHinweise'), schemaMatches((s) => (s as any)?.type === 'string')));

type PlanProps = { data: any; handleChange: (path: string, value: any) => void; path: string; label?: string; enabled?: boolean; };
const PLAN_OPTIONS = [
  { id: 'even-odd-balanced', label: 'gleichmäßige Verteilung von Vorlesungen und Seminaren auf gerade und ungerade Wochen.', text: 'gleichmäßige Verteilung von Vorlesungen und Seminaren auf gerade und ungerade Wochen.' },
  { id: 'split-weeks',       label: 'Vorlesungen in der einen und Seminare in der anderen Woche.', text: 'Vorlesungen in der einen und Seminare in der anderen Woche.' },
  { id: 'block-yes',         label: 'Blockplanung (2 x 90 min hintereinander) von Vorlesungen, Seminaren oder Praktika einer Seminargruppe.', text: 'Blockplanung (2 x 90 min hintereinander) von Vorlesungen, Seminaren oder Praktika einer Seminargruppe.' },
  { id: 'block-no',          label: 'keine Blockplanung in einer Seminargruppe.', text: 'keine Blockplanung in einer Seminargruppe.' },
  { id: 'lecture-before-seminar', label: 'Vorlesung zwingend vor Seminar.', text: 'Vorlesung zwingend vor Seminar.' }
];
const PlanungshinweiseControlBase = ({ data, handleChange, path, label = 'Planungshinweise', enabled = true }: PlanProps) => {
  const selectedSet = useMemo(() => {
    const s = String(data ?? '');
    const set = new Set<string>();
    for (const o of PLAN_OPTIONS) if (s.includes(o.text)) set.add(o.id);
    return set;
  }, [data]);
  const toggle = (id: string) => {
    const next = new Set(selectedSet);
    if (next.has(id)) next.delete(id); else next.add(id);
    const out = PLAN_OPTIONS.filter(o => next.has(o.id)).map(o => o.text).join('\n');
    handleChange(path, out);
  };
  return (
    <Box sx={{ border: '1px solid #e0e0e0', borderRadius: 1.5, p: 1.5 }}>
      <Typography variant="subtitle2" sx={{ mb: 1 }}>{label}</Typography>
      <FormGroup>
        {PLAN_OPTIONS.map(o => (
          <FormControlLabel key={o.id}
            control={<Checkbox size="small" disabled={!enabled} checked={selectedSet.has(o.id)} onChange={() => toggle(o.id)} />}
            label={o.label} sx={{ mr: 1.5 }}
          />
        ))}
      </FormGroup>
    </Box>
  );
};
const PlanungshinweiseControl = withJsonFormsControlProps(PlanungshinweiseControlBase);
const planungshinweiseTester = rankWith(6, and(uiTypeIs('Control'), scopeEndsWith('planungshinweise'), schemaMatches((s) => (s as any)?.type === 'string')));

/* ---------- Modulnummer-Optionen aus deinem modulesJson ---------- */
import modulesJson from '../../config/INB_module.json';
type RawMod = any;
const modulnrOptions = (modulesJson as RawMod[])
  .map((m) => ({
    value: String(m['Modulnummer']).trim(),
    label: `${String(m['Modulnummer']).trim()} – ${String(m['Modulbezeichnung']).trim()}`
  }))
  .filter((o) => o.value);

/* ---------- Editor-Komponente ---------- */
export const ZuarbeitEditor = () => {
  const { id } = useParams<{ id: string }>();
  const [item, setItem] = useState<Item | null>(null);
  const [status, setStatus] = useState<'idle'|'loading'|'saving'|'saved'|'error'|'notfound'>('idle');

  // Aus dem Array-Schema/UISchema das Item-Schema/Detail-Layout extrahieren
  const itemSchema = (schemaAll as any)?.items ?? schemaAll;          // fallback falls schon objekt
  const itemUi = (uischemaAll as any)?.options?.detail ?? uischemaAll; // fallback falls schon detail

  const renderers = useMemo(() => ([
    ...materialRenderers,
    { tester: freeSoloTester, renderer: (p: any) => (<FreeSoloModulnrControl {...p} options={modulnrOptions} />) },
    { tester: kwHinweiseTester, renderer: (p: any) => (<KwHinweiseControl {...p} />) },
    { tester: planungshinweiseTester, renderer: (p: any) => (<PlanungshinweiseControl {...p} />) }
  ]), []);

  const load = async () => {
    if (!id) return;
    try {
      setStatus('loading');
      // Versuche /Zuarbeit/:id
      const res = await fetch(`${API}/${encodeURIComponent(id)}`);
      if (res.ok) {
        const raw = await res.json();
        const one = normalizeForLoad(raw);
        setItem(one);
        setStatus('idle');
        return;
      }
      // Fallback: Liste laden und suchen
      const resAll = await fetch(API);
      if (!resAll.ok) throw new Error('HTTP ' + resAll.status);
      const arr = await resAll.json();
      const found = (Array.isArray(arr) ? arr : [arr]).find((x: any) => x?.id === id);
      if (!found) { setStatus('notfound'); return; }
      setItem(normalizeForLoad(found));
      setStatus('idle');
    } catch {
      setStatus('error');
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  const save = async () => {
    if (!item || !item.id) return;
    try {
      setStatus('saving');
      const body = JSON.stringify(trimStringsDeep(item));
      const res = await fetch(`${API}/${encodeURIComponent(item.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body
      });
      if (!res.ok) throw new Error('PUT');
      const saved = await res.json().catch(() => item);
      setItem(normalizeForLoad(saved));
      setStatus('saved');
      setTimeout(() => setStatus('idle'), 900);
    } catch {
      setStatus('error');
    }
  };

  if (status === 'notfound') {
    return (
      <Box sx={{ maxWidth: 1000, mx: 'auto', p: 2 }}>
        <Alert severity="warning" sx={{ mb: 2 }}>Datensatz nicht gefunden (ID: {id})</Alert>
        <Button component={RouterLink} to="/" variant="outlined">Zurück zur Übersicht</Button>
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 1100, mx: 'auto', p: 2 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="h5">Zuarbeitsblatt bearbeiten</Typography>
        <Link component={RouterLink} to="/">Zur Übersicht</Link>
      </Stack>

      {item && (
        <JsonForms
          schema={itemSchema as any}         // ⬅️ wichtig: Schema des EINZEL-Items
          uischema={itemUi as any}           // ⬅️ das Detail-Layout deiner Array-Ansicht wiederverwenden
          data={item}                        // ⬅️ direkt das Item (kein Array!)
          renderers={renderers}
          cells={materialCells}
          onChange={({ data }) => setItem(data as Item)}
        />
      )}

      <Stack direction="row" spacing={2} sx={{ mt: 2 }}>
        <Button variant="contained" onClick={save} disabled={!item || status === 'saving'}>Speichern</Button>
        <Button variant="outlined" onClick={load} disabled={status === 'loading'}>Neu laden</Button>
      </Stack>

      {status === 'loading' && <Alert sx={{ mt: 2 }} severity="info">Lade…</Alert>}
      {status === 'saving'  && <Alert sx={{ mt: 2 }} severity="info">Speichere…</Alert>}
      {status === 'saved'   && <Alert sx={{ mt: 2 }} severity="success">Gespeichert</Alert>}
      {status === 'error'   && <Alert sx={{ mt: 2 }} severity="error">Fehler beim Laden/Speichern</Alert>}
    </Box>
  );
};
