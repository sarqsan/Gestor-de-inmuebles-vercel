# ORDEN AG-03.2 — Corrección definitiva de Firestore y Storage (informe de ejecución)

Fecha: 2026-10-20 · Rama: `arena/8ed3381d-gestor-de-inmuebles-vercel` · Repositorio: `sarqsan/Gestor-de-inmuebles-vercel`

> Resumen en una frase: la aplicación (cliente y servidor) sólo conoce la base Firestore con nombre
> `ai-studio-gestordeinmueble-c6444afd-24ca-4983-b195-ceb2c5ebdc51`; `storage.rules` ya no consulta
> Firestore (ninguna base) y toda la autorización documental la decide el servidor, por petición,
> leyendo esa base con nombre. `(default)` no recibe nada, no se migra nada, no se borra nada y no se
> despliega nada: la publicación de reglas y la validación con cuentas reales quedan como pasos de
> aceptación descritos al final.

---

## 1. Mapa de la rama

| Elemento | Valor |
| --- | --- |
| Rama de trabajo | `arena/8ed3381d-gestor-de-inmuebles-vercel` (única rama tocada; sin PR, sin merge con `main`) |
| Base de la rama | `cd58c9e7feec591c16cef9be42a0fcbcea3af21d` (`main`) |
| Commits previos de la sesión | `b61aa2a`, `24e271f`, `a463e99` (ORDEN 1) · `edf020e` (AG-03.1, sólo documentación) |
| HEAD al empezar AG-03.2 | `edf020e` = `origin/arena/8ed3381d-…` (verificado con `git fetch` + comparación de SHA; árbol limpio) |
| Trabajo previo | Recuperado tal cual (no se sobrescribió ni se re-generó nada; se construyó encima de `edf020e`) |
| HEAD al cerrar este informe | `72a2c6f7c928eac54be9be9571c3a1f27c248d7b` (código + pruebas + este informe), empujado a `origin/arena/8ed3381d-gestor-de-inmuebles-vercel`; el registro de este SHA se añade en el commit siguiente |

Nota: la orden AG-03.1 citaba ficheros que no existen con ese nombre (`src/firebase.ts`, `src/configuracionFirebase.ts`,
`src/utils/entornoFirebase.ts`); los equivalentes reales son `src/lib/firebase.ts`, `server/titularidades/configuracionFirebase.ts`
y `src/lib/entornoFirebase.ts`, y son los que se han modificado.

---

## 2. Ficheros modificados y creados

### Servidor (nuevo módulo de custodia documental)
| Fichero | Qué hace |
| --- | --- |
| `server/documentos/autorizacionDocumental.ts` (nuevo) | Catálogo de 20 destinos (`DESTINOS`: patrón de ruta, límites de tipo/tamaño, sobrescribible, token rotatorio, URL persistible), resolución segura de rutas, actor (master por identidad verificada), `ContextoAutorizacion` (espejo `usuarios_auth`, ficha `usuarios`, inmuebles, carteras L/E, delegación parcial `gestiones_cartera`, inquilino por contrato, profesional, metadatos P3/P5) y `decidirAccion(LEER/CREAR/SOBRESCRIBIR/BORRAR)`. Todas las lecturas van por un puerto que apunta a la base con nombre. |
| `server/documentos/servicioDocumentos.ts` (nuevo) | `iniciarSubida` (validación de contenido → autorización → `YA_EXISTE` idéntico / `OBJETO_EXISTENTE` / sesión reanudable con nombre, tipo, `custodia_origen`, `custodia_uid` y token de descarga fijados por el servidor), `confirmarSubida` (re-autoriza con los metadatos REALES del objeto; si no cumple, lo retira SÓLO si lo marcó este servidor para este actor; ausente ⇒ `OBJETO_INCOMPLETO`), `acceso` (URL con token; rotación en P3/P5), `borrar` (idempotente), `verificarPublico` (token de `solicitudes_documentacion`). Traza `console.info('[documentos] …')` sin datos sensibles. |
| `server/documentos/rutasDocumentos.ts` (nuevo) | `POST /api/documentos/subidas`, `/subidas/confirmar`, `/acceso`, `/borrar`, `/publico/subidas`, `/publico/subidas/confirmar`. Bearer obligatorio salvo portal; cuerpo con lista blanca de campos; errores `{ok:false, codigo, error, motivo?}` con HTTP 400/401/403/404/409/413/503. |
| `server/documentos/autorizacionDocumental.test.ts`, `server/documentos/servicioDocumentos.test.ts` (nuevos) | 24 + 21 pruebas unitarias del autorizador, del servicio y de las rutas (con dobles de Firestore/Storage). |
| `server/cobros/almacenGoogleStorage.ts` | Nuevos métodos REST de la cuenta de servicio: `metadatos`, `iniciarSesionResumable` (JSON API, `ifGenerationMatch=0` opcional, `Origin` del navegador, `X-Upload-Content-*`), `borrar`, `parchearMetadatos`, `urlDescargaConToken`, `bucket`; `normalizarMetadatos`, `esNombreObjetoValido`. |
| `server/cobros/almacenGoogleStorage.test.ts` | +6 pruebas de los métodos nuevos (contrato HTTP exacto, códigos de error, entradas inválidas sin red). |
| `server/titularidades/googleBackend.ts` | `ClienteFirestoreRest` exige `baseDatosId` con nombre (`FIRESTORE_BASE_DATOS_REQUERIDA`); `esBaseDatosConNombre`; eliminado el valor por omisión `(default)`. |
| `server.ts` | Construye `servicioDocumentos` con el MISMO puerto Firestore/Storage del resto del servidor y monta `montarRutasDocumentos`. Sin credencial ⇒ 503 `CUSTODIA_NO_DISPONIBLE` (nunca memoria). |

### Cliente
| Fichero | Qué hace |
| --- | --- |
| `src/lib/custodiaDocumental/almacenServidor.ts` (nuevo) | Motor de almacén mediado por el servidor con superficie compatible con el SDK: `ref`, `uploadBytes` (inicio → `PUT` directo a la sesión → confirmación; plazo con cancelación real; `yaExistia`), `subirDocumentoPublico`, `getDownloadURL`, `getMetadata`, `getBytes` (reintento único si el token rotó), `deleteObject`, `configurarAlmacenServidor` (inyección de `fetch`/token en pruebas), `ErrorAlmacenServidor` con códigos `storage/*` estables. |
| `src/lib/custodiaDocumental/almacenServidor.test.ts` (nuevo) | 14 pruebas del contrato cliente↔servidor↔sesión (sin red). |
| `src/lib/custodiaDocumental/subidaDirecta.ts` | `MotorStorage` ahora es el motor del servidor (`MOTOR_STORAGE_SERVIDOR`; `MOTOR_STORAGE_SDK` queda como alias deprecado); `accesoPublico` para el portal; clasificación de errores (`motivo: 'PLAZO'` ⇒ `TIEMPO_AGOTADO`). AG-04 intacto: éxito sólo con confirmación + URL. |
| `src/lib/firebase.ts` | Arranque estricto: sin `firestoreDatabaseId` con nombre lanza `FIREBASE_BASE_DATOS_AUSENTE` (no selecciona otra base); de `firebase/storage` sólo queda `getStorage`; subidas/lecturas/borrados van por el motor; `uploadDocumentoAportadoFile` acepta `tokenAcceso` (portal). |
| `src/lib/entornoFirebase.ts` | Sin identificador de respaldo; `FIREBASE_BASE_DATOS_CONFIGURADA`; `avisoTopologiaCustodia()` sólo avisa si falta la base con nombre. |
| `src/lib/expedienteDocumental/gestorFirebase.ts`, `documentosProfesionalesFirebase.ts`, `src/lib/firebaseActas.ts`, `src/lib/morosidadEvidenciasStorage.ts`, `src/lib/paqueteAsesorFirebase.ts`, `src/lib/suministrosFirestore.ts` | Import de Storage cambiado al motor del servidor (misma firma; sin cambios de flujo). |
| `src/components/PortalDocumentacionPublicaView.tsx` | Pasa el token de la solicitud a la subida (vía pública verificada en servidor). |

### Reglas y configuración
| Fichero | Qué hace |
| --- | --- |
| `storage.rules` | Reescrito: **cero** `firestore.get/exists`, cero `/databases/…`, cero correos. Única concesión: `allow get: if true` en `inmuebles/{inmuebleId}/{fileName}` (catálogo público R3, sin `list`); comodín final `allow read, write: if false`. |
| `firebase.json`, `firestore.rules`, `firebase-applet-config.json` | Sin cambios (ya apuntaban a la base con nombre). |

### Pruebas adaptadas (de «intérprete del texto de storage.rules» a «autorizador real del servidor»)
`tests/helpers/autorizacionDocumentalHarness.ts` (nuevo, misma forma de petición que los harness antiguos; `list` siempre denegado; portal con token),
`tests/seguridad-storage-documentos.test.ts`, `tests/seguridad-storage-d3.test.ts`, `tests/roadmap03-delegacion-alcance.test.ts`,
`tests/roadmap04-storage-contratos-parciales.test.ts`, `tests/p3-trazabilidad-documental.test.ts`, `tests/morosidad-evidencias-storage.test.ts`,
`tests/ficha-publica-inmueble.test.ts`, `tests/gestor-documental-patrimonial.test.ts`, `tests/gestor-documental-patrimonial-firebase.test.ts`,
`src/test/e/setupE.ts`, `tests/custodia-documental-fail-closed.test.ts` (reescrito sobre el motor real con servidor y Storage sintéticos),
`tests/custodia-topologia-firestore-storage.test.ts` (reescrito: topología definitiva), `tests/f3-google-backend.test.ts`,
`tests/ia-fase1-registro-firestore.test.ts` (`(default)` pasa a ser entrada rechazada), `tests/ia-fase1-integracion-server.test.ts` (inventario de ficheros del servidor).

### Pruebas de emulador (no ejecutables en este entorno — ver §7)
`tests/emulador/storage-ambitos.emulador.test.ts` (reescrito para las reglas nuevas), `tests/emulador/documentos-servidor.emulador.test.ts` (nuevo: flujo mediado contra Auth + Firestore con nombre + Storage del emulador), `tests/emulador/documentos-p3.emulador.test.ts` (marcado como supersedido: se detiene en voz alta con `P3_EMULADOR_SUPERSEDIDA_AG03_2`).

---

## 3. Arquitectura final de autorización y almacenamiento

### 3.1 Por qué no bastaba cambiar la base
Las reglas de Cloud Storage sólo pueden consultar la base Firestore `(default)` del proyecto (documentación «Storage Security Rules › Enhance with Cloud Firestore», sección *enhance_with_firestore*; máximo dos lecturas por evaluación). La aplicación opera sobre una base con nombre, que las reglas no pueden ver. Sustituir mecánicamente `(default)` por el identificador con nombre dentro de `storage.rules` no es una sintaxis admitida; replicar datos a `(default)` está prohibido por la orden. Por tanto la autorización documental se ha sacado de las reglas y se ha llevado al servidor, que sí lee la base con nombre.

### 3.2 Flujo de subida (navegador → servidor → Cloud Storage)
1. `POST /api/documentos/subidas` con el ID token de Firebase (`Authorization: Bearer`) y `{storagePath, contentType, tamanoBytes, customMetadata?}`.
   El servidor: verifica el token (identidad), resuelve el destino por ruta (rutas fuera de catálogo o con segmentos inseguros ⇒ 403), valida tipo/tamaño del destino (⇒ 400/413), lee en la base con nombre el ámbito del actor (espejo `usuarios_auth/{uid}` ACTIVO, ficha `usuarios`, inmueble/contrato/cartera/delegación/solicitud/metadatos P3-P5 según destino) y decide. Si el objeto ya existe: idéntico (huella `sha256` declarada + tamaño + tipo) ⇒ `YA_EXISTE` sin reenviar; distinto en destino no sobrescribible ⇒ 409 `OBJETO_EXISTENTE`.
   Autorizado ⇒ abre una **sesión reanudable** en la JSON API de Cloud Storage con la cuenta de servicio, fijando nombre, tipo, `custodia_origen=servidor-ag03`, `custodia_uid` y un token de descarga aleatorio, y enviando el `Origin` del navegador (necesario para que el `PUT` posterior reciba cabeceras CORS). Devuelve `{estado:'SESION', sesionUri}`.
2. El navegador hace **un solo `PUT`** de los bytes a `sesionUri` (la URI es una capacidad de escritura acotada a ese único nombre de objeto; no se entregan credenciales de la cuenta de servicio). Plazo máximo con cancelación real (`AbortController`).
3. `POST /api/documentos/subidas/confirmar`: el servidor lee los metadatos REALES del objeto, vuelve a autorizar `CREAR` con ellos (tamaño, tipo, coherencia con metadatos P3/P5) y sólo entonces responde éxito con `{metadatos, url?}`. Si el objeto no respeta el destino lo elimina — únicamente si lo marcó este servidor para este mismo actor (`propio`); un objeto ajeno nunca se borra por esta vía (`OBJETO_AJENO`). Si no hay objeto ⇒ `OBJETO_INCOMPLETO`.
   El cliente no declara éxito sin confirmación ni sin URL (AG-04).

Portal de candidatos (sin sesión): `/api/documentos/publico/subidas` y `/confirmar` con `{solicitudDocId, token}`; el token se compara con `solicitudes_documentacion` en la base con nombre; sólo el destino `documentos_solicitados/{solicitud}/{fichero}` (ruta plana).

### 3.3 Lectura y borrado
- `POST /api/documentos/acceso` ⇒ autoriza `LEER` y devuelve la URL de descarga con token (`firebasestorage.googleapis.com/v0/b/{bucket}/o/{ruta}?alt=media&token=…`), rotando el token en los destinos P3/P5 (patrimoniales/profesionales). El navegador descarga directamente de Storage (sin pasar los bytes por Vercel, cuyo límite de cuerpo es 4,5 MB).
- `POST /api/documentos/borrar` ⇒ autoriza `BORRAR` y elimina (`BORRADO` | `NO_EXISTE`).
- No existe operación de enumeración (`list`) en la API; ningún código del repositorio usa `listAll`.

### 3.4 Qué comprueba el servidor en cada petición (requisitos de la orden)
identidad (ID token válido) · permisos actuales en la base con nombre (lectura fresca por petición; sin caché entre peticiones) · relación usuario↔titular/inmueble/contrato/documento · aislamiento propietarios/gestores (titular, cartera L sólo lectura, cartera E escritura, delegación parcial por `gestiones_cartera` con responsable vigente) · revocaciones (espejo o ficha no ACTIVA ⇒ denegado) · IDs manipulados (rutas fuera de patrón, segmentos `..`/vacíos, `sin_asignar`, nombres de objeto no coincidentes) · tipo/tamaño/destino · descargas y borrados con la misma matriz · traza sin datos sensibles. Prohibiciones respetadas: sin acceso anónimo por reglas (salvo el `get` del catálogo, decisión R3 previa), sin «cualquier autenticado», sin lista de correos: el master se reconoce por identidad verificada del ID token (`EMAIL_MASTER`) y, además, sigue existiendo el perfil `ADMINISTRADOR` por ficha veraz.

### 3.5 Lo que se descartó y por qué
- Servir bytes a través del servidor: límite de 4,5 MB por cuerpo en funciones de Vercel.
- URLs firmadas V4 (API XML): dependen de la configuración CORS del bucket, no verificable desde aquí; la JSON API (`/upload/storage/v1/`) y las URLs con token de Firebase sí sirven CORS.
- «Trucos» en reglas, tickets HMAC, colección de estado de subidas en Firestore: complejidad sin ventaja frente a la confirmación sin estado contra el objeto real.

---

## 4. Confirmación: la base con nombre es la única base

- Cliente: `src/lib/firebase.ts` → `getFirestore(app, firestoreDbId)`; si `firestoreDatabaseId` falta o no es un identificador con nombre, lanza `FIREBASE_BASE_DATOS_AUSENTE` (no hay rama que seleccione `(default)`).
- Servidor: `ClienteFirestoreRest` exige `baseDatosId` con nombre (`FIRESTORE_BASE_DATOS_REQUERIDA`); las tres construcciones (`server/ia/configuracionIA.ts`, `server/titularidades/backendTitulares.ts`) parten de `configuracionFirebase.ts`, que valida `firestoreDatabaseId` y su coherencia con `FIRESTORE_DATABASE_ID`.
- `entornoFirebase.ts` no ofrece ningún valor de respaldo.
- `firebase.json` publica `firestore.rules` únicamente en la base con nombre.
- `storage.rules` no referencia ninguna base.
- Prueba: `tests/custodia-topologia-firestore-storage.test.ts` (18 pruebas) fija todo lo anterior y además ejecuta el autorizador real: con el espejo en la base con nombre el titular opera; sin ficha, denegado; master pasa en ambos casos (por eso el fallo era invisible desde la cuenta maestra); revocación fresca; `sin_asignar` denegado incluso al master.

### 4.1 Búsqueda de `(default)` en el repositorio (fuera de `docs/`)
Comando: `grep -rn "(default)" --include=*.ts,*.tsx,*.mts,*.js,*.mjs,*.json,*.rules .` (sin `node_modules`, `dist`, `docs`).

| Ocurrencia | Clasificación |
| --- | --- |
| `server/titularidades/googleBackend.ts:480`, `server/documentos/autorizacionDocumental.ts:5`, `src/lib/custodiaDocumental/almacenServidor.ts:5,9`, `src/lib/firebase.ts:139`, `storage.rules:11` | Comentarios explicativos (inertes). |
| `tests/ia-fase1-registro-firestore.test.ts:175`, `tests/firebase-configuracion-estricta.test.ts:34,43,92,164` | Entrada NEGATIVA de prueba: se exige que el sistema la rechace. |
| `tests/f3-google-backend.test.ts:258,275` | Nombre de documento devuelto por un doble de Firestore REST (dato de prueba, no selector). |
| `tests/harness/storageRulesEval.ts:86-87`, `tests/helpers/evaluadorReglasStorage.ts:84`, `tests/helpers/evaluadorReglasFirestore.ts:607` | Intérpretes de reglas de prueba (reescritura de literal / valor por defecto del parámetro `database` en el intérprete de `firestore.rules`, donde `{database}` es un comodín legítimo). Inertes para la aplicación. |
| `tests/emulador/*.ts`, `tests/*.test.ts` (cabeceras), `tests/helpers/autorizacionDocumentalHarness.ts:6` | Comentarios/históricos de prueba. |
| `src/features/operaciones/tests/emulator/operaciones.emulator.mjs:18,55` | Script de emulador del módulo «operaciones» con proyecto demo aislado (`demo-operaciones-c`) y SDK apuntado al emulador; no es código de la aplicación ni selecciona base para ella. Se conserva tal cual (fuera del alcance AG-03; se deja constancia). |
| `docs/**` | Evidencia histórica conservada deliberadamente. |

Comprobación automatizada: `tests/custodia-topologia-firestore-storage.test.ts` falla si aparece `(default)` fuera de comentarios en `src/`, `server/`, `server.ts` o `scripts/`, o si hay un `getFirestore(` sin base.

---

## 5. Resultados exactos

| Comprobación | Resultado |
| --- | --- |
| `npx tsc --noEmit -p .` | **0 errores** |
| `npm run build` | **OK** (`✓ built in 16.22s`; aviso habitual de tamaño de chunk, preexistente) |
| `npx vitest run` (suite completa, ejecución final) | **268 ficheros, 4806 pruebas pasadas, 0 fallos**, 2 omitidas y 7 `todo` preexistentes (línea base de la auditoría: 4698/4705; ejecución 1 de esta orden, antes de adaptar pruebas: 13 ficheros / 75 fallos) |
| Guardia A-04 (`tests/guardia-a04-rama-sesion.test.ts`) | **OK** dentro de la suite |
| Pruebas focales | `custodia-documental-fail-closed` 25/25 · `custodia-topologia-firestore-storage` 18/18 · `almacenServidor.test` 14/14 · `almacenGoogleStorage.test` 9/9 · `autorizacionDocumental.test` 24/24 · `servicioDocumentos.test` 21/21 · `seguridad-storage-documentos` 38/38 · `seguridad-storage-d3` 23/23 · `roadmap03` + `roadmap04` 15/15 · `p3-trazabilidad-documental` 24/24 · `morosidad-evidencias-storage` 20/20 · `ficha-publica-inmueble` + `gestor-documental-patrimonial` 36/36 · `gestor-documental-patrimonial-firebase` + `bloqueE.servicios` 38/38 |
| Reglas | `storage.rules`: estructura verificada por pruebas (cero consultas a Firestore, única concesión `get` del catálogo, comodín final de denegación). `firestore.rules`: sin cambios; sus pruebas siguen en verde. **No publicadas** (ver §8). |
| Emulador (`npm run test:emulador:reglas`) | **No ejecutado en este entorno** (sin Java/Firebase CLI, por restricción explícita). Suites preparadas: `storage-ambitos` (reglas nuevas), `documentos-servidor` (flujo mediado). Estado: V — pendiente de ejecución. |

Correspondencia con los puntos de prueba exigidos por la orden (U = unitario con dobles, E = emulador preparado/no ejecutado, R = aceptación real pendiente):
(1) toda la app selecciona la base con nombre — U (`custodia-topologia…` §1) · (2) ningún flujo depende de datos de autorización en `(default)` — U (`storage.rules` sin consultas; autorizador sobre puerto único) + E (`documentos-servidor` comprueba `(default)` vacía) · (3) propietario sólo sobre lo suyo — U (`seguridad-storage-documentos`, `d3`) + E · (4) gestor sólo sobre lo asignado — U (`roadmap03/04`, `d3`) + E · (5) no autorizado denegado — U + E · (6) revocación bloquea — U (`custodia-topologia` 4e, `seguridad-storage-documentos`) + E · (7) admin conserva permisos sin enmascarar fallos — U (4c) + E · (8) subida/lectura/descarga/borrado autorizados en todos los puntos de entrada — U (`servicioDocumentos.test`: rutas; `almacenServidor.test`: cliente) · (9) archivos grandes — U (validación previa cliente + 413 servidor; bytes nunca pasan por Vercel) + E · (10) sin falso éxito/pérdida silenciosa/respaldo temporal — U (`custodia-documental-fail-closed`, `almacenServidor.test`) · (11) P2, P3, P5, P6 compatibles — U (suites existentes en verde; P2 no toca el módulo nuevo) · (12) sin regresiones — tsc/build/suite completa arriba · **R: pendiente en todos los puntos** (ver §8).

---

## 6. AG-04 (fail-closed) y datos existentes

- Ningún resultado de éxito sin objeto confirmado por el servidor y URL disponible; sin respaldo en memoria ni data-URL en el módulo nuevo (prueba D4 de `custodia-documental-fail-closed`).
- Reintentos: el mismo contenido (huella declarada) devuelve `YA_EXISTE` sin duplicar objeto; los `upload*` legados generan rutas con marca temporal, por lo que un reintento tras fallo no colisiona ni duplica registros (el registro se escribe sólo tras el éxito, como hasta ahora).
- Referencias y metadatos existentes: los `storagePath` guardados siguen siendo válidos (mismo bucket, mismas rutas); las URLs con token ya persistidas siguen funcionando (son capacidades fuera de las reglas, igual que antes — límite R-4 conocido).
- No se borra ningún fichero ni historial. Objetos huérfanos de subidas no confirmadas pueden quedar en el bucket (quedan marcados con `custodia_uid`; una regla de ciclo de vida del bucket es decisión de aceptación, no se ha configurado).
- Referencias heredadas `server_*`/`local_*` (ORDEN 1): siguen sin binario recuperable; `esReferenciaSinCustodia` evita tratarlas como custodiadas. No se afirma recuperación alguna.
- Fuera de alcance (preexistente, no tocado): respaldos a data-URL en reformas, adjuntos de incidencias, presupuestos, trabajos e inventario local; se dejan constancia para una orden específica.

---

## 7. Límites conocidos

1. **CORS del `PUT` a la sesión reanudable** desde el navegador: la documentación de Google indica que la JSON API responde CORS siempre y que la sesión hereda el `Origin` de la petición inicial (que el servidor envía). No se ha podido ejecutar un navegador real contra Cloud Storage desde aquí: **V**.
2. **Emulador**: `firebase-tools@15.33.0` registra `PATCH` de metadatos sólo en `/b/{bucket}/o/{objeto}` (no bajo `/storage/v1/`), por lo que en el emulador la rotación de token (P3/P5) no se ejercita; en producción la JSON API sí acepta `/storage/v1/`. La suite `documentos-servidor.emulador` cubre destinos sin rotación.
3. `tests/emulador/documentos-p3.emulador.test.ts` describe la custodia por SDK anterior; se detiene en voz alta hasta su re-adaptación (servidor en proceso + token activo por sesión). No se ha omitido en silencio.
4. Las URLs con token siguen siendo capacidades: quien tenga una URL puede descargar hasta que el token rote (P3/P5 rotan en cada acceso; el resto conserva el token emitido).
5. Sin credencial de servicio o bucket configurados el servidor responde 503 y la app muestra error de custodia: es el comportamiento deseado (no hay respaldo), pero hay que tenerlo presente en el despliegue.

---

## 8. Pasos de aceptación pendientes (fuera de este entorno) y cómo validar SIN la cuenta de administración

Nada de lo siguiente se ha ejecutado (prohibido por la orden hasta presentar resultados):

1. **Emuladores** (local o CI): `npm run test:emulador:reglas`. Esperado: `storage-ambitos` y `documentos-servidor` en verde; `documentos-p3` se detiene con `P3_EMULADOR_SUPERSEDIDA_AG03_2` (documentado). Si algo falla, no publicar.
2. **Despliegue de prueba del servidor** (preview de Vercel de esta rama) con `FIREBASE_SERVICE_ACCOUNT*` y el `storageBucket` ya configurados. Sin ellos, `/api/documentos/*` responde 503.
3. **Publicar `storage.rules`** (`firebase deploy --only storage --project <proyecto>`) — es el único cambio de reglas; `firestore.rules` no cambia. Hasta publicarlas, las reglas antiguas (con `firestore.get` a `(default)`) siguen activas y el SDK del cliente ya no se usa, de modo que la app funciona igual antes y después de publicar; publicar cierra la vía directa del SDK.
4. **Validación con una cuenta normal (no la maestra)** — imprescindible, porque el fallo original era invisible desde la cuenta maestra:
   1. Iniciar sesión con una cuenta de **propietario** real (ficha `usuarios` ACTIVA y espejo `usuarios_auth` con `propietarioId`).
   2. Gastos → nuevo gasto → adjuntar factura PDF (≈ 2–10 MB). Esperado: mensaje de éxito; en Firestore (base con nombre) el gasto tiene `storagePath = gastos_facturas/{propietarioId}/…`; el documento se abre desde la app.
   3. Repetir el paso 2 con una imagen > 12 MB. Esperado: error claro de tamaño; ningún objeto creado.
   4. Con una **segunda cuenta de propietario** sin relación: intentar abrir la URL de `acceso` del documento anterior (p. ej. desde la ficha de otro titular, o llamando a `POST /api/documentos/acceso` con su ID token y el `storagePath` del paso 2). Esperado: 403 `SIN_PERMISO`.
   5. Con una cuenta de **gestor con cartera E** del primer propietario: subir una factura al gasto del paso 2 y abrirla. Esperado: éxito. Con cartera **L**: abrir sí, subir no.
   6. **Revocación**: poner `estado` del espejo del gestor en `BLOQUEADO` (operación administrativa habitual) y repetir el paso 5. Esperado: 403 en la siguiente operación, sin reiniciar nada.
   7. **Portal de candidatos** (sin sesión): abrir el enlace de una solicitud de documentación y subir un DNI. Esperado: éxito; el titular del inmueble lo ve en la solicitud; un enlace con token alterado falla.
   8. Comprobar en los registros del servidor las líneas `[documentos] {…}` (operación, resultado, destino, carpeta, actor, motivo) sin datos sensibles.
   9. Sólo al final, con la cuenta maestra, verificar que sigue viendo y operando todo — nunca al principio.
5. Decidir (no implementado) una regla de ciclo de vida del bucket para objetos de subidas no confirmadas.

---

## 9. Confirmaciones explícitas

- No se ha migrado, creado ni replicado ningún dato ni estructura en `(default)`; no se ha borrado ni modificado esa base ni sus permisos.
- No se ha borrado ni sobrescrito ningún dato existente; no se ha escrito en producción (todas las pruebas son locales con dobles; las de emulador no se han ejecutado).
- No se ha publicado ninguna regla ni se ha desplegado nada.
- No se ha abierto PR ni se ha tocado `main`; todo el trabajo está en `arena/8ed3381d-gestor-de-inmuebles-vercel` y se empuja a `origin` en esa misma rama.
- No se ha tocado nada de banca/PSD2/pagos ni decisiones P1–P7 cerradas.

## 10. Estado de AG-03

Según el criterio de cierre de la orden, AG-03 queda **resuelto en código y demostrado en unitario** (toda operación Firestore usa la base con nombre; Storage funciona con una arquitectura compatible y segura; los flujos documentales pasan sus pruebas con cuentas normales simuladas), y **pendiente de aceptación real**: emuladores, publicación de `storage.rules`, despliegue del servidor y la validación con cuentas normales descrita en §8. Hasta completar esos pasos no debe declararse cerrado en producción.

## Commits de esta orden
- `72a2c6f` — feat(AG-03.2): custodia documental autorizada en servidor sobre la base Firestore con nombre; storage.rules sin consultas a Firestore (42 ficheros).
- Commit siguiente — docs: registro del SHA anterior en este informe (sólo documentación).
