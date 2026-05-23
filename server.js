const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3001;

const CLIENT_ID = 'e8rtr5mjakwy3k5dwder';
const CLIENT_SECRET = '687851a4738047d98c1df4c41ee88232';
const BASE_URL = 'https://openapi.tuyaus.com';

app.use(cors());
app.use(express.json());

function hmac256(secret, message) {
  return crypto.createHmac('sha256', secret).update(message).digest('hex').toUpperCase();
}
function sha256(content) {
  return crypto.createHash('sha256').update(content || '').digest('hex');
}
function buildSign(clientId, secret, t, token, method, path, body) {
  const contentHash = sha256(body ? JSON.stringify(body) : '');
  const stringToSign = [method, contentHash, '', path.split('?')[0]].join('\n');
  const signStr = token ? clientId + token + t + stringToSign : clientId + t + stringToSign;
  return hmac256(secret, signStr);
}

async function getToken() {
  const t = Date.now().toString();
  const path = '/v1.0/token?grant_type=1';
  const sign = buildSign(CLIENT_ID, CLIENT_SECRET, t, '', 'GET', path, null);
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'client_id': CLIENT_ID, 't': t, 'sign': sign, 'sign_method': 'HMAC-SHA256' }
  });
  const data = await res.json();
  if (!data.success) throw new Error('Auth failed: ' + JSON.stringify(data));
  return data.result.access_token;
}

async function tuyaGet(token, path) {
  const t = Date.now().toString();
  const sign = buildSign(CLIENT_ID, CLIENT_SECRET, t, token, 'GET', path, null);
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'client_id': CLIENT_ID, 'access_token': token, 't': t, 'sign': sign, 'sign_method': 'HMAC-SHA256' }
  });
  return res.json();
}

async function tuyaPost(token, path, body) {
  const t = Date.now().toString();
  const sign = buildSign(CLIENT_ID, CLIENT_SECRET, t, token, 'POST', path, body);
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'client_id': CLIENT_ID, 'access_token': token, 't': t, 'sign': sign, 'sign_method': 'HMAC-SHA256', 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return res.json();
}

// Health
app.get('/', (req, res) => res.json({ status: 'FTM Smart API online', version: '4.0.0' }));

// ── CASAS (Homes) ──────────────────────────────────────
// Lista todas as casas do SmartLife
app.get('/api/homes', async (req, res) => {
  try {
    const token = await getToken();
    // Busca o UID do usuário primeiro
    const userRes = await tuyaGet(token, '/v1.0/iot-01/associated-users/devices?last_row_key=');
    
    // Tenta endpoint de homes diretamente
    let homes = [];
    try {
      const r = await tuyaGet(token, '/v1.0/homes?page_no=1&page_size=50');
      if (r.success && r.result?.homes) homes = r.result.homes;
      else if (r.success && Array.isArray(r.result)) homes = r.result;
    } catch(e) {}

    // Fallback: endpoint alternativo
    if (!homes.length) {
      try {
        const r2 = await tuyaGet(token, '/v1.0/family?page_no=1&page_size=50');
        if (r2.success) homes = r2.result?.families || r2.result?.homes || [];
      } catch(e) {}
    }

    res.json({ success: true, result: { homes }, count: homes.length });
  } catch(e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Dispositivos de uma casa específica
app.get('/api/homes/:homeId/devices', async (req, res) => {
  try {
    const token = await getToken();
    const { homeId } = req.params;
    let devices = [];

    try {
      const r = await tuyaGet(token, `/v1.0/homes/${homeId}/devices`);
      if (r.success) devices = r.result?.devices || r.result || [];
    } catch(e) {}

    if (!devices.length) {
      try {
        const r2 = await tuyaGet(token, `/v1.0/family/${homeId}/devices`);
        if (r2.success) devices = r2.result?.devices || r2.result || [];
      } catch(e) {}
    }

    res.json({ success: true, result: { devices }, count: devices.length });
  } catch(e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── DISPOSITIVOS ───────────────────────────────────────
app.get('/api/devices', async (req, res) => {
  try {
    const token = await getToken();
    let devices = [];

    try {
      const r1 = await tuyaGet(token, '/v1.0/iot-01/associated-users/devices?last_row_key=');
      if (r1.success && r1.result?.devices?.length) devices = r1.result.devices;
    } catch(e) {}

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
        ids.map(id => tuyaGet(token, `/v1.0/devices/${id}`))
      );
      devices = results
        .filter(r => r.status === 'fulfilled' && r.value?.success && r.value?.result)
        .map(r => r.value.result);
    }

    res.json({ success: true, result: { devices }, count: devices.length });
  } catch(e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get('/api/devices/:id/status', async (req, res) => {
  try {
    const token = await getToken();
    const result = await tuyaGet(token, `/v1.0/devices/${req.params.id}/status`);
    res.json(result);
  } catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/api/devices/:id/commands', async (req, res) => {
  try {
    const token = await getToken();
    const result = await tuyaPost(token, `/v1.0/devices/${req.params.id}/commands`, req.body);
    res.json(result);
  } catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

// Debug
app.get('/api/debug', async (req, res) => {
  const out = {};
  try {
    const token = await getToken();
    out.token_ok = true;
    out.token = token.slice(0,12)+'...';
    try { out.homes = await tuyaGet(token, '/v1.0/homes?page_no=1&page_size=50'); } catch(e) { out.homes_err = e.message; }
    try { out.family = await tuyaGet(token, '/v1.0/family?page_no=1&page_size=50'); } catch(e) { out.family_err = e.message; }
    try { out.devices = await tuyaGet(token, '/v1.0/iot-01/associated-users/devices?last_row_key='); } catch(e) { out.devices_err = e.message; }
  } catch(e) { out.token_err = e.message; }
  res.json(out);
});

app.listen(PORT, () => console.log(`FTM Smart v4 porta ${PORT}`));
