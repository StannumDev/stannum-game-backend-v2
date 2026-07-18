# STANNUM Game — MCP (read-only)

Servidor **MCP read-only** del backend del STANNUM Game. Expone consultas del
Game (usuarios, progreso, programas, stats, feedback in-app y —vía el escape
hatch `game_request`— cualquier GET de la API) a clientes MCP como **Claude Code**
y Claude Desktop.

Vive dentro del repo del backend (`mcp/`), es self-contained (su propio
`package.json` / `tsconfig` / `node_modules`) y **no importa código del backend**:
habla con la REST API por HTTP usando el service token `x-api-key` que ya existe.
Read-only por diseño — no hay ninguna tool que escriba, y el escape hatch está
restringido a GET + al host de la API.

## Tools

| Tool | Qué hace |
|---|---|
| `game_get_user` | Un usuario por email o username (perfil, nivel/XP, coins, streak, progreso por programa). |
| `game_search_users` | Lista/paginado de usuarios con filtros (empresa, búsqueda). |
| `game_list_enterprises` | Empresas registradas (distinct). |
| `game_list_programs` | Catálogo de programas (`full=true` → árbol completo). |
| `game_get_program` | Un programa con secciones/módulos/lessons/instructions. |
| `game_stats` | Métricas agregadas (usuarios activos, distribución de nivel, stats por programa). |
| `game_list_feedback` | Feedback in-app / crash reports (filtros por tipo, fecha, resuelto). |
| `game_feedback_stats` | Stats agregadas de feedback. |
| `game_list_orders` | Órdenes B2C / regalos (MercadoPago): montos, estado, IDs MP. |
| `game_list_coupons` | Cupones de descuento (tipo, valor, límites, validez). |
| `game_list_subscription_payments` | Pagos de suscripción (trenno_ia): monto, estado, MP id. |
| `game_list_subscription_audit` | Log de cambios de estado de suscripciones. |
| `game_list_prompts` | Biblioteca comunitaria de prompts (autor, métricas, verificación). |
| `game_list_assistants` | Biblioteca comunitaria de asistentes / GPTs. |
| `game_request` | Escape hatch: cualquier **GET** de la API, host-locked. |

Total: **15 tools**, todas read-only.

Todas anotadas `readOnlyHint: true`.

## Variables de entorno

| Env | Requerida | Descripción |
|---|---|---|
| `GAME_API_URL` | no | Base de la API. Default: producción Railway (`.../api`). |
| `GAME_API_KEY` | **sí** | El `x-api-key` del backend (`MAKE_API_KEY`). El MCP lee con este token. |
| `MCP_GATE_KEY` | **sí (HTTP)** | Secreto compartido que consume el cliente MCP (Nico). **Distinto** de `GAME_API_KEY`, ≥16 chars, rotable. Sin él el router HTTP no monta (fail-closed). |
| `MCP_MAX_SESSIONS` | no | Máx. sesiones HTTP concurrentes (default 50). |
| `MCP_SESSION_TTL_MS` | no | TTL de sesión idle (default 30 min). |

## Build

```bash
cd mcp
npm install
npm run build   # → dist/
```

## Deploy (HTTP remoto, montado en el backend — modo primario)

Ya está cableado en `src/index.js` del backend, dentro del `mongoose.connect().then()`,
detrás del flag `MCP_ENABLED`. Como la carpeta `mcp/` es ESM (`"type": "module"`) y el
backend es CommonJS, se monta con **import dinámico**:

```js
if (process.env.MCP_ENABLED === "true") {
  // GAME_API_KEY ← MAKE_API_KEY y GAME_API_URL ← http://127.0.0.1:PORT/api por default
  const { createMcpRouter } = await import("../mcp/dist/http.js");
  app.use("/mcp", createMcpRouter());
}
```

Cuando corre en el mismo proceso, el MCP se llama a sí mismo por `127.0.0.1:PORT/api`
(loopback) reusando el `MAKE_API_KEY` existente — no hace falta setear `GAME_API_URL`
ni `GAME_API_KEY` aparte. Los fallos al montar se logean y **no** impiden que la API
arranque.

### Pasos de deploy en Railway

1. `cd mcp && npm install && npm run build` como parte del build del backend
   (agregar `postinstall` o build step: `npm --prefix mcp install && npm --prefix mcp run build`).
2. Envs del servicio: `MCP_ENABLED=true`, `MCP_GATE_KEY=<secreto ≥16 chars>`.
   (`MAKE_API_KEY` ya existe.)
3. Redeploy. Log esperado: `STANNUM Game MCP mounted at /mcp`.

## Alta para Nico (Claude Code + VSCode)

Pasarle **por canal seguro** (no chat abierto) el `MCP_GATE_KEY`. Después:

```bash
claude mcp add --transport http stannum-game \
  https://<backend>.up.railway.app/mcp \
  --header "x-mcp-key: <MCP_GATE_KEY>"
```

Verificar la conexión desde Claude Code: pedirle `game_stats` o `game_list_programs`.

### Uso local (stdio, dev/interno)

```bash
claude mcp add stannum-game \
  --env GAME_API_URL=https://<backend>.up.railway.app/api \
  --env GAME_API_KEY=<x-api-key> \
  -- node /ruta/al/repo/mcp/dist/index.js
```

## Debug

```bash
npx @modelcontextprotocol/inspector node dist/index.js
```
