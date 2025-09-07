import { useEffect, useState } from 'react';
import { JsonForms } from '@jsonforms/react';
import { materialCells, materialRenderers } from '@jsonforms/material-renderers';
import schema from '../schema.json';
import uischema from '../uischema.json';
import { Box, Button, Alert, Stack, Typography } from '@mui/material';

type Person = { salutation?: string; firstName?: string; lastName?: string; age?: number | null };
type Model  = { persons: Person[] };

const API = 'http://localhost:5050/persons';

// Altersfeld robust normalisieren (leer -> null, "12" -> 12)
const normalizeAge = (age: any) => {
  if (age === '' || age === undefined) return null;
  if (typeof age === 'string' && age.trim() === '') return null;
  if (typeof age === 'string' && /^\d+$/.test(age)) return parseInt(age, 10);
  return age; // number | null
};

export const JsonFormsDemo = () => {
  const [data, setData] = useState<Model>({ persons: [] });
  const [hasErrors, setHasErrors] = useState(false);
  const [status, setStatus] = useState<'idle'|'loading'|'saving'|'saved'|'error'>('idle');

  // --- Laden: Serverliste holen -> IDs ignorieren, nur sichtbare Felder übernehmen
  const load = async () => {
    try {
      setStatus('loading');
      const res = await fetch(API);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const raw = await res.json();
      const persons: Person[] = (raw as any[]).map((r: any) => ({
        salutation: r.salutation ?? '',
        firstName:  r.firstName  ?? '',
        lastName:   r.lastName   ?? '',
        age:        normalizeAge(r.age)
      }));
      setData({ persons });
      setStatus('idle');
    } catch {
      setStatus('error');
    }
  };

  useEffect(() => { load(); }, []);

  // --- Speichern: ALLE löschen & aktuelle Liste in Reihenfolge neu POSTen (ohne IDs)
  const save = async () => {
    if (hasErrors) return;  // Formularfehler? -> nicht speichern
    try {
      setStatus('saving');

      // 1) Existierende Einträge mit IDs holen und löschen
      const existing = await (await fetch(API)).json();
      await Promise.all(
        (existing as any[]).map(p =>
          fetch(`${API}/${p.id}`, { method: 'DELETE' })
            .then(r => { if (!r.ok) throw new Error('DELETE'); })
        )
      );

      // 2) Aktuelle Liste in Reihenfolge neu anlegen (json-server vergibt IDs automatisch)
      const toCreate = (data.persons ?? []).map(p => ({ ...p, age: normalizeAge(p.age) }));
      await Promise.all(
        toCreate.map(p =>
          fetch(API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(p)
          }).then(r => { if (!r.ok) throw new Error('POST'); })
        )
      );

      // 3) Neu laden (damit UI den Serverstand sieht – weiterhin ohne IDs)
      await load();
      setStatus('saved');
      setTimeout(() => setStatus('idle'), 900);
    } catch {
      setStatus('error');
    }
  };

  return (
    <Box sx={{ maxWidth: 960, mx: 'auto', p: 2 }}>

      <JsonForms
        schema={schema as any}
        uischema={uischema as any}
        data={data}
        renderers={materialRenderers}
        cells={materialCells}
        onChange={({ data: next, errors }) => {
          setData(next as Model);                  // nur lokal ändern
          setHasErrors((errors?.length ?? 0) > 0); // Save-Button sperren bei Fehlern
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
