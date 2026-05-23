const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const fetch = require('node-fetch');

const app = express();
app.use(cors());
app.use(express.json());

const CLIENT_ID = 'ypqahadefhscnexq9rw9';
const CLIENT_SECRET = '09d608801e714b2b8f6ec95fc25f0fb7';
const BASE = 'https://openapi.tuyaus.com';

function sign(secret, msg) {
  return crypto.createHmac('sha256', secret).update(msg).digest('hex').toUpperCase();
}

async function token() {
  const t = Date.now().toString();
  const s = sign(CLIENT_SECRET, CLIENT_ID + t);
  const r = await fetch(BASE + '/v1.0/token?grant_type=1', {
    headers: { 'client_id': CLIENT_ID, 't': t, 'sign': s, 'sign_method': 'HMAC-SHA256' }
  });
  const d = await r.json();
  if (!d.success) throw new Error(d.msg || JSON.stringify(d));
  return d.result.access_token;
}

async function api(tok, method, path, body) {
  const t = Date.now().toString();
  const s = sign(CLIENT_SECRET, CLIENT_ID + tok + t);
  const opts = {
    method,
    headers: {
      'client_id': CLIENT_ID,
      'access_token': tok,
      't': t,
      'sign': s,
      'sign_method': 'HMAC-SHA256',
      'Content-Type': 'application/json'
    }
  };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(BASE + path, opts);
  return r.json();
}

app.get('/', (req, res) => res.json({ status: 'FTM Smart API online', version: '13.0.0' }));

app.get('/api/debug', async (req, res) => {
  try {
    const tok = await token();
    const r = await api(tok, 'GET', '/v1.0/iot-01/associated-users/devices?last_row_key=');
    res.json({ token_ok: true, success: r.success, code: r.code, msg: r.msg, count: r.result?.devices?.length || 0 });
  } catch(e) {
    res.json({ token_err: e.message });
  }
});

app.get('/api/devices', async (req, res) => {
  try {
    const tok = await token();
    const r = await api(tok, 'GET', '/v1.0/iot-01/associated-users/devices?last_row_key=');
    const devices = (r.success && r.result && r.result.devices) ? r.result.devices : [];
    res.json({ success: true, result: { devices }, count: devices.length });
  } catch(e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get('/api/homes', async (req, res) => {
  try {
    const tok = await token();
    const r = await api(tok, 'GET', '/v1.0/homes?page_no=1&page_size=50');
    const homes = (r.success && r.result && r.result.homes) ? r.result.homes : [];
    res.json({ success: true, result: { homes }, count: homes.length });
  } catch(e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get('/api/homes/:id/devices', async (req, res) => {
  try {
    const tok = await token();
    const r = await api(tok, 'GET', '/v1.0/homes/' + req.params.id + '/devices');
    const devices = (r.result && r.result.devices) ? r.result.devices : [];
    res.json({ success: true, result: { devices } });
  } catch(e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get('/api/devices/:id/status', async (req, res) => {
  try {
    const tok = await token();
    res.json(await api(tok, 'GET', '/v1.0/devices/' + req.params.id + '/status'));
  } catch(e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/api/devices/:id/commands', async (req, res) => {
  try {
    const tok = await token();
    res.json(await api(tok, 'POST', '/v1.0/devices/' + req.params.id + '/commands', req.body));
  } catch(e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, function() { console.log('FTM Smart v13 porta ' + PORT); });
