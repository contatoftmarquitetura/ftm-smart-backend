# FTM Smart Backend

Backend proxy para a Tuya Cloud API — resolve CORS para o painel web FTM Smart.

## Deploy no Render.com

1. Faça upload deste repositório no GitHub
2. Acesse render.com → New Web Service → conecte o repositório
3. Configurações:
   - Build Command: `npm install`
   - Start Command: `node server.js`
   - Environment: Node

## Endpoints

- `GET /` — health check
- `GET /api/devices` — lista todos os dispositivos
- `GET /api/devices/:id/status` — status do dispositivo
- `POST /api/devices/:id/commands` — controlar dispositivo
- `GET /api/scenes` — listar cenas
- `GET /api/token` — testar autenticação
