const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3001;

const CLIENT_ID = process.env.TUYA_CLIENT_ID || 'e8rtr5mjakwy3k5dwder';
const CLIENT_SECRET = process.env.TUYA_CLIENT_SECRET || '687851a4738047d98c1df4c41ee88232';
const BASE_URL = 'https://openapi.tuyaus.com';

app.use(cors());
app.use(express.json());

function hmac(secret, message) {
  return crypto.createHmac('sha256', secret).update(message).digest('hex').toUpperCase();
}

async function getToken() {
  const t = Date.now().toString();
  const sign = hmac(CLIENT_SECRET, CLIENT_ID + t);
  const res = await fetch(`${BASE_URL}/v1.0/token?grant_type=1`, {
    headers: { 'client_id': CLIENT_ID, 't': t, 'sign': sign, 'sign_method': 'HMAC-SHA256' }
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.msg || 'Auth failed');
  return data.result.access_token;
}

async function tuyaRequest(token, method, path, body = null) {
  const t = Date.now().toString();
  const sign = hmac(CLIENT_SECRET, CLIENT_ID + token + t);
  const opts = {
    method,
    headers: {
      'client_id': CLIENT_ID,
      'access_token': token,
      't': t,
      'sign': sign,
      'sign_method': 'HMAC-SHA256',
      'Content-Type': 'application/json'
    }
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE_URL}${path}`, opts);
  return res.json();
}

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'FTM Smart API online', version: '1.0.0' });
});

// Buscar dispositivos
app.get('/api/devices', async (req, res) => {
  try {
    const token = await getToken();
    let result = await tuyaRequest(token, 'GET', '/v1.0/iot-01/associated-users/devices?last_row_key=');
    if (!result.success || !result.result?.devices?.length) {
      result = await tuyaRequest(token, 'GET', '/v1.0/devices?page_size=50');
    }
    res.json(result);
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Status de um dispositivo
app.get('/api/devices/:id/status', async (req, res) => {
  try {
    const token = await getToken();
    const result = await tuyaRequest(token, 'GET', `/v1.0/devices/${req.params.id}/status`);
    res.json(result);
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Controlar dispositivo (ligar/desligar)
app.post('/api/devices/:id/commands', async (req, res) => {
  try {
    const token = await getToken();
    const result = await tuyaRequest(token, 'POST', `/v1.0/devices/${req.params.id}/commands`, req.body);
    res.json(result);
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Buscar cenas
app.get('/api/scenes', async (req, res) => {
  try {
    const token = await getToken();
    const result = await tuyaRequest(token, 'GET', '/v1.0/homes/scenes?page_size=20');
    res.json(result);
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Token (para debug)
app.get('/api/token', async (req, res) => {
  try {
    const token = await getToken();
    res.json({ success: true, token: token.slice(0, 10) + '...' });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`FTM Smart Backend rodando na porta ${PORT}`);
});
