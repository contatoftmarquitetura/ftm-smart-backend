const express = require('express');
const cors = require('cors');
const { TuyaContext } = require('tuya-connector-nodejs');

const app = express();
app.use(cors());
app.use(express.json());

const context = new TuyaContext({
  baseUrl: 'https://openapi.tuyaus.com',
  accessKey: 'ypqahadefhscnexq9rw9',
  secretKey: '09d608801e714b2b8f6ec95fc25f0fb7',
});

app.get('/', (req, res) => res.json({ status: 'FTM Smart API online', version: '12.0.0' }));

app.get('/api/debug', async (req, res) => {
  try {
    const r = await context.request({ method: 'GET', path: '/v1.0/iot-01/associated-users/devices', query: { last_row_key: '' } });
    res.json({ success: r.success, count: r.result?.devices?.length || 0, result: r });
  } catch(e) {
    res.json({ error: e.message });
  }
});

app.get('/api/devices', async (req, res) => {
  try {
    const r = await context.request({ method: 'GET', path: '/v1.0/iot-01/associated-users/devices', query: { last_row_key: '' } });
    const devices = (r.success && r.result?.devices) ? r.result.devices : [];
    res.json({ success: true, result: { devices }, count: devices.length });
  } catch(e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get('/api/homes', async (req, res) => {
  try {
    const r = await context.request({ method: 'GET', path: '/v1.0/homes', query: { page_no: 1, page_size: 50 } });
    const homes = (r.success && r.result?.homes) ? r.result.homes : [];
    res.json({ success: true, result: { homes }, count: homes.length });
  } catch(e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get('/api/homes/:id/devices', async (req, res) => {
  try {
    const r = await context.request({ method: 'GET', path: `/v1.0/homes/${req.params.id}/devices` });
    const devices = r.result?.devices || [];
    res.json({ success: true, result: { devices } });
  } catch(e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get('/api/devices/:id/status', async (req, res) => {
  try {
    const r = await context.request({ method: 'GET', path: `/v1.0/devices/${req.params.id}/status` });
    res.json(r);
  } catch(e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/api/devices/:id/commands', async (req, res) => {
  try {
    const r = await context.request({ method: 'POST', path: `/v1.0/devices/${req.params.id}/commands`, body: req.body });
    res.json(r);
  } catch(e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log('FTM Smart v12 porta ' + PORT));
