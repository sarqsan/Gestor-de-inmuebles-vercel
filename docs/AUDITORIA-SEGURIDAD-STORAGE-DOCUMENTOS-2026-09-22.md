# Auditoría de seguridad · acceso a documentos y Firebase Storage (C-Security)

**Rama canónica:** `arena/01a0bfbe-gestor-de-inmuebles-vercel` (Arena A) · **Fecha:** 2026-09-22
**Base de la integración:** `c4cee78` (Dashboard D publicado) · **Origen auditado:** `520bda7` de la Arena C (`arena/01a0c03d-…`, padre `487386a`)
**Alcance:** `storage.rules`, servidor de documentos de `server.ts` (`/api/upload-document`, `/api/documents/:fileId`), clientes de subida (`src/lib/firebase.ts`, `firebaseActas.ts`, `suministrosFirestore.ts`, `morosidadEvidenciasStorage.ts`, `GestionImagenesModal.tsx`, `ActasSection.tsx`).
**Fuera de alcance (intactos):** `firestore.rules`, `firestore.indexes.json`, motores, módulos Operaciones / Backfill-R3 / Inversión / Dashboard / Tesorería / Liquidaciones / Morosidad, capa §6, cliente de subida.

---

## 1. Método y limitaciones (léase antes de interpretar los verdes)

1. **No hay emulador.** En el entorno de integración no existen `firebase-tools` ni Java y no hay red para instalarlos. Las reglas se evalúan con un **intérprete propio** del subconjunto del lenguaje que usa `storage.rules` (`tests/helpers/evaluadorReglasStorage.ts`): parsea el texto real del fichero (funciones, `allow`, comodines `{x}`/`{x=**}`, operadores lógicos y de comparación, `in`, `is`, `matches`, `size`, `firestore.get`/`exists` con `$(…)`) y decide cada operación con un contexto sintético (auth, documentos Firestore, recurso subido). Reproduce la semántica documentada por Firebase (v2 con `**` = cero o más segmentos; sin cascada; OR de todos los bloques que casan; `read`=get+list, `write`=create+update+delete; error de evaluación ⇒ denegado; `matches` sobre la cadena completa). **No es el motor de Google**: la verificación en emulador/proyecto real queda **PENDIENTE (NV)**. Cualquier construcción no soportada hace fallar el test en lugar de dar un verde falso.
2. **Lo que sí se ejecuta de verdad** es `src/lib/documentosServidor.ts` (servidor de documentos) con tests unitarios reales.
3. **Diferencia con el bloque original de C:** el test de C era textual (regex sobre las condiciones, sin evaluar aislamiento por Firestore). Aquí se sustituye por evaluación semántica de escenarios con ocho actores (anónimo, admin, propietario A, propietario B, profesional, inquilino A, inquilino B, autenticado sin ficha).

---

## 2. Diagnóstico del bloque `520bda7` (antes de integrar)

| Fichero de C | Diagnóstico | Decisión |
|---|---|---|
| `src/lib/documentosServidor.ts` (+287) | Módulo puro (Node `crypto`), sin Firestore/Storage, sin red. Cierra S-1…S-5 del servidor de documentos. | **Integrado byte a byte.** |
| `server.ts` (79 ±) | Sólo toca `/api/upload-document`, `/api/documents/:fileId` y la declaración de `documentsStore`; el resto de consumidores (`/api/analizar-documento`, l.≈1384) usan `documentsStore.get()` que el nuevo almacén conserva. El diff de C se aplica limpio sobre `c4cee78` (los hunks de A —asistente §6— no solapan). Contrato de respuesta al cliente conservado (`fileId`, `url`, `downloadURL`, `storagePath: server_…`, `filename`, `mimeType`, `size`). | **Integrado (hunks idénticos al diff de C, aplicados con 3-way).** |
| `storage.rules` (reescritura) | **C-1** `hasSafeObjectName()` = `^[A-Za-z0-9][A-Za-z0-9._-]{0,511}$` sobre `request.resource.name`, que es la **ruta completa** (`gastos_facturas/P1/G1/x.pdf`): rechaza toda subida anidada real → habría bloqueado todas las subidas del ERP. **C-2** sustituía E.1 `incidencias/{id}/{file=**}` (aislamiento del inquilino vía Firestore) por `{fileName}` interno: el inquilino perdía la subida y ganaba lectura de incidencias ajenas. **C-3** `update:false` global rompía la regeneración del PDF de acta (mismo nombre `Acta_{tipo}_{fecha}_v{version}_{id8}.pdf`). **C-4** partía de `487386a`: no contenía los bloques D (actas), E.1–E.4, R2 (morosidad) ni el bloque R3 de inventario. **C-5** añadía `presupuestos/`, `trabajos/`, `profesionales/…/documentos/`, que en la canónica pertenecen al módulo Operaciones (fuera de esta orden). | **NO copiado.** Reformulado sobre el `storage.rules` de A (§3–§5). |
| `tests/seguridad-storage-documentos.test.ts` (+820) | Textual; exigía `update:false` global, el bloque `{fileName}` de incidencias y bloques de Operaciones; ratchets de deuda (`base64`, `localStorage`, colecciones públicas) ajenos a la orden. | **Sustituido** por tests semánticos (§6). |
| `docs/AUDITORIA-…md` | Describe el `storage.rules` de C (G-1…G-7). | **Sustituido** por este documento. |

Comprobaciones previas en el cliente (repositorio A): ningún uso de `listAll`/`list(`/`updateMetadata`/`getMetadata`/`uploadBytesResumable`/`uploadString`; todas las plantillas de ruta sanean el nombre con `replace(/[^a-zA-Z0-9._-]/g, '_')`; la única ruta determinista re-subible es `actas_pdfs/{owner}/{acta}/Acta_…_v{version}_{id8}.pdf` (`ActasSection.handleGenerarPdf`).

**Hecho relevante de Firebase Storage** (issues firebase-js-sdk #5079 / firebase-tools #4329, confirmadas por el equipo de Firebase): una **re-subida al mismo nombre se evalúa como `create`**, no como `update`; `update` sólo aplica a **cambios de metadatos**. Por tanto `update: if false` **no impide sobrescribir** un objeto: la protección real contra sustitución de bytes es que el nombre sea único por subida (timestamp/aleatorio), como hacen todos los clientes salvo `actas_pdfs`. El documento de C atribuía a `update:false` una garantía (F-3 «nadie sustituye los bytes») que Storage no ofrece; aquí se declara correctamente.

---

## 3. `storage.rules`: cambios ruta por ruta (A → final)

Leyenda: **I** = `internalUser()` (cualquier cuenta autenticada), **M** = `isMasterAdmin()`, **P** = público, **–** = denegado, **E** = condición del bloque E (aislamiento inquilino vía Firestore + `esEvidenciaValida()`), **N** = `hasSafeObjectName()`.

| Ruta | Get A→F | List A→F | Create A→F | Update A→F | Delete A→F | Justificación |
|---|---|---|---|---|---|---|
| `cobros_justificantes/{prop}/{cobro}/{f}` | I→I | I→**M** | I+12MB+pdf/img → **+N** | I→**–** | I→I | Sin `list` no se enumeran justificantes ajenos; nombre `Date.now()_…` único → sin caso de uso de metadatos. |
| `cobros_justificantes/{cobro}/{f}` (legado) | I→I | I→**M** | – | – | I→I | Igual; congelado. |
| `gastos_facturas/{prop}/{gasto}/{f}` | I→I | I→**M** | I+12MB+pdf/img → **+N** | I→**–** | I→I | Ídem. |
| `documentos_solicitados/{sol}/{all=**}` | I→I | I→**M** | **anónimo 15MB pdf/img → –** | I→**–** | I→I | El comodín recursivo ya no admite subida anónima a cualquier profundidad; los objetos existentes siguen legibles/borrables (sin pérdida). |
| `documentos_solicitados/{sol}/{f}` **(nuevo)** | I | M | anónimo 15MB pdf/img **+N** | – | I | Única ruta que construye el portal (`{itemId}_{ts}_{nombre}`). Es una **restricción** respecto a A (subconjunto del comodín anterior), no una ampliación. |
| `inmuebles/{id}/{f}` (catálogo) | P→P | **P→I** | I+15MB+img → **+N** | I→**–** | I→I | Sólo el `get` del objeto es público (ficha R3); listar la carpeta exige sesión. |
| `inmuebles/{id}/inventario/{all=**}` (R3) | I | I | I+15MB+img → **+N** | I | I | Bloque R3 conservado (texto fijado por `tests/ficha-publica-inmueble.test.ts`); sólo se añade la forma del nombre. |
| `recomercializacion_fotos`, `incidencias_fotos`, `reformas_documentos`, `reformas_fotos`, `actas_fotos` | I→I | I→**M** | +**N** | I→**–** | I→I | Nombres únicos por subida. Límites (15/15/20/20/15 MB) y tipos sin cambio. |
| `actas_pdfs/{prop}/{acta}/{f}` | I→I | I→**M** | I+20MB+pdf/img → **+N** | **I→I (conservado)** | I→I | `handleGenerarPdf` re-sube el mismo nombre al regenerar; se conserva `update` para no romper el flujo (y porque no aporta protección: ver §2). |
| `incidencias/{id}/{file=**}` (E.1) | E | E | E → **E+N** | E → **E+N** | staff | Aislamiento del inquilino intacto; **no** se integra el `{fileName}` de C (habría concedido lectura interna de incidencias ajenas al inquilino por OR de bloques solapados). |
| `suministros/{s}/lecturas/{l}/{file=**}` (E.2) | E | E | E → **E+N** | E → **E+N** | staff | Ídem. |
| `contratos/{c}/{file=**}` (E.3), `recibos/…` (E.4) | sin cambio | | | | | Publica sólo el personal; no hay cliente de subida en A. |
| `morosidad_evidencias/{prop}/{exp}/{f}` (R2) | M | M | M+evidencia | – | – | Sin cambio (texto fijado por `tests/morosidad-evidencias-storage.test.ts`). |
| `/{allPaths=**}` | – | – | – | – | – | Último bloque, sin cambio. |

**Permisos ampliados respecto a A: ninguno.** Reducidos: `list` en 11 bloques (I→M), `list` público del catálogo (P→I), `update` en 12 bloques (I→–), `create` anónimo anidado en `documentos_solicitados` (→–), forma del nombre en 16 bloques. Límites de tamaño y tipos: sin cambio. Roles: sin cambio (no se toca `internalUser()`, `isTenant()` ni el email maestro).

---

## 4. `hasSafeObjectName()` (reformulado)

```
function hasSafeObjectName() {
  return request.resource.name.size() <= 1024
    && !request.resource.name.matches('.*//.*')
    && !request.resource.name.matches('.*/[.]{1,2}/.*')
    && request.resource.name.matches('.*/([A-Za-z0-9]|[A-Za-z0-9][A-Za-z0-9._-]{0,253}[A-Za-z0-9_-])');
}
```

Valida el **nombre completo del objeto** (que en Storage incluye la ruta): longitud total ≤ 1024; sin segmentos vacíos (`//`); sin segmentos `.`/`..` intermedios; y el **último segmento** (fichero) de 1–255 caracteres, alfanumérico inicial, sólo `[A-Za-z0-9._-]`, sin terminar en `.` (con lo que `.`, `..`, `.oculto` y `nombre.` quedan fuera). No se exige extensión: el tipo lo gobierna `contentType`. La jerarquía la fija cada `match` (`{fileName}` = un segmento; `{file=**}` = subárbol E). Se aplica a toda subida cuyo cliente sanea el nombre (todos los del repositorio); en E.1/E.2 y morosidad no se altera `esEvidenciaValida()`.

---

## 5. Residuales declarados en el propio fichero (no resueltos en esta orden)

* **R-1** `internalUser()` == cualquier cuenta autenticada, incluido el perfil INQUILINO: puede hacer `get` (no `list`) de los árboles internos por nombre exacto. Excluirlo exige `firestore.get` en cada operación interna o custom claims → decisión pendiente.
* **R-2** Sin custom claims no hay aislamiento por `{propietarioId}` en Storage: un propietario B con sesión puede leer un objeto de A si conoce el nombre exacto (no puede enumerarlo). El aislamiento fino vive en Firestore.
* **R-3** `isPdfOrImage()` acepta `application/octet-stream` (clientes que suben blobs sin tipo).
* **R-4** Las `downloadURL` con token son enlaces de capacidad ajenos a las reglas.
* **R-5** `presupuestos/`, `trabajos/`, `profesionales/{id}/documentos/` existen en el cliente sin bloque → denegación por defecto y degradación a data-URL. Pertenece al módulo Operaciones; no se toca sin orden.
* **R-6** `update:false` no impide la sobrescritura por re-subida (ver §2); la protección efectiva es el nombre único por subida.
* **NV** Verificación en emulador / proyecto real pendiente.

---

## 6. Tests (`tests/seguridad-storage-documentos.test.ts`, 38 casos, semánticos)

A `hasSafeObjectName` (16 nombres reales de cliente aceptados; 15 hostiles rechazados: anidación, `//`, vacío, `.`/`..`, oculto, punto final, espacio, control, LF, unicode, `\`, `%2e`, >255, >1024; límite exacto 255/256; `..` en subárboles) · B aislamiento (anónimo, enumeración M-only, R-1/R-2 declarados, morosidad, prefijos no declarados) · C incidencias E.1 (un solo bloque; inquilino A/B; incidencia sin contrato/inexistente; tipo/tamaño; profundidad; E.2) · D actas (PDF determinista, `update` conservado sólo en `actas_pdfs`) · E matriz `update`/`delete` por bloque (13 deniegan / 6 conceden, lista cerrada) · F portal anónimo, catálogo, inventario · G estructura + `server.ts` · H `documentosServidor.ts` real (S-1…S-5, almacén acotado).

Contraste ejecutado con el mismo intérprete sobre los tres ficheros (A / C / final): C denegaba la subida legítima de gastos y de PDF de acta, la evidencia propia del inquilino y la creación de evidencias de morosidad por el master, y permitía al inquilino leer evidencias ajenas; el final conserva todo lo legítimo de A y cierra anidación anónima, `list` interno y trayectos.
