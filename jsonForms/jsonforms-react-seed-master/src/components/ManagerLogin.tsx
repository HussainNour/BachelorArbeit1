import { useState } from 'react';
import { Box, Button, TextField, Alert, Stack, Typography } from '@mui/material';
import { setToken } from '../auth';

const API = 'http://localhost:5050';

export default function ManagerLogin() {
  const [username, setU] = useState('manager');
  const [password, setP] = useState('1234');
  const [status, setStatus] = useState<'idle'|'error'|'ok'>('idle');

  const doLogin = async () => {
    setStatus('idle');
    try {
      const res = await fetch(`${API}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      if (!res.ok) throw new Error('login');
      const json = await res.json();
      setToken(json.token);
      setStatus('ok');
    } catch {
      setStatus('error');
    }
  };

  return (
    <Box sx={{ maxWidth: 360, mx: 'auto', mt: 6, p: 2 }}>
      <Typography variant="h5" sx={{ mb: 2 }}>Manager Login</Typography>
      <Stack spacing={2}>
        <TextField label="Username" value={username} onChange={e=>setU(e.target.value)} />
        <TextField label="Passwort" type="password" value={password} onChange={e=>setP(e.target.value)} />
        <Button variant="contained" onClick={doLogin}>Einloggen</Button>
        {status==='ok' && <Alert severity="success">Eingeloggt. Zur <a href="/">Übersicht</a>.</Alert>}
        {status==='error' && <Alert severity="error">Login fehlgeschlagen.</Alert>}
      </Stack>
    </Box>
  );
}
