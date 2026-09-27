# Arena C — rediseño estructural de Rules de Operaciones

## Estado vigente y alcance de la certificación

**Código reestructurado con validación local; pendiente de certificación nativa del Emulator.**

**EMULATOR: NO EJECUTADO — infraestructura/cuota no disponible.** Por orden expresa de este bloque no se ha intentado descargar el JAR, instalar herramientas de Emulator ni arrancar Auth/Firestore. Los tests de barrera anti-producción solo prueban el rechazo previo a conectar. No certificamos el límite de 1.000 expresiones, el presupuesto de accesos, compilación de Rules ni permisos/transacciones del servicio real.

Rama exclusiva: `arena/01a0dd70-gestor-alquileres-vercel`. Base: `95a083bae3eac2091b827c3eeeba18823b6bb4e9`. Se preservaron los cuatro cambios anteriores, incluidos sus escenarios nativos no ejecutados. Ante otra discrepancia de metadatos (HEAD e7798d3), se respaldaron y compararon los 143 archivos: 139 idénticos al checkpoint y exactamente los cuatro cambios esperados; solo después se alinearon índice/ref sin reescribir contenidos. El diff inicial coincide con SHA-256 `4e2b24654127bbcbc26cecab088208f6c4e53c7a38bdcddb5144c2f1440b4a1d`.

La orden actual autoriza commit/push tras tests locales, TSC, build y revisión de seguridad; sustituye la antigua puerta de commit condicionada a ejecución nativa. **No autoriza despliegue ni integración en B/main.**

## Causa estructural identificada

En 95a083b, cabecera y entidad invocaban el evento completo, con autorización y validadores de negocio repetidos. La candidata conservada ya había separado cabecera/entidad y reutilizado `resource.data`, campos y diferencias, pero mantenía:

- `opEscritura → opProyeccionValida / ownsPropietario / carterasEscritura`: múltiples llamadas transitivas a `me()` sobre el mismo espejo.
- `opRelaciones → opVinculo → opRef → get(opEntidad(...))`, seguido de nuevas consultas de las mismas referencias en `opEconomia`, `opInvariantes` y `opCambio`.
- Presupuesto consultado para ámbito, proveedor, incidencia/avería/reparación y aprobación; reparación consultada para ámbito, incidencia, avería y proveedor; contrato consultado dos veces.
- Incidencia comprobada otra vez al validar la avería; proveedor validado de nuevo en economía después de relaciones.
- `opCampos` construía las nueve listas para seleccionar una; `opDestinos` construía los seis grafos de estados para seleccionar una transición.
- Delta de actuaciones abiertas calculado dos veces para los contadores.

No había recursión intencionada: la explosión era expansión/repetición de árboles de evaluación. El caché de documentos no implica memoización de expresiones. El diagnóstico es de fuente; no es una medición del evaluador nativo.

## Arquitectura aplicada

### 1. Autorización previa y espejo único

`opAcceso(p,c,escritura)` recibe el espejo ya leído, obtiene L/E una vez y verifica listas, E⊆L, ACTIVO, titular PROPIETARIO o pertenencia a la cartera correcta. No obtiene roles del frontend ni usa `usuarios/{uid}` como fallback.

Lecturas: `opLectura` conserva master canónico o usuario autenticado con acceso contextual. Cabecera: `opEscritura` antes de validar estructura. Entidad: `isSignedIn → opFilaAutorizada`, que obtiene `me()` una sola vez, resuelve master/acceso E, comprueba wrapper/clave y pasa **el usuarioId del espejo**, no del payload, hasta el envelope auditado.

Los diez helpers canónicos originales permanecen intactos para sus otros llamadores. Se compararon con **B c4949a62fb13bde3aeff74a213f2a2cd40e5305c**: idénticos; también su ACL de audit_logs. La diferencia deliberada es la composición operativa: consume una instantánea de esas mismas fuentes en lugar de encadenar helpers que las releen. La fórmula pura tiene una comparación local de 1.344 combinaciones con el adaptador canónico; no es un intérprete ni una prueba nativa de Rules.

### 2. Cabecera: integridad, CAS, contadores y presupuesto vinculado

`opCabeceraValida` rechaza schema/propietario/revisión incorrectos antes de lecturas cruzadas. `opCabeceraEnlazada` obtiene una vez audit posterior, entidad anterior/posterior, exige incremento observable de versión y verifica los contadores con un único delta de abiertas reutilizado.

La cabecera asume **solo la referencia de presupuesto**, mediante `opPresupuestoEnlazado → opPresupuesto`: ámbito, proveedor, vínculo de incidencia/avería/reparación y aprobación cuando la reparación está EN_CURSO/FINALIZADA. Son los predicados que antes se repartían entre relaciones/economía/invariantes; no se eliminan. ANOTAR/VINCULAR_DOCUMENTO conservan su exclusión previa de esas comprobaciones de negocio. El audit que identifica esa exclusión está ligado al comando por la validación obligatoria de entidad.

Esta distribución evita añadir presupuesto a las cuatro referencias máximas de negocio del lado entidad. No supone cambiar documentos ni confiar en un backend nuevo.

### 3. Entidad: envelope único, esquema/comando y referencias materializadas

`opFilaValida` exige incremento de cabecera y audit inexistente antes del commit. Es el único llamador de `opEventoValido`, que conserva íntegros actor, email, usuarioId, timestamp servidor, IDs, revisión esperada, scope, prefijo append-only y coincidencia de versión/registro/comando. La fila anterior viene de `resource.data`, no de una relectura.

Después de envelope, titularidad actual, esquema y comando, `opDominio` obtiene `opReferencias` una sola vez. Sus referencias se derivan exclusivamente de paths bajo el propietario y IDs validados; **nunca de un objeto de referencias aportado por el cliente**. `opRelaciones`, `opVinculo`, `opCambio`, `opInvariantes` y `opEconomia` reciben esos datos y no hacen I/O, ni directo ni transitivo. Se mantienen las lecturas del estado ANTERIOR de proveedores, equipos, garantías, incidencias, averías, reparaciones, contratos e inquilinos; no se sustituyen por valores futuros manipulables en el mismo batch.

ANOTAR no carga referencias de negocio. VINCULAR_DOCUMENTO carga únicamente el nuevo documento. En el resto de comandos cada referencia presente tiene una única consulta en el cargador. Las listas de campos y las tablas de transición se seleccionan por tipo mediante ramas, conservando exactamente sus valores. Se mantienen todos los controles por concepto, suma exacta, enteros seguros y máximo diez conceptos.

### 4. Prueba de acoplamiento y ausencia de traslado al cliente

La cabecera exige que la versión de la entidad apuntada por su audit aumente respecto a la anterior: esa entidad necesariamente se escribe y ejecuta su allow. La entidad exige que la revisión de cabecera aumente y que su último evento sea el suyo: la cabecera necesariamente se escribe y ejecuta su allow, incluidos contadores y presupuesto. Audit inexistente antes/existente después, mismo timestamp y envelope, impide reutilizar una entrada precreada. Se validan todos los documentos del commit; no se presupone la integridad histórica para sustituir estos testigos.

El único control derivado retirado es la repetición del ámbito del proveedor dentro de economía: economía exige que exista `proveedorId` y `opDominio` exige antes `opRelaciones`, que valida esa misma referencia. Las guardas comprueban esta ruta. Los controles del presupuesto se redistribuyen, no se descartan.

**No se traslada ninguna garantía a cliente/servidor.** El transporte existente utiliza transacciones del SDK cliente, no un servidor de confianza que pueda reemplazar Rules. Se mantienen en Firestore los predicados de seguridad y negocio necesarios. No hay nuevo modelo, colección, servicio, migración ni cambio B→C.

## Complejidad: resultados estructurales, no cuotas nativas

| Medida de fuente | Candidata recibida | Rediseño |
| --- | --- | --- |
| Sitios `get()` en Ref/Vínculo/Relaciones/Economía/Invariantes/Cambio | 23 | 0, también transitivamente |
| Sitios de lectura del cargador de referencias | dispersos/repetidos | 9 ramas condicionales + 1 presupuesto en cabecera |
| Referencias de negocio activables por esquema en entidad | repetidas entre validadores | máximo 4; presupuesto solo en cabecera; ANOTAR 0 / VINCULAR 1 |
| Ocurrencias transitivas de `me()` en árbol sintáctico de `opEscritura` | 8 | 1 |
| Lectura de espejo en ruta de entidad + audit | separada/repetida | 1, propagando usuarioId |
| `opAbierta` en contadores | 4 llamadas | 2: una por snapshot |
| Construcción de tablas por selección | 9 tipos de campos / 6 grafos de estados | solo el tipo elegido |
| Profundidad de autorización | 5 helpers | 4 |

La ruta de entidad tiene cota estructural de siete helpers (antes seis desde `opFilaValida`); el nivel explícito de autorización/carga permite cortar antes de I/O y reutilizar datos, no introduce una nueva cascada de consultas. Todos los helpers tienen ≤7 parámetros y ≤10 `let`; el grafo no tiene ciclos. Estos números cuentan estructura de fuente, **no expresiones evaluadas, llamadas cobradas ni tiempos de Firestore**.

`exists/get` de la cabecera anterior y de la entidad anterior se conservan para distinguir creación/actualización y demostrar el incremento; `exists(auditPath)` se conserva para impedir audit precreado. Los `getAfter` mantienen acoplamiento atómico. No se elimina una lectura necesaria por presumir un caché. Quedan por certificar nativamente límites de expresiones/accesos y todos los comportamientos del servicio.

## Revisión de seguridad local

| Garantía | Evidencia revisada |
| --- | --- |
| Lectura/escritura contextual | Ambas rutas operativas guardadas, mirror canónico, ACTIVO, titular/L/E, E⊆L; master solo por helper canónico |
| Revocación y aislamiento | Sin ACL cliente ni caché de permisos entre peticiones; paths bajo p, scopes de cada referencia comprobados |
| Ownership operativo | Propietario/ámbito y referencias estructurales inmutables; identidad de registro y clave deben coincidir; titularidad actual del inmueble sigue comprobándose |
| CAS, contadores, cabecera-entidad | Incrementos cruzados, revisión esperada, contadores derivados del antes/después real; no basta getAfter/existencia |
| Esquema, comandos y transición | Custodia automática de predicados del checkpoint; todas las listas y transiciones contrastadas con el motor |
| Economía/invariantes | Suma y máximo diez, vínculos/proveedor/equipo, presupuesto aprobado, cierres sin pendientes, fechas/resultado/coste conservados |
| Audit y versiones | Envelope y prefijo append-only conservados; audit nuevo enlazado; sin segunda auditoría |
| SDK directo | Guards residen en Rules, no frontend; wrapper no admite contexto de autorización/referencias; negativas nativas previas preservadas pero no ejecutadas |
| Idempotencia/rollback | Transporte y versiones de negocio intactos; acoplamiento requerido por Rules; pruebas locales de repositorio, no certificación de Firestore |

La ACL canónica de `audit_logs` sigue siendo create autenticado, read master, update/delete false incluso master. Una entrada standalone autenticada sigue permitida por B y **no concede una operación**; no se afirma una prohibición global de crear entradas fabricadas que el contrato no contiene. Binding, ACL de audit y todos los matches legacy ajenos permanecen byte a byte como en 95a083b; esto no es una auditoría global de esos módulos.

## Validación local y custodia

Se mantienen los 364 tests anteriores, adaptando las guardas de forma a las firmas y reparto nuevos sin quitar sus obligaciones. Se añaden **18 tests de arquitectura**: pureza transitiva/I/O, ciclos/profundidad/aridad, llamada única, carga condicional, ramas, deltas, 1.344 combinaciones de autorización, mutaciones de controles, presupuesto distribuido, custodias de schema/comandos/cambios/envelope y rutas SDK cerradas. Los tests nativos heredados permanecen intactos, no se sustituyen por un harness.

Resultados ejecutados en este bloque (0 fallos, 0 skips):

| Comprobación | Resultado |
| --- | --- |
| Suite completa | **382/382 PASS** |
| Operaciones | **295/295 PASS** |
| Operaciones originales | **156/156 PASS** |
| Seguridad/identidad/auditoría/persistencia/Rules (subconjunto solapado) | **149/149 PASS** |
| Patrimonial | **87/87 PASS** |
| TypeScript `npm run lint` | **exit 0** |
| Build `npm run build` | **exit 0**; aviso existente de chunk >500 kB (JS 1.998,80 kB; gzip 479,09 kB) |
| `git diff --check` | **PASS** |
| Emulator | **NO EJECUTADO — infraestructura/cuota no disponible** |

El único commit autorizado de este bloque es `fix(operaciones): redesign firestore rules to avoid expression limit`, con padre 95a083b, solo a la rama C. La revisión de fuente no detecta controles perdidos: no sustituye la certificación nativa pendiente. No hay skip permitido para ocultar un fallo. Los artefactos/logs de trabajo quedan fuera del repositorio; dependencias instaladas sin modificar package.json ni lockfiles. No se arranca App ni servidor productivo, no se toca B/main, Patrimonial ni otros motores.

---

# Archivo histórico — intentos anteriores (no representan el estado vigente)

# Arena C — límite de evaluación de Rules (2026-09-27)

## Estado vigente: corrección candidata, validación nativa bloqueada

**ROJO — NO APTO PARA INTEGRACIÓN B→MAIN. Sin commit de cierre ni push de esta corrección.**

Base verificada: `95a083bae3eac2091b827c3eeeba18823b6bb4e9`, padre `0948bd9b7f96453583768524361599b38b511817`. Rama exclusiva `arena/01a0dd70-gestor-alquileres-vercel`. Ante la discrepancia de metadatos local (HEAD e7798d3), se compararon los **143 archivos**, sin diferencias ni extras, con el checkpoint remoto antes de alinear únicamente índice/ref. Árbol limpio en 95a083b antes de editar. No reset/clean ni recuperación de otro trabajo.

El usuario aportó evidencia externa de ejecución real del checkpoint: varias comprobaciones de identidad/permisos/auditoría/rollback aprobadas y operaciones completas rechazadas por **máximo de 1.000 expresiones**. Esa evidencia no es una ejecución realizada aquí y no valida los cambios actuales.

### Diagnóstico y reparto de responsabilidades

Inspeccionado el bloque operativo completo y sus llamadas transitivas. El grafo anterior ejecutaba `opEventoValido` tanto desde cabecera como desde entidad. Cada evaluación repetía autorización y el árbol de esquema/comando/cambio/relaciones/invariantes/economía; la cabecera además reconstruía repetidamente auditoría/fila/delta. El caché de lecturas no debe confundirse con memoización de expresiones de funciones. Esta duplicación es el objetivo de la corrección; **no se ha medido aquí el número de expresiones posterior ni se acredita que ya esté por debajo de 1.000**.

| Responsabilidad | Funciones revisadas y tratamiento |
| --- | --- |
| Identidad, titular/master, L/E, ACTIVO y E⊆L | Helpers canónicos, `opLectura`, `opEscritura`, `opProyeccionValida`: intactos. Autorización explícita en ambas entradas de escritura; se elimina solo su repetición interior en el evento. Diez helpers contrastados de nuevo con B `c4949a62fb13bde3aeff74a213f2a2cd40e5305c`, idénticos. |
| Titularidad actual y aislamiento de referencias | `opActual` carga una vez el inmueble. `opEntidad`, `opRef`, `opRefOpcional`, `opVinculo`, `opRelaciones`: intactos; conservan ámbito, proveedor, incidencia/avería/reparación, equipo/garantía, contrato e inquilino. No se presume que una referencia implique autorización. |
| Estructura y finanzas | `opCampos` se obtiene una vez y se pasa a `opEsquema`/`opComando`. `opTexto`, `opDinero`, `opConcepto`, `opImporte`, `opConceptos`: intactos; diez conceptos máximo, importe exacto y enteros seguros. No se trunca nada. |
| Comando, transición y anti-escalada | `opComando`/`opCambio` reutilizan el conjunto de diferencias calculado una vez; mismas restricciones de cambios, campos inmutables, estados, documentos y factura. `opInicial`/`opDestinos` intactos. |
| Invariantes/economía | `opInvariantes`/`opEconomia` íntegros: cierres pendientes, presupuesto aprobado/en uso, coherencia de proveedores/vínculos/equipos, resultado/coste/fechas. No se han eliminado comprobaciones para reducir coste. |
| CAS y contadores | Nueva `opCabeceraValida`: esquema, propietario, revisión +1, enlace de audit, incremento de versión de entidad y `opContadores`. `opContador`, `opContadores`, `opAbierta`, `opUso` intactos. Sustituye `opDelta`/`opFilaDespues`, reutilizando la fila anterior/posterior obtenida una sola vez. |
| Evento, versiones y auditoría | `opFilaValida` exige incremento real de cabecera y audit inexistente antes del commit. Único llamador de `opEventoValido`: conserva actor, usuario canónico, timestamp servidor, IDs, revisión esperada, prefijo append-only, ámbito y todos los validadores de negocio. Recibe la fila anterior de `resource.data` sin volver a consultarla. |

**Por qué no basta getAfter y cómo se conserva el acoplamiento:** la cabecera exige que la versión de la entidad referenciada aumente exactamente uno frente a su estado anterior. Por tanto esa entidad debe escribirse en el mismo commit y ejecutar su propio allow completo. A la inversa, la entidad exige que la revisión de la cabecera aumente uno y que `ultimoEventoId` sea su audit; obliga así a ejecutar el allow de cabecera, incluidos los contadores. El audit debe no existir antes y existir después, con timestamp de la petición y envelope enlazado. No se confía solo en existencia ni en integridad histórica presumida. Las Rules de todas las escrituras tienen que aprobar el commit atómico. **Es el diseño a validar con Emulator, no una certificación por análisis estático.**

La ACL canónica de `audit_logs` permanece sin cambios: create autenticado, lectura master, ninguna modificación/borrado. Las negativas de auditoría fabricada se refieren al envelope usado para autorizar una **operación**; crear una entrada autenticada aislada sigue permitido por B. Prohibir globalmente esa creación exigiría cambiar el contrato y queda fuera de este bloque.

### Pruebas añadidas y resultados realmente obtenidos

- Seis guardas estructurales nuevas (incluida mutación que elimina los testigos de atomicidad). Se adapta únicamente la firma esperada de `opComando` en una guarda anterior, sin quitar controles ni tests originales.
- Diecisiete escenarios nativos adicionales: falta de entidad, autoridad denegada por SDK directo (L, revocado, suspendido, ajeno, sin relación, E fuera de L), falta de binding sin fallback, cabecera sin cambio de entidad existente, audit precreado, segunda entidad encubierta y seis manipulaciones de audit operativo.
- Las negativas no aceptan un error explícito de límite de expresiones/accesos como evidencia de denegación de seguridad. Las nuevas negativas exigen `permission-denied` del SDK, no un rechazo local del repositorio.
- Se mantienen el recorrido real de 29 eventos, replay, CAS concurrente, rollback, versiones, diez/once conceptos y la matriz anterior. **Ninguno de estos casos nativos se ha ejecutado en este entorno.**

Se instalaron dependencias sin modificar manifests/lockfile y herramientas oficiales fuera del repositorio: Firebase CLI 14.22.0 y Java 21.0.8 (jdk4py 21.0.8.2). Se intentó `emulators:exec` antes y después del cambio, exclusivamente `demo-operaciones-c`, Auth 9099 y Firestore 8080 con `firebase.json` del repositorio. Ambos intentos fallaron antes de compilar Rules/ejecutar el runner:

```text
Error: Failed to make request to
https://storage.googleapis.com/firebase-preview-drop/emulator/cloud-firestore-emulator-v1.19.8.jar
```

Dos comprobaciones TLS al bucket oficial y su API oficial devolvieron `curl (35) SSL_ERROR_SYSCALL`. No se usó un sustituto de Emulator, ni producción, ni se arrancó App/servidor productivo. No procede repetir descargas indefinidamente ni atribuir a este intento el resultado externo aportado.

| Puerta | Resultado local actual |
| --- | --- |
| Rules compiladas / límite 1.000 / límite de accesos | **NO VALIDADO — infraestructura bloqueada** |
| Identidad / propietario / L / E / revocación / suspensión | **NO VALIDADO en Rules modificadas** |
| Cross-owner / master sin propagación de privilegios | **NO VALIDADO en Rules modificadas** |
| Audit / CAS / rollback / replay / atomicidad / negativas | **NO VALIDADO en Rules modificadas** |
| Regresión auxiliar completa | **364/364 PASS**, 0 fail / 0 skip; no sustituye la puerta nativa |
| Operaciones / originales / patrimonial (ejecuciones separadas) | **277/277**, **156/156**, **87/87 PASS**, sin omisiones |
| TypeScript (`npm run lint`) | **PASS**, exit 0 |
| Build (`npm run build`) | **PASS**, exit 0; aviso de chunk >500 kB: JS 1.998,80 kB, gzip 479,09 kB |

La primera ejecución auxiliar tuvo una aserción nueva mal invocada (`assert.throws`, argumento ambiguo en Node); se corrigió su firma y se repitió la suite completa: 364/364. No fue una denegación de Rules ni se ocultó una prueba. Los resultados auxiliares se obtuvieron después del intento nativo bloqueado, **no constituyen la regresión final posterior a éxito nativo exigida para cerrar**.

Queda pendiente disponer del JAR oficial en un entorno autorizado, compilar/ejecutar la suite nativa completa (incluidos presupuestos de expresiones y accesos), corregir cualquier fallo real y repetir regresión/TSC/build antes de considerar el único commit autorizado. No se cambia contrato, arquitectura patrimonial/operativa, paquetes, U.G./U.S., B ni main. HEAD permanece en el checkpoint; los cuatro archivos modificados quedan deliberadamente sin commit, a revisión, nunca listos para desplegar.

---

# Archivo histórico — adaptación canónica publicada en el checkpoint 95a083b

El contenido siguiente documenta etapas anteriores; sus estados de bloqueo/no-commit se refieren a esas etapas, no sustituyen el estado vigente descrito arriba. El checkpoint de custodia posterior sí se publicó como 95a083b, sin aprobación de integración.

# Arena C — adaptación canónica B (trabajo sobre 0948bd9)

## Estado de este bloque

**ADAPTACIÓN LOCAL IMPLEMENTADA; VALIDACIÓN REAL BLOQUEADA. NO COMMIT DE CIERRE NI PUSH.**

Base exacta: `0948bd9b7f96453583768524361599b38b511817`, padre `91ed07d6a49c29237cb3842e6e2e930f2762186a`. Rama exclusiva `arena/01a0dd70-gestor-alquileres-vercel`.

La custodia local estaba en `e7798d3` con dos archivos modificados y archivos sin seguimiento. Antes de tocar el índice se inventariaron todos: **137 archivos locales idénticos byte a byte a los blobs del commit publicado**, sin extras ni diferencias. Se recuperó únicamente índice/referencia de C mediante fetch explícito de su rama, `read-tree` sin `-u` y `update-ref` condicionado al HEAD anterior. No se borró ni reescribió ningún archivo. El árbol quedó limpio en 0948bd9 antes de implementar. Inventario de trabajo externo al repositorio: `/home/user/custodia-c-0948bd9.json`.

## Fuente B localizada y contrastada (solo lectura)

La consulta anterior devolvía 404 porque se hacía en el repositorio **C**. La fuente real está en **sarqsan/Gestor-de-inmuebles-vercel**, no en Gestor-alquileres-vercel:

- [Contrato canónico, fc14156](https://github.com/sarqsan/Gestor-de-inmuebles-vercel/blob/fc14156ff9eee24d34c587fdb1f087b192ef4dbf/docs/arquitectura/CONTRATO_CANONICO_AUTORIZACION_AUDITORIA_B_C.md), blob `239f0bec27db253aa6909861c6b70655a3b3aafe`.
- [Rules B](https://github.com/sarqsan/Gestor-de-inmuebles-vercel/blob/fc14156ff9eee24d34c587fdb1f087b192ef4dbf/firestore.rules): helpers de identidad/carteras/master y audit_logs.
- [authService.ts](https://github.com/sarqsan/Gestor-de-inmuebles-vercel/blob/fc14156ff9eee24d34c587fdb1f087b192ef4dbf/src/lib/authService.ts): `syncAuthIndex` y resolución por `mirrorData.usuarioId`.
- [types.ts](https://github.com/sarqsan/Gestor-de-inmuebles-vercel/blob/fc14156ff9eee24d34c587fdb1f087b192ef4dbf/src/types.ts#L1832): envelope `AuditLog`.
- [firebase.ts](https://github.com/sarqsan/Gestor-de-inmuebles-vercel/blob/fc14156ff9eee24d34c587fdb1f087b192ef4dbf/src/lib/firebase.ts#L2263): mecanismo `registrarAuditoriaFirestore(log)`.

También se compararon los diez helpers usados con la rama B en `94e11d6aaa6cc174b907067057e565adc3097321`: idénticos al contrato fc14156. Tests guardan huellas SHA-256 normalizadas de esos helpers, no una reinterpretación de sus privilegios. No se integra el árbol de B, no se escribe en B y no se modifican sus modelos ni contrato.

## Identidad y carteras

Binding verificado: **UID → usuarios_auth/{uid}.usuarioId → usuarios/{usuarioId} → propietario jurídico**. Funciona con UID igual o diferente de usuarioId. El perfil se consulta por el binding, nunca por un fallback a `usuarios/{uid}`; si falta binding/perfil, no hay adjudicación ni creación automática.

`carterasL/E` residen en **usuarios_auth**, no se toman del perfil. C no ejecuta `syncAuthIndex`, no crea gestiones y no escribe carteras, roles, usuarios ni binding. Sus rutas consumidoras son solo lectura; la administración/provisión canónica corresponde a B, no se sustituye desde C.

Los helpers canónicos conservados literalmente son `isSignedIn`, `authEmail`, `isMasterAdmin`, `me`, `activeUser`, `isPropietarioRole`, `myPropId`, `ownsPropietario`, `carterasLectura`, `carterasEscritura`. El titular exige cuenta ACTIVO y tipoPerfil PROPIETARIO; las carteras exigen estado de cuenta ACTIVO. E⊆L se comprueba adicionalmente como invariante del contrato. Un estado de **gestión** REVOCADA no se confunde con `estado` de la **cuenta**: el histórico lo expresa L con E retirado.

Master procede del email **autenticado por Firebase** previsto por `isMasterAdmin` de B; no del email de un formulario/perfil, ni roles/permisos UI. ADMINISTRADOR no obtiene bypass operativo por etiqueta: para este recurso se sigue el patrón aislado/carteras/master. No se añade `isStaff`.

La UI suscribe primero el espejo y después el perfil indicado por usuarioId, invalida callbacks antiguos y retira controles al cambiar el ámbito efectivo. El propietario se sigue seleccionando explícitamente. Un gestor profesional puede tener cero propietarios propios y gestionar varios titulares sin cuenta.

## Histórico de negocio e idempotencia SIN leer audit_logs

En 0948bd9 la carga consultaba audit_logs para reconstruir `EstadoOperaciones.historial`; eso era incompatible con lectura solo master. Se elimina esa consulta y su índice operativo.

Se conservan los mismos registros de negocio en `operaciones/{propietarioId}/entidades/{tipo}~{id}`. Cada fila conserva **versiones append-only del propio registro**, formadas únicamente por `ambito`, el `ComandoOperativo` existente y el `EntidadOperativa` resultante. El adaptador reconstruye los `EventoOperativo` del motor a partir de esas versiones; no cambia las nueve entidades, el motor, las transiciones ni la UI histórica.

Esto NO es otra colección/modelo de auditoría: no hay `AuditLog` dentro de las versiones, ni email/nombre administrativo, resultado de auditoría, descripción administrativa ni snapshot de `audit_logs`. Son las versiones originales del registro de negocio que el propietario/gestor puede consultar. El audit administrativo contiene solo referencia a operación, entidad y versión, no un segundo historial completo. Solo sigue existiendo **audit_logs**.

El replay busca el mismo comando/operacionId en el historial de negocio reconstruido. Repetir no escribe ni necesita leer auditoría; alterar el contenido del mismo ID falla. Revisiones discontinuas, duplicadas, versiones alteradas o desajuste con el registro vigente fallan explícitamente. Las filas antiguas sin versiones **no se migran automáticamente ni recurren a audit_logs**: si existiesen fuera de este entorno sin datos reales, requieren una adaptación de datos aprobada, no ejecutada aquí.

Se mantiene la cabecera CAS, contadores, IDs deterministas y tres escrituras atómicas. El SDK carga las filas de negocio, verifica revisión/titularidad antes de escribir y anexa la nueva versión. Las Rules verifican que el prefijo anterior de versiones permanezca íntegro y que la última versión coincida con comando, entidad, cabecera y referencia auditada. No hay actualización silenciosa de originales ni TTL.

## Auditoría canónica y compatibilidad de transporte

Única función: `registrarAuditoriaFirestore`, ahora con **envelope log-first canónico B**: `id`, `usuarioId`, `usuarioEmail`, `usuarioNombre`, `accion`, `descripcion`, `fechaHora`, `entidadAfectada`, `idAfectado`, `resultado`, `detalles`. `usuarioId` es el usuario de negocio resuelto, no se sustituye por UID. Detalles conserva el UID autenticado y referencia exacta a versión/operación. Se usa la entidad ya admitida por B `inmueble`; detalles identifica la entidad operativa concreta, sin ampliar el enum patrimonial.

La adaptación C recibe un puerto transaccional adicional en esa misma función para conservar su garantía de rollback. **No se ha cambiado la implementación best-effort de B ni se afirma que ya admita ese parámetro.** Al integrar código habrá que consolidar el transporte transaccional en el único mecanismo compartido; no mantener dos implementaciones. Es una diferencia explícita de integración de transporte, no otro tipo de auditoría ni apertura de sus lecturas. El registro automático de C añade timestamp servidor para comprobar el commit atómico.

Rules audit_logs conforme al código B: `create: isSignedIn()`, `read: isMasterAdmin()`, `update/delete: false` incluso para master. El create canónico permite entradas independientes autenticadas; no se inventa una restricción global del contrato B. La validez de una **operación de negocio C** sí exige que su cabecera/entidad enlacen el AuditLog correcto dentro del mismo commit. Una entrada audit aislada no autoriza una operación ni se usa para reconstruir negocio.

Se elimina también la concesión anterior a gestores E para crear titulares o editar su ficha fiscal: create del propietario solo titular/master y update de gestor restringido a `fichaPatrimonial` conforme S3. No se amplían transferencias, borrados ni titularidad. El resto de módulos legacy ajenos a operaciones no se presenta como una revisión global de seguridad de la aplicación.

## Pruebas y condiciones de ejecución real

Sin tocar `package.json`/`bun.lock`: dependencias declaradas instaladas con `npm install --no-package-lock --ignore-scripts`. Firebase CLI 14.22.0 en prefijo de herramientas externo; Java Temurin 21.0.8 mediante jdk4py 21.0.8.2 en caché externa. Se intentaron antes Adoptium/apt, bloqueados por conectividad. La instalación de herramientas no equivale a disponer del JAR de Firestore.

- Regresión Node: **358 pruebas aprobadas**, ninguna omitida. Incluye las 156 operativas originales y las 87 patrimoniales.
- TypeScript: `npm run lint` (`tsc --noEmit`) aprobado.
- Build Vite/esbuild aprobado. Aviso visible: bundle JS ~1,999 MB, gzip ~479 kB, superior a 500 kB.
- El harness de Rules sigue siendo estático, no compilador/emulador. Se actualizaron sus 14 casos para el contrato real; no se eliminaron las 156 originales.
- Se sustituyeron las assertions incompatibles que exigían leer audit_logs como negocio, usuario directo por UID o envelope anterior. Se mantuvieron los casos de persistencia, rollback y custodia.
- Nuevas pruebas de binding, estado de cuenta, carteras del espejo, master canónico, versiones de negocio y huellas de helpers B.
- Runner **real** preparado en `tests/emulator/operaciones.emulator.mjs`: Auth Emulator + Firestore Emulator + SDK nativo y Rules del repo. No usa dobles, reglas reinterpretadas, firebase-admin ni App. Solo permite `demo-operaciones-c` y endpoints locales fijos; dos tests ejecutan sus barreras anti-producción y verifican fallo antes de conectar.
- Configuración del emulador añade Auth 9099; Firestore 8080. Datos exclusivamente sintéticos; provisioning de fixtures por REST administrativo solo contra emulator localhost y proyecto demo.
- Casos reales definidos: UID=usuarioId y distinto; sin binding; titular/L/E/revocado/suspendido/sin relación/admin/master/anónimo; cross-owner; anti-autoasignación; no transferencia/borrado; auditoría create/read/update/delete; 29 operaciones, cierre y replay; CAS concurrente; versiones, contadores, referencias, payload y diez conceptos; rechazo parcial y rollback inyectado.

### Resultado real observado — BLOQUEO, NO VERDE

Se ejecutó Firebase CLI `emulators:exec --only firestore,auth --project demo-operaciones-c` con el archivo firebase.json de este repositorio y el runner real. La CLI reconoció el proyecto demo y trató de arrancar Auth/Firestore, pero **falló antes de ejecutar el runner** al descargar el binario oficial:

```
Error: Failed to make request to
https://storage.googleapis.com/firebase-preview-drop/emulator/cloud-firestore-emulator-v1.19.8.jar
```

La comprobación directa por curl también falla en TLS (`SSL_ERROR_SYSCALL`), incluido el hostname alternativo del bucket. No se usó un emulador de terceros ni se fabricó un JAR. Por tanto:

- **Rules reales: NO compiladas ni ejecutadas.** Límites de accesos/expresiones, sintaxis y comportamiento quedan sin acreditar.
- **Firestore real en Emulator: NO validado.** CAS/rollback/idempotencia solo tienen evidencia local con dobles, no real.
- **Auth Emulator: NO validado**, el runner no llegó a ejecutarse.
- **Storage: NO APLICA** al flujo; solo referencias de archivos, sin operaciones Storage ni nuevas Rules de Storage.
- No hay despliegue, producción, migración, seeds productivos ni datos reales.
- No procede commit/push de cierre: la condición «todo verde» no se cumple.

Comando reproducible cuando el entorno pueda obtener el JAR oficial (no es una ejecución declarada exitosa):

```bash
# CLI/Java instalados fuera del repositorio; ejecutar desde una carpeta de logs externa.
firebase emulators:exec --only firestore,auth --project demo-operaciones-c \
  --config /home/user/Gestor-alquileres-vercel/firebase.json --non-interactive \
  'node --experimental-strip-types --test --test-reporter=spec /home/user/Gestor-alquileres-vercel/src/features/operaciones/tests/emulator/operaciones.emulator.mjs'

# Regresión local separada de la prueba real:
node --experimental-strip-types --test src/features/operaciones/tests/*.test.mjs src/features/patrimonial/tests/*.test.mjs
npm run lint
npm run build
```

**Conclusión:** las dos divergencias tienen adaptación local y pruebas locales, pero NO se certifica cierre ni integración. Debe ejecutarse y corregirse la suite real antes de crear el único commit solicitado. El código de B no se ha modificado. Se conserva visible la diferencia de transporte transaccional frente a su logger best-effort y no se presenta como una integración ya realizada.

---

# Archivo documental — entrega 0948bd9 y etapas anteriores

**Las secciones siguientes son actas históricas. Sus referencias a binding provisional, 404, permisos de auditoría y resultados anteriores no describen la adaptación actual.**

# Arena C — operaciones de alquiler y mantenimiento

## Entrega histórica 0948bd9: persistencia y flujo contextual (Bloque 2)

Esta sección sustituye el alcance desconectado de la entrega `91ed07d`; el acta anterior se conserva al final como **histórico**, no como descripción de la implementación actual.

Base/padre requerido: `91ed07d6a49c29237cb3842e6e2e930f2762186a`. Rama exclusiva: `arena/01a0dd70-gestor-alquileres-vercel`. Custodia patrimonial `7657eea` conservada: otros 29 archivos idénticos; solo se amplía de forma comprobada la allowlist del test de aislamiento. No hay integración de código de B, migraciones ni cambios de dependencias/lockfile.

**VALIDACIÓN REAL FIREBASE — PENDIENTE BLOQUE 4**. Esta entrega implementa el adaptador real y las Rules, pero no acredita ejecución contra Firestore, compilación de Rules, despliegue ni navegador conectado a servicios reales. No se ejecutó App, servidor productivo, seeds, uploads ni escrituras de negocio. Build no significa despliegue.

### Contrato B→C y fuente efectiva de autorización

Fuente normativa: los principios aportados por el usuario del contrato `CONTRATO_CANONICO_AUTORIZACION_AUDITORIA_B_C.md`, referencia B `fc14156ff9eee24d34c587fdb1f087b192ef4dbf`. La consulta de solo lectura de ese objeto en este repositorio devolvió **404**: no se afirma haber recuperado su contenido, firma de servicio, ruta física de usuario ni excepciones administrativas.

Binding concreto del adaptador C: Firebase Auth aporta exclusivamente el UID; `usuarios/{uid}` aporta `propietarioId?`, `carterasL` y `carterasE`. Son atributos efectivos del **usuario de aplicación canónico**, no otro modelo persistente de permisos. C solo lee ese documento; sus Rules deniegan listarlo y crearlo/modificarlo/borrarlo desde clientes. No hay fallback a claims antiguos, perfil local, email, teléfono, `roles[]`, `permisos[]`, `activo` o `lastLoginAt`. Tampoco se equipara UID con propietarioId.

La ubicación `usuarios/{uid}` es el binding de transporte de C, **no una ruta verificada del documento inaccesible de B**. Antes de integrar/desplegar, contrastar ese binding con B y suministrar el usuario canónico desde su administración autorizada. Si no existe, no se concede acceso ni se autoasigna el inmueble. No se crean cuentas, gestores, aceptaciones ni carteras desde este módulo.

La fuente canónica debe proyectar gestiones aceptadas/ACTIVAS, permiso, responsable actual y revocación conforme al contrato. C consume el resultado efectivo, no calcula acceso desde etiquetas de estado recibidas por UI. La retirada de escritura exige retirar el propietario de `carterasE` en esa fuente; conservarlo en `carterasL` permite solo histórico. Las Rules leen el documento actual por UID en cada solicitud, de modo que un token anterior no conserva un E retirado. `carterasE ⊆ carterasL` se comprueba en adaptador y Rules.

| Identidad efectiva para propietario P | Lectura operativa | Escritura operativa |
|---|---|---|
| Titular canónico de P | Sí | Sí, con titularidad actual del inmueble |
| Titular de otro propietario, sin cartera P | No | No |
| Gestor con P solo en L | Sí | No |
| Gestor con P en E y L | Sí | Sí, con titularidad actual del inmueble |
| Revocado con histórico L, E retirado | Sí | No |
| Revocado sin L/E | No | No |
| Autenticado sin relación / anónimo | No | No |
| ADMIN/MASTER indicado en perfil, sin ámbito efectivo | No | No |
| ADMIN/MASTER con ámbito canónico efectivo | Según L/titular | Según E/titular, sin bypass global |

No se inventa una exención administrativa no suministrada por el contrato. Un propietario sin cuenta sigue siendo una entidad jurídica válida; puede gestionarse mediante una cartera efectiva. Una cuenta sin propiedades es válida y no provoca creación/inferencia de propietario.

### Persistencia, colecciones y unidad atómica

Se conservan las nueve entidades y el motor de `91ed07d`; no hay segundo modelo de incidencia, reparación, equipo, garantía o proveedor.

| Ruta/colección | Uso |
|---|---|
| `usuarios/{uid}` | Lectura del binding canónico; ninguna escritura/provisioning de C |
| `propietarios`, `inmuebles` | Identidades existentes; lectura contextual y comprobación de titularidad actual |
| `contratos_formalizacion`, `candidatos` | Referencias existentes filtradas por inmueble; opcionales para mantenimiento |
| `operaciones/{propietarioId}` | Cabecera CAS, revisión y contadores de pendientes/autorizaciones en uso |
| `operaciones/{propietarioId}/entidades/{tipo}~{id}` | Persistencia de los registros del modelo operativo existente; proveedor catalogado por propietario |
| **`audit_logs`** | Única auditoría; el histórico del motor se reconstruye de sus eventos |

`repository.ts` vuelve a cargar identidad/contexto/snapshot, ejecuta el motor existente y realiza una transacción. El SDK nativo lee cabecera e inmueble antes de escribir; después escribe **entidad + audit_log + cabecera**, juntos. El fallo en cualquiera de las escrituras aborta todo. No hay guardado alternativo sin auditoría ni overwrite no condicionado: `tx.set` participa en CAS, estado anterior y Rules de creación/actualización. Las lecturas de snapshots comparan revisión antes/después de las queries y comprueban continuidad histórica.

IDs de registro explícitos y estables. ID de auditoría determinista: `operaciones~propietarioId~operacionId`. IDs vacíos, de más de 128 caracteres o con `/`/`~` se rechazan, no se renumeran. Mismo comando/ID devuelve el resultado ya existente; reutilizar ID con otro contenido falla. Los reintentos de la UI conservan ID/actor/contenido mientras hay una operación sin confirmar; no generan automáticamente otra.

### Rules e integridad

Las Rules comprueban autoridad efectiva por UID, ámbito, propietario actual del inmueble, referencias del mismo inmueble, estado anterior, incremento de versión/revisión, correspondencia entre comando y registro, esquema permitido, actor y enlaces `getAfter` de las tres escrituras. Auditoría es append-only: update/delete denegados; entidades/cabeceras tampoco permiten delete. `CREAR` no puede usarse como sobrescritura de un registro anterior.

Contadores en cabecera impiden cerrar con averías/reparaciones pendientes, resolver averías con trabajos pendientes o cancelar presupuestos utilizados. Se conservan claves con valor cero para hacer verificable cada delta. Se comprueban estados, proveedor/presupuesto de reparación, presupuesto aprobado antes de ejecución y datos de finalización; los documentos/facturas originales no se reescriben. Facturas sin actuación pueden registrarse y asociarse después de forma auditada.

Importes en EUR y céntimos enteros no negativos/seguros. Se valida suma exacta de conceptos en motor y Rules. **Límite explícito del transporte/UI Firestore: diez conceptos por presupuesto/factura**, necesario para comprobar cada elemento y la suma en Rules sin bucles. El núcleo puro mantiene su modelo original. No se truncan, fusionan ni redondean conceptos automáticamente; conservar siempre la factura/presupuesto original. Este límite aparece en formulario y errores antes del guardado.

Para que la titularidad no pueda falsificarse usando escrituras heredadas permisivas, se acotan también propietarios e inmuebles: CRUD de propietario exige ámbito efectivo y no permite delete; creación de inmueble exige escritura en propietario principal y no introduce copropietario; update conserva IDs principal/secundario; delete denegado. **Cambios de titularidad, nuevas copropiedades, borrado y migración no los resuelve C**: requieren el flujo canónico correspondiente. Los inmuebles sin IDs explícitos no se adjudican por deducción.

El resto de Rules heredadas no se declara saneado globalmente: existen lecturas públicas y permisos legacy en otras colecciones. No se usa ese legado para conceder acceso a operaciones. La puesta en producción del conjunto de la aplicación requiere su revisión por el bloque de seguridad/integración.

`rules-harness.test.mjs` inspecciona el archivo real referenciado en `firebase.json`, verifica guardas y paridad de campos/transiciones, y demuestra que fallaría al introducir bypass o intercambiar L/E. **Es un harness estático, no un evaluador de Rules ni un emulador**. La compilación, semántica real, presupuesto de accesos/expresiones de Rules y ataques mediante SDK directo quedan en la validación Firebase del Bloque 4; no se declaran probados aquí.

### Auditoría, documentación y evidencia

Único mecanismo: `src/lib/auditoria.ts::registrarAuditoriaFirestore`, invocado dentro de la transacción. Guarda actor autenticado, fecha del evento, entidad, acción, resultado EXITO, motivo, comando completo, antes/después, revisión y ámbito. `registradoEn: serverTimestamp()` distingue registro servidor de la fecha aportada por cliente. No se afirma exactitud del reloj del navegador. Operaciones rechazadas no generan datos parcialmente persistidos ni un evento falso de éxito; no se crea una segunda cola de auditoría de fallos.

Documentación múltiple: registros `DocumentoOperativo` con `ArchivoAportado` existente, categoría, descripción, fecha original, MIME, ID y ruta si existen; vínculos append-only a incidencias, averías, reparaciones, presupuestos, facturas, equipos y garantías. Actor/versión/procedencia se conservan en evento y registro, no se reasignan al cerrar/reabrir. El modelo base de archivo no contiene hash: no se fabrica ni se afirma verificar uno; existencia, permisos de Storage, bytes/hash y carga/descarga real corresponden a infraestructura Bloque 4. No se insertan URLs ficticias ni binarios.

Única extensión aditiva del documento existente: `referenciaExterna?: {sistemaExterno, referenciaExterna}`. Permite enlazar una póliza/expediente autorizado externo sin crear otro seguro ni decidir cobertura. Se valida la pareja completa y se rechazan campos de decisión inyectados. El original prevalece; el texto de notas/diagnósticos no lo sustituye.

### Equipos, garantías, seguros, proveedores e histórico

- Equipo se conserva por inmueble, con datos de adquisición/instalación disponibles y vínculos a sus incidencias/averías/reparaciones y garantías.
- Garantía: fechas conocidas o desconocidas, condiciones y fabricante/proveedor/documentos; avisos de vencimiento contextual. Vigencia **no implica cobertura**.
- No se reutiliza seguro de impago como seguro de mantenimiento ni se crea una póliza paralela. Se admite referencia externa/documentación original; ninguna decisión aseguradora automática.
- Proveedor profesional mínimo persistido una vez en el catálogo del propietario y seleccionado por ID en las actuaciones; no se crea uno al abrir cada incidencia. Referencia externa duplicada se rechaza por el motor; no hay deduplicación por nombre que fusione terceros sin consentimiento.
- Incidencias pueden ser históricas, de zonas comunes o mantenimiento general y carecer de contrato/inquilino.
- Los cierres son transiciones con motivo y verificación de pendientes. La reapertura prevista por el dominio sigue siendo el mismo expediente histórico, nunca un registro nuevo con evidencia borrada. Nueva actuación: nuevo ID.
- No hay inferencia automática de cotitularidad ni reasignación histórica. Tras perder titularidad actual, los documentos del propietario anterior solo se leen si conserva ámbito efectivo; no se escriben.
- No se ejecuta IA ni se le concede puerto de escritura/decisión. Cualquier futura integración solo puede aportar propuestas revisables, sin decisiones legales, fiscales, de titularidad, económicas o de cobertura.

### UI y uso

Entrada mínima desde **detalle del inmueble → Operaciones · Incidencias**, sin nuevo centro/aplicación ni navegación global. Usa Auth existente; selección **explícita** del propietario permitido, también si solo hay uno. Suscripción al usuario canónico actualiza controles de solo lectura al retirarse E. Las Rules siguen siendo autoridad incluso si se manipula la UI.

El panel permite listar/buscar expedientes abiertos/cerrados, diagnóstico, presupuestos pendientes, reparaciones, facturas, garantías por vencer, documentos y catálogo/histórico; abrir el detalle; crear las nueve entidades; editar campos admitidos; anotar diagnóstico/actuación; aprobar/transicionar; asociar factura; adjuntar varias referencias documentales; finalizar, resolver y cerrar. Los formularios generan comandos del motor, no persistencia directa. Importe cero se conserva. Conceptos múltiples no se colapsan al editar. Errores se muestran también dentro del diálogo; cancelar el diálogo no inventa confirmación del guardado.

No se ejecutó navegador productivo ni E2E conectado: SSR/callbacks prueban las vistas y constructores de comandos sin montar App/efectos de seeds.

### Validación reproducible y resultado final

Instalación autorizada realizada: `npm install --no-package-lock --ignore-scripts`, solo dependencias declaradas. `package.json`, `bun.lock`, configuración TS y entrypoints intactos. No se añadió paquete de tests/Rules ni lockfile npm. Firebase CLI, Java y emulador no estaban disponibles.

```bash
# Dominio operativo original: conservar las 156 pruebas
node --experimental-strip-types --test src/features/operaciones/tests/{domain,queries-security,validation,isolation}.test.mjs
# Patrimonial, incluyendo ahora React SSR/callbacks
node --experimental-strip-types --test src/features/patrimonial/tests/*.test.mjs
# Específicas nuevas y regresión completa
node --experimental-strip-types --test src/features/operaciones/tests/*.test.mjs src/features/patrimonial/tests/*.test.mjs
# Recorrido ficticio, sin App/Firebase
node --experimental-strip-types src/features/operaciones/demo/recorrido.mjs
npm run lint
npm run build
```

| Validación | Resultado |
|---|---|
| Original operativa | **156/156**, cero omitidas |
| Patrimonial | **87/87**, cero omitidas: las 79 previas más 8 React antes condicionadas |
| Persistencia/atomicidad/idempotencia/aislamiento y matriz | **38/38**, transporte de memoria |
| Adaptador Firebase concreto con SDK doble inyectado | **5/5**, sin conexión real |
| UI/formularios SSR y callbacks | **19/19** |
| Rules reales: harness estático fail-loud | **14/14**, no compilación/emulador |
| Límites de integración y custodia | **5/5** |
| Procedencia externa documental | **4/4** |
| Regresión completa disponible | **328/328**, cero fallos/omisiones |
| TypeScript | `npm run lint` / `tsc --noEmit`: aprobado |
| Build | Vite + esbuild: aprobado; aviso de bundle mayor de 500 kB, no ocultado |
| CLI ficticio | 29 eventos hasta CERRADA, sin persistencia |
| Firestore/Rules ejecutadas/Storage/despliegue | **VALIDACIÓN REAL FIREBASE — PENDIENTE BLOQUE 4** |

### Puesta en servicio / integración pendiente (Bloque 4)

No ejecutar todavía el producto contra datos reales como prueba. En proyecto **demo aislado**, sin credenciales ni datos de negocio:

1. Contrastar binding físico de usuario y firma compartida de auditoría con B. No reemplazarlo por claims/perfil local ni crear una arquitectura alternativa. Proveer identidades y carteras efectivas exclusivamente mediante administración canónica confiable.
2. Compilar y ejecutar el `firestore.rules` real y su índice `audit_logs(propietarioId, modulo)` con emulador. Ensayar matriz completa, revocación con el mismo UID/token, escritura SDK maliciosa sin auditoría/cabecera, actor falso, referencias cruzadas, contadores, suma de importes, inmutabilidad y borrados. Verificar límites de expresiones y accesos por transacción; el harness no acredita ninguno de estos resultados reales.
3. Ejecutar recorrido UI→SDK→Rules con fallo de red, concurrencia, replay y error de auditoría. No lanzar App si siguen activos efectos de inicialización que escriban datos productivos.
4. Validar referencias/Storage y hash sobre bytes originales cuando exista esa infraestructura. Nada en C equivale a existencia, autenticidad legal o cobertura comprobada.
5. Medir escalabilidad: snapshot/histórico completos por propietario, cabecera con contadores y contención por revisión. No hay paginación ni evidencia de rendimiento a gran volumen. Respetar tamaño máximo de documentos/transacciones; no ocultar errores con fallback sin auditoría.

Límites deliberados, no decisiones automáticas pendientes: EUR, diez conceptos en transporte, documentos por referencia sin uploads, no fiscalidad/pagos, no prorrateo multiinmueble, no transferencias/copropiedad nuevas ni privilegios admin globales inferidos. El modelo operativo existente no se sustituye para simular esas capacidades.

---

# Anexo histórico — acta de la entrega desconectada 91ed07d

**Lo que sigue documenta la entrega anterior y sus bloqueos de entonces. Los resultados y el alcance vigentes son los de la sección superior.**


## Inspección y decisiones previas

Estado inicial: rama `arena/01a0dd70-gestor-alquileres-vercel`, HEAD local `e7798d3`, 30 archivos patrimoniales sin seguimiento. El remoto de **esta misma rama** conservaba `7657eea2d08f1e66c480091c5b81ecfc16aac5a8`. Se verificaron los 30 archivos byte a byte frente a ese commit y se alinearon únicamente índice y referencia local con la custodia existente, sin escribir archivos del working tree, sin reset/rebase/merge y sin consultar ni integrar B. Base del bloque operativo: `7657eea`.

| Existente | Decisión |
| --- | --- |
| `src/types.ts: Inmueble`, `Propietario` | Reutilizar IDs/proyecciones de lectura. No crear otro inmueble/propietario ni alterar titularidad. |
| `ContratoFormalizacion`, `Candidato` | Reutilizar referencias. En el contrato actual el arrendatario principal es `candidatoId`; no crear `Alquiler` ni otra entidad `Inquilino`. Cotitulares sin ID propio quedan pendientes del modelo principal. |
| `ArchivoAportado` | Reutilizar metadatos de archivo como referencia; no binarios ni cargas. Añadir únicamente relación operacional, categoría e histórico. |
| `DocumentoAnalizado`, `SolicitudDocumentacion` | Son expedientes de solvencia/candidatos; no reutilizarlos como partes de mantenimiento. |
| `AnalisisIncidencias`, `RespuestaIncidencia`, `CuestionarioIncidenciasData` | Son valoración de respuestas hipotéticas de candidatos, no incidencias reales. Se crea `IncidenciaOperativa` sin tocar esos tipos. |
| `IncidenciaRevision`, `ProveedorRevisionPatrimonial` | Son incidencias de validación y un puerto de lectura, NO averías ni proveedores profesionales. |
| `ActaEntregaLlaves.electrodomesticosRevisados`, `inventarioDetalle` | Checklist/texto sin equipos identificables; justifican un registro de equipo operativo mínimo separado. |
| `garantiaAdicionalImporte`, `EvaluacionAsegurabilidad`, `SolicitudSeguroImpago` | Garantía económica LAU/seguro de impago; no equivalen a garantía comercial de un equipo ni a cobertura de averías. No se alteran. |
| Proveedores, averías, reparaciones, presupuestos, facturas de mantenimiento | No hay entidades/servicios equivalentes en esta base. Se añaden al módulo operativo. |

`src/lib/firebase.ts` concentra suscripciones/guardados/cargas reales y `App` activa inicialización. No se importan. Las Rules heredadas contienen lecturas abiertas y escrituras permisivas en colecciones existentes; no se copian ni amplían. No hay reglas operativas específicas y el cierre general es denegación. Persistencia real deliberadamente desconectada.

La única modificación de un archivo patrimonial es el test de **custodia de alcance** (`tests/isolation.test.mjs`): su lista cerrada rechaza cualquier módulo nuevo, aunque esté autorizado. Se amplía exclusivamente para admitir `src/features/operaciones/` y este documento. No se rebajan assertions de dominio/seguridad; una prueba adicional compara byte a byte los otros 29 archivos patrimoniales con `7657eea`. No se cambia su modelo, componentes, fixtures, onboarding o importación.

## Arquitectura entregada

Base **desconectada y en memoria**, no pantalla final ni lanzamiento de producto. Único punto público: `src/features/operaciones/index.ts`.

| Archivos | Responsabilidad |
| --- | --- |
| `contracts.ts` | Proyecciones del modelo existente, nueve entidades operativas, comandos/eventos, contexto y puertos futuros. |
| `policies.ts` | Transiciones iniciales profundamente inmutables. |
| `validation.ts` | Calendario, importes, relaciones, duplicados y validación de ámbito. |
| `service.ts` | Servicio puro `ejecutarOperacion`; preparación de cambio sin ejecutarlo. |
| `queries.ts` | Centro por inmueble, expedientes, historial y vista contextual de proveedor. |
| `demo/fixtures.ts`, `demo/recorrido.mjs` | Datos inequívocamente ficticios y recorrido ejecutable Node sin UI ni servicios. |
| `tests/support.mjs` | Contextos e inputs congelados para probar ausencia de mutaciones. |
| `tests/domain.test.mjs` | Creación, estados, decisiones, documentación, cadena completa, versiones e idempotencia. |
| `tests/queries-security.test.mjs` | Consultas, garantías, separación propietario/inmueble y relaciones de proveedor. |
| `tests/validation.test.mjs` | Rechazos atómicos, límites de datos, fechas y metadatos. |
| `tests/isolation.test.mjs` | Custodia byte a byte, grafo de imports, ausencia de efectos externos y límites del diff. |

### Relaciones

```text
Propietario.id + Inmueble.id  ─ ámbito explícito, NO nuevo modelo de titularidad
  ├─ IncidenciaOperativa
  │    ├─ ContratoFormalizacion.id? → Candidato.id? (arrendatario principal)
  │    ├─ equipoId?, proveedorId?, responsable?
  │    └─ AveriaOperativa (síntomas; equipoId?; garantiaId?)
  │         └─ ReparacionOperativa (ejecutor, fechas, materiales, coste, resultado)
  ├─ EquipoOperativo → GarantiaEquipo(s) → referencia de compra y documentos
  ├─ PresupuestoOperativo → vínculo de actuación + ProveedorProfesional
  ├─ FacturaOperativa → ProveedorProfesional + actuación? + presupuesto?
  └─ DocumentoOperativo → proyección de ArchivoAportado
       ↑ vínculos explícitos desde incidencias, averías, reparaciones,
         presupuestos, facturas, equipos y garantías

ProveedorProfesional: catálogo acotado a un propietario, reutilizable en varios
inmuebles explícitamente admitidos. Nunca se comparte por coincidencia de nombre
ni se copia como otra persona/usuario. Sus actuaciones/presupuestos/facturas e
inmuebles relacionados se consultan, no se mantienen en arrays duplicados.

Historial append-only: creación → diagnóstico/anotación → presupuesto → decisión
→ reparación → factura/asociación → documentación → resolución → cierre/reapertura.
```

Una incidencia puede existir sola y no es una avería. Una reparación puede depender directamente de una incidencia, sin avería ni presupuesto, si esos vínculos se omiten explícitamente. No se generan automáticamente las otras entidades ni se sincronizan sus estados de forma oculta. Una factura puede recibirse sin actuación: queda pendiente de asociación, con proveedor e inmueble conocidos. Presupuesto y factura nunca se convierten entre sí. Proveedores, presupuestos y garantías están relacionados por referencias comprobadas en el mismo ámbito; las consultas de equipo y avería reúnen los registros asociados sin duplicarlos.

El contexto permite hechos históricos (incluido contrato cancelado), vivienda sin contrato, aviso del propietario, zonas comunes y mantenimiento general. Las zonas comunes se anclan a un `Inmueble.id` existente; este bloque no crea otro modelo de comunidad/edificio. Un `inquilinoId` identifica un candidato existente del inmueble; si también se aporta contrato, debe coincidir con su `candidatoId`. No se inventa un contrato a partir del usuario actual.

### Semántica de cambios e histórico

- Cada comando exige ID de operación, ID de entidad, actor **aportado**, fecha de registro UTC ISO, revisión esperada y motivo no vacío. El servicio no genera IDs, no usa la hora actual ni identidad implícita.
- Éxito: nuevo snapshot, nueva versión de entidad y evento con comando, ámbito, actor, motivo y fotografías completas `antes`/`despues`. No comparte objetos mutables con el input o la evidencia retornada. Error: mismo snapshot original, sin cambios parciales. No hay borrado ni edición de eventos.
- Idempotencia por ID de operación y contenido canónico: repetir el mismo comando, incluso tras cambios posteriores, no lo aplica dos veces. Reutilizar la clave con otro contenido o ámbito se rechaza. Reintento idéntico precede al control de revisión; otra operación obsoleta falla por conflicto.
- Fechas del hecho: `YYYY-MM-DD`, admiten hechos históricos. Registro: instante UTC canónico explícito que no retrocede respecto al libro local. Orden de historial: revisión, determinista incluso con timestamps iguales.
- El snapshot debe contener el libro íntegro local; la revisión corresponde al número de eventos. **No es un singleton global de producción**, no está paginado y no debe usarse como documento compartido entre propietarios. La topología de persistencia y su granularidad CAS están pendientes.
- Ámbito, ID, versiones, documentos, estado y vínculos padre no se editan mediante un patch. El tipo público limita campos modificables y la validación runtime rechaza inyecciones. Datos de ficha corregibles dejan siempre las dos versiones. Para retitular/reparentar o vincular posteriormente un contrato se necesita diseñar un comando específico: no se sustituye una relación histórica en silencio.
- Factura económica y metadatos de archivo originales no son editables. Se puede anotar, anular la factura o asociarla/reasociarla con comando explícito y motivo, conservando el vínculo anterior. No se gestionan pagos, asientos, rectificativas fiscales ni eliminación de archivos.
- Un presupuesto decidido conserva contenido y autorización; nueva versión económica requiere otra referencia explícita. Actor/motivo/fecha del evento son la evidencia de decisión, **no una comprobación de potestad legal**. Una reparación con presupuesto exige que esté aprobado antes de iniciarse. Una autorización usada no se cancela retrospectivamente.
- Reparación: inicio explícito; para finalizar requiere fecha final, resultado y coste (cero es válido). No se cambia ejecutor/presupuesto una vez iniciada; el resultado de una reparación terminada se conserva, con notas posteriores o nueva actuación. Un proveedor inactivo no inicia otra reparación, pero su baja no impide registrar el resultado de trabajo iniciado previamente.
- No se resuelve/cierra/cancela incidencia con averías/reparaciones pendientes, ni avería con reparación pendiente. Incidencia cerrada admite reapertura explícita; actuaciones nuevas o reabiertas necesitan padre abierto. Los estados financieros y de equipos no se derivan de estados del alquiler.
- `flujoIncidencias` admite vocabulario/transiciones propios, declarando estados terminales. Los otros flujos se mantienen fijos en esta base para preservar sus invariantes. Configurar un flujo no concede permisos. Default: ABIERTA, EN_REVISION, PRESUPUESTO, AUTORIZADA, EN_REPARACION, RESUELTA, CERRADA, CANCELADA.

### Importes y duplicados

Importes en céntimos enteros seguros no negativos, **EUR explícito**, sin conversión ni cálculo fiscal. Los conceptos aportan importes finales y su suma debe coincidir con el total; no se infieren IVA, retenciones, cobertura, importe indemnizable ni cobros. El coste final de reparación puede diferir del presupuesto; se conserva como dato aparte y la factura conserva su importe original.

IDs únicos dentro de cada tipo. Duplicados adicionales por igualdad exacta de referencia externa de proveedor dentro del propietario, marca+modelo+serie de equipo dentro del propietario, referencia completa de presupuesto/factura por tipo+proveedor+propietario (también entre inmuebles), e ID de archivo por ámbito. La referencia económica debe incluir la serie/año/versión necesarios para ser inequívoca. No hay deduplicación por nombres, normalización fiscal ni fusiones automáticas. Si una factura abarca varios inmuebles, deberá diseñarse una futura distribución; no se duplica aquí el documento económico para eludir el control.

### Garantías, documentos y extensión a B

La garantía es una ficha vinculada a equipo con fechas opcionales, proveedor/fabricante, condiciones aportadas, compra y documentos. Fechas desconocidas producen `FECHAS_INCOMPLETAS`. La fecha final es inclusiva. `VIGENTE_POR_FECHAS` solo significa que hoy está dentro del intervalo aportado: la cobertura siempre es `NO_EVALUADA`, con `DOCUMENTACION_ORIGINAL` como fuente. Adjuntar un documento no cambia esa conclusión.

No se cargan, leen ni modifican archivos reales. Solo se reutilizan ID, nombre, MIME, fecha, tamaño y ruta opcional de un `ArchivoAportado`; no se aceptan base64 ni URL de acceso. Un documento puede vincularse a varias actuaciones del mismo ámbito sin duplicar el fichero. No se vincula documentación de otro propietario/inmueble.

`PuenteProteccionFuturo` recibe ámbito y referencia operacional y devolvería enlaces externos opacos/documentación autorizada. **No hay implementación**, colecciones de pólizas, motor de seguros, siniestros ni cobertura inferida. B conserva la responsabilidad de su dominio; la existencia de un enlace o garantía nunca autoriza ni garantiza un reembolso.

### Consultas estructuradas

`consultarCentroOperativo(estado, contexto, { hoy, diasAvisoGarantia, limiteHistorial? })` devuelve incidencias abiertas (incluidas resueltas pendientes de cierre), averías pendientes, reparaciones planificadas/en curso, presupuestos pendientes, facturas no anuladas sin asociación, equipos, garantías por vencer, últimas actuaciones e historial íntegro del ámbito. Fechas y horizonte se reciben explícitamente. Avisos inclusivos de 0 a N días; ninguna consulta depende del reloj del entorno.

`consultarExpediente` relaciona los registros de una incidencia/avería/reparación/equipo/garantía/presupuesto, documentos e histórico. También conserva evidencia de asociaciones anteriores corregidas. No atraviesa un proveedor compartido para mezclar expedientes de incidencias independientes.

`consultarProveedor` devuelve ficha, actuaciones, presupuestos, facturas e inmuebles relacionados, filtrando **todos** los ámbitos explícitamente permitidos y conocidos del mismo propietario. Las otras consultas son estrictamente de un solo par propietario/inmueble. Los resultados son copias independientes.

## Seguridad y futuro adaptador: implementación detenida deliberadamente en el puerto

No se han modificado Rules, servicios, consumidores productivos, claims ni permisos. El contrato de contexto expresa admisibilidad local, **no autorización efectiva**. El caller ya dispone del snapshot que entrega; no es una API segura para aceptar estado/actor/ámbitos enviados desde un navegador. Los rechazos regresan ese mismo input y no leen otras fuentes. Los filtros no sustituyen seguridad del servidor.

| Aspecto | Antes de habilitar persistencia real |
| --- | --- |
| Consumidor | Un nuevo servicio operativo autorizado, no `App` ni los servicios heredados todavía. |
| Identidad | Revalidar actor autenticado, delegaciones vigentes y acceso histórico/gestión/escritura por separado. Propietario ≠ cuenta ≠ acceso; modalidad no es claim. |
| Aislamiento | Ámbito explícito por propietario/inmueble; catálogo de proveedor acotado al propietario, con permisos propios comprobados por backend. No inferir titularidad ni acceso a toda la cartera por conocer un inmueble o el ID de proveedor. Copropiedad/traspasos e histórico requieren política externa aprobada. |
| Persistencia/CAS | Releer contexto y todas las referencias/dependencias, validar versiones, unicidad/idempotencia y guardar entidad+evento atómicamente. `prepararCambioPersistencia` solo describe entidad, evento y versiones esperadas; NO ejecuta el puerto. El adaptador debe resolver su agregado/versiones, sin escribir el snapshot multiámbito como singleton. |
| Rules | Nuevas rutas operativas restringidas (nombres/esquema todavía no desplegados), validación de propietario/inmueble y lectura/escritura autorizada, restricciones append-only y pruebas de emulador negativas. Hoy las rutas nuevas están denegadas por catch-all; no habilitarlas por analogía con las reglas legacy. |
| Riesgo | Reutilizar reglas amplias de colecciones existentes, confiar en `ambitosPermitidos` del cliente, permitir cambiar ámbito, sobrescribir eventos o dar bypass a staff permitiría exposición/cruces de titularidad. |
| Alternativa actual | Dominio puro, fixtures ficticios y puertos sin implementación. Ninguna migración, colección creada, escritura real, seed, Auth ni carga a Storage. |
| Impacto B | Acordar solo referencias opacas y resolución autorizada de documentos. No consumir ni modificar modelos/servicios/rules de B ni asumir cobertura. |

No se utiliza `isStaff()` ni se amplía acceso global. Los tests prueban invariantes del dominio y ausencia de efectos externos en el recorrido; **no son auditoría del despliegue, prueba de Rules ni prueba de autorización real**.

## Ejecución y validación

Desde la raíz del repositorio, con Node 22.22.3:

```bash
# Ejemplo completo, imprime resumen ficticio; no escribe archivos/datos.
node --experimental-strip-types src/features/operaciones/demo/recorrido.mjs

# Suite operativa
node --experimental-strip-types --test --test-reporter=spec src/features/operaciones/tests/*.test.mjs

# Regresión patrimonial
node --experimental-strip-types --test --test-reporter=spec src/features/patrimonial/tests/*.test.mjs

# Toda la suite disponible (los nueve archivos *.test.mjs descubiertos)
node --experimental-strip-types --test --test-reporter=spec src/features/patrimonial/tests/*.test.mjs src/features/operaciones/tests/*.test.mjs

# Comprobaciones del proyecto, cuando estén sus dependencias autorizadas
npm run lint
npm run build
```

El ejemplo recorre 29 eventos y termina con incidencia cerrada, sin facturas pendientes de asociación, e indicación de garantía próxima a vencer **sin afirmar cobertura**. No necesita React ni cargar el producto.

Resultados de cierre se consignan tras la última regresión, abajo. La eliminación de tipos de Node ejecuta el código: **no comprueba TypeScript ni sustituye un build**. Los tests de custodia requieren el commit `7657eea` disponible en el historial Git. No se instalan herramientas/dependencias, no se modifican `package.json`, `bun.lock` ni `tsconfig.json` para esquivar validaciones.

## Pendiente para integración posterior

1. Validación estática TypeScript, React SSR/callback patrimonial y builds con dependencias disponibles/autorizadas; no declarar aprobadas esas puertas por las pruebas Node.
2. Adaptador autorizado, transacciones/versiones coherentes y revalidación de dependencias, paginación, índices y pruebas de concurrencia/Rules/emulador antes de cualquier persistencia real.
3. UI operativa, navegación, formularios, carga/lectura de documentos y conexión explícita al producto. El CLI no es una interfaz final ni prueba de navegador.
4. Política de copropiedad, delegación, acceso histórico, cambios de titularidad y vinculación/corrección posterior de alquiler. Este bloque no altera el modelo patrimonial existente.
5. Contrato de integración con B para enlaces autorizados de seguro/póliza; cobertura solo conforme a documentación original y evaluación en el dominio correspondiente.
6. Si fueran necesarios: multimoneda, fiscalidad/pagos, distribución multiinmueble de factura, cotitulares identificables y otros flujos específicos. No se simulan como funcionalidad ya implementada.

### Resultados de cierre del bloque

| Comprobación ejecutada | Resultado |
| --- | --- |
| Suite operativa, cuatro archivos de tests | **156 pass / 0 fail / 0 skip**. |
| Suite patrimonial, cinco archivos de tests | **79 pass / 0 fail / 1 skip** (80 entradas del runner). |
| Suite completa disponible, nueve archivos de tests | **235 pass / 0 fail / 1 skip** (236 entradas del runner). |
| Recorrido CLI ficticio | 29 eventos, cierre y consulta final correctos, sin persistencia. |
| Custodia patrimonial | 29 archivos idénticos al commit original; el trigésimo coincide exactamente con el ajuste acotado de allowlist de su test. |
| Aislamiento operativo/productivo | Imports y efectos bloqueados, separación propietario/inmueble, inyección/referencias cruzadas rechazadas, archivos productivos/dependencias/Rules idénticos a custodia. |
| `npm run lint` | **Bloqueado**, exit 127: `tsc: not found`. No typecheck realizado. |
| `npm run build` | **Bloqueado**, exit 127: `vite: not found`; no llegó a esbuild. No build aprobado. |
| React SSR/callback patrimonial | **Omitido**, faltan `typescript`, `react`, `react-dom/server`. No equivale a aprobado. |
| Herramientas/dependencias | Node 22.22.3 disponible; sin `node_modules`, `tsc`, `vite`, `esbuild`; ninguna instalación ni cambio de lockfile/config. |

Durante la revisión se reforzaron validaciones runtime de campos obligatorios ausentes y casos de referencias vacías, presupuesto dirigido a reparación de otro proveedor, conservación de factura/documentos tras reasociación y trazabilidad del equipo identificado al registrar una avería. Se volvieron a ejecutar las suites tras los cambios; los resultados anteriores corresponden a la regresión final. La suite y el diff se revisan de nuevo al preparar la custodia. Los datos/servicios de B, `main`, `arena/01a0d832`, `recovery/*` y Master Map no se modifican ni integran. El informe de entrega registra el SHA final, su padre y la comprobación del push sin introducir un segundo commit de documentación.

## Continuación — infraestructura y herramientas

Se recuperó la custodia `91ed07d` verificando los 44 archivos byte a byte, mediante fetch explícito, read-tree y update-ref de la misma rama, sin alterar contenidos. La consulta de solo lectura del documento B en `fc14156` devuelve 404 en este repositorio; se utiliza exclusivamente el contrato normativo aportado por el usuario, sin incorporar código de B.

Para ejecutar TypeScript/build/React se autoriza en esta orden instalar **solo las dependencias ya declaradas**, con `npm install --no-package-lock --ignore-scripts`. No se cambian package.json ni bun.lock. No se ejecuta la aplicación/servidor productivo ni seeds. No se instalan dependencias nuevas para aparentar una prueba de emulador: su validación se separa explícitamente del harness textual.
