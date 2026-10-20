# ORDEN AG-03.3 — ACEPTACIÓN FINAL Y CIERRE OPERATIVO DE AG-03 (2026-10-20)

**Resultado final: `LISTO PARA ACEPTACIÓN`.**
No es `AG-03 CERRADO` porque las pruebas obligatorias en el entorno real (Vercel + Firebase del
proyecto `gestor-inmuebles-produccion`) sólo puede ejecutarlas la persona usuaria: el sandbox de
Arena no tiene salida de red hacia Google ni Vercel. Todo lo verificable sin tocar producción se
ha ejecutado y está en verde: suite local completa, suite completa en CI, tipos, build y, por
primera vez, la custodia mediada por el servidor **contra los emuladores oficiales de Firebase
(Auth + Firestore con nombre + Storage)**, 7/7.

Informe de referencia de la implementación: `docs/ORDEN-AG-03.2-CORRECCION-FIRESTORE-STORAGE-2026-10-20.md`
(su §8 era el plan de aceptación; este informe lo ejecuta en lo posible y lo sustituye como plan operativo).

---

## 1. Estado del repositorio

| Elemento | Valor |
|---|---|
| Repositorio / rama | `sarqsan/Gestor-de-inmuebles-vercel` · `arena/8ed3381d-gestor-de-inmuebles-vercel` |
| Base de la rama | `cd58c9e7` (= `origin/main`, merge-base sin cambios) |
| HEAD al cerrar la orden | `f9bf928` (este informe) + un commit de documentación que registra ese SHA; código ejecutable idéntico a `383315c` |
| Guardia A-04 (`tests/guardia-a04-rama-sesion.test.ts`) | **4/4 OK** al inicio y al cierre (rama local = `origin/<rama>`, `main` local = `cd58c9e7`, árbol limpio) |
| Código de la aplicación cambiado en AG-03.3 | **0 archivos** (`src/`, `server/`, `storage.rules`, `firestore.rules` intactos respecto de `20f8d2a`). AG-03.3 sólo añade pruebas, arnés de CI y documentación |
| `firestore.rules` | sin cambios desde la base `cd58c9e7` (no hay nada que publicar en Firestore) |
| `storage.rules` | versión AG-03.2 (`72a2c6f`): 66 líneas (+44/−706 respecto de la base), **0 consultas a Firestore**; pendiente de publicar (§6) |

**Commits de esta orden** (todos en la rama de la sesión, empujados a `origin`):

| SHA | Contenido |
|---|---|
| `c84d213` | CI: la rama de la sesión queda incluida en `on.push.branches` del workflow `emulador-reglas.yml` (el `workflow_dispatch` está vedado al token de integración: HTTP 403). Sin secretos ni despliegue. |
| `8716fe7` | Nueva prueba de integración en proceso `tests/integracion-custodia-documental-extremo-a-extremo.test.ts` (13); `scripts/ci/resumen-resultados-vitest.mjs` + pasos del workflow (anotaciones, resumen, artefactos); suite P3 de emulador pasa de «fallo de módulo» a **omisión explícita y visible**. |
| `b6864e5` | Retira dos JSON de pruebas locales versionados por error y añade `.cache/` a `.gitignore`. |
| `383315c` | Corrige el arnés de `tests/emulador/documentos-servidor.emulador.test.ts` (defecto del propio arnés detectado en la primera ejecución en CI, §2.3). |
| `f9bf928` | `docs/ORDEN-AG-03.3-ACEPTACION-FINAL-2026-10-20.md` (este informe). El commit siguiente sólo inserta este SHA en el informe. |

Ningún PR, ningún merge, ninguna publicación de reglas, ningún despliegue, ninguna escritura en producción, ninguna migración.

---

## 2. Verificaciones ejecutadas y resultados exactos

Se distinguen cuatro niveles. «Válido para HEAD» significa que los commits posteriores a la
ejecución no tocan código ejecutable (solo documentación), por lo que el resultado sigue vigente.

### 2.1 Comprobaciones estáticas (HEAD, 2026-10-20)

| Comprobación | Resultado |
|---|---|
| `getFirestore(` / `initializeFirestore(` fuera de `src/lib/firebase.ts` (en `src/` y `server/`, sin tests) | **0 apariciones**. La única instancia es `export const db = getFirestore(app, firestoreDbId)` con `firestoreDbId` = `firestoreDatabaseId` de `firebase-applet-config.json` y fallo explícito `FIREBASE_BASE_DATOS_AUSENTE` si falta |
| Servidor: `ClienteFirestoreRest` | exige `baseDatosId` con nombre (`FIRESTORE_BASE_DATOS_REQUERIDA`); `resolverDestinoFirebase()` bloquea si el JSON versionado no declara `firestoreDatabaseId` o si un override de entorno lo contradice (`FIREBASE_OVERRIDE_INCOMPATIBLE`) |
| `storage.rules`: referencias a `firestore` | **2**, ambas en comentarios (líneas 10 y 13) que explican que no se consulta Firestore. Cero `firestore.get/exists` |
| `(default)` en código ejecutable (`src/`, `server/`, sin tests) | **1**: `src/features/operaciones/tests/emulator/operaciones.emulator.mjs:55`, guion de demostración sólo‑emulador, inerte en la app (clasificado ya en AG-03.2 §4.1). Lo demás son comentarios/documentación |
| Importaciones de `firebase/storage` en `src/` (sin tests) | sólo `src/lib/firebase.ts` (`getStorage`, instancia conservada por compatibilidad) y un `import type` en `documentosProfesionalesFirebase.ts`. Ningún consumidor sube, lee ni borra con el SDK: todos pasan por `src/lib/custodiaDocumental/almacenServidor.ts` |
| Enrutado Vercel | `vercel.json`: `/api/(.*)` → `api/index.ts` → `server.ts` (Express). Las rutas `/api/documentos/*` se sirven por la función existente (`maxDuration` 60 s); cuerpos JSON pequeños, los bytes nunca atraviesan Vercel |

### 2.2 Local (sandbox, HEAD `383315c`; válido para HEAD)

| Prueba | Resultado |
|---|---|
| `npx tsc --noEmit -p tsconfig.json` (incluye `tests/emulador`) | **0 errores** |
| Suite completa `npx vitest run` (`.cache/vitest-run4.log/json`, 223 s) | **269 archivos / 4819 correctas / 0 fallidas / 2 omitidas / 7 todo (4828)**. Las 2 omitidas son de `tests/seguridad-firestore-valoraciones.test.ts` §10.9 (comparan con el commit histórico `33fcf38`, ausente en el historial superficial del sandbox; en CI, con historial completo, se ejecutan y pasan). Nada que ver con AG-03 |
| Guardia A-04 | 4/4 |
| **Nueva** `tests/integracion-custodia-documental-extremo-a-extremo.test.ts` | **13/13** (detalle en §2.2.1) |
| Humo del servidor real sin credenciales (`NODE_ENV=production npx tsx server.ts`) | `POST /api/documentos/subidas`, `/acceso`, `/borrar`, `/publico/subidas` → **503 `{ok:false, codigo:'CUSTODIA_NO_DISPONIBLE'}`** con y sin cabecera `Authorization`. Nunca 404, nunca memoria, nunca éxito fingido |

#### 2.2.1 Qué demuestra la prueba de integración en proceso (nivel intermedio entre unitario y emulador)

Une las piezas **reales** que las suites unitarias probaban por separado con dobles manuales:
rutas Express reales (`montarRutasDocumentos`, escuchando en 127.0.0.1) + `crearServicioDocumentos` +
autorizador + `ClienteGoogleStorageRest` real (OAuth con clave RSA sintética) contra una
**Cloud Storage JSON API sintética** que implementa el contrato documentado por Google (sesión
reanudable con `location`, `PUT` de un tramo, metadatos, `PATCH`, `DELETE`, `ifGenerationMatch=0`,
descarga por token en `firebasestorage.googleapis.com/v0`), el motor cliente real
(`almacenServidor.ts`, `subirBinarioDuradero`) y una base Firestore **con nombre** en memoria con
la forma real de los documentos (espejo `usuarios_auth`, fichas, inmuebles, `gestiones_cartera`,
solicitudes). Casos:

| # | Caso | Garantía observada |
|---|---|---|
| 1.1 | Titular: inicio → `PUT` → confirmación → acceso → borrado | Inicio con `uploadType=resumable`, `ifGenerationMatch=0`, `Origin` del navegador reenviado, `X-Upload-Content-Type/Length`; el `PUT` del navegador **sin credenciales**; objeto con `custodia_origen=servidor-ag03`, `custodia_uid`, `sha256`, token; descarga íntegra (huella idéntica); `getMetadata` sin proyectar el token; borrado idempotente (`storage/object-not-found`); traza `[documentos]` sin nombres de fichero, tokens ni correos |
| 1.2 | Reintento idéntico / contenido distinto | `YA_EXISTE` sin reenviar bytes (1 solo `PUT`); contenido distinto ⇒ `OBJETO_EXISTENTE` y el objeto no cambia |
| 1.3 | Confirmación sin bytes; bytes reales fuera de regla | `409 OBJETO_INCOMPLETO/SIN_OBJETO`; un `PUT` de 12 MB (límite de `gastos_facturas`) ⇒ `413 ARCHIVO_DEMASIADO_GRANDE` y **el servidor retira el objeto propio**; nunca éxito |
| 1.4 | Objeto heredado/ajeno (sin marca del servidor) | `409 OBJETO_INCOMPLETO/OBJETO_AJENO`, **no se borra** por la vía de confirmación; sigue legible y borrable por quien tiene ámbito (vía explícita) |
| 2.1 | Otro propietario / sin ficha / sin sesión / token inválido | `SIN_PERMISO` en lectura, escritura y borrado (sin abrir sesión); sin ficha ⇒ `SIN_PERMISO`; sin sesión ⇒ `401 NO_AUTENTICADO`; motivos registrados `AMBITO_PROPIETARIO_*` |
| 2.2 | Cartera E / cartera L | E lee y sube (objeto marcado con su uid), no borra lo del titular; L sólo lee |
| 2.3 | Delegación parcial (`gestiones_cartera`) | Sólo el inmueble enumerado (inventario); la cartera completa no aplica al indexado; `permiso: LECTURA` ⇒ escritura denegada, lectura viva; relación `FINALIZADA` ⇒ ni lectura; otro propietario no ve el inventario |
| 2.4 | Revocación | Espejo `BLOQUEADO` ⇒ denegado al instante; **revocación entre inicio y confirmación** ⇒ `403` y el objeto propio se retira; reactivar restaura |
| 2.5 | Portal público de candidatos | Token correcto sube sin sesión a la ruta plana (`custodia_uid=portal-publico`, `Origin` reenviado); token incorrecto, solicitud distinta, ruta anidada y otro destino ⇒ denegados sin objeto ni sesión; el titular del inmueble lo lee, otro titular no, anónimo no |
| 2.6 | Límites y rutas (11 cuerpos) | `text/plain` 400, 12 MB 413, tamaño 0/`"10"` 400, `presupuestos/` y `../` y `/` iniciales 403 `RUTA_NO_ADMITIDA`, `sin_asignar` 403 `SIN_PERMISO` (`SIN_TITULAR`), metadatos reservados y campo extra 400 `PETICION_INVALIDA`; **ninguna sesión abierta, ningún objeto** |
| 2.7 | Cuenta maestra (la última) | Lee lo ajeno; no custodia en `sin_asignar`; su éxito no altera las denegaciones de B; lo que deja en la carpeta de B lo ve B y no A |
| 3.1 | Sin servicio configurado | `503 CUSTODIA_NO_DISPONIBLE`; el cliente lanza `ErrorCustodiaDocumento('RED')`, no fabrica resultado |
| 3.2 | Fuente de autorización caída | `503 FUENTE_NO_DISPONIBLE` (ni permiso ni denegación inventados); al volver, `PERMITIDO` |

### 2.3 Emuladores oficiales de Firebase (GitHub Actions; `firebase-tools@15.33.0`, Java 21, Node 22)

Workflow «Emulador de reglas y verificación», job «Reglas Firestore y Storage (emuladores oficiales)»
= `npm run test:emulador:reglas` (Auth 9099 + Firestore 8080 + Storage 9199, proyecto demo
`demo-gestor-reglas`, base con nombre `ai-studio-gestordeinmueble-…`). Los resultados se leen por
las anotaciones del check-run y el artefacto `emulador-resultados` (el log del job vive en un host
externo no accesible desde el sandbox; de ahí el guion `scripts/ci/resumen-resultados-vitest.mjs`).

| Ejecución | Commit | Resultado | Lectura |
|---|---|---|---|
| `39450371027` | `c84d213` | job emulador **fallido**; job verificación correcto | Esperado: `documentos-p3.emulador.test.ts` lanzaba al cargar (`P3_EMULADOR_SUPERSEDIDA_AG03_2`) y hacía rojo el job tapando el resto; el log no era legible desde el sandbox |
| `39452684522` | `8716fe7` | job emulador **fallido**: 5/6 archivos, 68/86, **6 fallidas** (todas en `documentos-servidor`), 12 omitidas (P3) | `storage-ambitos` 5/5 ✓ · `reglas-inmuebles` 53/53 ✓ · `justificantes-cobro` 1/1 ✓ · `importacion-adaptador` 8/8 ✓ · `documentos-servidor` 1/7: las pruebas 2–7 fallaban con «No se ha podido conectar con el servidor de documentos». **Causa: defecto del arnés**, no de la app: `fetchMotor` enviaba las rutas relativas (servidor Express *en proceso*, loopback) a `fetchSoloEmuladores`, que sólo admite los tres hosts de los emuladores y lanzaba `P2_ACEPTACION_BLOQUEO_RED_EXTERNA`. Corregido en `383315c` (sólo el test) |
| **`39453667548`** | **`383315c`** | **ambos jobs correctos** | Emulador: **6/6 archivos, 74/86 correctas, 0 fallidas, 12 omitidas (P3, explícitas)**. Verificación: tsc 0 · suite 268/268 archivos, 4817/4824 (0 fallidas; 7 `todo`; A-04 excluida por diseño en CI) · build OK |

Detalle de la ejecución válida (`383315c`) por archivo:

| Suite de emulador | Resultado | Qué certifica contra el motor real de reglas/emuladores |
|---|---|---|
| `storage-ambitos.emulador.test.ts` | **5/5** | Con las `storage.rules` de AG-03.2 ningún prefijo privado se crea, lee, enumera ni borra desde el SDK de cliente (titular, ajeno, master, anónimo); la foto de catálogo se lee sin sesión y no se escribe; el portal ya no sube anónimo por reglas; **las decisiones no cambian con Firestore vacío** (no dependen de `(default)` ni de ninguna base) |
| `documentos-servidor.emulador.test.ts` | **7/7** | (1) `(default)` vacía y la base con nombre con el ámbito; (2) titular: inicio → `PUT` directo a la sesión reanudable del emulador → confirmación; objeto con metadatos del servidor; descarga por URL con token con huella idéntica; reintento `YA_EXISTE` sin duplicar; contenido distinto rechazado; (3) cartera E lee y sube; otro titular y anónimo denegados; **revocación bloquea** y reactivación restaura; master lee sin enmascarar la denegación ajena; (4) límites tipo/tamaño antes de abrir sesión; confirmación sin bytes ⇒ `OBJETO_INCOMPLETO` sin objeto; (5) portal público con token correcto/incorrecto; el titular lee; (6) catálogo: la foto subida por el servidor se lee **sin sesión** por la ruta pública de las reglas y la factura no (403); (7) borrado idempotente y acotado; `(default)` sigue vacía al final |
| `reglas-inmuebles.emulador.test.ts` | 53/53 | Reglas Firestore de inmuebles (titular, cartera, revocación, invariantes) — sin cambios en esta orden |
| `justificantes-cobro.emulador.test.ts` | 1/1 | P2 (justificantes con `ClienteGoogleStorageRest`) sigue intacto tras la extensión del cliente |
| `importacion-adaptador.emulador.test.ts` | 8/8 | Importación bajo reglas — sin cambios |
| `documentos-p3.emulador.test.ts` | **12 omitidas (explícito)** | Ver §2.5 |

### 2.4 Qué NO se repitió (ya válido para el HEAD)

Las suites focales de AG-03.2 (`custodia-documental-fail-closed` 25, `custodia-topologia-firestore-storage` 18,
`almacenServidor` 14, `almacenGoogleStorage` 9, `autorizacionDocumental` 24, `servicioDocumentos` 21,
`seguridad-storage-documentos` 38, D3/P3/P5/morosidad/actas…) forman parte de la suite completa
ejecutada en §2.2 y §2.3 (269/268 archivos en verde); no se ejecutaron por separado.

### 2.5 Pendiente de verificación (V) — con la razón exacta

| Punto | Por qué sigue en V | Dónde se cierra |
|---|---|---|
| **CORS del `PUT` del navegador a la URI de sesión de Cloud Storage** | Google documenta que los extremos JSON API (`/upload/storage/v1/…`) sirven CORS siempre y que la sesión hereda el `Origin` de la petición inicial (el servidor lo reenvía: comprobado en §2.2.1 y §2.3). El emulador refleja cualquier origen, así que no lo prueba | Paso R-3 de §5 (primera subida real desde el navegador) |
| **Destinos con token rotatorio** (`inmuebles/{id}/documentos_patrimoniales/…` P5 y `profesionales/{id}/documentos/…` P3: `PATCH` de metadatos en cada lectura) | El emulador 15.33.0 sólo registra `PATCH` en `/b/{bucket}/o/{objeto}` (no bajo `/storage/v1/`, que es la ruta real de la JSON API): verificado en el código fuente de `firebase-tools` (`src/emulator/storage/apis/gcloud.ts`). No se añade código sólo‑emulador a la app. La autorización de estos destinos está cubierta en unitario (`autorizacionDocumental`, `servicioDocumentos`) | Pasos R-8c y R-8d de §5 |
| `documentos-p3.emulador.test.ts` (12 casos) | Describe la custodia por SDK anterior a AG-03.2; re-adaptarla al flujo mediado exige, además, el punto anterior. Queda **omitida de forma explícita** (vitest la lista como `skipped` con el motivo en el nombre; `P3_EMULADOR_FORZAR=1` la ejecuta y fallará). No se declara cubierta por el emulador | Re-adaptación fuera de esta orden; mientras tanto, cobertura por unitario + integración en proceso + aceptación real R-8c/R-8d |
| Permisos IAM reales de la cuenta de servicio sobre el bucket (crear, leer metadatos, **actualizar metadatos y borrar**) y lectura de la base con nombre | No comprobables desde el sandbox | Pasos R-1/R-2 (síntomas definidos) |
| Objetos huérfanos de subidas no confirmadas | Decisión de operación (regla de ciclo de vida del bucket), no defecto | §7 (recomendación) |

---

## 3. Cumplimiento de los criterios de la orden (§2 de la orden)

| Criterio | Estado | Evidencia |
|---|---|---|
| Toda operación Firestore usa sólo la base con nombre | ✅ | §2.1 (cliente y servidor sin selector `(default)`; fallo explícito si falta el id) · emulador: `(default)` vacía durante toda la suite `documentos-servidor` y el ámbito resuelto desde la base con nombre |
| Las reglas de Storage no dependen de `(default)` ni de ninguna base | ✅ | `storage.rules` sin `firestore.*` · `storage-ambitos` 5/5 («las decisiones no dependen de Firestore») |
| Las rutas del servidor validan identidad y permisos vigentes | ✅ | Rutas con guardia Bearer (`401` sin/inválido) · autorización fresca por petición (`ContextoAutorizacion` por request) · revocación entre inicio y confirmación (§2.2.1 · 2.4; emulador prueba 3) |
| Carteras, titularidades, delegaciones parciales y revocaciones respetadas | ✅ | §2.2.1 (2.2, 2.3, 2.4) + emulador (3) + unitario `autorizacionDocumental` (24) |
| Ningún acceso cruzado entre propietarios | ✅ | §2.2.1 (2.1, 2.5, 2.7) + emulador (3, 5, 7) + reglas (`storage-ambitos`) |
| Subida reanudable, confirmación del objeto, lectura y borrado mantienen la custodia | ✅ (emulador y en proceso) · V en real | §2.2.1 (1.1–1.4) + emulador (2, 4, 6, 7) · CORS real pendiente (§2.5) |
| Sin almacenamiento temporal en memoria ni éxito falso | ✅ | Humo del servidor real (503 `CUSTODIA_NO_DISPONIBLE`) · 3.1/3.2 de §2.2.1 · `custodia-documental-fail-closed` 25 |
| Pruebas pendientes de emulador vs suite general claramente diferenciadas | ✅ | §2.2 / §2.3 / §2.5 |

---

## 4. Defectos encontrados y corregidos en esta orden

| # | Dónde | Tipo | Corrección |
|---|---|---|---|
| D-1 | `tests/emulador/documentos-servidor.emulador.test.ts` · `fetchMotor` | **Arnés de prueba** (escrito en AG-03.2 sin emulador disponible) | Rutas relativas → `fetch` directo al servidor en proceso (loopback, con `Origin`); URLs absolutas siguen cerradas a los emuladores. Commit `383315c`. Tras la corrección: 7/7 |
| D-2 | `tests/emulador/documentos-p3.emulador.test.ts` | Fallo de módulo que enrojecía el job y ocultaba los resultados vigentes | Omisión explícita y visible (`describe.skip` con motivo + `P3_EMULADOR_FORZAR`). Commit `8716fe7` |
| D-3 | Observabilidad de CI | El log del job no es descargable desde el sandbox | `scripts/ci/resumen-resultados-vitest.mjs` → anotaciones del check-run, resumen del paso y artefactos (`emulador-resultados`, `vitest-resultados`, 14 días). Sin secretos |
| D-4 | `.gitignore` | Dos JSON de pruebas locales versionados por descuido | Retirados del índice; `.cache/` ignorado (`b6864e5`) |

**No se encontró ningún defecto en el código de la aplicación** (servidor, motor cliente, reglas,
consumidores). No se cambió una sola línea de `src/`, `server/` ni de las reglas en AG-03.3.

---

## 5. Aceptación real — pasos exactos (sólo la persona usuaria puede ejecutarlos)

Reglas de juego: cuentas y documentos **sintéticos** (correos `*.invalid` o buzones de prueba,
PDF/JPG generados para la ocasión, sin datos personales ni documentos de inquilinos reales);
la cuenta de administración (`sarqsan2@gmail.com` / `MASTER_ADMIN_EMAIL`) se usa **la última**.
Todo se hace en la **vista previa (Preview) de Vercel de esta rama**, con las reglas de Storage
actuales (las de producción) **todavía sin cambiar**: el flujo mediado no depende de las reglas,
así que la matriz se valida sin tocar producción. Las reglas se publican sólo en el corte a
producción (§6).

### Preparación (una vez)

| Paso | Pantalla | Acción | Resultado esperado |
|---|---|---|---|
| P-1 | Vercel → proyecto → *Settings → Environment Variables* | Comprobar que la variable de la credencial de servicio (`FIREBASE_SERVICE_ACCOUNT` o `FIREBASE_SERVICE_ACCOUNT_B64`) tiene marcado el entorno **Preview** además de Production (sin copiar su valor a ningún sitio) | La variable aparece con «Preview» activo. Si no lo está, activarlo y volver a desplegar |
| P-2 | Vercel → *Deployments* | Desplegar la rama `arena/8ed3381d-gestor-de-inmuebles-vercel` (push ya hecho; si la integración Git no crea la preview automáticamente, «Create Deployment» desde la rama) | Deployment **Ready**; URL de preview `https://<deployment>.vercel.app` |
| P-3 | Google Cloud → IAM (proyecto `gestor-inmuebles-produccion`) | Confirmar que la cuenta de servicio que usa la app tiene sobre el bucket `gestor-inmuebles-produccion.firebasestorage.app` permisos de **crear, leer, actualizar metadatos y borrar objetos** (rol «Storage Object Admin» o equivalente) y lectura de Firestore (la que ya usa P2/IA) | Si falta «actualizar/borrar», el síntoma en la app será el mensaje «no se ha podido conectar con el almacenamiento» al **borrar** o al abrir documentos patrimoniales/profesionales, con `[documentos] … ALMACEN_NO_DISPONIBLE` en los logs de la función de Vercel |
| P-4 | Preview, con la cuenta de administración → `Administración y Seguridad` (altas de usuario y onboarding de carteras: selector «Gestor» y permiso de la delegación) | Crear/activar con los flujos habituales: **propietario A**, **propietario B** (ambos con al menos un inmueble propio; A con dos: `INM-A1`, `INM-A2`), **gestor E** (cartera completa de A con lectura y escritura), **gestor L** (cartera de A sólo lectura), **gestor P** (delegación de A acotada **sólo a `INM-A1`**, con lectura y escritura). Con la cuenta A, desde `Candidatos`, crear una **solicitud de documentación** de un candidato sintético para `INM-A1`. Esto es preparación (sólo la administración puede escribir `gestiones_cartera`), no la prueba de custodia de la administración, que sigue siendo la última (R-12) | Las cinco cuentas inician sesión en la preview y ven únicamente lo que les corresponde |

### Matriz (cada fila: iniciar sesión con la cuenta indicada en una ventana privada)

| Paso | Cuenta | Pantalla → acción | Resultado esperado (éxito) | Qué significa un fallo |
|---|---|---|---|---|
| **R-1** | Propietario A | `Mis Gastos` → nuevo gasto de `INM-A1` → **Adjuntar factura** (PDF sintético de 1–2 MB) → guardar | La factura queda adjunta y se abre desde el gasto. Sin mensaje de error | «no se ha podido conectar con el almacenamiento» ⇒ (a) 503 `CUSTODIA_NO_DISPONIBLE`: credencial no disponible en Preview (P-1); (b) CORS del `PUT` (ver R-3); (c) IAM (P-3). Mirar los logs de la función: líneas `[documentos] {…}` |
| **R-2** | (consola de Google, sin iniciar sesión en la app) | Google Cloud console → *Cloud Storage → Buckets* → `gestor-inmuebles-produccion.firebasestorage.app` → carpeta `gastos_facturas/<id de A>/<id gasto>/` → clic en el archivo → sección **Metadatos personalizados** (en Firebase console → *Storage → Files* se ve el mismo objeto con tipo y tamaño) | Existe **un** objeto; tipo `application/pdf`; tamaño = tamaño del PDF; metadatos personalizados `custodia_origen = servidor-ag03`, `custodia_uid = <uid de A>`, `sha256` y `firebaseStorageDownloadTokens` presentes | Objeto ausente ⇒ la subida no se confirmó (R-1 debería haber fallado). Sin `custodia_origen` ⇒ se subió por otra vía (no debe ocurrir) |
| **R-3** | Propietario A | Nada adicional: **R-1 en éxito ya demuestra la subida directa y el CORS**, porque los bytes sólo pueden llegar al bucket por el `PUT` del navegador a `storage.googleapis.com` (el servidor nunca los recibe y no existe otra vía). Opcional, si se quiere la evidencia literal: repetir R-1 con otro PDF con la pestaña *Network* del navegador abierta y anotar el estado del `PUT` a `storage.googleapis.com/upload/storage/v1/…` | R-1 correcto (y, si se mira, `PUT` con estado 200 y sin aviso CORS en la consola del navegador) | R-1 falla con «no se ha podido conectar con el almacenamiento» **y** los logs de la función no muestran ningún `[documentos]` con `confirmar` ⇒ el `PUT` no llegó: V «CORS» pasa a **BLOQUEADO**; aplicar la contingencia §7‑C y repetir R-1 |
| **R-4** | Propietario A | `Mis Cobros` → cobro de `INM-A1` → **Adjuntar justificante de transferencia / ingreso** (JPG sintético) · `Mis Viviendas` → `INM-A1` → añadir una foto | Ambos quedan guardados y visibles | Igual que R-1 |
| **R-5** | Propietario A | Borrar la factura adjunta en R-1 desde el gasto | Desaparece de la app y del bucket (comprobar en Storage → Files) | Si sigue en el bucket ⇒ borrado no autorizado/ejecutado: revisar P-3 |
| **R-6** | Propietario **B** | `Mis Gastos`, `Mis Cobros`, `Mis Viviendas` | B **no ve** gastos, cobros, facturas, justificantes ni fotos de A en ninguna lista; no existe forma de abrirlos | Si B ve o abre algo de A ⇒ **BLOQUEADO**: detener la aceptación y reportar (captura sin datos personales) |
| **R-7** | Propietario B | `Mis Gastos` → adjuntar una factura a un gasto **propio** de B | Funciona igual que R-1 para A (B tiene sus privilegios normales, ni más ni menos) | — |
| **R-8a** | Gestor **E** | Entrar en la cartera de A: abrir la factura/justificante/foto de A (lectura) y **adjuntar** una factura nueva en un gasto de A | Lee y adjunta. **No** puede borrar la factura de A (la acción no está disponible o devuelve «tu cuenta no tiene permiso…») | Si borra ⇒ BLOQUEADO |
| **R-8b** | Gestor **L** | Misma cartera | Lee todo; al intentar adjuntar: «El documento no se ha guardado: tu cuenta no tiene permiso para custodiar archivos de este titular…» | Si adjunta ⇒ BLOQUEADO |
| **R-8c** | Gestor **P** (parcial) | `Mis Viviendas` (sólo debe listar `INM-A1` de la cartera de A) → `INM-A1` → centro operativo → **Documentos patrimoniales → Añadir documento** (PDF) y abrirlo después; después buscar `INM-A2` | En `INM-A1`: el documento se sube y **se abre** (esto cierra el V de «token rotatorio» P5). `INM-A2`: no aparece o, si se llega por enlace directo, denegado | Sube o abre documentos de `INM-A2` ⇒ BLOQUEADO. No se abre en `INM-A1` con «no se ha podido conectar…» ⇒ IAM «actualizar metadatos» (P-3) |
| **R-8d** | Propietario A | `Mi Portal Propietario` (Servicios y profesionales) → ficha de un profesional sintético → pestaña **Documentación** → **Añadir documento acreditativo** → **Subir y almacenar** → abrir el documento | Se sube y se abre (cierra el V de «token rotatorio» P3) | Igual que R-8c |
| **R-9** | Administración → luego Gestor E | `Administración y Seguridad`: **revocar** la cartera de E sobre A (o suspender a E). Después, con E, recargar y volver a intentar abrir/adjuntar en la cartera de A | Denegado de inmediato (sin esperar a cerrar sesión): lecturas y subidas devuelven «tu cuenta no tiene permiso…» / los documentos dejan de abrirse | Si E sigue operando ⇒ BLOQUEADO |
| **R-10** | Sin sesión (ventana privada) | Abrir el enlace del portal de documentación del candidato de P-4 (`Candidatos` → solicitud → copiar enlace; formato `…?doc=<token>` o `…/documentacion/<token>`) → subir un PDF sintético | El PDF se sube y queda marcado como aportado. Manipular el token en la URL ⇒ el portal no admite subir | Subida con token manipulado ⇒ BLOQUEADO |
| **R-11** | Propietario A, luego B | `Candidatos` → ver la documentación aportada en R-10 | A la abre; B no la ve | — |
| **R-12** | **Administración (la última)** | Repetir una lectura de la factura de A, una subida en un gasto de A y comprobar que `Morosidad y Recobro` / `Actas Entrada/Salida` abren sus evidencias | Todo accesible para administración; nada de lo anterior cambia para A/B/E/L/P | — |

Criterio de la matriz: **todas** las filas en «éxito» ⇒ AG-03 puede declararse `CERRADO` tras el
corte a producción (§6 y §8). Cualquier «BLOQUEADO» detiene la aceptación; se corrige en esta rama
y se repite desde la fila afectada.

---

## 6. Publicación y despliegue: qué, en qué orden, post-comprobaciones

**Qué hay que publicar exactamente**

| Destino | Contenido | Mecanismo |
|---|---|---|
| Vercel (producción) | El código de esta rama (servidor `/api/documentos/*`, motor cliente, `firebase.ts` con base con nombre, consumidores). Variable de entorno de la credencial de servicio ya en Production | Promover el deployment de la preview validada (**Promote to Production**) o fusionar en `main` cuando la persona usuaria lo decida (fuera de esta orden: no hay PR ni merge) |
| Firebase Storage | `storage.rules` de esta rama (HEAD; idéntico desde `72a2c6f`), bucket `gestor-inmuebles-produccion.firebasestorage.app` | Firebase console → *Storage* → pestaña **Rules** → sustituir el contenido por el del archivo → **Publish**. Alternativa: `firebase deploy --only storage --project gestor-inmuebles-produccion` desde un checkout de la rama |
| Firestore | **Nada** (`firestore.rules` sin cambios desde `cd58c9e7`; ninguna colección nueva; ninguna migración) | — |

**Orden obligatorio** (la razón: las reglas nuevas cierran el acceso directo del SDK; el código
antiguo en producción aún sube por el SDK, así que las reglas sólo pueden cambiar cuando el código
nuevo ya está sirviendo):

1. **Preview**: P-1…P-4 y matriz R-1…R-12 (§5) con las reglas actuales sin tocar.
2. **Producción, código**: promover el deployment validado. Post-comprobación inmediata: con el
   propietario sintético A, `Mis Gastos` → adjuntar una factura y abrirla (R-1 en producción).
3. **Producción, reglas**: publicar `storage.rules`. Post-comprobaciones (≤ 5 min después):
   (a) R-1 y R-5 de nuevo en producción (subir, abrir, borrar); (b) `Mis Viviendas` → la foto de
   un inmueble del catálogo público se sigue viendo sin sesión (ficha pública); (c) R-10 (portal)
   una vez más.
4. **Administración la última**: R-12 en producción.
5. Declarar `AG-03 CERRADO` (§8) y retirar la rama de `on.push.branches` del workflow si se desea
   (housekeeping; no afecta a la app).

Ventana de riesgo entre 2 y 3: ninguna funcional (código nuevo + reglas antiguas = el servidor
media todo y las reglas antiguas quedan sin usar). Lo único que las reglas nuevas añaden es el
**cierre** del acceso directo del SDK (R-4 de AG-03.1), por eso no debe demorarse más de lo
necesario.

---

## 7. Marcha atrás y contingencias

| Situación | Acción | Efecto |
|---|---|---|
| **A · Las reglas nuevas causan un problema** (p. ej. catálogo público no visible) | Firebase console → *Storage* → *Rules* → **Rules history / versiones** → restaurar la versión publicada anterior (la vigente antes del paso 6.3; su contenido es el `storage.rules` de `cd58c9e7`/`edf020e`) | Vuelve el estado anterior de reglas. El código nuevo sigue funcionando (no depende de ellas) |
| **B · El código nuevo causa un problema en producción** | Vercel → *Deployments* → deployment anterior → **Promote to Production** (instantáneo). Si además las reglas nuevas ya estaban publicadas, aplicar A **antes** (el código antiguo sube por el SDK y las reglas nuevas lo denegarían) | Estado previo completo. Orden: reglas (A) → código (B) |
| **C · CORS del `PUT` falla en R-3** | Configurar CORS del bucket para el origen de la app (Google Cloud → Cloud Storage → bucket → *Configuration* → CORS, o `gsutil cors set` con `origin: [https://<dominio de la app>]`, `method: [PUT, GET, HEAD, OPTIONS]`, `responseHeader: [Content-Type, Content-Range, Location, x-goog-*]`, `maxAgeSeconds: 3600`). Repetir R-1/R-3 | No requiere cambios de código. Hasta resolverlo, la subida de documentos en la preview falla cerrada (ningún documento se pierde en silencio: la app informa «no se ha podido conectar con el almacenamiento») |
| **D · Reversión del código en Git** | `git revert` del rango `72a2c6f..HEAD` en una rama nueva (fuera de esta sesión; no se hace aquí) | Sólo si se decide abandonar la arquitectura; no es necesario para A/B |
| **Huérfanos** (el `PUT` terminó pero la confirmación nunca llegó: cierre del navegador, red) | Son inocuos: ningún registro los referencia, están marcados por el servidor y sólo son accesibles por quien tenía ámbito. Las reglas de ciclo de vida del bucket no filtran por metadato personalizado, así que no se recomienda ninguna regla automática (borraría también objetos confirmados). Opcional tras el cierre: revisión periódica en Storage → Files | Higiene, no seguridad |

Datos: ninguna de las acciones A–D borra ni migra datos. Los objetos subidos durante la aceptación
en preview viven en el bucket real bajo ids sintéticos; pueden borrarse desde la app (R-5) o desde
Storage → Files al terminar.

---

## 8. Resultado y criterio de cierre

| Criterio de cierre (orden §7) | Estado |
|---|---|
| Base con nombre en uso en todas las operaciones | ✅ verificado (estático, unitario, emulador) |
| Storage opera mediante autorización segura en servidor | ✅ verificado (unitario, integración en proceso, **emulador oficial 7/7**) |
| Cuentas normales superan la matriz de permisos | ✅ en emulador/en proceso · **pendiente en real** (§5 R-6…R-11) |
| Operaciones documentales funcionan en el entorno real | **pendiente** (§5 R-1…R-5, R-8c/R-8d, R-10) — sólo ejecutable por la persona usuaria |
| Sin fallos críticos pendientes | ✅ ningún fallo abierto en código; V enumerados en §2.5 con su cierre asignado |

**Estado final de la orden: `LISTO PARA ACEPTACIÓN`.**
Pasa a `AG-03 CERRADO` cuando la matriz de §5 esté en verde en la preview, el código esté promovido
y las reglas publicadas con las post-comprobaciones de §6 superadas (administración la última).
Pasa a `BLOQUEADO` si cualquier fila de §5 marcada como tal falla; la corrección se hará en esta
misma rama y se repetirán las pruebas afectadas.

**Lo que Arena no puede hacer y por qué**: ejecutar R-1…R-12, desplegar en Vercel, publicar reglas,
tocar IAM o CORS. El sandbox sólo alcanza GitHub/npm/PyPI; por eso la verificación con emuladores
se ha llevado a GitHub Actions (resultados legibles por anotaciones y artefactos) y la aceptación
real queda descrita pantalla a pantalla.
