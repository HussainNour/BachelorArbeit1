import { useState } from 'react';
import { JsonForms } from '@jsonforms/react';
import { materialCells, materialRenderers } from '@jsonforms/material-renderers';
import schema from '../schema.json';
import uischema from '../uischema.json';
import { Box, Button, Typography } from '@mui/material';

type Person = { salutation?: string; firstName?: string; lastName?: string; age?: number; };

const API = 'http://localhost:5050/persons';

export const JsonFormsDemo = () => {
  const [data, setData] = useState<Person>({});
  const [hasErrors, setHasErrors] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const save = async () => {
    setMsg(null);
    try {
      const res = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!res.ok) throw new Error(await res.text());
      const created = await res.json(); // json-server vergibt eine id
      setMsg(`Gespeichert (id: ${created.id})`);
    } catch (e: any) {
      setMsg(`Fehler: ${e?.message ?? 'Unbekannt'}`);
    }
  };

  return (
    <Box sx={{ maxWidth: 640, mx: 'auto', p: 2 }}>
      <Typography variant="h5" gutterBottom>JSON Forms – Test</Typography>

      <JsonForms
        schema={schema as any}
        uischema={uischema as any}
        data={data}
        renderers={materialRenderers}
        cells={materialCells}
        onChange={({ data, errors }) => {
          setData(data);
          setHasErrors((errors?.length ?? 0) > 0);
        }}
      />

      <Button variant="contained" onClick={save} disabled={hasErrors} sx={{ mt: 2 }}>
        Speichern (json-server)
      </Button>

      {msg && <Typography sx={{ mt: 1 }}>{msg}</Typography>}
    </Box>
  );
};
