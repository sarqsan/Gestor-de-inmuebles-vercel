# AUDITORÍA INTEGRAL — RECORRIDOS COMPLETOS DE NEGOCIO

**SHA:** `2563831df9b026dec8276c45db40977f72883f9d`

**Niveles de evidencia:** **E1** código inspeccionado · **E2** prueba automatizada ejecutada · **E3** emulador o integración · **E4** aceptación funcional real con datos de prueba.
**Ningún recorrido alcanza E4.** El nivel indicado es el máximo alcanzado, y se detalla qué parte queda en E1.

Para cada recorrido: resultado esperado · operaciones reales · persistencia · puntos de inconsistencia.

---

## D1 · Inmueble y titularidad

**Esperado:** alta de inmueble → asignación de titulares con participación (50 %, 100 %) → cartera → consulta → cambio de titularidad con histórico.

**Operaciones reales (código):**
1. `InmueblesSection` → `saveInmuebleFirestore` (`src/lib/firebase.ts:1093`) → `setDoc(inmuebles/{id}, merge)`.
2. Titulares: `titularesModelo.ts`, `titularidades/{inmuebleId}__{pid}`; participación en el registro de titularidad.
3. Cartera: `propietarioId` canónico + `propietarioPrincipalId` fiscal + `titularesIds` (índice de acceso).
4. Importación: `src/lib/importExport/promocion.ts`, `titularidadImportacion.ts` — conserva porcentajes y detecta duplicados.
5. Cambio de titularidad: solo master (`propietarioCanonicoInalterado`, `firestore.rules:1145-1152`).

**Persistencia:** `inmuebles`, `titularidades`, `registros_patrimoniales`, `personas`, `propietarios`, `audit_logs` (solo en escrituras master).

**Puntos de inconsistencia detectados:**
- El índice `titularesIds` está **aplazado** como fuente de autorización en el alta (`firestore.rules:1005-1015`: no se admite declarar cotitulares al crear), pero la UI escribe titulares de ámbito. Convive con `titularidades`; dos fuentes que pueden divergir sin reconciliación automática.
- El borrado de inmueble es solo master (`allow delete: if isMasterAdmin()`), correcto; la baja patrimonial usa `bajaPatrimonialInmuebleFirestore.ts` (baja lógica), correcto.
- **Efecto de A-01:** si el inmueble se borra con contratos asociados, no hay integridad referencial en reglas.

**Nivel: E2** (`tests/alta-inmueble-titulares-existentes.test.tsx`, `edicionTitularInmueble`, `edicionOrdinariaVsTransmision`, `baja-patrimonial-inmuebles`, `h7`, `h9`, `h10`, `h11`, `copia-propiedad-politica-reglas`). Queda en E1 la comprobación con datos reales de participaciones y la UI completa. **E4 pendiente.**

---

## D2 · Alquiler e inquilino

**Esperado:** solicitud pública → candidato → visita reservada por enlace → documentación → aprobación → contrato → acceso al portal → obligaciones, justificantes, incidencias y consulta posterior.

**Operaciones reales:**
1. Alta pública: `registrarSolicitudPublica` con `conIdentidadCanonica` (AG-01 cerrado) → `solicitudes` + `candidatos`.
2. Visita: `GET /api/visita/:token`, `POST /reservar` (transacción lógica de 3 escrituras con precondición de versión: slot + invitación + candidato), `POST /cancelar`.
3. Cuestionario/documentación: `GET/POST /api/cuestionario|documentacion/:token` con listas blancas; subida a `documentos_solicitados/{solicitudId}/…` mediante sesión reanudable del servidor.
4. Contrato: `FormalizacionSection` → `persistirTransicionAlquilerFirestore` (commit único contrato + inmueble + ficha pública + auditoría).
5. Acceso del inquilino: cuenta creada por invitación (`enlaceInquilinoValido`), `contratoIds` 1–5.

**Persistencia:** `solicitudes`, `candidatos`, `invitaciones`, `slots_visita`, `solicitudes_documentacion`, `contratos_formalizacion`, `usuarios`/`usuarios_auth`, Storage documental.

**Puntos de inconsistencia:**
- **A-04:** la reserva no valida el estado de la invitación; un enlace cancelado puede reservar.
- **A-13:** el alta anónima admite campos arbitrarios.
- Si falla la escritura del candidato tras la solicitud, el flujo continúa (decisión documentada en `solicitudPublica.ts`: la solicitud es el dato crítico) → puede quedar una solicitud sin candidato; se avisa por el canal de diagnóstico, no se bloquea.
- La reserva es atómica lógicamente pero `escribirAtomico` depende del puerto REST: con conflicto devuelve 409 y no escribe nada (correcto).

**Nivel: E2 + E3** (`ag01-alta-publica-solicitud`, `ag02-portales-publicos`, `servicePortalPublico.test.ts` 539 L, `rutasPortalPublico.test.ts`, emulador `documentos-servidor`). La UI completa del candidato queda en **E1**; **E4 pendiente**.

---

## D3 · Propietario

**Esperado:** acceso a sus inmuebles, contratos, información económica, facturas, gastos, documentación, incidencias, informes y exportaciones, **sin** acceso a carteras ajenas.

**Operaciones reales:** `scopedInmuebles` (`App.tsx:719-760`) + suscripciones con `DataAccessScope`; reglas por `propietarioId`/`propietarioPrincipalId`/`titularesIds`; exportación `ImportExportPanel` (panel de datos) y `InformesSection`.

**Persistencia:** lectura de 20+ colecciones; escritura de sus inmuebles/contratos/gastos.

**Puntos de inconsistencia:**
- **A-20:** el propietario **no** está expuesto; el exceso es del PROFESIONAL. Verificado que la rama `isPropietarioRole()` no incluye `candidatos.list` ni `solicitudes`.
- **A-08:** su panel comercial/candidatos está vacío (no es fuga, es carencia).
- **A-05:** no puede crear profesionales privados.
- **A-01:** puede borrar contratos con histórico de cobros.
- Exportaciones: dependen de datos correctos (A-02 en importes).

**Nivel: E2** (`acceso-propietarios`, `propietarioPortal`, `carteras-*`, `bloque-12-a01-ambito-suscripciones`). **E4 pendiente** (no se ha navegado como propietario).

---

## D4 · Profesional

**Esperado:** recibe encargos, presupuesta, ejecuta, documenta, factura, aporta evidencias; relación encargo ↔ inmueble ↔ gasto ↔ documento.

**Operaciones reales:** `ProfesionalPortalSection` (1.126 L) con pestañas; `trabajos_profesionales`, `presupuestos_profesionales`, `valoraciones_profesionales`; puente OT→gasto en `src/utils/gastosEngine.ts:656-710` (`estadoGasto` por defecto `PAGADO`, fecha de pago = devengo).

**Persistencia:** colecciones de profesionales + `gastos` + `documentos_profesionales`.

**Puntos de inconsistencia:**
- **A-05:** el alta de profesional privado por el titular falla.
- **A-20:** el profesional ve candidatos/solicitudes ajenos (fuera de su encargo).
- El puente OT→gasto crea el gasto como **PAGADO** por defecto: si el trabajo no está pagado, el dato económico nace incorrecto. Es una decisión del motor (`estadoGasto = 'PAGADO'`) sin verificación de la factura; **se señala como riesgo de integridad** (no se eleva a defecto confirmado porque la UI puede pasar otro estado).
- La factura del profesional y el gasto son documentos distintos sin clave de enlace obligatoria; el vínculo es `trabajoId`/`incidenciaId` (correcto cuando se usa).

**Nivel: E2** (`test-circuito-mantenimiento-completo`, `test-presupuestos-circuito`, `test-puente-ot-gasto`, `test-matching-asignacion-profesionales`, `profesionalesEngine`). **E4 pendiente.**

---

## D5 · Cobros y justificantes

**Esperado (crítico del encargo):** subir un justificante **no** debe generar un cobro contable ni demostrar por sí solo que el dinero se recibió.

**Verificación realizada (la más importante de este recorrido):**
- `server/cobros/justificantesCobro.ts` declara y **cumple**: presentar/aceptar/rechazar/rectificar no toca `importeRecibido`, `fechaPago`, `estado`, tesorería ni conciliación. El único punto de decisión (`:951`) escribe estado del justificante y evento de auditoría.
- Las colecciones de justificantes (`justificantes_cobro`, `justificantes_cobro_auditoria`) **no tienen regla de cliente**: solo servidor.
- El cliente (`PresentarJustificanteCobro.tsx`) usa clave de idempotencia por (contrato, cobro) con `sessionStorage`, invalidada si cambia el payload.
- El cobro solo cambia por `registrarPagoPeriodo` desde `CobrosSection` (acción humana explícita, con importe y fecha).

**Puntos de inconsistencia:**
- **A-01:** ese `registrarPagoPeriodo` escribe el histórico mutable; el problema no es «justificante ⇒ cobro», sino que el cobro en sí no es inmutable.
- Si la subida del justificante falla, la UI no guarda el pago (orden correcto: primero custodiar, luego registrar).
- No se ha verificado la recuperación tras corte de red a mitad de subida (el servicio tiene `REINTENTO_SUBIDA` y `ERROR_SUBIDA` en auditoría).

**Nivel: E2 + E3** (`justificantesCobro.test.ts` 555 L, `rutasJustificantesCobro`, emulador `justificantes-cobro` 1 caso + proceso de recuperación, `PresentarJustificanteCobro.ui.test.tsx`, `JustificantesCobroInbox.ui.test.tsx`). **E4 pendiente.**

---

## D6 · Gastos, facturas y fiscalidad

**Esperado:** alta manual y por OCR; factura asociada; deducibilidad explícita; clasificación; vinculación al inmueble correcto; conservación documental; informes y exportación.

**Operaciones reales:** `GastoModal` → `saveGastoFirestoreWithResult` (resultado explícito, no traga errores); `normalizarGasto` fija `PAGADO` con fecha y limpia fecha en `PENDIENTE`/`ANULADO` (`gastosEngine.ts:269-275`); deducibilidad por categoría + regla (`deducibilidadEngine.ts`).

**Puntos de inconsistencia:**
- **A-06:** factura manual invisible para fiscalidad y P6.
- El formulario permite `aCargoDe` propietario/inquilino; no hay validación de que el inmueble pertenezca al `propietarioId` del gasto en la regla (`gastos.create` solo exige `inmuebleId` string y `propietarioId` propio) → un gasto puede apuntar a un inmueble de otro propietario **dentro del propio ámbito** de escritura (no se ha encontrado explotación cruzada porque la consulta y la lectura se filtran por `propietarioId`). Se registra como riesgo de integridad referencial (**P3**, no confirmado como explotable).
- `estado` y `fechaPago` normalizados evitan «pagado sin fecha», pero no impiden volver de `PAGADO` a `PENDIENTE` por edición (no hay regla que lo impida). Riesgo económico de reapertura silenciosa → incluido en A-01.

**Nivel: E2** (`GastoModal.test.tsx`, `gastosPersistenciaVerificada`, `tests_fiscal_anual.ts`, `expedienteFiscal.test.ts`). **E4 pendiente.**

---

## D7 · Mantenimiento e incidencias

**Esperado:** comunicación → asignación → actuación → presupuesto → ejecución → factura → gasto → evidencias → resolución → historial.

**Operaciones reales:** `incidencias` (create por inquilino con campos obligatorios y `origen INQUILINO`), `trabajos_profesionales` (avance por el profesional asignado), puente a `gastos`, `garantias_reparacion`, `tareas_mantenimiento` (solo propietario/admin), seguimiento con hilo de eventos (`server/seguimiento/*`) y notificación por el dispatcher.

**Puntos de inconsistencia:** el gasto nace `PAGADO` por defecto en el puente OT→gasto (ver D4); no hay transacción entre «trabajo terminado» y «gasto creado» → puede quedar trabajo sin gasto (recuperable manualmente). La trazabilidad sí existe (`historial` del trabajo).

**Nivel: E2** (circuitos completos en `test-circuito-mantenimiento-completo.ts` 26 KB y `test-compromisos`/`seguimiento`). **E4 pendiente.**

---

## D8 · Avisos y rentas

**Esperado:** condiciones de activación, fechas, destinatarios, idempotencia, errores, reintentos, actualización de renta, vista previa, confirmación y persistencia; distinguir simulación de operación efectiva.

**Verificado:**
- Cron `GET /api/cron/avisos` exige `Bearer CRON_SECRET` (comparación en tiempo constante); sin secreto → 503 sin ejecutar; sin cuenta de servicio → 503.
- Regla del día 5: por contrato con mensualidad vencida e impagada avisa al inquilino y al propietario con idempotencia determinista por (contrato, periodo). **No escribe cobros** (`relojAvisos.ts:1-30`).
- Sin transporte real, las notificaciones quedan `FALLIDA` con causa: no hay «enviado» falso.
- P4: previsualización con huella, evidencia de comunicación obligatoria, confirmación explícita, idempotencia, anexo v1 inmutable.

**Puntos de inconsistencia:**
- **A-02:** el importe reclamado no refleja la subida de renta en periodos ya generados.
- El cron depende de que Vercel lo dispare (V-2): no hay verificación de ejecución real.
- El envío real depende de `EMAIL_PROVEEDOR` (V-2).

**Nivel: E2** (`p1-avisos-cierre-aceptacion`, `notificaciones*` 4, `smtp-aceptacion-regresion`, `servicioActualizacionRenta.test` 467 L, `rutasActualizacionRenta.test`). Entrega real: **V**.

---

## D9 · OCR documental

**Esperado:** imagen/PDF → extracción → revisión manual → detección de duplicados → confirmación → gasto → custodia del original → relectura → cancelación; tratar gastos pagados o anulados.

**Verificado:**
- OCR en navegador (`tesseract.js`, `pdfjs-dist`) cargado en *chunks* separados; nunca envía el binario a un tercero.
- Dedupe por inmueble con tres niveles (`exacto`, `anulado`, `posibles`) y clave `factura:{inmueble}:{nif}:{numero}` + SHA-256.
- ID estable `gas_ocr_<hash40>`: el reintento no crea un segundo gasto.
- **P5.3/P5.4:** un gasto ya pagado o editado no se sobrescribe; un alta ANULADA bloquea el reescaneo y exige reactivación explícita.
- Confirmación en 3 etapas **no atómicas**, declaradas: si falla la custodia se borra el gasto; si no se puede borrar se ANULA con nota; si tampoco, el error identifica el gasto y pide revisión. **No se muestra éxito falso.**

**Puntos de inconsistencia:** entre la etapa 1 y 2 existe una ventana con gasto sin documento (mitigada por la anulación); el mensaje final describe el estado real, no un éxito. No hay prueba con Storage real degradándose (solo dobles).

**Nivel: E2** (`EscanerFacturaModal.test.tsx`, `flujoFacturaOcr` ejercitado en `src/test/e`, `GastoModal.test.tsx`). **E4 pendiente.**

---

## D10 · Asesoría y exportaciones

**Esperado:** expediente por inmueble/periodo, integridad documental, procedencia de datos, hashes, advertencias, sin movimientos inventados.

**Verificado:** `paqueteAsesor/motor.ts` es determinista (mismo input + `generatedAt` ⇒ ZIP byte a byte), reutiliza `COLUMNAS_CSV` y `crearZip`; verifica cuadre de ingresos/gastos; declara incidencias de cobertura en lugar de inventar; aplica ámbito autorizado (`AmbitoAutorizado`); tope de 120 inmuebles. Las filas proceden de datos persistidos (contratos con `registroCobros`, `gastos`), no de cálculos provisionales.

**Puntos de inconsistencia:** **A-06** (faltan facturas manuales); **A-02** (importes) y **A-01** (histórico alterable) afectan a la fiabilidad del paquete. Los `justificanteUrl` no custodiados no siempre se distinguen en el índice.

**Nivel: E2** (`paqueteAsesor.test`, `adaptador.test`, `verificador.test`, `auditoriaAdversarial.test`, `p6.test`, `expedienteFiscal.test`, `hash-isomorfico`). **E4 pendiente.**

---

## D11 · Enlaces públicos y tokens

**Esperado:** creación, caducidad, acceso, revocación, reutilización, limitación de permisos y no exposición de información por enlaces compartidos.

**Verificado:** creación por el gestor (`CrearEnlaceSolicitudModal`, `CrearSolicitudDocModal`), token de capacidad de 6–199 caracteres, resolución contra la base con nombre, lista blanca de campos, sin enumeración, compatibilidad con documentos heredados **solo** si no tienen token, subida a rutas validadas (`documentos_solicitados/{id}/…`).

**Puntos de inconsistencia:** **A-04** (sin caducidad, sin revocación, estado no validado) y **A-13** (sin límite de tasa). El token se devuelve en la respuesta de la invitación (`sanearInvitacion` incluye `token`), lo que es necesario para operar pero amplía la superficie si se registra en logs.

**Nivel: E2 + E3** (`ag02-portales-publicos.test.ts`, `rutasPortalPublico.test.ts`, `servicioPortalPublico.test.ts`, emulador de documentos). **E4 pendiente.**

---

## D12 · Importación, exportación y recuperación

**Esperado:** formato, validación, datos incompletos, duplicados, errores parciales, compatibilidad, restauración y recuperación tras interrupción.

**Verificado:** preflight con estadísticas (`preview.ts`), dedupe por 5 niveles incluido intra-lote, ids deterministas, conservación de duplicados de origen enlazados (no fusionados), parser XLSX propio con soporte de *deflate* (fixtures reales de 12 ficheros), exportación canónica con `COLUMNAS_CSV`.

**Puntos de inconsistencia:** la **restauración completa** (copia → sistema) no existe como función de producto: hay importación de datos, no *restore*. La recuperación tras interrupción depende de que la importación sea reejecutable (lo es por ids deterministas), pero **no hay transacción global**: un fallo a mitad deja filas aplicadas (comportamiento declarado: errores parciales).

**Nivel: E2** (`import-export-xlsx`, `import-export-canonico`, `import-export-auditoria`, `import-export-panel`, `importacion.test`, `bloque-8-migracion-historica`, `migracion-dry-run-b4`). **E4 pendiente.**

---

## D13 · Portal del inquilino (añadido)

**Esperado:** ver contrato, recibos, justificantes, incidencias, mensajes, suministros, actas; crear incidencia; presentar justificante.

**Verificado:** `usePortalInquilino` lee por `get` directo siguiendo `contratoIds` (sin listar), con suscripción viva al contrato; reglas que solo permiten añadir evidencias; `PresentarJustificanteCobro` usa el servidor.

**Puntos:** si `contratoIds` está vacío, muestra un mensaje claro y no error; la cuenta nace por invitación (no autorregistro libre). **Nivel: E2** (UI tests + reglas). **E4 pendiente.**

---

## D14 · Administración de usuarios y bajas (añadido)

**Esperado:** alta por invitación, activación nominal, baja auditada sin purga, revocación del espejo.

**Verificado:** `allow delete: if false` en `usuarios` (baja lógica), revocación de espejo, `deleteUsuarioFirestore` lanza error explicando que no se purga. `baja-usuarios.test.ts` y `admin-usuarios.test.ts` lo cubren. **Nivel: E2.**

---

## Resumen de niveles

| Nivel | Recorridos | Comentario |
|---|---|---|
| E4 | 0 | Sin entorno autorizado ni datos de prueba reales |
| E3 | D2, D5, D11 (parcial, vía CI del mismo árbol) | Emulador oficial en CI, no en esta máquina |
| E2 | D1, D3, D4, D6, D7, D8, D9, D10, D12, D13, D14 | Pruebas automatizadas ejecutadas localmente |
| E1 | Partes de todos (UI completa, navegación real, recuperación de red) | Sin pruebas E2E de navegador |
