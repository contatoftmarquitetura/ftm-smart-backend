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

function hmac(secret, msg) {
  return crypto.createHmac('sha256', secret).update(msg).digest('hex').toUpperCase();
}

function sha256(str) {
  return crypto.createHash('sha256').update(str || '').digest('hex');
}

function nonce() {
  return crypto.randomBytes(16).toString('hex');
}

// Assinatura v2.0 com nonce (projetos Custom)
function buildSignV2(clientId, secret, t, nonceStr, accessToken, method, path, body) {
  const bodyHash = sha256(body ? JSON.stringify(body) : '');
  const url = path.split('?')[0];
  const query = path.includes('?') ? path.split('?')[1] : '';
  
  // Headers canônicos vazios para requisições simples
  const signStr = [
    method.toUpperCase(),
    bodyHash,
    '',
    url
  ].join('\n');

  const toSign = accessToken
    ? clientId + accessToken + t + nonceStr + signStr
    : clientId + t + nonceStr + signStr;

  return hmac(secret, toSign);
}

async function getToken() {
  const t = Date.now().toString();
  const n = nonce();
  const sign = buildSignV2(CLIENT_ID, CLIENT_SECRET, t, n, '', 'GET', '/v1.0/token?grant_type=1', null);
  
  const res = await fetch(BASE + '/v1.0/token?grant_type=1', {
    headers: {
      'client_id': CLIENT_ID,
      't': t,
      'nonce': n,
      'sign': sign,
      'sign_method': 'HMAC-SHA256'
    }
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.msg || JSON.stringify(data));
  return data.result.access_token;
}

async function apiCall(tok, method, path, body) {
  const t = Date.now().toString();
  const n = nonce();
  const sign = buildSignV2(CLIENT_ID, CLIENT_SECRET, t, n, tok, method, path, body);
  
  const opts = {
    method,
    headers: {
      'client_id': CLIENT_ID,
      'access_token': tok,
      't': t,
      'nonce': n,
      'sign': sign,
      'sign_method': 'HMAC-SHA256',
      'Content-Type': 'application/json'
    }
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(BASE + path, opts);
  return res.json();
}

app.get('/', (req, res) => res.json({ status: 'FTM Smart API online', version: '11.0.0' }));

app.get('/api/debug', async (req, res) => {
  try {
    const tok = await getToken();
    const devices = await apiCall(tok, 'GET', '/v1.0/iot-01/associated-users/devices?last_row_key=');
    res.json({ token_ok: true, devices_success: devices.success, count: devices.result?.devices?.length || 0, msg: devices.msg, code: devices.code });
  } catch(e) {
    res.json({ token_err: e.message });
  }
});

app.get('/api/devices', async (req, res) => {
  try {
    const tok = await getToken();
    const r = await apiCall(tok, 'GET', '/v1.0/iot-01/associated-users/devices?last_row_key=');
    const devices = (r.success && r.result && r.result.devices) ? r.result.devices : [];
    res.json({ success: true, result: { devices }, count: devices.length });
  } catch(e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get('/api/homes', async (req, res) => {
  try {
    const tok = await getToken();
    const r = await apiCall(tok, 'GET', '/v1.0/homes?page_no=1&page_size=50');
    const homes = (r.success && r.result && r.result.homes) ? r.result.homes : [];
    res.json({ success: true, result: { homes }, count: homes.length });
  } catch(e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get('/api/homes/:id/devices', async (req, res) => {
  try {
    const tok = await getToken();
    const r = await apiCall(tok, 'GET', '/v1.0/homes/' + req.params.id + '/devices');
    const devices = (r.result && r.result.devices) ? r.result.devices : [];
    res.json({ success: true, result: { devices } });
  } catch(e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get('/api/devices/:id/status', async (req, res) => {
  try {
    const tok = await getToken();
    res.json(await apiCall(tok, 'GET', '/v1.0/devices/' + req.params.id + '/status'));
  } catch(e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/api/devices/:id/commands', async (req, res) => {
  try {
    const tok = await getToken();
    res.json(await apiCall(tok, 'POST', '/v1.0/devices/' + req.params.id + '/commands', req.body));
  } catch(e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, function() { console.log('FTM Smart v11 porta ' + PORT); });
