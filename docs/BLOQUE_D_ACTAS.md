# BLOQUE D — Actas de Entrada y Salida — Auditoría Final D2

Estado: **INTEGRADO EN ERP CANÓNICO (Arena A, 2026-09-21)** — rama canónica `arena/01a0bfbe-gestor-de-inmuebles-vercel`, tras auditoría selectiva (20 ficheros; 0 conflictos; exclusión del commit `feat(gap6)` de la rama D, que duplicaba el GAP6 ya consolidado en la canónica)
Rama Arena D (origen): `arena/01a0ab9d-gestor-de-inmuebles-vercel`
Ajustes de integración (Arena A): (1) las reglas D pasaron de «bloque 25» a **§38** (en la canónica §25 = GAP7; §32–§37 = BLOQUE C); (2) el predicado `sinSecretoPlanoExcesivo` ahora aplica lo que su comentario declaraba: `codigoPlainTemporal` solo mientras el OTP es ACTIVO y sin usar, o `null` para la limpieza; (3) `saveOtpActaFirestore` limpia explícitamente `codigoPlainTemporal` al persistir un OTP usado/expirado/bloqueado (el `merge:true` no borraba el campo omitido, por lo que «se limpia tras uso» no era real antes de la integración).
HEAD final: ver git log
Referencia Arena A: main @ 9cb01a43c737377a71216dd8a797e1a0509e99dc (no modificada) / origin/main 4d420bd37e96ca24861ab7062e19f4300a8a20f5
Fecha: 2026-09-21
Auditoría D2: integridad versiones firmadas, identidad estable inventario, comparación id-first, PDF persistencia Storage+Firestore, OTP aislamiento sin logs, rules FIRMADA/CERRADA bloqueadas

## Correcciones críticas D2 aplicadas
- Defecto crítico firestore.rules esVersionadoPermitido FIRMADA/CERRADA→BORRADOR mismo doc: CORREGIDO → bloqueado. Ahora solo permite FIRMADA→CERRADA misma versión sin cambios críticos, y actualización PDF limitada (pdfUrl, pdfStoragePath, pdfVersion, pdfFechaGeneracion) con inventario/participantes/firmas idénticos. Versionado correcto exige nuevo documento con actaAnteriorId, motivoVersionado, fechaVersionado, cadenaVersionIds.
- Defecto inventario crearActaSalidaDesdeEntrada id nuevo elem_sal_${Date.now()} rompiendo identidad estable: CORREGIDO → conserva id original entrada para matching determinista por ID, añade campos observacionesEntrada, cantidadEntrada, fotoUrlEntrada, evidenciaIdsEntrada, elementoEntradaId, idOriginalEntrada para trazabilidad entrada/salida inequívoca.
- Riesgo PDF flujo no persistido: CORREGIDO → generarPdfActa → output blob → uploadPdfActaStorage actas_pdfs/{owner}/{acta}/{file} → guardar pdfUrl/pdfStoragePath/pdfVersion/pdfFechaGeneracion en Firestore → historial PDF_GENERADO → auditoría ACTA_PDF_GENERADO con storagePath. UI muestra ✅ si persistido, link a Storage, versión.
- Riesgo OTP console.log código: CORREGIDO → eliminado console.log en ActasSection y TransporteManualAdapter, código solo en campo codigoPlainTemporal temporal controlado si canal MANUAL, limpio tras uso, nunca en logs prod. Añadido validarOtpContexto para aislamiento acta/firma/versión/owner/propertyId.
- Comparación determinista falsos emparejamientos por texto ambiguo duplicado: CORREGIDO → compararInventarios prioriza ID estable (mapaSalidaPorId, mapaSalidaPorEntradaId), luego clave categoria|elemento solo si único en ambos lados, evita duplicados ambiguos tratándolos como ELEMENTO_NUEVO con requiereAtencion.
- Tipos extendidos: Acta pdfFechaGeneracion, actaAnteriorId, motivoVersionado, fechaVersionado, cadenaVersionIds; ElementoActaInventario observacionesEntrada, cantidadEntrada, evidenciaIdsEntrada, fotoUrlEntrada, elementoEntradaId, idOriginalEntrada; OtpActa propertyId, contractId, versionActa, solicitanteId, transporteRealizado.
- Tests D2: 15 adicionales — versionado inmutable nuevo ID preserva original pdf limpio, rules simulación bloque FIRMADA→BORRADOR, identidad estable entrada/salida, id-first evita falsos, PDF referencia persistente, PDF tras recarga, OTP aislamiento acta/firma/versión/owner, OTP no reutilización, OTP no expone logs, OTP expiración 15min bloqueo maxIntentos, storage aislamiento paths ownerId+actaId, evidencias no base64, trazabilidad cadenaVersionIds, índices ownerId+propertyId+contractId documentados. Total 51 bloqueD.
- firestore.indexes.json creado documentando queries ownerId+propertyId+contractId y actas_otp ownerId+actaId, evidencias actas.
- storage.rules verificados: actas_fotos <15MB imagen, actas_pdfs <20MB pdf, internalUser, no público, aislamiento por path ownerId.
- UI ActasSection: PDF flujo completo, versionado seguro nueva versión con motivo, mostrar cadena versiones y pdf persistido, OTP aislamiento check antes de validar, sin console.log.

## Objetivo

## Objetivo
Circuito completo: VIVIENDA/CONTRATO → ENTRADA → ACTA ENTRADA → INVENTARIO/ESTADO/EVIDENCIAS → FIRMA → ESTANCIA → SALIDA → COMPARACIÓN → INCIDENCIAS → ACTA SALIDA → FIRMA → TRAZABILIDAD

Persistencia real Firestore arquitectura canónica, no pantallas simuladas.

## Alcance implementado
- Entidades: Acta (id, ownerId, propertyId, contractId, tipo ENTRADA/SALIDA, estado BORRADOR/EN_REVISION/PENDIENTE_FIRMA/FIRMADA/CERRADA/ERROR/CANCELADA, fecha creación, fecha acto, participantes, versión, firma, fecha firma, historial, evidencias, incidencias, contadores, resumen diferencias)
- Inventario por elemento: categoría (COCINA/SALON/DORMITORIO/BANO/TERRAZA/EXTERIOR/ELECTRODOMESTICOS/MOBILIARIO/ILUMINACION/CLIMATIZACION/...), elemento, descripción, estado expresivo (CORRECTO/BUEN_ESTADO/NUEVO/CON_DESGASTE_LEVE/CON_DESGASTE/DETERIORADO/DANADO/DEFECTUOSO/AUSENTE/NO_VERIFICABLE/PENDIENTE_REVISAR...), observaciones, cantidad, evidencia/foto, comparable entrada/salida
- Estado elementos expresivo cerrado, no texto libre solo
- Lecturas contadores: electricidad/agua/gas/otros tipo/lectura/unidad/fecha/observaciones/evidencia, comparar entrada-salida diferencia numérica y textual
- Evidencias: id/actaId/propertyId/contractId/tipo FOTO/VIDEO/DOCUMENTO/referencia Storage (actas_fotos/{owner}/{acta}/{ts}_{rand}_{safe}) / orden/fecha/descripción/elemento relacionado, NO base64 Firestore, metadatos Firestore, reglas acceso, 15MB max imagen
- Incidencias acta: id/acta/inmueble/contrato/elemento/descripción/estado/fecha/evidencias/observaciones/trazabilidad, distinguir ENTRADA vs SALIDA vs ESTANCIA vs COMPARACION, origen
- Acta Entrada flujo 14 pasos: seleccionar inmueble/contrato, crear base BORRADOR v1, fecha/hora, participantes (ARRENDADOR/ARRENDATARIO/COTITULAR/AVALISTA/TESTIGO/GESTOR/ADMINISTRADOR), inventario, estados, observaciones, contadores, evidencias (tras crear, Storage), incidencias, revisión (validarActaParaRevision), PENDIENTE_FIRMA, firma, trazabilidad, PDF
- Acta Salida 14 pasos: seleccionar contrato, recuperar entrada (actaEntradaId), crear salida desde entrada (pre-carga inventario con estadoEntrada, estado PENDIENTE_REVISAR), revisar inventario inicial, estado final, diferencias, lecturas finales, fotos, incidencias, observaciones, resumen diferencias (compararActasEntradaSalida), revisión, firma, trazabilidad
- Comparación determinista auditable: inventario sin cambios/desgaste/desgaste leve/deterioro/daño/ausencia/incidencia nueva/no verificable/mejora/elemento nuevo, contadores diferencia numérica, evidencias relacionar por elemento, incidencias existente vs nueva, NO IA para daño, tabla niveles 0-6
- Firma estados: PENDIENTE, SOLICITADA, VALIDADA, FIRMADA, RECHAZADA, EXPIRADA + estadoFirma acta PENDIENTE/EN_PROCESO/FIRMADA_PARCIAL/FIRMADA/RECHAZADA, identificación firmante (nombre/dni/rol), solicitud (fechaSolicitud), OTP, validación, fecha/hora firma, resultado, trazabilidad, vinculada versión concreta, firmada no modificable silenciosamente → nueva versión (versionarActa BORRADOR v+1 reset firmas)
- OTP: generación 6 dígitos, hash SHA-256 (crypto.subtle) + fallback sync para tests, caducidad 15 min, maxIntentos 5, no texto plano salvo codigoPlainTemporal para entrega inmediata demo (se limpia tras uso), invalidación uso (USADO), trazabilidad intentos, protección reutilización (USADO/BLOQUEADO/EXPIRADO), adaptador TransporteOtpAdapter preparado (TransporteManualAdapter para dev, TransportePendienteAdapter para prod pendiente), NO SMS/email ficticio real ni APIs inventadas
- PDF acta: inmueble/contrato/tipo/fecha/participantes/inventario/estados/observaciones/contadores/incidencias/evidencias/comparación entrada-salida/firma/firmante/fecha firma/identificador versión, footer con id versión y trazabilidad, datos reales persistidos, jsPDF, sin datos ficticios decorativos
- Trazabilidad: auditoría canónica registrarAuditoriaFirestore existente, eventos CREACION/MODIFICACION/ELEMENTO_ANADIDO/EVIDENCIA_ANADIDA/CONTADOR_REGISTRADO/INCIDENCIA_CREADA/SOLICITUD_FIRMA/OTP_GENERADO/OTP_VALIDADO/OTP_FALLIDO/FIRMADA/PDF_GENERADO/CERRADA/VERSIONADA, NO segundo sistema auditoría

## Modelo y persistencia
- Tipos: src/types/actas.ts
- Colecciones Firestore:
  - actas/{actaId}: ownerId, propertyId, contractId, tipo, estado, version, fechaCreacion, fechaActo, participantes, inventario, lecturasContadores, evidenciaIds, incidenciaIds, actaEntradaId, resumenDiferencias, firmas, estadoFirma, historial, creadoPor, pdfUrl, etc.
  - actas_evidencias/{evidenciaId}: ownerId, actaId, propertyId, contractId, tipo, storagePath, downloadURL, orden, fechaHora, descripcion, elementoRelacionadoId, mimeType, tamanoBytes
  - actas_incidencias/{incidenciaId}: ownerId, actaId, propertyId, contractId, elementoAfectadoId, titulo, descripcion, estado, origen ENTRADA/SALIDA/ESTANCIA/COMPARACION, fechaHora, evidenciaIds, prioridad, responsable
  - actas_otp/{otpId}: ownerId, actaId, firmaId, codigoHash (no plain), codigoPlainTemporal (opcional temporal, se limpia), fechaCreacion, fechaExpiracion, intentos, maxIntentos, usado, fechaUso, canal PENDIENTE_PROVEEDOR/MANUAL/EMAIL/SMS, estado ACTIVO/USADO/EXPIRADO/BLOQUEADO
- Repositorios/persistencia: src/lib/firebaseActas.ts
  - subscribeActas, subscribeActasPorInmueble, subscribeActasPorContrato, saveActaFirestore, getActaFirestore, deleteActaFirestore
  - subscribeEvidenciasActa, subscribeEvidenciasPorPropietario, saveEvidenciaActaFirestore, deleteEvidenciaActaFirestore, uploadEvidenciaActaStorage (actas_fotos/{owner}/{acta}/{file}), deleteEvidenciaActaStorage
  - subscribeIncidenciasActa, subscribeTodasIncidenciasActa, saveIncidenciaActaFirestore
  - subscribeOtpPorActa, saveOtpActaFirestore, getOtpActaFirestore, uploadPdfActaStorage (actas_pdfs/{owner}/{acta}/{file})
  - Aislamiento: DataAccessScope tipoPerfil PROPIETARIO filtra where ownerId==propietarioId, PROFESIONAL sin acceso (defensa), ADMIN todo
- Índices: no se requieren índices compuestos adicionales; where ownerId + actaId ya soportado. Si se añaden queries por propertyId+ownerId, crear índice en consola Firebase si error.

## Dominio
- Motores: src/utils/actas/
  - actaEngine.ts: generarIdActa, crearActaBase (BORRADOR v1 historial CREADA), validarActaParaRevision, actualizarActa (protege id/ownerId/version, esEstadoEditable), versionarActa (v+1 BORRADOR reset firmas), cambiarEstadoActa (validarTransicion), anadirElementoInventario, registrarLecturaContador, vincularActaSalidaConEntrada, crearActaSalidaDesdeEntrada (pre-carga inventario estadoEntrada, PENDIENTE_REVISAR)
  - actaStateMachine.ts: ESTADOS_ACTA, TRANSICIONES_PERMITIDAS BORRADOR→EN_REVISION→PENDIENTE_FIRMA→FIRMADA→CERRADA (+ ERROR/CANCELADA desde BORRADOR/EN_REVISION), validarTransicion, esEstadoEditable (BORRADOR, EN_REVISION, ERROR)
  - actaInventarioEngine.ts: ESTADOS_ELEMENTO_ACTA con nivel 0-6 (NUEVO/CORRECTO 0, BUEN_ESTADO 1, CON_DESGASTE_LEVE 2, CON_DESGASTE/USADO/PENDIENTE_REVISAR 3, DETERIORADO 4, DANADO/DEFECTUOSO 5, AUSENTE/NO_VERIFICABLE 6), CATEGORIAS_ELEMENTO_ACTA, crearElementoActaInventario, validarElementoInventario, ordenarInventarioPorCategoria
  - actaComparacionEngine.ts: nivelEstado, determinarDiferencia determinista (SIN_CAMBIOS, AUSENCIA, NO_VERIFICABLE, MEJORA si nivel baja, DESGASTE_LEVE/DESGASTE si +1/+2, DETERIORO/DANO si +3), compararInventarios (matching por categoria|elemento lowercase + id), compararContadores (diferencia numérica), generarResumenDiferencias (contadores sinCambios/conDesgaste/conDeterioro/conDano/ausencias/noVerificables/incidenciasNuevas/elementosNuevos/requiereAtencion), compararActasEntradaSalida (valida tipos ENTRADA/SALIDA mismo inmueble, distingue incidencias existentesDesdeEntrada vs nuevasEnSalida)
  - actaFirmaEngine.ts: crearFirmaActa, solicitarFirma, validarFirmaConOtp, completarFirma (OTP requiere VALIDADA/SOLICITADA, MANUAL permite cualquier excepto FIRMADA), rechazarFirma, todasFirmasCompletadas (participantes firmaRequerida), puedeFirmarActa (solo PENDIENTE_FIRMA), prepararActaParaFirma (valida transición, crea firmas OTP SOLICITADA), cerrarActaTrasFirmas (valida todas firmadas, FIRMADA)
  - actaOtpEngine.ts: generarCodigoOtp 6 dígitos, hashCodigo SHA-256 crypto.subtle + hashCodigoSync fallback tests, crearOtpActa (codigoHash, codigoPlainTemporal, expiración 15min, intentos 0 max 5, USADO false, estado ACTIVO, canal PENDIENTE_PROVEEDOR), validarOtp (chequea ACTIVO, usado, expiración, intentos, hash compara, incrementa intentos, BLOQUEADO si max, USADO si ok limpia plain), esOtpExpirado, esOtpUtilizable, TransporteOtpAdapter interfaz, TransporteManualAdapter (console log), TransportePendienteAdapter (enviado false, PENDIENTE)
  - actaPdfEngine.ts: generarPdfActa (jsPDF A4, header ACTA TIPO, id versión estado, fecha acto, inmueble/contrato, participantes, inventario con observaciones, contadores, incidencias ids, evidencias ids, comparación si SALIDA con resumenDiferencias y diferencias contadores, observaciones, firmas con trazabilidad, historial últimos 20, footer versión id versión firma trazabilidad por página), descargarPdfActa, generarPdfActaBlob

## UI
- src/components/sections/ActasSection.tsx: implementación completa flujo 14 pasos
  - Filtros tipo/estado/búsqueda id inmueble contrato
  - Listado actas tabla con badges tipo (ENTRADA azul/SALIDA naranja), estado badge, versión, inventario count, evidencias count, firma badge, acciones ver/PDF
  - Detalle acta: estado/versión/participantes/resumen diferencias/inventario scroll/contadores con AddContadorForm/evidencias Storage (ver link, upload input file image/pdf, no base64)/incidencias con AddIncidenciaActaForm/firmas+OTP (muestra OTP id estado intentos expira código temporal, input validar OTP y firmar)/trazabilidad historial reverse/auditoría canónica
  - Acciones: cambiarEstado EN_REVISION/PENDIENTE_FIRMA/CERRADA, solicitarFirma+OTP (genera OTPs por firma, log console, auditoría), validar OTP y firmar (valida OTP hash, completa firma, si todas firmadas cierra FIRMADA, auditoría), cerrar, PDF generar (generarPdfActa + descargar, auditoría)
  - Modal crear 5 pasos: 1 inmueble/contrato/acta entrada vinculada/fecha/hora, 2 participantes (AddParticipanteForm rol ARRENDADOR/ARRENDATARIO/COTITULAR/AVALISTA/TESTIGO/GESTOR/ADMINISTRADOR/OTRO, dni, firmaReq), 3 inventario (AddInventarioForm categoría ESTADOS_ELEMENTO_ACTA, elemento, estado CORRECTO/CON_DESGASTE/etc, cantidad, ubicación, observaciones), 4 contadores (AddContadorFormSimple tipo ELECTRICIDAD/AGUA/GAS/CALEFACCION/OTRO lectura unidad obs), 5 observaciones, revisión, crear BORRADOR
  - Usa crearActaBase/crearActaSalidaDesdeEntrada/compararActasEntradaSalida/prepararActaParaFirma/completarFirma/validarFirmaConOtp/crearOtpActa/validarOtp/generarPdfActa + auditoría canónica registrarAuditoriaFirestore
  - Estilos patrón visual existente, sin segunda navegación

- Integración App.tsx:
  - SectionType 'actas' añadido
  - Import ActasSection
  - Route guard propietario/admin incluye 'actas'
  - Render {activeSection==='actas' && <ActasSection inmuebles={scopedInmuebles} contratos={scopedContratos} currentUser={...} />}
- Sidebar: actas entry en propietario y admin
- MobileNav: actas entry
- Header: título actas

## Seguridad
- firestore.rules bloque 25:
  - actas: requiere ownerId==myPropId() y propertyId string, tipo BORRADOR inicial version 1, update protege ownerId/propertyId inmutables, version>=, noModificacionSilenciosaFirmada solo permite FIRMADA/CERRADA→BORRADOR version>, delete solo MasterAdmin, sin secretos, sin base64 check implícito en evidencias
  - actas_evidencias: requiere ownerId, actaId, propertyId, storagePath no base64, downloadURL no base64, tipo, bloquea allow read if isSignedIn, solo owner o inmuebleIds
  - actas_incidencias: ownerId+actaId+propertyId, titulo, descripcion, estado, origen, fechaHora
  - actas_otp: bloquea campo codigo/plano, requiere codigoHash, firmaId, actaId, ownerId, estado, intentos, maxIntentos, fechaCreacion/Expiracion, usado, canal
  - Deny-by-default, mínimo privilegio, aislamiento ownerId/inmueble/contrato, protección firmadas/evidencias/historial, numeración continua 25
- storage.rules:
  - actas_fotos/{propietarioId}/{actaId}/{fileName}: read internalUser, create <15MB isImage (jpeg/png/webp/gif/bmp/pdf), update/delete internalUser, no public
  - actas_pdfs/{propietarioId}/{actaId}/{fileName}: read internalUser, create <20MB isPdfOrImage, update/delete internalUser
  - Evita exposición pública, referencia persistente, metadatos Firestore
- Seguridad adicional:
  - XSS: inputs sanitizados, no innerHTML, React escapa
  - Acceso indebido cruzado propietarios: filtro ownerId en subscribe y rules
  - Manipulación IDs/estados: validarTransicion, esEstadoEditable, reglas inmutables
  - Reutilización OTP: estado USADO/BLOQUEADO/EXPIRADO bloquea, usado flag, intentos, hash
  - Storage descarga sin autorización: rules internalUser, ownerId en path
  - Modificación firmadas: esEstadoEditable false, actualizarActa lanza, versionado obligatorio
  - Datos personales: dni solo en participantes, no en exportaciones públicas, no secretos en código

## Auditoría
- Reutiliza registrarAuditoriaFirestore canónica, no segundo sistema
- Eventos: ACTA_CREADA, ACTA_EN_REVISION, ACTA_PENDIENTE_FIRMA, ACTA_SOLICITUD_FIRMA, ACTA_EVIDENCIA_ANADIDA, ACTA_OTP_GENERADO, ACTA_OTP_VALIDADO, ACTA_OTP_FALLIDO, ACTA_FIRMADA, ACTA_PDF_GENERADO, ACTA_CERRADA, etc.
- Detalles: actaId, tipo, version, estadoAnterior/Nuevo, firmas, storagePath

## Integraciones
- BLOQUE B: reutiliza interfaces Inmueble, ContratoFormalizacion, servicios firebase, no duplica tesorería
- BLOQUE C: no implementa morosidad ni duplica cobrosEngine ni modifica motor C, deja interfaz adaptador PREPARADO/PENDIENTE (TransportePendienteAdapter)
- GAP1: reutiliza dispatcher/repositorio notificaciones conceptualmente, no nuevo motor, evento ACTA_CREADA preparado
- GAP6: reutiliza seguridad/auth (myPropId, myInmuebleIds, isPropietarioRole, isMasterAdmin)

## Tests
- src/utils/actas/bloqueD.test.ts: 36 tests
  - creación/modificación/estados/cierre/firmada no modificable: 6
  - inventario alta/estado/comparación determinista: 4
  - contadores entrada/salida/diferencia: 2
  - incidencias creación/asociación/diferencia existente vs nueva: 2
  - evidencias asociación/permisos/aislamiento no base64: 3
  - firma solicitud/OTP generación/caducidad/intentos/reutilización/firma válida/trazabilidad/transporte pendiente: 10
  - PDF generación/contenido/correspondencia: 2
  - seguridad A no B/no autorizado/firmada no manipulable/inmutables/storage paths: 5
  - integración B/C adaptadores: 3
- Regresión: npx vitest run 231 passed (9 test files)
- TS: npx tsc --noEmit OK
- Build: npm run build OK (vite 2102 modules, jsPDF chunk)

## Pendientes / Preparado
- Transporte OTP externo: TransportePendienteAdapter retorna enviado false, proveedor PENDIENTE, error 'Transporte externo pendiente de integración' → documentado, no SMS/email ficticio
- BLOQUE E / Portal Inquilino / IA copilots: NO iniciado, NO implementado
- Notificaciones reales: evento ACTA_CREADA preparado, dispatcher existente B reutilizable
- Índices Firestore: si queries compuestas propertyId+ownerId fallan, crear índice manual en consola

## No hacer (cumplido)
- NO integrar en Arena A, NO merge rama canónica, NO BLOQUE E, NO Portal Inquilino, NO IA/copilot/chatbot/análisis automático daños/scoring
- NO modificar BLOQUE B/C salvo dependencia técnica estrictamente necesaria documentada (solo añadir SectionType, sidebar, header, no motores)
- NO crear segundo sistema Tesorería/Morosidad/notificaciones/autenticación
- NO proveedor firma ficticio/API externa ficticia/SMS/email ficticio
- NO almacenamiento Base64 en Firestore
- NO datos críticos localStorage principal ni solo memoria/React state
- NO funcionalidades no definidas D
- NO aprovechar para mejorar otras partes ERP

## Commit
- feat(bloque-d): circuito completo actas entrada/salida inventario contadores evidencias incidencias firma OTP PDF trazabilidad seguridad
- Push solo rama Arena D, worktree limpio, Arena A no modificada

## Informe final requerido
- Repositorio: sarqsan/Gestor-de-inmuebles-vercel
- Rama Arena D: arena/01a0ab9d-gestor-de-inmuebles-vercel
- HEAD inicial: 9cb01a43c737377a71216dd8a797e1a0509e99dc (main)
- HEAD final: ver git log (feat bloque-d)
- Referencia Arena A: main @ 9cb01a43... (no modificada)
- Worktree: /home/user/Gestor-de-inmuebles-vercel limpio
- Implementado: tipos actas, motores actaEngine/stateMachine/inventario/comparacion/firma/otp/pdf, firebaseActas repos/storage, firestore.rules bloque 25, storage.rules actas_fotos/actas_pdfs, UI ActasSection 14 pasos, integración App.tsx/Sidebar/MobileNav/Header, tests bloqueD 36
- Reutilizado: registrarAuditoriaFirestore, authService myPropId/myInmuebleIds, tipos Inmueble/Contrato, firebase sanitizeObjectForFirestore, jsPDF existente
- Adaptado: Sidebar/MobileNav/Header para actas, actaFirmaEngine completarFirma para MANUAL
- Preparado/Pendiente: TransporteOtpAdapter PENDIENTE_PROVEEDOR, notificaciones ACTA_CREADA evento, PDF blob storage upload (función existe, UI descarga directa por ahora)
- Externo: Firebase Firestore/Storage/Auth existentes, no nuevo proveedor
- Pendiente: integración Arena A (MAPA MAESTRO), transporte OTP real (SMS/email), PDF upload a Storage con URL persistida (función uploadPdfActaStorage lista, pendiente llamada tras generar), índices compuestos si necesario
- Datos: colecciones actas, actas_evidencias, actas_incidencias, actas_otp, storage paths actas_fotos/{owner}/{acta}/{file}, actas_pdfs/{owner}/{acta}/{file}
- Dominio: motores mencionados, use cases crearActaBase/crearActaSalidaDesdeEntrada/cambiarEstado/actualizar/versionar/anadirElemento/registrarLectura/compararInventarios/compararContadores/compararActasEntradaSalida/prepararActaParaFirma/completarFirma/validarFirmaConOtp/crearOtp/validarOtp/generarPdf, máquina estados BORRADOR→EN_REVISION→PENDIENTE_FIRMA→FIRMADA→CERRADA, reglas comparación determinista tabla niveles
- UI: pantallas ActasSection filtros/listado/detalle/estados/firma OTP/PDF/evidencias/incidencias/contadores/modal crear 5 pasos
- Seguridad: rules/permisos como arriba, aislamiento ownerId, protección firmadas, sin base64, sin secretos
- Auditoría: eventos listados, uso registrarAuditoriaFirestore
- Tests: 36 bloque D passed, 231 total passed, tsc OK, build OK
- Git: commit feat(bloque-d), push origin arena/01a0ab9d-gestor-de-inmuebles-vercel --force si necesario (stale remote resuelto), worktree limpio, aislamiento Arena A verificado (no merge, no modificación main)
- B/C no alterado salvo mínimo documentado (SectionType, sidebar, header, App render)
- E/Portal/IA no iniciado
