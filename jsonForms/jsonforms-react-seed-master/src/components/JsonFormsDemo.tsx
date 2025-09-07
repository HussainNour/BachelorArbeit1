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

export const JsonFormsDemo = () => {
  const [data, setData] = useState<Model>({ persons: [] });
  const [status, setStatus] = useState<'idle'|'loading'|'saving'|'saved'|'error'>('idle');
  const [hasErrors, setHasErrors] = useState(false);
  const originalRef = useRef<Person[]>([]); // Snapshot vom Server

  // Laden
  const load = async () => {
    try {
      setStatus('loading');
      const res = await fetch(API);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const persons: Person[] = await res.json();
      // sortiere nach order (falls vorhanden), sonst nach id
      persons.sort((a,b) =>
        (a.order ?? a.id ?? 0) - (b.order ?? b.id ?? 0)
      );
      originalRef.current = JSON.parse(JSON.stringify(persons));
      setData({ persons });
      setStatus('idle');
    } catch {
      setStatus('error');
    }
  };

  useEffect(() => { load(); }, []);

  // Hilfen
  const keyFields = (p: Person) => ({
    salutation: p.salutation ?? '',
    firstName:  p.firstName  ?? '',
    lastName:   p.lastName   ?? '',
    age:        p.age ?? null,
    order:      p.order ?? null,
  });

  // Speichern (diff-basiert)
  const save = async () => {
    if (hasErrors) return;
    try {
      setStatus('saving');

      const current = [...(data.persons ?? [])].map((p, idx) => ({ ...p, order: idx }));
      const original = originalRef.current ?? [];

      const byId = (arr: Person[]) => new Map(arr.filter(p => p.id != null).map(p => [p.id!, p]));

      const currMap = byId(current);
      const origMap = byId(original);

      // Neu (ohne id)
      const toCreate = current.filter(p => p.id == null);

      // Gelöscht (war im original, fehlt jetzt)
      const toDelete = original.filter(p => p.id != null && !currMap.has(p.id!));

      // Geändert (id existiert & Felder unterscheiden sich)
      const toUpdate = current.filter(p => {
        if (p.id == null) return false;
        const o = origMap.get(p.id);
        if (!o) return false;
        return JSON.stringify(keyFields(p)) !== JSON.stringify(keyFields(o));
      });

      // 1) Create
      for (const p of toCreate) {
        const res = await fetch(API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(p)
        });
        if (!res.ok) throw new Error('POST failed');
      }

      // 2) Update (inkl. order)
      for (const p of toUpdate) {
        const res = await fetch(`${API}/${p.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(keyFields(p))
        });
        if (!res.ok) throw new Error('PATCH failed');
      }

      // 3) Delete
      for (const p of toDelete) {
        const res = await fetch(`${API}/${p.id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('DELETE failed');
      }

      // Neu laden → Snapshot aktualisieren
      await load();
      setStatus('saved');
      setTimeout(() => setStatus('idle'), 800);
    } catch {
      setStatus('error');
    }
  };

  return (
    <Box sx={{ maxWidth: 960, mx: 'auto', p: 2 }}>
      <Typography variant="h5" gutterBottom>Personen (Top-Level /persons)</Typography>

      <JsonForms
        schema={schema as any}
        uischema={uischema as any}
        data={data}
        renderers={materialRenderers}
        cells={materialCells}
        onChange={({ data: next, errors }) => {
          // JSON Forms liefert { persons: [...] }
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
