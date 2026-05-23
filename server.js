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
  if (!data.success) throw new Error(data.msg || 'Auth failed: ' + JSON.stringify(data));
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

app.get('/', (req, res) => {
  res.json({ status: 'FTM Smart API online', version: '2.0.0' });
});

// DEBUG — mostra resposta crua de cada endpoint
app.get('/api/debug', async (req, res) => {
  try {
    const token = await getToken();
    const results = {};

    results.token_ok = true;

    // Testa endpoint 1
    try {
      results.ep1_associated = await tuyaRequest(token, 'GET', '/v1.0/iot-01/associated-users/devices?last_row_key=');
    } catch(e) { results.ep1_error = e.message; }

    // Testa endpoint 2 — listagem geral
    try {
      results.ep2_list = await tuyaRequest(token, 'GET', '/v1.0/devices?page_size=50');
    } catch(e) { results.ep2_error = e.message; }

    // Testa endpoint 3 — por UID do usuário
    try {
      results.ep3_uid = await tuyaRequest(token, 'GET', '/v1.0/users?page_no=1&page_size=10');
    } catch(e) { results.ep3_error = e.message; }

    // Testa dispositivo específico
    try {
      results.ep4_device = await tuyaRequest(token, 'GET', '/v1.0/devices/eb4ad3bf5249d492e5onnq');
    } catch(e) { results.ep4_error = e.message; }

    res.json(results);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// Buscar dispositivos
app.get('/api/devices', async (req, res) => {
  try {
    const token = await getToken();
    let devices = [];

    // Endpoint 1
    try {
      const r1 = await tuyaRequest(token, 'GET', '/v1.0/iot-01/associated-users/devices?last_row_key=');
      if (r1.success && r1.result?.devices?.length) devices = r1.result.devices;
    } catch(e) {}

    // Endpoint 2 — IDs fixos
    if (!devices.length) {
      const ids = [
        'eb4ad3bf5249d492e5onnq',
        'ebff2ff593e151d4b831os',
        'ebfbd7551f63cf95635nzm',
        'eb3036aa0c8917d7f22pd9',
        'eb5c8051a149084d5c8uhf',
        'eb95b69a116ad4c19dl9rx'
      ];
      const results = await Promise.allSettled(
        ids.map(id => tuyaRequest(token, 'GET', `/v1.0/devices/${id}`))
      );
      devices = results
        .filter(r => r.status === 'fulfilled' && r.value?.success && r.value?.result)
        .map(r => r.value.result);
    }

    // Endpoint 3 — listagem geral
    if (!devices.length) {
      const r3 = await tuyaRequest(token, 'GET', '/v1.0/devices?page_size=50');
      if (r3.success) devices = r3.result?.list || (Array.isArray(r3.result) ? r3.result : []);
    }

    res.json({ success: true, result: { devices }, count: devices.length });
  } catch(e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get('/api/devices/:id/status', async (req, res) => {
  try {
    const token = await getToken();
    const result = await tuyaRequest(token, 'GET', `/v1.0/devices/${req.params.id}/status`);
    res.json(result);
  } catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/api/devices/:id/commands', async (req, res) => {
  try {
    const token = await getToken();
    const result = await tuyaRequest(token, 'POST', `/v1.0/devices/${req.params.id}/commands`, req.body);
    res.json(result);
  } catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/api/token', async (req, res) => {
  try {
    const token = await getToken();
    res.json({ success: true, token: token.slice(0,10) + '...' });
  } catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

app.listen(PORT, () => console.log(`FTM Smart Backend v2 porta ${PORT}`));
