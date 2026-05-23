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
  return crypto.createHash('sha256').update(content).digest('hex');
}

// Assinatura correta conforme documentação Tuya v1.0
function buildSign(clientId, secret, t, token, method, path, body) {
  const contentHash = sha256(body ? JSON.stringify(body) : '');
  const stringToSign = [method, contentHash, '', path].join('\n');
  const signStr = token
    ? clientId + token + t + stringToSign
    : clientId + t + stringToSign;
  return hmac256(secret, signStr);
}

async function getToken() {
  const t = Date.now().toString();
  const path = '/v1.0/token?grant_type=1';
  const sign = buildSign(CLIENT_ID, CLIENT_SECRET, t, '', 'GET', path, null);
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      'client_id': CLIENT_ID,
      't': t,
      'sign': sign,
      'sign_method': 'HMAC-SHA256',
      'mode': 'cors'
    }
  });
  const data = await res.json();
  if (!data.success) throw new Error('Auth failed: ' + JSON.stringify(data));
  return data.result.access_token;
}

async function tuyaRequest(token, method, path, body = null) {
  const t = Date.now().toString();
  const sign = buildSign(CLIENT_ID, CLIENT_SECRET, t, token, method, path.split('?')[0], body);
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
  res.json({ status: 'FTM Smart API online', version: '3.0.0' });
});

// Debug completo
app.get('/api/debug', async (req, res) => {
  const out = {};
  try {
    const token = await getToken();
    out.token = token.slice(0, 12) + '...';
    out.token_ok = true;

    try {
      out.ep1 = await tuyaRequest(token, 'GET', '/v1.0/iot-01/associated-users/devices?last_row_key=');
    } catch(e) { out.ep1_err = e.message; }

    try {
      out.ep2 = await tuyaRequest(token, 'GET', '/v1.0/devices?page_size=50');
    } catch(e) { out.ep2_err = e.message; }

    try {
      out.ep3 = await tuyaRequest(token, 'GET', '/v1.0/devices/eb4ad3bf5249d492e5onnq');
    } catch(e) { out.ep3_err = e.message; }

  } catch(e) {
    out.token_err = e.message;
  }
  res.json(out);
});

// Dispositivos
app.get('/api/devices', async (req, res) => {
  try {
    const token = await getToken();
    let devices = [];

    try {
      const r1 = await tuyaRequest(token, 'GET', '/v1.0/iot-01/associated-users/devices?last_row_key=');
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
        ids.map(id => tuyaRequest(token, 'GET', `/v1.0/devices/${id}`))
      );
      devices = results
        .filter(r => r.status === 'fulfilled' && r.value?.success && r.value?.result)
        .map(r => r.value.result);
    }

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

app.listen(PORT, () => console.log(`FTM Smart v3 porta ${PORT}`));
