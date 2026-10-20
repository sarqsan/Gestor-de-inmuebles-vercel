# ORDEN 1 · Auditoría y corrección de custodia documental (AG-03 + AG-04)

**Fecha:** 2026-10-20 · **Repositorio:** `sarqsan/Gestor-de-inmuebles-vercel` · **Rama de trabajo:** `arena/8ed3381d-gestor-de-inmuebles-vercel`
**Base verificada:** `main` = `origin/main` = `cd58c9e7feec591c16cef9be42a0fcbcea3af21d` · **Sin merge a `main`** (no autorizado).
**Antecedente:** `docs/AUDITORIA-GLOBAL-ERP-2026-10-20.md` (hallazgos AG-03 y AG-04).

> Leyenda de evidencia: **H** = hecho reproducible en el repositorio (código/tests ejecutados) · **C** = riesgo derivado de configuración (reproducible la configuración, no el efecto) · **V** = sólo confirmable en el proyecto Firebase real (pendiente de verificación autorizada; **no se simula**).

---

## 1. Mapa real de Arenas, ramas y árbol

| Elemento | Valor | Evidencia |
|---|---|---|
| Sesión / Arena | `8ed3381d` — rama `arena/8ed3381d-gestor-de-inmuebles-vercel` (única rama de esta sesión) | `git branch --show-current` |
| Base de la rama | `cd58c9e7feec591c16cef9be42a0fcbcea3af21d` (= `main` = `origin/main` tras `git fetch origin` al inicio de la orden) | `git rev-parse HEAD main origin/main` |
| Estado del árbol al empezar | Limpio salvo `docs/AUDITORIA-GLOBAL-ERP-2026-10-20.md` (entregable de la orden anterior, sin commitear) | `git status` |
| Remoto de la rama | `origin/arena/8ed3381d-…` **ausente** (la rama vive sólo en el sandbox hasta que se autorice un push) | `git branch -a` |
| Ramas históricas citadas en docs (`arena/01a0bfbe…`, `arena/01a0c03d…`, `arena/01a0e939…`) | **No existen** en este clon ni en `origin` (sólo `main`); su contenido ya está integrado en `main` o es histórico no verificable aquí | `git branch -a`, `git ls-remote` no ejecutado (sin necesidad) |
| Resultado final | Un commit sobre la base en la rama de la sesión (SHA en §6); `main` intacto | `git log --oneline -2` |

---

## 2. Diagnóstico (Fase A)

### 2.1 Base de datos realmente usada

| Pieza | Base Firestore | Fichero:línea |
|---|---|---|
| Cliente (SDK web) | **Con nombre** `ai-studio-gestordeinmueble-c6444afd-24ca-4983-b195-ceb2c5ebdc51` — `getFirestore(app, firestoreDbId)` | `firebase-applet-config.json:6`; `src/lib/firebase.ts:139-142` |
| Servidor (REST con cuenta de servicio) | La **misma** base con nombre (lee `firestoreDatabaseId` del mismo JSON; exige `FIRESTORE_DATABASE_ID` coherente si está definido) | `server/titularidades/configuracionFirebase.ts:34-48`; `server/titularidades/googleBackend.ts:497-501` |
| Despliegue de `firestore.rules` | Sólo a esa base con nombre | `firebase.json:2-7` |
| `storage.rules` | **Todas** sus 40+ consultas `firestore.get/exists` apuntan a `/databases/(default)/documents/…` | `storage.rules:71-82, 108, 117, 162, 187, 231, 291-294` |
| Lo que Storage puede leer | Según la documentación oficial de Firebase (Storage Security Rules → Cloud Firestore data): *«Storage Security Rules can only access documents from the default Cloud Firestore database when multiple databases are active»*. Las bases con nombre no son direccionables desde `storage.rules`. | Documentación Firebase (ver §2.3) |

### 2.2 AG-03 · ámbito de Storage resuelto contra una base que la aplicación no usa

- **H** El espejo de identidad (`usuarios_auth/{uid}`), la ficha `usuarios/{uid}`, `inmuebles`, `contratos_formalizacion`, `gestiones_cartera`, etc., se escriben **sólo** en la base con nombre (cliente y servidor). `storage.rules` los busca en `(default)`.
- **H** Con el texto real de las reglas (harness `tests/harness/storageRulesEval.ts`), si la base que lee Storage no contiene el espejo, el **titular legítimo y el gestor de cartera E quedan denegados** en `gastos_facturas/{pid}/…`, `cobros_justificantes/{pid}/…` e `inmuebles/{id}/documentos_patrimoniales/…`, y el **master por correo pasa igualmente** (por eso el fallo es invisible desde la cuenta maestra). Prueba: `tests/custodia-topologia-firestore-storage.test.ts` §4 (4a control positivo, 4b denegación, 4c master, 4d patrimoniales, 4e `sin_asignar`).
- **C** La discrepancia de configuración es un hecho del repositorio; **V** si la base `(default)` del proyecto real existe y qué contiene (una réplica accidental del espejo cambiaría el efecto). No se puede afirmar desde aquí que en producción «todo el mundo está denegado»: sólo que la configuración lo hace inevitable salvo que `(default)` tenga los datos.
- **Qué no se ha hecho y por qué:** **no se ha modificado `storage.rules`.** Apuntarlas a la base con nombre no es posible (limitación de plataforma) y cualquier otra solución es una decisión arquitectónica con verificación real:
  1. replicar un espejo mínimo (`usuarios_auth`, `usuarios`, `inmuebles`, `contratos_formalizacion`, `gestiones_cartera`, metadatos patrimoniales) en `(default)` y mantenerlo sincronizado;
  2. migrar la aplicación completa a `(default)`;
  3. sacar las operaciones de Storage del cliente y hacerlas por servidor con cuenta de servicio (como el adaptador GCS de P2), sin `firestore.get` en reglas.
  Ninguna de las tres cabe en «correcciones acotadas» ni puede aceptarse sin la prueba V-1 en el proyecto real.
- **Lo que sí se ha hecho (acotado):** la aplicación deja constancia de la discrepancia, sin red: `custodiaStorageDependeDeBaseDistinta()` / `avisoTopologiaCustodia()` en `src/lib/entornoFirebase.ts`, visibles en Configuración (`data-testid="base-datos-firebase-activa"`, `data-testid="aviso-topologia-custodia"`), y los tests que fijan la topología (§4).

### 2.3 Fuentes consultadas para AG-03

- Firebase · *Use conditions in Cloud Storage Security Rules* → «Cloud Firestore data»: advertencia textual de que las reglas de Storage sólo acceden a la base por defecto cuando hay varias; `firestore.get/exists` exigen rutas completas `/databases/(default)/documents/...`.
- Firebase · referencia `firestore.get` / `firestore.exists` de Storage rules y anuncio de *cross-service security rules* (2022): la ruta debe incluir el nombre de la base, que en los ejemplos es siempre `(default)`.
- Hilos públicos (StackOverflow 2025, r/Firebase 2024 con respuesta de soporte de Firebase): bases con nombre no soportadas en Storage rules.

### 2.4 AG-04 · almacén efímero y respaldos con éxito aparente

Flujo anterior (**H**, código en `cd58c9e7`):

| Flujo | Ruta anterior | Fallo observable |
|---|---|---|
| Factura de gasto (`uploadFacturaGasto`, `src/lib/firebase.ts:2623-2679`) | Storage con carrera de **8 s** → si pierde o deniega, `POST /api/upload-document` (RAM, sin autenticación) → devuelve `{ url: /api/documents/{id}, storagePath: 'server_{id}' }` → se guarda en `gastos.justificanteUrl/Path` | La función de Vercel recicla → `GET /api/documents/{id}` 404 → binario perdido con «Gasto registrado correctamente» |
| Justificante de cobro (`uploadJustificanteCobro`, `:3107-3176`) | Igual que facturas | Igual; además el aviso de fallo salía como **éxito** (`CobrosSection.tsx:275`, `tipo: 'exito'`) y su mensaje contenía «Firebase Storage» (filtrado por UX-3) |
| Documento aportado por el candidato (`uploadDocumentoAportadoFile`, `:2836-2924`) | **Servidor primero**, luego Storage con carrera de **2,5 s**, y si todo falla **data-URL** con `storagePath: 'local_{itemId}'` → siempre «éxito» | Pérdida silenciosa (`server_`) o solicitud inflada con base64 (`local_`) |
| Adjunto de póliza (`DetallePolizaModal.tsx:120-200`) | Servidor primero; si falla, data-URL inline en `polizas_seguros`; errores sólo en `console.error` | Referencia `server_*` huérfana; fallos invisibles |
| Servidor (`server.ts:170-256`, `src/lib/documentosServidor.ts`) | Almacén en RAM 250 entradas / 96 MB / 12 h, sin autenticación, `express.json` 50 MB | Superficie de subida anónima y falsa durabilidad |
| Consumidores internos del almacén | `/api/analizar-documento` (`server.ts:312-333`) y `resolverImagenFoto` (`:1555`) resolvían `/api/documents/{id}` desde la RAM | Tras el reciclado, 400 «No se proporcionó el contenido» |

Hechos que acotan el riesgo (**H**): `deleteFacturaGastoStorage`, `deleteJustificanteCobro` y `firebaseActas.ts:352` ya ignoraban `server_`/`local_` (no hay borrado accidental); `sanitizeDocForFirestore` (`firebase.ts:1174-1195`) eliminaba `base64Data` cuando la URL era `/api/...` (el registro quedaba pequeño pero sin binario).

### 2.5 Tests existentes que fijaban el comportamiento erróneo (ajustados)

| Test | Qué pinaba | Ajuste |
|---|---|---|
| `tests/ia-fase1-arranque-seguro.test.ts:67-92` | subida+descarga en RAM «sin Firebase» como comportamiento correcto | Ahora exige **410 `ALMACEN_TEMPORAL_RETIRADO`** en ambas rutas y que no se fabrique `url`/`storagePath` |
| `tests/firebase-configuracion-estricta.test.ts:223-226` | lo mismo dentro de la matriz de configuración | Ídem (410 en toda configuración) |
| `tests/seguridad-storage-documentos.test.ts` G.3 y H | `server.ts` «usa el módulo» y ejecución del almacén (S-1…S-5) | G.3 comprueba la retirada; H eliminado con el módulo; secciones A–F (reglas) intactas |
| `tests/ia-fase1-integracion-server.test.ts:516` | compilaba `documentosServidor.ts` como fichero de servidor | Entrada eliminada |

---

## 3. Cambios realizados (Fase B) y justificación

Principio aplicado: **una subida sólo es correcta cuando el objeto está en Firebase Storage y se ha obtenido su URL**; en cualquier otro caso, error explícito en lenguaje de la persona usuaria. Sin ampliar permisos, sin tocar reglas, sin migraciones de datos.

| # | Fichero | Cambio | Por qué |
|---|---|---|---|
| 1 | `src/lib/custodiaDocumental/subidaDirecta.ts` (nuevo) | Núcleo fail-closed: `subirBinarioDuradero` (subida **reanudable** con plazo de 90 s que **cancela** la tarea), `ErrorCustodiaDocumento` con códigos `SIN_TITULAR / SIN_PERMISO / NO_AUTENTICADO / TIEMPO_AGOTADO / TIPO_O_TAMANO / RED / CANCELADO / DESCONOCIDO`, mensajes que pasan el filtro UX-3, `exigirTitular`, validación previa con los límites reales de cada prefijo de `storage.rules`, `esReferenciaSinCustodia`. Motor SDK inyectable (tests sin red). | Un único lugar auditado para las tres subidas legadas; la cancelación evita objetos subidos a destiempo sin referencia. |
| 2 | `src/lib/firebase.ts` · `uploadFacturaGasto` (:2641), `uploadDocumentoAportadoFile` (:2827), `uploadJustificanteCobro` (:3037) | Sólo Storage; **sin** `fetch('/api/upload-document')`, **sin** `server_*`, **sin** `local_*`, **sin** `base64Data`; `SIN_TITULAR` inmediato cuando no hay `propietarioId` (la regla deniega siempre `sin_asignar`); rutas y nombres idénticos a los anteriores. `delete*` usan `esReferenciaSinCustodia` para las referencias heredadas. | Elimina el falso éxito en origen. |
| 3 | `server.ts:155-212` | Retirados el almacén (`AlmacenDocumentosEfimeros`) y ambos manejadores; las rutas `POST /api/upload-document` y `GET /api/documents/:fileId` responden **`410 { codigo: 'ALMACEN_TEMPORAL_RETIRADO' }`** con `Cache-Control: no-store`. `/api/analizar-documento` responde 410 ante referencias `/api/documents/` y, para documentos custodiados, descarga **sólo** desde `firebasestorage.googleapis.com` / `storage.googleapis.com` (https, tope 15 MB; `esUrlDescargaStorageFirebase`). `resolverImagenFoto` devuelve `null` para referencias retiradas. | Cierra la superficie anónima de 50 MB y la falsa durabilidad; los consumidores internos quedan resueltos sin convertir el servidor en proxy genérico. |
| 4 | `src/lib/documentosServidor.ts` | **Eliminado** (sin consumidores). | Sin código muerto que pueda reactivarse. |
| 5 | `src/components/modals/GastoModal.tsx` | Si la factura no se custodia: error `FacturaNoCustodiada`, aviso **«El gasto se ha guardado, pero la factura NO se ha podido custodiar.»** + motivo + cómo reintentar; el modal sigue abierto y un reintento **reutiliza el mismo gasto** (`gastoPersistidoRef`, nunca duplica). | El aviso anterior («No se ha podido guardar el gasto») era falso. |
| 6 | `src/feedback/operaciones.ts` (+ `src/utils/mutacionFirestore.ts`) | `mensajeError` admite `string \| (fallo) => string` (compatible hacia atrás). | Necesario para que el aviso distinga fallo parcial de total sin duplicar avisos. |
| 7 | `src/components/sections/CobrosSection.tsx:275-283` | Aviso de **error** (antes `tipo: 'exito'`) con motivo + «El pago no se ha guardado.» | Falso éxito en la interfaz. |
| 8 | `src/components/PortalDocumentacionPublicaView.tsx` | Sin `base64Data`; límite de 15 MB (paridad con la regla `< 15 MB`; antes 25 MB); mensaje de error real vía `mensajeDeErrorUsuario`. | Coherencia con la regla y error explícito. |
| 9 | `src/components/modals/DetallePolizaModal.tsx` + `src/lib/custodiaDocumental/adjuntoInlinePoliza.ts` (nuevo) | Sin servidor; el adjunto se guarda en la ficha (data-URL, vía preexistente) **sólo si cabe** (tipo PDF/imagen, ≤ 600 KB y espacio restante del documento Firestore de 1 MiB con margen); guardado con `ejecutarOperacion` (`origenesDatos: ['polizas']`) y error **visible** (`data-testid="poliza-error-documento"`). La extracción IA sobre una referencia `/api/documents/` informa en vez de simular. | Para pólizas no existe prefijo de Storage: la ficha es la custodia; antes fallaba en silencio. |
| 10 | `src/lib/entornoFirebase.ts`, `ConfiguracionSection.tsx` | Diagnóstico AG-03 sin red (`BASE_DATOS_ACCESIBLE_DESDE_STORAGE_RULES`, `custodiaStorageDependeDeBaseDistinta`, `avisoTopologiaCustodia`) y su presentación en Configuración. | Hace visible la discrepancia que hay que resolver con autorización. |
| 11 | `docs/MAPA-MAESTRO-ERP-ACTUAL.md`, `docs/AUDITORIA-SEGURIDAD-STORAGE-DOCUMENTOS-2026-09-22.md` | Notas de retirada del almacén (sin reescribir historia). | Documentación coherente con el código. |

**Intactos (fuera de alcance):** `storage.rules`, `firestore.rules`, `firebase.json`, `.firebaserc`, `firebase-applet-config.json`, datos; `uploadReformaAdjuntoStorage`, `uploadInmuebleImageToStorage`, actas, suministros, morosidad, P2/P3/P5 (AG-19 y otros hallazgos no se tocan); AG-01/AG-02 (persistencia de la solicitud pública tras la subida sigue siendo su ámbito).

---

## 4. Pruebas ejecutadas (Fase C) y resultados exactos

| Prueba | Resultado | Qué demuestra / límite |
|---|---|---|
| `npx tsc --noEmit -p tsconfig.json` | **0 errores** | Tipado completo (incluye tests). |
| `npx vitest run tests/custodia-documental-fail-closed.test.ts` | **21/21** | A: núcleo (éxito sólo con URL; `SIN_PERMISO`/`NO_AUTENTICADO`/`RED`; plazo → **cancelación** + `TIEMPO_AGOTADO`; validación previa; `SIN_TITULAR`; mensajes UX-3). B: los tres `upload*` reales con dobles del SDK: sin `fetch`, sin `server_`/`local_`/base64, denegación → error explícito. C: adjunto de póliza. D: invariantes de código (ningún cliente usa el almacén; módulo eliminado; aviso de cobros es error). **Dobles**, no Firebase real. |
| `npx vitest run tests/custodia-topologia-firestore-storage.test.ts` | **12/12** | Topología real (config + código), `storage.rules` sólo `(default)`, diagnóstico de la app, y **mecanismo AG-03** con el texto real de las reglas en el harness (titular/gestor denegados sin espejo visible, permitidos con él; master siempre; patrimoniales; `sin_asignar`). **Harness propio**, no el motor de Google. |
| `src/components/modals/GastoModal.test.tsx` | **7/7** (1 nuevo) | Fallo de custodia de la factura → gasto guardado, aviso veraz, modal abierto, **reintento sin duplicar** el gasto. |
| `src/feedback/operaciones.test.tsx` | **9/9** (1 nuevo) | `mensajeError` función: fallo parcial vs total. |
| `tests/ia-fase1-arranque-seguro.test.ts` (18) · `tests/firebase-configuracion-estricta.test.ts` (47) · `tests/seguridad-storage-documentos.test.ts` (37) | **102/102** | Servidor real arrancado: ambas rutas **410**; `esUrlDescargaStorageFirebase` rechaza hosts ajenos, http y metadata interna; reglas A–F intactas. |
| `npx vitest run` (suite completa) | Ver §4.1 | — |
| `npm run build` | **OK** (`vite build` + `esbuild server.ts`) | El servidor compila sin el módulo retirado. |
| `npm run test:emulador:reglas` | **No ejecutable aquí** (sin Java/emulador; instalación no autorizada) | Pendiente en CI (workflow con emulador) — **V**. |
| Verificación en el proyecto Firebase real (cuenta no master sube/lee `gastos_facturas/{pid}/…`, estado de `(default)`) | **No realizada** (requiere credenciales y autorización) | **V-1** del informe global. |

### 4.1 Suite completa (ejecución final sobre el commit `24e271f`)

| Ejecución | Resultado exacto |
|---|---|
| Línea base (`cd58c9e7`, auditoría global) | 262 ficheros · **4698 pasan · 0 fallan · 7 todo** (4705) |
| `npx tsc --noEmit -p tsconfig.json` | **0 errores** |
| `npx vitest run` sobre `24e271f` (árbol limpio, rama aún **sin** `origin/<rama>`) | 265 ficheros · **4730 pasan · 2 fallan · 7 todo** (4739). Los 2 fallos son `tests/guardia-a04-rama-sesion.test.ts` (espera `A-04: OK`): la guardia de repositorio devolvía `WARNING origin-ausente` porque la rama no existía todavía en `origin`. **Causa ambiental, no de código.** |
| `npx vitest run tests/guardia-a04-rama-sesion.test.ts` tras publicar la rama en `origin` (`git push -u origin arena/8ed3381d-…`) | **4/4** · `scripts/guardia-a04-repositorio.mts` ⇒ `A-04: OK` |
| Total efectivo | **4732 pasan · 0 fallan · 7 todo** (4739) = línea base + 34 tests nuevos/ajustados |
| `npm run build` | **OK** |

Durante el desarrollo, una ejecución intermedia mostró dos clases de fallos **ajenos al cambio funcional** que se corrigieron antes del commit: (a) dobles parciales de `firebase/storage` de otras suites que no conocían `uploadBytesResumable` → el motor SDK se resuelve de forma perezosa en `subidaDirecta.ts`; (b) `tests/fase14-espejo-identidad.test.ts` D.6 detectó el literal del espejo en un comentario nuevo → reformulado. Ningún test existente se ha relajado para obtener verde.

---

## 5. Riesgos abiertos y aceptación que exige verificación autorizada

| Riesgo | Estado | Qué hace falta |
|---|---|---|
| **AG-03** — denegación de Storage a todo usuario no master por la base `(default)` | **ABIERTO** (no corregible desde el código sin decisión arquitectónica) | Decidir entre (1) espejo mínimo en `(default)`, (2) migración a `(default)`, (3) Storage por servidor con cuenta de servicio; después **V-1**: prueba con cuenta no master en el proyecto real (subida y lectura en `gastos_facturas/{pid}/…`, `cobros_justificantes/{pid}/…`, `inmuebles/{id}/documentos_patrimoniales/…`) y revisión en consola de si `(default)` existe/qué contiene. Hasta entonces, con esta orden el efecto es **fail-closed visible** (`SIN_PERMISO`) en lugar de pérdida silenciosa. |
| **AG-04** — falso éxito y pérdida por almacén efímero | **CERRADO en código** (servidor 410; clientes fail-closed; tests) | Aceptación funcional en preview/producción: subir una factura con una cuenta de propietario y comprobar `justificantePath` real; comprobar que un fallo muestra el aviso y no cierra el modal. |
| Referencias heredadas `server_*` en `gastos`, `cobros`, `polizas_seguros`, `solicitudes_documentacion` | **Datos históricos sin binario** (no recuperables: estaban en RAM) | Inventario autorizado (consulta de sólo lectura por `justificantePath`/`storagePath` que empiece por `server_`) y aviso a las personas usuarias para readjuntar. No se ha ejecutado ninguna consulta ni migración. |
| Pólizas: custodia inline en Firestore (1 MiB por ficha) | **Limitación preexistente** ahora explícita (rechazo con motivo) | Decisión futura (fuera de alcance): prefijo de Storage para pólizas o P3. |
| Portal público: tras la subida, `saveSolicitudDocFirestore` sigue tragando errores | **Fuera de alcance** (AG-01/AG-02) | Su corrección debe garantizar que la solicitud referencie el objeto ya custodiado. |
| `express.json` 50 MB | Se mantiene (lo usan `/api/analizar-documento` y otros con base64 inline) | Higiene posterior (AG-11/12). |
| Reglas en emulador oficial | **V** (CI) | Ejecutar `test:emulador:reglas` en el workflow con Java. |

**El bloque NO se declara cerrado**: AG-04 queda corregido en código y probado con dobles; AG-03 permanece abierto por decisión pendiente y verificación real.

---

## 6. Estado final de la rama

| Elemento | Valor |
|---|---|
| Rama | `arena/8ed3381d-gestor-de-inmuebles-vercel` (local y `origin`, misma punta) |
| Base | `cd58c9e7feec591c16cef9be42a0fcbcea3af21d` (`main` = `origin/main`, **intactos**) |
| Commits sobre la base | `b61aa2a` docs(auditoría): auditoría global 2026-10-20 · `24e271f` fix(custodia documental): AG-04 fail-closed + diagnóstico AG-03 · (+ este documento actualizado con los resultados finales en el commit siguiente) |
| Árbol | limpio tras cada commit |
| PR / merge | **ninguno** (no autorizado) |
| Guardia A-04 del repositorio | `A-04: OK` tras la publicación de la rama |

**Veredicto:** AG-04 corregido en código y cubierto por tests (pendiente de aceptación funcional en entorno real). AG-03 diagnosticado, visible en la aplicación y **abierto**: requiere decisión arquitectónica y verificación V-1 en el proyecto Firebase antes de considerar cerrado el bloque de custodia documental.
