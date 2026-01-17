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

// Rate limiting middleware
app.use((req, res, next) => {
  const identifier = req.body.discordId || req.ip;
  const now = Date.now();
  
  if (!requestCounts.has(identifier)) {
    requestCounts.set(identifier, []);
  }
  
  const requests = requestCounts.get(identifier);
  const recentRequests = requests.filter(time => now - time < 60000);
  
  if (recentRequests.length >= 5) {
    return res.status(429).json({ 
      error: 'Demasiadas peticiones. Espera un minuto.' 
    });
  }
  
  recentRequests.push(now);
  requestCounts.set(identifier, recentRequests);
  
  // Limpiar datos antiguos cada 5 minutos
  if (Math.random() < 0.01) {
    for (const [key, times] of requestCounts.entries()) {
      const recent = times.filter(time => now - time < 60000);
      if (recent.length === 0) {
        requestCounts.delete(key);
      } else {
        requestCounts.set(key, recent);
      }
    }
  }
  
  next();
});

app.get('/', (req, res) => {
  res.json({ 
    status: 'API funcionando correctamente', 
    timestamp: new Date().toISOString() 
  });
});

app.post('/generate-code', (req, res) => {
  try {
    const { discordId, username } = req.body;
    
    if (!discordId || !username) {
      return res.status(400).json({ error: 'Faltan datos requeridos' });
    }
    
    // Verificar si el usuario ya tiene un código activo
    for (const [code, data] of activeCodes.entries()) {
      if (data.discordId === discordId && Date.now() < data.expiresAt) {
        return res.json({ code }); // Devolver el código existente
      }
    }
    
    const code = generateCode();
    const expiresAt = Date.now() + (5 * 60 * 1000);
    
    activeCodes.set(code, {
      discordId,
      username,
      expiresAt
    });
    
    setTimeout(() => {
      activeCodes.delete(code);
    }, 5 * 60 * 1000);
    
    console.log(`Código generado: ${code} para ${username} (${discordId})`);
    
    res.json({ code });
  } catch (error) {
    console.error('Error generando código:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

app.post('/validate-code', (req, res) => {
  try {
    const { code, playerName, playerId } = req.body;
    
    if (!code) {
      return res.status(400).json({ success: false, error: 'Código no proporcionado' });
    }
    
    const data = activeCodes.get(code);
    
    if (!data) {
      return res.json({ success: false, error: 'Código inválido o expirado' });
    }
    
    if (Date.now() > data.expiresAt) {
      activeCodes.delete(code);
      return res.json({ success: false, error: 'Código expirado' });
    }
    
    activeCodes.delete(code);
    
    console.log(`Código validado: ${code} - ${playerName} vinculado con ${data.username}`);
    
    res.json({
      success: true,
      discordId: data.discordId,
      discordUsername: data.username
    });
  } catch (error) {
    console.error('Error validando código:', error);
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
});

// Limpiar códigos expirados cada 1 minuto
setInterval(() => {
  const now = Date.now();
  for (const [code, data] of activeCodes.entries()) {
    if (now > data.expiresAt) {
      activeCodes.delete(code);
    }
  }
}, 60000);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`API corriendo en puerto ${PORT}`);
});