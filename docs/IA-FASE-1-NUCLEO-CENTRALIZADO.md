# IA · Fase 1 — Núcleo de IA centralizado en el servidor

> **Origen de la definición.** No procede del plan original del proyecto de
> integración de IA (no se localizó en el repositorio, su historial ni las ramas).
> Es la **propuesta autorizada expresamente por el usuario** (2026-10-15):
>
> «Fase 1 = núcleo de IA centralizado en el servidor: los 11 endpoints de IA pasan
> por un único servicio que exige usuario autenticado (token verificado en
> servidor) y registra cada operación por usuario, de forma trazable y sin
> duplicados. Los créditos y el saldo, los límites por usuario y los paneles
> quedarían para fases posteriores.»
>
> **Fase 0** fue de análisis y decisiones, sin cambios en el repositorio. Antes de
> empezar se comprobó que existían sus prerrequisitos: los endpoints Gemini con
> una única `GEMINI_API_KEY` de servidor, Firebase Auth con verificación de ID
> token en servidor (`server/titularidades/googleBackend.ts`) y el espejo de
> identidad `usuarios_auth`/`usuarios`.

## 1. Qué hace

Todas las operaciones de IA pasan por **un único núcleo**,
`server/ia/nucleoIA.ts`, montado como middleware en cada endpoint:

```ts
app.post('/api/redactar-clausula', nucleoIA.operacion('REDACTAR_CLAUSULA'), async (req, res) => {
  const ai = clienteIA(res); // cliente del proveedor instrumentado, o null
  ...
});
```

Antes de que se ejecute el manejador, el núcleo hace tres cosas, en este orden:

1. **Exige un usuario autenticado.** La petición debe llevar
   `Authorization: Bearer <ID token de Firebase>`, y el servidor lo verifica:
   RS256, `kid`, firma con los certificados de Google, `aud`, `iss` y `exp`.
   El **uid sale siempre del token**, nunca del cuerpo de la petición.
2. **Aplica idempotencia.** Exige la cabecera `Idempotency-Key`
   (8–128 caracteres `[A-Za-z0-9_\-:.]`). El id de la operación es
   `iaop_` + sha256(uid + clave), con 40 caracteres hexadecimales:
   - la misma clave enviada por dos usuarios da dos operaciones distintas;
   - la misma clave enviada dos veces por el mismo usuario es un **duplicado**
     y recibe un 409 sin volver a ejecutarse ni llamar al proveedor.
3. **Registra la operación por usuario.** El registro de `ia_operaciones` se
   crea con id fijo **antes** de ejecutar la operación. Si no se puede
   registrar, el núcleo responde 503 y no se ejecuta nada. El registro se
   cierra con el resultado **antes** de entregar la respuesta al cliente.

El cliente del proveedor solo se obtiene con `clienteIA(res)`. Está
instrumentado por petición: cuenta llamadas, modelos, tokens y errores
normalizados. Si un endpoint no pasó por el núcleo, `clienteIA` **lanza un
error**, de modo que no existe ninguna vía para usar la IA sin autenticación y
sin registro. Una prueba también garantiza que `new GoogleGenAI` y
`generateContent` solo aparecen en `server/ia/nucleoIA.ts`.

### Catálogo único (`src/ia/catalogoOperacionesIA.ts`)

| Id | Ruta |
|---|---|
| `ANALIZAR_DOCUMENTO` | `/api/analizar-documento` |
| `GENERAR_CORREO_ASEGURADORA` | `/api/generar-correo-aseguradora` |
| `ANALIZAR_RESPUESTA_ASEGURADORA` | `/api/analizar-respuesta-aseguradora` |
| `ASISTENTE_INTERPRETAR` | `/api/asistente/interpretar` |
| `ANALIZAR_CUESTIONARIO` | `/api/analizar-cuestionario` |
| `REDACTAR_CLAUSULA` | `/api/redactar-clausula` |
| `ANALIZAR_INSPECCION` | `/api/analizar-inspeccion` |
| `PROPONER_MEJORAS` | `/api/proponer-mejoras` |
| `ESTIMAR_PRICING` | `/api/estimar-pricing` |
| `GENERAR_KIT_PUBLICACION` | `/api/generar-kit-publicacion` |
| `ANALIZAR_INCIDENCIA` | `/api/analizar-incidencia-ia` |

### Respuestas del núcleo

Si la petición supera el núcleo, el endpoint responde como siempre. Si no, el
núcleo responde por su cuenta con cuerpo `{ error, codigo }`:

| HTTP | `codigo` | Cuándo |
|---|---|---|
| 401 | `NO_AUTENTICADO` | Falta el token, o es inválido o caducado. No se ejecuta nada. |
| 400 | `IDEMPOTENCIA_REQUERIDA` | Falta `Idempotency-Key` o no es válida. |
| 409 | `OPERACION_DUPLICADA` | La clave ya se usó para ese usuario. La respuesta incluye `operacionId` y `estadoPrevio`. |
| 503 | `REGISTRO_NO_DISPONIBLE` | No se pudo reservar el registro. **No se ejecuta.** |
| 500 | `ERROR_NUCLEO_IA` | Error interno al preparar la operación. |

Cabeceras de respuesta:
- `X-IA-Operacion-Id`: id de la operación.
- `X-IA-Registro: no-configurado`: solo en el modo NO_CONFIGURADO, descrito más
  abajo.

### Registro (`server/ia/registroOperacionesIA.ts`)

Colección `ia_operaciones`, un documento por operación:

| Fase | Campos |
|---|---|
| Apertura | `version`, `id`, `uid`, `operacion`, `ruta`, `estado: EN_CURSO`, `iniciadaEn` (timestamp) |
| Cierre | `estado` (`COMPLETADA` si HTTP < 400; si no, `FALLIDA`) |
| | `codigoHttp`, `finalizadaEn`, `duracionMs` |
| | `origenRespuesta`: `PROVEEDOR` (respondió el modelo), `RESPALDO` (heurística sin consumo) o `ERROR` |
| | `llamadasProveedor` y `llamadasProveedorFallidas` (cada reintento cuenta) |
| | `modelos`, y `tokensEntrada`/`tokensSalida`/`tokensRazonamiento`/`tokensTotales`, tomados de `usageMetadata` |
| | `errorProveedor`: código normalizado, nunca el mensaje |

Escritura:
- La apertura es `createDocument` con `documentId`, que es atómica: si dos
  peticiones llegan a la vez, solo una crea el documento y la otra recibe un
  409.
- El cierre es un `PATCH` con `updateMask` y `currentDocument.exists=true`, de
  modo que nunca crea documentos.

**Nunca se guardan** prompts, cuerpos de petición o respuesta, documentos,
nombres, email ni claves; una prueba lo comprueba con una lista blanca.

**Clientes:** `ia_operaciones` no tiene un `match` propio en `firestore.rules`.
La denegación global `match /{document=**} { allow read, write: if false; }`
impide leerla o escribirla desde cualquier cliente, incluido el administrador
maestro; está probado con el evaluador de reglas del repositorio. Solo escribe
el servidor, por REST con la credencial de servicio y sin SDK de
administración. **No se modifica `firestore.rules`.**

### Modos del registro (`server/ia/configuracionIA.ts`)

| Modo | Cuándo | Comportamiento |
|---|---|---|
| `FIRESTORE` | Hay credencial de servicio | Registro duradero en la base de datos de la aplicación. |
| `MEMORIA` | Sin credencial, fuera de producción (desarrollo o pruebas) | Registro no duradero, con aviso en el log. |
| `NO_CONFIGURADO` | Sin credencial, en producción (`VERCEL` o `NODE_ENV=production`) | Se exige igualmente la sesión, pero `clienteIA` devuelve `null`. Los endpoints responden con su respaldo heurístico, que ya existía, **sin llamar al proveedor**. Además, cabecera `X-IA-Registro: no-configurado` y log estructurado. **Nunca hay consumo sin una traza duradera.** |

`GET /api/health` expone `ia: { registro, autenticacion: 'TOKEN_FIREBASE', operaciones: 11 }`,
sin secretos.

### Cliente (`src/lib/clienteIA.ts`)

`solicitarIA(ruta, cuerpo)` añade a cada petición:
- el `Bearer` de la sesión, reutilizando `tokenUsuarioActual`;
- una `Idempotency-Key` nueva: un UUID v4, o 128 bits aleatorios si el
  navegador no tiene `randomUUID`.

Las 13 llamadas de las pantallas lo usan. El asistente usa
`crearProveedorGeminiRemoto(fetchIA)`, que es la misma firma que `fetch`. Si no
hay sesión, la petición sale sin `Authorization` y el servidor responde 401;
las pantallas ya trataban `!response.ok` con su error o respaldo habitual.

**Cambio de comportamiento:** el análisis automático que se lanzaba al enviar el
**cuestionario público**, por parte de un candidato sin sesión, ahora recibe un
401, que se registra sin ruido en la consola. El análisis se hace cuando un
usuario del ERP con sesión carga los candidatos. Para ello se usa el efecto ya
existente en `App.tsx`, que analiza los cuestionarios completados sin
`analisisIa`. Así, todo consumo de IA queda atribuido a un usuario del ERP.

## 2. Ficheros

**Nuevos:**
- `src/ia/catalogoOperacionesIA.ts`
- `server/ia/nucleoIA.ts`
- `server/ia/registroOperacionesIA.ts`
- `server/ia/configuracionIA.ts`
- `src/lib/clienteIA.ts`

**Modificados:**
- `server.ts`: el núcleo se monta en los 11 endpoints, y `getGeminiClient` y
  `generateGeminiWithRetry` se trasladan al núcleo sin cambiar su
  comportamiento. Se añade `ia` en `/api/health`.
- `server/titularidades/googleBackend.ts`, con cambios compatibles hacia atrás:
  - opción `baseDatosId`, que por defecto sigue siendo `(default)`;
  - `crearDocumento` y `actualizarCampos`;
  - códec `Date` ↔ `timestampValue`.
- `server/titularidades/manejadorBuscarTitulares.ts`: exporta `tokenDe` para
  reutilizarlo.
- Las 11 pantallas o utilidades que llamaban a la IA con `fetch`, y los dos
  shells que crean el proveedor del asistente.

**Pruebas:**
- `tests/ia-fase1-nucleo.test.ts`
- `tests/ia-fase1-registro-firestore.test.ts`
- `tests/ia-fase1-integracion-server.test.ts`
- `tests/ia-fase1-cliente.test.ts`

## 3. Despliegue: prerrequisitos (no se han cambiado secretos ni se ha desplegado)

- **Para usar la IA real y tener un registro duradero en producción** hay que
  configurar en Vercel `FIREBASE_SERVICE_ACCOUNT`, o bien `_B64`, `_PATH` o
  `GOOGLE_APPLICATION_CREDENTIALS`. Son las mismas variables que usa la
  búsqueda de titulares.
  - La cuenta debe tener permiso de escritura en Firestore (p. ej.
    `roles/datastore.user`) en el proyecto `gestor-inmuebles-produccion`.
  - El registro se escribe en la base de datos con nombre de
    `firebase-applet-config.json`.
  - Sin esa credencial, producción funciona en modo `NO_CONFIGURADO`: la IA
    exige sesión y responde con los respaldos heurísticos, sin consumo de
    Gemini.
- Variables opcionales:
  - `FIREBASE_PROJECT_ID`: audiencia del token; por defecto, la de la
    configuración de la app.
  - `FIRESTORE_DATABASE_ID`: base de datos del registro.
- Comprobación tras desplegar: en `GET /api/health`, `ia.registro` debe valer
  `FIRESTORE`.
- No hacen falta índices: solo se escribe y se lee por id. Tampoco hace falta
  publicar reglas.
- **Arranque ESM nativo en Vercel (`api/index.ts`).** `@vercel/node` compila
  cada `.ts` a ESM nativo sin hacer bundling, porque `package.json` tiene
  `"type": "module"`.
  - Todas las importaciones relativas de ejecución del grafo de `api/index.ts`
    (`api/index.ts`, `server.ts`, `server/ia/*`, `server/titularidades/*` y
    `src/notificaciones/dispatcher.ts`) llevan sufijo `.js` explícito, y
    `server/ia/configuracionIA.ts` lee `firebase-applet-config.json` con
    respaldo seguro sin depender de atributos de importación JSON.
  - Una prueba estática y otra en proceso Node ESM nativo real en
    `tests/ia-fase1-integracion-server.test.ts` verifican que `api/index.js`
    arranca sin bundler y responde en `/api/health` y en los 11 endpoints.

## 4. Pruebas

```bash
npx vitest run tests/ia-fase1-nucleo.test.ts tests/ia-fase1-registro-firestore.test.ts \
  tests/ia-fase1-integracion-server.test.ts tests/ia-fase1-cliente.test.ts
```

Las pruebas se hacen con HTTP real contra Express en un puerto efímero, sin red
externa y sin datos reales. Cubren:
- 401 sin token, con token inválido o con el verificador caído;
- verificación RS256 real con clave local (firma ajena, otro proyecto,
  token caducado o `alg none` dan 401);
- uid tomado del token aunque el cuerpo intente suplantarlo;
- 400 sin clave o con una clave inválida;
- 409 en duplicados, también con 5 peticiones simultáneas;
- aislamiento por usuario;
- registro cerrado antes de la respuesta, también con un registro lento;
- lista blanca de campos;
- `PROVEEDOR`, `RESPALDO`, `ERROR`, reintentos y error del proveedor;
- 503 si falla la reserva;
- entrega de la respuesta aunque falle el cierre;
- modo `NO_CONFIGURADO`.

Además:
- el adaptador REST de Firestore: base con nombre, `documentId`, 409, `PATCH`
  con máscara, `(default)` intacto para titulares;
- las reglas que deniegan `ia_operaciones`;
- la app **real** de `server.ts`: los 11 endpoints dan 401;
- el cableado estático y la configuración por entorno;
- el contrato entre cliente y servidor.

## 5. Límites conocidos y fuera de alcance

- **La autenticación es solo por token.** No se consulta el perfil ni su
  estado: una cuenta dada de baja conserva un token válido hasta que caduca
  (~1 h) y no se comprueba su revocación. La autorización por perfil, rol y
  operación corresponde a la fase de permisos.
- Si un manejador no llegara a responder, o si fallara la escritura del cierre,
  el registro queda en `EN_CURSO`. En el segundo caso también queda una línea
  de log `[ia]`.
- El registro en memoria (solo desarrollo) no es duradero ni compartido entre
  instancias.
- No validado aquí, porque el entorno no tiene red hacia Google: llamadas
  reales a Gemini, escrituras reales en Firestore y verificación de tokens
  reales de producción.
- **Reservado a fases posteriores:**
  - créditos y saldo;
  - límites o cuotas por usuario;
  - permisos por rol y operación;
  - paneles de consumo y de administración;
  - política de retención del registro.
- **Hallazgo previo, sin tocar:** `ClienteFirestoreRest` usa la base
  `(default)` para la búsqueda de titulares (`/api/titulares/buscar`), pero los
  datos de la app viven en la base con nombre. El núcleo de IA ya pasa la base
  correcta; corregir titulares queda fuera de esta fase.
