# AUDITORÍA GLOBAL DEL ERP PATRIMONIAL — 2026-10-20

**Repositorio:** `sarqsan/Gestor-de-inmuebles-vercel` · **SHA inspeccionado:** `cd58c9e7feec591c16cef9be42a0fcbcea3af21d` (`main` = `origin/main`, merge de PR #56, 2026-10-20 12:16:54 +0200) · **Carácter:** auditoría de solo lectura. No se ha modificado código de aplicación, reglas, configuración ni datos; no se ha publicado nada; no se ha ejecutado ninguna operación con efectos externos (correo, IA, Catastro, Storage/Firestore de producción).

> Convenciones de severidad: **S0** crítico (exposición o pérdida de datos activa y demostrada) · **S1** alto (flujo central roto, pérdida de datos o falso éxito demostrados por código/pruebas) · **S2** medio (resultado incorrecto o función inoperativa acotada) · **S3** bajo (deuda, ruido, higiene) · **V** pendiente de verificación (no demostrable sin infraestructura o acceso no autorizado en esta sesión). Una limitación documentada **no** cuenta como resuelta; una decisión de alcance aprobada **no** cuenta como defecto.

---

## 0. Resumen ejecutivo y tabla resumen

| Concepto | Resultado |
|---|---|
| SHA auditado | `cd58c9e7feec591c16cef9be42a0fcbcea3af21d` (árbol idéntico a la cabeza de PR #56 `732d9c6`; CI verde sobre ese árbol) |
| Tamaño inspeccionado | 1 015 ficheros versionados · ~235 k LOC TS/TSX · 160 componentes (42 secciones, 37 modales) · 132 módulos `src/lib` · 91 `src/utils` · `server.ts` (2 927 líneas) + 32 ficheros `server/**` · `firestore.rules` 4 069 líneas (77 bloques `match` de primer nivel) · `storage.rules` 728 líneas (22 `match`) |
| Módulos / flujos inspeccionados | 27 áreas funcionales (§2) · 7 cadenas de integración extremo a extremo (§4) · 36 rutas HTTP (19 en `server.ts` + 17 montadas desde `server/**`) · 65 colecciones Firestore referenciadas por el cliente, todas con bloque de reglas |
| Hallazgos | **S0: 0 · S1: 4 · S2: 7 · S3: 9 · V: 8** (24 hallazgos + 8 verificaciones pendientes; §7 y §8) |
| Pruebas ejecutadas localmente | TypeScript `tsc --noEmit`: **0 errores** · Vitest: **262 ficheros / 4 705 pruebas → 4 698 correctas, 0 fallidas, 7 `todo`** (239 s) · `npm run build`: **correcto** (16,8 s; chunk principal 5 531 kB / 1 372 kB gzip) · `npm run test:integracion`: **302 pruebas → 300 correctas, 2 fallidas** (las 2 guardas obsoletas de "checkout f782" ya conocidas) · `npm audit --omit=dev`: **7 vulnerabilidades (6 altas, 1 baja)** · Evaluación ad hoc con el harness de reglas del propio repo (fuera del árbol): **5/5** reproducen AG-01 y AG-07 |
| Pruebas NO ejecutadas aquí | Emulador oficial de reglas (sin Java/firebase-tools, por orden): evidencia tomada de CI del mismo árbol (**79/79**) · Sin pruebas E2E de navegador en el repo · Ninguna operación externa real |
| Riesgos críticos/altos | **AG-01** alta pública de solicitudes denegada por reglas con éxito aparente (pérdida del cuestionario/ingresos del candidato) · **AG-02** portales públicos de visita/cuestionario/documentación inoperativos (reglas niegan al anónimo y no existe la ruta de servidor que las reglas presuponen) · **AG-03** `storage.rules` resuelve el ámbito contra la base Firestore `(default)` mientras la app opera sobre una base con nombre → para todo usuario distinto del master la custodia en Storage queda denegada (demostrado en el emulador de CI; estado real de producción **V**) · **AG-04** almacén efímero en RAM del servidor usado como respaldo silencioso de facturas, justificantes y documentos aportados (pérdida de binarios y falso éxito) |
| Verificaciones pendientes (V) | Reglas realmente publicadas vs. repositorio · comportamiento real de Storage con la base con nombre · entrega real de correo (SMTP/Gmail) y cron de Vercel · claves IA/Gemini · adaptador GCS P2 con credencial de servicio · presencia de variables (`CRON_SECRET`, cuenta de servicio) · migración/estado de datos antiguos · pruebas de interfaz manuales |
| Siguientes pasos (orden) | 1) Decidir y corregir AG-03 (topología `(default)`/base con nombre) con verificación autorizada en producción · 2) Corregir AG-01 y AG-02 (captación pública) · 3) Cerrar AG-04 (respaldo efímero fail-closed + autenticación de rutas) · 4) Integraciones AG-05/AG-06/AG-07/AG-09/AG-10 · 5) Higiene: dependencias (nodemailer), guardas obsoletas, credenciales residuales |
| Confirmaciones | Sin cambios de código de aplicación · sin commits/ramas/PR/merge/deploy · sin escrituras en producción · sin envíos reales · único fichero nuevo: este informe |

---

## 1. Estado real del repositorio

| Elemento | Valor verificado |
|---|---|
| HEAD / `main` / `origin/main` | `cd58c9e7feec591c16cef9be42a0fcbcea3af21d` (árbol limpio al iniciar; 345 commits tras `git fetch --unshallow`) |
| Rama de trabajo de la sesión | `arena/8ed3381d-gestor-de-inmuebles-vercel` (sin commits; solo este documento añadido al árbol de trabajo) |
| Últimos PR integrados | #56 (P7 docs), #55 (P7 IA/correo), #54 (P6 paquete asesor), #53 (P5 OCR), #52 (P4-B actualización efectiva), #51 (P1 avisos), #50 (P3), #49 (P2), #47, #45/#44, #43/#42 (SMTP) |
| Diferencia P7 → HEAD | `git diff --stat ae5c32f cd58c9e` = solo el documento de cierre P7 (el código es el del árbol certificado por CI en PR #56) |
| CI | Único workflow `.github/workflows/emulador-reglas.yml` (jobs `reglas-emulador` con Java 21 + `verificacion` con tsc/vitest/build). Se dispara en `pull_request`, `push` a una rama `arena/…` concreta y `workflow_dispatch`; **no** en `push` a `main`. `gh run list` → últimas 8 ejecuciones `success`, todas por `pull_request`. |
| Despliegue | Vercel: `api/index.ts` exporta la app Express como única función (`/api/*` reescrito), SPA en `dist`, cron `/api/cron/avisos` a las 06:00 UTC. Proyecto Firebase `gestor-inmuebles-produccion`; Firestore **con nombre** `ai-studio-gestordeinmueble-c6444afd-24ca-4983-b195-ceb2c5ebdc51` (`firebase.json`, `firebase-applet-config.json`, `src/lib/firebase.ts:131-134`). |
| Dependencias instaladas | `npm ci` → 416 paquetes; node 22.22.3; firebase 12.19.0, express 4.22.3, nodemailer 6.10.1, vite 6.4.3, vitest 5.0.1, typescript 5.8.3, tesseract.js 7.0.0, pdfjs-dist 6.4.299, jspdf 4.2.1, react 19.3.0 |
| Herramientas ausentes | Java, firebase-tools, emuladores (no instalados por orden expresa) |

---

## 2. Inventario completo de módulos y funcionalidades

Fuente: catálogo único de navegación `src/navegacion/navegacion.ts` (6 grupos, 31 secciones de menú), `SectionType` en `src/types.ts` (48 valores, incluidos destinos sin menú), guardas de perfil en `src/App.tsx:346-377` (PROPIETARIO 25 secciones; PROFESIONAL 6 + `formalizacion`/`cobros` para GESTOR_PATRIMONIAL; INQUILINO portal propio), rutas HTTP (`server.ts`, `server/**`), reglas y colecciones.

| # | Área | Superficies (componentes) | Lógica (lib/utils/server) | Persistencia | Estado (§3) |
|---|---|---|---|---|---|
| 1 | **Acceso, identidad y permisos** | `LoginView`, `RegistroView`, `AdministracionSection` (usuarios, roles, carteras), `ConfiguracionSection` | `src/lib/authService.ts`, `usuariosAuthEspejo`, `permisosTitulares.ts`, `gestionesCartera*`, `firestore.rules`/`storage.rules` | `usuarios`, `usuarios_auth` (espejo uid), `enlaces_registro`, `gestiones_cartera`, `audit_logs`, `system/*` | Parcial (AG-08, AG-17, AG-03) |
| 2 | **Inmuebles** | `InmueblesSection`, `InmuebleModal`, `GestionImagenesModal`, `HabitacionesPanel`, baja patrimonial, ficha pública, Catastro | `inmueblesEngine`, `edicionOrdinariaInmueble.ts`, `bajaPatrimonialInmuebleFirestore.ts`, `fichaPublicaInmueble.ts`, `/api/catastro/consultar` | `inmuebles`, `habitaciones_inmueble`, `fichas_publicas_inmueble`, Storage `inmuebles_imagenes/` | Parcial (AG-13, AG-19) |
| 3 | **Titulares, propietarios, carteras, titularidades** | `PropietariosSection`, `TitularesSection`, `PropietarioPortalSection`, transmisiones | `titularesModelo.ts`, `titularidades*`, `server/titularidades/*` (`/api/titulares/buscar` con ID token verificado y cuenta de servicio) | `propietarios`, `titularidades/{inmuebleId}__{pid}`, `personas`, `gestiones_cartera` | Completa (riesgo S3 AG-14) |
| 4 | **Captación pública y candidatos** | `PortalSolicitudPublicaView`, `PortalVisitaPublicaView`, `CuestionarioPublicoView`, `PortalDocumentacionPublicaView`, `SolicitudesSection`, `CandidatosSection`, comparador, solvencia | `solvenciaEngine`, `syncCandidateWithSolicitudDoc`, `resolverTokensPublicos`, IA `/api/analizar-cuestionario`, `/api/analizar-documento` | `solicitudes`, `candidatos`, `invitaciones`, `slots_visita`, `solicitudes_documentacion` | **Defectuosa** (AG-01, AG-02, AG-09) |
| 5 | **Formalización y contratos** | `FormalizacionSection`, cláusulas IA (`/api/redactar-clausula`), anexos | `contratosEngine`, `saveContratoFirestore` (`firebase.ts:1502`), transacción contrato↔ficha pública (`firebase.ts:1540-1708`) | `contratos_formalizacion` (incluye `registroCobros[]` embebido) | Completa con riesgo (AG-10) |
| 6 | **Cobros, recibos y justificantes (P2)** | `CobrosSection`, portal propietario, `server/cobros/*` (5 rutas con `guardia`) | `cobrosEngine.ts` (materialización, vencimientos, `registrarPagoPeriodo`), `uploadJustificanteCobro` (legado), adaptador GCS P2 (503 `P2_NO_DISPONIBLE` sin credencial) | `contratos_formalizacion.registroCobros`, `cobros_justificantes`, Storage `cobros_justificantes/`, GCS (P2) | Parcial (AG-04, AG-06, AG-10) |
| 7 | **Gastos, recurrentes y facturas** | `GastosSection`, `GastoModal`, `GastosRecurrentes*`, OCR P5 (`OcrFactura*`) | `gastosEngine.ts` (`normalizarGasto`), `deducibilidadEngine.ts` (`analizarDeducibilidad`), `uploadFacturaGasto` (legado) | `gastos`, `gastos_recurrentes`, Storage `gastos_facturas/`, `documentos_patrimoniales` (vía P5/P3) | Parcial (AG-04, AG-05, AG-14) |
| 8 | **Custodia documental P2/P3** | `DocumentosPatrimonialesPanel`, documentos de profesionales | `src/lib/expedienteDocumental/*` (gestor puro + `gestorFirebase.ts`, SHA-256, fail-closed con `ErrorDocumentoPatrimonial`), `indice.ts` | `inmuebles/{id}/documentos_patrimoniales`, Storage `documentos_patrimoniales/`, `profesionales/{id}/documentos` | Completa en código · **V** en Storage real (AG-03) |
| 9 | **OCR de facturas P5** | `OcrFacturaModal`/panel en gastos | `src/lib/ocr/*` (tesseract.js + pdfjs en navegador), propuesta → `Gasto` + documento P3 | Reutiliza 7 y 8 | Completa (depende de 8) |
| 10 | **Avisos y correo P1/P7** | `AvisosSection`, prueba SMTP (admin), trazabilidad IA/correo | `src/notificaciones/*`, `server/notificaciones/*` (dispatcher, canales, `rutaPruebaSmtp` con ID token + perfil ADMINISTRADOR, `rutasCronAvisos` con `CRON_SECRET` → 503 sin variable), `/api/notificaciones/enviar` | `notificaciones`, `avisos*`, `system/gmail_config` (sin secretos: solo metadatos) | Completa en código · **V** entrega real |
| 11 | **Actualización de renta P4** | Panel en formalización | `src/lib/actualizacionRentaApi.ts`, `server/actualizacionRenta/*` (previsualizar/confirmar con `guardia`) | `contratos_formalizacion.rentaMensual` (canónico), `anexos_actualizacion_renta` | Completa · integración con cobros parcial (AG-06) |
| 12 | **Paquete del asesor P6** | `PaqueteAsesor*` | `src/lib/paqueteAsesor/*` (ZIP cliente, tope 120 inmuebles, verificación SHA-256), `paqueteAsesorFirebase.ts` | Lee 5-8 y `documentos_patrimoniales` | Completa · cobertura documental parcial (AG-05) |
| 13 | **Fiscalidad e informes** | `FiscalidadSection`, `InformesSection` | `fiscalEngine.ts` (`calcularGastosEjercicio`, `recopilarDocumentacionFiscal`), `deducibilidadEngine.ts` | Lee `gastos`, contratos, inmuebles | Parcial (AG-05). Expediente **informativo**, no declaración oficial |
| 14 | **Tesorería, liquidaciones, órdenes de pago, conciliación** | `TesoreriaSection`, `ConciliacionBancariaSection`, `LiquidacionesPanel` | `src/tesoreria/*`, `conciliacionFirestore.ts` (conciliación manual; importación bancaria desactivada por decisión; SEPA conservado) | `liquidaciones`, `ordenes_pago`, `tesoreria_gastos`, `conciliacion_*` | Completa según pruebas · UI **V** |
| 15 | **Morosidad, seguro de impago, aseguradoras** | `MorosidadSection`, `SeguroImpagoSection`, IA aseguradora | `src/utils/morosidad/*`, `/api/generar-correo-aseguradora`, `/api/analizar-respuesta-aseguradora` | `morosidad_*`, `solicitudes_seguro_impago`, `configuracion_aseguradoras` | Completa según pruebas · IA **V** |
| 16 | **Mantenimiento, incidencias, profesionales, operaciones** | `IncidenciasSection`, `OperacionesSection`, `CrearProfesionalModal`, `MisProfesionalesSection`, seguimiento (`server/seguimiento/*`) | `operacionesEngine`, `presupuestos/trabajos/garantías`, asistente IA incidencias | `incidencias`, `profesionales`, `presupuestos`, `trabajos`, `garantias_reparacion`, `tareas_mantenimiento` | Parcial (AG-07) |
| 17 | **Pólizas y siniestros** | `PolizasSection`, `DetallePolizaModal` | `segurosEngine` | `polizas_seguros`, adjuntos vía servidor efímero o base64 | Parcial (AG-04) |
| 18 | **Actas, inventario, inspecciones** | `ActasSection`, `InspeccionIA` (`/api/analizar-inspeccion`) | `actasEngine`, inventario | `actas`, `inventario` | Completa · IA **V** |
| 19 | **Suministros** | `SuministrosSection` | `suministrosEngine` | `suministros` | Completa · UI **V** |
| 20 | **Financiación, inversión, pricing** | `FinanciacionSection`, `InversionSection`, `/api/estimar-pricing`, `/api/proponer-mejoras` | `prestamosEngine`, `inversionEngine` | `prestamos`, `proyectos_reforma` (adjuntos con respaldo data-URL inline) | Completa · IA **V** |
| 21 | **Facturación y B2B (Veri*Factu / factura electrónica)** | `FacturacionSection`, `FacturaElectronicaB2BPanel` | `facturaElectronicaB2BEngine` | `facturas` | Decisión de alcance: **preparado, no operativo** (A16-07); no es defecto |
| 22 | **Importación / exportación / migración** | `DatosSection` | `src/lib/importExport/*`, `src/lib/importacion/*`, `src/lib/migracion/*` | Reutiliza `save*Firestore` | Completa (AG-16 comentario desfasado) |
| 23 | **Recomercialización** | `RecomercializacionSection` | `recomercializacionEngine` | `expedientes_recomercializacion` | Completa · UI **V** |
| 24 | **Portal del inquilino** | `InquilinoPortal*` (mis contratos, incidencias, asistente IA `/api/asistente/incidencias-inquilino`) | `crearFuenteAutorizadaInquilinoIA` | Reglas: inquilino solo `incidenciaIds/mensajeIds/fechaActualizacion` en su contrato | Completa según reglas/pruebas · UI **V** |
| 25 | **Configuración, administración IA, ayuda** | `ConfiguracionSection`, `AdministracionSection`, `server/ia/adminIA.ts`, `rutasLlavesIA.ts`, Centro de Ayuda | `nucleoIA` (cuotas, llaves por usuario, fail-closed sin clave) | `ia_*`, `system/modulos_config` | Completa |
| 26 | **Sindicación de portales, OTP, WhatsApp, PSD2** | `src/sindicacion/*` | — | — | Decisión de alcance: descartado/preparado (no se reabre) |
| 27 | **Infraestructura: servidor Express, Vercel, CI, documentación** | `server.ts`, `api/index.ts`, `vercel.json`, workflow, 84 documentos en `docs/` | `documentosServidor.ts` (almacén efímero), `express.json 50 MB` | — | Parcial (AG-04, AG-11, AG-12, AG-13, AG-15) |

---

## 3. Matriz de estado

| Estado | Áreas |
|---|---|
| **Completa** (código + pruebas unitarias/lógicas coherentes; sin defecto reproducible) | 3 Titulares/carteras · 9 OCR P5 · 11 P4 (núcleo) · 12 P6 (núcleo) · 18 Actas · 19 Suministros · 20 Financiación/inversión · 22 Import/Export · 23 Recomercialización · 24 Portal inquilino · 25 Configuración/IA/ayuda · 5 Formalización (núcleo) |
| **Parcial** (operativa, con huecos de integración o respaldos inadecuados) | 1 Acceso (credenciales residuales) · 2 Inmuebles (respaldo inline de imágenes) · 6 Cobros · 7 Gastos · 13 Fiscalidad · 16 Mantenimiento/profesionales · 17 Pólizas · 27 Infraestructura |
| **Defectuosa** (flujo central roto de forma reproducible) | 4 Captación pública (AG-01, AG-02) |
| **Pendiente de verificar (V)** | 8 Custodia P2/P3 en Storage real y 10 Avisos/correo (entrega real), 14/15 UI, toda operación externa (IA, Catastro, GCS, cron) |
| **Decisión de alcance (no es pendiente de trabajo)** | 21 Facturación B2B/Veri*Factu · 26 Sindicación/OTP/WhatsApp/PSD2/iniciación de pagos · importación bancaria automática |

---

## 4. Mapa de dependencias e integración (extremo a extremo)

```
[Identidad]  usuarios ──(authUid)──> usuarios_auth/{uid} (espejo) ──> firestore.rules (me()/isStaff()/carteras)
                                                   └──> storage.rules  firestore.get(/databases/(default)/…)  ✖ AG-03 (la app usa base con nombre)

[Captación]  Portal solicitud (anónimo) ──> solicitudes ✖ AG-01 (claves) ──> candidatos ✔ ──> visita/cuestionario/documentación por token ✖ AG-02 (sin ruta servidor, reglas niegan anónimo)
             ──> Formalización ──> contratos_formalizacion ──> ficha pública (transacción) ✔

[Contrato]   contratos_formalizacion.rentaMensual (canónico) ──> cobrosEngine.generarPeriodosParaContrato (hoy+2 meses, importePrevisto fijado al crear)
             ──> App.tsx efecto automático (todos los clientes) ──> saveContratoFirestore (doc completo, merge)  ⚠ AG-10
             P4 confirmar ──> rentaMensual + anexos_actualizacion_renta ──✖ no toca periodos ya materializados  ⚠ AG-06
             ──> Avisos P1 (cron 06:00, SMTP) ──> Morosidad ──> Tesorería/liquidaciones

[Gasto]      GastoModal (manual) ──> gastos + justificanteUrl (Storage gastos_facturas/ ó servidor efímero ✖ AG-04)
             OCR P5 ──> gastos.documento + documentos_patrimoniales (P3, SHA-256) ✔
             Importador ──> save*Firestore + uploadFacturaGasto (misma vía legada)
             ──> fiscalEngine ("con justificante" solo documento/documentos) ✖ AG-05 ──> expediente informativo
             ──> Paquete asesor P6 (solo documentos_patrimoniales) ⚠ AG-05

[Documento]  P3 gestorFirebase (fail-closed) ──> Storage documentos_patrimoniales/ ──(AG-03)──> denegado para no-master ⇒ error visible
             Legado (facturas, justificantes cobro, docs aportados, pólizas) ──(fallo/8 s)──> /api/upload-document (RAM, sin auth) ⇒ falso éxito ✖ AG-04

[Servidor]   Cliente ──Bearer ID token──> guardia (verificación x509 securetoken) ──> Firestore REST con cuenta de servicio (P2/P4/titulares/IA/seguimiento)
             Vercel cron ──Bearer CRON_SECRET──> /api/cron/avisos (503 si falta)  ·  /api/upload-document, /api/documents/:id, /api/catastro/consultar: sin autenticación
```

Dependencias críticas entre módulos: la **identidad** (1) condiciona todas las reglas; la **custodia P3** (8) sostiene P5, P6 y la trazabilidad documental; el **contrato** (5) es la fuente del calendario de cobros (6), de P4 (11) y de los avisos (10); el **gasto** (7) alimenta fiscalidad (13), tesorería (14) y P6 (12).

---

## 5. Auditoría de seguridad, persistencia, datos y permisos

### 5.1 Reglas Firestore (`firestore.rules`)
- 77 bloques de primer nivel + 4 anidados; cada `collection(db,'…')` del cliente (65) tiene bloque; catch-all final deniega (`:4065`). Perfil veraz exige `usuarios_auth/{uid}` ACTIVO coherente con `usuarios/{usuarioId}` (`:515-527`). El inquilino solo puede tocar `incidenciaIds/mensajeIds/fechaActualizacion` de su contrato. `usuarios`: la auto-escritura no puede alterar `passwordHash`/rol (`:2359`).
- Discrepancias cliente↔reglas demostradas con el harness del repo: `solicitudes.create` (AG-01) y `profesionales.create` (AG-07).
- Reglas que **presuponen** un servidor inexistente: `candidatos` (`:2049-2053` "`/api/cuestionario/:token`"), `invitaciones`/`slots_visita`/`solicitudes_documentacion` ("el flujo público de visita pasa por el servidor"). `server.ts` no define ninguna ruta `/api/cuestionario|visita|documentacion` (AG-02).
- Suscripciones **sin acotar** para perfiles no internos (`subscribeCandidatos`, `subscribeSolicitudes`, `subscribeInvitaciones`, `subscribeVisitSlots`, `subscribeSolicitudesDoc`; `App.tsx:1160-1181, 1305-1330`): las reglas solo permiten `list` global al personal → `permission-denied` e incidencias de lectura en cada sesión de propietario/profesional (AG-09b, S3) y en todo visitante anónimo.

### 5.2 Reglas Storage (`storage.rules`)
- El ámbito (titular, carteras L/E, administración) se resuelve con `firestore.exists/get(/databases/(default)/documents/usuarios_auth|usuarios|inmuebles|gestiones_cartera/…)` — **40 referencias a `(default)`** (`:71-82, :108, :117`). La app escribe el espejo solo en la base con nombre (`firebase-applet-config.json.firestoreDatabaseId`). Solo `isMasterAdmin()` (correo fijo `sarqsan2@gmail.com`) no depende de Firestore.
- La prueba oficial de CI `tests/emulador/storage-ambitos.emulador.test.ts:124-176` reproduce exactamente esa topología (ficha solo en la base con nombre, borrada de `(default)`) y **comprueba que la subida es denegada** (`assertFails`), y que una regla alternativa apuntando a la base con nombre la permitiría solo en el emulador ("puede NO estar admitida por Firebase publicado"). Conclusión: en el repositorio, para cualquier usuario que no sea el master, Storage deniega lecturas/escrituras con ámbito (AG-03). El estado real de producción (reglas publicadas, datos en `(default)`) **no se ha podido verificar** (V-1).
- Residuales ya conocidos y no reabiertos: R-3 (MIME), R-4 (`downloadURL` con token como capacidad), R-5 (rutas).

### 5.3 Servidor (`server.ts`, `server/**`)
- Autenticación: rutas P2/P4/titulares/IA-admin/seguimiento con `guardia` (ID token verificado contra certificados `securetoken@system`; sin firebase-admin; cuenta de servicio por variables `FIREBASE_SERVICE_ACCOUNT*`/`GOOGLE_APPLICATION_CREDENTIALS`). Operaciones IA con `nucleoIA.operacion()` (cuotas, llaves, fail-closed). Prueba SMTP: ID token + perfil ADMINISTRADOR en Firestore + límite de intentos. Cron: `CRON_SECRET` obligatorio.
- **Sin autenticación**: `POST /api/upload-document` (`:182`, cuerpo JSON hasta 50 MB, almacén RAM 15 MB/doc, 250 entradas, 96 MB, TTL 12 h), `GET /api/documents/:fileId` (`:238`, id aleatorio de 128 bits), `POST /api/catastro/consultar` (`:2241`, proxy a la OVC del Catastro), `GET /api/health` (`:2750`, expone banderas de configuración). `express.json({limit:'50mb'})` global (`:167-168`).
- `/api/notificaciones/enviar` (`:2816`) resuelve contexto de autenticación por petición y delega en el dispatcher (A16-03 cerrado).

### 5.4 Persistencia y datos
- **Almacén efímero** (`src/lib/documentosServidor.ts`): memoria del proceso; en Vercel cada instancia tiene su RAM y se recicla → el binario desaparece y la URL `/api/documents/{id}` deja de resolver; el registro en Firestore (`justificantePath = server_*`) queda huérfano. Lo usan: `uploadFacturaGasto` (`firebase.ts:2623`; 8 s de carrera; ruta `sin_asignar` si falta `propietarioId`), `uploadJustificanteCobro` (`:3107`), `uploadDocumentoAportadoFile` (`:2836`, servidor **primero**), `DetallePolizaModal.tsx:139` (servidor y si no base64 en Firestore).
- **Respaldos inline**: imágenes de inmueble con 2 s de espera → data URL comprimida en el documento (`firebase.ts:2942-2990`) y recorte silencioso a 10/6 imágenes si el documento supera 850 000 caracteres (`sanitizeInmuebleForFirestore`, `:1056-1073`); adjuntos de reformas con 8 s → data URL (`:2596-2616`).
- **Duplicidad de modelo** (riesgo de incoherencia, no defecto por sí misma): titularidad en `propietarioId`/`propietarioPrincipalId`/`propietarioSecundarioId`/`datosFiscales.*`/`titularesIds[]`/`titularidadDeclarada`; renta en `precio`/`rentaMensual`/`rentaMensualDeclarada` frente al canónico `ContratoFormalizacion.rentaMensual`; en `Gasto`, `justificanteUrl/Path` vs `documento/documentos`, `fecha` vs `fechaDevengo/fechaPago`, `pagado` vs `estado` (`normalizarGasto` no rellena ningún alias; la deducibilidad sí está unificada por `analizarDeducibilidad`).
- **Restauración caché → Firestore**: `App.tsx:1305-1318` reescribe en Firestore los candidatos en memoria (hidratados de `localStorage`) cuando el snapshot autorizado llega vacío, en contra del principio aplicado a inmuebles ("un snapshot vacío NUNCA dispara restauración", `App.tsx:1293-1296`).
- **Concurrencia**: `registroCobros[]` embebido en el contrato y guardado completo con `setDoc(merge)` desde un efecto automático en todos los clientes (`App.tsx:1516-1536`, sin `await`): último escritor gana entre clientes simultáneos; perfiles sin permiso de escritura (gestor L, inquilino) provocan `permission-denied` e incidencia "contratos" en cada cambio de mes.
- **Credenciales**: `authService.ts` persiste un SHA-256 sin sal de la contraseña en `usuarios/{id}` (`:362, :483, :774`); el único consumidor es la rama muerta de "Acceso Directo" (`:310-335`); correo master fijo (`:45`). `system/gmail_config` no contiene secretos (solo metadatos y `tokenExpira`). `seedInitialDataIfEmpty` (ejecutado en el login ADMIN) solo actúa con `usuarios` vacío y crea dos perfiles demo (`propietario@email.com`, `contacto@fontaneriagarcia.es`) sin cuenta Auth.

### 5.5 Dependencias (producción)
`npm audit --omit=dev`: 7 vulnerabilidades — **altas**: `nodemailer` 6.10.1 (inyección de comandos SMTP vía `envelope.size`; conflicto de interpretación de dominio; corregidas en >10.0.5 según el aviso), `@grpc/grpc-js` 1.9.16 (transitiva de `firebase`), `source-map-js` 1.2.1, `firebase`/`@firebase/firestore*` (por grpc); **baja**: `dompurify` (transitiva de `jspdf`).

---

## 6. Resultados de pruebas (cifras exactas)

| Prueba | Comando | Resultado | Observaciones |
|---|---|---|---|
| Tipos | `npx tsc --noEmit -p .` | **0 errores** (exit 0) | Igual que CI |
| Unitarias/lógicas | `npx vitest run --exclude tests/guardia-a04-rama-sesion.test.ts` | **262 ficheros, 4 705 pruebas: 4 698 correctas, 0 fallidas, 7 `todo`**; 239,16 s (inicio 10:30:33 UTC) | Idéntico a CI de PR #56. `tests/emulador/**` excluido por configuración; P1/P7 con dobles (SMTP de captura, IA simulada) — **no** certifican entrega real |
| Build | `npm run build` | **Correcto** (vite 16,79 s; `dist/server.cjs` 564 kB) | Aviso: chunk principal 5 531 kB (1 372 kB gzip) |
| Integración (node --test) | `npm run test:integracion` | **302 pruebas: 300 correctas, 2 fallidas** (exit 1) | Las 2 fallidas son guardas de "checkout f782" (`src/features/operaciones/tests/integration-boundaries.test.mjs:79`, `isolation.test.mjs:445`) obsoletas y ya documentadas en P7; no describen defectos funcionales |
| Reglas (emulador oficial) | `npm run test:emulador:reglas` | **No ejecutado localmente** (sin Java/firebase-tools, por orden) | Evidencia CI del mismo árbol (PR #56): **79/79** (documentos-p3 11, importacion-adaptador 8, justificantes-cobro 1, reglas-inmuebles 53, storage-ambitos 6) |
| Reglas (harness del repo, ad hoc) | Dos ficheros temporales en `/tmp/auditoria-harness` (fuera del repo) importando `tests/harness/firestoreRulesEval.ts` | **5/5** | AG-01: carga real del portal → `solicitudes.create` **denegada**; con `nombre/email/telefono` → permitida; `candidatos.create` → permitida. AG-07: `creadoPorPropietarioId = id de usuario` → **denegada**; `= propietarioId` → permitida |
| Seguridad de dependencias | `npm audit --omit=dev` | **7** (6 altas, 1 baja) | §5.5 |
| Guardia A-04 | `npm run auditoria:repositorio` | No ejecutado (comprueba la rama de sesión; irrelevante para producto) | — |
| UI / E2E de navegador | — | **No existen** en el repositorio (solo `@testing-library/react` en unitarias) | Toda validación de pantalla queda como V |
| Operaciones externas | SMTP real, Gmail, Gemini, Catastro, GCS, cron Vercel, Firestore/Storage de producción | **No ejecutadas** (prohibido) | V |

---

## 7. Hallazgos priorizados

Formato: **ID · Severidad · Módulo** — descripción · fichero/función · evidencia · impacto · dependencias · prioridad · corrección mínima · verificación.

### S1 — Altos

**AG-01 · S1 · Captación pública (4)** — El alta pública de solicitud se envía con `candidatoNombre/candidatoEmail/candidatoTelefono` y las reglas exigen `nombre/email/telefono` → la escritura en `solicitudes` es denegada mientras el portal muestra "enviado". · `src/components/PortalSolicitudPublicaView.tsx:268-321`, `src/App.tsx:2462-2503` (`handleSavePublicSolicitud`, sin `await`), `src/lib/firebase.ts:1414-1421` (`saveSolicitudFirestore` traga el error), `firestore.rules:2086-2088`. · Evidencia: harness 3/3 (§6); persiste A16-01. · Impacto: se pierde el cuestionario, ingresos, consentimiento y documentación declarada; solo queda el `candidatos` mínimo; falso éxito ante el candidato. · Dependencias: ninguna. · Prioridad: 2. · Corrección mínima: emitir también `nombre/email/telefono` (o decidir que la regla acepte los alias), esperar la escritura y mostrar error real; sin cambiar el modelo. · Verificación: prueba con el harness + emulador (`solicitudes.create` anónimo) + prueba manual del portal.

**AG-02 · S1 · Captación pública (4)** — Los portales públicos de visita, cuestionario y documentación dependen de lecturas/escrituras anónimas que las reglas niegan desde el cierre 2026-10-14, y la ruta de servidor que los comentarios de las reglas presuponen no existe. · `firestore.rules:2049-2053, 2095-2185`; `server.ts` (grep sin `/api/cuestionario|visita|documentacion`); `src/App.tsx:1160-1181` (suscripciones anónimas), `:3854-3857` (búsqueda del candidato en memoria). · Evidencia: código; persiste A16-02. · Impacto: los enlaces enviados a candidatos terminan en "no encontrado o caducado"; la agenda de visitas y la documentación post-visita no funcionan por enlace público (sí para usuarios autenticados). · Dependencias: decisión de diseño (ruta de servidor con token + cuenta de servicio, como `/api/titulares/buscar`). · Prioridad: 2. · Corrección mínima: rutas servidor `GET/POST` por token con lista blanca de campos para `invitaciones`, `slots_visita`, `candidatos.cuestionario*`, `solicitudes_documentacion`; retirar las suscripciones anónimas. · Verificación: emulador oficial + prueba manual de los 3 enlaces.

**AG-03 · S1 (producción V) · Identidad/Storage (1, 8)** — `storage.rules` resuelve el ámbito con `firestore.get/exists(/databases/(default)/…)` (40 referencias) y la aplicación opera exclusivamente sobre la base con nombre; solo el master por correo queda exento. · `storage.rules:71-82, 108, 117`; `firebase-applet-config.json`; `firebase.json`; `src/lib/firebase.ts:131-134`. · Evidencia: `tests/emulador/storage-ambitos.emulador.test.ts:124-176` (verde en CI) demuestra la denegación con la ficha solo en la base con nombre; persiste A16-05. · Impacto: para propietarios, gestores y administradores no-master, toda operación de Storage con ámbito se deniega → P3/P5 fallan de forma visible (fail-closed), P6 no puede incorporar binarios, y los flujos legados caen en el almacén efímero (AG-04) o en base64 inline (AG-19) con apariencia de éxito. · Dependencias: decisión arquitectónica (replicar el espejo mínimo `usuarios_auth`/`usuarios`/`inmuebles`/`gestiones_cartera` en `(default)`, o migrar la app a `(default)`, o reformular `storage.rules` sin lecturas de Firestore); verificación con el proyecto real. · Prioridad: **1**. · Corrección mínima: la que se decida; en cualquier caso una prueba autorizada en aceptación antes de publicar. · Verificación: cuenta de prueba no master sube/lee `gastos_facturas/{pid}/…` y `documentos_patrimoniales/…` en el proyecto real (V-1).

**AG-04 · S1 · Documentos legados / servidor (6, 7, 17, 27)** — Respaldo silencioso en RAM del servidor sin autenticación. · `server.ts:182-312`, `src/lib/documentosServidor.ts`, `src/lib/firebase.ts:2623-2720, 2836-2900, 3107-3175`, `src/components/modals/DetallePolizaModal.tsx:139`. · Evidencia: código; persiste A16-04. · Impacto: pérdida del binario al reciclarse la función de Vercel (referencia `server_*` huérfana en `gastos`/`cobros`/pólizas), falso éxito, subida anónima de hasta 50 MB por petición (abuso). · Dependencias: AG-03 multiplica su frecuencia. · Prioridad: 3. · Corrección mínima: convertir los flujos legados en fail-closed con mensaje explícito (sin respaldo), o exigir ID token y marcar el registro como "sin custodia duradera"; limitar `express.json` por ruta. · Verificación: pruebas unitarias de los `upload*` con Storage fallando (deben rechazar) + prueba manual.

### S2 — Medios

**AG-05 · S2 · Gastos → Fiscalidad → P6 (7, 13, 12)** — Las facturas adjuntadas por el flujo manual (`justificanteUrl`) no cuentan como "con justificante" ni entran en la documentación fiscal ni en el índice documental del paquete del asesor. · `src/utils/fiscalEngine.ts:386-390` (solo `documento/documentos`), `:423-460` (`recopilarDocumentacionFiscal` usa `gasto.documento` y `gasto.fecha`, con `fecha` a menudo indefinida → orden por `Invalid Date`), `src/components/sections/FiscalidadSection.tsx:352, 456`, `src/lib/paqueteAsesor/documentos.ts:36-48` (solo custodia P3), frente a `src/lib/expedienteDocumental/indice.ts:150` que sí reconoce `justificanteUrl`. · Impacto: contadores y expediente informativo incorrectos (gastos documentados aparecen como sin justificante); el asesor no recibe esas facturas en el ZIP (sí las filas CSV). · Dependencias: AG-14. · Prioridad: 4. · Corrección mínima: vista canónica del gasto (`normalizarGasto` o un selector único) que exponga `documento` derivado de `justificanteUrl`, y en P6 declarar como "referencia no custodiada" los `justificanteUrl` fuera de P3. · Verificación: pruebas unitarias de `calcularGastosEjercicio`/`recopilarDocumentacionFiscal` con gasto manual.

**AG-06 · S2 · P4 → Cobros (11, 6)** — La actualización efectiva de renta cambia `rentaMensual` y registra el anexo, pero los periodos de cobro ya materializados (el motor genera hasta hoy + 2 meses) conservan el `importePrevisto` anterior. · `src/utils/cobrosEngine.ts:320-331` ("conservar intacto"), `:360` (`importePrevisto` solo al crear), `src/App.tsx:1516-1536` (materialización anticipada), `server/actualizacionRenta/servicioActualizacionRenta.ts` (sin referencia a `registroCobros`). · Nota: no se reabre la decisión P4-B de no recalcular recibos **históricos**; esto afecta a mensualidades futuras/pendientes ya generadas. · Impacto: recibos, recordatorios P1 y saldos de morosidad de 1-3 meses con importe desactualizado tras cada actualización. · Dependencias: decisión de alcance (periodos PENDIENTE con `periodoMesAnio ≥ fechaEfectiva`). · Prioridad: 4. · Corrección mínima: al confirmar P4, actualizar `importePrevisto` de los periodos PENDIENTE posteriores a la fecha efectiva con entrada en `historialCambios`. · Verificación: prueba unitaria del motor + prueba de confirmación P4 con periodos pregenerados.

**AG-07 · S2 · Profesionales (16)** — `CrearProfesionalModal` guarda `creadoPorPropietarioId = currentUser.id` (id de usuario) y las reglas comparan con `propietarioId` → un propietario no puede dar de alta profesionales privados. · `src/components/modals/CrearProfesionalModal.tsx:143-148`, `firestore.rules:2412` (`incoming().creadoPorPropietarioId == myPropId()`), `src/lib/authService.ts:766-767` (ids distintos). · Evidencia: harness 2/2; residual documentado en P3. · Impacto: función inoperativa para el titular; sin pérdida de datos. · Prioridad: 5. · Corrección mínima: usar `currentUser.propietarioId`. · Verificación: harness + emulador + alta manual.

**AG-08 · S2 · Acceso (1)** — Persistencia de `passwordHash` (SHA-256 sin sal) en `usuarios/{id}` y correo master fijo. · `src/lib/authService.ts:45, 310-335, 362, 483, 774`. · Impacto: material de credencial redundante (Firebase Auth es la autoridad) que amplía el daño ante cualquier fuga de la colección; rama "Acceso Directo" muerta que lo consume. · Prioridad: 6. · Corrección mínima: dejar de escribirlo, retirar la rama muerta; limpieza de datos existente con autorización. · Verificación: grep + pruebas de `authService`.

**AG-09 · S2 · Captación/Datos (4)** — Restauración caché → Firestore de candidatos: si el snapshot autorizado llega vacío, se reescriben en Firestore los candidatos en memoria (de `localStorage`). · `src/App.tsx:1305-1318`. · Impacto: resurrección de candidatos borrados (personal) o escrituras denegadas en bucle (resto); contradice la norma aplicada a inmuebles (`App.tsx:1293-1296`). · Prioridad: 5. · Corrección mínima: eliminar la rama de reescritura. · Verificación: prueba unitaria del callback con snapshot vacío.

**AG-10 · S2 · Contratos/Cobros (5, 6)** — Guardado automático del contrato completo desde todos los clientes (`registroCobros[]` embebido, `setDoc merge` sin `await`): ventana de pérdida de actualización entre clientes simultáneos (titular + gestor) y escrituras denegadas para gestor L/inquilino con incidencia "contratos". · `src/App.tsx:1516-1536`, `src/lib/firebase.ts:1502-1521`, `firestore.rules:1454-1533`. · Impacto: posible pérdida de un pago registrado concurrentemente; ruido de incidencias cada cambio de mes. · Prioridad: 6. · Corrección mínima: limitar el guardado automático a perfiles con permiso de escritura y escribir los periodos nuevos mediante transacción (leer-modificar-escribir). · Verificación: prueba unitaria del efecto por perfil + prueba de concurrencia en emulador.

**AG-11 · S2 · Infra/pruebas (27)** — `npm run test:integracion` falla por dos guardas de "checkout f782" obsoletas, dejando el script en rojo permanente y ocultando regresiones reales. · `src/features/operaciones/tests/integration-boundaries.test.mjs:79`, `isolation.test.mjs:445`. · Prioridad: 7. · Corrección mínima: rebasar o retirar las guardas con autorización (no "ponerlas en verde" modificando producto). · Verificación: script en verde sobre el nuevo SHA.

### S3 — Bajos

**AG-12 · S3 · Dependencias (27)** — `nodemailer` 6.10.1 con 2 avisos altos (inyección SMTP vía `envelope.size`; dominio no previsto), `@grpc/grpc-js` 1.9.16 transitiva, `source-map-js`, `dompurify` baja. · `package.json:37-42`. · Corrección: actualizar `nodemailer` a la versión corregida y re-ejecutar P1 (`test:p1-avisos`, vitest); `npm audit` limpio. · Verificación: `npm audit --omit=dev` y suite verde.

**AG-13 · S3 · Servidor (27, 2)** — `/api/catastro/consultar` sin autenticación (proxy abusable, URL fija), `/api/health` expone banderas de configuración, `express.json` 50 MB global. · `server.ts:167-168, 2241, 2750`. · Corrección: `guardia` o límite por IP en Catastro; `health` mínimo; límite de cuerpo por ruta.

**AG-14 · S3 · Modelo de datos (2, 3, 7)** — Duplicidad de campos (titularidad, renta, alias de `Gasto`) sin normalización central (§5.4). Es deuda estructural, origen de AG-05. · Corrección: selectores canónicos puros y pruebas; sin migración masiva.

**AG-15 · S3 · Rendimiento (27)** — Chunk principal 5 531 kB (1 372 kB gzip) y `App.tsx` de 4 926 líneas que hidrata ~20 colecciones vía `localStorage`. · Corrección opcional: `manualChunks`/carga diferida de secciones.

**AG-16 · S3 · Import/Export (22)** — Comentario inicial de `src/lib/importExport/ejecucion.ts:12-16` desfasado ("solo GASTO y COBRO", "INMUEBLE vinculado") frente al código que ya permite alta de INMUEBLE (A16-08).

**AG-17 · S3 · Acceso (1)** — `seedInitialDataIfEmpty` (login ADMIN) crea perfiles demo en `usuarios` si la colección está vacía (`src/lib/firebase.ts:185-214, 3455-3560`). Solo riesgo en arranque de un entorno nuevo.

**AG-18 · S3 · Captación (4)** — Suscripciones sin ámbito para perfiles no internos y para anónimos (`candidatos`, `solicitudes`, `invitaciones`, `slots_visita`, `solicitudes_documentacion`) → `permission-denied` e incidencias de lectura en cada sesión. · `src/App.tsx:1160-1181, 1305, 1325`, `src/lib/firebase.ts:1005, 1036`. · Corrección: acotar por `propietarioId`/inmuebles o no suscribir fuera del personal.

**AG-19 · S3 · Inmuebles (2, 20)** — Respaldo inline (data URL) de imágenes (2 s) y adjuntos de reformas (8 s) dentro del documento Firestore y recorte silencioso a 10/6 imágenes. · `src/lib/firebase.ts:1056-1073, 2596-2616, 2942-2990`. · Bajo AG-03 este respaldo pasa a ser la vía habitual para no-master. · Corrección: fail-closed con aviso, sin recorte silencioso.

**AG-20 · S3 · P7 (10)** — Nombres `scoreSolvenciaIA`/`nivelRiesgoIA` no describen el origen real (ya documentado en P7); cosmético.

### Observaciones que NO son defectos (decisiones vigentes)
Veri*Factu/B2B/sindicación/OTP preparados sin operar (A16-07); importación bancaria desactivada y SEPA conservado (E-06); P4 sin rectificación ni recálculo histórico; P6 tope de 120 inmuebles y solo originales P3; P1 estados `entrega_incierta:*`; IA/Gmail fail-closed sin clave.

---

## 8. Limitaciones no verificables en esta sesión

| ID | Qué no se ha podido verificar | Motivo | Cómo verificarlo |
|---|---|---|---|
| V-1 | Reglas Firestore/Storage **realmente publicadas** y comportamiento de `firestore.get(/databases/(default)/…)` con la base con nombre en el proyecto real (AG-03) | Sin acceso ni autorización a producción; emulador no instalado | Con autorización: `firebase deploy --only` **no**; usar cuenta de prueba no-master en aceptación y comparar reglas publicadas con el repo |
| V-2 | Entrega real de correo (SMTP/Gmail) y ejecución del cron de Vercel (`CRON_SECRET`, variables) | Prohibido enviar correos / sin acceso a Vercel | Prueba SMTP administrativa controlada + registro del cron en un día de ejecución |
| V-3 | Operaciones IA (Gemini), Catastro, adaptador GCS P2 con credencial de servicio | Sin claves ni red a esos hosts | Prueba controlada en aceptación con cuotas |
| V-4 | Comportamiento real del almacén efímero en Vercel (reciclado, memoria por instancia) | Sin acceso al despliegue | Subir vía flujo legado y consultar `/api/documents/{id}` tras >15 min de inactividad |
| V-5 | Estado de los datos existentes (registros con `server_*`, imágenes inline, `candidatos` restaurados, `creadoPorPropietarioId` con id de usuario) | Sin lectura de producción | Consulta de solo lectura autorizada |
| V-6 | Flujos de interfaz (42 secciones) y portales por rol | No hay pruebas E2E de navegador en el repo | Plan de pruebas manuales por rol sobre el SHA |
| V-7 | Emulador oficial de reglas en esta máquina | Java/firebase-tools no instalados por orden | CI del mismo árbol: 79/79 (válido como evidencia del árbol, no de producción) |
| V-8 | Rendimiento real (arranque, memoria) con volúmenes productivos | Sin datos ni entorno | Medición en aceptación |

---

## 9. Plan de siguientes pasos (5 grupos, en orden)

### Grupo 1 — Bloqueos críticos
| Orden | Problema | Módulos | Por qué antes | Alcance de la corrección | Pruebas | Dependencias | Autorización / coste |
|---|---|---|---|---|---|---|---|
| 1.1 | **AG-03** topología `(default)` vs base con nombre | 1, 8, 6, 7, 12 | Condiciona toda la custodia documental y la fiabilidad de P3/P5/P6 para cualquier usuario no master | Decisión entre (a) espejo mínimo replicado en `(default)`, (b) migrar la app a `(default)`, (c) `storage.rules` sin dependencia de Firestore; después verificación en aceptación | Emulador (`storage-ambitos`, `documentos-p3`) + prueba autorizada en el proyecto real | Decisión del propietario del sistema; posible migración de datos | **Requiere autorización explícita**; coste medio-alto (reglas + verificación) |
| 1.2 | **AG-01** alta pública denegada | 4 | Pérdida de datos de candidatos y falso éxito en el primer contacto comercial | Campos `nombre/email/telefono` + `await` + error visible | Harness, emulador `solicitudes.create`, manual | Ninguna | Autorización de código; coste bajo |
| 1.3 | **AG-02** portales públicos por token | 4 | Enlaces enviados a candidatos no funcionan | Rutas de servidor por token con lista blanca (patrón `/api/titulares/buscar`); retirar suscripciones anónimas | Emulador + manual (3 enlaces) | Cuenta de servicio en Vercel (ya requerida por P2/P4) | Autorización de código; coste medio |
| 1.4 | **AG-04** respaldo efímero | 6, 7, 17, 27 | Pérdida de binarios y falso éxito; superficie anónima de 50 MB | Fail-closed en `upload*` legados; autenticación de rutas o retirada | Unitarias de `upload*` con Storage fallando; manual | 1.1 reduce su frecuencia | Autorización de código; coste bajo-medio |

### Grupo 2 — Correcciones de integración
| Orden | Problema | Módulos | Alcance | Pruebas | Dependencias | Coste |
|---|---|---|---|---|---|---|
| 2.1 | AG-05 facturas manuales invisibles para fiscal/P6 | 7, 13, 12 | Selector canónico de documento del gasto; P6 declara referencias no custodiadas | Unitarias fiscalEngine/paqueteAsesor | AG-14 | Bajo |
| 2.2 | AG-06 P4 → periodos pregenerados | 11, 6 | Actualizar `importePrevisto` de PENDIENTE ≥ fecha efectiva con historial | Unitaria motor + confirmación P4 | Decisión de alcance (no toca históricos) | Bajo |
| 2.3 | AG-07 `creadoPorPropietarioId` | 16 | `currentUser.propietarioId` | Harness + emulador | — | Muy bajo |
| 2.4 | AG-09 restauración caché → Firestore | 4 | Eliminar rama de reescritura | Unitaria | — | Muy bajo |
| 2.5 | AG-10 guardado automático de contratos | 5, 6 | Solo perfiles con escritura; transacción para periodos nuevos | Unitaria + emulador | — | Medio |
| 2.6 | AG-18 suscripciones sin ámbito | 4 | Acotar o no suscribir fuera del personal | Unitaria (`bloque-12-a01`) | — | Bajo |

### Grupo 3 — Verificaciones operativas pendientes
V-1 (reglas publicadas y Storage real, tras 1.1) · V-2 (SMTP/cron) · V-3 (IA/Catastro/GCS) · V-4 (efímero en Vercel) · V-5 (estado de datos antiguos: `server_*`, inline, ids erróneos) · V-6 (pruebas manuales por rol) · V-8 (rendimiento). Todas requieren autorización separada y credenciales no productivas donde sea posible.

### Grupo 4 — Funcionalidades incompletas
| Elemento | Estado | Alcance mínimo | Coste |
|---|---|---|---|
| Captación pública (visita/cuestionario/documentación) | Inoperativa por enlace público (1.3) | Rutas servidor + pruebas | Medio |
| Custodia de documentos legados (facturas manuales, justificantes de cobro, pólizas, reformas, imágenes) | Vías paralelas a P3 con respaldos inadecuados | Reconducir progresivamente a P3 (sin migración masiva; registrar "sin custodia duradera") | Medio |
| Expediente fiscal informativo | No incluye `justificanteUrl` (2.1) | Selector canónico | Bajo |

### Grupo 5 — Mejoras opcionales
AG-12 actualización de `nodemailer`/auditoría de dependencias · AG-11 retirar guardas obsoletas de `test:integracion` · AG-13 límites y autenticación de rutas menores · AG-15 partición del bundle · AG-16/AG-20 textos desfasados · AG-17 semilla demo · AG-19 respaldos inline fail-closed · Disparar el workflow de CI también en `push` a `main`.

---

## 10. Áreas que no requieren más trabajo ahora

- **P1 avisos/correo** (núcleo, estados de entrega, cron fail-closed) y **P7 trazabilidad IA/correo**: código y pruebas coherentes; solo quedan verificaciones operativas (V-2/V-3).
- **P2 justificantes de cobro (servidor con `guardia`, GCS 503 sin credencial)** y **P3 custodia documental** (motor puro, SHA-256, fail-closed): sin defecto reproducible; dependen de la decisión 1.1 para operar fuera del master.
- **P5 OCR** (navegador, propuesta → gasto + documento P3) y **P6 paquete del asesor** (núcleo determinista, verificación de huella): sin defecto reproducible; ampliación de alcance solo si se aprueba 2.1.
- **P4 actualización de renta** (previsualizar/confirmar, anexos v1 inmutables): correcto; 2.2 es integración con cobros, no rectificación de P4.
- **Titulares, carteras, titularidades, transmisiones, baja patrimonial, `/api/titulares/buscar`**: reglas, motor y pruebas coherentes (53 pruebas de reglas en CI).
- **Tesorería/liquidaciones/órdenes de pago, conciliación manual, morosidad, seguro de impago, actas/inventario, suministros, financiación/inversión, recomercialización, import/export, configuración/IA/ayuda, portal del inquilino**: sin hallazgos de código más allá de verificaciones de interfaz (V-6).
- **Decisiones cerradas que no deben reabrirse**: integración bancaria automática/PSD2, iniciación de pagos, WhatsApp, nuevos proveedores de pago, presentaciones fiscales automáticas, Veri*Factu/B2B operativo, sindicación/OTP.

---

## Anexo A — Comandos ejecutados (todos de solo lectura o locales)

`git status/branch/rev-parse/log`, `git fetch --unshallow`, `git diff --stat ae5c32f cd58c9e`, `gh run list --limit 8`, `gh pr view 56 --json comments`; lecturas de código con `sed/grep/read`; `npm ci --no-audit --no-fund`; `npx tsc --noEmit -p .`; `npx vitest run --exclude tests/guardia-a04-rama-sesion.test.ts --reporter=dot --reporter=json`; `npm run build`; `npm run test:integracion`; `npm audit --omit=dev --json`; dos ficheros temporales de evaluación con `tests/harness/firestoreRulesEval.ts` ejecutados con `vitest --root /tmp/auditoria-harness` (fuera del repositorio; no se han añadido al árbol).

## Anexo B — Correspondencia con la auditoría del 16-10-2026

| Incidencia previa | Estado a `cd58c9e` |
|---|---|
| A16-01 (alta pública de solicitud) | **Persiste** → AG-01 (ahora con evidencia de harness) |
| A16-02 (portales públicos por token) | **Persiste** → AG-02 |
| A16-03 (autenticación de notificaciones) | Cerrado (Fase A; `server.ts:126-152`, `:2816`) |
| A16-04 (almacén efímero) | **Persiste** → AG-04 |
| A16-05 (`(default)` en `storage.rules`) | **Persiste**, con evidencia CI de denegación → AG-03; producción V-1 |
| A16-06 (expectativa falsa en `roadmap01-seguridad`) | Cerrado (7/7; suite 4 698/4 698) |
| A16-07 (funciones "preparadas") | Decisión de alcance; sin cambio |
| A16-08 (comentario desfasado) | **Persiste** → AG-16 |
