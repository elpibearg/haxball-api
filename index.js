const express = require('express');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
app.use(express.json());
app.use(cors());

const activeCodes = new Map();

function generateCode() {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

app.get('/', (req, res) => {
  res.json({ status: 'API funcionando correctamente', timestamp: new Date().toISOString() });
});

app.post('/generate-code', (req, res) => {
  try {
    const { discordId, username } = req.body;
    
    if (!discordId || !username) {
      return res.status(400).json({ error: 'Faltan datos requeridos' });
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`API corriendo en puerto ${PORT}`);
});