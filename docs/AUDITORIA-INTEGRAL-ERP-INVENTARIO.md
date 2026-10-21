# AUDITORÍA INTEGRAL — INVENTARIO FUNCIONAL

**SHA:** `2563831df9b026dec8276c45db40977f72883f9d`
**Alcance:** todo lo que existe realmente en el árbol. No se incluye nada que no tenga código, ruta o colección verificable. Lo declarado pero no operativo figura marcado como tal.

Cifras de partida: **223.206 LOC** TS/TSX en `src/` (680 ficheros entre `src`, `server`, `api`, `scripts`, `tests`), `server.ts` 2.908 líneas, `firestore.rules` 4.069 líneas con **84 bloques `match`**, `storage.rules` 66 líneas, **42 secciones**, **37 modales**, **64 colecciones** Firestore referenciadas por el cliente y el conjunto de rutas HTTP de `server.ts` + `server/**` (§3).

---

## 1. Cómo se ha construido

1. Catálogo único de navegación: `src/navegacion/navegacion.ts` (6 grupos) contrastado con el *route guard* real de `src/App.tsx:352-383, 698-717, 4099-4600`.
2. `SectionType` (`src/types.ts`) para destinos sin menú.
3. Rutas HTTP: `grep` de `app.get/post/put/delete` en `server.ts` + `montarRutas*` de `server/**`.
4. Colecciones: `collection(db, '…')` en `src/lib/*` contrastadas con los `match` de `firestore.rules`.
5. Pruebas: 175 ficheros `tests/*.test.ts(x)`, 9 `server/**/*.test.ts`, 6 ficheros de emulador, 282 ficheros de test en total.

---

## 2. Inventario por módulo

Formato: **código** · **entrada** · **escritura** · **colecciones** · **rutas** · **pruebas** · **estado**.

### 2.1 Acceso, identidad, usuarios, auditoría

| Elemento | Detalle |
|---|---|
| Código | `src/lib/authService.ts` (1.628 L), `src/lib/accesoGestores.ts`, `src/lib/accesoPropietarios.ts`, `accesoPropietariosFirebase.ts`, `auditoriaAccesoFirebase.ts`, `src/lib/adminUsuarios.ts` |
| Entrada | `LoginView`, `RegistroAutonomoView`, `PortalRegistroView`, `InvitacionCarteraView`, `RegistroInquilinoView`, `AdministracionSection`, `AdminControlCenter` |
| Escritura | Firebase Auth (email/password, Google), `usuarios/{id}`, `usuarios_auth/{uid}`, espejo de carteras, `enlaces_registro`, `audit_logs` |
| Rutas | — (todo cliente + Auth) salvo `/api/titulares/buscar` con ID token |
| Pruebas | `admin-usuarios`, `baja-usuarios`, `acceso-propietarios`, `acceso-carteras-d2`, `fase14-espejo-identidad`, `app-auth-hook-order`, `carteras-*` (6), `bloque-12-a01-ambito-suscripciones` |
| Estado | **Funcional**; A-07 (`passwordHash`), A-09 (semilla demo) |

### 2.2 Administración y configuración

| Elemento | Detalle |
|---|---|
| Código | `src/components/admin/*` (5), `src/components/sections/AdministracionSection.tsx`, `ConfiguracionSection.tsx`, `src/lib/adminGobiernoIA.ts`, `server/ia/adminIA.ts` |
| Funciones | Alta/baja auditada de usuarios, enlaces de registro, especialidades, contadores, diagnóstico de lecturas de inmuebles, dry-run de fichas públicas, gobierno de IA (cuotas, créditos, bloqueos), módulos del sistema |
| Colecciones | `system/modulos_config`, `system/gmail_config` (solo metadatos), `especialidades`, `enlaces_registro`, `audit_logs` |
| Pruebas | `admin-propietarios-contador-baja`, `diagnostico-lecturas-inmuebles-panel`, `dry-run-fichas-publicas`, `ia-fase2-admin` |
| Estado | Funcional |

### 2.3 Inmuebles

| Elemento | Detalle |
|---|---|
| Código | `InmueblesSection.tsx`, `InmuebleModal` (en `src/components/modals`), `GestionImagenesModal`, `HabitacionesInmueblePanel`, `FichaTecnicaInventarioPanel`, `src/lib/edicionOrdinariaInmueble.ts`, `bajaPatrimonialInmuebleFirestore.ts`, `fichaPublicaInmueble.ts`, `inmuebleCompletitud.ts` |
| Rutas | `POST /api/catastro/consultar` (consulta catastral) |
| Colecciones | `inmuebles`, `habitaciones_inmueble`, `inventario_inmuebles`, `inventario_historial`, `fichas_publicas_inmueble`, `inmuebles/{id}/documentos_patrimoniales` |
| Storage | `inmuebles/{id}/{fichero}` (foto pública, `get` anónimo deliberado) |
| Pruebas | `alta-inmueble-titulares-existentes`, `edicionTitularInmueble`, `edicionOrdinariaVsTransmision`, `baja-patrimonial-inmuebles`, `inmuebleIncompletoEdicion`, `ficha-publica-inmueble`, `reglas-inmuebles` (emulador, 35 casos) |
| Estado | Funcional; transmisión de titularidad requiere master |

### 2.4 Propietarios, titulares, personas, participaciones

| Elemento | Detalle |
|---|---|
| Código | `PropietariosSection`, `PropietarioPortalSection`, `src/lib/titularesModelo.ts`, `src/titularidades/*`, `src/utils/permisosTitulares.ts`, `server/titularidades/*` (búsqueda de titulares con cuenta de servicio) |
| Funciones | Ficha de titular, cotitularidad, participaciones, cambio de titularidad, cónyuge/sociedad, importación que conserva porcentajes |
| Rutas | `POST /api/titulares/buscar` (ID token verificado) |
| Colecciones | `propietarios`, `personas`, `titularidades/{inmuebleId}__{pid}`, `registros_patrimoniales`, `gestiones_cartera` |
| Pruebas | `h7-edicion-ordinaria-titulares`, `h9-cierre-titularidad`, `h10-migracion-porcentajes`, `h11-presentacion-titularidad`, `f2-acceso-titularidades`, `f3-*` (3), `copropiedad-politica-reglas` |
| Estado | Funcional; sin verificación con datos reales de participaciones |

### 2.5 Carteras, invitaciones y delegación

| Elemento | Detalle |
|---|---|
| Código | `src/lib/gestionesCartera.ts`, `gestionesCarteraServicio*.ts`, `indiceEspejoCarteras.ts`, `carterasGestion.ts`, `CarterasOnboardingPanel`, `OnboardingCarterasAdmin`, `InvitacionCarteraView` |
| Reglas | `carterasL` (lectura), `carterasE` (lectura+escritura) **solo escribibles por el master**; `gestiones_cartera` con responsable GESTOR |
| Rutas | `POST /api/titulares/buscar` (derivación de propietario) |
| Pruebas | `carteras-capacidad-adicional`, `carteras-diagnostico-puro`, `carteras-lectura-matriz-reglas`, `carteras-lectura-por-relacion`, `carteras-panel-por-relacion`, `gestiones-cartera-regresion`, `gestiones-cartera-servicio` |
| Estado | Funcional; delegación parcial por inmueble indexada |

### 2.6 Captación pública (portales de candidatos)

| Elemento | Detalle |
|---|---|
| Código | `PortalSolicitudPublicaView`, `PortalVisitaPublicaView`, `CuestionarioPublicoView`, `PortalDocumentacionPublicaView`, `PortalRegistroView`, `RegistroInquilinoView`, `src/lib/solicitudPublica.ts`, `server/portalPublico/*` (916 + 182 L) |
| Rutas | `GET/POST /api/visita/:token`, `/reservar`, `/cancelar`; `GET/POST /api/cuestionario/:token`; `GET/POST /api/documentacion/:token`; `POST /api/documentos/publico/subidas`(+confirmar) |
| Escritura | `solicitudes`, `candidatos`, `invitaciones`, `slots_visita`, `solicitudes_documentacion` |
| Pruebas | `ag01-alta-publica-solicitud`, `ag02-portales-publicos`, `portalPublico/servicio*` (2), `rutasPortalPublico`, `tests/emulador/documentos-servidor` |
| Estado | Funcional; A-04 (sin caducidad/revocación), A-13 (campos abiertos, sin límite de tasa) |

### 2.7 Candidatos, preselección y solvencia

| Elemento | Detalle |
|---|---|
| Código | `CandidatosSection`, `CandidateModal`, `ComparadorCandidatos`, `SolvenciaCard`, `src/utils/solvenciaEngine.ts`, `invitacionesCandidatos.ts` |
| Escritura | `candidatos.estado`, `cuestionario*`, `solvencia*` |
| Pruebas | `solvencia` (dentro de `src/test/e`), `matching-asignacion-profesionales` |
| Estado | **Parcial**: A-03 (resurrección) y A-08 (no visible para propietario/gestor) |

### 2.8 Formalización y contratos

| Elemento | Detalle |
|---|---|
| Código | `FormalizacionSection`, `FormalizarContratoModal`, `CicloContractualPanel`, `src/utils/contratosEngine.ts`, `src/lib/firebase.ts:1546-1810` |
| Funciones | Contrato LAU, anexos, cambios de estado, periodos de cobro embebidos |
| Rutas | `POST /api/redactar-clausula` (IA) |
| Colecciones | `contratos_formalizacion` (incluye `registroCobros[]`), `habitaciones_inmueble`, `fichas_publicas_inmueble`, `audit_logs` |
| Pruebas | `ciclo-patrimonial`, `contratos` vía `src/test/e`, `bloque-8-migracion-historica` |
| Estado | Funcional; **A-01/A-12** (histórico económico mutable, sin versión) |

### 2.9 Cobros, recibos y morosidad

| Elemento | Detalle |
|---|---|
| Código | `CobrosSection` (1.500+ L), `JustificantesCobroInbox`, `src/utils/cobrosEngine.ts`, `src/utils/morosidad/*`, `MorosidadSection`, `src/lib/firebaseActas.ts` |
| Funciones | Materialización de mensualidades, registro de pago (`registrarPagoPeriodo`), parciales, incidencias de cobro, expediente de morosidad |
| Rutas | `GET /api/cron/avisos` (recordatorio día 5) |
| Colecciones | `contratos_formalizacion.registroCobros`, `expedientes_morosidad*` (5), `justificantes_cobro` |
| Pruebas | `conciliacion*` (6), `notificaciones*`, `f1/p1` (avisos) |
| Estado | Funcional; **A-01/A-02/A-12** |

### 2.10 Justificantes de cobro (P2)

| Elemento | Detalle |
|---|---|
| Código | `server/cobros/justificantesCobro.ts` (1.136 L), `rutasJustificantesCobro.ts`, `almacenGoogleStorage.ts`, `src/lib/justificantesCobroApi.ts`, `PresentarJustificanteCobro.tsx`, `JustificantesCobroInbox.tsx` |
| Rutas | `POST /api/cobros/justificantes/subir`, `/consultar`, `/:id/decision`, `GET /:id/auditoria`, `/:id/archivo` (todas con guardia de ID token) |
| Garantía auditada | **Aceptar/rechazar/rectificar NO altera `importeRecibido`, `fechaPago`, `estado` del cobro, tesorería ni conciliación** (cabecera del servicio y `accion === 'ACEPTAR'` en `:951`) |
| Colecciones | `justificantes_cobro`, `justificantes_cobro_auditoria` (append-only) |
| Pruebas | `justificantesCobro.test.ts` (555 L), `rutasPortalPublico`, `emulador/justificantes-cobro` |
| Estado | **Funcional y correcto en la separación justificante ↔ cobro** |

### 2.11 Gastos, recurrentes y OCR (P5)

| Elemento | Detalle |
|---|---|
| Código | `GastosSection`, `GastoModal`, `EscanerFacturaModal`, `src/lib/ocrFactura.ts` (408 L), `flujoFacturaOcr.ts` (330 L), `gastosPersistenciaVerificada.ts`, `src/utils/gastosEngine.ts`, `deducibilidadEngine.ts` |
| Funciones | Alta manual, plantillas recurrentes, OCR en navegador (tesseract.js + pdfjs, cargados en *chunks* aparte), dedupe por SHA-256 + emisor/número, ID estable `gas_ocr_<hash>`, bloqueo de altas anuladas |
| Colecciones | `gastos`, `gastos_recurrentes`, Storage `gastos_facturas/` |
| Pruebas | `EscanerFacturaModal.test`, `GastoModal.test`, `gastosPersistenciaVerificada` |
| Estado | Funcional; **A-06** (factura manual fuera de fiscalidad) |

### 2.12 Custodia documental (P3)

| Elemento | Detalle |
|---|---|
| Código | `src/lib/expedienteDocumental/*` (9), `src/lib/custodiaDocumental/almacenServidor.ts`, `server/documentos/servicioDocumentos.ts`, `autorizacionDocumental.ts` (778 L), `rutasDocumentos.ts` |
| Rutas | `POST /api/documentos/subidas`, `/subidas/confirmar`, `/acceso`, `/borrar`, `/publico/subidas`(+confirmar) |
| Modelo | Sesión reanudable abierta por el servidor con nombre/tipo/metadatos fijados; el navegador **no usa el SDK de Storage**; `storage.rules` deniega todo salvo la foto pública; token de descarga rotado |
| Pruebas | `expediente-documental`, `custodia-documental-fail-closed`, `custodia-topologia-firestore-storage`, `gestor-documental-*` (2), `autorizacionDocumental` (344 L), `servicioDocumentos` (484 L), `emulador/documentos-p3` (13), `storage-ambitos` (6) |
| Estado | Funcional en código; **producción sin verificar (V-1)** |

### 2.13 Fiscalidad, informes y expediente fiscal

| Elemento | Detalle |
|---|---|
| Código | `FiscalidadSection` (500+ L), `InformesSection`, `src/utils/fiscalEngine.ts`, `src/lib/expedienteFiscal/*` (motor 393 L, ZIP 114 L) |
| Funciones | Gastos del ejercicio, deducibilidad, documentación fiscal, ZIP del expediente |
| Pruebas | `expedienteFiscal.test`, `hash-isomorfico`, `tests_fiscal_anual.ts` |
| Estado | Funcional; **A-06**; el expediente es **informativo**, no declaración oficial |

### 2.14 Paquete del asesor (P6)

| Elemento | Detalle |
|---|---|
| Código | `src/lib/paqueteAsesor/*` (motor, documentos, verificador, adaptador) |
| Funciones | ZIP multi-entidad determinista, CSV con cuadre, índice documental con SHA-256, filtros por ejercicio/mes, topes y avisos de cobertura |
| Pruebas | `paqueteAsesor.test`, `adaptador.test`, `verificador.test`, `auditoriaAdversarial.test`, `p6.test` |
| Estado | Funcional; A-06 (no incorpora facturas manuales) |

### 2.15 Actualización de renta (P4)

| Elemento | Detalle |
|---|---|
| Código | `src/utils/actualizacionRentaEngine.ts`, `src/lib/actualizacionRentaApi.ts`, `server/actualizacionRenta/servicioActualizacionRenta.ts` (518 L), `rutasActualizacionRenta.ts` |
| Rutas | `POST /api/actualizacion-renta/previsualizar`, `/confirmar` (evidencia de comunicación obligatoria, huella de preview, idempotencia, anexo v1) |
| Pruebas | `servicioActualizacionRenta.test` (467 L), `rutasActualizacionRenta.test` (176 L), `ActualizacionRentaPreviewPanel.test` |
| Estado | Correcto en su alcance; **A-02** en la integración con cobros |

### 2.16 Avisos, correo, cron y bandeja (P1/P7)

| Elemento | Detalle |
|---|---|
| Código | `src/notificaciones/*` (dispatcher, canales, autorización, plantillas), `server/notificaciones/*` (7), `BandejaAvisosSection`, `src/lib/bandejaAvisos.ts` |
| Rutas | `POST /api/notificaciones/enviar`, `POST /api/notificaciones/probar-smtp`, `GET /api/cron/avisos` |
| Garantías | Sin transporte real → estado `FALLIDA` (nunca «enviado»); cron sin `CRON_SECRET` → 503; comparación en tiempo constante; idempotencia determinista por (contrato, periodo) |
| Colecciones | `notificaciones`, `notificaciones_entregas` |
| Pruebas | `notificaciones*` (3), `p1-avisos-cierre-aceptacion`, `smtp-aceptacion-regresion`, `prueba-smtp-aislada`, `harness/servidorSmtpCaptura` |
| Estado | Funcional en código; **entrega real V-2** |

### 2.17 Tesorería, liquidaciones, SEPA y conciliación

| Elemento | Detalle |
|---|---|
| Código | `TesoreriaSection`, `ConciliacionBancariaSection`, `src/tesoreria/*`, `src/lib/conciliacionFirestore.ts`, `src/utils/conciliacion/*` |
| Colecciones | `liquidaciones_propietarios`, `ordenes_pago`, `gastos_inmuebles`, `ficheros_sepa`, `mandatos_sepa`, `config_liquidacion`, `movimientos_bancarios`, `conciliaciones_bancarias`, `importaciones_bancarias`, `eventos_conciliacion_bancaria` |
| Pruebas | `conciliacion` (6 ficheros), `f4-reparto-liquidacion`, `financiacion` |
| Estado | Funcional; **importación bancaria desactivada por decisión** |

### 2.18 Mantenimiento, incidencias, profesionales y operaciones

| Elemento | Detalle |
|---|---|
| Código | `IncidenciasSection`, `OperacionesSection`, `ProfesionalesSection`, `ProfesionalPortalSection` (1.126 L), `src/utils/operacionesEngine.ts`, `profesionalesEngine.ts`, `server/seguimiento/*` |
| Rutas | `POST /api/asistente/incidencias-inquilino`, `/api/analizar-incidencia-ia`, rutas de seguimiento de incidencias |
| Colecciones | `incidencias`, `tareas_mantenimiento`, `garantias_reparacion`, `trabajos_profesionales`, `presupuestos_profesionales`, `valoraciones_profesionales`, `profesionales`, `profesionales/{id}/documentos_profesionales` |
| Pruebas | `test-circuito-mantenimiento-completo`, `test-circuito-reformas`, `test-mantenimiento-preventivo-garantias`, `test-presupuestos-circuito`, `test-puente-ot-gasto`, `test-matching-asignacion-profesionales`, `centro-operativo` |
| Estado | Funcional; **A-05** (alta privada por titular) |

### 2.19 Pólizas, siniestros y seguro de impago

`PolizasSegurosSection`, `SeguroImpagoSection`, `configuracion_aseguradoras`, `solicitudes_seguro_impago`, `polizas_seguros`, `siniestros` · rutas IA `/api/generar-correo-aseguradora`, `/api/analizar-respuesta-aseguradora` · pruebas `tests_seguros_renovacion.ts`, `analisis-respuesta-aseguradora.server`, `ia-borrador-correo-aseguradora` · **funcional** (IA real no verificada).

### 2.20 Actas, inventario, habitaciones y reformas

`ActasSection`, `firebaseActas.ts`, `utils/actas/*`, `inventario*`, `habitaciones_inmueble`, `necesidades_reforma`, `proyectos_reforma` · pruebas `informe-GAP*`, `test-circuito-reformas` · **funcional** (superficie).

### 2.21 Suministros y lecturas

`SuministrosSection`, `PortalSuministros`, `suministrosFirestore.ts`, `lecturas_suministro`, `cambios_titular`, `src/utils/suministrosEngine.ts` · **funcional** (superficie).

### 2.22 Financiación, inversión y pricing

`FinanciacionSection`, `InversionSection`, `prestamos`, `analisis_inversion`, `/api/estimar-pricing`, `/api/proponer-mejoras` · pruebas `financiacion`, `firebaseInversion` · **funcional** (IA no verificada).

### 2.23 Facturación, Veri*Factu y B2B

`FacturacionSection`, `FacturaElectronicaB2BPanel`, `src/types/facturacion.ts`, `src/utils/verifactuTransport.ts`, `src/utils/intercambioB2B/adaptadoresB2B.ts`, colecciones `facturas`, `registros_facturacion`, `envios_verifactu`, `series_facturacion`, `facturas_electronicas_b2b` · pruebas `facturacion`, `facturaElectronicaB2B`, `facturacionReporte` · **preparado, NO operativo** (decisión de alcance).

### 2.24 Sindicación

`src/sindicacion/*` (6), `src/utils/publicacionPortales.ts`, `sindicacion_inmuebles` · **contrato sin portales conectados**.

### 2.25 Portal del inquilino

`portal-inquilino/*` (16 ficheros), `usePortalInquilino.ts`, `PortalContrato`, `PortalCuenta`, `PortalDocumentos`, `PortalHistorial`, `PortalIncidencias`, `PortalInicio`, `PortalMensajes`, `PortalRecibos`, `PortalSuministros`, `PresentarJustificanteCobro`, `AsistenteIncidenciaAsistida` · colecciones leídas por `get` directo (`contratos_formalizacion`, `inmuebles`, `incidencias`, `mensajes_portal`, `suministros`, `lecturas_suministro`, `cambios_titular`, `actas`) · pruebas de UI (4) + reglas · **funcional** (UI no verificada en navegador).

### 2.26 Portal del propietario

No es una SPA distinta: es el ERP con `SECCIONES_PROPIETARIO` (25 secciones) y `scopedInmuebles` acotado. Unidades de datos acotadas en `subscribe*` con `DataAccessScope` · **funcional**; A-08 en comercial.

### 2.27 Portal del profesional

`ProfesionalPortalSection` con pestañas ficha/especialidades/zonas/asignaciones/incidencias; suscripciones a `trabajos_profesionales` e `incidencias` con ámbito `profesionalId` · **funcional**; A-05 en el alta desde el titular.

### 2.28 Importación / exportación / migración

`src/lib/importExport/*` (22), `src/lib/importacion/*` (7), `src/lib/migracion/*`, `ImportExportPanel`, `DatosSection` · formatos XLSX/CSV/JSON, preflight, dedupe por 5 niveles, ids deterministas, fixtures reales en `tests/fixtures/xlsx` (12) · pruebas `import-export-*` (4), `bloque-8-migracion-historica`, `importacion.test` · **funcional**.

### 2.29 IA

`server/ia/*` (11), `src/experiencia/*`, `src/ia/*` · núcleo con autenticación de ID token, cuotas, créditos, llaves de usuario cifradas AES-256-GCM, fail-closed sin clave · pruebas `ia-fase1/2/5/7/8/9` (17) · **funcional en código**; operación real V-3.

### 2.30 Centro de ayuda, tutoriales y experiencia

`CentroAyudaSection`, `src/experiencia/*`, `progreso_tutoriales` (subcolección de `usuarios_auth`) · pruebas UI (5) · **funcional**.

### 2.31 Recomercialización y baja patrimonial

`RecomercializacionSection`, `expedientes_recomercializacion`, `propuestas_inmobiliaria`, `leads_inmobiliario`, `inmobiliarias_directorio`; `bajaPatrimonialInmuebleFirestore.ts` · pruebas `baja-patrimonial-inmuebles` · **funcional**.

### 2.32 Infraestructura

`server.ts` (2.908 L, 19 rutas) + 17 rutas montadas, `api/index.ts`, `vercel.json` (cron 06:00 UTC), `.github/workflows/emulador-reglas.yml` (2 jobs), 94 documentos en `docs/` · **funcional**; A-10/A-16.

---

## 3. Superficies HTTP (agrupadas por recurso)

| # | Método y ruta | Autenticación | Módulo |
|---|---|---|---|
| 1 | `POST /api/upload-document` | — (retirada) | 410 ALMACEN_TEMPORAL_RETIRADO |
| 2 | `GET /api/documents/:fileId` | — (retirada) | 410 |
| 3 | `POST /api/analizar-documento` | token IA + cuota | IA |
| 4 | `POST /api/generar-correo-aseguradora` | token IA | IA/seguros |
| 5 | `POST /api/analizar-respuesta-aseguradora` | token IA | IA/seguros |
| 6 | `POST /api/asistente/interpretar` | token IA | IA/asistente |
| 7 | `POST /api/asistente/incidencias-inquilino` | token + fuente autorizada | IA/inquilino |
| 8 | `POST /api/analizar-cuestionario` | token IA | IA/captación |
| 9 | `POST /api/redactar-clausula` | token IA | IA/contratos |
| 10 | `POST /api/analizar-inspeccion` | token IA | IA/actas |
| 11 | `POST /api/proponer-mejoras` | token IA | IA/inversión |
| 12 | `POST /api/estimar-pricing` | token IA | IA/inversión |
| 13 | `POST /api/generar-kit-publicacion` | token IA | IA/publicación |
| 14 | `POST /api/catastro/consultar` | — (consulta externa) | Inmuebles |
| 15 | `POST /api/analizar-incidencia-ia` | token IA | IA/incidencias |
| 16 | `POST /api/titulares/buscar` | ID token verificado + cuenta de servicio | Titulares |
| 17 | `GET /api/health` | — | Infraestructura |
| 18 | `POST /api/notificaciones/enviar` | ID token + perfil ACTIVO | Avisos |
| 19 | `GET /solicitud/:token`, `/visita/:token` | SPA fallback | Público |
| 20 | `POST /api/visita/:token/reservar` | token capacidad | Público |
| 21 | `POST /api/visita/:token/cancelar` | token capacidad | Público |
| 22 | `GET /api/visita/:token` | token capacidad | Público |
| 23 | `GET/POST /api/cuestionario/:token` | token capacidad | Público |
| 24 | `GET/POST /api/documentacion/:token` | token capacidad | Público |
| 25 | `POST /api/cobros/justificantes/subir` | ID token + guardia | Cobros |
| 26 | `POST /api/cobros/justificantes/consultar`, `/:id/decision`, `GET /:id/auditoria`, `/:id/archivo` | ID token + guardia | Cobros |
| 27 | `POST /api/actualizacion-renta/previsualizar`, `/confirmar` | ID token + servicio | P4 |
| 28 | `POST /api/documentos/subidas`, `/confirmar`, `/acceso`, `/borrar`, `/publico/subidas`, `/publico/subidas/confirmar` | sesión / portal token | Custodia |
| — | `GET /api/cron/avisos` | `Bearer CRON_SECRET` | Cron |
| — | `POST /api/notificaciones/probar-smtp` | ID token + ADMINISTRADOR ACTIVO | Avisos |
| — | `GET /api/ia/...` (admin, llaves) | ID token + perfil | IA |

---

## 4. Colecciones Firestore (64) y su bloque de reglas

Todas las colecciones referenciadas por el cliente tienen bloque `match` propio salvo las que se sirven **únicamente** por servidor con credencial de servicio (y que, por tanto, caen en la denegación global `match /{document=**}` — que es lo correcto):

`usuarios`, `usuarios_auth`(+/`progreso_tutoriales`), `personas`, `propietarios`, `inmuebles`(+/`documentos_patrimoniales`), `titularidades`, `gestiones_cartera`, `registros_patrimoniales`, `fichas_publicas_inmueble`, `contratos_formalizacion`, `gastos`, `gastos_recurrentes`, `prestamos`, `expedientes_recomercializacion`, `propuestas_inmobiliaria`, `leads_inmobiliario`, `inmobiliarias_directorio`, `incidencias`, `tareas_mantenimiento`, `garantias_reparacion`, `trabajos_profesionales`, `presupuestos_profesionales`, `valoraciones_profesionales`, `necesidades_reforma`, `proyectos_reforma`, `inventario_inmuebles`, `inventario_historial`, `habitaciones_inmueble`, `polizas_seguros`, `siniestros`, `candidatos`, `solicitudes`, `invitaciones`, `slots_visita`, `solicitudes_documentacion`, `configuracion_aseguradoras`, `solicitudes_seguro_impago`, `system`, `profesionales`(+/`documentos_profesionales`), `enlaces_registro`, `especialidades`, `audit_logs`, `notificaciones`, `financiaciones`, `movimientos_bancarios`, `conciliaciones_bancarias`, `importaciones_bancarias`, `eventos_conciliacion_bancaria`, `facturas`, `registros_facturacion`, `envios_verifactu`, `series_facturacion`, `mensajes_portal`, `suministros`, `lecturas_suministro`, `cambios_titular`, `facturas_electronicas_b2b`, `liquidaciones_propietarios`, `gastos_inmuebles`, `ordenes_pago`, `ficheros_sepa`, `mandatos_sepa`, `config_liquidacion`, `expedientes_morosidad`, `expedientes_morosidad_hist`, `evidencias_morosidad`, `compromisos_morosidad`, `politicas_morosidad`, `morosidad_resumen_propietario`, `actas`, `actas_evidencias`, `actas_incidencias`, `actas_otp`, `analisis_inversion`, `operaciones`(+/`entidades`), `sindicacion_inmuebles`.

**Solo servidor** (sin bloque cliente, denegadas por el *catch-all*): `justificantes_cobro`, `justificantes_cobro_auditoria`, `documentos_patrimoniales` (metadatos P3 en la base con nombre), `notificaciones_entregas`, `ia_*`.

---

## 5. Pruebas disponibles y qué demuestran realmente

| Grupo | Ficheros | Qué demuestra | Qué **no** demuestra |
|---|---|---|---|
| Lógica pura / motores | ~110 | Cálculos, máquinas de estado, dedupe, plantillas, ZIP | Que el flujo de pantalla llegue a ese motor |
| Componentes (Testing Library) | ~35 | Render, validaciones, mensajes, estados de error | Navegación completa ni integración real con Firestore |
| Reglas (harness propio) | ~15 | Condición textual de las reglas (`tests/harness/firestoreRulesEval.ts`) | El motor real de Google |
| Reglas (emulador oficial) | 6 ficheros (≈70 casos) | Comportamiento del motor Firestore/Storage | Producción, ni el árbol si no corre en esta máquina |
| Servidor (`server/**`) | 9 | Servicios y rutas con dobles | Cuenta de servicio real, GCS, SMTP |
| Integración (`node --test`) | 2 suites (302) | Contratos entre Arenas | 3 guardas obsoletas fallan |
| E2E de navegador | **0** | — | Nada |

**Conclusión:** hay una batería amplia (4.943 casos) pero **ningún recorrido de negocio completo está cubierto de extremo a extremo**. La cifra de pruebas no debe confundirse con cobertura funcional.
