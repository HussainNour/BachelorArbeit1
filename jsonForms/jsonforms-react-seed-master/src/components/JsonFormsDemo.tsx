import { useEffect, useState } from 'react';
import { JsonForms } from '@jsonforms/react';
import { materialCells, materialRenderers } from '@jsonforms/material-renderers';
import schema from '../schema.json';
import uischema from '../uischema.json';
import { Box, Button, Alert, Stack, Typography } from '@mui/material';

/** ---------- Typen passend zu schema.json ---------- */
type Zuordnung = {
  bereichTitelName?: string;
  gruppe?: string;
  erlaeuterung?: string;
};

type SWS = {
  gesamt?: number;
  vorlesung?: number;
  seminar?: number;
  praktikum?: number;
};

type Blatt = {
  fakultaet?: string;
  studiengang?: string;
  fachsemester?: string;
  gruppen?: string[];

  modul?: { nummer?: string; bezeichnung?: string };
  lehrveranstaltung?: { nummer?: string; bezeichnung?: string };

  sws?: SWS;

  raumanforderung?: string;
  technikanforderung?: string;
  durchfuehrung?: 'Präsenz' | 'digital asynchron' | 'digital asynchron (zeitlich begrenzt)' | 'digital synchron';
  durchfuehrungHinweise?: string;

  lesende?: Zuordnung[];
  seminarleiter?: Zuordnung[];
  praktikumsverantwortliche?: Zuordnung[];

  wuensche?: string[];
  bevorzugteKalenderwochen?: number[];
  pruefungsHinweise?: string;

  rueckgabeFakultaet?: string; // YYYY-MM-DD
  verantwortlicheUnterschrift?: {
    professor?: string; professorDatum?: string;
    dekan?: string;     dekanDatum?: string;
    dienstleistungDekan?: string; dienstleistungDekanDatum?: string;
  };

  meta?: { semester?: string; abgabeterminDS?: string; eingangBeiDS?: string };
  notizen?: string;
};

type Model = Blatt[]; // Root ist ein Array!

/** ---------- API ---------- */
const API = 'http://localhost:5050/blaetter';

/** schlichte Normalizer, die leere Werte entfernen statt null zu setzen */
const optNumber = (v: any): number | undefined => {
  if (v === '' || v === undefined || v === null) return undefined;
  if (typeof v === 'string' && /^\d+(\.\d+)?$/.test(v)) return Number(v);
  if (typeof v === 'number' && !Number.isNaN(v)) return v;
  return undefined;
};
const ensureStrArray = (v: any): string[] | undefined =>
  Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim() !== '') : undefined;
const ensureNumArray = (v: any): number[] | undefined =>
  Array.isArray(v) ? v.map((x) => (typeof x === 'string' && /^\d+$/.test(x) ? parseInt(x, 10) : x))
                   .filter((x) => typeof x === 'number' && Number.isFinite(x)) : undefined;

/** für json-server: id vom Top-Level-Objekt ignorieren */
const stripId = (o: any) => {
  const { id, ...rest } = o ?? {};
  return rest;
};

export const JsonFormsDemo = () => {
  const [data, setData] = useState<Model>([]); // <-- Array!
  const [hasErrors, setHasErrors] = useState(false);
  const [status, setStatus] = useState<'idle'|'loading'|'saving'|'saved'|'error'>('idle');

  /** Laden: Liste holen -> bereinigen -> Array in den State */
  const load = async () => {
    try {
      setStatus('loading');
      const res = await fetch(API);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const raw = await res.json();

      const blaetter: Blatt[] = (raw as any[]).map((r: any) => {
        const inObj = stripId(r);

        return {
          fakultaet: inObj.fakultaet ?? '',
          studiengang: inObj.studiengang ?? '',
          fachsemester: inObj.fachsemester ?? '',
          gruppen: ensureStrArray(inObj.gruppen) ?? [],

          modul: {
            nummer: inObj?.modul?.nummer ?? '',
            bezeichnung: inObj?.modul?.bezeichnung ?? ''
          },
          lehrveranstaltung: {
            nummer: inObj?.lehrveranstaltung?.nummer ?? '',
            bezeichnung: inObj?.lehrveranstaltung?.bezeichnung ?? ''
          },

          sws: {
            gesamt: optNumber(inObj?.sws?.gesamt),
            vorlesung: optNumber(inObj?.sws?.vorlesung),
            seminar: optNumber(inObj?.sws?.seminar),
            praktikum: optNumber(inObj?.sws?.praktikum)
          },

          raumanforderung: inObj.raumanforderung ?? '',
          technikanforderung: inObj.technikanforderung ?? '',
          durchfuehrung: inObj.durchfuehrung ?? 'Präsenz',
          durchfuehrungHinweise: inObj.durchfuehrungHinweise ?? '',

          lesende: Array.isArray(inObj.lesende) ? inObj.lesende : [],
          seminarleiter: Array.isArray(inObj.seminarleiter) ? inObj.seminarleiter : [],
          praktikumsverantwortliche: Array.isArray(inObj.praktikumsverantwortliche) ? inObj.praktikumsverantwortliche : [],

          wuensche: ensureStrArray(inObj.wuensche) ?? [],
          bevorzugteKalenderwochen: ensureNumArray(inObj.bevorzugteKalenderwochen) ?? [],
          pruefungsHinweise: inObj.pruefungsHinweise ?? '',

          rueckgabeFakultaet: typeof inObj.rueckgabeFakultaet === 'string' ? inObj.rueckgabeFakultaet : '',
          verantwortlicheUnterschrift: {
            professor: inObj?.verantwortlicheUnterschrift?.professor ?? '',
            professorDatum: inObj?.verantwortlicheUnterschrift?.professorDatum ?? '',
            dekan: inObj?.verantwortlicheUnterschrift?.dekan ?? '',
            dekanDatum: inObj?.verantwortlicheUnterschrift?.dekanDatum ?? '',
            dienstleistungDekan: inObj?.verantwortlicheUnterschrift?.dienstleistungDekan ?? '',
            dienstleistungDekanDatum: inObj?.verantwortlicheUnterschrift?.dienstleistungDekanDatum ?? ''
          },

          meta: {
            semester: inObj?.meta?.semester ?? 'Wintersemester 2025/26',
            abgabeterminDS: inObj?.meta?.abgabeterminDS ?? '',
            eingangBeiDS: inObj?.meta?.eingangBeiDS ?? ''
          },

          notizen: inObj.notizen ?? ''
        } as Blatt;
      });

      setData(blaetter);
      setStatus('idle');
    } catch {
      setStatus('error');
    }
  };

  useEffect(() => { load(); }, []);

  /** Speichern: Alles löschen + aktuelle Array-Reihenfolge neu anlegen */
  const save = async () => {
    if (hasErrors) return;
    try {
      setStatus('saving');

      // 1) Bestehende Einträge löschen
      const existingRes = await fetch(API);
      const existing = existingRes.ok ? await existingRes.json() : [];
      await Promise.all(
        (existing as any[]).map((e) =>
          fetch(`${API}/${e.id}`, { method: 'DELETE' })
            .then((r) => { if (!r.ok) throw new Error('DELETE'); })
        )
      );

      // 2) Neu anlegen (ohne id); leichte Bereinigung vor POST
      const toCreate: Blatt[] = (data ?? []).map((b) => ({
        ...b,
        sws: {
          gesamt: optNumber(b?.sws?.gesamt),
          vorlesung: optNumber(b?.sws?.vorlesung),
          seminar: optNumber(b?.sws?.seminar),
          praktikum: optNumber(b?.sws?.praktikum)
        },
        gruppen: ensureStrArray(b.gruppen) ?? [],
        wuensche: ensureStrArray(b.wuensche) ?? [],
        bevorzugteKalenderwochen: ensureNumArray(b.bevorzugteKalenderwochen) ?? []
      }));

      await Promise.all(
        toCreate.map((entry) =>
          fetch(API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(entry)
          }).then((r) => { if (!r.ok) throw new Error('POST'); })
        )
      );

      // 3) Neu laden
      await load();
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
        data={data}                     // <-- Array!
        renderers={materialRenderers}
        cells={materialCells}
        onChange={({ data: next, errors }) => {
          setData(next as Model);
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
