# Auditoría de seguridad · acceso a documentos y Firebase Storage

**Rama:** `arena/01a0c03d-gestor-de-inmuebles-vercel` (Arena C) · **Fecha:** 2026-09-22
**Base auditada:** `487386a` (padre `91bac8e`) · **Alcance:** archivos y documentos asociados a inmuebles, propietarios, contratos, facturas, gastos, incidencias, reparaciones, seguros, inventarios y fotografías, más sus metadatos en Firestore.
**Fuente de verdad empleada:** `storage.rules`, `firestore.rules`, `src/lib/firebase.ts`, `src/lib/morosidadFirestore.ts`, `server.ts`, `src/App.tsx`, componentes del portal de candidatos y `firebase.json`. No se ha importado nada de la canónica A ni de D.

---

## 1. Método y limitaciones (léase antes de interpretar los verdes)

1. **Inventario real de rutas Storage**: se extrajeron del cliente todas las plantillas (`const storagePath = \`…\``), los `ref(storage, …)`, `uploadBytes`, `getDownloadURL` y `deleteObject`, y se cruzaron con los bloques `match` de `storage.rules`.
2. **Evaluación estructural de las reglas**, no de un emulador: en esta base **no existe emulador de Firebase** (`firebase-tools` no es dependencia del proyecto y no hay credenciales de proyecto). Los tests parsean los ficheros `storage.rules` / `firestore.rules` y evalúan las expresiones de autorización que contienen (`true` / `false` / `isSignedIn()` / `internalUser()` / `isMasterAdmin()`). Es una verificación mecánica del **texto que se despliega**; la comprobación con `firebase emulators:exec` queda como paso pendiente para la integración (ver §6).
3. **Lo que sí se ejecuta de verdad** es `src/lib/documentosServidor.ts` (control de acceso del servidor de documentos), con tests unitarios reales.

---

## 2. Rutas Storage auditadas (todas las que usa la aplicación)

| # | Ruta (patrón en `storage.rules`) | Contenido | Antes | Después |
|---|---|---|---|---|
| 1 | `cobros_justificantes/{propietarioId}/{cobroId}/{archivo}` | justificantes de cobro | `read` (get+list) cta. interna; `update` interna | get interno; **list sólo admin**; **update `false`**; create con forma de nombre |
| 2 | `cobros_justificantes/{cobroId}/{archivo}` (heredada) | justificantes antiguos | read/update/delete internos, create `false` | igual + list sólo admin, **sin `update`** |
| 3 | `gastos_facturas/{propietarioId}/{gastoId}/{archivo}` | facturas de gastos | como (1) | como (1) |
| 4 | `documentos_solicitados/{solicitudDocId}/{allFiles=**}` | DNI/contratos/nóminas que aporta el candidato | alta anónima en **cualquier profundidad**; `read` interno (incl. list) | alta anónima **sólo un objeto nuevo, nombre seguro, tipo y 15 MB**; get interno; list admin; **update `false`** |
| 5 | `inmuebles/{inmuebleId}/{allFiles=**}` | **catálogo + todo lo anidado** | **`allow read: if true`** → get **y list** públicos de todo el árbol | **público sólo `get` de la ruta plana** `inmuebles/{id}/{archivo}` (lo que proyecta R3); list interno |
| 6 | `inmuebles/{inmuebleId}/inventario/{inventarioId}/{archivo}` | fotos/adjuntos del inventario | **heredaba el acceso público de (5)** | **árbol privado propio**: get interno, list admin, sin `update` |
| 7 | `recomercializacion_fotos/{…}` | fotos de inspección | read interno, update interno | get interno, list admin, update `false` |
| 8 | `incidencias_fotos/{…}` | fotos de incidencias | idem (7) | idem (7) |
| 9 | `reformas_documentos/{…}` | contratos/planos/presupuestos de reforma | idem (7) | idem (7) |
| 10 | `reformas_fotos/{…}` | fotos de reforma | idem (7) | idem (7) |
| 11 | `incidencias/{incidenciaId}/{archivo}` | adjuntos de incidencia (imagen/vídeo/PDF) | **sin regla** → siempre denegado | **nuevo bloque privado** (interno, 20 MB, tipo imagen/PDF/vídeo) |
| 12 | `presupuestos/{presupuestoId}/{archivo}` | presupuestos | **sin regla** | nuevo bloque privado |
| 13 | `trabajos/{trabajoId}/{archivo}` | documentos de trabajo | **sin regla** | nuevo bloque privado |
| 14 | `profesionales/{profesionalId}/documentos/{archivo}` | documentación del profesional | **sin regla** | nuevo bloque privado |
| — | `/{allPaths=**}` | cualquier otra ruta | `if false` | `if false` (último bloque, verificado por test) |

**Colecciones Firestore revisadas** (metadatos, `downloadURL`, `storagePath`, `base64Data`): `inmuebles`, `contratos_formalizacion`, `gastos`, `gastos_inmuebles`, `facturas`, `facturas_electronicas_b2b`, `liquidaciones_propietarios`, `movimientos_bancarios`, `incidencias`, `trabajos_profesionales`, `presupuestos_profesionales`, `necesidades_reforma`, `proyectos_reforma`, `inventario_inmuebles`, `inventario_historial`, `polizas_seguros`, `siniestros`, `garantias_reparacion`, `expedientes_recomercializacion`, `expedientes_morosidad`, `expedientes_morosidad_hist`, `evidencias_morosidad`, `compromisos_morosidad`, `politicas_morosidad`, `morosidad_resumen_propietario`, `candidatos`, `solicitudes`, `solicitudes_documentacion`, `invitaciones`, `slots_visita`, `enlaces_registro`, `especialidades`, `profesionales`, `inmobiliarias_directorio`, `audit_logs`, `notificaciones`, `system`, `usuarios`, `usuarios_auth`, `propietarios`, `configuracion_aseguradoras`, `solicitudes_seguro_impago`, `series_facturacion`, `envios_verifactu`, `registros_facturacion`, `ordenes_pago`, `ficheros_sepa`, `mandatos_sepa`, `config_liquidacion`, `conciliaciones_bancarias`, `importaciones_bancarias`, `financiaciones`, `prestamos`, `gastos_recurrentes`, `leads_inmobiliario`, `propuestas_inmobiliaria`, `habitaciones_inmueble`.

---

## 3. Hallazgos

| ID | Severidad | Hallazgo | Estado |
|---|---|---|---|
| **F-1** | **Alta** | `allow read: if true` sobre `inmuebles/{inmuebleId}/{allFiles=**}`: además de los objetos del catálogo, era público y **enumerable** **todo** lo anidado bajo ese prefijo, incluidos los adjuntos del **inventario** (`inmuebles/{id}/inventario/{invId}/…`). | **CERRADO**: el `get` público queda limitado a la ruta plana del catálogo; se crea un bloque privado para cualquier subcarpeta; `list` nunca es público. |
| **F-2** | **Alta** | `list` (incluido en `read`) abierto a cualquier cuenta autenticada en los 13 árboles privados → un usuario con sesión podía **enumerar** justificantes, facturas, expedientes y documentos de otros. | **CERRADO**: `list` sólo `isMasterAdmin()`; en el catálogo, interno. |
| **F-3** | **Alta** | `allow update: if internalUser()` en todos los árboles: cualquier cuenta autenticada podía **sustituir los bytes** de un objeto ajeno (adulteración de evidencia, de un justificante de cobro o de un contrato). | **CERRADO**: `update: if false` en todo el bucket. Nadie sube a la misma ruta (todas llevan `Date.now()`/id aleatorio y el SDK usa `uploadBytes`, no resumible), así que no se rompe ningún flujo. |
| **F-4** | Media | `documentos_solicitados/{solicitudDocId}/{allFiles=**}`: la subida anónima del candidato aceptaba **cualquier profundidad** de ruta y cualquier nombre → siembra de archivos y rutas fuera del esquema. | **CERRADO (parcialmente)**: alta anónima limitada a un único objeto nuevo, de nombre `[A-Za-z0-9][A-Za-z0-9._-]{0,511}`, PDF/imagen y ≤15 MB; sigue sin poder leer, listar, modificar ni borrar. |
| **F-5** | Media | `cobros_justificantes/{cobroId}/{archivo}` (ruta heredada congelada) admitía `delete` de cualquier cuenta interna. | **MITIGADO**: se mantiene el borrado interno (es la vía de limpieza de la ruta congelada) y se prohíbe `create`/`update`; el paso a `isMasterAdmin()` queda registrado como **G-7**. |
| **F-6** | Media | **Cuatro rutas del cliente no tenían bloque en `storage.rules`** (`incidencias/`, `presupuestos/`, `trabajos/`, `profesionales/{id}/documentos/`): toda subida caía en la denegación por defecto y el cliente **degradaba a base64 dentro del documento de Firestore** (con el límite de 1 MiB por documento y el archivo ya fuera de todo control de ciclo de vida). | **CERRADO**: cuatro árboles privados nuevos con mínimo privilegio (nunca públicos, nunca listables por no-admin, sin `update`). |
| **S-1** | **Alta** | `server.ts` servía los documentos del portal con el `Content-Type` **facilitado por el cliente** y `Content-Disposition: inline`, desde el **mismo origen** de la aplicación → `text/html` o `image/svg+xml` = XSS de origen (con acceso a la sesión guardada en `localStorage`). | **CERRADO**: allowlist de tipos; lo no visualizable se degrada a `application/octet-stream` + `attachment`; SVG excluido de `inline`. |
| **S-2** | **Alta** | `Cache-Control: public, max-age=86400` sobre documentos privados → cualquier caché intermedia podía conservar un DNI o un contrato. | **CERRADO**: `private, no-store, max-age=0` + `X-Content-Type-Options: nosniff` + `Referrer-Policy: no-referrer`. |
| **S-3** | Media-alta | El `fileId` se generaba con `Date.now()` + `Math.random()` (≈26 bits, reloj conocido) → **enumerable a fuerza bruto**; la lectura no validaba la forma del id. | **CERRADO**: 128 bits de `crypto.randomBytes`, forma `doc_[0-9a-f]{32}` exigida en la lectura. |
| **S-4** | Media | `documentsStore` era un `Map` **sin límite ni caducidad** y la subida era anónima con `express.json({limit:'50mb'})` → agotamiento de memoria del proceso. | **CERRADO**: `AlmacenDocumentosEfimeros` con tope de entradas (250), bytes (96 MB), TTL (12 h), límite por documento (15 MB), LRU y `purgar()`; `400` si el base64 no es válido. |
| **S-5** | Baja | `filename` del cliente se interpolaba en `Content-Disposition` (riesgo de inyección de cabeceras y de rutas). | **CERRADO**: `nombreMostrable()` elimina control/CR/LF/comillas/barra, acota a 120 caracteres y usa `filename*=UTF-8"''`. |
| **F-7** | Baja | El adjunto de inventario se sube con `isImage()`: un PDF de inventario no puede ir a Storage y acaba como data-URL en Firestore. No se amplía el MIME para no cambiar el comportamiento (mínimo privilegio). | **ABIERTO → G-4** |

---

## 4. Matriz de acceso resultante

Leyenda: **P** pública, **I** requiere cuenta autenticada, **A** sólo `isMasterAdmin()`, **–** denegado.
"Cuenta autenticada" = cualquier usuario con sesión (propietario o colaborador): **hoy Storage no distingue roles**, ver G-1/G-2.

| Recurso | Anónimo | Propietario | Profesional / cuenta interna | Admin |
|---|---|---|---|---|
| Ficha pública (`fichas_publicas_inmueble`, R3 en A) | sí, sólo lo proyectado por R3 (`CAMPOS_FICHA_PUBLICA`) | sí | sí | sí |
| Imagen de catálogo `inmuebles/{id}/{archivo}` | **get sí / list no** | sí | sí | sí |
| Inventario `inmuebles/{id}/inventario/…` | **no (antes sí)** | sí | sí | sí (+list) |
| Justificantes de cobro | no | sí (propios) | sí | sí (+list) |
| Facturas / justificantes de gasto | no | sí (propios) | sí | sí (+list) |
| Documentos aportados por candidatos | **sólo subir** (1 objeto, tipo y tamaño) | sí | sí | sí (+list) |
| Fotos de inspección / incidencias | no | sí (propias) | sí | sí (+list) |
| Documentos y fotos de reforma | no | sí (propios) | sí | sí (+list) |
| Adjuntos de incidencia, presupuestos, trabajos, docs de profesional | no | sí | sí | sí (+list) |
| Evidencias de morosidad (metadatos en Firestore; el objeto físico lo aporta R2 en A) | no | según expediente (reglas R2/Bloque C) | según permisos | sí |
| Cualquier otra ruta del bucket | no | no | no | no (catch-all `if false`) |

Público queda **únicamente** lo que la arquitectura ya declaraba público: las imágenes del catálogo en la ruta plana. Todo lo demás es inaccesible sin sesión y, dentro de la sesión, no enumerable.

---

## 5. GAPs documentados y NO implementados (decisión arquitectónica pendiente)

* **G-1 · Aislamiento fino por propietario en Storage.** Sin *custom claims*, `storage.rules` no puede comparar el segmento `{propietarioId}` de la ruta con `request.auth.uid`; la única comprobación posible es "cuenta autenticada". Las rutas mantienen el segmento de propietario para poder endurecerlo sin mover objetos. **No se improvisa un modelo nuevo**: requiere emitir claims (o una regla que lea Firestore, que no existe).
* **G-2 · `inmuebles` legible en claro en Firestore** (`match /inmuebles/{inmuebleId} { allow read: if true; }`). El documento sigue conteniendo `ibanCobro`, `cuentaBancariaCobroId`, `datosFiscales` (NIF, teléfono, correo), `notasInternas`, `referenciaCatastral`, `tokenSolicitud`, inquilino y contrato activos: **la proyección pública de R3 es el arreglo**, y ya está integrada en A (`aeee6f5`) con el backfill preparado en `487386a`. Cambiar la regla en esta rama rompería el portal público y el catálogo, que aún leen `inmuebles`. **Pendiente**: al integrar, pasar `read: if true` → `get/list: if isSignedIn()` **después** de tener las fichas materiales.
* **G-3 · Portales por token con acceso a la colección entera.** `invitaciones`, `slots_visita` y `solicitudes_documentacion` tienen `allow read, create, update: if true`. El precedente correcto ya existe en el propio fichero (`/candidatos/{candidatoId}` separa `get: if true` de `list: if isSignedIn()`), pero los portales públicos **cargan el listado completo** desde `App.tsx`, así que cerrar el `list` rompe el *funnel*. Firestore no permite exigir un filtro por token en una consulta de listado: hace falta rediseñar el portal a lectura por documento (id derivado del token) y añadir validación de campos en `create/update`. **No se toca**: se registra y se propone el cambio en la integración.
* **G-4 · Documentos privados en base64 dentro de Firestore.** Persisten `base64Data`/`documentBase64` en `src/App.tsx`, `src/lib/firebase.ts` (reservas a data-URL cuando Storage falla o expira el guard de 2 s), `src/components/CandidateModal.tsx`, `CrearSolicitudSeguroModal.tsx`, `DetalleSolicitudDocModal.tsx`, `DetalleSolicitudSeguroModal.tsx`, `DocumentUploadModal.tsx`, `DocumentosListSection.tsx`, `PortalDocumentacionPublicaView.tsx`, `modals/DetallePolizaModal.tsx`, `src/lib/gmailClient.ts` y un test de morosidad. La migración (guardar sólo `storagePath` + `downloadURL`, y eliminar la reserva de data-URL en documentos privados) toca R1/R2/R3 y el portal: **fuera de alcance**. Hay **cerrojo de regresión**: si la lista crece, falla `tests/seguridad-storage-documentos.test.ts`.
* **G-5 · Caché offline en `localStorage`.** `rentselect_inmuebles`, `rentselect_contratos`, `rentselect_propietarios` y `rentselect_solicitudes_doc` (además de `candidatos`, `solicitudes`, `invitaciones`, `slots`, `solicitudes_seguro`, `active_session`, `current_user_id`) duplican en el navegador metadatos documentales y, en el caso de `inmuebles`, los campos fiscales. **Ninguna clave guarda evidencias de morosidad, justificantes ni ficheros de Storage** (verificado). La decisión (qué proyección se cachea y con qué caducidad) es de arquitectura del cliente → **documentado, no implementado**, con el mismo cerrojo de no-regresión.
* **G-6 · No duplicar la lista blanca.** Esta auditoría no toca el contrato de R3: `CAMPOS_FICHA_PUBLICA` y `buildFichaPublicaInmueble` siguen siendo la única fuente de lo público, y el backfill `487386a` se queda **igual** (no se ha modificado ni ejecutado).
* **G-7 · Borrado de la ruta heredada de justificantes.** Queda como `internalUser()` para permitir la limpieza de objetos antiguos; cuando se complete la migración al esquema con `{propietarioId}`, pasar a `isMasterAdmin()`.
* **Falta verificación en emulador** (ver §1): desplegar `storage.rules` exige `firebase emulators:exec` con las matrices de arriba como casos de prueba, o una batería manual con tres cuentas (anónima, propietario A, propietario B, admin).

---

## 6. Cambios de este bloque

| Fichero | Cambio |
|---|---|
| `storage.rules` | Reescritura de las 15 secciones: `read` → `get`/`list` explícitos; `list` reservado a administración en los árboles privados; `update: if false` en todo el bucket; acceso público reducido a la imagen de catálogo en ruta plana; nuevo árbol privado para `inmuebles/{id}/{subcarpeta}/**`; cuatro árboles nuevos para las rutas huérfanas; `hasSafeObjectName()` y `withinSize(N)` en toda subida; comentarios con la matriz y los residuales G-1…G-5. |
| `src/lib/documentosServidor.ts` | **Nuevo.** Allowlist de `Content-Type` e inline seguro, decodificación base64 validada y con tope de tamaño, id de 128 bits con forma validada, saneado del nombre de fichero, cabeceras anti-caché y almacén efímero acotado (entradas/bytes/TTL/LRU). |
| `server.ts` | `/api/upload-document` y `/api/documents/:fileId` pasan por el módulo; se elimina el `Map` sin límite, el tipo de contenido del cliente, el id predecible y el `Cache-Control: public`. **El contrato de la respuesta se conserva** (`success`, `fileId`, `url`, `downloadURL`, `storagePath`, `filename`, `mimeType`, `size`): el cliente no cambia. |
| `tests/seguridad-storage-documentos.test.ts` | **Nuevo.** Analizador de reglas + evaluador de permisos, los 15 escenarios del plan, cobertura de las rutas del cliente contra las reglas, cerrojos de deuda (base64, localStorage, colecciones públicas de Firestore) y unitarios del servidor de documentos. |
| `docs/AUDITORIA-SEGURIDAD-STORAGE-DOCUMENTOS-2026-09-22.md` | Este documento (matriz, hallazgos, GAPs, método y verificación pendiente). |

**No se ha tocado**: `firestore.rules`, `src/App.tsx`, `src/lib/firebase.ts`, `src/lib/fichaPublicaInmueble.ts` (inexistente en esta rama), R1 (conciliación), R2 (evidencias de morosidad), R3 (ficha pública), el backfill `487386a`, Bloque B, ni el Dashboard/Analizador de la Arena D. No se ha fusionado ni copiado código de A, B o D.

---

## 7. Verificación ejecutada

* `vitest run tests/seguridad-storage-documentos.test.ts` → ver informe del turno.
* `vitest run` (batería completa), `npm run test:bloque-c`, `npm run test:bloque-b`, `tsc --noEmit`, `npm run build` → ver informe del turno.
* Comprobación de integridad del commit: `git diff --name-status <base> <nuevo>` debe listar exactamente los cinco ficheros de la tabla anterior.
