# Bloque patrimonial aislado — base UX, completitud y revisión de importación

Se conserva este documento del bloque inicial y se actualiza en el mismo lugar. No se abre una microfase ni se crea un mapa paralelo. El origen conceptual sigue siendo **D1/D1R** y, cuando esté disponible en la línea principal, `docs/MAPA-MAESTRO-ERP-ACTUAL.md`. Este último no está presente en el checkout inspeccionado; no se ha creado ni sustituido aquí.

- Base: `e7798d3b6f56a5892941b8109e3ff2bf254e22d3`.
- Rama: `arena/01a0dd70-gestor-alquileres-vercel`.
- Alcance: contratos de presentación, funciones puras, componentes controlados y demo en memoria. **No son esquemas persistentes ni un segundo modelo de usuarios/propietarios.**

## Qué queda implementado y preparado

### Base UX conservada

- Onboarding y selector de `PROPIETARIO / GESTOR_PROPIETARIO / GESTOR_PROFESIONAL`.
- Listado, búsqueda y selección de varias fichas, con o sin cuenta y con cero o varios inmuebles.
- Acceso `SIN_CUENTA / INVITADO / ACTIVO` presentado por separado.
- Borradores de nombre, NIF/CIF, email y teléfono. Crear, editar, cancelar y guardar solo en memoria.
- La edición preserva ID, acceso, cuenta y referencias de inmuebles. El nombre sigue siendo el único requisito **visual de la demo** para guardar, no un criterio fiscal.
- Ninguna modalidad crea entidades, cuentas, permisos o carteras.

### Evaluación contextual de completitud

`evaluarCompletitud(datos, reglas)` recibe una política explícita para **esa ficha o registro** y devuelve:

- `estadoDatos: COMPLETO | INCOMPLETO | BLOQUEADO`.
- `camposFaltantes: string[]`.
- `politicaId` e incidencias con código, mensaje, nivel y campo opcional.

`PoliticaCompletitud` contiene un identificador y `camposRequeridos`. La política la resuelve el consumidor; no hay lista fiscal/documental incorporada, política universal ni selección por estado de acceso. `ReglasRevisionDatos` admite también bloqueos y solicitudes de revisión explícitos suministrados desde fuera.

Semántica técnica, no normativa:

| Situación | Resultado de datos |
| --- | --- |
| Política explícita y campos presentes, sin bloqueo | `COMPLETO` respecto a esa política únicamente |
| Faltan campos de esa política, sin bloqueo | `INCOMPLETO`, con sus claves en `camposFaltantes` |
| Bloqueo externo explícito | `BLOQUEADO`; conserva los campos faltantes conocidos |
| Política ausente/inválida o formato de datos no evaluable | `BLOQUEADO` de **evaluación**, con incidencia técnica; no declara un defecto fiscal del propietario |
| Revisión manual externa sin campos pendientes ni bloqueo | Puede seguir `COMPLETO`; la revisión sigue pendiente por separado |

Sin política, `camposFaltantes: []` significa que **no se conocen los requisitos**, no que se hayan satisfecho. Una política explícita con cero requisitos es distinta de una política ausente.

La comprobación genérica de presencia exige propiedad propia de primer nivel, no null/undefined ni texto en blanco. `0` y `false` son valores presentes. No interpreta puntos como rutas. No considera vacíos arrays/objetos como documentos inválidos: esa semántica de negocio no está aprobada aquí. Conserva el orden de las claves y elimina duplicados.

Los resultados se calculan aparte de `ReferenciaPropietario`: no se incrustan ni persisten automáticamente en la ficha. La demo proyecta los cuatro campos de borrador para evaluar una ficha, sin utilizar identidad o acceso como criterios.

### Destino explícito de importación

- `SolicitudImportacionPatrimonial` exige `propietarioDestinoId: string`.
- `SolicitudPrevisualizacion` también declara explícitamente el campo, permitiendo `null` mientras se prepara la selección. Si JS lo omite, se trata como ausente, nunca se completa por defecto.
- `resolverDestinoImportacion` distingue `VALIDO`, `AUSENTE`, `NO_ENCONTRADO`, `NO_PERMITIDO` y `AMBIGUO` para IDs duplicados en el contexto.
- Un ID vacío/en blanco se representa como ausencia. Un ID no vacío se compara exactamente, sin corregirlo, recortarlo o sustituirlo.
- No utiliza usuario autenticado, propietario de cuenta, primera ficha, ficha única, modalidad, propietario abierto ni datos de titularidad del origen como alternativa.

El contexto contiene referencias mínimas de propietarios y una lista **externa** de IDs permitidos para planificar. Si no se aporta esa lista, no se supone permiso. Esta comprobación local sirve al dry-run, **no es seguridad efectiva ni reemplaza D2/D3**.

### Previsualización pura

`previsualizarImportacion(solicitud, contexto)` recibe:

1. Registros de origen ya normalizados como objetos de datos JSON.
2. Destino explícito o ausencia declarada.
3. Referencias de destino, IDs permitidos y reglas por índice de registro.

No hay parser de archivos/CSV/Excel, acceso a red ni persistencia. El adaptador futuro debe validar/normalizar la entrada a este contrato: no admite funciones, símbolos, getters con efectos u objetos arbitrarios como formato de importación. Un objeto no clonable genera un error antes de producir propuesta; no se ejecuta ninguna escritura. Filas simples inválidas como null, texto o arrays se conservan para inspección y se clasifican como bloqueadas por formato.

El resultado incluye:

- Destino resuelto y sus incidencias.
- Todos los registros, con copia profunda del origen, índice temporal, evaluación de datos e incidencias.
- `registrosQueSeCrearian`.
- `registrosIncompletos`.
- `registrosBloqueados`.
- `datosQueRequierenRevision`, incluidos bloqueados.
- Incidencias de ámbito global o asociadas al índice de origen.
- Marca `soloLectura: true`.

La decisión por registro es `CREARIA / REVISAR / BLOQUEADO`. Son decisiones de **propuesta**, no estados de gestión ni permisos:

- Solo se propone `CREARIA` con destino válido, política disponible, datos presentes y sin incidencias pendientes.
- Faltantes y revisiones manuales producen `REVISAR` cuando no existe bloqueo.
- Cualquier bloqueo de datos o destino impide proponer creación.
- Un destino ausente/no permitido puede bloquear la propuesta **sin cambiar el estadoDatos COMPLETO de su origen**.

Los grupos no son todos excluyentes: un registro incompleto puede estar también bloqueado por destino y requerir atención. No se suman esos contadores como partición del total.

No se generan IDs definitivos, marcas temporales ni titularidades. Se conserva cualquier ID o campo desconocido del origen, sin convertirlo en una instrucción. No hay deduplicación, actualización de registros existentes, resolución de conflictos ni aceptación automática. `CREARIA` significa exclusivamente propuesta hipotética, no plan listo para ejecutar sin revisión autorizada.

## UX integrada dentro del módulo

Se reutilizan el formulario, el reductor local, el detalle y la composición independiente. No se modifica `App.tsx`, `src/main.tsx` ni componentes productivos.

- `EstadoDatosBadge`: datos separados de `EstadoAccesoBadge`.
- `RevisionDatosPropietario`: política, faltantes, incidencias y callback de revisión. En el detalle abre el formulario existente; en el formulario muestra la evaluación sin modificar su acceso.
- `SelectorPropietarioDestino`: selector controlado con opción vacía. No autoselecciona aunque haya una sola ficha; conserva visualmente un ID que ya no está disponible.
- `RevisionImportacion`: destino, propuestas, incidencias y vista de origen. Sus botones solo seleccionan destino o inspeccionan registros. No hay botón de ejecutar importación.
- `propietarioDestinoId` vive en el estado de demo independientemente de `propietarioSeleccionadoId`. Al cambiar de destino se cierra la inspección del registro anterior y se recalcula el preview desde sus entradas, sin caché de permisos.

Abrir una revisión no la marca como resuelta. Ver un origen no acepta la importación. Guardar una ficha nueva no la añade a los IDs permitidos ni le asigna una política automáticamente.

## Fixtures, exclusivamente ficticios

`demo/fixtures.ts` conserva:

| Propietario ficticio | Acceso | Cuenta | Inmuebles |
| --- | --- | --- | --- |
| A · Aurora de Papel | `ACTIVO` | ID ficticio | 3 |
| B · Bosque de Cartón | `SIN_CUENTA` | Sin vinculación | 2 |
| C · Cobalto Imaginario | `INVITADO` | Sin vinculación | 0 |

El gestor ficticio **Estudio Órbita de Papel** tiene cero inmuebles propios y tres propietarios de contexto. No es una lista de permisos. IDs `demo-`, correos `example.invalid`, sin NIF/teléfonos reales.

`demo/revisionFixtures.ts` añade ejemplos técnicos, **no requisitos aprobados para producción**:

- A: política que comprueba solo el nombre identificativo ya utilizado en la demo.
- B: política explícita sin requisitos, para demostrar que no se exige cuenta ni un conjunto universal de campos.
- C y fichas nuevas: sin política disponible; bloqueo de evaluación, no bloqueo de su existencia ni guardado administrativo.
- Cuatro registros de origen: propuesto, nombre visual pendiente, bloqueo externo ficticio y revisión manual ficticia.
- Destinos A/B permitidos por el contexto ficticio; C excluido deliberadamente **sin relación con su estado INVITADO**. Los tests prueban que un invitado también puede ser válido si el contexto externo lo permite.

Los fixtures se importan solo desde demo/pruebas, nunca desde la API reutilizable.

## Contratos para integración posterior, sin conexión real

`contracts.ts` prepara:

- `ProveedorRevisionPatrimonial.obtenerReglasPropietario(id)`.
- `ProveedorRevisionPatrimonial.obtenerContextoImportacion(solicitud)`.
- `AccionesRevisionPatrimonial.onRevisarRegistro(indice)`.
- `AccionesRevisionPatrimonial.onSolicitarImportacion(solicitud)` — solo tipo de solicitud futura, sin botón o ejecución conectada.
- Callbacks existentes de solicitud de invitación, activación y revisión de ficha.
- Contrato explícito `SeleccionDestinoImportacion`.

Los proveedores son **interfaces**, no implementaciones ni promesas ejecutadas. No se importa ningún SDK. Flujo futuro previsto:

1. La integración D2/D3 resuelve identidad, ámbito de lectura y autorización fuera del módulo.
2. Un adaptador entrega referencias ya autorizadas, políticas por ficha/registro y motivos de revisión/bloqueo. No entrega los servicios a los componentes.
3. La UI recibe esas entradas y emite selecciones/solicitudes. El dry-run sigue siendo puro y local.
4. Una eventual solicitud real debe mantener `propietarioDestinoId` explícito. El servicio autorizado deberá volver a validar identidad, destino, política, origen y permisos vigentes antes de escribir. No puede confiar en la lista cliente, en `VALIDO` ni en `CREARIA` como autorización.
5. Persistencia, transacciones e idempotencia se implementarán fuera de este módulo, con el contrato de la línea principal. Cualquier cambio de contexto/política/origen exige nueva revisión; un preview antiguo no es una autorización reutilizable.

## Qué sigue deliberadamente desconectado y sin decidir

- Firebase, Auth, Firestore, Storage, servicios productivos, red y datos reales.
- Rules, índices, claims, seguridad de inmuebles y `subscribeInmuebles()`.
- `gestiones_cartera`, estados de gestión, aceptación y derechos históricos.
- Invitaciones/activación reales e importación efectiva.
- Titularidad, cesiones, creación de entidades productivas y migraciones.
- Catálogo fiscal/documental obligatorio, validadores de documentos, políticas definitivas por tipo de propietario y motivos de bloqueo normativos.
- Correspondencia de modalidades con roles/claims.
- Formatos de importación, normalización de archivos, coincidencias con datos existentes, conflictos de titularidad, deduplicación e idempotencia.
- Ninguna entidad `Persona` ni transformación de `UserProfile`.

La falta de política se aísla como incidencia explícita dentro del mismo bloque; no se sustituye por una regla fiscal inventada. La ausencia de una cuenta por sí sola nunca bloquea datos o destino.

## Ejecución independiente y pruebas

La demo conserva su HTML, entrada, CSS y configuración Vite propios. No carga el servidor ni el flujo productivos. Cuando las herramientas **ya estén disponibles**, desde la raíz:

```bash
node node_modules/vite/bin/vite.js --config src/features/patrimonial/demo/vite.config.mjs
node node_modules/vite/bin/vite.js build --config src/features/patrimonial/demo/vite.config.mjs
```

Escucha en `0.0.0.0:4174`, permite hosts `.e2b.app` y genera exclusivamente `dist/patrimonial-demo/` (ignorado). No utilizar `npm run dev` para revisar este bloque: arranca el servidor productivo. No instalar paquetes ni usar descargas automáticas para desbloquear validaciones.

Pruebas disponibles con Node 22:

```bash
node --experimental-strip-types --test src/features/patrimonial/tests/*.test.mjs
```

- `domain.test.mjs`: regresión de modalidades, fichas y borradores.
- `completeness.test.mjs`: tres estados, faltantes, políticas por registro, ausencia/malformación de política, presencia técnica, los nueve cruces acceso/datos, determinismo y no mutación.
- `import-preview.test.mjs`: destinos, falta de permiso, ambigüedad, ausencia de valores implícitos, dry-run, origen intacto, política externa, revisión y estado de demo independiente.
- `isolation.test.mjs`: grafo de importaciones, ausencia de APIs externas/reloj/aleatoriedad, entrada separada y custodia de archivos productivos/dependencias contra el SHA base. Esa comprobación de custodia requiere el commit base en el checkout.
- `components.test.mjs`: pruebas preparadas de React real, renderizado y callbacks de los componentes antiguos y nuevos. No son E2E. `tsx-loader.mjs` usa TypeScript ya declarado, sin instalarlo; no sustituye a `tsc`.

### Validación actual del bloque ampliado

- **79 tests aprobados, 0 fallidos; 1 test omitido representa la suite React bloqueada.**
- React, React DOM, TypeScript, Vite y esbuild no están disponibles; no hay `node_modules` ni instalación utilizable encontrada.
- Tests React: no ejecutados, no validados.
- `tsc --noEmit`, build de demo y build productivo: bloqueados por herramientas; no se vuelven a lanzar sin ellas.
- No se ha arrancado la demo ni realizado validación visual en navegador.
- Se han mantenido las pruebas previas y añadido las de esta ampliación en un único bloque funcional.

Un runner con código 0 y la suite React omitida no equivale a validación completa. Se conserva la política de no crear commit mientras React/tsc/build exigidos sigan bloqueados. No se abre una fase adicional para resolverlo. El único mensaje de commit solicitado para este bloque, cuando se cumpla la política, es:

`feat(patrimonial): prepare data completeness and explicit import ownership`

## Evidencia de aislamiento y custodia

- Cero escrituras Firestore, Storage y localStorage; cero operaciones Auth ejecutadas por este trabajo.
- Funciones deterministas, entradas congeladas en tests y copia profunda de origen. Los tests bloquean accesos a APIs externas y verifican cero accesos.
- No hay adaptador real, llamadas a proveedores, rutas de escritura ni suscripciones en el módulo.
- Sin instalaciones, nuevas dependencias, cambios de lockfiles o configuración global.
- Archivos productivos y `main` intactos. Sin reset, rebase, merge o push.

La evidencia es estática y de tests puros; no es una auditoría remota de base de datos ni un E2E. Los cambios se conservan íntegros en el working tree cuando no se puede completar la validación requerida.
