const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3001;

const CLIENT_ID = 'e8rtr5mjakwy3k5dwder';
const CLIENT_SECRET = '687851a4738047d98c1df4c41ee88232';
const BASE_URL = 'https://openapi.tuyaus.com';

// UID do usuário SmartLife (contato.ftmarquitetura@gmail.com)
// Será descoberto automaticamente no primeiro login
let CACHED_UID = null;

app.use(cors());
app.use(express.json());

function hmac(secret, msg) {
  return crypto.createHmac('sha256', secret).update(msg).digest('hex').toUpperCase();
}

function sha256(content) {
  return crypto.createHash('sha256').update(content || '').digest('hex');
}

// Token de cliente (sem usuário) — para buscar UID
async function getClientToken() {
  const t = Date.now().toString();
  const sign = hmac(CLIENT_SECRET, CLIENT_ID + t);
  const res = await fetch(`${BASE_URL}/v1.0/token?grant_type=1`, {
    headers: { 'client_id': CLIENT_ID, 't': t, 'sign': sign, 'sign_method': 'HMAC-SHA256' }
  });
  const data = await res.json();
  if (!data.success) throw new Error('Token falhou: ' + JSON.stringify(data));
  return data.result.access_token;
}

// Requisição autenticada
async function tuyaRequest(token, method, path, body = null) {
  const t = Date.now().toString();
  const bodyStr = body ? JSON.stringify(body) : '';
  const contentHash = sha256(bodyStr);
  const headers = { 'client_id': CLIENT_ID, 'access_token': token, 't': t, 'sign_method': 'HMAC-SHA256', 'Content-Type': 'application/json' };
  
  // Tenta assinatura simples primeiro
  const signSimple = hmac(CLIENT_SECRET, CLIENT_ID + token + t);
  headers.sign = signSimple;

  const opts = { method, headers };
  if (body) opts.body = bodyStr;
  const res = await fetch(`${BASE_URL}${path}`, opts);
  const data = await res.json();
  
  // Se falhar com sign invalid, tenta assinatura completa
  if (!data.success && data.code === 1004) {
    const stringToSign = [method.toUpperCase(), contentHash, '', path.split('?')[0]].join('\n');
    const signFull = hmac(CLIENT_SECRET, CLIENT_ID + token + t + stringToSign);
    headers.sign = signFull;
    const res2 = await fetch(`${BASE_URL}${path}`, { method, headers, body: body ? bodyStr : undefined });
    return res2.json();
  }
  return data;
}

// Busca UID do usuário via endpoint de usuários associados
async function getUserUID(token) {
  if (CACHED_UID) return CACHED_UID;
  try {
    const r = await tuyaRequest(token, 'GET', '/v1.0/iot-01/associated-users/devices?last_row_key=&page_size=1');
    if (r.success && r.result?.devices?.[0]) {
      // Dispositivos têm o uid do dono
      const uid = r.result.devices[0].uid || r.result.devices[0].owner_id;
      if (uid) { CACHED_UID = uid; return uid; }
    }
  } catch(e) {}
  return null;
}

app.get('/', (req, res) => res.json({ status: 'FTM Smart API online', version: '7.0.0' }));

app.get('/api/debug', async (req, res) => {
  const out = { local_time: Date.now() };
  try {
    const token = await getClientToken();
    out.token_ok = true;
    out.token = token.slice(0,10)+'...';

    // Testa todos os endpoints possíveis
    const endpoints = [
      '/v1.0/iot-01/associated-users/devices?last_row_key=',
      '/v1.0/devices?page_size=10',
      '/v1.0/homes?page_no=1&page_size=10',
      '/v1.0/family?page_no=1&page_size=10',
    ];
    
    for (const ep of endpoints) {
      try {
        const r = await tuyaRequest(token, 'GET', ep);
        out[ep.split('?')[0].split('/').pop()] = { success: r.success, code: r.code, msg: r.msg, has_data: !!(r.result) };
      } catch(e) {
        out[ep.split('?')[0].split('/').pop()+'_err'] = e.message;
      }
    }
    
    // Testa dispositivo direto
    try {
      const r = await tuyaRequest(token, 'GET', '/v1.0/devices/eb4ad3bf5249d492e5onnq');
      out.device_direct = { success: r.success, code: r.code, msg: r.msg };
    } catch(e) { out.device_direct_err = e.message; }

  } catch(e) { out.token_err = e.message; }
  res.json(out);
});

app.get('/api/devices', async (req, res) => {
  try {
    const token = await getClientToken();
    let devices = [];

    // Endpoint 1 — associados SmartLife
    try {
      const r = await tuyaRequest(token, 'GET', '/v1.0/iot-01/associated-users/devices?last_row_key=');
      if (r.success && r.result?.devices?.length) devices = r.result.devices;
    } catch(e) {}

    // Endpoint 2 — por IDs fixos conhecidos
    if (!devices.length) {
      const ids = [
        'eb4ad3bf5249d492e5onnq',
        'ebff2ff593e151d4b831os',
        'ebfbd7551f63cf95635nzm',
        'eb3036aa0c8917d7f22pd9',
        'eb5c8051a149084d5c8uhf',
        'eb95b69a116ad4c19dl9rx'
      ];
      const settled = await Promise.allSettled(
        ids.map(id => tuyaRequest(token, 'GET', `/v1.0/devices/${id}`))
      );
      devices = settled
        .filter(r => r.status==='fulfilled' && r.value?.success && r.value?.result)
        .map(r => r.value.result);
    }

    res.json({ success: true, result: { devices }, count: devices.length });
  } catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/api/homes', async (req, res) => {
  try {
    const token = await getClientToken();
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
    const token = await getClientToken();
    const r = await tuyaRequest(token, 'GET', `/v1.0/homes/${req.params.homeId}/devices`);
    const devices = r.result?.devices || r.result || [];
    res.json({ success: true, result: { devices }, count: devices.length });
  } catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/api/devices/:id/status', async (req, res) => {
  try {
    const token = await getClientToken();
    const r = await tuyaRequest(token, 'GET', `/v1.0/devices/${req.params.id}/status`);
    res.json(r);
  } catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/api/devices/:id/commands', async (req, res) => {
  try {
    const token = await getClientToken();
    const r = await tuyaRequest(token, 'POST', `/v1.0/devices/${req.params.id}/commands`, req.body);
    res.json(r);
  } catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

app.listen(PORT, () => console.log(`FTM Smart v7 porta ${PORT}`));
