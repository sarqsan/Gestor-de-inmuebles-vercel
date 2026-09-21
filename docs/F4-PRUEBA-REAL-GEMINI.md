# §6 F4 · Procedimiento de validación REAL de Gemini (ejecutar FUERA de Arena)

> Estado a 2026-09-21: **GEMINI REAL = NO VALIDADO EN ARENA.** El sandbox de Arena no
> tiene red hacia Google; ninguna llamada real se ha realizado. Este documento deja el
> procedimiento mínimo para hacerla en un entorno con `GEMINI_API_KEY` y conectividad.
> No afirma que Gemini funcione: eso solo se podrá afirmar cuando exista una respuesta
> real del proveedor registrada en la tabla final de este documento.

## 1. Qué se prueba (y qué no)

Circuito: `AsistentePanel → POST /api/asistente/interpretar → Gemini (gemini-3.7-flash)
→ parseo → validarResolucionIA (determinista) → AIIntentResolution → confirmación si
procede → ejecución por el host`.

- El servidor **no** recibe la clave del cliente, **no** recibe códigos de permiso, **no**
  ejecuta capacidades ni toca Firestore. Solo devuelve una `PropuestaIA` en JSON.
- Aunque Gemini falle o responda mal, el cliente **degrada al resolutor local** y lo
  muestra como «modo local» con el aviso correspondiente. Una respuesta local **nunca**
  aparece con `proveedor: "gemini"` / `origen: "IA"`.
- Lo que se valida aquí es únicamente la **calidad de la interpretación** de Gemini y la
  integridad del transporte. La seguridad no depende de Gemini (está cubierta por los
  tests F4, 29).

## 2. Requisitos del entorno externo

1. Node 22, `npm ci`.
2. `GEMINI_API_KEY` como **variable de entorno o secreto** (nunca en el repositorio ni en
   `.env` versionado; `.env*` está en `.gitignore`, salvo `.env.example`).
3. Acceso de red a `generativelanguage.googleapis.com`.
4. Aplicación en marcha con el mismo servidor Express que en producción:
   - Desarrollo: `GEMINI_API_KEY=… npm run dev` (puerto 3000, Vite en middleware).
   - Producción local: `npm run build && GEMINI_API_KEY=… NODE_ENV=production npm start`.
   - Vercel: la variable debe estar definida en el proyecto; el endpoint se sirve desde
     `api/index.ts` (no hace falta nada más). **No desplegar solo para esta prueba si no
     estaba previsto.**

Comprobación previa (sin Gemini): sin clave, el endpoint debe responder
`{"disponible":false,"proveedor":"gemini","modelo":"gemini-3.7-flash"}` con HTTP 200.
Con clave configurada pero sin red, responde HTTP 502 `{"error":"PROVEEDOR_ERROR"}`
(comprobado en Arena; la clave no aparece ni en la respuesta ni en el log).

## 3. Paso A — endpoint aislado (curl)

Confirma que la clave llega al servidor y que Gemini responde con el esquema. Cuerpo
idéntico al que envía el cliente (`cuerpoDesdeRequest`): sin permisos, solo catálogo.

```bash
curl -s -X POST http://localhost:3000/api/asistente/interpretar \
  -H 'content-type: application/json' -d '{
  "input": "Quiero ir a Tesorería.",
  "host": "ERP", "module": "inicio", "section": "inicio", "role": "ADMINISTRADOR",
  "capabilities": [
    {"id":"cap.ayuda.explicar","descripcion":"Explicar un concepto o pantalla del ERP","module":"ayuda","tipo":"AYUDA","parametros":["helpEntryId"]},
    {"id":"cap.ayuda.tutorial","descripcion":"Iniciar un tutorial guiado","module":"ayuda","tipo":"AYUDA","parametros":["tutorialId"]},
    {"id":"cap.navegacion.ir","descripcion":"Ir a una pantalla accesible","module":"inicio","tipo":"NAVEGACION","parametros":["route"]},
    {"id":"cap.inmuebles.consultar","descripcion":"Consultar inmuebles","module":"inmuebles","tipo":"CONSULTA"},
    {"id":"cap.tesoreria.consultar","descripcion":"Consultar liquidaciones y movimientos de tesorería","module":"tesoreria","tipo":"CONSULTA"},
    {"id":"cap.tesoreria.pagar","descripcion":"Registrar pagos","module":"tesoreria","tipo":"ESCRITURA"}
  ],
  "helpEntries": [{"id":"ayuda.tesoreria.liquidaciones","title":"Liquidaciones a propietarios (Tesorería)"}],
  "tutorials": [],
  "routes": ["inicio","inmuebles","tesoreria","ayuda"]
}'
```

Respuesta esperada (forma; los valores los decide el modelo):

```json
{"disponible":true,"proveedor":"gemini","modelo":"gemini-3.7-flash",
 "propuesta":{"intencion":"NAVEGAR","capabilityId":"cap.tesoreria.consultar","parametros":{},"alternativas":[],"confianza":0.9,"explicacion":"…"}}
```

Si `propuesta` es `null` con `error: "RESPUESTA_NO_PARSEABLE"`, Gemini no devolvió JSON
utilizable → anotar y revisar el prompt (`construirPromptAsistente`). Si el modelo
`gemini-3.7-flash` no existe en la cuenta, la respuesta será 502 `PROVEEDOR_ERROR` con el
detalle en el log del servidor: **no cambiar el modelo desde Arena**; es una decisión de
configuración canónica (`server.ts`).

## 4. Paso B — circuito completo desde la UI

Iniciar sesión en la aplicación con un usuario **ADMINISTRADOR** (casos 1–3 y 5) y con un
**INQUILINO con contrato activo** en el Portal (caso 4). Abrir el botón «Asistente»
(icono de destellos en la cabecera / barra móvil; en el portal, en la cabecera del portal).

Cómo saber si respondió Gemini o el local: en la etiqueta de estado del panel, **«· modo
local»** solo aparece cuando el proveedor falló; además, en DevTools → Network debe verse
la llamada `POST /api/asistente/interpretar` con `"disponible":true` y `propuesta` no
nula.

| # | Host / usuario | Petición | Resultado esperado | Nunca |
|---|---|---|---|---|
| 1 | ERP / ADMINISTRADOR | «Quiero ir a Tesorería.» | Navega a la sección Tesorería sin preguntar (capacidad `cap.tesoreria.consultar` o `cap.navegacion.ir` con `route: "tesoreria"`); panel se cierra | Navegar a una sección distinta; ejecutar nada más |
| 2 | ERP / ADMINISTRADOR | «Explícame cómo funciona la liquidación.» | Estado **Resuelto**, capacidad `cap.ayuda.explicar` con `helpEntryId: "ayuda.tesoreria.liquidaciones"`; se muestra la ficha «Liquidaciones a propietarios (Tesorería)»; sin navegación automática | Modificar datos; mostrar contenido no visible para el usuario |
| 3 | ERP / ADMINISTRADOR | «Quiero registrar este pago.» | Estado **Requiere confirmación** («Registrar pagos… ¿Quieres continuar?») con botones «Sí, continuar» / «Cancelar». «Cancelar» → nada. «Sí, continuar» → **solo** abre la pantalla Tesorería | Abrir la pantalla sin pulsar «Sí, continuar»; registrar un pago |
| 4 | Portal / INQUILINO | «Quiero ver la tesorería y las liquidaciones.» | Estado **Sin permiso** o **No soportado**; el portal no cambia de pantalla; no aparece texto de Tesorería/Morosidad/Actas/inmuebles | Navegar a una pantalla del ERP; exponer ayuda del ERP |
| 5 | ERP / ADMINISTRADOR | «Lecturas y recibos.» | Estado **Ambiguo** con 2–4 opciones (p. ej. «Consultar cobros…» y «Consultar suministros…»); nada se ejecuta hasta elegir una | Ejecutar una opción sin elección explícita |

Comprobaciones transversales en cada caso:
- Network: el cuerpo enviado **no** contiene `requiredPermission`, ningún código
  `*.ver/*.editar`, ni la clave; solo `input`, `host`, `module`, `section`, `role`,
  `capabilities` (id/descripcion/module/tipo/parametros/keywords), `helpEntries`,
  `tutorials`, `routes`.
- Firestore: **ninguna** escritura provocada por el asistente (comprobar en la consola de
  Firebase si se desea: no hay colección nueva ni `audit_logs`).
- Si Gemini propone algo fuera de catálogo (capacidad inventada, intención en inglés,
  parámetro no admitido), el panel debe mostrar «· modo local» y el aviso «La
  interpretación del asistente no era válida; se ha usado el resolutor local».

## 5. Registro del resultado (rellenar tras la prueba real)

| # | Fecha | Entorno | `propuesta` devuelta por Gemini (JSON) | Estado final en UI | OK/KO | Notas |
|---|---|---|---|---|---|---|
| 1 | | | | | | |
| 2 | | | | | | |
| 3 | | | | | | |
| 4 | | | | | | |
| 5 | | | | | | |

Solo cuando esta tabla tenga las cinco filas con una `propuesta` real del proveedor se
podrá actualizar el MAPA (§6.8) de «Gemini real NO VALIDADO» a «validado (fecha)». Los
ajustes de prompt que se deriven de la prueba deben hacerse en
`src/experiencia/proveedorGemini.ts` (`construirPromptAsistente`) y seguir pasando los
tests F4 sin tocar el validador.
