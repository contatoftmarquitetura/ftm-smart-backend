const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3001;

const CLIENT_ID = 'ypqahadefhscnexq9rw9';
const CLIENT_SECRET = '09d608801e714b2b8f6ec95fc25f0fb7';
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
  if (!data.success) throw new Error(data.msg || JSON.stringify(data));
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

app.get('/', (req, res) => res.json({ status: 'FTM Smart API online', version: '9.0.0' }));

app.get('/api/debug', async (req, res) => {
  const out = {};
  try {
    const token = await getToken();
    out.token_ok = true;
    out.token = token.slice(0,10)+'...';
    try { out.devices = await tuyaRequest(token, 'GET', '/v1.0/iot-01/associated-users/devices?last_row_key='); } catch(e) { out.devices_err = e.message; }
    try { out.homes = await tuyaRequest(token, 'GET', '/v1.0/homes?page_no=1&page_size=20'); } catch(e) { out.homes_err = e.message; }
  } catch(e) { out.token_err = e.message; }
  res.json(out);
});

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

    res.json({ success: true, result: { devices }, count: devices.length });
  } catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/api/homes', async (req, res) => {
  try {
    const token = await getToken();
    let homes = [];
    try {
      const r = await tuyaRequest(token, 'GET', '/v1.0/homes?page_no=1&page_size=50');
      if (r.success) homes = r.result?.homes || [];
    } catch(e) {}
    res.json({ success: true, result: { homes }, count: homes.length });
  } catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/api/homes/:homeId/devices', async (req, res) => {
  try {
    const token = await getToken();
    const r = await tuyaRequest(token, 'GET', `/v1.0/homes/${req.params.homeId}/devices`);
    const devices = r.result?.devices || r.result || [];
    res.json({ success: true, result: { devices }, count: devices.length });
  } catch(e) { res.status(500).json({ success: false, error: e.message }); }
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

app.listen(PORT, () => console.log(`FTM Smart v9 porta ${PORT}`));
