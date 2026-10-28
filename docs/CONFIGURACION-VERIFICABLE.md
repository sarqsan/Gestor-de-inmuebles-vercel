# Configuración verificable (P0.1)

**Fecha:** 2026-10-27 · **Estado:** documento vivo de la ejecución P0.
**Alcance:** inventario de TODAS las variables que el código lee, su origen, su
efecto y cómo comprobarlas. **No contiene secretos ni activa valores.**

> ⚠️ **Límite de seguridad.** Este repositorio NO dispone de proyecto de staging.
> `.firebaserc` apunta a `gestor-inmuebles-produccion` y
> `server/titularidades/configuracionFirebase.ts` rechaza cualquier otro
> `projectId`. Por tanto, **toda verificación con datos se hace contra
> emuladores (`demo-gestor-reglas`)**. Nunca ejecutar un script de escritura
> contra el proyecto de producción. `scripts/doctor.mjs` es de **solo lectura**
> y **rechaza explícitamente** cualquier host que no sea local o de sandbox.

---

## 1. Destino fijo de los datos (no es una variable)

| Elemento | Valor | Fuente |
|---|---|---|
| Proyecto Firebase | `gestor-inmuebles-produccion` | `firebase-applet-config.json`, `.firebaserc` |
| Base Firestore con nombre | `ai-studio-gestordeinmueble-c6444afd-24ca-4983-b195-ceb2c5ebdc51` | `firebase-applet-config.json` → `firestoreDatabaseId` |
| Bucket Storage | `gestor-inmuebles-produccion.firebasestorage.app` | `firebase-applet-config.json` → `storageBucket` |
| Proyecto de emuladores | `demo-gestor-reglas` | `docs/P2-aceptacion-emuladores.md`, `package.json` |
| Cron | `GET /api/cron/avisos`, `0 6 * * *` | `vercel.json` |

`FIREBASE_PROJECT_ID` y `FIRESTORE_DATABASE_ID` **no seleccionan** el destino:
solo actúan como confirmación. Si difieren del JSON versionado,
`resolverDestinoFirebase()` devuelve `FIREBASE_OVERRIDE_INCOMPATIBLE` y **no se
crea ningún cliente**. Es una guardia anti-staging-accidental.

---

## 2. Las 27 variables de la aplicación

Leyenda de **Secreto**: `SÍ` = nunca versionar, solo en el panel del proveedor
o en `.env` local; `NO` = configuración pública/no sensible; `PÚBLICA` = se
compila dentro del bundle del navegador (Vite `VITE_*`).

| # | Variable | Origen (quién la lee) | Efecto si falta /Valor por defecto | Secreto |
|---|---|---|---|---|
| 1 | `GEMINI_API_KEY` | `server.ts`, `server/ia/validacionEntornoIA.ts` | Solo se informa en `/api/health` (`geminiKeyConfigured`) por compatibilidad. Ya **no** es la clave de las operaciones de usuario (Fase IA 9). | SÍ |
| 2 | `APP_URL` | Plataforma (Cloud Run/AI Studio) | URL pública para enlaces autorreferenciados y callbacks. Sin ella los enlaces generados pueden ser relativos. | NO |
| 3 | `CRON_SECRET` | `server.ts`, `server/notificaciones/rutasCronAvisos.ts` | Sin secreto, `GET /api/cron/avisos` responde **503** y el reloj de avisos no ejecuta nada (fallo cerrado). Generar con `openssl rand -hex 32`. | SÍ |
| 4 | `EMAIL_PROVEEDOR` | `server/notificaciones/proveedoresEmail.ts` | `SMTP` / `RESEND` / `SENDGRID`. Sin proveedor válido + `EMAIL_FROM`, el canal queda **MODO_SEGURO**: no contacta con nadie y nunca devuelve «enviado». | NO |
| 5 | `ENABLE_EMAIL` | `server/notificaciones/proveedoresEmail.ts` | Interruptor histórico. **Por sí solo NO simula envíos**: se exige además proveedor + remitente válidos. | NO |
| 6 | `SMTP_URL` | `server/notificaciones/proveedoresEmail.ts` | URL `smtps://usuario:clave@host:puerto`. Sin ella, proveedor SMTP no pasa a `REAL`. | SÍ |
| 7 | `RESEND_API_KEY` | `server/notificaciones/proveedoresEmail.ts` | Clave API para `EMAIL_PROVEEDOR=RESEND`. | SÍ |
| 8 | `SENDGRID_API_KEY` | `server/notificaciones/proveedoresEmail.ts` | Clave API para `EMAIL_PROVEEDOR=SENDGRID`. | SÍ |
| 9 | `EMAIL_FROM` | `server/notificaciones/proveedoresEmail.ts` | Remitente. Sin remitente válido no hay modo `REAL`. | NO |
| 10 | `EMAIL_DESPACHO_NOMBRE` | `server/notificaciones/proveedoresEmail.ts` | Nombre del despacho en el texto de los avisos. Si falta se deduce de `EMAIL_FROM`. | NO |
| 11 | `EMAIL_REPLY_TO` | `server/notificaciones/proveedoresEmail.ts` | Buzón de respuesta por defecto (el del propietario se usa para los avisos al inquilino). Si falta se deduce de `EMAIL_FROM`. | NO |
| 12 | `IA_POLITICA_JSON` | `src/ia/gobiernoIAContrato.ts`, `server/ia/configuracionIA.ts` | Sin variable rige la política **POR DEFECTO**: deniega las 12 operaciones y mantiene el consumo bloqueado (`APROBACION_COMERCIAL_PENDIENTE`). JSON inválido ⇒ `POLITICA_IA_INVALIDA` (503). Ver `docs/politica-ia.ejemplo.json`. | NO (pero contiene tarifas) |
| 13 | `IA_LLAVES_CLAVE_MAESTRA` | `src/ia/llavesUsuarioContrato.ts`, `server/ia/cifradoLlavesIA.ts` | 32 bytes en base64 para cifrar en reposo la clave de cada usuario. Sin ella, llaves `NO_CONFIGURADO`. Inválida ⇒ 503 `LLAVES_CLAVE_MAESTRA_INVALIDA`. Generar con `npm run ia:llaves:clave-maestra`. | SÍ |
| 14 | `IA_LLAVES_SIN_LLAVE` | `src/ia/llavesUsuarioContrato.ts` | `RESPALDO` (por defecto) = respuesta heurística sin consumo; `EXIGIR` = 428 `LLAVE_USUARIO_REQUERIDA`. | NO |
| 15 | `IA_LLAVES_VERIFICACION` | `server/ia/rutasLlavesIA.ts` | `PROVEEDOR` habilita la verificación REAL `models.list`. Por defecto **DESACTIVADA** (503). Requiere autorización expresa. | NO |
| 16 | `FIREBASE_SERVICE_ACCOUNT` | `server/ia/validacionEntornoIA.ts`, `server/titularidades/googleBackend.ts` | JSON de cuenta de servicio en línea. Sin credencial, `firestore`/`storage` del backend son `null` y las rutas responden 503. | SÍ |
| 17 | `FIREBASE_SERVICE_ACCOUNT_B64` | `server/ia/validacionEntornoIA.ts` | Igual que la anterior, codificada en base64 (útil en Vercel). Alternativa excluyente. | SÍ |
| 18 | `FIREBASE_SERVICE_ACCOUNT_PATH` | `server/ia/validacionEntornoIA.ts` | Ruta a un fichero JSON de cuenta de servicio (solo local/CI). Alternativa excluyente. | SÍ (ruta) |
| 19 | `GOOGLE_APPLICATION_CREDENTIALS` | `server/titularidades/googleBackend.ts` | ADC estándar de Google; también fija el `project_id` cuando no hay JSON en línea. | SÍ (ruta) |
| 20 | `FIREBASE_PROJECT_ID` | `server/titularidades/configuracionFirebase.ts` | **Confirmatorio**. Si difiere de `firebase-applet-config.json` ⇒ `FIREBASE_OVERRIDE_INCOMPATIBLE`, no se crea cliente. | NO |
| 21 | `FIRESTORE_DATABASE_ID` | `server/titularidades/configuracionFirebase.ts` | **Confirmatorio** de la base con nombre. Igual guardia que la anterior. | NO |
| 22 | `MASTER_ADMIN_EMAIL` | `src/lib/masterAdmin.ts` → `server/titularidades/backendTitulares.ts` | Override **solo servidor** del correo maestro. Por defecto, el literal de `masterAdmin.ts`. ⚠️ Las `firestore.rules` siguen con el literal: cambiar esta variable **no** cambia la autoridad real (decisión P-04 pendiente). | NO |
| 23 | `SEGUIMIENTO_ADMIN_USUARIO_ID` | `server.ts` | Usuario destino de los avisos internos de seguimiento de incidencias. Sin él se usa el destino por defecto del notificador. | NO |
| 24 | `TZ` | `server/notificaciones/relojAvisos.ts` | Zona horaria del reloj de avisos. Sin ella se usa la del proceso (recomendado `Europe/Madrid` en ES). | NO |
| 25 | `VITE_SEEDS_ENABLED` | `src/lib/flags.ts` → `src/lib/firebase.ts` | **NUEVO P0.1.** Sin valor ⇒ **desactivado**. Solo con `1/true/si/on` se permite sembrar `system/metadata`, usuarios demo, aseguradoras, especialidades y profesional demo. | PÚBLICA |
| 26 | `VITE_DEMO_DATA` | `src/lib/flags.ts` → `src/data/estadoInicial.ts` | **NUEVO P0.1.** Sin valor ⇒ **desactivado**. Solo con `1/true/si/on` se precarga la UI con `INITIAL_*` (perfil de demo, Gmail «conectado», 5 aseguradoras). | PÚBLICA |
| 27 | `VITE_MODALIDAD_SISTEMA_FACTURACION` | `src/lib/configuracionFiscal.ts` → `src/components/sections/FacturacionSection.tsx` | **NUEVO P1.5-pre.** PÚBLICA. Sin valor ⇒ `PREPARACION` (registro/huella/QR locales, **sin remisión a la AEAT**). `NO_VERIFACTU` = idem con modalidad declarada. `VERIFACTU` solo tras dictamen P1.4 y transporte verificado. Valor desconocido ⇒ `PREPARACION` + aviso. | PÚBLICA |

> Las 24 primeras son las que la auditoría Fase 0 contabilizó (seis de ellas —
> 16 a 21 y 24 — no estaban documentadas en `.env.example`). P0.1 añade las dos
> banderas 25 y 26. P1.5-pre añade la variable 27 (modalidad fiscal). Ninguna de
> las 27 debe tener un valor real en el repositorio.

### 2.1 Variables de emulador / CI (documentadas, fuera del recuento)

| Variable | Uso |
|---|---|
| `NODE_ENV` | `test`/`development`/`production`; controla guardias y bloqueo comercial. |
| `GCLOUD_PROJECT` | Proyecto de los emuladores: `demo-gestor-reglas`. |
| `FIRESTORE_EMULATOR_HOST` | `127.0.0.1:8080`. |
| `FIREBASE_STORAGE_EMULATOR_HOST` | `127.0.0.1:9199`. |
| `FIREBASE_AUTH_EMULATOR_HOST` | `127.0.0.1:9099`. |
| `VERCEL` / `VERCEL_ENV` | Detectan entorno Vercel; `validacionEntornoIA.ts` prohíbe config de IA en producción sin aprobación. |
| `DISABLE_HMR` | Vite: desactiva HMR en el sandbox. |
| `ARENA_SESSION_BRANCH` | Solo para la guardia A-04 del entorno de trabajo. |
| `GITHUB_STEP_SUMMARY` | Solo CI (escritura del resumen del job). |

---

## 3. Cómo verificar (sin tocar producción)

```bash
# 1) Comprobación estática, sin servidor (SIEMPRE disponible)
npm run doctor

# 2) Comprobación del servidor LOCAL (sin credenciales reales)
NODE_ENV=development npx tsx server.ts &
npm run doctor -- --url http://127.0.0.1:3000/api/health

# 3) Modo estricto: falla si alguna capacidad núcleo no es OK
npm run doctor -- --url http://127.0.0.1:3000/api/health --strict

# 4) Rechazo explícito de producción (debe salir con código 2)
npm run doctor -- --url https://gestor-inmuebles-produccion.vercel.app/api/health
```

`npm run doctor` **nunca escribe** nada: solo lee ficheros del repositorio y
hace un `GET /api/health`. Un estado `SIMULACION`, `NO_CONFIGURADO` o
`BLOQUEADO` **nunca se presenta como una prueba real superada**.

### Capacidades núcleo (8)

`autenticacion`, `firestore`, `portalesPublicos`, `custodia`,
`actualizacionRenta`, `seguimiento`, `modoEmail`, `cron`.

El mapa completo publicado por `/api/health` añade `almacenDocumental`,
`justificantesCobro`, `notificaciones`, `registroIA`, `llavesIA` y `analisisIA`.
Cada entrada tiene `estado` (`OK` / `NO_CONFIGURADO` / `SIMULACION` /
`BLOQUEADO`) y un `detalle` sin secretos.

---

## 4. Puesta en marcha de un entorno REAL (fuera del alcance de P0)

Orden recomendado, **solo cuando exista un proyecto de staging aprobado**
(decisión P-06 pendiente):

1. Crear proyecto Firebase de staging y su base Firestore con nombre; actualizar
   los guardarraíles de `configuracionFirebase.ts` (hoy fijados a producción).
2. Definir `FIREBASE_SERVICE_ACCOUNT*` y verificar con
   `npm run ia:validar-entorno`.
3. Definir `EMAIL_PROVEEDOR` + credenciales + `EMAIL_FROM`; probar con la ruta
   de prueba SMTP aislada. Comprobar que `/api/health` ya no dice
   `MODO_SEGURO`.
4. Definir `CRON_SECRET` y comprobar el reloj con una ejecución manual.
5. Definir `IA_LLAVES_CLAVE_MAESTRA` y `IA_POLITICA_JSON` solo tras la
   aprobación D4; verificar con `npm run ia:verificar-politica` y
   `npm run ia:llaves:clave-maestra -- --verificar`.
6. Ejecutar `npm run doctor -- --strict` y el emulador oficial en CI.

---

## 5. Identidad del administrador principal (P0.1)

* Fuente única: `src/lib/masterAdmin.ts` → `MASTER_ADMIN_EMAIL_POR_DEFECTO`.
* Cliente: `ADMIN_MASTER_EMAIL` / `esEmailMaster()`; **no** puede leer
  `process.env` desde el navegador.
* Servidor: `resolverEmailMaster(process.env)` admite `MASTER_ADMIN_EMAIL`.
* Reglas: `isMasterAdmin()` en `firestore.rules` sigue con el **literal** porque
  las reglas no pueden leer variables de entorno. `tests/master-admin-paridad.test.ts`
  comprueba que el literal y la fuente única no divergen. Sustituirlo por un
  custom claim es la decisión **P-04**, que requiere `firebase-admin` y un
  despliegue coordinado de reglas; no se hace en P0.1.

## 6. Semillas y datos de demostración (P0.1)

* `seedInitialDataIfEmpty()` y `seedAuthAndRolesIfEmpty()` **retornan sin
  escribir** si `VITE_SEEDS_ENABLED` no está activo.
* `App.tsx` y `firebase.ts` obtienen sus estados iniciales de
  `src/data/estadoInicial.ts`, que devuelve arrays/vacíos o valores neutros
  salvo `VITE_DEMO_DATA`.
* `subscribeAseguradoras` ya **no** escribe SEAG como efecto colateral de una
  lectura cuando las semillas están desactivadas.
* La caché `localStorage` sigue siendo válida: es el reflejo de snapshots
  reales ya recibidos, no una fuente de datos de demostración.

---

## 7. Índices compuestos y destino de despliegue (H-14 · H-16 · H-02)

**Estado: DECLARADO EN EL REPOSITORIO, NO PUBLICADO NI VERIFICADO CON LA CLI.**
Esta sección no afirma que los índices existan en ningún proyecto.

### 7.1 Qué hay declarado (dato comprobado en el repositorio)

`firestore.indexes.json` contiene **10 índices compuestos** y `fieldOverrides: []`.
Las colecciones reales son (`grep` del fichero, no una lista de memoria):

| Colección | Campos (un índice por fila) |
|---|---|
| `actas` | `ownerId` + `propertyId` + `fechaCreacion` DESC |
| `actas` | `ownerId` + `contractId` + `fechaCreacion` DESC |
| `actas` | `ownerId` + `tipo` + `estado` |
| `actas_evidencias` | `ownerId` + `actaId` + `orden` |
| `actas_incidencias` | `ownerId` + `actaId` + `fechaHora` DESC |
| `actas_otp` | `ownerId` + `actaId` + `estado` |
| `gestiones_cartera` | `propietarioId` + `estado` |
| `gestiones_cartera` | `gestorUsuarioId` + `estado` |
| `ia_operaciones` | `uidTitular` + `iniciadaEn` DESC |
| `ia_operaciones` | `uid` + `iniciadaEn` DESC |

> Corrección de un error previo de este documento: aquí se citaban «`candidatos`,
> `solicitudes`». **Ninguno de los 10 índices pertenece a esas colecciones.**

`firebase.json` declaraba solo `firestore[].rules`; desde la corrección H-16 la
entrada de la base con nombre declara **también** `indexes`:

```json
"firestore": [
  { "database": "ai-studio-…-ceb2c5ebdc51", "rules": "firestore.rules", "indexes": "firestore.indexes.json" }
]
```

Sin esa clave, `prepareIndexes` de `firebase-tools` no se ejecuta y **ningún**
`firebase deploy --only firestore` publicaría índices (no-op silencioso).

### 7.2 Destino: ningún proyecto por defecto (H-02)

`.firebaserc` **ya no declara `projects.default`**. Cualquier comando de la CLI
sin `--project` falla en vez de caer en `gestor-inmuebles-produccion`. El alias
`produccion` sigue disponible para un uso explícito y autorizado.

```bash
# Pruebas/CI (único proyecto que este repositorio usa sin autorización extra):
firebase emulators:exec --only auth,firestore,storage --project demo-gestor-reglas

# Verificación de índices SIN publicar (staging real, con autorización):
firebase deploy --only firestore:indexes --project <staging>
firebase firestore:indexes --project <staging> --database <id>
```

### 7.3 Lo que sigue SIN verificar (no se declara superado)

1. **CLI real.** `firebase-tools` no está instalado en el entorno de trabajo y
   no se ha ejecutado ningún comando. La forma array multi-base con `indexes`
   debe confirmarse con la versión fijada `15.33.0`: en `15.10.0`
   `--only firestore:indexes` fue un **no-op silencioso**
   (`firebase/firebase-tools#10447`). No se publica nada desde esta sesión.
2. **Publicación.** Requiere staging (P-06) y autorización expresa. **Nunca**
   con `--force`: con `fieldOverrides: []` borraría índices y exclusiones
   creados por consola que no estén en el fichero.
3. **Necesidad real.** Las consultas actuales de `firebaseActas.ts` usan
   `where('ownerId'…)` sin `orderBy`, de modo que los índices de `actas` son
   preparación para una consulta server-side, no un requisito inmediato.

**Exclusión permanente recordatoria:** ninguna de estas tareas implica banca,
PSD2, agregadores, pasarelas ni pagos online.
