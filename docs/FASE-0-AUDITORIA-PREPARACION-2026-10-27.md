# FASE 0 — Auditoría de preparación y cierre de alcance del ERP patrimonial

**Fecha:** 27-10-2026 · **Rama:** `arena/fb69e0b0-gestor-de-inmuebles-vercel` · **HEAD:** `2563831df9b026dec8276c45db40977f72883f9d` · **Commit base:** el mismo (clon superficial, ver H-01).
**Tipo:** auditoría técnica de **solo lectura**, revisión de alcance y planificación ejecutable.
**Estado de la orden:** ejecutada en su parte de inspección. **NO se ha modificado código de producto, reglas, índices, variables, secretos, datos, infraestructura ni producción.** Se entrega el informe y se espera autorización expresa antes de implementar.

> Este documento **sustituye y corrige** las secciones §8 (mercado), §9 (hoja de ruta), §10 (fuentes) y el anexo de comandos de `docs/AUDITORIA-FUNCIONAL-PORTALES-2026-10-27.md`. El inventario funcional de los §§0-7 de aquel informe se mantiene, con las precisiones de H-05 y H-25 de este documento. La hoja de ruta detallada en la respuesta anterior al usuario queda **sin efecto**.

---

## 1. Resumen ejecutivo — estado real del proyecto

| Dimensión | Estado real comprobado |
|---|---|
| Repositorio | Limpio de cambios de código. Único cambio en el árbol: el archivo de auditoría previo (documento, sin seguimiento) y este informe. |
| Rama / HEAD | `arena/fb69e0b0-…` en `2563831` (merge PR #61, 21-10-2026). Clon **superficial**: no hay historial ni objetos `f782…`/`46bb…`. |
| Arquitectura | React 19 + Vite 6 SPA; Express 4 en `server.ts` → Vercel `api/index.ts`; Firestore **base con nombre** única; Storage autorizado en servidor; 19 rutas en `server.ts` + 34 en `server/**`. |
| Seguridad | `firestore.rules` 4.069 líneas, 77 `match` de primer nivel, 276 usos de `isMasterAdmin()`, denegación global final. `storage.rules` 66 líneas, deniega todo al cliente salvo foto pública. |
| Datos | 10 índices compuestos declarados en `firestore.indexes.json`, pero **`firebase.json` no declara `indexes`** (H-14, hipótesis). |
| Entornos | **No existe staging.** `.firebaserc` apunta a `gestor-inmuebles-produccion`; `firebase-applet-config.json` fija proyecto, base `ai-studio-gestordeinmueble-…` y bucket de producción. `configuracionFirebase.ts:40` **rechaza cualquier proyecto que no sea el de producción**. |
| Pruebas | 294 archivos de prueba. CI tiene emuladores oficiales con Java 21. **Java no está disponible localmente** → el emulador oficial no se ha ejecutado en esta fase. |
| Configuración | Solo `GEMINI_API_KEY` y `APP_URL` están activos en `.env.example`; el resto son comentarios. Faltan documentar 6 variables usadas por el código. |
| Alcance económico | **No hay ninguna integración bancaria ni pasarela en el código.** Solo etiquetas declarativas `bizum`/`transferencia` como método de pago aportado por el justificante. La exclusión permanente de pagos online es compatible con el estado actual. |
| Cumplimiento fiscal | VERI*FACTU y B2B están **preparados pero desconectados**. La auditoría normativa de esta fase demuestra que **la sujeción del producto no está determinada** y que la hoja de ruta anterior daba por hecho una integración AEAT sin justificarla (D3 corregido). |
| Funciones simuladas | Al menos 8 superficies anunciadas como funcionales son simulaciones, adaptadores pendientes o interfaces sin conexión real (H-23). |

**Veredicto.** El proyecto tiene una base técnica sólida y un modelo de dominio amplio, pero **no está listo para ampliar alcance**: hay flujos rotos por cableado, un entorno de pruebas inexistente, un administrador principal codificado en múltiples capas y decisiones fiscales tomadas sin dictamen normativo. La prioridad es **reparar y verificar lo existente**, exactamente como establece la orden.

---

## 2. Auditoría del estado real del repositorio

### 2.1 Repositorio, rama, commit y cambios preexistentes (HECHO COMPROBADO)

- `git rev-parse --abbrev-ref HEAD` → `arena/fb69e0b0-gestor-de-inmuebles-vercel`.
- `git rev-parse HEAD` → `2563831df9b026dec8276c45db40977f72883f9d`, `Merge pull request #61 …`, 2026-10-21 06:52:15 +0200.
- `git rev-parse --is-shallow-repository` → `true`; `.git/shallow` contiene ese SHA. refs: `HEAD`, `main`, `origin/main`, `origin/HEAD`, todas en `2563831`.
- `git status --short` → **solo** `?? docs/AUDITORIA-FUNCIONAL-PORTALES-2026-10-27.md`. `git diff` y `git diff --cached` vacíos. **No hay cambios preexistentes de código.**
- `.gitignore` excluye `node_modules/`, `dist/`, `.env*`, artefactos de Vitest y `.cache/`. En el árbol **solo existe `.env.example`**; no hay `.env`, JSON de cuenta de servicio, `.pem` ni `.p12`.
- **Precisión de sesión:** en turnos anteriores de esta misma conversación se ejecutó `npm ci` (416 paquetes), `npm run build` (generó `dist/`, ignorado) y se escribió el informe de auditoría previo. Son artefactos **ya existentes antes de esta orden**, excluidos por `.gitignore` salvo el documento. En esta Fase 0 **no se ha instalado ni modificado nada**.

### 2.2 Correspondencia entre informe, hoja de ruta y código (HECHO COMPROBADO)

| Afirmación del informe/hoja de ruta anterior | Estado en código | Veredicto |
|---|---|---|
| 31 secciones de navegación; 30 admin, 24 propietario, 5 profesional (7 con gestor) | `seccionesDePerfil()` ejecutado: ADMIN 30, PROPIETARIO 24, PROFESIONAL 5/7 | ✅ Correcto |
| La guarda profesional permite 6/8; `inversion` indescubrible | `App.tsx:383` vs `navegacion.ts` | ✅ Correcto (H-12) |
| 4 secciones huérfanas (~3.021 líneas) | `ProfesionalesSection` 0 refs; `AdministracionSection`, `CuestionarioSection`, `SolicitudesSection` 1 ref cada una (solo import) | ✅ Correcto (H-10) |
| `SolicitudDetailModal` inalcanzable | `setSelectedSolicitudForModal` solo se usa para `null`/actualizar, nunca para abrir desde lista | ✅ Correcto (H-08) |
| OTP roto y con `Math.random()` | `actaOtpEngine.ts:30-36`, `:180-188`; `ActasSection.tsx:203-230` | ✅ Correcto, y **peor**: existe `TransportePendienteAdapter` que devuelve `enviado:false` (H-09) |
| Master parametrizable solo en backend | `MASTER_ADMIN_EMAIL` en `backendTitulares.ts:48`, pero **18+ literales** en cliente y reglas | ⚠️ Precisión necesaria (H-06) |
| `xlsxStub` era un puerto no implementado | `src/lib/importExport/xlsx.ts` lo implementa; `xlsxStub.ts` es reexportación de compatibilidad | ❌ **Corrección H-25**: ya no es una simulación |
| D1 (pagos) era decisión pendiente | Código sin pasarela ni banco | ❌ **Desviación eliminada** (§4) |
| D3 = implementar VERI*FACTU con envío a AEAT | `FacturacionSection:95/627/820` fija `modalidad:'VERIFACTU'` y `claseSistema:'VERIFACTU'` **sin dictamen previo** | ❌ **Desviación eliminada** (§4, H-17) |

### 2.3 Scripts, pruebas, reglas, índices, servicios y secciones (HECHO COMPROBADO)

- `package.json`: **no existe `test` ni `doctor`**. 22 scripts: 7 `test:bloque-*`, `test:operaciones`, `test:patrimonial`, `test:integracion`, `test:emulador:operaciones`, `test:p1-avisos`, `test:emulador:reglas`, 3 `ia:*`, 3 `auditoria:*`, `lint` (= `tsc --noEmit`).
- `test:emulador:reglas` usa `firebase-tools@15.33.0 emulators:exec --only auth,firestore,storage --project demo-gestor-reglas` con `GCLOUD_PROJECT=demo-gestor-reglas` y los tres hosts loopback. `vitest.emulador.config.ts` incluye `tests/emulador/**/*.emulador.test.ts` (8 ficheros `.emulador.test.ts`). `vite.config.ts:42` excluye esa carpeta de la suite normal.
- `tests/harness/` contiene evaluadores **propios** (`firestoreRulesEval.ts`, `storageRulesEval.ts`, `simulacionReglasFirestore.ts`) y un `servidorSmtpCaptura.ts`. `tests/ag01-alta-publica-solicitud.test.ts` declara explícitamente que **no es el emulador oficial**.
- CI: job `reglas-emulador` con Java 21 + `npm ci` + `test:emulador:reglas`; job `verificacion` con `fetch-depth: 0`, `tsc`, Vitest **excluyendo** `tests/guardia-a04-rama-sesion.test.ts`, y `npm run build`. **No ejecuta `test:integracion`.**
- `firebase.json`: `firestore` = `[{ database, rules }]`, **sin `indexes`**; emuladores auth 9099 / firestore 8080 / storage 9199, UI desactivada.
- `firestore.indexes.json`: 10 índices (6 `actas*`, 2 `gestiones_cartera`, 2 `ia_operaciones`), con nota de que varios son **opcionales** para futura migración server-side.
- `scripts/validar-ia-entorno-no-productivo.mts` y `server/ia/validacionEntornoIA.ts`: sandbox con proveedor **simulado**, rechaza producción, no toca Firestore, **no está montado en `server.ts`**.
- Secciones y servicios citados en la hoja de ruta anterior: todos los archivos existen (`servicioPortalPublico.ts` 916 líneas, `rutasPortalPublico.ts` 182, `solicitudPublica.ts` 74, `SolicitudesSection.tsx` 332, `SolicitudDetailModal.tsx` 450, `actaOtpEngine.ts` 188, `ActasSection.tsx` 823, `dispatcher.ts` 450, `rutasCronAvisos.ts` 86, `configuracionIA.ts` 228, `gobiernoIAContrato.ts` 456, `verifactuTransport.ts` 180, `adaptadoresB2B.ts` 165, `actualizacionRentaEngine.ts` 583, `ActualizacionRentaPreviewPanel.tsx` 287).

### 2.4 Firebase, Vercel, emuladores y entornos (HECHO COMPROBADO)

| Elemento | Valor | Riesgo |
|---|---|---|
| `firebase-applet-config.json` | `projectId: gestor-inmuebles-produccion`, `firestoreDatabaseId: ai-studio-gestordeinmueble-c6444afd-24ca-4983-b195-ceb2c5ebdc51`, `storageBucket: gestor-inmuebles-produccion.firebasestorage.app`, `apiKey` web pública | Es configuración de cliente (sin clave privada), pero **fija producción como destino** |
| `.firebaserc` | `projects.default = gestor-inmuebles-produccion` | Un `firebase deploy` sin `--project` publicaría en producción |
| `firebase.json` | reglas + emuladores, sin perfil de staging | No hay entorno alternativo declarado |
| `configuracionFirebase.ts:40` | `if (projectId !== 'gestor-inmuebles-produccion') return FIREBASE_PROYECTO_INCOMPATIBLE` | **Bloquea cualquier proyecto de staging**; `FIREBASE_PROJECT_ID`/`FIRESTORE_DATABASE_ID` son "overrides confirmatorios, nunca selectores" |
| `almacenGoogleStorage.ts:331` | `resolverBucketStorage()` lee `storageBucket` del config versionado | P2/documentos apuntan al bucket de producción |
| `vercel.json` | `/api/(.*)` → `/api/index`; `/(.*)` → `/index.html`; cron `0 6 * * *` a `/api/cron/avisos`; `maxDuration: 60` | Rewrite general; sin separación Preview/Production |
| `api/index.ts` | exporta la app Express | Correcto |
| Emuladores | `demo-gestor-reglas` (Auth/Firestore/Storage) vía `test:emulador:reglas` | Único aislamiento real existente |
| Staging | **No existe** | `docs/FASE-A-PUESTA-EN-MARCHA-AVISOS.md` dice literalmente: "Nada de este documento se ha ejecutado: no se ha configurado ningún secreto, no se ha desplegado y no se ha enviado ningún correo" |

`docs/P2-aceptacion-emuladores.md` documenta guardarraíles valiosos: la prueba P2 **se niega a arrancar** si `NODE_ENV`, `GCLOUD_PROJECT`, los hosts, el proyecto demo, entorno Vercel o credenciales Google no coinciden; usa correos `sintetico.invalid`; no lee `.firebaserc` como destino. **Es la única garantía de aislamiento demostrada en el repositorio.**

### 2.5 Autenticación, permisos y administrador principal (HECHO COMPROBADO)

- `ADMIN_MASTER_EMAIL = 'sarqsan2@gmail.com'` en `authService.ts:45`. **Literal repetido** en `App.tsx:3376`, `LoginView.tsx:273/480`, `AdminControlCenter.tsx:247`, `InmueblesSection.tsx:509`, `features/operaciones/persistence/authorization.ts:4`, `accesoPropietariosFirebase.ts:11`, `gestionesCarteraServicioFirebase.ts:53/207`, `onboardingCarterasFirebase.ts:21`, `firebase.ts:363/3196/3431/3560`, `data/mockData.ts:148`, y `firestore.rules:29`.
- Único punto parametrizado: `EMAIL_MASTER = process.env.MASTER_ADMIN_EMAIL || 'sarqsan2@gmail.com'` (`backendTitulares.ts:48`).
- **Custom claims:** `src/lib/carterasGestion.ts:28` documenta que **no existe `firebase-admin` ni backend autorizado para `setCustomUserClaims`**, y que la orden prohíbe instalarlo/simularlo. Por tanto, D5 no puede resolverse con claims sin **añadir una dependencia y un backend privilegiado** (requiere autorización específica).
- `LoginView.tsx:475` muestra **siempre** el botón "Configurar Administrador Principal" (`initFirstAdminAccount`, `authService.ts:429`) cuando no hay sesión; la comprobación de "BD vacía" no está verificada en servidor. `hashPassword` usa SHA-256 sin sal y un fallback hash aritmético no criptográfico (`authService.ts:120-140`); `passwordHash` se persiste en `usuarios` (`:318/329/362/483/774`).
- Permisos granulares `PERMISOS_SISTEMA` y `ROLES_PREDEFINIDOS`: solo se usan en `CrearUsuarioModal`, ayuda/tutoriales y presentación; **no hay enforcement** en guards ni reglas. `modulosConfig` no se consulta en `navegacion.ts`.
- **No existe entidad organización/tenant** (`organizacionId`/`tenantId` sin resultados). El aislamiento es por `propietarioId`, `inmuebleIds`, `carterasL/E` y `usuarios_auth`.
- Reglas de lectura amplia: `fichas_publicas_inmueble` `allow get: if true` y `list: if isSignedIn()` (`:1423`), `especialidades` `allow read: if true` (`:2582`), `system/modulos_config` legible sin sesión (`:2223`), `audit_logs` `allow create: if isSignedIn()` (`:2597`).

### 2.6 Semillas y estados iniciales (HECHO COMPROBADO)

- `App.tsx:1279` llama `seedInitialDataIfEmpty()` **en cada inicio de sesión de ADMINISTRADOR**. `firebase.ts:197-225` escribe `system/metadata`, `configuracion_aseguradoras` desde `INITIAL_ASEGURADORAS` y delega en `seedAuthAndRolesIfEmpty()`.
- `firebase.ts:3421-3484` crea, si `usuarios` está vacía: `user_admin_principal` (con el correo master), `user_propietario_demo`, `user_profesional_demo`, especialidades por defecto, `prof_demo_1` y módulos. **No hay flag `SEEDS_ENABLED`.**
- `App.tsx:395-473`: 11 estados se inicializan con `INITIAL_*` de `mockData.ts` o con caché `localStorage` (`rentselect_*`): propietarios, candidatos, inmuebles, solicitudes, invitaciones, slots, solicitudes_doc, contratos, aseguradoras, solicitudes_seguro, gmail_config, userProfile. `firebase.ts:1024` y `:2747` también usan `INITIAL_*` como fallback de suscripción.

### 2.7 Cobertura de pruebas (HECHO COMPROBADO + MEDICIÓN PREVIA)

- 294 archivos de prueba. Desglose por nombre: `regla` 10, `storage` 6, `factura` 6, `notific` 4, `justific` 4, `documento` 3, `solicitud` 2, `renta` 2, `actas` 1, `B2B` 1, `aviso` 1, `cron` 1. **Cero archivos con `otp`, `portal-publico`, `verifactu`, `irav`, `profesional` en el nombre.**
- `tests/emulador/` tiene 8 suites oficiales (documentos P3, documentos servidor, importación, justificantes, inmuebles, storage-ámbitos). `tests/ag01…` y `tests/ag02…` usan **harness propio**, no emulador.
- **Mediciones obtenidas en el turno anterior de esta misma sesión, sobre el mismo HEAD, y NO reejecutadas en esta Fase 0 para no generar artefactos:**

| Comando | Resultado previo reproducible |
|---|---|
| `npx tsc --noEmit` | EXIT 0 |
| `npm run build` | EXIT 0; chunk principal 5.545,94 kB / 1.380,26 kB gzip |
| `npx vitest run --reporter=dot` | 276 archivos · 4.943 pruebas · 4.932 OK · 2 fallos (`guardia-a04-rama-sesion`, por refs ausentes) · 2 skipped · 7 todo |
| `npm run test:integracion` | 302 pruebas · 299 OK · 3 fallos (guardas de commits históricos `f782…`/`46bb…`) |
| `npm audit --omit=dev` | 9 vulnerabilidades (1 crítica `dompurify@3.4.15`, 8 altas: `nodemailer`, `body-parser`, `source-map-js`, `vite`, `@grpc/grpc-js`/`firebase`) |
| `npx tsx scripts/guardia-a04-repositorio.mts` | `A-04: BLOCKED` (falta `origin/<rama>` en clon superficial) |
| Servidor sin secretos (`NODE_ENV=development npx tsx server.ts`) | `/api/health` 200 con `MODO_SEGURO`, `APROBACION_PENDIENTE`, `llaves: NO_CONFIGURADO`; cron/visita/cuestionario/documentación 503; notificaciones 403; IA 503 |

- **Bloqueo real:** `java: command not found`. El emulador oficial **no se ha ejecutado en esta fase**. CI sí dispone de Java 21. **No se declaran superadas las pruebas de emulador.**

### 2.8 Correo, cron, IA y servicios en alcance (HECHO COMPROBADO)

| Servicio | Variables | Estado |
|---|---|---|
| Correo saliente | `EMAIL_PROVEEDOR`, `SMTP_URL`, `RESEND_API_KEY`, `SENDGRID_API_KEY`, `EMAIL_FROM`, `EMAIL_REPLY_TO`, `EMAIL_DESPACHO_NOMBRE`, `ENABLE_EMAIL` | `MODO_SEGURO` por defecto; `ENABLE_EMAIL=true` **no basta**. Existe `tests/harness/servidorSmtpCaptura.ts` para pruebas sin buzón real |
| Cron avisos | `CRON_SECRET`, `TZ`, `VERCEL`, `VERCEL_ENV` | `vercel.json` 06:00 UTC; sin secreto → 503 `cron_no_configurado` |
| IA (12 operaciones) | `IA_POLITICA_JSON`, `IA_LLAVES_CLAVE_MAESTRA`, `IA_LLAVES_SIN_LLAVE`, `IA_LLAVES_VERIFICACION`, `GEMINI_API_KEY` | Denegada por defecto (`APROBACION_COMERCIAL_PENDIENTE`); `IA_LLAVES_SIN_LLAVE=RESPALDO` y `VERIFICACION=DESACTIVADA`; sandbox no productivo no montado en servidor |
| Cuenta de servicio | `FIREBASE_SERVICE_ACCOUNT`, `_B64`, `_PATH`, `GOOGLE_APPLICATION_CREDENTIALS`, `FIREBASE_PROJECT_ID`, `FIRESTORE_DATABASE_ID`, `GCLOUD_PROJECT` | Sin credencial → `FIREBASE_CREDENCIAL_AUSENTE` → portales, custodia, justificantes, seguimiento, titulares → 503 |
| Seguimiento | `SEGUIMIENTO_ADMIN_USUARIO_ID` | Variable usada, no documentada |
| Catastro | ninguna | `POST /api/catastro/consultar` (`server.ts:2215`) **sin autenticación ni rate limit**, hace fetch a `ovc.catastro.meh.es` con timeout 7 s |
| Gmail API aseguradoras | OAuth cliente (`googleAuth.ts`, `gmailClient.ts`) | Funcional pero usa la **misma app Firebase Auth** que la sesión ERP (H-22, hipótesis) |

`.env.example` **no documenta** `FIREBASE_SERVICE_ACCOUNT*`, `FIRESTORE_DATABASE_ID`, `FIREBASE_PROJECT_ID`, `TZ`, `SEGUIMIENTO_ADMIN_USUARIO_ID` ni `STORAGE_BUCKET`. Es una laguna de P0.1.

### 2.9 Riesgos: secretos, acceso cruzado, escritura en producción y pérdida de datos

| Riesgo | Evidencia | Clasificación |
|---|---|---|
| Escritura accidental en producción | `seedInitialDataIfEmpty()` en login admin + `.firebaserc` producción + `resolverBucketStorage()` producción + `configuracionFirebase.ts:40` | **HECHO** — cualquier login de admin en el despliegue real puede sembrar datos demo |
| Exposición de secretos | No hay `.env` ni credenciales en el árbol; `firebase-applet-config.json` solo contiene claves públicas de cliente; `.gitignore` cubre `.env*` | **HECHO (bajo)** — no se han encontrado secretos versionados |
| Acceso cruzado | Sin modelo de organización; `fichas_publicas_inmueble.list` para cualquier firmado; `especialidades` público; `audit_logs.create` para cualquier firmado | **HECHO** — superficie pública deliberada, pero requiere revisión de límites |
| Escrituras anónimas | `solicitudes.create` y `candidatos.create` sin sesión (`firestore.rules:2086`, `:2059`); sin CAPTCHA, rate limit ni límite de longitud; `express.json` 50 MB global (`server.ts:158`); sin `helmet`/`cors`/rate-limit | **HECHO** — spam/DoS/coste |
| Pérdida de datos | `registroCobros[]`, `mensajeIds`, `incidenciaIds`, `anexos` embebidos en `contratos_formalizacion` (`types.ts:1351-1388`); límite Firestore 1 MiB [1](https://firebase.google.com/docs/firestore/quotas); caché `localStorage`; almacén efímero retirado | **HIPÓTESIS** el tamaño real; **HECHO** el modelo embebido |
| Bootstrap de master sin control | `LoginView.tsx:475` + `initFirstAdminAccount` | **HIPÓTESIS** de explotabilidad; requiere prueba en emulador |

### 2.10 Funciones anunciadas como implementadas que son simulaciones (HECHO COMPROBADO)

1. `VerifactuTransportPendiente` (`verifactuTransport.ts:38-60`): `preparado = false`, devuelve `INDISPONIBLE` — "Conexión real con la AEAT no implementada".
2. `AdaptadorSpfeB2B` / `AdaptadorPlataformaPrivadaPendiente` (`adaptadoresB2B.ts:87-138`): `disponible(): false`, con texto **obsoleto** "calendario de obligatoriedad pendiente de orden ministerial".
3. `src/sindicacion/adaptadores.ts:14/152`: `PORTAL_NO_CONECTADO`; `PublicacionInmueblesPanel.tsx:461`: "sin publicar automáticamente".
4. `DetalleSolicitudSeguroModal.tsx:480-500`: respuesta de aseguradora **simulada**, con aviso explícito.
5. `DetallePolizaModal.tsx:240-254`: "Extracción simulada - documento no accesible para IA".
6. `DashboardEjecutivoSection.tsx:1147`: "Asistente contextual IA — Preparado… No implementado ahora por especificación".
7. `AdministracionSection.tsx:820`: etiqueta "Próximamente" (en sección huérfana).
8. `src/notificaciones/canales.ts:14`: WhatsApp descartado como canal operativo; `ActualizacionRentaPreviewPanel.tsx:207`: "no se envía correo, no se publica en la bandeja, no se firma".
9. `actaOtpEngine.ts:180-188`: `TransportePendienteAdapter` devuelve `enviado: false`.
10. **No es simulación (corrección H-25):** `xlsxStub.ts` — hoy reexporta el adaptador real `xlsx.ts` (ZIP/DEFLATE propios).

---

## 3. Matriz de hallazgos

Severidad: **S1** alto (bloquea P0 o riesgo serio) · **S2** medio · **S3** bajo. Columna "Tipo": **C** = comprobado, **H** = hipótesis, **P** = pendiente de verificar.

| ID | Hallazgo | Evidencia | Sev. | Prueba necesaria | Corrección propuesta | Tipo |
|---|---|---|---|---|---|---|
| H-01 | Clon superficial: faltan refs y commits históricos | `.git/shallow`, `git rev-parse --is-shallow-repository=true` | S3 | Reejecutar con `fetch-depth: 0` | CI ya lo hace; hacer saltar las 5 guardas con mensaje claro | C |
| H-02 | Sin entorno de staging; backend rechaza cualquier proyecto ≠ producción | `configuracionFirebase.ts:40`, `.firebaserc`, `firebase.json` | S1 | Inyectar config alternativa → `FIREBASE_PROYECTO_INCOMPATIBLE` | P0.1: diagnóstico contra emuladores; cualquier cambio de proyecto requiere código autorizado | C |
| H-03 | `.firebaserc` por defecto en producción | `.firebaserc` | S1 | `firebase use` / `--project` | Prohibir `deploy` sin `--project demo-…`; CI sin secrets de despliegue | C |
| H-04 | Semillas de demo en login de admin | `App.tsx:1279`, `firebase.ts:197-225/3421-3484` | S1 | Test con `SEEDS_ENABLED` ausente | Flag `SEEDS_ENABLED=false` por defecto | C |
| H-05 | Master codificado en 18+ sitios; solo backend parametrizado | `firestore.rules:29`, `authService.ts:45`, `backendTitulares.ts:48`, 14 literales más | S1 | Test de paridad de constantes | Unificar; claims requieren `firebase-admin` (no instalado, `carterasGestion.ts:28`) | C |
| H-06 | `initFirstAdminAccount` expuesto sin control de "BD vacía" en servidor | `LoginView.tsx:475/102`, `authService.ts:429` | S2 | Prueba en emulador con BD vacía | Limitar a flujo de instalación con token/flag | H |
| H-07 | `passwordHash` SHA-256 sin sal + fallback aritmético | `authService.ts:120-140/318/362/483/774` | S2 | Revisar que no autentique por sí mismo | Eliminar; confiar solo en Firebase Auth | C |
| H-08 | Solicitudes públicas sin bandeja ni cableado del modal | `App.tsx:494/4504/4755`, `SolicitudesSection.tsx`, `SolicitudDetailModal.tsx` | S1 | Test de cableado + E2E emulador | P0.2 | C |
| H-09 | Altas anónimas sin antispam; catastro sin auth; body 50 MB | `firestore.rules:2086/2059`, `server.ts:2215/158` | S1 | Carga + emulador de reglas | P0.2 (servidor por token, rate limit, honeypot, límites) | C |
| H-10 | OTP no entregado, `Math.random()`, código descartado | `actaOtpEngine.ts:30-36/180-188`, `ActasSection.tsx:203-230` | S1 | E2E emulador acta→firma→PDF | P0.3 | C |
| H-11 | 4 secciones huérfanas (~3.021 líneas) + 5 módulos sin refs | `ProfesionalesSection`, `AdministracionSection`, `CuestionarioSection`, `SolicitudesSection`, `auditoriaHistoricaRoadmap01`, `conciliacionSession`, `migracionTitularidades`, `facturacionReporte`, `publicacionCicloPatrimonial` | S2 | Script de imports sin uso | P0.4 decidir/montar/eliminar | C |
| H-12 | Permisos granulares y toggles de módulos sin efecto | `types.ts:2158`, `navegacion.ts:490`, `App.tsx:542` | S2 | Tests de enforcement | P0.4 aplicar o retirar | C |
| H-13 | Menú 5/7 vs guarda 6/8 en PROFESIONAL (`inversion`) | `navegacion.ts` vs `App.tsx:383` | S3 | `seccionesDePerfil()` | P0.4 paridad | C |
| H-14 | 10 índices declarados pero `firebase.json` sin clave `indexes` | `firebase.json`, `firestore.indexes.json` | S2 | `firebase deploy --only firestore:indexes --dry-run` (no ejecutar ahora) | Documentar el mecanismo real de despliegue | H |
| H-15 | `.env.example` incompleto (6 variables usadas sin documentar) | `.env.example` vs `grep process.env` | S2 | Contraste automático | P0.1 `CONFIGURACION-VERIFICABLE.md` | C |
| H-16 | Sin `npm test` ni `doctor`; CI sin `test:integracion`; guardia A-04 excluida | `package.json`, workflow líneas 99/116/158 | S2 | CI verde | P0.4 añadir `test` y meter integración | C |
| H-17 | VERI*FACTU: modalidad fijada en código sin dictamen; texto B2B obsoleto | `FacturacionSection.tsx:95/627/820`, `adaptadoresB2B.ts:87`, `types/facturacion.ts:16` | S1 | Auditoría normativa + test de modalidad | D3: dictamen previo; después decidir | C |
| H-18 | IRAV y fuentes normativas codificadas con caducidad 45 días | `actualizacionRentaEngine.ts:73-85`, `MAX_DIAS_ANTIGUEDAD_FUENTE_IRAV` | S2 | Simular fecha >45 días | P1 fuente oficial versionada | C |
| H-19 | `registroCobros` embebido → posible límite 1 MiB | `types.ts:1383`, cuotas Firestore | S2 | Auditoría de volumen/tamaño real | **AE-01, sin migración preventiva** | H |
| H-20 | 9 vulnerabilidades npm y bundle 5,55 MB | Medición previa, `npm audit`, `npm run build` | S2 | `npm audit --omit=dev` | P1 (requiere autorización para tocar lockfile) | C |
| H-21 | Lecturas amplias: `get:true`, `list:isSignedIn`, `audit_logs.create` abierto | `firestore.rules:1423/2582/2223/2597`, `storage.rules:56-60` | S2 | Emulador de reglas | P0.2/P0.4 revisar | C |
| H-22 | Gmail OAuth comparte instancia Firebase Auth de la sesión | `googleAuth.ts:11-20`, `firebase.ts:137` | S2 | Auth Emulator | P1/P2 app con nombre propio | H |
| H-23 | 9 simulaciones inventariadas (§2.10) | rutas citadas | S2 | Inventario + etiquetado UI | P0.4 / P1 etiquetar honestamente | C |
| H-24 | Sin modelo organización/tenant | búsqueda `organizacionId`/`tenantId` sin resultados | S2 | Revisión de modelo | P1 gobernanza evalúa antes de multi-tenant | C |
| H-25 | `xlsxStub` **no** es un stub (precisión) | `src/lib/importExport/xlsx.ts` | S3 | Test existente | No corregir; documentar | C |
| H-26 | Java ausente → emulador oficial no ejecutado aquí | `java -version` | S1 | Ejecutar en CI (Java 21) | Usar CI; no declarar pruebas superadas | C |

---

## 4. Desviaciones de la hoja de ruta original (corregidas)

| # | Elemento original | Desviación | Corrección aplicada |
|---|---|---|---|
| D-01 | **D1** como decisión pendiente con opciones de pasarela | Reabría una decisión **cerrada** | **Eliminada.** D1 = exclusión permanente, sin alternativas |
| D-02 | **P1.1** "Pago online / verificación" con variante Stripe/Redsys/Bizum | Integración prohibida | **Eliminada la variante.** Sustituida por P1.1 de gestión documental de justificantes |
| D-03 | **P1.2** "Conexión bancaria PSD2 / AISP" | Prohibida | **Eliminada íntegramente**, junto con sus tests, variables, contratos y métricas |
| D-04 | Dependencias `D1 → P1.1/P1.2 → métricas` | Cadena prohibida | **Eliminada** del grafo de dependencias |
| D-05 | Variables `PAYMENTS_ENABLED`, `PAYMENTS_PROVIDER`, `BANK_AISP_*` | Contratos y secretos innecesarios | **No existen en el código; no se introducen** |
| D-06 | Métrica "% recibos pagados dentro del portal >50 %" | Implica movimiento de dinero | Sustituida por "% justificantes con revisión humana documentada" y "0 cobros confirmados por IA" |
| D-07 | **P1.13** migración anticipada de `registroCobros` a subcolección | Migración preventiva sin evidencia | **Desactivada.** Pasa a **AE-01**: auditoría de modelo/volumen/límites/compatibilidad; solo migrar si hay evidencia |
| D-08 | **D3 = A** "SIF modalidad VERI*FACTU con envío a AEAT" | Asumía integración externa sin justificar | **Sustituida por auditoría normativa previa.** Ver §5 P1.4 y §6 |
| D-09 | Texto B2B "pendiente de orden ministerial" | **Obsoleto**: Orden HAC/1028/2026 en vigor 6-10-2026 [1](https://sede.agenciatributaria.gob.es/Sede/todas-noticias/2026/octubre/7/solucion-publica-facturacion-electronica.html) | Corregir el texto, pero **sin implementar** hasta el dictamen |
| D-10 | **D4 = A** "activar IA con política aprobada" | Activación prematura | **D4 = IA desactivada por defecto**; verificar política, privacidad, límites y claves antes de cualquier activación |
| D-11 | **D5 = B** "custom claim en P1" | Infraestructura no disponible (`firebase-admin` ausente) | **D5 = evaluar sin romper auth**; parametrización primero, claims solo con autorización de dependencia |
| D-12 | **D6 = B** como decisión a solicitar | Ya está cerrada por la orden | **D6 = directriz aplicada**: preparar Fase 0 + P0, sin autorización automática |
| D-13 | Fase 0 creaba "proyecto Firebase staging, secretos, buzón, contratos" | Prohibido en esta fase | Fase 0 **solo audita**; la creación de recursos queda condicionada a autorización posterior |
| D-14 | P2.A "API + marketplace" sin salvedad | Podría reintroducir pagos con otro nombre | Se añade salvedad explícita: **solo intercambio documental**, sin banca ni pagos |
| D-15 | P2.B "IA agentiva" sin salvedad | Podría contabilizar cobros | Se añade: la IA **propone y extrae**, nunca confirma pagos ni contabiliza |
| D-16 | Comparativa de mercado presentaba pagos/banca como "brechas a cerrar" | Contradice el alcance | Se reinterpreta como **referencia de mercado no adoptada por decisión de producto** |

**Nota sobre etiquetas `bizum`:** `MetodoPagoDeclaradoJustificante` y los formularios usan `bizum`/`transferencia`/`domiciliacion`/`efectivo` como **declaración del medio por el que el inquilino dice haber pagado**. Es documentación, no integración. Se conserva.

---

## 5. Hoja de ruta revisada

> Regla común: **ninguna tarea se da por confirmada hasta localizarla en el código y disponer de pruebas suficientes.** Todas las fases P1/P2 quedan **sujetas a autorización expresa**; P2 son propuestas, no compromisos.

### FASE 0 — Preparación (este informe; sin código)

Entregable: este documento + aprobación de las decisiones pendientes estrictamente necesarias (§10). **Sin crear recursos.**

### P0 — Funcionamiento real y seguridad (objetivo inicial, 4 sprints tras autorización)

#### P0.1 — Diagnóstico operativo, configuración verificable, administración principal y semillas

| Tarea | Archivos | Pruebas | Criterio de salida |
|---|---|---|---|
| P0.1.1 `scripts/doctor.mjs` + `npm run doctor` (solo lectura; acepta URL destino; **rechaza explícitamente dominios de producción**) | `package.json`, `scripts/doctor.mjs` | `tests/doctor.test.ts` | Imprime matriz de 8 capacidades; nunca reporta verde si faltan secretos |
| P0.1.2 Ampliar `/api/health` con `portalesPublicos`, `custodia`, `actualizacionRenta`, `seguimiento`, `modoEmail`, `cron` (sin secretos) | `server.ts:2724` | `tests/health-capacidades.test.ts` | 200 con estado real; cero credenciales en la respuesta |
| P0.1.3 `docs/CONFIGURACION-VERIFICABLE.md`: mapa completo de las 24 variables usadas, incluyendo las 6 no documentadas | `.env.example` (solo documentación; **sin activar valores**) | `tests/configuracion-documentada.test.ts` | 24/24 variables explicadas con origen y efecto |
| P0.1.4 Unificar `ADMIN_MASTER_EMAIL` en `src/lib/masterAdmin.ts`; backend usa la misma fuente; **sin tocar `firestore.rules` todavía** | `authService.ts:45`, `backendTitulares.ts:48`, 14 literales | `tests/master-admin-paridad.test.ts` | Un solo literal; `MASTER_ADMIN_EMAIL` funciona en backend y cliente |
| P0.1.5 `SEEDS_ENABLED=false` por defecto; sembrar solo con variable explícita | `App.tsx:1279`, `firebase.ts:197-225/3421-3484` | `tests/seeds-desactivados.test.ts` | Login de admin en emulador **no escribe** `system/metadata` ni usuarios demo |
| P0.1.6 Estados iniciales vacíos cuando hay sesión; `INITIAL_*` solo como fallback explícitamente etiquetado | `App.tsx:395-473`, `firebase.ts:1024/2747` | `tests/estado-inicial-vacio.test.tsx` | Sin datos de demo visibles antes del primer snapshot |
| P0.1.7 Etiquetar en UI las 9 simulaciones de H-23 | componentes citados en §2.10 | `tests/etiquetado-simulaciones.test.tsx` | Ningún botón sugiere resultado real donde no lo hay |

**Dependencias:** ninguna. **Bloquea a:** P0.2, P0.3, P1.2, P1.4.

#### P0.2 — Solicitudes públicas, antispam, bandeja y conversión explícita

| Tarea | Archivos | Pruebas | Criterio de salida |
|---|---|---|---|
| P0.2.1 Mover alta de `solicitudes` a `POST /api/solicitud/:token`, reutilizando `servicioPortalPublico.ts` | `server/portalPublico/*`, `src/lib/solicitudPublica.ts`, `App.tsx:2482` | `tests/ag03-solicitud-servidor.test.ts` (espejo de `ag02`) | El cliente anónimo no importa SDK de Firebase para esta alta |
| P0.2.2 Endurecer `firestore.rules`: retirar `create` anónimo de `solicitudes`/`candidatos`; solo servidor | `firestore.rules:2059/2086` | `tests/emulador/reglas-solicitud-anonima.emulador.test.ts` | Emulador oficial deniega escritura directa |
| P0.2.3 Rate limit por IP/token + honeypot + longitud máxima; **sin dependencias nuevas** si es posible | `rutasPortalPublico.ts`, nuevo `server/shared/rateLimit.ts` | `tests/rate-limit-solicitud.test.ts` | 100 peticiones/min no contaminan la colección |
| P0.2.4 Revisar `/api/catastro/consultar`: exigir sesión o token y límite | `server.ts:2215` | `tests/catastro-autenticacion.test.ts` | Sin sesión → 401/403; con sesión → respuesta acotada |
| P0.2.5 Bandeja de solicitudes (montar `SolicitudesSection` o pestaña en `CandidatosSection`) | `SolicitudesSection.tsx`, `App.tsx:4504` | `tests/solicitudes-bandeja.test.tsx` | Solicitud visible en <5 s desde el alta |
| P0.2.6 Cablear `setSelectedSolicitudForModal(sol)` y cambio de estado | `App.tsx:494/4755`, `SolicitudDetailModal.tsx` | `tests/solicitud-detalle-cableado.test.tsx` | Se abre, se valora y se cambia estado |
| P0.2.7 Conversión explícita solicitud → candidato con estado y traza | `src/lib/conversionSolicitud.ts` (nuevo) | `tests/conversion-solicitud.test.ts` | Si falla el candidato, la solicitud sigue visible y marcada |
| P0.2.8 Revisar lecturas amplias de H-21 | `firestore.rules:1423/2582/2597` | `tests/emulador/reglas-lecturas-amplias.emulador.test.ts` | `audit_logs.create` restringido; get público solo donde es deliberado |

#### P0.3 — Firma OTP segura, entrega y pruebas extremo a extremo (D2)

| Tarea | Archivos | Pruebas | Criterio de salida |
|---|---|---|---|
| P0.3.1 CSPRNG en `generarCodigoOtp` (`crypto.getRandomValues`) | `actaOtpEngine.ts:30-36` | `tests/otp-csprng.test.ts` | `Math.random` ausente en generación de secretos |
| P0.3.2 Evento `acta.otp_firma` en plantillas/dispatcher; entrega por correo **o** bandeja interna según decisión P-02 | `plantillas.ts`, `dispatcher.ts`, `ActasSection.tsx:203-230` | `tests/acta-otp-entrega.test.tsx` | El firmante recibe el código; `enviado: true` verificable |
| P0.3.3 Eliminar `codigoPlainTemporal` de UI; reglas permiten solo hash/estado/intentos | `actaOtpEngine.ts:72-73`, `firestore.rules:3630-3660` | `tests/emulador/reglas-actas-otp.emulador.test.ts` | Código nunca en logs, pantalla ni documento legible por terceros |
| P0.3.4 E2E emulador: solicitar → recibir → validar → FIRMADA → PDF inmutable | `ActasSection.tsx`, `actaFirmaEngine.ts` | `tests/acta-firma-e2e.emulador.test.tsx` | Un acta cambia de estado de extremo a extremo |
| P0.3.5 Sustituir `TransportePendienteAdapter` por adaptador real o eliminarlo | `actaOtpEngine.ts:180-188` | `tests/otp-transporte.test.ts` | No queda ruta que devuelva `enviado:false` en silencio |

**D2 aplicada:** se repara y verifica el OTP propio **antes** de valorar proveedores de firma cualificada. Signaturit/FNMT quedan fuera de P0.

#### P0.4 — Secciones huérfanas, permisos efectivos, navegación, módulos, dependencias y CI

| Tarea | Archivos | Pruebas | Criterio de salida |
|---|---|---|---|
| P0.4.1 Decisión P-03: montar o migrar `ProfesionalesSection`; eliminar imports muertos | `ProfesionalesSection.tsx`, `App.tsx:216/228/305` | `tests/secciones-montadas.test.tsx` | Cero secciones huérfanas |
| P0.4.2 Decisión P-04: permisos granulares y toggles → aplicar o retirar/renombrar | `types.ts:2158`, `navegacion.ts:490`, `App.tsx:542` | `tests/permisos-efectivos.test.ts`, `tests/modulos-efectivos.test.ts` | Ningún control da falsa sensación de autorización |
| P0.4.3 Paridad menú↔guarda (H-13) | `navegacion.ts`, `App.tsx:383` | `tests/paridad-nav-guarda.test.ts` | 30/24/5(7) coinciden con guardas |
| P0.4.4 `npm test` único + `test:integracion` en CI + guardas históricas que saltan con mensaje | `package.json`, workflow | CI verde | `npm test` ejecuta todo; 0 fallos en clon profundo |
| P0.4.5 Corregir texto normativo obsoleto de B2B **sin implementar integración** | `adaptadoresB2B.ts:87`, `types/facturacion.ts:16` | `tests/texto-normativo.test.ts` | El código ya no afirma que la orden ministerial está pendiente |
| P0.4.6 Documentar despliegue de índices (H-14) sin publicarlos | `docs/CONFIGURACION-VERIFICABLE.md` | Contraste con `firebase.json` | Mecanismo confirmado o marcado como pendiente P |

**Criterio de salida global P0:** `tsc`, `npm test`, `build`, emulador oficial en CI, `npm run doctor` en modo emulador; sin escrituras en producción; sin dependencias nuevas salvo autorización.

### P1 — Mejoras funcionales y cumplimiento (sujetas a autorización)

#### P1.1 — Gestión documental de cobros (SIN movimiento de dinero)

- Mejorar `PresentarJustificanteCobro.tsx`, `JustificantesCobroInbox.tsx` y `server/cobros/justificantesCobro.ts`: extracción de importe/fecha/ordenante como **propuesta**, revisión humana, rechazo/rectificación con motivo, trazabilidad y conciliación **manual**.
- **Invariante verificable:** ningún justificante, ni la IA, llama a `registrarPagoPeriodo`. El registro definitivo lo hace una persona desde `CobrosSection.tsx:290`.
- Pruebas: `tests/justificantes-sin-contabilizacion.test.ts`, `tests/emulador/justificantes-cobro.emulador.test.ts` (ya existe).
- Criterio: 100 % de justificantes con estado documental y auditoría; 0 cobros marcados automáticamente.

#### P1.2 — Fuente oficial del IRAV viva

- `server/indices/fuenteIrav.ts`: descarga/versión/firma de la serie IRAV1 del INE (publicación mensual [1](https://www.ine.es/uc/oC7D0Ncd)); `actualizacionRentaEngine.ts` consume la fuente inyectada, no la constante.
- Pruebas: `tests/irav-fuente-viva.test.ts`, simulación de antigüedad >45 días, comparación con `FUENTES_IRAV_OFICIALES` actual (2026M08 2,47 %; 2026M09 2,54 %).
- Criterio: sin redeploy se usa el último IRAV; si la fuente caduca, avisa y **no calcula**.
- **No** se sustituye la revisión legal de `RDL 29/2026` y `BOE-A-2026-20823` ya codificada; se audita su vigencia antes de cada campaña.

#### P1.3 — Mensajería del propietario

- Llevar `mensajes_portal` al portal del propietario con el mismo ámbito de `InquilinosSection`.
- Pruebas: `tests/mensajes-propietario.test.tsx`. Criterio: propietario responde a su inquilino sin fuga entre contratos.

#### P1.4 — Auditoría normativa fiscal previa (D3) — **sin código fiscal**

Antes de cualquier cambio en facturación, emitir un dictamen documentado que responda:

1. ¿Es el ERP un **SIF** sujeto al RRSIF? La AEAT excluye expresamente "todas aquellas operaciones que no se documenten con factura porque no haya obligación de expedir factura" y afirma que "el RRSIF no aplica a sistemas informáticos que no expidan facturas" [2](https://sede.agenciatributaria.gob.es/Sede/iva/sistemas-informaticos-facturacion-verifactu/preguntas-frecuentes/cuestiones-generales-ambitos-aplicacion.html).
2. El propietario que alquila una **vivienda a una persona física no tiene obligación de expedir factura** (salvo empresario/persona jurídica/AAPP o exigencia del destinatario) [6](https://sede.agenciatributaria.gob.es/Sede/iva/iva-operaciones-inmobiliarias/preguntas-frecuentes-sobre-iva-arrendamiento-inmuebles/facturacion.html). Por tanto, los **recibos de alquiler B2C** podrían quedar fuera del RRSIF.
3. La AEAT también recoge el caso de arrendamiento sin empleados que no se considera actividad económica a efectos de IRPF, con exclusión del RRSIF para esas facturas y uso voluntario del aplicativo de la Sede [2](https://sede.agenciatributaria.gob.es/Sede/iva/sistemas-informaticos-facturacion-verifactu/preguntas-frecuentes/cuestiones-generales-ambitos-aplicacion.html).
4. La factura electrónica B2B **no es obligatoria** cuando el destinatario es consumidor particular (B2C), cuando no existe obligación de expedir factura, ni en operaciones internacionales [13](https://sede.agenciatributaria.gob.es/Sede/eu_es/iva/factura-electronica/cuestiones-generales/quienes-estan-obligados-que-operaciones-incluyen.html). La app etiqueta el receptor como "Inquilino / receptor" (`FacturacionSection.tsx:516`), lo que sugiere B2C mayoritario.
5. Plazos vigentes: RRSIF 1-1-2027 (Impuesto sobre Sociedades) y 1-7-2027 (resto) [3](https://sede.agenciatributaria.gob.es/Sede/todas-noticias/2025/diciembre/3/ampliacion-plazo-adaptacion-sistemas-informaticos-facturacion.html); FE B2B 6-10-2027 (>8 M€), 6-10-2028 (resto) y comunicación de estados 6-10-2029 para personas físicas [3](https://sede.agenciatributaria.gob.es/Sede/iva/factura-electronica/calendario-implantacion.html).
6. Incertidumbres a documentar: ¿el usuario del ERP es un **gestor que factura honorarios** a propietarios (actividad económica → sí SIF)?; ¿hay arrendamiento de **locales/oficinas o a empresas** (sí obligación de factura)?; ¿el ERP se **comercializa** como SIF (obligaciones de productor y declaración responsable)?; ¿se elige modalidad **VERI*FACTU o NO VERI*FACTU**? Ambas son válidas [7](https://sede.agenciatributaria.gob.es/Sede/iva/sistemas-informaticos-facturacion-verifactu/preguntas-frecuentes/sistemas-verifactu.html).

**Criterio de salida P1.4:** dictamen por escrito, con las operaciones del ERP clasificadas en "sujeto / no sujeto / dudoso" y la modalidad elegida. **Sin él no se implementa transporte AEAT ni plataforma B2B.**

#### P1.5 — Cumplimiento fiscal condicionado (solo si P1.4 lo exige)

- Si procede: `VerifactuTransportAeat` con certificado en backend, acuse, reintentos idempotentes, declaración responsable de SIF, QR y huella ya existentes.
- Si procede B2B: evaluar SPFE frente a plataforma privada, con la copia fiel UBL que exige la Orden [4](https://sede.agenciatributaria.gob.es/Sede/iva/factura-electronica/cuestiones-generales/obligaciones-intervinientes-sistema-factura-electronica.html).
- Si **no** procede: mantener hash/QR internos, **corregir `modalidad:'VERIFACTU'` fijada en `FacturacionSection.tsx:95/627/820`** para que sea configurable, y etiquetar la pantalla como "preparación, sin remisión".
- Pruebas: `tests/verifactu-modalidad-configurable.test.ts`, `tests/b2b-adaptador-disponibilidad.test.ts`.

#### P1.6 — Portal del profesional

- Presupuestos, valoraciones, **facturas propias aportadas por el profesional**, calendario, SLA y fotos de campo. Sin pagos: el profesional **aporta documentación**; el registro contable lo revisa la gestión.
- Reutiliza `ProfesionalesSection` montado en P0.4. Pruebas: `tests/portal-profesional-ciclo.test.tsx`.

#### P1.7 — PWA y notificaciones

- Manifest, service worker, Web Push/INAPP, preferencias por evento. Sin push de pago. Pruebas: `tests/pwa-manifest.test.ts`, `tests/notificaciones-preferencias.test.ts`.

#### P1.8 — Gobernanza, administración principal y permisos (D5)

- Evaluación sin romper auth: (a) corto plazo, unificar master (P0.1.4) y verificar `MASTER_ADMIN_EMAIL`; (b) custom claims requieren `firebase-admin` + backend privilegiado, **dependencia nueva que necesita autorización específica**; (c) 2FA y retirada de `passwordHash` propio; (d) H-24: antes de cualquier multi-tenant, definir entidad organización.
- Pruebas: `tests/gobernanza-master.test.ts`, `tests/auth-sin-password-hash.test.ts`.

#### P1.9 — Rendimiento, dependencias y escalabilidad documental

- P1.9.1 Dependencias: `overrides` para `dompurify@3.4.17`, `body-parser@1.20.9`, `source-map-js@1.2.2`, `@grpc/grpc-js@1.14.6`; Vite 6.4.5; plan de migración `nodemailer@10`/`firebase@13`. **Requiere autorización para modificar `package.json`/lockfile.**
- P1.9.2 Code-splitting por sección (`React.lazy`) hasta <1 MB gzip.
- P1.9.3 **AE-01 — auditoría de escalabilidad documental (sin migración):** medir tamaño real de `contratos_formalizacion` y frecuencia de escritura, comparar con el límite de 1 MiB [1](https://firebase.google.com/docs/firestore/quotas), evaluar compatibilidad de `cobrosEngine`, estrategia de doble escritura, rollback y coste. **Solo si el dictamen lo justifica** se propone migración a `contratos/{id}/cobros`, con autorización independiente.

#### P1.10 — Registro de alquiler de corta duración (condicionado)

- Campo `numeroRegistro` y validación en publicación, **solo si el producto gestiona temporada/turístico** [1](https://www.mivau.gob.es/vivienda/ventanilla-unica/alquiler-de-alojamientos-de-corta-duracion). Es validación de datos, no contratación de servicios.

### P2 — Evolución del producto (propuestas, NO compromisos)

- **P2.A** API de intercambio **documental** + webhooks + sindicación (idealista/Fotocasa/Kyero/Habitaclia) + iCal. Sin pagos ni banca bajo ningún nombre.
- **P2.B** IA supervisada: triaje de incidencias, OCR de facturas en servidor, extracción de datos de justificantes, screening externo con consentimiento. **Invariante:** la IA propone; nunca confirma pagos ni contabiliza cobros.
- **P2.C** RGPD/DSAR, retención configurable, i18n, WCAG 2.2 AA, observabilidad/APM, E2E de navegador y pruebas de carga.
- Cualquier servicio de pago, banco, agregador o pasarela sigue **excluido permanentemente**.

### Métricas revisadas (sin dinero)

| Métrica | P0 | P1 | P2 |
|---|---|---|---|
| Capacidades activas en `doctor` (emulador) | 8/8 | 8/8 | 8/8 |
| Solicitudes públicas con revisión <1 h | 100 % | 100 % | 100 % |
| Actas firmadas sin intervención manual | >0 % | >80 % | >95 % |
| **% justificantes con revisión humana documentada** | n/a | >90 % | >98 % |
| **Cobros confirmados por IA o por justificante** | 0 | 0 | 0 |
| Incidencias con presupuesto/SLA desde portal profesional | n/a | >60 % | >90 % |
| Vulnerabilidades críticas/altas | 9 → 0 | 0 | 0 |
| Chunk principal gzip | 1,38 MB | <1 MB | <800 KB |
| Emulador oficial + `npm test` + build en CI | verde | verde | verde + E2E |

---

## 6. Inventario de servicios externos

| Servicio | Estado actual | ¿Imprescindible? | Para qué fase | Contrato / coste | Secreto | Enfoque de pruebas |
|---|---|---|---|---|---|---|
| Firebase Auth / Firestore (base con nombre) / Storage | En producción, versionado | **Sí** (runtime) | Todas | Existente | Cliente público + cuenta de servicio servidor | Emuladores `demo-gestor-reglas` |
| Vercel hosting + función `/api/*` + cron 06:00 UTC | Configurado | **Sí** (producción) | Todas | Existente | `CRON_SECRET` | Llamada manual con Bearer en local; Preview solo si se autoriza |
| Correo saliente SMTP / Resend / SendGrid | `MODO_SEGURO` | **Sí para P0.3/P1** (entregar OTP y avisos) | P0.3, P1.7 | **Sin contrato nuevo** si se usa buzón existente | `EMAIL_FROM` + `SMTP_URL`/API key | `tests/harness/servidorSmtpCaptura.ts` (captura local); buzón real solo con autorización |
| Emuladores Firebase + Java 21 | Configurados en CI | **Sí para pruebas** | P0-P2 | Gratuito | Ninguno | `npm run test:emulador:reglas` en CI (Java 21) |
| Catastro OVC (`ovc.catastro.meh.es`) | Ya usado, sin auth | Opcional | P0.2 endurecer | Público, sin contrato | Ninguno | Fetch simulado en tests |
| INE serie IRAV1 | Codificada hoy | Opcional (si P1.2) | P1.2 | Público, sin contrato | Ninguno | Fixture + verificación de frescura |
| Gmail API (aseguradoras) | OAuth cliente heredado | Opcional | P1/P2 (H-22) | Cuenta Google existente | OAuth token en memoria | Auth Emulator; app Firebase con nombre propio |
| AEAT VERI*FACTU / SPFE / plataforma B2B | **Desconectado** | **No determinado** | Solo tras P1.4 | Posible certificado/plataforma | Certificado backend | **No se contrata ni implementa sin dictamen** |
| Signaturit / FNMT (firma cualificada) | Ausente | No (D2) | P2 si se decide | Contrato + coste | API key | Fuera de P0 |
| `firebase-admin` (custom claims) | **No instalado** | No (D5 evaluación) | P1.8 si se autoriza | Dependencia nueva | Cuenta de servicio | Requiere autorización de dependencia |
| SMS / Web Push provider | Ausente | No | P1.7 si aplica | Posible coste | API key | Solo si P-02 lo decide |
| **PSD2 / AISP / agregadores bancarios** | **Ausente** | **EXCLUIDO** | — | — | — | — |
| **Stripe / Redsys / Bizum pasarela / TPV** | **Ausente** | **EXCLUIDO** | — | — | — | — |
| **Importación automática de movimientos / iniciación de pagos** | **Ausente** | **EXCLUIDO** | — | — | — | — |

---

## 7. Plan de staging, pruebas, seguridad y reversión

### 7.1 Infraestructura que existe realmente

- Emuladores declarados en `firebase.json` (auth 9099, firestore 8080, storage 9199) y ejecutados por `npm run test:emulador:reglas` con proyecto **`demo-gestor-reglas`**.
- `docs/P2-aceptacion-emuladores.md`: la prueba se niega a arrancar si detecta `NODE_ENV` distinto, `GCLOUD_PROJECT` distinto, Vercel, credenciales Google o hosts incorrectos. Usa `sintetico.invalid`. **No lee `.firebaserc` como destino.**
- CI: runner efímero, `permissions: contents: read`, sin secretos de despliegue, Java 21 instalado por `actions/setup-java`.
- **No existe**: proyecto Firebase de staging, base de datos de staging, `.env.staging`, Vercel Preview con secretos propios, buzón de prueba, Java local, cuenta de servicio de staging.

### 7.2 Aislamiento respecto de producción

1. **Destino único de pruebas: emuladores.** `GCLOUD_PROJECT=demo-gestor-reglas` + `FIRESTORE_EMULATOR_HOST`, `FIREBASE_STORAGE_EMULATOR_HOST`, `FIREBASE_AUTH_EMULATOR_HOST`. Ningún cliente apunta a `gestor-inmuebles-produccion`.
2. **El backend ayuda al aislamiento:** sin `FIREBASE_SERVICE_ACCOUNT`, `resolverAccesoFirebase()` devuelve `FIREBASE_CREDENCIAL_AUSENTE` y todas las rutas dependientes responden 503. `configuracionFirebase.ts:40` además rechaza proyectos distintos.
3. **Prohibición operativa:** no ejecutar `firebase deploy`, `firebase use`, `npm run dev` contra producción ni `npm run test:*` que escriba fuera de emuladores durante P0.
4. **Guardia de semillas:** P0.1.5 desactiva `seedInitialDataIfEmpty()` antes de cualquier login manual.
5. **Guardia de `.firebaserc`:** todo comando `firebase` debe llevar `--project demo-gestor-reglas` explícito; el CI no despliega reglas.
6. **Secretos:** en el árbol solo `.env.example`; `git status` sin cambios de configuración; `firebase-applet-config.json` sin clave privada.
7. **Comprobación demostrable de que producción no se modifica:** (a) `git status --short` sin cambios de código/config al terminar cada sprint; (b) variables de emulador presentes en el entorno de prueba; (c) `/api/health` en local devuelve `MODO_SEGURO`/`NO_CONFIGURADO`; (d) `npm run doctor` **rechaza** explícitamente un destino cuyo host sea el de producción; (e) registro de auditoría de las ejecuciones de CI.

### 7.3 Secretos de prueba imprescindibles (mínimo; **no crear en esta fase**)

| Secreto | Uso | Alternativa sin recurso real |
|---|---|---|
| `CRON_SECRET` (valor de prueba) | Probar `GET /api/cron/avisos` | Valor efímero local, nunca el de producción |
| `EMAIL_FROM` + `SMTP_URL` de captura | Probar entrega OTP/avisos | `tests/harness/servidorSmtpCaptura.ts` en loopback |
| `IA_POLITICA_JSON` (ejemplo) + `IA_LLAVES_CLAVE_MAESTRA` sintética | Verificar D4 | `docs/politica-ia.ejemplo.json` + `npm run ia:llaves:clave-maestra` en local, sin guardar |
| Cuenta de servicio **inyectada** (`cuentaInyectada`) | Pruebas HTTP de backend | El código ya soporta inyección; **no** usar credencial real |
| `FIREBASE_SERVICE_ACCOUNT` real | **No imprescindible** para P0 con emuladores | Solo si P1 necesita integración real → requiere autorización |

### 7.4 Ejecución de emuladores y pruebas de reglas

- Local: **bloqueado por falta de Java 21.** Resolución: usar el job `reglas-emulador` de CI (ya instala Java) o instalar Java con autorización. **No se sustituye por el harness propio**: `tests/harness/firestoreRulesEval.ts` es un evaluador casero y `tests/ag01…` lo declara; sirve como complemento, nunca como prueba oficial.
- Comando oficial: `npm run test:emulador:reglas` → 8 suites `.emulador.test.ts` con `fileParallelism: false`, timeouts 60/120 s.
- Cobertura adicional necesaria en P0: nuevas suites para reglas de solicitud anónima, OTP, lecturas amplias y paridad de constantes.

### 7.5 Reversión de futuras implementaciones

- Cada integración nueva detrás de **flag de entorno**; si falla, se desactiva la variable y el sistema vuelve al estado anterior (fallo cerrado ya implementado).
- Un commit/merge por fase → `git revert` atómico.
- Reglas: si se llegaran a publicar, rollback con el `firestore.rules` del commit anterior (operación de despliegue que **requiere autorización explícita** y nunca se hace en P0).
- Datos: **sin migraciones destructivas**. AE-01 propone doble escritura + verificación de hashes + script de reversión antes de cualquier cambio de `registroCobros`.
- Índices: no publicar sin confirmar H-14.

### 7.6 Bloqueos documentados (no resueltos en esta fase)

| Bloqueo | Efecto | Resolución propuesta |
|---|---|---|
| Java 21 ausente localmente | No se puede ejecutar el emulador oficial aquí | Usar CI; o instalar Java con autorización. **No declarar pruebas superadas** |
| Sin `FIREBASE_SERVICE_ACCOUNT` | Portales, custodia, justificantes, seguimiento → 503 | Emuladores + cuenta inyectada; credencial real solo con autorización |
| Sin correo real | No se puede verificar entrega SMTP verdadera | Capturador SMTP local; buzón real con autorización. **No presentar como envío real** |
| `configuracionFirebase.ts:40` | Impide apuntar a un proyecto de staging | Cambio de código en P0.1 (autorizado) para permitir `demo-*` / proyecto de staging explícito |
| Clon superficial | 5 pruebas fallan | `fetch-depth: 0` (ya en CI) + guardas que saltan con mensaje |
| Sin `npm test` | No hay verificación única | P0.4.4 |

---

## 8. Riesgos que impiden iniciar P0

| ID | Riesgo | Severidad | Mitigación / condición de arranque |
|---|---|---|---|
| R-01 | No hay aislamiento para pruebas de backend real; producción es el único proyecto válido | Alta | P0 se ejecuta **solo contra emuladores**; P0.1 añade guardia de destino. Si se requiere backend real, autorizar cambio de `configuracionFirebase.ts` |
| R-02 | Semillas activas en login de admin | Alta | P0.1.5 es la **primera tarea**; hasta entonces, no iniciar sesión en el despliegue real |
| R-03 | Java ausente → emulador oficial no verificable localmente | Media | Usar CI; no sustituir por simulaciones |
| R-04 | Sin secretos de correo/cron/IA | Media | Capturador SMTP, valores efímeros, proveedor simulado; declarar explícitamente qué no se ha verificado |
| R-05 | Decisiones P-02, P-03, P-04 sin cerrar | Media | Bloquean el detalle de P0.3/P0.4, **no** el arranque de P0.1 |
| R-06 | `.firebaserc` en producción | Media | Prohibir `deploy` sin `--project demo-…`; CI sin credenciales de despliegue |
| R-07 | Cambio de dependencias/lockfile (H-20) requiere autorización | Media | Se traslada a P1.9; P0 no instala nada |
| R-08 | Incertidumbre normativa fiscal (D3) | Media | Bloquea P1.4/P1.5, **no** P0 |
| R-09 | Documento de auditoría previo sin seguimiento en el árbol | Baja | Decidir si se conserva (recomendado: conservar como histórico, con este informe como vigente) |

**Conclusión:** P0.1 puede arrancar en cuanto se autorice, **sin crear ningún recurso nuevo**, trabajando exclusivamente con emuladores y código local.

---

## 9. Orden recomendado de ejecución y entregables del primer sprint

### Orden

```
FASE 0 (este informe)  →  autorización expresa
   → P0.1 (diagnóstico + semillas off + master unificado + config documentada)
      → P0.2 (solicitudes + antispam + bandeja)   [depende de P0.1]
      → P0.3 (OTP seguro + entrega)                [depende de P0.1 y dispatcher]
      → P0.4 (huérfanas + permisos + CI)           [parcialmente paralelo]
   → puerta de salida P0 (emulador oficial en CI + npm test + doctor)
   → P1.4 (dictamen normativo) antes de cualquier cambio fiscal
   → P1.1 / P1.2 / P1.3 / P1.6 / P1.7 / P1.8 / P1.9 / P1.10 (según autorización)
   → P2 (propuestas, sin compromiso)
```

### Entregables del primer sprint autorizable (P0.1)

1. `scripts/doctor.mjs` + script `npm run doctor` — diagnóstico de solo lectura con rechazo de destinos de producción.
2. `docs/CONFIGURACION-VERIFICABLE.md` — mapa de las 24 variables, proyecto/base/bucket, emuladores, cron y servicios.
3. `src/lib/masterAdmin.ts` + sustitución de literales (sin tocar `firestore.rules`).
4. Flag `SEEDS_ENABLED` y estados iniciales vacíos.
5. Etiquetado honesto de las 9 simulaciones.
6. Tests nuevos: `doctor`, `health-capacidades`, `configuracion-documentada`, `master-admin-paridad`, `seeds-desactivados`, `estado-inicial-vacio`, `etiquetado-simulaciones`.
7. `tests/health-capacidades.test.ts` incluido en CI; `test:integracion` añadido al workflow.

**Criterio de salida del sprint:** `npx tsc --noEmit` EXIT 0 · `npm test` verde · `npm run build` verde · emulador oficial verde en CI · `npm run doctor` en modo emulador informa 8/8 capacidades · **cero escrituras en producción** · `git status` sin cambios de reglas, índices, `.env` ni lockfile.

---

## 10. Decisiones pendientes estrictamente necesarias

> No se reabre D1 (banca/pagos). D2, D3, D4, D5 y D6 son directrices ya aplicadas. Las siguientes son las **únicas** cuestiones que requieren respuesta, con recomendación para no bloquear.

| ID | Decisión | Bloquea | Recomendación | Si no respondes |
|---|---|---|---|---|
| P-01 | **Canal de entrega del OTP** en P0.3: ¿correo (necesita buzón/capturador) o solo bandeja interna para usuarios con cuenta? | P0.3 | Correo vía dispatcher con capturador SMTP en staging; fallback INAPP; documentar que firmantes externos requieren correo | Usar capturador SMTP + marcar la entrega real como pendiente de verificación |
| P-02 | **`ProfesionalesSection`**: ¿montar la sección completa en administración o migrar sus paneles al portal del profesional? | P0.4 / P1.6 | Migrar presupuestos/facturas/valoraciones al portal profesional y mantener catálogo en administración | Montar la sección tal cual, sin migración |
| P-03 | **Permisos granulares y toggles de módulos**: ¿implementar enforcement real o retirar/renombrar los controles? | P0.4 | Retirar toggles y renombrar el catálogo de permisos a "informativo" hasta implementarlo | Aplicar la recomendación |
| P-04 | **Identidad del administrador principal** objetivo y si se autoriza `firebase-admin` para custom claims | P1.8 (no P0) | Mantener el correo actual como valor por defecto parametrizado; evaluar claims en P1.8 con autorización de dependencia | Mantener parametrización sin claims |
| P-05 | **Dictamen fiscal** (P1.4): ¿quién lo emite (asesor fiscal / responsable de producto) y qué operaciones del ERP se clasifican como factura obligatoria? | P1.4/P1.5 (no P0) | Encargar dictamen antes de tocar facturación; mientras tanto, solo corregir textos y hacer configurable la modalidad | P1 fiscal queda en espera; P0 continúa |
| P-06 | **Proyecto Firebase de staging** para pruebas de backend real: ¿se autoriza su creación futura (con el cambio de `configuracionFirebase.ts` que implica)? | P1 (no P0) | No crearlo ahora; P0 usa emuladores. Decidir en la puerta de salida de P0 | P0 con emuladores; P1 backend real en espera |

---

## 11. Actuaciones que NO se han realizado

Declaración explícita, conforme a la condición de cierre:

- ❌ No se ha modificado **ningún archivo de código de producto** (`.ts`, `.tsx`, `.mjs`, `.js`).
- ❌ No se ha modificado `firestore.rules`, `storage.rules`, `firestore.indexes.json` ni `firebase.json`.
- ❌ No se ha modificado `.env.example`, ninguna variable de entorno, ningún secreto ni `vercel.json`.
- ❌ No se ha creado, alterado ni borrado **ningún dato de Firebase** (ni producción ni emulador).
- ❌ No se ha desplegado, publicado reglas, hecho merge ni abierto PR con cambios de implementación.
- ❌ No se ha instalado ninguna dependencia ni cambiado `package.json` o `package-lock.json` **durante esta fase**.
- ❌ No se ha ejecutado ninguna migración ni prueba que pueda escribir en producción.
- ❌ No se ha creado proyecto, base de datos, bucket, secreto, buzón, contrato con proveedor ni recurso de pago.
- ❌ No se ha instalado Java ni ejecutado el emulador oficial; **no se declaran superadas sus pruebas**.
- ❌ No se han presentado simulaciones como pruebas reales: el sandbox de IA, el harness de reglas y el capturador SMTP se citan como lo que son.
- ❌ No se ha relajado ningún permiso.
- ❌ No se ha reabierto la exclusión de banca y pagos online.
- ❌ No se han inventado resultados, archivos, rutas, commits ni configuraciones: todas las rutas y líneas citadas proceden de comandos de lectura ejecutados en este repositorio.

**Únicas excepciones de escritura en esta fase:** (a) este informe, que es el entregable solicitado; (b) una corrección de precisión de **solo documento** en `docs/AUDITORIA-FUNCIONAL-PORTALES-2026-10-27.md` (H-05: el backend ya lee `MASTER_ADMIN_EMAIL`), realizada al inicio de esta respuesta. Artefactos de turnos anteriores (`node_modules/`, `dist/`) permanecen ignorados por `.gitignore` y no se han tocado.

---

## 12. Condición de cierre

Este informe cumple los 10 criterios de aceptación: resumen ejecutivo (§1), matriz de hallazgos (§3), desviaciones (§4), hoja de ruta revisada con tareas/archivos/dependencias/pruebas/criterios (§5), inventario de servicios (§6), plan de staging/seguridad/reversión (§7), riesgos (§8), orden y primer sprint (§9), decisiones pendientes (§10) y actuaciones no realizadas (§11).

**Se espera autorización expresa antes de implementar cualquier cambio.** La siguiente fase, una vez aprobada, comenzará por el primer bloque autorizado y verificable de **P0.1**: `scripts/doctor.mjs` + `SEEDS_ENABLED` + unificación del administrador principal, todo contra emuladores y sin crear recursos.

---

## 13. Fuentes

> Los identificadores `[n]` corresponden a resultados de búsqueda; la **URL es la referencia única** cuando un número se repite. Páginas consultadas el 27-10-2026.

**Normativa fiscal (D3)**

- AEAT, FAQ ámbitos de aplicación RRSIF/VERI*FACTU (actualizada 21-10-2026): "el RRSIF no aplica a sistemas informáticos que no expidan facturas" [2](https://sede.agenciatributaria.gob.es/Sede/iva/sistemas-informaticos-facturacion-verifactu/preguntas-frecuentes/cuestiones-generales-ambitos-aplicacion.html).
- AEAT, FAQ IVA arrendamiento — Facturación: el propietario que alquila vivienda no está obligado a expedir factura salvo destinatario empresario/jurídico/AAPP [6](https://sede.agenciatributaria.gob.es/Sede/iva/iva-operaciones-inmobiliarias/preguntas-frecuentes-sobre-iva-arrendamiento-inmuebles/facturacion.html).
- AEAT, calendario de implantación de factura electrónica B2B (Orden HAC/1028/2026, 6-10-2026; 6-10-2027 / 6-10-2028 / 6-10-2029) [3](https://sede.agenciatributaria.gob.es/Sede/iva/factura-electronica/calendario-implantacion.html) y [1](https://sede.agenciatributaria.gob.es/Sede/todas-noticias/2026/octubre/7/solucion-publica-facturacion-electronica.html).
- AEAT, quiénes están obligados y exclusiones B2C / sin obligación de factura [13](https://sede.agenciatributaria.gob.es/Sede/eu_es/iva/factura-electronica/cuestiones-generales/quienes-estan-obligados-que-operaciones-incluyen.html).
- AEAT, obligaciones de los intervinientes y copia fiel UBL [4](https://sede.agenciatributaria.gob.es/Sede/iva/factura-electronica/cuestiones-generales/obligaciones-intervinientes-sistema-factura-electronica.html).
- AEAT, plazos RRSIF 1-1-2027 / 1-7-2027 [3](https://sede.agenciatributaria.gob.es/Sede/todas-noticias/2025/diciembre/3/ampliacion-plazo-adaptacion-sistemas-informaticos-facturacion.html) y [2](https://sede.agenciatributaria.gob.es/Sede/iva/sistemas-informaticos-facturacion-verifactu/nota-informativa-ampliacion-plazo-adaptacion-facturacion.html).
- AEAT, modalidades VERI*FACTU / no verificable [7](https://sede.agenciatributaria.gob.es/Sede/iva/sistemas-informaticos-facturacion-verifactu/preguntas-frecuentes/sistemas-verifactu.html) y [3](https://sede.agenciatributaria.gob.es/Sede/iva/sistemas-informaticos-facturacion-verifactu/cuestiones-generales.html).
- BOE, RD 238/2026 [2](https://www.boe.es/buscar/act.php?id=BOE-A-2026-7295).

**Índices y registros**

- INE, IRAV últimos datos (sep-2026 = 2,54 %, publicado 14-10-2026) [1](https://www.ine.es/uc/oC7D0Ncd) y metodología [4](https://www.ine.es/prensa/IRAV.pdf).
- Ministerio de Vivienda, Ventanilla Única Digital / Registro Único [1](https://www.mivau.gob.es/vivienda/ventanilla-unica/alquiler-de-alojamientos-de-corta-duracion) y [6](https://www.mivau.gob.es/vivienda/ventanilla-unica/plataformas-en-ventanilla-unica-digital).
- Firebase, uso y límites (documento 1 MiB) [1](https://firebase.google.com/docs/firestore/quotas).

**Repositorio (fuente primaria):** todos los `archivo:línea` citados en §§2-5, verificados con `git`, `grep`, `sed`, `cat`, `find`, `python3` y `npx tsx` de solo lectura sobre `2563831`.
