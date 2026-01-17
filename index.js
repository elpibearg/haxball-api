const express = require('express');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
app.use(express.json());
app.use(cors());

// ================== DATA ==================
const activeCodes = new Map();        // code -> { discordId, username, expiresAt }
const requestCounts = new Map();      // discordId -> [timestamps]

// ================== UTILS ==================
function generateCode() {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

// ================== RATE LIMIT (SOLO /generate-code) ==================
function rateLimit(req, res, next) {
  const discordId = req.body.discordId;
  if (!discordId) return next();

  const now = Date.now();

  if (!requestCounts.has(discordId)) {
    requestCounts.set(discordId, []);
  }

  let requests = requestCounts.get(discordId);

  // Evitar contar requests duplicadas muy cercanas (Discord / retries)
  if (!requests.some(t => now - t < 3000)) {
    requests.push(now);
  }

  // Mantener solo requests del último minuto
  requests = requests.filter(t => now - t < 60000);
  requestCounts.set(discordId, requests);

  // Límite realista
  if (requests.length > 10) {
    return res.status(429).json({
      error: 'Demasiadas peticiones'
    });
  }

  next();
}

// ================== HEALTH CHECK ==================
app.get('/', (_, res) => {
  res.json({
    status: 'API OK',
    timestamp: new Date().toISOString()
  });
});

// ================== GENERAR CÓDIGO ==================
app.post('/generate-code', rateLimit, (req, res) => {
  try {
    const { discordId, username } = req.body;

    if (!discordId || !username) {
      return res.status(400).json({
        error: 'Datos incompletos'
      });
    }

    // Si ya tiene un código válido, devolver el mismo
    for (const [code, data] of activeCodes.entries()) {
      if (data.discordId === discordId && Date.now() < data.expiresAt) {
        return res.json({ code });
      }
    }

    const code = generateCode();
    const expiresAt = Date.now() + 5 * 60 * 1000;

    activeCodes.set(code, {
      discordId,
      username,
      expiresAt
    });

    setTimeout(() => {
      activeCodes.delete(code);
    }, 5 * 60 * 1000);

    console.log(`Código generado: ${code} para ${username}`);
    res.json({ code });

  } catch (err) {
    console.error('Error generando código:', err);
    res.status(500).json({
      error: 'Error interno'
    });
  }
});

// ================== VALIDAR CÓDIGO ==================
app.post('/validate-code', (req, res) => {
  try {
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({
        success: false,
        error: 'Código no proporcionado'
      });
    }

    const data = activeCodes.get(code);

    if (!data) {
      return res.json({
        success: false,
        error: 'Código inválido o expirado'
      });
    }

    if (Date.now() > data.expiresAt) {
      activeCodes.delete(code);
      return res.json({
        success: false,
        error: 'Código expirado'
      });
    }

    activeCodes.delete(code);

    console.log(`Código validado: ${code}`);

    res.json({
      success: true,
      discordId: data.discordId,
      discordUsername: data.username
    });

  } catch (err) {
    console.error('Error validando código:', err);
    res.status(500).json({
      success: false,
      error: 'Error interno'
    });
  }
});

// ================== LIMPIEZA AUTOMÁTICA ==================
setInterval(() => {
  const now = Date.now();
  for (const [code, data] of activeCodes.entries()) {
    if (now > data.expiresAt) {
      activeCodes.delete(code);
    }
  }
}, 60000);

// ================== SERVER ==================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`API corriendo en puerto ${PORT}`);
});
