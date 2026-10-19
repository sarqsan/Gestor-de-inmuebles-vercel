# P3 — Trazabilidad documental: almacenamiento autorizado, integridad y aislamiento

> **Alcance.** P3 = trazabilidad documental (documentos profesionales, adjuntos, actas,
> expediente, integridad, almacenamiento, autorización, aislamiento por cartera y
> recuperación). **No** es el P3 histórico de conciliación bancaria (PR #47); no se ha
> recuperado ni aplicado nada de ese trabajo ni de la rama `recovery/p3-2026-10-18`.

| Dato | Valor |
|---|---|
| Rama de trabajo | `arena/106c60f6-gestor-de-inmuebles-vercel` |
| SHA base verificado | `main` = `90ab16c410b133e70d8b4fef22368232a723b2c9` (árbol limpio al empezar) |
| PR | #50 |

---

## 1. Inspección del estado integrado (Fase 1)

| Pieza | Estado encontrado | Evidencia |
|---|---|---|
| `DetalleProfesionalModal` → `uploadProfesionalDocumentoStorage` | Subía a `profesionales/{id}/documentos/{ts}_{nombre}`; **no existía bloque** en `storage.rules` (R-5) ⇒ denegación por defecto ⇒ el `catch` devolvía una **data-URL** que se guardaba en `profesional.documentos[].downloadUrl` y la UI lo mostraba como «Ver Documento». **Éxito ficticio.** | `src/lib/firebase.ts` (función retirada), `storage.rules` comentario R-5, `docs/BLOQUE-12…CIERRE.md` A-03 |
| Metadatos de documentos profesionales | Array embebido en la ficha (`profesional.documentos`), sin huella, sin estado, editable por cualquier `isStaff()` (incluido cualquier PROFESIONAL). | `firestore.rules` §12 |
| Expediente patrimonial (BLOQUE 6) | Modelo correcto (metadatos `PENDIENTE_STORAGE → DISPONIBLE`, huella SHA-256 en el alta, reglas de Storage atadas al metadato). Carencias: (a) la descarga **no recomputaba la huella**; (b) la pérdida del objeto quedaba **oculta** tras metadatos `DISPONIBLE`; (c) la comprobación previa `getMetadata` sobre un objeto `PENDIENTE_STORAGE` recibe `storage/unauthorized` con las reglas reales (el `get` exige `DISPONIBLE`) y el flujo sólo toleraba `object-not-found` ⇒ **defecto latente** que los dobles ocultaban (identificado por análisis de reglas; no se reprodujo en emulador antes de corregirlo); (d) `getBlob` no existe en Node, lo que impedía certificar en emulador. | `src/lib/expedienteDocumental/gestorFirebase.ts` |
| Actas (BLOQUE D) | Evidencias y PDF en Storage privado por titular, **sin fallback** (correcto). Carencias: sin huella; la referencia `actas_evidencias.storagePath` podía apuntar a cualquier ruta (no se ligaba a su acta). El fallo de Storage del PDF ya se presentaba honestamente (descarga local + aviso de error + auditoría ERROR). | `src/lib/firebaseActas.ts`, `ActasSection.tsx`, `firestore.rules` actas |
| Auditoría | Único libro `audit_logs` vía `registrarAuditoriaFirestore` / `construirAuditoriaExpediente`. Se reutiliza. | `src/lib/expedienteDocumental/auditoria.ts` |
| Infraestructura P2 (#49) | `vitest.emulador.config.ts`, `npm run test:emulador:reglas` (Auth + Firestore + Storage), guardia `validarEntornoP2()`, `fetchSoloEmuladores`, patrón de proceso separado. Se reutiliza sin cambios funcionales. | `tests/emulador/justificantes-cobro*.ts` |

### Inventario de fallbacks que convierten un fallo de Storage en éxito (data-URL/Base64)

| Función | Recorrido | Acción P3 |
|---|---|---|
| `uploadProfesionalDocumentoStorage` | Documentos profesionales | **Retirada**; sustituida por el adaptador documental sin fallback. |
| `uploadPresupuestoDocumentoStorage`, `uploadTrabajoAdjuntoStorage` | Presupuestos/órdenes de trabajo (Operaciones, R-5) | **PENDIENTE** (ver §6). Sin bloque de reglas; suben con IDs temporales antes de existir el documento, por lo que no admiten una regla de ámbito sin rediseñar el flujo. |
| `uploadInventarioAdjuntoStorage`, `uploadReformaAdjuntoStorage`, `uploadIncidenciaAdjuntoStorage`, `uploadInmuebleImageToStorage`, `uploadDocumentoAportadoFile`, `DetallePolizaModal` (subida servidor → Base64) | Fuera del recorrido documental profesional | **PENDIENTE** (inventariado, no modificado para no ampliar el diff a módulos ajenos). |

---

## 2. Cambios (Fases 2–3)

| Área | Archivos | Cambio |
|---|---|---|
| Núcleo documental profesional (puro) | `src/lib/expedienteDocumental/documentosProfesionales.ts` | Tipos, ID determinista `dpr_<sha256>` (profesional + huella + tipo + versión sustituida), validación (reutiliza `validarArchivoDocumento`/`sanearNombreDocumento` del BLOQUE 6), ciclo de vida con `DISPONIBLE → ERROR_STORAGE`, `evaluarIntegridad`, presentación honesta y clasificación de entradas heredadas. |
| Adaptador Firebase | `documentosProfesionalesFirebase.ts` (fábrica con dependencias), `documentosProfesionalesCliente.ts` (enlace con la app) | Subida: metadato `PENDIENTE_STORAGE` → bytes con `customMetadata` (documentoId, profesionalId, sha256) → `DISPONIBLE`. **Fallo de Storage ⇒ `ERROR_STORAGE` + auditoría ERROR + `STORAGE_NO_DISPONIBLE`.** Descarga con `getBytes` + recomputación de huella; pérdida/alteración ⇒ `ERROR_STORAGE`. Sustitución explícita versionada; eliminación con tombstone. Nunca persiste `downloadUrl`. |
| UI profesional | `DetalleProfesionalModal.tsx` | Distingue *seleccionado pendiente de subir*, *almacenado*, *pendiente*, *error*, *no disponible*; descarga/verificación bajo demanda; entradas heredadas data-URL marcadas «sin archivo en Storage» (sin enlace); las http(s) heredadas, «no verificadas». No modifica datos preexistentes. |
| Reglas Firestore | `firestore.rules` | Nuevo `profesionales/{id}/documentos_profesionales/{docId}`: ámbito resuelto en cada acceso (admin, propio profesional, cartera del titular `creadoPorPropietarioId` con L/E), forma cerrada, `actorId == request.auth.uid`, transiciones acotadas, sin delete. La ficha del profesional: el personal no administrativo **no puede reasignar `creadoPorPropietarioId`**. Expediente: `DISPONIBLE → ERROR_STORAGE`. Actas: la evidencia sólo puede referenciar `actas_fotos/{ownerId}/{actaId}/…` de un acta existente del mismo titular e inmueble; ruta y huella inmutables. |
| Reglas Storage | `storage.rules` | Nuevo `profesionales/{id}/documentos/{docId}/{fichero}`: `get` sólo `DISPONIBLE` y en ámbito; `create` sólo con metadato `PENDIENTE_STORAGE` coherente (ruta, nombre, MIME, tamaño, huella, vínculo); sin `list`/`update`; `delete` sólo titular/admin en `PENDIENTE_ELIMINACION`. La ruta plana heredada sigue denegada. |
| Expediente patrimonial | `gestorFirebase.ts`, `gestor.ts`, `DocumentosPatrimonialesPanel.tsx` | Huella verificada al descargar; `verificarDocumentoPatrimonial`; pérdida/alteración ⇒ `ERROR_STORAGE`; `storage/unauthorized` en la comprobación previa ⇒ re-subida idempotente; bytes como `Uint8Array`; auditoría `SUSTITUIDO`. Botón «Verificar integridad» y etiquetas de estado honestas. |
| Actas | `firebaseActas.ts`, `ActasSection.tsx`, `types/actas.ts` | Huella SHA-256 en evidencias (`sha256`) y PDF (`pdfSha256`) + `customMetadata`; `verificarArchivoActaStorage`. |
| CI | `.github/workflows/emulador-reglas.yml` | El resumen del PR lista resultados por archivo (evidencia). |

---

## 3. Matriz de criterios de aceptación

Tipos de prueba: **U** unitaria pura · **D** unitaria con dobles (mocks identificados, no certifica) · **RL** intérprete local de reglas sobre el texto real · **E** emuladores oficiales Auth+Firestore+Storage (CI) · **P** recuperación en otro proceso Node contra los emuladores.

| # | Criterio | Archivos | Prueba | Tipo | Resultado / evidencia | Estado |
|---|---|---|---|---|---|---|
| 1 | Subir documento profesional ficticio | adaptador, reglas | `documentos-p3.emulador.test.ts` › A · «sube un documento…» | E | Metadato `DISPONIBLE`, `actorId` = uid autenticado | **ACEPTADO** |
| 2 | Recuperar bytes desde Storage y comparar huella | adaptador | idem (lectura administrativa REST + `descargar`) | E | `sha256(bytes) == sha256(original)` en ambas vías | **ACEPTADO** |
| 3 | Metadatos ligados a profesional y ámbito | reglas, núcleo | idem (`customMetadata`, documento Firestore) | E, U | `profesionalId`, `storagePath`, `sha256`, `tamanoBytes`, `mimeType` coherentes; sin data-URL/token | **ACEPTADO** |
| 4 | Storage no disponible ⇒ error, nunca éxito | adaptador, UI | A · «con Storage NO disponible…»; B (dobles) | E, D | `STORAGE_NO_DISPONIBLE`; metadato `ERROR_STORAGE/SUBIDA_FALLIDA`; sin objeto; descarga denegada; auditoría ERROR; reintento ⇒ `DISPONIBLE` + `VERIFICADO` | **ACEPTADO** |
| 5 | Sin data-URL como sustituto de almacenamiento | `firebase.ts`, modal | revisión + U/D (`not.toMatch(/data:/)`) | U, D, E | Fallback retirado en el recorrido profesional | **ACEPTADO** (recorrido profesional) |
| 6 | Acceso permitido dentro del ámbito | reglas | B · lectura/escritura; C/D locales | E, RL | Titular, gestor L (lee), gestor E (lee/sube), propio profesional (lee/sube), admin (RL) | **ACEPTADO** |
| 7 | Lectura/descarga denegada fuera de cartera | reglas | B · lectura; RL | E, RL | Otro titular y otro profesional: `permission-denied` / `storage/unauthorized`; también catálogo sin cartera (RL) | **ACEPTADO** |
| 8 | Escritura/sustitución/eliminación fuera de ámbito | reglas | B · «escritura…», «sustitución, eliminación…» | E, RL | Denegado a L, otro titular, otro profesional; sobrescritura del binario `DISPONIBLE` denegada incluso al titular; gestor E no elimina | **ACEPTADO** |
| 9 | Acceso cruzado a otros profesionales e inmuebles | reglas | B; C · expediente (otro titular) | E | Denegado | **ACEPTADO** |
| 10 | Alterar referencias hacia expedientes ajenos | reglas | B · «alterar referencias…»; C · actas | E, RL | Metadato bajo profesional ajeno, cambio de ruta/huella/profesional, actor suplantado, reasignación de cartera por un PROFESIONAL, evidencia de acta con ruta ajena o acta inexistente: denegados | **ACEPTADO** |
| 11 | Expediente: referencias, huella ↔ contenido | `gestorFirebase.ts` | C · expediente | E, D | Alta y descarga con `VERIFICADO` | **ACEPTADO** |
| 12 | Estado ↔ disponibilidad real (pérdida) | `gestorFirebase.ts`, reglas | C · expediente (borrado administrativo del objeto) | E, D | `OBJETO_AUSENTE` y metadato `ERROR_STORAGE`; recuperación re-subiendo el mismo archivo | **ACEPTADO** |
| 13 | Alteración del contenido detectada | adaptadores | C · expediente (sobrescritura administrativa); B (dobles) | E, D | `INTEGRIDAD_DISCREPANTE`, no se entrega, `ERROR_STORAGE` | **ACEPTADO** |
| 14 | Actas: huella y referencia vinculada | `firebaseActas.ts`, reglas | C · actas | E | `sha256` persistido = contenido; `VERIFICADO`; pérdida ⇒ `OBJETO_AUSENTE` | **ACEPTADO** |
| 15 | Trazabilidad de altas, descargas, errores, sustituciones | adaptadores | C · trazabilidad; D (sustitución) | E, D | `audit_logs`: `INCORPORADO:EXITO`, `DESCARGADO:EXITO/ERROR`, `INCIDENCIA:ERROR`; `SUSTITUIDO` (dobles) | **ACEPTADO** |
| 16 | Recuperación con otro proceso | `documentos-p3-recuperacion.proceso.ts` | R · spawnSync | P | PID distinto, sesión nueva: huella y tamaño iguales, `VERIFICADO`; otro titular `permission-denied` | **ACEPTADO** |
| 17 | Recuperación tras **reinicio del emulador / infraestructura** | — | — | — | El emulador no se reinicia entre procesos (sin exportación/importación de datos) | **NO PROBADO** |
| 18 | Fallo cerrado ante destinos productivos | `validarEntornoP2` | entorno · guardia | E | Proyecto o host no demo ⇒ excepción antes de escribir | **ACEPTADO** |
| 19 | Regresión P2 y suites de reglas | — | `npm run test:emulador:reglas` | E | 79/79 (68 previas + 11 P3) | **ACEPTADO** |
| 20 | TypeScript, suite completa, build | — | CI «Tipos, suite completa y build» | — | tsc 0 errores; 254/254 archivos, 4580 correctas, 0 fallidas; build OK | **ACEPTADO** |
| 21 | Eliminar *todos* los fallbacks data-URL del repositorio | ver §1 | — | — | Inventariados; fuera del recorrido profesional | **PENDIENTE** (no bloqueante, fuera de alcance mínimo) |

### Permisos comprobados (documento profesional de un profesional creado por la cartera A)

| Actor | Leer metadato | Descargar | Subir | Marcar pérdida | Eliminar |
|---|---|---|---|---|---|
| Titular A | ✅ E | ✅ E | ✅ E | ✅ E/RL | ✅ RL |
| Gestor cartera A (L) | ✅ RL | ✅ E | ❌ E | ❌ RL | ❌ |
| Gestor cartera A (E) | ✅ RL | ✅ E | ✅ E | ✅ | ❌ E |
| El propio profesional | ✅ RL | ✅ E | ✅ E | ✅ | ❌ RL |
| Titular B | ❌ E | ❌ E | ❌ E | ❌ | ❌ E |
| Otro profesional | ❌ E | ❌ E | ❌ E | ❌ | ❌ |
| Administración | ✅ RL | ✅ RL | ✅ RL | ✅ | ✅ RL |
| Anónimo / sin espejo / bloqueado | ❌ RL | ❌ RL | ❌ RL | ❌ | ❌ RL |

---

## 4. Integridad: alcance de la huella

La huella SHA-256 se calcula en el cliente sobre los bytes exactos que se suben, se ata al
objeto mediante la regla de Storage (`request.resource.metadata.sha256 == metadato.sha256`)
y se **recomputa** al descargar o verificar. Detecta pérdida y alteración del contenido
respecto del alta. **No** es firma digital, ni sello de tiempo cualificado, ni prueba de
autoría o procedencia externa.

## 5. Ejecución local (este entorno)

* `npx tsc --noEmit -p .` → 0 errores. `npm run build` → OK.
* `npx vitest run --exclude tests/guardia-a04-rama-sesion.test.ts` → 254/254 archivos.
* `tests/p3-trazabilidad-documental.test.ts` → 24/24 (U, D, RL).
* `npm run test:integracion` → 299/302: las 3 fallidas (custodia del checkout `f782`) **fallan igual en `main` sin cambios**; `tests/guardia-a04-rama-sesion.test.ts` (guardia de sesión de sandbox) también falla igual en `main` y CI la excluye por diseño.
* Emuladores: no ejecutables aquí (sin Java ni acceso al drop de emuladores). Se ejecutan en CI.

## 6. Límites y pendientes (no ocultos)

1. **Base con nombre**: las reglas de Storage leen Firestore `(default)`; la suite siembra `(default)`. La discrepancia con la base nombrada de `firebase.json` es heredada (ver `storage-ambitos.emulador.test.ts`).
2. **Existencia del objeto no verificable por reglas de Firestore**: el paso a `DISPONIBLE` lo afirma un escritor autorizado; se mitiga con la verificación al descargar/verificar (que lo devuelve a `ERROR_STORAGE`). Un escritor autorizado podría marcar falsamente `ERROR_STORAGE`; queda auditado y la administración puede recuperarlo.
3. **Recuperación tras reinicio** del emulador o de infraestructura real: NO PROBADO.
4. **Fallbacks data-URL fuera del recorrido profesional** (§1): PENDIENTES. `presupuestos/` y `trabajos/` requieren rediseñar el flujo (ID temporal antes de crear el documento) para poder tener reglas de ámbito.
5. **Clave de ámbito del profesional**: `CrearProfesionalModal` guarda `creadoPorPropietarioId = currentUser.id` (ID de usuario) mientras las reglas lo comparan con `propietarioId`. Inconsistencia preexistente: para titulares cuyo `usuarioId ≠ propietarioId`, los profesionales que creen no quedan en su ámbito (ni en Firestore ni, ahora, para sus documentos). No se corrige aquí para no alterar datos ni el módulo de alta.
6. **Enlaces con token (R-4)**: las actas siguen persistiendo `downloadURL` (comportamiento previo); los documentos profesionales ya no.
7. Profesionales de **catálogo** (sin `creadoPorPropietarioId`): sus documentos sólo los leen el propio profesional y la administración.
8. Validación contra el proyecto Firebase **publicado**: no realizada (requiere autorización y entorno de aceptación).
