const express = require('express');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
app.use(express.json());
app.use(cors());

const activeCodes = new Map();
const requestCounts = new Map();

function generateCode() {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

// ===== RATE LIMIT SUAVE =====
app.use((req, res, next) => {
  const identifier = req.body.discordId || req.ip;
  const now = Date.now();

  if (!requestCounts.has(identifier)) {
    requestCounts.set(identifier, []);
  }

  let requests = requestCounts.get(identifier);

  // Solo contamos si no hubo request en los últimos 3s
  if (!requests.some(t => now - t < 3000)) {
    requests.push(now);
  }

  requests = requests.filter(t => now - t < 60000);
  requestCounts.set(identifier, requests);

  if (requests.length > 10) {
    return res.status(429).json({
      error: 'Demasiadas peticiones, esperá un momento'
    });
  }

  next();
});

app.get('/', (_, res) => {
  res.json({ status: 'API OK', time: new Date().toISOString() });
});

app.post('/generate-code', (req, res) => {
  const { discordId, username } = req.body;
  if (!discordId || !username) {
    return res.status(400).json({ error: 'Datos incompletos' });
  }

  for (const [code, data] of activeCodes.entries()) {
    if (data.discordId === discordId && Date.now() < data.expiresAt) {
      return res.json({ code });
    }
  }

  const code = generateCode();
  const expiresAt = Date.now() + 5 * 60 * 1000;

  activeCodes.set(code, { discordId, username, expiresAt });

  setTimeout(() => activeCodes.delete(code), 5 * 60 * 1000);

  console.log(`Código ${code} para ${username}`);
  res.json({ code });
});

app.post('/validate-code', (req, res) => {
  const { code } = req.body;
  const data = activeCodes.get(code);

  if (!data) {
    return res.json({ success: false, error: 'Código inválido o expirado' });
  }

  if (Date.now() > data.expiresAt) {
    activeCodes.delete(code);
    return res.json({ success: false, error: 'Código expirado' });
  }

  activeCodes.delete(code);

  res.json({
    success: true,
    discordId: data.discordId,
    discordUsername: data.username
  });
});

setInterval(() => {
  const now = Date.now();
  for (const [code, data] of activeCodes.entries()) {
    if (now > data.expiresAt) activeCodes.delete(code);
  }
}, 60000);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`API corriendo en ${PORT}`));
