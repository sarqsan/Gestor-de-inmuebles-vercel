# INFORME DE AUDITORÍA FINAL DE CIERRE — 2026-10-27

**Repositorio:** `sarqsan/Gestor-de-inmuebles-vercel`
**Rama:** `arena/fb69e0b0-gestor-de-inmuebles-vercel`
**HEAD verificado:** `2563831df9b026dec8276c45db40977f72883f9d`
**Alcance:** auditoría de solo lectura del resultado de P0/P1/P2.
**Veredicto:** **«NO PREPARADO»** para publicar. La validación está además
**incompleta** (emulador oficial, guardias históricas y E2E sin ejecutar).

> Este documento es el **informe consolidado de cierre** que pide la orden.
> Complementa, y en varios puntos **corrige**, a
> `docs/INFORME-CONSOLIDADO-EJECUCION-2026-10-27.md` y a
> `docs/REGISTRO-EJECUCION-2026-10-27.md`. No los sustituye.

---

## 0. Alcance, método y cambios realizados por esta auditoría

**Restricciones cumplidas.** No se ha modificado código, reglas, índices,
dependencias, configuración ni datos. No se ha hecho push, merge ni despliegue.
No se han usado secretos reales (solo valores falsos inyectados en un
servidor local efímero, ya detenido). No se han activado servicios externos.
No se han reabierto integraciones bancarias/PSD2/pagos.

**Cambio documentado (§6 de la orden).** El único cambio persistente es
**la creación de este fichero** `docs/INFORME-AUDITORIA-CIERRE-2026-10-27.md`.
Para verificar se han ejecutado acciones que no dejan huella en el repositorio:
`npm ci` desde el `package-lock.json` existente (sin tocarlo), `npx tsc
--noEmit`, `npm test`, `npm run test:integracion`, `npm run build` (el `dist/`
generado se eliminó), `npm run doctor`, `npm audit --omit=dev --json`, un
servidor Express local en puerto efímero (detenido), sondas `curl`, consultas
de solo lectura a la API de GitHub (`gh api`) y a la CLI de Firebase en su
código fuente público. Un fichero de prueba temporal
(`.probe-otp-cierre.mts`) se creó y se borró; `git status` volvió a las
**100 entradas** previas antes de escribir este informe.

**Huella del árbol auditado** (100 entradas de `git status`, manifiesto
`sha256` truncado por archivo, ordenado):
`1b2e232b110f52f985041bc19941b9db1ade800cfbcac0f916d8de7f80e1fa6f`.

**Método.** Toda afirmación de este informe procede de (a) lectura del fichero
con número de línea, (b) salida de un comando ejecutado en esta auditoría, o
(c) fuente oficial consultada. Las inferencias se marcan como tales.

---

## 1. Verificación del repositorio

### 1.1 Git: hallazgo crítico de trazabilidad

| Comprobación | Resultado REAL |
|---|---|
| Rama | `arena/fb69e0b0-gestor-de-inmuebles-vercel` ✅ |
| HEAD | **`2563831`** (el mismo que `main` y `origin/main`) |
| `git log --oneline` | **1 único commit**, marcado `(grafted)` |
| `git reflog` | solo `clone` + `checkout`; ningún commit propio |
| `git fsck --unreachable` | sin objetos |
| `git cat-file -t 375af75` / `2e48032` / `13898d9` / `d269a2f` | **NO EXISTE** en los 4 casos |
| `git ls-remote --heads origin <rama>` | **vacío**: la rama de sesión NO existe en el remoto |
| `origin/main` | `2563831` (sin cambios) |
| `git status --porcelain` | **100 entradas**: 46 ficheros modificados + 54 sin seguimiento |
| `git rev-parse --is-shallow-repository` | `true` |

> **H-01 · BLOQUEANTE DE VALIDACIÓN.** Los **cuatro commits que el informe
> consolidado da por existentes no están en este checkout**, ni local ni
> remotamente. Todo el trabajo de P0/P1/P2 está **sin confirmar (uncommitted)**
> en el árbol de trabajo. Por tanto:
> - `git revert <hash>` (los «puntos de reversión» del informe) **no funciona**;
> - `git push origin <rama>` publicaría una rama nueva con un único commit si
>   no se confirma antes el trabajo;
> - no hay una instantánea versionada que llevar a staging.
>
> El propio informe consolidado ya anticipaba un problema parecido en su
> §4 (líneas 108-115) con `708312b`/`2dddca2`, pero ahora afecta también a
> `375af75`, `2e48032`, `13898d9` y al «HEAD al cierre». Es un patrón de
> pérdida de objetos Git entre sesiones del entorno, no un fallo del código.
> El **contenido** sí está íntegro (100 ficheros, todos legibles y coherentes).

### 1.2 Diff completo respecto a la base correcta

Base correcta = `2563831`. `git diff --shortstat` = **46 ficheros modificados,
1.094 inserciones, 317 borrados** (solo cuenta los ficheros ya versionados);
sumando los 54 nuevos = **100 ficheros** en total.

| Área | Ficheros | Evidencia |
|---|---|---|
| Reglas Firebase | 1 | `firestore.rules` — 4 bloques: `candidatos.create` (2062-2063), `solicitudes.create` (2088-2090), `audit_logs.create` (2598-2605), `actas_otp` (3645-3671). |
| Servidor / endpoints | 9 | `server.ts` (165-173, 2231-2248, 2763-2800, 2827-2836), `server/portalPublico/{rutas,servicio}*`, `server/shared/rateLimit.ts`, `server/catastro/`, `server/actas/`, `server/diagnostico/`, `server/indices/`, `server/titularidades/backendTitulares.ts`. |
| Configuración | 4 | `package.json` (+3 scripts, **cero dependencias nuevas**), `.env.example` (27 variables, **0 asignaciones activas**), `.github/workflows/emulador-reglas.yml` (rama añadida en línea 14), `firebase.json`/`firestore.indexes.json`/`storage.rules`/`.firebaserc` **sin cambios**. |
| Cliente / OTP / permisos / semillas | 39 | `App.tsx`, `ActasSection.tsx`, `FacturacionSection.tsx`, `flags.ts`, `estadoInicial.ts`, `masterAdmin.ts`, `configuracionFiscal.ts`, `actaOtpEngine.ts`, `inventarioSimulaciones.ts`, `EtiquetaSimulacion.tsx`, etc. |
| Pruebas | 38 | 29 archivos de prueba nuevos + 9 modificados; 6 `skip` añadidos. |
| Documentación | 9 | Auditoría, Fase 0, configuración, registro, secciones huérfanas, P1.4, AE-01, P2, informe consolidado. |

`package-lock.json` **no aparece** en `git status`: no se ha modificado el
lockfile, coherente con «sin dependencias nuevas».

### 1.3 Correspondencia entre el informe consolidado y el código

Lo que **sí coincide** (reverificado aquí):

| Afirmación | Verificación |
|---|---|
| `npm test` 304/304 archivos, 5.123 OK, 0 fallos | ✅ Repetido: `TEST_EXIT=0`, `5123 passed \| 2 skipped \| 7 todo (5132)` |
| `test:integracion` 384 pass / 6 skipped | ✅ Repetido: 299+85 pass, 0 fail, 3+3 skip |
| `tsc` y `build` EXIT 0 | ✅ Repetido; `index-CrHZJI0z.js` 5.565,58 kB / 1.385,58 kB gzip; `dist/server.cjs` 673,3 kB — **idéntico** a lo escrito |
| `doctor` estático 27/27 variables | ✅ Repetido, 6 comprobaciones OK |
| `/api/health` 200, 14 capacidades, sin secretos | ✅ Repetido con 5 secretos falsos inyectados (ver §2.7) |
| Doctor rechaza producción con código 2 y 0 peticiones | ✅ Repetido |
| 10 vulnerabilidades npm (1 crítica, 8 altas, 1 moderada) | ✅ Repetido (§3.5) |
| `firebase.json` no declara `indexes` | ✅ Verificado (`grep` sin coincidencias) |
| 9 simulaciones inventariadas y etiquetadas | ✅ Tests de etiquetado en verde |
| Rama de sesión añadida al workflow | ✅ Línea 14 de `.github/workflows/emulador-reglas.yml` |

**Discrepancias detectadas (D-01…D-09):**

| ID | Afirmación del informe | Realidad | Clasificación |
|---|---|---|---|
| **D-01** | §4/§9: cuatro commits, `git status` limpio (líneas 103-106, 223-225) | Los commits no existen; 100 ficheros sin confirmar (§1.1) | **Bloqueante de validación** (H-01) |
| **D-02** | §5 líneas 146-149 y §7 línea 197: «Con `fetch-depth: 0` en CI **deben reevaluarse**» las 6 guardias | El `skip` es **incondicional** a que exista `docs/REGISTRO-EJECUCION-2026-10-27.md` (`integration-boundaries.test.mjs:17-18`, `operaciones/isolation.test.mjs:17-18`, `patrimonial/isolation.test.mjs:65-66`). Con historial completo **seguirían omitiéndose**. Además, con P0 ya no coincidiría la «superficie documentada» | **Bloqueante de validación** (§3.2) |
| **D-03** | §6 línea 175: «Todo lo que escribiría datos se probó **con emuladores** o servidor local» | El emulador oficial **nunca se ejecutó** (sin Java). Se usaron dobles en memoria y un harness de **texto** de las reglas | Sobreestimación; **bloqueante de validación** |
| **D-04** | §3 línea 69: alta pública con «**token** de capacidad» | El «token» es el **id de la ficha pública** (`inmuebleId` o `sol-<id>`): `servicioPortalPublico.ts:954-976` lee `fichas_publicas_inmueble/{id}`, y `firestore.rules:1425` tiene `allow get: if true`. No es un secreto de 128 bits | **Discrepancia de seguridad** |
| **D-05** | §3 línea 69: «cuerpo ≤256 KB» y «cuota 8/min» como garantías | El límite se elude con `Transfer-Encoding: chunked` (§2.2, probado) y la cuota es **por proceso** y solo en una de las 5 rutas públicas de escritura | **Bloqueante de seguridad** |
| **D-06** | §1/§3: OTP «reparado» con entrega que «falla cerrado» | Cierto en el motor y en el transporte, pero la **validación es íntegramente en el cliente** y las reglas no la refuerzan; el endpoint de entrega es un **relé de correo abierto** (§2.3) | **Bloqueante de seguridad** |
| **D-07** | §3 P0.1 / §8: «semillas desactivadas», «la UI arranca vacía» | `App.tsx:393-410` lee **antes** la caché `localStorage` sin versionar (`rentselect_propietarios`, etc.). Datos demo de una versión anterior pueden reaparecer con la bandera apagada. Los dos tests de semillas no mencionan `localStorage` | Mejora no bloqueante / discrepancia |
| **D-08** | §5: «1/8 capacidades reales» en vivo | `server/diagnostico/capacidades.ts:71-74` fija `autenticacion.estado = 'OK'` **sin verificar nada**. El «1/8 real» es una aserción estática, no una capacidad medida | Mejora no bloqueante / discrepancia |
| **D-09** | El fichero del informe consolidado termina en su §12 | **Líneas 288-289 contienen basura de shell**: `EOF` y `echo "OK"; wc -l docs/INFORME-CONSOLIDADO-EJECUCION-2026-10-27.md`. No se han corregido por la restricción de solo lectura | Mejora no bloqueante (cosmético) |

También `docs/CONFIGURACION-VERIFICABLE.md:173` dice que los 10 índices son
de «`actas`, `candidatos`, `solicitudes`, …»: **no hay ningún índice de
`candidatos` ni de `solicitudes`** (§3.4). Error factual menor, mismo
tratamiento.

### 1.4 Secretos, configuración de producción y artefactos

- `.env.example`: **0 asignaciones activas** (`grep -nE '^[A-Z][A-Z0-9_]*\s*='`
  sin resultados). Los únicos patrones de credencial son marcadores
  (`CLAVE_DE_APLICACION`) o falsos de test (`DOCTOR_SMTP_FALSO_321`).
- No existen `.env`, `.pem`, `*.key`, `credentials*.json` ni
  `*service-account*` en el árbol (búsqueda hasta profundidad 3).
- **Sin secretos reales** en los ficheros cambiados. Sí hay **datos
  personales en código**: `src/lib/masterAdmin.ts:25` y `firestore.rules:30`
  fijan `sarqsan2@gmail.com`; el doctor lo imprime en su salida estática
  (`master.paridad`). Es el problema conocido P-04, no un secreto.
- ⚠️ **Riesgo de destino (H-02).** `.firebaserc:2-4` tiene
  `"default": "gestor-inmuebles-produccion"`; `firebase.json:4` nombra la base
  de producción `ai-studio-gestordeinmueble-…`; `firebase-applet-config.json`
  apunta al mismo proyecto. **Cualquier `firebase` sin `--project` cae en
  producción.** El procedimiento recomendado en
  `docs/CONFIGURACION-VERIFICABLE.md:183` —`firebase deploy --only
  firestore:indexes --dry-run`— **no especifica `--project`**. Es un
  accidente de un comando de distancia.
- Artefactos generados: `dist/` creado por la verificación y **eliminado**;
  `node_modules/` presente y correctamente ignorado por `.gitignore`; sin
  `vitest-resultados.json`, `emulador-resultados.json` ni `.env` reales.
  Ningún artefacto generado queda sin excluir.

---

## 2. Auditoría de seguridad

### 2.1 Reglas Firebase y autorización por rol

**Confirmado.** Las cuatro modificaciones de `firestore.rules` son reales y
están bien orientadas: se retira el `create` anónimo de `candidatos`
(2062-2063) y `solicitudes` (2088-2090), se exige autoría en
`audit_logs.create` (2598-2605) y se prohíbe texto plano en `actas_otp`
(3645-3671) con precedencia corregida. `isMasterAdmin()` (29-31),
`authEmail()` (23-25), `isStaff()` (551-552), `esAdminInmuebles()` y
`ambitoPorInmuebleEscritura()` (305-308) exigen sesión y perfil veraz; no hay
una rama que conceda escritura anónima.

**Pero las reglas NO están desplegadas** y, sobre todo, **no se han probado
con el emulador oficial**: solo con `tests/harness/firestoreRulesEval.ts`,
que interpreta el texto. Los tests nuevos `tests/reglas-actas-otp.test.ts` y
`tests/reglas-audit-logs-autoria.test.ts` lo declaran en su cabecera.

**H-03 · BLOQUEANTE DE SEGURIDAD (residual, no introducido por P0).**
`firestore.rules:3540-3558` permite a un `PROPIETARIO` crear/actualizar
`actas` fijando libremente `estado` y `firmas` (`estadoValido()` solo
comprueba que el valor pertenece a una lista). Y `3658-3670` permite a un
`PROPIETARIO` crear/actualizar `actas_otp` con un `codigoHash` arbitrario,
sin restringir `estado`, `usado`, `intentos`, `maxIntentos`,
`fechaExpiracion` ni `transporteRealizado`. Consecuencia: las garantías del
motor (caducidad, 5 intentos, uso único) **no existen en la capa de datos**.

### 2.2 Alta pública de solicitudes

**Lo que funciona** (`server/portalPublico/rutasPortalPublico.ts`): lista
blanca de campos (92-113), honeypot `_hp` (131-139) comprobado **en
servidor**, cuota 8/min (127, 158-169), validación de token en el servicio
(`servicioPortalPublico.ts:128-133`, `954-976`), campos de propietario/estado
fijados por el servidor (`1005-1020`), `cuestionarioToken` con 128 bits de
`randomBytes` (1071), escritura atómica con precondición `NO_EXISTE`
(1080-1085), saneado `jsonSeguro` (927-951).

**H-04 · BLOQUEANTE DE SEGURIDAD — límite de cuerpo eludible.**
`rutasPortalPublico.ts:82-90` (`cuerpoPequeno`) y `server.ts:165-170` derivan
el tamaño **solo de `Content-Length`**. Con `Transfer-Encoding: chunked` esa
cabecera no existe, `Number(0 || 0) = 0` y la comprobación pasa;
`express.json({limit:'15mb'})` (`server.ts:172`) parsea entonces hasta 15 MB
en una ruta **anónima**. Prueba real en esta auditoría, sobre el servidor
local, con un cuerpo de 300 KB:

```
con Content-Length (>256 KB):  HTTP=413 {"codigo":"PETICION_INVALIDA", ...}
chunked SIN Content-Length:    HTTP=503 {"codigo":"PORTAL_NO_DISPONIBLE", ...}
```

El 503 es el fallo cerrado por falta de Firestore, **no** un rechazo por
tamaño: la petición grande llegó a la ruta. `tests/rate-limit-solicitud.test.ts:33`
monta `express.json({limit:'300kb'})`, distinto al de producción, por lo que
la suite no detecta el caso.

**H-05 · BLOQUEANTE DE SEGURIDAD — cuota no global y cobertura parcial.**
`server/shared/rateLimit.ts:2-9` reconoce explícitamente que el limitador es
**en memoria y por instancia**: en Vercel cada contenedor tiene su ventana y
un arranque en frío la reinicia. `claveClientePeticion` (90-100) toma el
primer valor de `x-forwarded-for` si «parece» una IP —`esIp` (102-104) es
un regex laxo—, así que la clave es manipulable. Además, el `limitador` se
crea en `rutasPortalPublico.ts:127` pero **solo se usa en
`/api/solicitud/:token` (158)**. Las otras cuatro rutas públicas de
escritura —`/api/visita/:token/reservar` (183), `/cancelar` (195),
`/api/cuestionario/:token` (207), `/api/documentacion/:token` (225)— no
tienen ni cuota ni honeypot. 12 POST consecutivos a dos de ellas devolvieron
12×`503` y **ningún `429`**. En el servidor local sin Firestore el limitador
de `solicitud` ni siquiera se alcanza (`exigirServicio` va antes, línea 145),
por lo que la evidencia en vivo de «8/min» es solo la del test unitario con
servicio doble.

**H-06 · Mejora no bloqueante — el «token» no es una capacidad.**
`servicioPortalPublico.ts:954-976` resuelve `fichas_publicas_inmueble/{token}`
y `firestore.rules:1425` permite `allow get: if true`. `App.tsx:3708-3715`
confirma que el enlace se publica como `sol-<idInmueble>`.Cualquiera que
conozca un `inmuebleId` puede presentar solicitudes; no hay deduplicación
por correo. Es un formulario público por diseño, pero la palabra «capacidad»
en el informe consolida una garantía que no existe.

### 2.3 OTP: generación, hash, caducidad, intentos, uso único, entrega

**Motor (`src/utils/actas/actaOtpEngine.ts`) — correcto en su capa:**
`generarCodigoOtp` (46-56) usa `crypto.getRandomValues` con rechazo de
sesgo y lanza si no hay CSPRNG; `hashCodigo` (58-65) usa SHA-256 salado y
lanza sin `crypto.subtle`; `crearOtpActa` (67-112) fija 6 dígitos, sal de
128 bits, **caducidad 15 min** (24, 83), **`maxIntentos` 5** (23, 101),
`usado:false` (102); `validarOtp` (114-164) aplica estado, uso único,
expiración, intentos y limpia el campo plano heredado;
`entregarOtpActa` (245-266) **lanza** si `enviado:false` o `simulado:true`.
Servidor: `server/actas/rutasEntregaOtp.ts:55-59` verifica ID token y
74-80 falla cerrado en `MODO_SEGURO`, 88-93 en rechazo del proveedor; el
código no aparece en logs ni en la respuesta (95-101).

**H-07 · BLOQUEANTE DE SEGURIDAD — el OTP es autoemitido y forjable.**
Todo el ciclo ocurre en el navegador (`ActasSection.tsx`):
`crearOtpActa` (213), `saveOtpActaFirestore(otp)` (224), entrega (228-233),
`transporteRealizado: true` escrito por el cliente (235),
`validarOtp` (269), `saveOtpActaFirestore(otpActualizado)` (270) y
`completarFirma` + `cerrarActaTrasFirmas` (284-295). El servidor **solo
reenvía un correo con un código que le entrega el cliente**; no genera ni
verifica ningún código. Combinado con H-03, un usuario con rol
`PROPIETARIO` puede crear su propio `actas_otp` con el hash que quiera,
marcarlo como entregado y firmar el acta sin que exista prueba de recepción.
La firma OTP **no debe presentarse como prueba de consentimiento** hasta que
la generación, el hash, la validación y el cierre del acta sean
server-side (Admin SDK / Cloud Function) y las reglas restrinjan esos campos.

**H-08 · BLOQUEANTE DE SEGURIDAD — relé de correo abierto.**
`rutasEntregaOtp.ts:61` toma `destino` del cuerpo y solo valida formato de
correo (65-66); **no comprueba** que el destino sea el firmante del acta
ni que el `uid` tenga permiso sobre `actaId`/`firmaId`. Cualquier usuario
autenticado puede enviar correos con la plantilla de la app a cualquier
dirección. Prueba real de esta auditoría (servidor Express efímero con
verificador y transporte dobles, fichero temporal ya borrado):

```
POST /api/actas/otp/entregar  Bearer: token-cualquiera (uid-inquilino)
{ destino: "cualquier-persona@externo.example", codigo: "123456",
  actaId: "ACTA-DE-OTRO", firmaId: "f1" }
→ CORREO_ENVIADO_A=cualquier-persona@externo.example
→ HTTP=200 {"ok":true,"enviado":true,...}
```

La cuota de 5/min (51, 69) se puede eludir variando `actaId`/`firmaId`
(ambos libres, 63-66), porque entran en la clave. `actaId` además se
interpola en asunto y cuerpo (34-42), con hasta 120 caracteres
`[A-Za-z0-9._:-]`.

**H-09 · BLOQUEANTE DE SEGURIDAD (cripto en reposo).** `codigoHash`
es `SHA-256(sal:codigo)` sobre **10⁶** posibilidades, y
`firestore.rules:3653-3654` permite leer `codigoHash` + `codigoSalt` al
propietario. Medición real en este sandbox: **fuerza bruta offline del
espacio completo en 134 ms**. Un hash salado rápido no es un verificador
adecuado para un OTP de 6 dígitos; se necesita HMAC con secreto solo del
servidor o KDF lenta (scrypt/argon2/PBKDF2 con coste alto), además de mover
la comparación al servidor.

### 2.4 Catastro y demás endpoints protegidos

**Correcto.** `server/catastro/autorizacionCatastro.ts:43-76` exige
`Authorization: Bearer`, verifica el ID token con
`dependenciasIA.verificarToken` y aplica cuota 20/min por `uid`+IP;
`server.ts:2231-2248` devuelve 401/429 antes de tocar la sede. Sonda real:
`POST /api/catastro/consultar` sin sesión → **401 `NO_AUTENTICADO`**.

`verificarIdToken` (`server/titularidades/googleBackend.ts:338-…`) comprueba
RS256, `kid`, certificados, audiencia, emisor y caducidad, y **deniega** si
no puede verificar. No es una comprobación de cliente.
`server/ia/configuracionIA.ts:221` devuelve `null` (fallo cerrado) si falta
configuración.

Otros endpoints revisados: las 12 rutas de IA usan el middleware
`nucleoIA.operacion(...)` (`server.ts:303-2654`); `/api/titulares/buscar`
usa `manejadorBuscarTitulares.ts:36,41` → `backendTitulares.ts:276-282`
(401 `no_autenticado`); `/api/notificaciones/enviar` usa
`resolverContextoDeRequest` → `verificadorTokenNotificaciones`
(`server.ts:126-142`) con perfil en Firestore y denegación por defecto;
los módulos montados (seguimiento, justificantes, actualización de renta,
documentos, admin IA, llaves IA, prueba SMTP) reciben `verificarToken`
(`server.ts:2808-2910`). Sonda real: `/api/actas/otp/entregar` sin token →
**401**; `/api/cron/avisos` sin secreto → **503**.

**Excepción legítima:** `/api/health` (2763) y las rutas de portal público
son anónimas por diseño. Lo que exponen se analiza en §2.7.

**H-10 · Mejora no bloqueante.** `/api/actas/otp/entregar` autentica pero
**no autoriza por rol ni por ámbito** (ver H-08). Es el único endpoint
autenticado revisado sin comprobación de perfil/propiedad.

### 2.5 Semillas y acceso de administradores

**Correcto en lo esencial.** `src/lib/flags.ts:34-45` solo activa con
`1/true/si/sí/on` y falla cerrado si no hay `import.meta.env`;
`src/data/estadoInicial.ts:68-83` devuelve arrays/vacíos neutros sin
`VITE_DEMO_DATA`; `src/lib/firebase.ts:190-200` y `3421-3425` retornan
**antes de cualquier escritura** si `semillasHabilitadas()` es falso;
`firebase.ts:2753` condiciona también la aseguradora SEAG;
`.env.example` no activa ninguna bandera. Los tests
`tests/seeds-desactivados.test.ts` y `tests/estado-inicial-vacio.test.tsx`
están en verde.

**H-11 · Mejora no bloqueante (D-07).** `App.tsx:393-410` (y el mismo patrón
en los demás estados) lee `localStorage.getItem('rentselect_*')` **antes**
de llamar a `inicial*()`. La caché no está versionada ni condicionada a la
bandera: un navegador con datos de una versión anterior puede mostrar
inmuebles/candidatos/Gmail «conectado» falsos con `VITE_DEMO_DATA=false`.
Ninguno de los dos tests citados ejercita `localStorage`. Mitigación:
versionar las claves de caché o condicionar su lectura a la bandera.

### 2.6 Justificantes: ningún cobro automático

**Confirmado.** `tests/justificantes-sin-contabilizacion.test.ts` verifica 5
superficies documentales; búsqueda independiente en esta auditoría:
`registrarPagoPeriodo` solo aparece en `src/utils/cobrosEngine.ts:451` (motor),
`CobrosSection.tsx:290`, `InmueblesSection.tsx:451` (botones humanos) y en
`src/utils/morosidad/morosidadStore.ts:642`, invocado únicamente desde
`MorosidadDetalleModal.tsx:396` (acción de usuario). Ningún módulo de
`server/cobros/*` ni de `src/components/portal-inquilino/*` lo importa.
`JustificantesCobroInbox.tsx:176,253` advierte explícitamente que aceptar
«No modifica el cobro». La exclusión permanente de banca/PSD2/pasarelas
está respetada en todo el diff.

**H-12 · Mejora no bloqueante.** El test es un **escáner de texto de 5
rutas**, no una prueba de comportamiento de todo el repositorio. Una futura
integración en otro fichero no sería detectada. Ampliar a un escaneo global
o a una prueba de efectos sobre `registroCobros`.

### 2.7 Doctor y `/api/health`

**Sin exposición de secretos.** Prueba con 5 valores falsos inyectados
(`GEMINI_API_KEY=FAKE_AIzaSyDUMMY…`, `CRON_SECRET=FAKE_CRON_SECRET…`,
`MASTER_ADMIN_EMAIL=auditor@example.invalid`,
`IA_LLAVES_CLAVE_MAESTRA=FAKE_MASTER_KEY…`): `/api/health` devolvió **200**
y el JSON **no contenía ninguno** de los valores. Sí publica, por diseño,
solo presencias/estados: `geminiKeyConfigured`, `configuracion.entorno`,
`master.overrideConfigurado`, `notificaciones.email.modo`,
`cron.configurado`, `ia` (modos y contador `operaciones`) y 14 capacidades.
La cadena `CRON_SECRET` aparece únicamente como **nombre de variable** dentro
del detalle `CRON_SECRET configurado; …`, no como valor.
`tests/health-capacidades.test.ts:134-139` y el doctor estático
(`scripts/doctor.mjs:177-179`, `entorno.sin_secretos`) lo cubren. El doctor
rechazó `gestor-inmuebles-produccion.vercel.app` y `example.com` con
**código 2 y cero peticiones**.

**H-13 · Mejora no bloqueante (D-08).**
`server/diagnostico/capacidades.ts:71-74` declara
`autenticacion: { estado:'OK', detalle:'ID token verificado…' }` de forma
**incondicional**, sin consultar si `verificarIdToken` está configurado. El
doctor en vivo informa «1/8 capacidades reales» contando esa aserción.
Debe derivarse de una comprobación real (p. ej. proyecto/credencial
resueltos) o etiquetarse `NO_VERIFICADO`.

---

## 3. Validación pendiente

### 3.1 Emulador oficial de reglas: pruebas exactas que faltan

`npm run test:emulador:reglas` = `firebase-tools@15.33.0 emulators:exec
--only auth,firestore,storage --project demo-gestor-reglas` + Vitest con
`vitest.emulador.config.ts` (`include: tests/emulador/**/*.emulador.test.ts`,
`fileParallelism:false`). **No ejecutado**: `java` no existe en el sandbox
(`command -v java` vacío) y `firebase-tools` no está instalado localmente
(`npx` tendría que descargarlo, lo que esta auditoría no hace).

Se omiten **6 archivos / 67 declaraciones `it()`** :

| Archivo | `it()` | Ámbito |
|---|---|---|
| `tests/emulador/reglas-inmuebles.emulador.test.ts` | 34 | reglas de `inmuebles` y aislamiento |
| `tests/emulador/documentos-p3.emulador.test.ts` | 12 | custodia documental P3, `audit_logs` |
| `tests/emulador/importacion-adaptador.emulador.test.ts` | 8 | importación/exportación |
| `tests/emulador/documentos-servidor.emulador.test.ts` | 7 | documento servidor, `solicitudes`/`candidatos` |
| `tests/emulador/storage-ambitos.emulador.test.ts` | 5 | reglas de Storage |
| `tests/emulador/justificantes-cobro.emulador.test.ts` | 1 | ciclo de justificantes |

**Por qué falta más que «instalar Java»:**

1. `grep` en `tests/emulador/` devuelve **cero coincidencias de `actas_otp`**.
   Ningún caso del emulador valida las reglas cambiadas en P0.3.
2. No hay casos nuevos para `solicitudes.create`, `candidatos.create` ni
   `audit_logs.create` (P0.2); las menciones existentes son de otros flujos.
   Los tests P0.2/P0.3 (`tests/reglas-actas-otp.test.ts`,
   `tests/reglas-audit-logs-autoria.test.ts`) son **harness de texto**, no
   emulador.
3. `firebase.json:2-7` asocia las reglas a la base **con nombre**
   `ai-studio-gestordeinmueble-…`, mientras que varios tests usan
   `getFirestore(app)` (base `(default)`), p. ej.
   `documentos-p3.emulador.test.ts:123-127`. Otros usan la base con nombre
   por REST (`justificantes-cobro.emulador-util.ts:7`). **No está verificado
   que el emulador cargue `firestore.rules` para la base correcta** en todos
   los casos.

**Conclusión:** ejecutar el workflow con Java 21 es necesario pero **no
suficiente**. Hay que añadir casos de emulador para los 4 bloques de reglas
modificados y fijar explícitamente el `databaseId`.

### 3.2 Las seis guardias históricas y su base de comparación

Seis pruebas `node:test`, confirmadas en la salida de
`npm run test:integracion` (3 de operaciones + 3 de patrimonial, todas con
`# SKIP`):

| # | Prueba | Fichero:línea |
|---|---|---|
| 1 | `servicios/modelos heredados y entrypoints conservan el checkout f782…` | `src/features/operaciones/tests/integration-boundaries.test.mjs:85` |
| 2 | `custodia byte a byte de la base patrimonial de B…` | `src/features/operaciones/tests/isolation.test.mjs:254` |
| 3 | `diff local desde el checkout f782 permite solo la superficie documentada` | `src/features/operaciones/tests/isolation.test.mjs:448` |
| 4 | `dependencias y lockfile siguen exactamente como en el checkout canónico` | `src/features/patrimonial/tests/isolation.test.mjs:75` |
| 5 | `ningún archivo productivo del worktree queda fuera de la superficie documentada frente a f782` | `src/features/patrimonial/tests/isolation.test.mjs:524` |
| 6 | `BLOQUES 10-12: reglas byte a byte, sin borrados y con API de servicios preservada` | `src/features/patrimonial/tests/isolation.test.mjs:560` |

Bases: `f782e53ed3beefa4cdcae4e839457480f9cfd995` (2026-10-17) y
`46bb9f79b43949d833acf00e9557e575769d039a` (2026-09-28). **Ambas existen en
GitHub** —verificado con `gh api repos/…/commits/<sha>` (200 en los dos
casos)— pero no en el clon superficial.

**H-14 · BLOQUEANTE DE VALIDACIÓN (D-02).** La condición de salto es
`existsSync(docs/REGISTRO-EJECUCION-2026-10-27.md) ? <mensaje> : false` en
los tres ficheros (líneas 17-18, 17-18 y 65-66). Como el documento existe,
el `skip` es **permanente**, aunque se clone con historial completo. El
informe consolidado afirma lo contrario (líneas 148, 197, 243).

**Secuencia para recuperar una base fiable:**

1. `git fetch --unshallow origin` (o clon con `fetch-depth: 0`) y verificar
   `git cat-file -e f782…^{commit}` y `46bb…^{commit}`; alternativamente
   fijar los blobs de referencia como fixtures versionadas para no depender
   de la topología del historial.
2. **Confirmar el trabajo en commits** (resuelve H-01): las guardias comparan
   `git diff <base> -- <path>` y necesitan una referencia estable.
3. **Rebasar la «superficie documentada»**: P0 cambió `package.json`,
   `firestore.rules`, `server.ts`, `App.tsx` y decenas de ficheros; las
   allowlists de los tests deben actualizarse explícitamente (y revisarse
   por un humano) en lugar de ampliarse de forma automática.
4. Cambiar la condición a `skip: !existeCommit(base) ? 'commit ausente…' :
   false`, de modo que el skip **solo** se aplique cuando falte el objeto.
5. Ejecutar con historial completo y **sin** `skip`; cualquier fallo debe
   resolverse, no silenciarse.

### 3.3 Alcance del E2E de navegador pendiente

No existe ninguna prueba E2E de navegador (ni Playwright ni Cypress) en el
repositorio; es la propuesta P2.3. El alcance mínimo que falta, derivado de
los cambios P0/P1, es:

1. **Alta pública anónima** (`/solicitud/:token`): ficha pública, honeypot
   invisible, envío, acuse del servidor, y **verificación de que el
   navegador no escribe en Firestore** (sin SDK en la ruta).
2. **Bandeja de solicitudes** (ADMIN): listado, apertura de
   `SolicitudDetailModal`, cambio de estado y conversión explícita a
   candidato, sin recargas.
3. **Firma OTP de acta**: solicitar firma, entrega real contra un transporte
   de captura, código recibido, validación, y —crítico— comprobar el estado
   final en el **emulador** (no solo en la UI).
4. **Justificantes**: inquilino aporta, gestor acepta/rechaza con motivo, y
   comprobación de que el cobro canónico **no cambia**.
5. **Facturación en `PREPARACION`**: aviso visible
   `data-testid="aviso-modalidad-fiscal"`, QR con URL `NO_VERIFACTU`, y
   ausencia de cualquier indicio de remisión a AEAT.
6. **Recorridos por rol** en los cuatro portales con aislamiento entre
   contratos, más axe para WCAG 2.2 AA.

Requiere un entorno de staging o emuladores con Storage/Auth; **no puede
ejecutarse en este sandbox** sin Java ni proyecto aislado.

### 3.4 Los diez índices: consultas, configuración y riesgos

`firestore.indexes.json` = 10 índices, `fieldOverrides: []`, más dos claves
no pertenecientes al esquema (`notes` y `description` por índice).

| # | Colección / campos | Consulta que lo necesita | Necesidad HOY |
|---|---|---|---|
| 1 | `actas` (ownerId, propertyId, fechaCreacion) | `subscribeActasPorInmueble` (`src/lib/firebaseActas.ts:69-78`) filtra **en cliente** | Opcional / prospectivo |
| 2 | `actas` (ownerId, contractId, fechaCreacion) | `subscribeActasPorContrato` (80-89), filtro en cliente | Opcional |
| 3 | `actas` (ownerId, tipo, estado) | Filtros de UI, en cliente | Opcional |
| 4 | `actas_evidencias` (ownerId, actaId, orden) | Ordenación de evidencias | Prospectivo |
| 5 | `actas_incidencias` (ownerId, actaId, fechaHora) | Incidencias por acta | Prospectivo |
| 6 | `actas_otp` (ownerId, actaId, estado) | `subscribeOtpPorActa` (`firebaseActas.ts:257,265`): `where(actaId==)` y `where(actaId==)+where(ownerId==)` | **Posiblemente necesario** (dos igualdades) |
| 7 | `gestiones_cartera` (propietarioId, estado) | `listarGestionesDePropietario` (`gestionesCarteraServicio.ts:391-399`) | Condicional: hoy `firebase.ts:902` consulta solo por `gestorUsuarioId` |
| 8 | `gestiones_cartera` (gestorUsuarioId, estado) | `listarGestionesDeGestor` (401-409) | Condicional (ídem) |
| 9 | `ia_operaciones` (uidTitular, iniciadaEn DESC) | `gobiernoIA.ts:518-522` igualdad + orden | **Necesario** |
| 10 | `ia_operaciones` (uid, iniciadaEn DESC) | `gobiernoIA.ts:523-527` igualdad + orden | **Necesario** (compatibilidad) |

**Configuración actual:** `firebase.json:2-7` declara `rules` pero **no
`indexes`**. `prepare.ts` de `firebase-tools` solo llama a `prepareIndexes`
cuando existe esa clave → **ningún comando de despliegue publicaría los
índices hoy**, ni siquiera `--only firestore`. El test
`tests/configuracion-indices.test.ts` fija ese contrato.

**Riesgos de publicación:**

- **R-1 (alto).** `.firebaserc:3` apunta a **producción**. El comando
  sugerido en `docs/CONFIGURACION-VERIFICABLE.md:183` no lleva `--project`.
  Añadir siempre `--project <staging>` y verificar con
  `firebase firestore:indexes --project <staging> --database <id>`.
- **R-2 (alto).** `fieldOverrides: []` + `--force` **borra** las exclusiones
  de campo y los índices creados por consola que no estén en el fichero.
  Nunca usar `--force` sin antes listar y comparar los índices del proyecto.
- **R-3 (medio).** Con la configuración **array multi-base**,
  `firebase deploy --only firestore:indexes` fue un **no-op silencioso** en
  `firebase-tools` 15.10.0 (issue `firebase/firebase-tools#10447`). La
  corrección (PR `#9770`, fusionada el 2026-05-06) está en `main` —ver
  `src/firestore/fsConfig.ts`, que ya trata `rules`/`indexes` como
  `allDatabases`— y por tanto previsiblemente en la versión fijada
  **15.33.0** (publicada 2026-10-08). Aun así debe **confirmarse** con la
  CLI real y comprobando el incremento de versión en consola.
- **R-4 (bajo, descartado como defecto).** `description` y `notes` **no
  están en el esquema** (`firebase-tools/src/firestore/api-spec.ts`:
  `Index` e `IndexFile`), pero `api.ts:703-728` (`upgradeOldSpec`)
  **reconstruye** cada índice con solo las claves conocidas y `deploy.ts`
  solo lee `indexes`/`fieldOverrides`. Se ignoran: no bloquean el despliegue.
- **R-5 (bajo).** Error factual en `docs/CONFIGURACION-VERIFICABLE.md:173`
  («candidatos, solicitudes»): ninguno de los 10 índices es de esas
  colecciones.

### 3.5 Las diez vulnerabilidades npm (sin tocar el lockfile)

`npm audit --omit=dev --json` → `critical:1, high:8, moderate:1, total:10`.
Versiones instaladas y alternativas de corrección (solo propuestas; **el
lockfile no se ha modificado**):

| Paquete | Sev. | Instalada | Directa | Vía / impacto | Alternativa |
|---|---|---|---|---|---|
| `dompurify` | **CRÍTICA** | 3.4.15 | No — `jspdf@4.2.1` | XSS por reparación de HTML con `SAFE_FOR_TEMPLATES`/`IN_PLACE` y hooks `afterSanitize`; afecta a la generación de PDF con HTML | `overrides: {"dompurify":"3.4.17"}` (la corrección es `>3.4.16`), o actualizar `jspdf` cuando arrastre la versión corregida. Verificar PDFs generados. |
| `@grpc/grpc-js` | Alta | 1.9.16 | No — `firebase@12.19.0 → @firebase/firestore@4.17.2` | `getAuthContext` puede devolver certificados no autorizados; fuga de mensajes de error | `overrides: {"@grpc/grpc-js":"1.14.6"}`. Es la causa raíz de las 3 alertas siguientes. |
| `firebase` | Alta | 12.19.0 | **Sí** (`^12.17.1`) | Arrastra lo anterior | ⚠️ `npm audit` propone `firebase@9.14.0`, que es un **downgrade major** desde 12.x: **no aplicar sin más**. Corregir vía override de `@grpc/grpc-js` o planificar migración a `firebase@13`. |
| `@firebase/firestore` | Alta | 4.17.2 | No | Vía `@grpc/grpc-js` | Ídem (override). |
| `@firebase/firestore-compat` | Alta | — | No | Vía `@firebase/firestore` | Ídem. |
| `nodemailer` | Alta | 6.10.1 | **Sí** (`^6.10.1`) | Inyección de comandos SMTP (CRLF en `List-*`, `envelope.size`, EHLO/HELO) y envío a dominio no previsto; afecta al transporte de correo y a la entrega OTP | Solo `nodemailer@10.2.1` sale del rango vulnerable (`<=10.1.3`): es un **salto de major** que exige prueba de regresión del transporte. No hay parche en 6.x. |
| `vite` | Alta | 6.4.3 | **Sí** (`^6.2.3`, también dev) | Ejecución cross-origin vía middleware y problemas de `launch-editor` en Windows | Subir a `>=6.4.4` (el plan P1.9.1 proponía 6.4.5). Es dependencia de build, no de runtime. |
| `body-parser` | Alta | 1.20.8 | No — `express@4.22.3` | DoS por bytes finales tras cuerpo comprimido | `overrides: {"body-parser":"1.20.9"}`. Especialmente relevante por H-04. |
| `qs` | Moderada | 6.16.0 | No — `express`/`body-parser` | `qs.stringify` con `arrayFormat:'comma'` lanza `TypeError` no capturado (DoS) | `overrides: {"qs":">=6.16.1"}` (o la versión corregida que publique el advisory). |
| `source-map-js` | Alta | 1.2.1 | No — `vite`/`@tailwindcss/vite` | DoS del event-loop mediante offsets de secciones de source-map | `overrides: {"source-map-js":"1.2.2"}`. |

Todas las correcciones requieren `npm install` para regenerar
`package-lock.json`, **expresamente prohibido en esta orden**; se documentan
como alternativas para cuando se autorice P1.9.1. La criticidad real de
`dompurify` depende de que la app pase HTML controlado por el usuario a
`jspdf`; conviene confirmarlo con una prueba antes de priorizar.

---

## 4. Clasificación de hallazgos

| ID | Hallazgo | Clase | Evidencia |
|---|---|---|---|
| H-01 | Cuatro commits inexistentes; 100 ficheros sin confirmar; rama ausente en remoto | **Bloqueante de validación** | §1.1 |
| H-02 | `.firebaserc` por defecto en producción + comando de índices sin `--project` | **Bloqueante de seguridad** | §1.4, §3.4 R-1 |
| H-03 | Reglas permiten al propietario fijar `firmas`/`estado` de actas y reescribir OTP | **Bloqueante de seguridad** | §2.1 |
| H-04 | Límite de 256 KB eludible con `Transfer-Encoding: chunked` (probado 413→503) | **Bloqueante de seguridad** | §2.2 |
| H-05 | Cuota en memoria por instancia, clave manipulable, y ausente en 4 rutas públicas | **Bloqueante de seguridad** | §2.2 |
| H-07 | OTP generado/hasheado/validado en cliente; firma forjable | **Bloqueante de seguridad** | §2.3 |
| H-08 | Relé de correo OTP abierto a cualquier autenticado (probado HTTP 200) | **Bloqueante de seguridad** | §2.3 |
| H-09 | SHA-256 salado de 6 dígitos: fuerza bruta en 134 ms | **Bloqueante de seguridad** | §2.3 |
| H-14 | 6 guardias con `skip` incondicional; `fetch-depth:0` no las reactiva | **Bloqueante de validación** | §3.2 |
| H-15 | Emulador oficial no ejecutado; 67 casos y **0** para las reglas nuevas | **Bloqueante de validación** | §3.1 |
| H-16 | Índices no declarados en `firebase.json`; riesgo de borrado con `--force`; CLI a confirmar | **Bloqueante de validación** | §3.4 |
| H-17 | Sin staging (P-06) y sin dictamen fiscal (P-05) | **Bloqueante de validación / externo** | §5 |
| H-06 | El «token» público es un id de ficha legible anónimamente | Mejora no bloqueante | §2.2 |
| H-10 | Endpoint OTP autentica pero no autoriza por rol/ámbito (parte de H-08) | Mejora no bloqueante | §2.4 |
| H-11 | Caché `localStorage` no versionada puede mostrar datos demo | Mejora no bloqueante | §2.5 |
| H-12 | Invariante de justificantes es escáner de 5 ficheros | Mejora no bloqueante | §2.6 |
| H-13 | `capacidades.autenticacion` OK hardcodeado ⇒ «1/8 real» sobreestimado | Mejora no bloqueante | §2.7 |
| D-03 | Informe dice «probado con emuladores» sin haberlos ejecutado | Mejora no bloqueante (documental) | §1.3 |
| D-09 / R-5 | Líneas de shell al final del informe; colecciones de índices mal citadas | Mejora no bloqueante (documental) | §1.3, §3.4 |
| — | 10 vulnerabilidades npm (1 crítica) | Mejora no bloqueante (deuda de seguridad) | §3.5 |
| — | Bundle 5,57 MB sin code-splitting; E2E de navegador ausente | Mejora no bloqueante | §1.3, §3.3 |

---

## 5. Decisión de publicación

### Veredicto: **«NO PREPARADO»**

No se debe publicar en producción, ni abrir una PR de despliegue, ni
desplegar `firestore.rules`. La validación está además **incompleta**:
faltan emulador oficial, casos para las reglas nuevas, las 6 guardias
históricas y el E2E de navegador.

**Motivos determinantes:** siete bloqueantes de seguridad (H-02…H-09) y
cinco de validación (H-01, H-14, H-15, H-16, H-17). Dos de ellos —el relé
de correo OTP y la elusión del límite de cuerpo— se han **demostrado con
peticiones HTTP reales** en esta auditoría, no solo inferidos del código.

### Qué se puede validar de forma segura en un staging aislado

Solo **después** de cerrar H-01 (commits) y H-02 (`.firebaserc`), y con un
proyecto `--project <staging>` explícito, distinto de
`gestor-inmuebles-produccion`, con credenciales de servicio propias y datos
sintéticos:

1. Publicar `firestore.rules` y ejecutar los **nuevos casos de emulador**
   para `solicitudes`, `candidatos`, `audit_logs` y `actas_otp`, incluidos
   intentos de escritura anónima y de reescritura de `codigoHash`.
2. Verificar el límite de cuerpo con **chunked** y la cuota bajo varias
   instancias; medir si se necesita un limitador distribuido.
3. Probar entrega OTP con un **transporte de captura** (SMTP local), nunca
   con el buzón real, y comprobar que el destino está ligado al firmante.
4. Declarar `indexes` en `firebase.json` y comparar
   `firebase firestore:indexes --project <staging> --database <id>` **antes**
   de cualquier `--force`; comprobar que los 10 índices aparecen.
5. Ejecutar los recorridos E2E del §3.3 contra emuladores/staging.
6. Repetir `npm run doctor -- --url <staging>/api/health` con
   `--permitir-host` y verificar que las 8 capacidades núcleo pasan a `OK`.

### Requisitos externos que siguen pendientes (no asumir que existen)

- **No existe staging** (P-06). La orden pide no darlo por supuesto: se
  confirma que `.firebaserc` solo tiene `default: produccion` y que no hay
  alias de staging ni segundo proyecto en la configuración.
- **No existe dictamen fiscal firmado** (P-05); P1.5 sigue bloqueada.
- **No hay autorización** para `firebase-admin`/custom claims (P-04), para
  `overrides` del lockfile (P1.9.1), ni para contratar correo/IA/push.
- **No hay política/DPIA de IA** (D4) ni claves.
- Se necesita **Java 21** y `firebase-tools@15.33.0` en el entorno de CI.
- Se necesita un **historial Git completo** (`fetch-depth: 0`) para las
  guardias históricas.

---

## 6. Estado de cada bloque

| Bloque | Estado real | Observación de cierre |
|---|---|---|
| **P0.1** | Implementado, verificado localmente | ⚠️ H-13 (autenticación OK hardcodeada) y H-11 (caché localStorage). Master con correo personal (P-04). |
| **P0.2** | Implementado, verificado localmente | ⚠️ H-04, H-05, H-06; reglas **sin desplegar** y sin emulador. El «token» no es capacidad. |
| **P0.3** | Implementado en motor y transporte | ❌ H-03, H-07, H-08, H-09: la firma OTP **no es una prueba fiable** hasta moverla al servidor. No presentarla como tal. |
| **P0.4** | Implementado, verificado localmente | ⚠️ H-14 (`skip` incondicional) y H-16 (índices). Paridad menú↔guarda correcta. |
| **P1.1** | ✅ Invariante verificado | H-12: ampliar cobertura del escáner. |
| **P1.2** | ⚠️ Parcial y honesto | Proveedor remoto `PENDIENTE` que falla cerrado; snapshot caduca ~2026-12-01. |
| **P1.4** | ⚠️ Pre-dictamen técnico | **No es dictamen fiscal**; P-05 pendiente. |
| **P1.5-pre** | ✅ Modalidad configurable | `PREPARACION` por defecto, aviso visible, adaptadores B2B `disponible():false`. |
| **P1.9.3** | ✅ AE-01 sin migración | Medición real pendiente. |
| P1.3 / P1.6 / P1.7 / P1.8 / P1.9.1 / P1.9.2 / P1.10 | No ejecutados, con motivo | Ninguno presentado como hecho. |
| **P2** | Propuestas documentadas | Sin implementar; exclusiones permanentes recogidas. |

---

## 7. Pruebas ejecutadas y NO ejecutadas en esta auditoría

**Ejecutadas (reales, salidas conservadas en `/tmp` del sandbox):**

| Comando / sonda | Resultado |
|---|---|
| `npx tsc --noEmit` | EXIT 0 |
| `npm test` | EXIT 0 — **304/304** archivos, **5.123 passed**, 2 skipped, 7 todo, 0 fallos (225,10 s) |
| `npm run test:integracion` | EXIT 0 — 302 pruebas (299 pass / 3 skip) + 88 (85 pass / 3 skip) |
| `npm run build` | EXIT 0 — 5.565,58 kB / 1.385,58 kB gzip; `dist/server.cjs` 673,3 kB. `dist/` eliminado después. |
| `npm run doctor` | EXIT 0 — 27/27 variables, 6 comprobaciones estáticas OK |
| `npm run doctor -- --url http://127.0.0.1:3000/api/health` | EXIT **1** — 1/8 capacidades reales (honesto) |
| `npm run doctor -- --url <producción>` / `example.com` | EXIT **2** — destino rechazado, 0 peticiones |
| `GET /api/health` con 5 secretos falsos | HTTP 200, 14 capacidades, **0 valores filtrados** |
| `POST /api/catastro/consultar` sin sesión | **401 `NO_AUTENTICADO`** |
| `POST /api/actas/otp/entregar` sin sesión | **401** |
| `GET /api/cron/avisos` sin secreto | **503** |
| 12 POST a `/api/cuestionario/:token` y `/api/visita/:token/reservar` | 12×503, **0×429** (sin cuota) |
| Cuerpo 300 KB con y sin `Content-Length` | **413** vs **503** (bypass H-04 confirmado) |
| `POST /api/actas/otp/entregar` con doble de transporte | **HTTP 200 `enviado:true`** a correo externo arbitrario (H-08) |
| Fuerza bruta SHA-256 salado de 6 dígitos | **134 ms** (H-09) |
| `npm audit --omit=dev --json` | 10 vulnerabilidades: 1 crítica, 8 altas, 1 moderada |
| `gh api` commits `f782…` / `46bb…` | **200** en ambos (existen en GitHub) |
| `gh api` `firebase-tools` `fsConfig.ts` / `api.ts` / `api-spec.ts` | Confirma R-3 (fix multi-DB) y R-4 (`description` ignorado) |
| Escaneo de secretos / artefactos / `.env.example` | 0 asignaciones activas, 0 credenciales reales, 0 artefactos sin ignorar |

**NO ejecutadas (no se declaran superadas):**

- `npm run test:emulador:reglas` — **sin Java 21** y sin `firebase-tools`
  local. 6 archivos, 67 casos. Ver §3.1.
- Las **6 guardias históricas** — `skip` incondicional; ni siquiera con
  historial completo se ejecutarían. Ver §3.2.
- **E2E de navegador** y pruebas de carga — no existen; propuesta P2.3.
- **E2E OTP con emulador oficial** y cualquier prueba contra Firestore
  real — sin credenciales ni staging.
- Cualquier despliegue de reglas/índices, `--dry-run` incluido.

---

## 8. Bloqueos y secuencia de trabajo concreta

**Bloqueos (en orden de dependencia):**

1. **B-1 · H-01** — Reconstruir y confirmar los commits en la rama antes de
   cualquier otra operación. Sin esto no hay reversión ni CI.
2. **B-2 · H-02** — Aislar el destino: añadir alias de staging, exigir
   `--project` en toda documentación y en cualquier script de despliegue.
3. **B-3 · H-04/H-05** — Cerrar abuso del alta pública (límite real de
   bytes parseados, cuota distribuida o plataforma, honeypot/cuota en las
   5 rutas públicas).
4. **B-4 · H-07/H-08/H-09/H-03** — Rediseñar OTP en servidor (generación,
   HMAC/KDF, verificación, invalidación, cierre de acta) y restringir
   `destino` al firmante autorizado; endurecer reglas de `actas`/`actas_otp`.
5. **B-5 · H-14/H-15** — Recuperar la base histórica, rebasar la superficie
   documentada, corregir la condición de `skip` y añadir casos de emulador
   para las reglas nuevas. Ejecutar CI con Java 21 y `fetch-depth: 0`.
6. **B-6 · H-16** — Declarar `indexes` en `firebase.json`, comparar índices
   del staging, publicar **sin** `--force` y verificar 10/10.
7. **B-7 · Externos** — P-05 (dictamen), P-06 (staging), P-04
   (`firebase-admin`), P1.9.1 (lockfile), D4 (IA).

**Secuencia recomendada:**

1. Confirmar el trabajo en 4 commits verificables y comprobar
   `git log`, `git status` y `git ls-remote` (cierra H-01).
2. Crear el proyecto/alias de **staging** y blindar `.firebaserc`
   (cierra H-02). **No desplegar reglas todavía.**
3. Corregir B-3 y B-4 con pruebas unitarias + casos de emulador nuevos;
   repetir `tsc`, `npm test`, `test:integracion`, `build`, `doctor`.
4. Recuperar historial completo, rebasar las guardias y quitar el `skip`
   incondicional; ejecutar `npm run test:integracion` **sin skips**.
5. Ejecutar el workflow con Java 21 y añadir los casos de emulador para
   `solicitudes`, `candidatos`, `audit_logs` y `actas_otp`.
6. En staging: publicar reglas, verificar índices, ejecutar el E2E del §3.3
   y `doctor --url` hasta 8/8 capacidades reales.
7. Con P-05 resuelto, decidir P1.5; con P1.9.1 autorizado, aplicar
   `overrides` y repetir `npm audit` hasta 0 críticas.
8. Solo entonces reevaluar el veredicto de publicación y, si procede,
   abrir PR desde la rama de sesión.

---

## 9. Declaración final

- La auditoría ha sido de **solo lectura**: el único cambio persistente es
  este informe. No se ha hecho push, merge ni despliegue; no se han escrito
  datos en producción; no se han usado secretos reales ni servicios externos;
  no se ha modificado el lockfile.
- Se han encontrado **hallazgos nuevos** no recogidos en el informe
  consolidado: H-01…H-17 y las discrepancias D-01…D-09. Los más graves
  (H-04, H-08) están **demostrados con peticiones HTTP reales**.
- Ninguna prueba no ejecutada se declara superada. El emulador oficial, las
  6 guardias históricas y el E2E de navegador siguen pendientes.
- Las exclusiones permanentes (banca, PSD2, agregadores, importación
  automática, pagos iniciados, pasarelas) **se mantienen sin excepciones** y
  se han verificado en el diff completo.
- **Veredicto: «NO PREPARADO»** para publicar; **validación incompleta**
  como descripción del estado de la evidencia.
