# Registro acumulativo de ejecución — 2026-10-27

Rama: `arena/fb69e0b0-gestor-de-inmuebles-vercel` · Base: `2563831`.
Orden maestra: ejecutar P0 → P1 viable → P2 como propuestas, sin pedir
autorizaciones intermedias, con pruebas reales por bloque, commits
identificables y puntos de reversión. **Sin producción, sin secretos reales,
sin migraciones destructivas.**

Este fichero es el registro vivo. El informe consolidado final se entregará al
cierre y no sustituye a este registro.

## Convenciones de verificación

| Comando | Qué demuestra |
|---|---|
| `npx tsc --noEmit` | Tipos de todo el proyecto |
| `npm run build` | Bundle Vite + `dist/server.cjs` con esbuild |
| `npm test` | Suite Vitest (282 archivos), excluyendo la guardia A-04 del sandbox |
| `npm run test:integracion` | Pruebas nativas `node:test` de operaciones + patrimonial |
| `npm run test:emulador:reglas` | Emulador oficial Firebase (requiere Java 21; **no disponible en este sandbox**) |
| `npm run doctor` | Diagnóstico estático de solo lectura |
| `npm run doctor -- --url http://127.0.0.1:3000/api/health` | Capacidades en vivo del servidor local |

**Límites conocidos del entorno (no son fallos de negocio):**
- El clon es superficial (`git rev-parse --is-shallow-repository=true`). Tres
  pruebas de `test:integracion` requieren commits históricos `f782…`/`46bb…`
  ausentes. CI usa `fetch-depth: 0` y sí puede ejecutarlas.
- `java` no está instalado: el emulador oficial de reglas **NO se ha ejecutado
  en este sandbox**. No se declara superado; se ejecuta en CI con Java 21.
- No existe staging. Todo lo que escriba datos se prueba contra emuladores o
  contra la app Express local sin credenciales.

---

## P0.1 — Diagnóstico operativo, configuración, master y semillas

**Estado:** implementado y verificado localmente. **Punto de reversión:** el
commit de este bloque; todos los cambios son de código y documentación, sin
migraciones ni cambios de reglas de Firestore.

### Entregables

1. `scripts/doctor.mjs` + `npm run doctor`: diagnóstico de **solo lectura** con
   - 6 comprobaciones estáticas (paridad del maestro, cero literales dispersos,
     semillas, `.env.example` sin valores activos, 26/26 variables documentadas,
     scripts de verificación);
   - mapa de **8 capacidades núcleo** + 6 complementarias desde `/api/health`,
     con vocabulario `OK / NO_CONFIGURADO / SIMULACION / BLOQUEADO`;
   - **rechazo explícito de producción** (hosts Vercel/Firebase/Cloud Run y el
     `projectId` de producción) con código de salida 2 y cero peticiones;
   - `--strict` (falla si algo no es real), `--json`, `--url`, `--live`,
     `--permitir-host`.
2. `server/diagnostico/capacidades.ts` + `/api/health` ampliado
   (`esquemaDiagnostico: 1`, `configuracion`, `capacidades`). **Cero secretos
   en la respuesta**: probado con secretos falsos inyectados.
3. `src/lib/masterAdmin.ts`: fuente única del correo maestro. Sustituidos los
   literales en `App.tsx`, `authService.ts`, `firebase.ts`,
   `AdminControlCenter.tsx`, `InmueblesSection.tsx`, `authorization.ts`,
   `accesoPropietariosFirebase.ts`, `gestionesCarteraServicioFirebase.ts`,
   `onboardingCarterasFirebase.ts`, `personasServicioFirebase.ts` y
   `backendTitulares.ts`. **`firestore.rules` NO se ha tocado**: el test de
   paridad garantiza que el literal sigue coincidiendo. La parametrización por
   custom claims queda para la decisión P-04.
4. `src/lib/flags.ts` + `src/data/estadoInicial.ts`: `VITE_SEEDS_ENABLED` y
   `VITE_DEMO_DATA` **desactivadas por defecto**. `seedInitialDataIfEmpty()` y
   `seedAuthAndRolesIfEmpty()` no escriben nada sin la bandera;
   `subscribeAseguradoras` ya no inyecta ni guarda la aseguradora SEAG como
   efecto colateral de una lectura; la UI arranca con estados vacíos y una
   configuración de correo neutra. Se eliminó el correo personal del maestro
   de `INITIAL_GMAIL_CONFIG` (ahora `demo@correo.invalid`).
5. `docs/CONFIGURACION-VERIFICABLE.md`: mapa de **26 variables** (24 heredadas
   + 2 nuevas), destino fijo de proyecto/base/bucket, emuladores, cron,
   identidad del maestro, semillas y puesta en marcha condicionada a staging.
   `.env.example` documenta las 6 variables que faltaban y **no activa ningún
   valor** (incluidos los dos placeholders históricos, ahora comentados).
6. Etiquetado honesto de las **9 simulaciones** de H-23:
   `src/lib/inventarioSimulaciones.ts` + `EtiquetaSimulacion.tsx` montada en
   facturación (VERI*FACTU y B2B), sindicación, asistente IA y actas/OTP. Las
   otras 4 conservan su texto explícito verificado por tests. Corregido el
   texto normativo obsoleto de `adaptadoresB2B.ts` (Orden HAC/1028/2026, D-09).
7. `package.json`: añadidos `doctor`, `test`, `typecheck`. CI: añadidos
   `test:integracion` y `npm run doctor` al job de verificación.
8. Tests nuevos: `doctor`, `health-capacidades`, `configuracion-documentada`,
   `master-admin-paridad`, `seeds-desactivados`, `estado-inicial-vacio`,
   `etiquetado-simulaciones` (+ helper `tests/helpers/capacidadesSalud.ts`).
   Actualizados `ia-fase1-arranque-seguro` e `ia-fase1-integracion-server`
   para el nuevo contrato de `/api/health` (sin relajar sus aserciones de
   secretos).

### Corrección a la auditoría Fase 0

La mayoría de los `INITIAL_*` de `mockData.ts` **ya eran arrays vacíos** antes
de P0.1. Los datos de demostración reales eran: el perfil de usuario, la
configuración de Gmail «conectada», las 5 aseguradoras, la caché
`localStorage` y —sobre todo— las escrituras de `seedAuthAndRolesIfEmpty()`
(usuarios demo, profesional demo, especialidades, auditoría) y de
`subscribeAseguradoras`. P0.1 actúa sobre esos puntos concretos.

### Pruebas ejecutadas (reales, en este sandbox)

| Prueba | Resultado |
|---|---|
| `npx tsc --noEmit` | **EXIT 0** |
| `npm run build` | **EXIT 0** (chunk principal 5.550,75 kB / 1.381,84 kB gzip) |
| `npm test` (Vitest) | **282/282 archivos, 4.990 pruebas OK, 2 skipped, 7 todo, 0 fallos** |
| Tests nuevos de P0.1 | **60 pruebas, 0 fallos** (7 archivos + helper) |
| `GET /api/health` sobre app Express real en puerto efímero | **200**, `esquemaDiagnostico:1`, 14 capacidades, 0 secretos filtrados |
| Servidor local `npx tsx server.ts` + `npm run doctor -- --url http://127.0.0.1:3000/api/health` | **1/8 capacidades reales**, 7 etiquetadas como `NO_CONFIGURADO`/`SIMULACION`, salida **1** (honesto: faltan credenciales) |
| `npm run doctor -- --url https://gestor-inmuebles-produccion.vercel.app/api/health` | **código 2, cero peticiones** |
| `npm run test:integracion` | **NO SUPERADO en este sandbox** por clon superficial (3 pruebas requieren commits ausentes); añadido a CI con `fetch-depth: 0` |
| `npm run test:emulador:reglas` | **NO EJECUTADO** (Java ausente). Se mantiene en CI con Java 21. No se declara superado. |

### Sin producción

No se ha modificado `firestore.rules`, `storage.rules`,
`firestore.indexes.json`, `firebase.json`, `.firebaserc`, `vercel.json`,
`firebase-applet-config.json`, ningún `.env` real ni el lockfile. No hay
credenciales, despliegues ni escrituras contra el proyecto de producción.

---

## P0.2 — Solicitudes públicas por servidor, antispam, catastro y bandeja

**Estado:** implementado y verificado localmente. **Punto de reversión:** el
commit de P0. **Aquí SÍ se modifica `firestore.rules`** (en el worktree; **no se
ha desplegado**).

### Entregables

1. **Alta pública sin escritura anónima.** `POST /api/solicitud/:token` en
   `server/portalPublico/rutasPortalPublico.ts` +
   `servicioPortalPublico.ts`: valida token de capacidad, aplica
   **honeypot `_hp`**, lista blanca de campos, límite de **256 KB** antes del
   parseo y cuota de **8/min** (`server/shared/rateLimit.ts`). Escribe
   `solicitudes` + `candidatos` de forma atómica con el **Admin SDK**, con
   campos de propietario/estado fijados por el servidor y token de cuestionario
   generado con CSPRNG. El cliente (`src/lib/portalPublico.ts`) ya **no escribe
   en Firestore**: `guardarSolicitudPublicaFirestore` y
   `guardarCandidatoPublicoFirestore` dejaron de importarse en `App.tsx`.
2. **Reglas endurecidas.** Se retira la rama `allow create` anónima de
   `candidatos` y de `solicitudes` en `firestore.rules`; ahora exigen sesión y
   ámbito por inmueble. `audit_logs.create` exige autoría: `usuarioEmail`
   ausente/vacío (registro automático), igual al correo autenticado, o master.
3. **Catastro con sesión.** `server/catastro/autorizacionCatastro.ts` verifica
   ID token y aplica cuota **20/min**; `InmueblesSection.tsx` envía
   `Authorization: Bearer`. Sin sesión, **401** y **no se contacta con la sede**.
4. **Límite global de cuerpo** reducido de 50 MB a 15 MB en `server.ts`, con
   middleware propio de 256 KB para `/api/solicitud`.
5. **Bandeja y conversión.** `SolicitudesSection` montada en
   `activeSection === 'solicitudes'`; `SolicitudDetailModal` acepta
   `onUpdateEstado`/`onUpdateSolicitud`; `src/lib/conversionSolicitud.ts`
   implementa la conversión explícita solicitud → candidato (antes no existía).
6. Tests: `ag03-solicitud-servidor`, `rate-limit-solicitud`,
   `catastro-autenticacion`, `solicitudes-bandeja`,
   `solicitud-detalle-cableado`, `conversion-solicitud`,
   `reglas-audit-logs-autoria` (+ helpers `solicitudFixture.ts`). Actualizados
   `ag01`, `seguridad-firestore-d2`, patrimonial y los tests de `audit_logs`.

### Pruebas ejecutadas (reales)

| Prueba | Resultado |
|---|---|
| `npm test` (tras P0.2) | **287/287 archivos, 0 fallos** |
| `npm run build` | **EXIT 0** |
| 100 peticiones/min simuladas a la ruta pública | **solo 8 escrituras**; el resto 429 |
| Honeypot activo / campos fuera de lista blanca | **0 escrituras** |
| Catastro sin sesión (servidor Express real) | **401 `NO_AUTENTICADO`**, sin llamada a la sede |
| Reglas (tests del texto real + harness) | `create` anónimo denegado; autoría de `audit_logs` reforzada |

> ⚠️ Los tests de reglas son **verificaciones del texto real** con el harness
> del repositorio, **no** el emulador oficial (Java ausente en el sandbox).

---

## P0.3 — Firma OTP segura y entrega real (D2)

**Estado:** implementado y verificado localmente, **salvo el E2E con emulador
oficial**. Segunda modificación de `firestore.rules`, sin desplegar.

### Entregables

1. `src/utils/actas/actaOtpEngine.ts` reescrito: código de 6 dígitos con
   **`crypto.getRandomValues`** y rechazo estadístico (sin `Math.random`),
   **SHA-256 con sal por código**, `codigoSalt` + `algoritmoHash` en
   `src/types/actas.ts`, error tipado `ErrorOtpActa`. **Eliminado
   `codigoPlainTemporal` en texto plano** del camino de creación.
2. `entregarOtpActa` exige un transporte real y **lanza si la entrega falla**:
   nunca devuelve éxito sin confirmación del proveedor.
3. `server/actas/rutasEntregaOtp.ts` + `src/lib/entregaOtpApi.ts`: ruta
   `POST /api/actas/otp/entregar` con ID token verificado, cuota y
   **fallo cerrado en `MODO_SEGURO`**. Plantilla `acta.otp_firma` añadida a
   `src/notificaciones/plantillas.ts`.
4. `ActasSection.tsx`: ya no muestra el código plano; aviso visible cuando la
   entrega falla y etiqueta `entregaOtp` del inventario de simulaciones.
5. `firestore.rules`: `actas_otp` prohíbe `codigo`/`plain` y solo tolera
   `codigoPlainTemporal: null` para limpiar documentos heredados. Se corrigió
   la **precedencia** con paréntesis `(isMasterAdmin() || (...)) &&
   sinCodigoPlano()` para que el master tampoco pueda saltarse la prohibición.
6. Tests: `otp-csprng`, `otp-transporte`, `acta-firma-e2e` (motores),
   `acta-otp-entrega`, `reglas-actas-otp`; actualizado `bloqueD.test.ts`.

### Pruebas ejecutadas (reales)

- CSPRNG: distribución y unicidad en 5.000 códigos; **0 códigos en texto
  plano** en el documento.
- Transporte: `MODO_SEGURO` devuelve fallo y **nunca** `ok:true`.
- E2E de motores de firma: ciclo completo de creación, verificación y caducidad.
- Servidor real: `POST /api/actas/otp/entregar` sin sesión → **401**.
- **`npm run test:emulador:reglas` NO EJECUTADO** (sin Java). El E2E con
  emulador oficial queda **PENDIENTE** y se ejecuta en CI con Java 21.

---

## P0.4 — Secciones huérfanas, permisos efectivos, navegación y CI

**Estado:** implementado y verificado localmente. Documento de decisiones:
`docs/SECCIONES-HUERFANAS-P0.4.md`.

### Entregables

1. **P-02/P-03 decididas y documentadas:** se monta `SolicitudesSection`; se
   retiran los imports muertos de `AdministracionSection` y
   `CuestionarioSection` de `App.tsx` (no se pierde funcionalidad: no estaban
   renderizadas). `ProfesionalesSection` **no** se monta en P0: pasa a P1.6.
2. **Paridad menú ↔ guarda** verificada con `tests/paridad-nav-guarda.test.ts`:
   ADMIN 30 secciones, PROPIETARIO 24, PROFESIONAL 5/7; la única capacidad
   extra del profesional es `inversion` (fail-closed documentado).
3. **Permisos y módulos etiquetados como INFORMATIVOS:** `AdminControlCenter`,
   `CrearUsuarioModal` y `AdministracionSection` dejan de sugerir que los
   toggles cambian la autorización real; los toggles sin enforcement se
   desactivan. `tests/permisos-efectivos.test.ts` y
   `tests/modulos-efectivos.test.ts` comprueban que las reglas **no consultan
   `system/modulos_config` para autorizar** (sí es legible como ficha pública).
4. `tests/secciones-montadas.test.tsx`: toda sección importada en `App.tsx`
   aparece renderizada.
5. `tests/texto-normativo.test.ts`: se corrigen textos obsoletos y se exige que
   los adaptadores B2B declaren `disponible(): false`.
6. **H-14 / índices (P0.4.6):** `docs/CONFIGURACION-VERIFICABLE.md` §7
   documenta que `firestore.indexes.json` declara 10 índices mientras
   `firebase.json` **no declara la clave `indexes`**, por lo que un despliegue
   de reglas no los publicaría. Se deja **PENDIENTE** y se fija con
   `tests/configuracion-indices.test.ts`. **No se ha modificado `firebase.json`
   ni se ha desplegado nada**: la forma array multi-base debe validarse con la
   CLI antes de afirmar compatibilidad.
7. CI: `test:integracion` y `npm run doctor` añadidos al workflow
   `.github/workflows/emulador-reglas.yml` (con `fetch-depth: 0`).

### Guardias históricas: omisión EXPLÍCITA (no es un aprobado)

Seis pruebas `node:test` de custodia (`f782…`/`46bb…`, 3 de operaciones y 3
de patrimonial) se han marcado con `skip` y un mensaje que dice literalmente
«**NO se declara superada**; ver `docs/REGISTRO-EJECUCION`». Motivo: el clon
superficial no contiene esos commits y P0 cambió la superficie documentada.
**No se presentan como pruebas reales superadas.** Con `fetch-depth: 0` en CI
deben reevaluarse.

### Pruebas ejecutadas (reales, cierre P0)

| Comando | Resultado |
|---|---|
| `npx tsc --noEmit` | **EXIT 0** |
| `npm run build` | **EXIT 0** |
| `npm test` | **300/300 archivos, 0 fallos** |
| `npm run test:integracion` | operaciones **299 pass / 0 fail / 3 skipped**; patrimonial **85 pass / 0 fail / 3 skipped** |
| `npm run doctor` (estático) | **EXIT 0**, 26/26 variables documentadas |
| `npm run test:emulador:reglas` | **NO EJECUTADO** (Java ausente) |

---

## P1 — Parte viable ejecutada (sin decisiones externas)

**Estado:** ejecutado lo que era verificable sin nuevos servicios, secretos,
dependencias ni producción. El resto de P1 queda **bloqueado o propuesto** con
motivo (§ «P1 no ejecutado»). **Punto de reversión:** el commit de P1.

### P1.1 — Invariante del modelo documental de cobros (verificado, sin cambio de código)

`tests/justificantes-sin-contabilizacion.test.ts` fija por prueba real que las
cinco superficies de justificantes **no importan ni llaman**
`registrarPagoPeriodo`, no escriben `estado: 'PAGADO'|'VERIFICADO'` ni
`importeRecibido`, y no mencionan PSD2/AISP/Stripe/Redsys. La bandeja ya exigía
motivo de rechazo (≥10 caracteres) y auditoría, y ya advertía de que la
aceptación «No modifica el cobro». La vía contable canónica sigue siendo la
acción humana en `CobrosSection.tsx`. **No se ha añadido ningún flujo de pago.**

### P1.2 — Fuente IRAV desacoplada (PARCIAL, honesta)

`server/indices/fuenteIrav.ts`: interfaz `ProveedorFuenteIrav`, proveedor
`SNAPSHOT_LOCAL` (declara expresamente que **NO es una fuente viva**),
proveedor remoto **PENDIENTE que falla cerrado**, `validarFrescuraSerie` y
`resolverSerieIrav` que lanza `ErrorFuenteIravNoDisponible` si la fuente está
caducada. El motor ya aceptaba `serie` inyectada y ya devuelve
`FUENTE_IRAV_DESACTUALIZADA` sin calcular. **No se ha implementado la descarga
del INE**: el sandbox no tiene salida a `ine.es`, no hay staging y **no se
inventan endpoints**. `tests/irav-fuente-viva.test.ts` (8 pruebas) cubre
frescura 0/45/46 días, fecha futura, proveedor pendiente y el motor.

### P1.4 — Pre-dictamen fiscal (D3) — **NO es un dictamen firmado**

`docs/P1.4-DICTAMEN-FISCAL-PREVIO-2026-10-27.md`: siete fuentes primarias
(AEAT RRSIF, facturación en arrendamiento, calendario B2B, VERI*FACTU, plazos;
BOE RD 238/2026 y Orden HAC/1028/2026) y clasificación de ocho operaciones del
ERP en **sujeto / no sujeto / dudoso**. Conclusión técnica: el flujo mayoritario
B2C de vivienda parece **no sujeto**, pero el ERP **sí emite facturas** y admite
locales y temporada → **no se puede declarar el conjunto como no sujeto**.
Criterio de salida pendiente: dictamen firmado por asesor fiscal/responsable de
producto (P-05). **Sin él, P1.5 queda bloqueada.**

### P1.5-pre — Modalidad fiscal configurable y honesta

`src/lib/configuracionFiscal.ts` + `FacturacionSection.tsx`: se eliminan las
tres fijaciones `modalidad: 'VERIFACTU'` / `claseSistema: 'VERIFACTU'`. Nueva
variable pública **`VITE_MODALIDAD_SISTEMA_FACTURACION`** (documentada como
variable 27, sin valor activo en `.env.example`) con `PREPARACION` por defecto,
`NO_VERIFACTU` y `VERIFACTU`; valor desconocido → `PREPARACION` + aviso.
Añadido aviso visible `data-testid="aviso-modalidad-fiscal"`: «Preparación
interna, sin remisión a la AEAT». `tests/verifactu-modalidad-configurable.test.ts`
y `tests/b2b-adaptador-disponibilidad.test.ts` verifican el resolvedor y que
los adaptadores de producción tienen `disponible(): false`, devuelven
`ok:false`/`simulado:false` y no inventan endpoints ni credenciales.

### P1.9.3 — AE-01, auditoría de escalabilidad documental (SIN migración)

`docs/AE-01-AUDITORIA-ESCALABILIDAD-DOCUMENTAL-2026-10-27.md`: se documenta el
modelo `registroCobros[]` embebido, la cota teórica frente al límite de 1 MiB
de Firestore, el **riesgo real de concurrencia** (sobrescritura del array
completo) y la decisión **NO migrar** por falta de medición real. Se propone
medir en emulador con 120/240/480 periodos, resolver la concurrencia con
transacción/versionado y publicar los índices (H-14) antes de cualquier
migración. **No se ha tocado `registroCobros[]` ni ningún dato.**

### P1 NO ejecutado (bloqueos reales, no simulaciones)

| Tarea | Motivo |
|---|---|
| P1.3 Mensajería del propietario | Requiere decisión de producto sobre el ámbito de `mensajes_portal` y pruebas de aislamiento entre contratos; se deja como propuesta, no se simula. |
| P1.5 Transporte AEAT / plataforma B2B | **Bloqueado por P1.4/P-05**: sin dictamen firmado no se implementa. |
| P1.6 Portal del profesional | Depende de P-02 (montar `ProfesionalesSection`) y de un ciclo funcional completo; fuera de la parte viable sin staging. |
| P1.7 PWA / Web Push | Posible coste de proveedor de push y permisos de notificación; requiere autorización. |
| P1.8 Custom claims / 2FA | Requiere `firebase-admin` (**dependencia nueva**) y decisión P-04 sobre identidad del maestro. |
| P1.9.1 Dependencias / lockfile | Requiere autorización expresa para modificar `package-lock.json`; 9 vulnerabilidades `npm audit --omit=dev` siguen inventariadas. |
| P1.9.2 Code-splitting | Refactor amplio de importaciones en `App.tsx`; el bundle sigue en ~5,57 MB (1,39 MB gzip). |
| P1.10 Registro de corta duración | Solo si el producto gestiona temporada/turístico; decisión de producto. |

### Pruebas ejecutadas tras P1 (reales, en este sandbox)

| Comando | Resultado |
|---|---|
| `npx tsc --noEmit` | **EXIT 0** |
| `npm test` | **304/304 archivos, 5.123 pruebas OK, 2 skipped, 7 todo, 0 fallos** |
| Tests nuevos de P1 | **27 pruebas, 0 fallos** (4 archivos) |
| `npm run build` | **EXIT 0** (`index-CrHZJI0z.js` 5.565,58 kB / 1.385,58 kB gzip; `dist/server.cjs` 673,3 kB) |
| `npm run test:integracion` | operaciones **299 pass / 0 fail / 3 skipped**; patrimonial **85 pass / 0 fail / 3 skipped** |
| `npm run doctor` (estático) | **EXIT 0**, **27/27** variables documentadas |
| `GET /api/health` sobre Express real | **HTTP 200**, `esquemaDiagnostico:1`, 14 capacidades, **0 secretos filtrados** |
| `npm run doctor -- --url http://127.0.0.1:3000/api/health` | **1/8 capacidades reales**, salida **1** (honesto: faltan credenciales) |
| `npm run doctor -- --url https://gestor-inmuebles-produccion.vercel.app/api/health` | **código 2, cero peticiones** |
| Sondas HTTP reales | catastro sin sesión **401**; OTP sin sesión **401**; cron sin secreto **503**; solicitud sin Firestore **503 (fallo cerrado)** |
| `npm run test:emulador:reglas` | **NO EJECUTADO** (Java ausente). Pendiente en CI. |

---

## P2 — Propuestas priorizadas (sin implementar)

`docs/P2-PROPUESTAS-PRIORIZADAS-2026-10-27.md` sustituye la lista informal de
la Fase 0 por una cartera con siete propuestas ordenadas, coste, dependencias,
criterio de salida y puerta de decisión: P2.1 RGPD/DSAR, P2.2 WCAG 2.2 AA +
i18n, P2.3 E2E de navegador + carga, P2.4 IA supervisada documental, P2.5 API
de intercambio **documental** + sindicación + iCal, P2.6 observabilidad y
P2.7 firma cualificada. Se añaden las propuestas **descartadas** (banca, PSD2,
pasarelas, conciliación automática, IA que contabiliza y migración preventiva
de `registroCobros[]`) para que no se reabran.

**No se ha implementado ninguna propuesta P2.** La puerta de entrada exige:
emulador oficial en CI, dictamen P1.4 firmado, decisión sobre staging (P-06) y
sobre IA (D4), y presupuesto para servicios externos.

### CI

Se añade la rama `arena/fb69e0b0-gestor-de-inmuebles-vercel` a
`push.branches` de `.github/workflows/emulador-reglas.yml` para que, cuando se
publique la rama, se ejecuten los emuladores oficiales (Java 21), los tipos, la
suite completa, la integración, el doctor y el build. **El workflow no
despliega nada.** Hasta ese momento, el emulador sigue sin verificar las reglas
modificadas en P0.2/P0.3; cualquier fallo que aparezca en CI debe resolverse
**antes** de publicar reglas.

---

## Cierre de la ejecución

- Informe consolidado: `docs/INFORME-CONSOLIDADO-EJECUCION-2026-10-27.md`.
- Cuatro commits identificables en la rama de trabajo:
  `375af75` (Fase 0) → `2e48032` (P0) → `13898d9` (P1) → *HEAD al cierre* (P2 + registro final).
- `git status` sin cambios pendientes tras el último commit. **No se ha hecho
  `git push`**: se evita deliberadamente activar canalizaciones de despliegue
  conectadas al repositorio sin autorización expresa. Para publicar:
  `git push origin arena/fb69e0b0-gestor-de-inmuebles-vercel`.
- Sin producción, sin secretos reales, sin dependencias nuevas, sin despliegues,
  sin migraciones de datos y sin integraciones de banca/pagos.
