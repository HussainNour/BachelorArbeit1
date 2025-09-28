// server/jfs-server.js
const express = require('express');
const cors = require('cors');
const Store = require('json-fs-store');
const { randomUUID } = require('crypto');

const app = express();
app.use(cors());
app.use(express.json());

const store = Store('data/Zuarbeit'); // legt Dateien unter ./data/Zuarbeit/<id>.json ab

// Alle lesen
app.get('/Zuarbeit', (req, res) => {
  store.list((err, objs) => {
    if (err) return res.status(500).json({ error: String(err) });
    res.json(objs);
  });
});

// Einzeln lesen
app.get('/Zuarbeit/:id', (req, res) => {
  store.load(req.params.id, (err, obj) => {
    if (err || !obj) return res.status(404).json({ error: 'not found' });
    res.json(obj);
  });
});

// Anlegen (neue ID)
app.post('/Zuarbeit', (req, res) => {
  const id = req.body.id || randomUUID();
  const obj = { ...req.body, id };
  store.add(obj, (err) => {
    if (err) return res.status(500).json({ error: String(err) });
    res.status(201).json(obj);
  });
});

// Aktualisieren (ID bleibt gleich)
app.put('/Zuarbeit/:id', (req, res) => {
  const id = req.params.id;
  const obj = { ...req.body, id }; // ID festschreiben
  store.add(obj, (err) => {
    if (err) return res.status(500).json({ error: String(err) });
    res.json(obj);
  });
});

// Löschen
app.delete('/Zuarbeit/:id', (req, res) => {
  store.remove(req.params.id, (err) => {
    if (err) return res.status(500).json({ error: String(err) });
    res.status(204).end();
  });
});

const PORT = 5050;
app.listen(PORT, () => console.log('File-API läuft auf http://localhost:' + PORT));
