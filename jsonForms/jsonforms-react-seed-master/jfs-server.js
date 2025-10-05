// server/jfs-server.js
const express = require('express');
const cors = require('cors');
const Store = require('json-fs-store');
const { randomUUID } = require('crypto');
const jwt = require('jsonwebtoken');

const app = express();
const store = Store('data/Zuarbeit');
const SECRET = 'geheim123'; // in echtem Projekt in .env auslagern

app.use(cors());
app.use(express.json());

// --- Helpers ---
function requireAuth(req, res, next) {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) return res.status(401).json({ error: 'Token fehlt' });
  try {
    const payload = jwt.verify(h.slice(7), SECRET);
    req.user = payload;
    next();
  } catch {
    return res.status(403).json({ error: 'Ungültiger Token' });
  }
}

function allowShareLink(req, res, next) {
  const id = req.params.id;
  if (!id) return res.status(400).json({ error: 'ID fehlt' });
  store.load(id, (err, obj) => {
    if (err || !obj) return res.status(404).json({ error: 'Nicht gefunden' });
    req.sharedItem = obj;
    next();
  });
}

// --- Login (nur Manager, Demo) ---
app.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (username === 'manager' && password === '1234') {
    const token = jwt.sign({ role: 'manager', name: 'manager' }, SECRET, { expiresIn: '4h' });
    return res.json({ token });
  }
  return res.status(401).json({ error: 'Login fehlgeschlagen' });
});

// --- Liste: nur Manager ---
app.get('/Zuarbeit', requireAuth, (req, res) => {
  store.list((err, objs) => {
    if (err) return res.status(500).json({ error: String(err) });
    res.json(objs);
  });
});

// --- Einzelnes lesen: Manager ODER Share-Link ohne Token ---
app.get('/Zuarbeit/:id', (req, res, next) => {
  if (req.headers.authorization?.startsWith('Bearer ')) return requireAuth(req, res, next);
  return allowShareLink(req, res, next);
}, (req, res) => {
  if (req.sharedItem) return res.json(req.sharedItem);
  store.load(req.params.id, (err, obj) => {
    if (err || !obj) return res.status(404).json({ error: 'not found' });
    res.json(obj);
  });
});

// --- Einzelnes updaten: Manager ODER Share-Link ohne Token ---
app.put('/Zuarbeit/:id', (req, res, next) => {
  if (req.headers.authorization?.startsWith('Bearer ')) return requireAuth(req, res, next);
  return allowShareLink(req, res, next);
}, (req, res) => {
  const id = req.params.id;
  const obj = { ...req.body, id };
  store.add(obj, (err) => {
    if (err) return res.status(500).json({ error: String(err) });
    res.json(obj);
  });
});

// --- Anlegen & Löschen: nur Manager ---
app.post('/Zuarbeit', requireAuth, (req, res) => {
  const id = req.body.id || randomUUID();
  const obj = { ...req.body, id };
  store.add(obj, (err) => {
    if (err) return res.status(500).json({ error: String(err) });
    res.status(201).json(obj);
  });
});
app.delete('/Zuarbeit/:id', requireAuth, (req, res) => {
  store.remove(req.params.id, (err) => {
    if (err) return res.status(500).json({ error: String(err) });
    res.status(204).end();
  });
});

const PORT = 5050;
app.listen(PORT, () => console.log('🚀 File-API mit Rollen läuft: http://localhost:' + PORT));
