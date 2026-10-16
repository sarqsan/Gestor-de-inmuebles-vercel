# COMPROBACIÓN INDEPENDIENTE DE `main` FRENTE AL MAPA MAESTRO (16-10-2026)

> **Naturaleza de este documento.** Comprobación de **solo lectura** pedida por el
> responsable: contrastar el estado real de `main` con lo que declara el
> [`MAPA-MAESTRO-ERP-ACTUAL.md`](MAPA-MAESTRO-ERP-ACTUAL.md) y sus dos anexos, y
> extraer la **lista verificada de lo que falta por hacer**. No autoriza cambios,
> no publica reglas, no consume IA ni servicios externos y **no sustituye** al mapa:
> cuando este documento y el mapa discrepen, prevalecen el código y las reglas de
> `main`, después la ejecución identificada por SHA y por último la documentación.
>
> **Fecha:** 2026-10-16 · **Autoría:** sesión Arena `arena/7eef00ef-gestor-de-inmuebles-vercel`.

---

## 0. Objeto, método y límites

**Objeto.** Responder a una única pregunta: *¿qué falta por hacer?* con evidencia
del árbol vigente, no con la memoria de documentos anteriores.

**Método.** (a) identificar el commit real de `main` y su relación con el corte que
declara el mapa; (b) instalar dependencias con `npm ci` (sin cambios de lockfile) y
**ejecutar** tipos, suite completa, build y las suites nativas del repo; (c) releer
en el código los ocho hallazgos A16 del mapa y las afirmaciones de estado que
sostienen los pendientes; (d) consultar GitHub (PR, ramas remotas, CI) para el
estado de custodia.

**Límites honestos (NV).** No se ha verificado —porque no es verificable desde este
sandbox— el estado **desplegado**: reglas realmente publicadas en Firebase, datos
reales, Storage productivo, Vercel, Gemini, correo, bancos, AEAT, portales ni OTP.
Sin Java local no se han ejecutado los **emuladores oficiales** (`npm run
test:emulador:reglas` los ejecuta en CI con Java 21). No se ha modificado código,
reglas, configuración ni datos.

---

## 1. Identidad del corte verificado

| Comprobación | Resultado (16-10-2026) |
|---|---|
| `main` local | `4309f48dc017b32fd5c28e0d3282d772fd2dd237` |
| `origin/main` | `4309f48dc017b32fd5c28e0d3282d772fd2dd237` (idéntico) |
| Commit de `main` | *Merge pull request #38* (`arena/658e62cd` → `main`), 2026-10-16 15:32 +0200 |
| Rama de esta sesión | `arena/7eef00ef-gestor-de-inmuebles-vercel` (base `4309f48`, sin commits propios antes de este documento) |
| Historia | 279 commits alcanzables (clon completo tras `git fetch --unshallow`) |
| Ficheros rastreados | 903 |
| PR integradas | #27 … #38 `MERGED`; PR #38 fusionada hoy 13:32 UTC |
| PR abierta | **#22** (`automation/firestore-rules-deploy`, workflow de despliegue de reglas), abierta desde 2026-10-02 |
| Ramas remotas | 50 puntas (46 `arena/*`, `main`, 2 `recovery/*`, `automation/*`, `revert-25-*`) |
| Reglas | `firestore.rules` 3.867 líneas / 80 `match`; `storage.rules` 657 líneas / 21 `match` |
| Endpoints Express | 20 registros `app.get/post` en `server.ts` |
| `firestore.indexes.json` | 8 índices compuestos (`collectionGroup`) |

**Desfase mapa ↔ `main`.** El mapa declara como «corte vigente» la auditoría sobre
`fd3cae9d` (merge del PR #35) y sus anexos se redactaron sobre ese mismo commit.
Desde entonces `main` ha avanzado **tres integraciones** (60 ficheros, +8.990/−196):

| PR | Contenido | Efecto sobre el mapa |
|---|---|---|
| **#36** | Fase 0: custodia del mapa auditado + anexos; corrección del **fixture** de `tests/roadmap01-seguridad.test.ts` | Cierra el hallazgo A16-06 (fallo de suite) |
| **#37** | Fase 1.1: emulador **oficial de Storage** junto a Firestore/Auth; prueba de la discrepancia `(default)` vs base con nombre | Amplía la evidencia de F1; el bloqueo arquitectónico sigue abierto |
| **#38** | IA Fases 5–8: 12.ª operación de IA, seguimiento de incidencias con avisos por GAP 1, repositorio duradero de notificaciones, gobierno **TODO O NADA** de IA y validación en entorno no productivo | Añade capacidades y pendientes que el cuerpo del mapa aún no recoge del todo |

Únicos cambios en configuración/reglas en ese tramo: `firebase.json` **+3 líneas**
(bloque `emulator.storage`, puerto 9199) y `package.json` (2 scripts IA).
`firestore.rules`, `storage.rules`, `firestore.indexes.json`, `vercel.json` y
`.firebaserc` **no cambian** desde `fd3cae9d`.

---

## 2. Verificación ejecutada en este sandbox (sobre `4309f48`)

| Comprobación | Resultado | Qué NO prueba |
|---|---|---|
| `npm ci` | OK, sin cambios en `package-lock.json` | Nada funcional |
| `npx tsc --noEmit -p .` | **0 errores** (22 s) | No ejecuta la app |
| `npx vitest run` | **228 ficheros · 4.183 correctas · 2 fallidas · 7 todo** (4.192) | No es emulador oficial ni navegador |
| `npm run build` | **OK** (`vite` 17,61 s · `dist/server.cjs` 355,5 kB) | Aviso conocido de chunk > 500 kB (5,32 MB, gzip 1,31 MB) |
| `npm run test:operaciones` (nativo `.mjs`) | **302: 290 OK / 12 fallan** | Fuera del CI consultado |
| `npm run test:patrimonial` (nativo `.mjs`) | **88: 85 OK / 3 fallan** | Fuera del CI consultado |
| `npx tsx scripts/guardia-a04-repositorio.mts` | `A-04: BLOCKED` (ver nota) | Guardia de **custodia de este sandbox**, no de producto |

**Detalle de los dos fallos de Vitest.** Pertenecen a un único fichero,
`tests/guardia-a04-rama-sesion.test.ts`, que comprueba la guardia A-04 del
checkout. En este sandbox la guardia marca dos señales juntas: `HEAD == main` sin
estar en `main` y ausencia de `refs/remotes/origin/<rama-de-sesión>` (la rama aún
no se había publicado al ejecutarla). Es un **artefacto de custodia del sandbox**,
no un defecto de producto: el propio workflow de CI **excluye ese fichero por
diseño** («esa prueba se ejecuta sólo en local»). Una vez publicada la rama de
sesión (`git push origin arena/7eef00ef-…`) la señal desaparece.

**Detalle de los fallos nativos.** `test:operaciones` (12) y `test:patrimonial` (3)
son **aserciones de fuente/custodia ancladas a bases antiguas** (diffs byte a byte
contra commits de la base B y de la superficie patrimonial, dependencias/lockfile,
«bloques 10–12» de reglas). Se conservan como deuda explícita (§4.7): no prueban
una brecha, pero **impiden declarar `npm run test:integracion` en verde** (el script
compuesto se detiene al fallar operaciones). Coinciden exactamente con las cifras
que ya registraba la adenda del mapa.

**CI observado (GitHub).** El único workflow es
`.github/workflows/emulador-reglas.yml`, con dos jobs: `reglas-emulador`
(emuladores oficiales de Auth/Firestore/Storage sobre `demo-gestor-reglas`) y
`verificacion` (`tsc` + suite completa **excluyendo la guardia A-04** + build).
Se dispara con `pull_request`, con `push` **solo** a
`arena/b18a36de-gestor-de-inmuebles-vercel` y con `workflow_dispatch`.
Las ejecuciones más recientes (PR #36, #37 y #38) están todas en **success**.
Consecuencia verificada: **`gh run list --branch main` no devuelve ejecuciones**;
los commits de merge en `main` no tienen verificación propia, solo la de la punta
de la PR integrada (mismo árbol).

---

## 3. Estado de los ocho hallazgos A16 del mapa (releídos en el código de `main`)

| ID | Estado hoy | Evidencia verificada en `4309f48` |
|---|---|---|
| **A16-01** P0 · solicitud pública: **VIGENTE (FC estático)** | Sigue el desajuste: `firestore.rules` §`solicitudes` exige `keys().hasAll(['nombre','email','telefono','inmuebleId','estado'])` (línea 2084) y `PortalSolicitudPublicaView.tsx` construye el documento con `candidatoNombre/candidatoTelefono/candidatoEmail` (~líneas 278-280). El envío es `onCompleteSolicitud(newSolicitud)` **sin `await`** seguido de `setSubmitted(true)` (líneas 326-327) → pantalla «Solicitud enviada correctamente» con error capturado en `saveSolicitudFirestore` (`src/lib/firebase.ts:1414`). |
| **A16-02** P0 · portales por token: **VIGENTE (FC estático)** | No existen rutas de servidor para visitas, cuestionario ni documentación pública: el listado de `server.ts` no contiene `/api/visita`, `/api/cuestionario` ni `/api/documentacion` (solo el *fallback* SPA de `/solicitud/:token` y `/visita/:token`). Los **comentarios de `firestore.rules`** siguen anunciando `/api/visita/:token` (línea 2100) y `/api/cuestionario/:token` (línea 2049) como si estuvieran montadas. El portal de visita sigue resolviendo en cliente vía `bookSlotTransaction` (`PortalVisitaPublicaView.tsx:128` → `src/lib/firebase.ts:1300`). |
| **A16-03** P0/P1 · notificaciones: **VIGENTE (FC estático)** | `server.ts:104-108` sigue llamando `resolverAutorizacion(authHeader, undefined, undefined)`, y `src/notificaciones/autorizacion.ts:41-46` devuelve `{ perfil: null }` sin verificador ni fuente de perfil → el dispatcher responde `no_autorizado`. La Fase IA 6 añadió repositorio **duradero** de notificaciones (`server/notificaciones/repositorioNotificacionesFirestore.ts`) activo solo con credencial de servicio, pero **no** aporta verificador de token: el endpoint sigue sin poder entregar un payload válido tal como está conectado. |
| **A16-04** P1 · ficheros efímeros: **VIGENTE (PA)** | `server.ts:141` `const documentsStore = new AlmacenDocumentosEfimeros();` — almacén en memoria (TTL interno, capacidad limitada) que se pierde al reiniciar la función serverless. |
| **A16-05** P1 · Storage vs base con nombre: **VIGENTE (NV el efecto)** | `storage.rules` contiene **42 ocurrencias** de `databases/(default)` repartidas en 36 líneas y **0** referencias a la base con nombre; el cliente, el backend y `firebase.json` apuntan a la base con nombre. La Fase 1.1 (PR #37) lo demuestra en el emulador con sonda en memoria, **sin** certificar la semántica publicada. |
| **A16-06** P1 · suite global: **CERRADO** | El fixture de `tests/roadmap01-seguridad.test.ts` corregido en PR #36 (Fase 0). Hoy la suite completa **no tiene fallos ajenos a la guardia del sandbox** y `tsc`/build están verdes. |
| **A16-07** P1/P2 · integraciones externas: **VIGENTE (SD/NV)** | SEPA genera ficheros sin orden bancaria; `VerifactuTransportPendiente` devuelve `INDISPONIBLE`; B2B sin SPFE/plataforma privada; sindicación en `PORTAL_NO_CONECTADO`; OTP sin transporte externo; Gmail REST y Catastro sin prueba *live*. |
| **A16-08** P2 · texto ejecutable desfasado: **VIGENTE (SH)** | `src/lib/importExport/ejecucion.ts:12-13` sigue diciendo «Solo GASTO y COBRO con destino CREAR computable producen escrituras», mientras `ESCRIBIBLES` (línea 111) es `{'GASTO','COBRO','INMUEBLE'}` y el código contempla el alta de INMUEBLE con titular resuelto. |

---

## 4. Qué falta por hacer (lista verificada y priorizada)

### 4.1 P0 — F0 · integridad de embudos públicos y notificaciones

Los tres hallazgos P0 siguen abiertos y **bloquean cualquier prueba E2E de captación**:

1. **Solicitud pública (A16-01).** Alinear campos (`nombre/email/telefono` o reglas) y
   **no anunciar éxito sin persistencia** (esperar resultado, mostrar fallo y
   reintento). Afecta al primer paso del embudo comercial.
2. **Portales por token (A16-02).** Decidir la vía autorizada: **rutas de servidor
   con token** (`/api/visita/:token`, `/api/cuestionario/:token`, documentación) o
   rediseño del cliente; hoy ni el cliente ni el servidor pueden leer/escribir
   `invitaciones`, `slots_visita`, `solicitudes_documentacion` ni `candidatos`
   anónimos bajo las reglas del repo. Los comentarios de `firestore.rules`
   describen rutas que **no existen**: corregirlos o implementarlas.
3. **Notificaciones (A16-03).** Inyectar el **verificador real de ID token** y la
   fuente de perfil en `resolverContextoDeRequest` (`server.ts`) para que el
   dispatcher deje de denegar; hoy ninguna notificación operativa puede entregarse
   por esa ruta (`EMAIL` en *safe-mode* puede además devolver `ok` con ID `safe-*`
   sin envío real).

**Puerta de salida (ya definida en el mapa §5 F0, no cumplida):** pruebas oficiales
Firestore + Storage para anónimo y por rol, dobles reservas y escrituras fuera de
alcance denegadas, respuestas API verificadas con credencial de prueba y acuse de
notificación comprobado con proveedor/safe-mode diferenciados.

### 4.2 P1 — F1 · seguridad, datos e infraestructura

4. **Base nombrada vs `(default)` en Storage (A16-05).** Es el **bloqueo
   arquitectónico** de la Fase 1: 42 referencias `(default)` frente a la base con
   nombre. Requiere decisión aprobada (no una sustitución mecánica), arquitectura de
   permisos y recuperación, y prueba en entorno **no productivo** con las mismas
   bases/bucket. La evidencia del emulador (PR #37) **no** certifica la semántica
   publicada.
5. **Publicación de reglas e índices (NV desde aquí).** Las reglas del repo no
   están verificadas como publicadas; la publicación es **manual** por el usuario
   (`firebase deploy --only firestore:rules,storage`), y la PR #22 (workflow de
   despliegue) sigue **abierta sin decisión**. Los 8 índices compuestos de
   `firestore.indexes.json` tampoco constan publicados.
6. **Backfill de `fichas_publicas_inmueble`.** No existe script: solo la prueba
   `tests/backfill-fichas-publicas.test.ts`. Sin él, los inmuebles anteriores a
   GAP-R3 solo materializan su ficha pública al volver a guardarse.
7. **Cobertura oficial pendiente.** Storage oficial se amplió en PR #37, pero
   siguen sin prueba E de: `solicitudes`, `candidatos`, documentos de candidato,
   rutas R-5 (`presupuestos/`, `trabajos/`, `profesionales/{id}/documentos/`, hoy
   **sin bloque** → deny-by-default), y el aislamiento integral por rol/cartera.
8. **CI de `main`.** El workflow no se dispara en `push` a `main`: los merges
   carecen de verificación propia. Valorar añadir `push: branches: [main]` (o exigir
   la ejecución sobre el SHA de merge) para que «CI verde» sea una afirmación sobre
   el commit publicado, no sobre la punta de la PR.

### 4.3 P1/P2 — F2 a F5 · recorridos, integraciones, migración y producto

9. **F2 — recorridos ERP y economía:** trazas UI→Firestore→Storage→informe/ZIP bajo
   4 perfiles con datos sintéticos completos; documento binario descargable tras
   reinicio o fallo explícito (enlaza con A16-04); fiscalidad y centro de inmueble
   coincidentes en un mismo ejercicio.
10. **F3 — integraciones externas e IA (A16-07):** sin proveedor homologado no hay
    desarrollo, solo estado «preparado»: Gmail/SMTP, banco SEPA y `camt.053`,
    AEAT/VeriFactu, B2B (SPFE/plataforma privada/EDIFACT), portales de publicación,
    OTP SMS/email, firma electrónica cualificada, Catastro *live*.
11. **F4 — migración histórica:** fuentes originales íntegras verificadas por SHA,
    backup/restore probados, decisiones B4/O7 explícitas; las 52 filas reconstruidas
    **no** cumplen la puerta. Incluye registro 27 incompleto y discrepancias A/B de
    rentas.
12. **F5 — producto, UX y relevo de ramas:** cerrar o descartar explícitamente los
    candidatos **RA** de §4.8, recorridos reales con navegador/accesibilidad y
    ensayo de backup/recovery.

### 4.4 Bloques grandes del roadmap (§14 del mapa)

| Bloque | Estado verificado |
|---|---|
| 0 · Cierre y custodia | **CERRADO** |
| 6 · Importación/exportación global | **CERRADO** (en `main` desde el PR #6) |
| **1 · Inmueble como centro + seguros (pólizas multi-documento, renovaciones, relación avería↔póliza)** | **PENDIENTE** |
| **2 · Operaciones de alquiler + mantenimiento (Arena C, paralelo al 1)** | **PENDIENTE** |
| **3 · Documentación + fiscalidad + trazabilidad** | **PENDIENTE** |
| **4 · Validación real de infraestructura (Auth/Firestore/Storage/reglas/claims/persistencia)** | **PENDIENTE** — «no declarar terminado por tener solo tests unitarios» |
| **5 · Recuperación histórica / importación** | **PENDIENTE** — «no inventar ni corregir históricamente sin evidencia» |

### 4.5 §16 · auditoría funcional histórica y capacidades estratégicas

13. **§16.1 — AUDITORÍA FUNCIONAL HISTÓRICA: trabajo pendiente y el inventario
    funcional del ERP NO se considera cerrado hasta realizarla.** Debe revisar
    conversaciones, órdenes, Arenas y aplicaciones anteriores con clasificación
    obligatoria (`IMPLEMENTADO_CANONICO` … `DESCARTADO_EXPLICITAMENTE`) y conservar
    procedencia. **Es el único pendiente que puede descubrir funcionalidad perdida.**
14. Capacidades estratégicas, todas **no cubiertas** a este corte:
    `IA_CARTERA_TRANSVERSAL` **PA** (el asistente conecta 3 consultas tipadas),
    `INCIDENCIA_IA_END_TO_END` **PA** (la Fase IA 5-6 cubre inquilino→diagnóstico
    guiado→seguimiento, pero **no** póliza→OT→factura automatizada),
    `ESCANER_FACTURAS_IA` **NV** en el origen / **SD** aquí,
    `FICHA_ECONOMICA_INMUEBLE` **PA** (base real, sin conciliación anual unificada).

### 4.6 IA (Fases 1–8) · estado y pendientes

- **Integrado y verde:** 12 operaciones catalogadas (`src/ia/catalogoOperacionesIA.ts`,
  incluida `ASISTENTE_INCIDENCIAS_INQUILINO`), núcleo con sesión verificada e
  idempotencia, gobierno por perfil con contrato **TODO O NADA** y política por
  defecto que **deniega todo**, seguimiento de incidencias con CAS y avisos por
  GAP 1 con estado real de entrega, CLI de validación no productiva.
- **Consumo de IA BLOQUEADO** (por diseño): sin `IA_POLITICA_JSON` → `503
  APROBACION_COMERCIAL_PENDIENTE`; política mal formada → `503 POLITICA_IA_INVALIDA`.
- **Pendientes accionables declarados (no resueltos):**
  1. **Límites/presupuesto y cuotas de API del proveedor verificados en Google
     Cloud** (peor caso) antes de cualquier autorización de consumo.
  2. **Cableado fino de los modales profesionales** a la sincronización del
     seguimiento (los demás flujos ya sincronizan).
  3. **Reintentos programados** de avisos pendientes (hoy solo en la siguiente
     sincronización).
  4. **Entorno/proyecto no productivo dedicado** para la activación gradual.
  5. **Validación real de Gemini** (F4 del mapa): el procedimiento de 5 casos en
     `docs/F4-PRUEBA-REAL-GEMINI.md` sigue **sin rellenar**.

### 4.7 Deuda técnica y tooling (heredada, sigue abierta)

15. `documentsStore` en memoria (`server.ts:141`) — migrar a Storage como fuente
    única (A16-04).
16. `/api/*` **sin rate-limit** (documentado, no corregido).
17. `package.json` **sin script `test`** (el comando oficial es `npx vitest run`).
18. Chunk de build > 500 kB (5,32 MB) — aviso conocido, no bloqueante.
19. Suites nativas `.mjs` en rojo parcial: **12 fallos** en
    `test:operaciones` y **3** en `test:patrimonial` por aserciones de custodia
    fijadas a bases antiguas; requieren una fase propia para revisar semántica y
    actualizar guardias (no por conveniencia).
20. **D2 (incoherencia de campo `fecha`) parcialmente corregido:** 
    `src/utils/reportingEngine.ts:73` ya usa `fechaDevengo || fechaPago || fecha`,
    pero `src/utils/conciliacion/matchingEngine.ts:254` sigue leyendo `gasto.fecha`
    (campo que el ERP no rellena) → el *matching* de gastos no puntúa fecha.
21. Residuales de Storage R-3 (MIME `application/octet-stream`), R-4 (`downloadURL`
    como capacidad) y R-5 (rutas sin bloque) según `storage.rules`/cierre B12: se
    conservan como están.

### 4.8 Custodia de ramas y PR

22. **PR #22 abierta** (`automation/firestore-rules-deploy`): workflow de
    despliegue de reglas. Decisión pendiente (integrar, rehacer o cerrar). No se ha
    usado para publicar nada.
23. **Rama solicitada `arena/2edd80de-gestor-de-inmuebles-vercel`: NO EXISTE.**
    Verificado hoy: `git ls-remote --heads origin "arena/2edd80de*"` → 0 y API
    GitHub → `404 Branch not found`. Sin SHA/PR/ref accesible no se puede auditar ni
    atribuirle trabajo.
24. **Candidatos RA (no integrados, requieren decisión y pruebas):**
    `1e73995d5e` (bienvenida guiada UX + eliminación de titular secundario),
    `8e63461ef5` (presentación alternativa de N titulares),
    `3a6ee6b057` (`recovery/arena-b-content`: circuito de candidato y documentación
    pública alternativos), `b33867fa86` (test H8 / importación optimizada),
    `b9043e49db` (workflow de despliegue de reglas, = PR #22). Ninguno es ancestro
    de `main` (verificado); su contenido tiene homónimos en `main`, **sin paridad
    demostrada**.

---

## 5. Deriva documental del mapa y sus anexos (a corregir)

| Punto | Lo que dice el documento | Estado real en `4309f48` |
|---|---|---|
| Cabecera del mapa («Identidad del corte») | rama `arena/dea47ba8`, HEAD `fd3cae9d`, 873 ficheros | `main` = `4309f48`, 903 ficheros rastreados (tres PR después) |
| Mapa §1 (arquitectura) | «11 operaciones IA → `server/ia`» | **12** operaciones (12.ª: `ASISTENTE_INCIDENCIAS_INQUILINO`) |
| Mapa §1 (colecciones) | «~45 colecciones» | añadidas `incidencias_seguimiento`, `notificaciones_entregas`, `ia_incidencias_trazas` (acceso solo por servidor, cubiertas por el catch-all) |
| Anexo de inventario | corte `fd3cae9d`, IA-01 «Once rutas de IA», 3 ficheros de emulador | 12 operaciones; `tests/emulador/` con 4 ficheros (incl. `storage-ambitos.emulador.test.ts`) |
| Anexo de ramas | «48 puntas anunciadas» | **50** (faltan `arena/dea47ba8-…` y `arena/658e62cd-…`, ambas ya fusionadas) |
| `docs/IA-FASES-5-8-INFORME-CIERRE.md` | «Estado: ENTREGADO EN RAMA — **NO integrado**» y §3.2 «re-verificación pendiente tras el merge» | **Integrado** por PR #38; `docs/ESTADO-GIT-ERP.md` ya lo registra. El informe quedó sin actualizar |
| Mapa §2 (A16-06) y §0 | «CI global rojo / 1 fallo» | Cerrado por PR #36; suite local sin fallos ajenos a la guardia del sandbox |
| `docs/ESTADO-GIT-ERP.md` | Sección «ESTADO ACTUAL (actualizado 2026-09-21)» con HEAD `5e47fc2` | Es histórico: el bloque superior (PR #38) es el vigente. Conviene marcarlo para evitar lectura cruzada |

*(Ninguna de estas correcciones se ha aplicado aquí: este documento es de comprobación.
Corresponden al mismo commit que la próxima orden autorizada, como exige el mapa.)*

---

## 6. Recomendación de siguiente paso

1. **Ejecutar una orden F0 de código (P0)** limitada a los tres hallazgos abiertos:
   solicitud pública, portales por token y verificador de notificaciones, con la
   puerta de salida ya escrita en el mapa (§5 F0) — sin abrir colecciones privadas
   como atajo.
2. **Antes de F1**, tomar dos decisiones de arquitectura que hoy bloquean el cierre
   de seguridad: (a) base con nombre vs `(default)` en Storage; (b) publicación
   manual de reglas e índices y qué hacer con la PR #22.
3. **En el mismo commit de la próxima orden**, corregir la deriva documental de §5 y
   actualizar la cabecera del mapa al SHA vigente, para que «mapa» y `main` vuelvan
   a ser la misma cosa.
4. **No declarar cerrada** ninguna fase por un test unitario: F1–F5 y los bloques 1–5
   siguen abiertos, y la auditoría funcional histórica (§16.1) sigue pendiente.

---

## 7. Evidencia reproducible (comandos ejecutados)

```bash
git rev-parse HEAD; git ls-remote --heads origin | grep -c .          # 4309f48…, 50 ramas
git log --oneline -8                                                  # cadena hasta PR #38
git diff --stat fd3cae9d HEAD                                         # 60 ficheros, +8990/−196
git diff fd3cae9d HEAD -- firestore.rules storage.rules firestore.indexes.json vercel.json  # vacío
git diff fd3cae9d HEAD -- firebase.json                               # +3 (emulador Storage)
npm ci && npx tsc --noEmit -p . && npm run build                      # OK / 0 errores / OK
npx vitest run                                                        # 228 · 4183 pass · 2 fail · 7 todo
npm run test:operaciones; npm run test:patrimonial                    # 290/302 · 85/88
npx tsx scripts/guardia-a04-repositorio.mts                           # A-04: BLOCKED (custodia del sandbox)
grep -o 'databases/(default)' storage.rules | wc -l                   # 42
grep -c '"collectionGroup"' firestore.indexes.json                    # 8
gh run list --branch main --limit 6                                   # vacío (sin CI en push a main)
gh pr list --state open                                               # #22
git ls-remote --heads origin 'arena/2edd80de*' | wc -l                # 0 (rama inexistente)
```

**Custodia de esta comprobación:** solo se añade este documento. No se modificó
código, reglas, configuración, lockfiles ni datos; no se publicaron reglas ni se
consumió IA, Firebase real, banco, AEAT, portal ni correo.
