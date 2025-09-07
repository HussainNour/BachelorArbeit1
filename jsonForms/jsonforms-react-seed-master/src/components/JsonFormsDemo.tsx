import { useEffect, useRef, useState } from 'react';
import { JsonForms } from '@jsonforms/react';
import { materialCells, materialRenderers } from '@jsonforms/material-renderers';
import schema from '../schema.json';
import uischema from '../uischema.json';
import { Box, Button, Alert, Stack, Typography } from '@mui/material';

type Person = {
  id?: number;
  order?: number;
  salutation?: string;
  firstName?: string;
  lastName?: string;
  age?: number;
};
type Model = { persons: Person[] };

const API = 'http://localhost:5050/persons';
const DEBUG = true;

export const JsonFormsDemo = () => {
  const [data, setData] = useState<Model>({ persons: [] });
  const [hasErrors, setHasErrors] = useState(false);
  const [status, setStatus] = useState<'idle'|'loading'|'saving'|'saved'|'error'>('idle');
  const originalRef = useRef<Person[]>([]); // Snapshot vom Server

  // ---- Laden ----
  const load = async () => {
    try {
      setStatus('loading');
      const res = await fetch(API);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const persons: Person[] = await res.json();
      persons.sort((a, b) => (a.order ?? a.id ?? 0) - (b.order ?? b.id ?? 0));
      originalRef.current = JSON.parse(JSON.stringify(persons));
      setData({ persons });
      setStatus('idle');
      if (DEBUG) console.log('[LOAD]', persons);
    } catch (e) {
      console.error(e);
      setStatus('error');
    }
  };

  useEffect(() => { load(); }, []);

  // Felder, die wir vergleichen/patchen
  const pick = (x: Person) => ({
    salutation: x.salutation ?? '',
    firstName:  x.firstName  ?? '',
    lastName:   x.lastName   ?? '',
    age:        x.age ?? null,
    order:      x.order ?? null
  });

  // ---- Speichern (diff-basiert) ----
  const save = async () => {
    if (hasErrors) {
      alert('Bitte alle Pflichtfelder ausfüllen (Vorname + Nachname).');
      return;
    }
    try {
      setStatus('saving');

      // Reihenfolge ins Modell schreiben
      const current: Person[] = (data.persons ?? []).map((p, i) => ({ ...p, order: i }));
      const original: Person[] = originalRef.current ?? [];

      const byId = (arr: Person[]) => new Map(arr.filter(p => p.id != null).map(p => [p.id!, p]));
      const currMap = byId(current);
      const origMap = byId(original);

      const toCreate = current.filter(p => p.id == null);
      const toDelete = original.filter(p => p.id != null && !currMap.has(p.id!));
      const toUpdate = current.filter(p => {
        if (p.id == null) return false;
        const o = origMap.get(p.id!);
        if (!o) return true;
        return JSON.stringify(pick(p)) !== JSON.stringify(pick(o));
      });

      if (DEBUG) {
        console.log('[SAVE] toCreate', toCreate);
        console.log('[SAVE] toUpdate', toUpdate);
        console.log('[SAVE] toDelete', toDelete);
      }

      // 1) Create (alle neuen parallel posten)
      await Promise.all(
        toCreate.map(async (p) => {
          const res = await fetch(API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(p)
          });
          if (!res.ok) throw new Error('POST failed ' + res.status);
          const created = await res.json();
          if (DEBUG) console.log('[POST OK]', created);
        })
      );

      // 2) Update (parallel patchen)
      await Promise.all(
        toUpdate.map(async (p) => {
          const res = await fetch(`${API}/${p.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(pick(p))
          });
          if (!res.ok) throw new Error('PATCH failed ' + res.status);
          if (DEBUG) console.log('[PATCH OK]', p.id);
        })
      );

      // 3) Delete (parallel löschen)
      await Promise.all(
        toDelete.map(async (p) => {
          const res = await fetch(`${API}/${p.id}`, { method: 'DELETE' });
          if (!res.ok) throw new Error('DELETE failed ' + res.status);
          if (DEBUG) console.log('[DELETE OK]', p.id);
        })
      );

      // 4) Neu laden, damit IDs und Reihenfolge sicher stimmen
      await load();
      setStatus('saved');
      window.setTimeout(() => setStatus('idle'), 850);
    } catch (e) {
      console.error(e);
      setStatus('error');
    }
  };

  return (
    <Box sx={{ maxWidth: 960, mx: 'auto', p: 2 }}>
      <Typography variant="h5" gutterBottom>Personen (Liste)</Typography>

      <JsonForms
        schema={schema as any}
        uischema={uischema as any}
        data={data}
        renderers={materialRenderers}
        cells={materialCells}
        onChange={({ data: next, errors }) => {
          setData(next as Model);                  // lokal bearbeiten
          setHasErrors((errors?.length ?? 0) > 0); // Save sperren bei Fehlern
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
