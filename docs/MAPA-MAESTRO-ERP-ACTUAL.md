# MAPA MAESTRO CANÓNICO DEL ERP — GESTOR DE INMUEBLES

> **Documento principal de continuidad del proyecto.** Si el código cambia, este
> documento se actualiza en el mismo commit/orden que lo introduce.
>
> Fuente de verdad: el estado real del código, Git y la documentación canónica.
> Los documentos históricos (auditorías, informes GAP) se **enlazan**, no se duplican.
>
> Última actualización: 2026-09-20 — 2.ª actualización: decisiones de producto
> (Portal del Inquilino consolidado como **BLOQUE E** con dependencias B/C/D y
> **Capa Transversal de Experiencia, Ayuda, Tutoriales e IA Asistente**, sin
> numeración GAP). 1.ª actualización: paquete de continuidad.
> Rama `arena/01a0bfbe-gestor-de-inmuebles-vercel`, sobre el consolidado
> canónico `91da820`.

---

## 1. IDENTIDAD DEL PROYECTO

| Campo | Valor |
|---|---|
| Repositorio canónico | `github.com/sarqsan/Gestor-de-inmuebles-vercel` |
| Rama canónica | `arena/01a0a413-gestor-de-inmuebles-vercel` @ `91da820` (GAP 1–8 consolidados) |
| Rama de sesión actual | `arena/01a0bfbe-gestor-de-inmuebles-vercel` — merge `d24ab1f` (árbol **byte-idéntico** a `91da820`) + este paquete de continuidad |
| `main` | `4d420bd` — línea paralela (mantenimiento/candidatos/seguros por AI Studio). **No es la base del ERP**; su aportado sigue preservado (ver §9) |
| Deploy | Vercel (`vercel.json`: build → `dist`, función serverless `api/index.ts` → Express, rewrites SPA) |
| Firebase | Proyecto `startup-sanctuary-sln7n` · Firestore `ai-studio-gestordeinmueble-c6444afd-24ca-4983-b195-ceb2c5ebdc51` · Storage `startup-sanctuary-sln7n.firebasestorage.app` |
| Base de datos | Firestore (~45 colecciones, ver §2.2) + Storage (rutas declaradas en `storage.rules`) |
| IA | Gemini (`@google/genai`) vía endpoints Express de `server.ts` |
| Secretos | `GEMINI_API_KEY` y `APP_URL` por secretos de entorno (`.env.example`). **Nunca** en código ni Firestore |

### Stack (según `package.json` canónico)

React 19 · TypeScript 5.8 · Vite 6 (build SPA) · esbuild (bundle del server) ·
Tailwind 4 · Express 4 (API) · Firebase SDK 12 (Auth/Firestore/Storage) ·
jsPDF (PDFs) · qrcode · vitest 5 (tests) · Node 22 en sandbox.

### Arquitectura (capas)

```
UI React (src/components: sections / modals / panels / portales públicos)
   │  RBAC de navegación + scoping por propietarioId (App.tsx)
   ▼
Motores PUROS (src/utils/*Engine.ts, src/notificaciones/, src/utils/conciliacion/, …)
   │  Deterministas, sin I/O, testeables
   ▼
Capa de datos (src/lib/firebase.ts — 3.072 líneas, CRUD+subscripciones con scope)
   │  + src/lib/authService.ts (roles, permisos, audit)
   ▼
Firebase (Firestore ~45 colecciones / Storage) + server.ts (Express: 16 endpoints IA/API)
```

### Sistema de pruebas y build

| Comando | Nota |
|---|---|
| `npx vitest run` | **330/330 tests en 16 ficheros** (estado verificado 2026-09-20). `package.json` canónico **no define script `test`** — este es el comando oficial |
| `npx tsc --noEmit` | 0 errores (verificado 2026-09-20) |
| `npm run build` | OK (~11 s; warning conocido de chunk >500 kB, documentado y no bloqueante) |
| `npm run dev` | `tsx server.ts` (dev local, puerto 3000) |

Distribución actual de tests:

| Fichero | Tests | Bloque |
|---|---|---|
| `src/utils/contratoCicloGAP2.test.ts` | 44 | GAP2 |
| `tests/facturaElectronicaB2B.test.ts` | 40 | GAP8 |
| `src/utils/publicacionGAP5.test.ts` | 35 | GAP5 |
| `tests/financiacion.test.ts` | 29 | GAP4 |
| `tests/facturacion.test.ts` | 28 | GAP7 |
| `src/utils/habitacionesCircuitoComercial.test.ts` | 28 | Habitaciones |
| `tests/notificaciones.test.ts` | 20 | GAP1 |
| `src/utils/habitacionesEconomia.test.ts` | 24 | Habitaciones |
| `src/utils/habitacionesIsolation.test.ts` | 20 | Habitaciones |
| `tests/conciliacion.test.ts` | 23 | GAP6 |
| `src/utils/inventarioIsolation.test.ts` | 12 | Inventario (ya suite vitest real) |
| `src/utils/incidenciaCircuitoOperativoEconomico.test.ts` | 9 | Circuito operativo |
| `tests/notificaciones-plantillas.test.ts` | 6 | GAP1 |
| `tests/facturacionReporte.test.ts` | 6 | GAP7 |
| `tests/facturacion-notificaciones.test.ts` | 5 | GAP7 |
| `tests/informesEngine.test.ts` | 1 | GAP3 |
| **Total** | **330** | |

Vocabulario de estados usado en este documento: `COMPLETO` · `FUNCIONAL_CON_MEJORAS` ·
`PENDIENTE` · `NO_IMPLEMENTADO` · `DEPENDENCIA_EXTERNA`.

---

## 2. BLOQUES EXISTENTES (estado real del código)

### 2.1 Resumen por subsistema

| # | Subsistema | Finalidad | Principales archivos/motores | Estado | Tests | Dependencias / limitaciones clave |
|---|---|---|---|---|---|---|
| 1 | Auth + roles | Firebase Auth, RBAC ADMIN/PROPIETARIO/PROFESIONAL, auditoría | `src/lib/authService.ts`, `LoginView.tsx`, `AdminControlCenter`, `usuarios`/`usuarios_auth`/`audit_logs` | `FUNCIONAL_CON_MEJORAS` | indirectos | Residual: sin custom claims → `storage.rules` usa `internalUser()` (aislamiento fino por propietario pendiente de claims). No existe rol INQUILINO (solo como concepto) |
| 2 | Inmuebles + Habitaciones | Ficha inmueble (datos fiscales incluidos), modo alquiler por habitaciones: unidades, reserva/selección atómicas (transacciones), contratos y cobros por unidad, aislamiento de impagos | `habitacionesEngine.ts`, `HabitacionesInmueblePanel.tsx`, `InmueblesSection.tsx` | `COMPLETO` | 72 (28+24+20) | Reglas `habitaciones_inmueble` con invarianza de `inmuebleId` |
| 3 | Captación pública + Candidatos | Funnel: solicitud/visita/documentación/cuestionario por token, agenda de visitas, solvencia, comparador | `Portal*PublicaView`, `SolicitudesSection`, `solvenciaEngine.ts`, `cuestionarioPreguntas.ts` | `FUNCIONAL_CON_MEJORAS` | indirectos | Residual P2: `documentsStore` (Map en memoria) en `server.ts` — documentos efímeros en frío; `solicitudes_documentacion` con lectura por token anónima (documentado) |
| 4 | Contratos LAU + Ciclo contractual | Borrador/formalización LAU, acta de llaves, modalidades (GAP2), anexos, rescisión, finiquito, prórrogas | `contratoEngine.ts`, `contratoCicloEngine.ts`, `FormalizacionSection.tsx`, `CicloContractualPanel.tsx` | `COMPLETO` | 44 (GAP2) | Finiquito NUNCA modifica `registroCobros` (tests 4.7/5.7). Terminal irreversible (motor + reglas) |
| 5 | Cobros | Calendario de cobros materializado en contrato, justificación/verificación, justificantes Storage, retrasos/incidencias automáticas, avisos | `cobrosEngine.ts` (27 kB), `CobrosSection.tsx`, Storage `cobros_justificantes/` | `FUNCIONAL_CON_MEJORAS` | indirectos (base de GAP6 y B) | Es la interfaz económica central: `generarPeriodosParaContrato`, `calcularResumenCobros`, `registrarPagoPeriodo` (única escritura que usa GAP6) |
| 6 | Gastos / Préstamos / Rentabilidad | Gastos explotación vs financiación, recurrentes, facturas Storage, préstamos con amortización, rentabilidad por inmueble/global + CSV | `gastosEngine.ts`, `prestamosEngine.ts`, `rentabilidadEngine.ts`, `GastosSection.tsx` | `FUNCIONAL_CON_MEJORAS` | indirectos | `prestamos` (Fase 2.3) coexiste con `financiaciones` (GAP4): no mezclar sin migrar ambos |
| 7 | Financiación hipotecaria (GAP4) | Cuadro de amortización (francés/lineal), tipo fijo/variable/mixto, carencia, anticipos, LTV | `financiacionEngine.ts`, `types/financiacion.ts`, `FinanciacionSection.tsx`, colección `financiaciones` | `COMPLETO` (motor) | 29 | Motor determinista sin I/O; integración en cash-flow de cartera pendiente. Carencia total con capitalización = elección documentada, no estándar universal |
| 8 | Incidencias / Mantenimiento / Profesionales | Incidencias (categorías, prioridades, responsabilidad LAU, adjuntos, IA pericial), mantenimiento preventivo y garantías, trabajos/presupuestos/valoraciones de profesionales | `incidenciasEngine.ts`, `mantenimientoEngine.ts`, `profesionalesEngine.ts`, `segurosEngine.ts`, `src/components/mantenimiento/`, `ProfesionalesSection.tsx` | `FUNCIONAL_CON_MEJORAS` | 9 (circuito operativo económico) | Integración AI Studio sobre base A con reglas endurecidas; `garantias_reparacion`, `tareas_mantenimiento` propias |
| 9 | Pólizas y Siniestros | Pólizas multirramo, vencimientos, siniestros con comunicaciones e indemnización; flujo Gmail con aseguradoras (OAuth) | `segurosEngine.ts`, `PolizasSegurosSection.tsx`, `gmailClient.ts`, `googleAuth.ts`, `system/gmail_config` | `FUNCIONAL_CON_MEJORAS` | indirectos | Gmail es la única integración transaccional real E2E de la base |
| 10 | Inventario + Ficha técnica | Inventario físico por inmueble, baja lógica, adjuntos, histórico append-only | `inventarioEngine.ts`, `FichaTecnicaInventarioPanel.tsx`, `inventario_inmuebles`/`inventario_historial` | `FUNCIONAL_CON_MEJORAS` | 12 | Portado de Arena D con reglas reforzadas en A (FASE integrada) |
| 11 | Recomercialización | Salida de inquilino, inspección por estancias + IA, reformas/ROI, pricing (catastro/OVC), estrategia/comercialización, kit de publicación, cierre que libera el inmueble | `recomercializacionEngine.ts`, `reformasEngine.ts`, `pricingRecomerc.ts`, `kitPublicacionIa.ts`, `RecomercializacionSection.tsx`, docs `arquitectura/FASE_3.*` | `FUNCIONAL_CON_MEJORAS` | indirectos | Documentado en `docs/arquitectura/` (14 ficheros) — enlazar, no duplicar |
| 12 | Notificaciones transaccionales (GAP1) | Dispatcher de eventos de negocio: plantilla, canal, momento, reintentos, auditoría, idempotencia | `src/notificaciones/*` (6 módulos), `types/notificaciones.ts`, reglas §22 `notificaciones`, endpoint `/api/notificaciones/enviar` | Motor `COMPLETO`; transporte `DEPENDENCIA_EXTERNA` | 26 | Sin implementación Firestore del `RepositorioNotificaciones` (interface); EMAIL en safe-mode (sin proveedor real); WHATSAPP preparado-no implementado; sin bandeja UI |
| 13 | Contratos especiales (GAP2) | Modalidades (temporada/local/habitación), anexos versionados inmutables, finalización/rescisión irreversible, finiquito, derivados/prórrogas, eventos de ciclo | `contratoCicloEngine.ts`, `CicloContractualPanel.tsx`, `types.ts` (bloque GAP2) | `COMPLETO` | 44 | Eventos de ciclo emitidos hacia GAP1 (dispatcher aún sin transporte real); sin UI de creación directa desde cero (flujo real: sobre borrador LAU) |
| 14 | Reporting (GAP3) | Capa de agregación/lectura sobre cobros/fiscal/gastos; PDF (jsPDF); informes de inversor/rentabilidad | `reportingEngine.ts` (1.116 l.), `pdfExportEngine.ts`, `InformesSection.tsx` | `COMPLETO` | 1 (cobertura fina; ver límite) | Capa de SOLO LECTURA: no escribe en cobros/gastos. Sin gráficos (tarjetas HTML) |
| 15 | Sindicación (GAP5) | Publicación multicanal de inmuebles/habitaciones: modelo normalizado → validador → adaptadores (XML/JSON/portales), trazabilidad | `publicacionEngine.ts`, `publicacionXml.ts`, `publicacionJson.ts`, `publicacionPortales.ts`, `PublicacionInmueblesPanel.tsx` | `COMPLETO` (generación) | 35 | Publicación REAL a portales = `PENDIENTE` (sin credenciales; se generan feed/export, no se envían) |
| 16 | Conciliación bancaria (GAP6) | Importación MT940/OFX/Norma43/CSV, matching con cobros/gastos, propuestas→confirmación→aplicación, idempotencia | `src/utils/conciliacion/*` (9 módulos), `ConciliacionBancariaSection.tsx`, colecciones `movimientos_bancarios`/`conciliaciones_bancarias`/`importaciones_bancarias` | `COMPLETO` | 23 | Flujo Detecta→Propone→Valida→Aplica; la única escritura sobre operaciones es `registrarPagoPeriodo` (cobrosEngine). Sin feed bancario real (import manual) |
| 17 | Facturación / RRSIF / VERI*FACTU (GAP7) | Series/numeración, líneas/IVA/retenciones, registro de facturación con hash SHA-256 encadenado (spec AEAT v0.1.2), reporte RRSIF, máquina VERI*FACTU con transporte desacoplado | `facturacionEngine.ts`, `facturacionReporte.ts`, `verifactuTransport.ts`, `sha256.ts`, `FacturacionSection.tsx`, colecciones `facturas`/`registros_facturacion`/`envios_verifactu`/`series_facturacion` | Motor `COMPLETO`; remisión `DEPENDENCIA_EXTERNA` | 39 | NO hay remisión real a AEAT/SII (sin endpoints inventados, sin certificados en código); RRSIF se genera, no se transmite |
| 18 | Factura electrónica B2B (GAP8) | **INTEGRADO EN ARENA A** — integración commit `91da820`. Modelo B2B separado, validador bloqueante, CII/UBL 2.1/Facturae 3.2.2, máquina de estados, idempotencia, reglas deny-by-default, panel UI | `types/facturaElectronicaB2B.ts`, `facturaElectronicaB2BEngine.ts`, `facturaElectronicaB2BService.ts`, `generadores/*` (3), `intercambioB2B/adaptadoresB2B.ts`, `notificacionesB2B.ts`, `FacturaElectronicaB2BPanel.tsx`, colección `facturas_electronicas_b2b` | Generación `COMPLETO`; envío real `DEPENDENCIA_EXTERNA` | 40 | Ver §3 (GAP8). EDIFACT `PENDIENTE-ESPECIFICACIÓN`; SPFE/plataforma privada `PENDIENTE`; B2G/FACe fuera de alcance |
| 19 | Backend IA (Express) | 16 endpoints: análisis de documentos/cuestionario/incidencia/inspección, correo aseguradora, cláusula, pricing, kit publicación, catastro, notificaciones, upload | `server.ts` (2.605 l.), `api/index.ts`, `vercel.json` | `FUNCIONAL_CON_MEJORAS` | — | Residual P2: `documentsStore` en memoria (ver #3). Sin rate-limit (documentado en diagnóstico) |
| 20 | Seguridad perimetral | Reglas Firestore por colección (aislamiento por `propietarioId`, deny-by-default catch-all), reglas Storage por ruta, RBAC en cliente | `firestore.rules` (1.218 l., ~44 bloques), `storage.rules` (161 l.), `firebase.json` | `FUNCIONAL_CON_MEJORAS` | — | Residuales documentados en `FASE_1.4_SEGURIDAD_PERMISOS.md` §5 (ficha pública con datos fiscales; Storage sin claims) |

### 2.2 Colecciones Firestore (estado canónico)

`usuarios`, `usuarios_auth`, `audit_logs`, `enlaces_registro`, `especialidades`,
`propietarios`, `inmuebles`, `habitaciones_inmueble`, `candidatos`, `solicitudes`,
`solicitudes_documentacion`, `invitaciones`, `slots_visita`, `configuracion_aseguradoras`,
`solicitudes_seguro_impago`, `contratos_formalizacion`, `gastos`, `gastos_recurrentes`,
`prestamos`, `financiaciones`, `expedientes_recomercializacion`, `inmobiliarias_directorio`,
`propuestas_inmobiliaria`, `leads_inmobiliario`, `incidencias`, `tareas_mantenimiento`,
`garantias_reparacion`, `trabajos_profesionales`, `presupuestos_profesionales`,
`valoraciones_profesionales`, `necesidades_reforma`, `proyectos_reforma`,
`inventario_inmuebles`, `inventario_historial`, `polizas_seguros`, `siniestros`,
`profesionales`, `system` (incl. `gmail_config`), `notificaciones`,
`movimientos_bancarios`, `conciliaciones_bancarias`, `importaciones_bancarias`,
`facturas`, `registros_facturacion`, `envios_verifactu`, `series_facturacion`,
`facturas_electronicas_b2b`.

Storage (rutas con reglas): `cobros_justificantes/`, `gastos_facturas/`,
`documentos_solicitados/`, `inmuebles/`, `incidencias/`, `profesionales/`,
`presupuestos/`, `trabajos/`, `inventario/` y afines (ver `storage.rules`).

---

## 3. GAP 1–8 (estado consolidado)

Los ocho GAP del ERP están **consolidados en la rama canónica** (commits
`b1d45aa` → `91da820`). Informe de integración por GAP: ver `docs/informe-GAP2-*`
y `docs/informe-GAP8-*` (enlazados, no duplicados).

### GAP1 — Notificaciones transaccionales
- **Qué existe:** dispatcher completo (`src/notificaciones/`: `dispatcher.ts`, `plantillas.ts`, `canales.ts`, `resolucion.ts`, `autorizacion.ts`, `adaptadores.ts`), tipos (`src/types/notificaciones.ts`), reglas Firestore §22 (aislamiento por propietario), endpoint `/api/notificaciones/enviar`, plantillas de negocio (incl. bloques `facturacion.*` y `facturacion.b2b_*` añadidos por GAP7/8).
- **Probado:** 26 tests (`notificaciones.test.ts` 20 + `notificaciones-plantillas.test.ts` 6): resolución, plantillas, idempotencia, reintentos, autorización, canales mock.
- **Limitaciones reales:** (a) el `RepositorioNotificaciones` es una **interface sin implementación Firestore** en `src/lib/firebase.ts` — la bandeja INAPP no se persiste aún; (b) canal EMAIL en **safe-mode** (sin proveedor SMTP/Resend/SendGrid real); (c) canal WHATSAPP preparado pero sin implementar (requiere API externa); (d) no hay bandeja UI que consume el dispatcher (lo consumen hoy las fábricas de eventos de GAP2/7/8).
- **Dependencias externas:** proveedor de email + secretos en backend (NUNCA en Firestore); WhatsApp Business API.
- **NO modificar accidentalmente:** el registro de plantillas (`plantillas.ts`) — GAP7/8 añaden plantillas aditivas; la idempotencia por `idempotencyKey` e IDs deterministas (los eventos de GAP2/7/8 dependen de ella); no crear un segundo dispatcher.

### GAP2 — Contratos especiales, anexos, rescisión y finiquito
- **Qué existe:** `contratoCicloEngine.ts` (motor puro ~640 l.) + `CicloContractualPanel.tsx` montado en `FormalizacionSection.tsx` + bloque de tipos GAP2 (`ModalidadContractual`: VIVIENDA_HABITUAL/TEMPORADA/LOCAL_USO_DISTINTO/HABITACION; anexos versionados; `FinalizacionContrato`; `FiniquitoContrato` con conceptos a favor de propietario/inquilino; `EventoContrato`).
- **Probado:** 44/44 (`contratoCicloGAP2.test.ts`): modalidades, histórico/derivados, anexos, finalización, finiquito, habitaciones, eventos. Regresión habitaciones 72/72.
- **Limitaciones reales:** sin UI de creación directa de contrato especial desde cero (la modalidad se aplica sobre el borrador LAU existente, que es el flujo real); el resumen fiscal no diferencia por modalidad (el dato `modalidadContractual` ya está disponible para hacerlo); los eventos de ciclo quedan preparados para el dispatcher de GAP1 (sin transporte real aún).
- **Dependencias externas:** GAP1 para envío real de eventos; proveedor de firma electrónica (excluido por decisión de la orden; `referenciaDocumental` de anexos es el punto de enganche).
- **NO modificar accidentalmente:** el finiquito **nunca** modifica `registroCobros` (tests 4.7/5.7 lo garantizan); la irreversibilidad de estados terminales (motor + reglas); la inmutabilidad de anexos `CONFIRMADO` (versionado, no edición); el bloque de reglas `contratos_formalizacion` (invarianza `inmuebleId`/`habitacionId`, `fechaCreacion` inmutable, salida de terminal prohibida).

### GAP3 — Reporting / informes
- **Qué existe:** `reportingEngine.ts` (1.116 l., capa de agregación/lectura sobre `cobrosEngine`/`fiscalEngine`/`gastosEngine`), `pdfExportEngine.ts` (jsPDF), `InformesSection.tsx`.
- **Probado:** 1 test vitest (`informesEngine.test.ts`) — **cobertura fina**; la calidad se apoya en que es capa de solo-lectura sobre motores ya probados. Aumentar cobertura es una mejora legítima (sin tocar los motores que consume).
- **Limitaciones reales:** sin gráficos (tarjetas HTML); informes generados en memoria desde datos suscritos; sin persistencia propia de informes.
- **Dependencias externas:** ninguna (motor puro).
- **NO modificar accidentalmente:** su naturaleza de **solo lectura** (no debe escribir en cobros/gastos/fiscal); no duplicar cálculos que ya viven en `cobrosEngine`/`fiscalEngine`/`gastosEngine`.

### GAP4 — Financiación hipotecaria
- **Qué existe:** `financiacionEngine.ts` (motor determinista: amortización francesa/lineal, tipo fijo/variable/mixto con transición, carencia ninguna/solo-intereses/total, amortización anticipada reducir-cuota/reducir-plazo, LTV; fórmulas anglosajonas explícitas documentadas en cabecera), `types/financiacion.ts`, `FinanciacionSection.tsx`, colección `financiaciones` + reglas §23 (con `sinSecretos()`).
- **Probado:** 29/29 (`financiacion.test.ts`).
- **Limitaciones reales:** motor de cálculo (sin I/O); el pliegue en el cash-flow de cartera/rentabilidad está preparado a nivel de datos pero no es un circuito cerrado de UI; la capitalización de intereses en carencia total es una **elección documentada del modelo**, no un estándar universal.
- **Dependencias externas:** ninguna.
- **NO modificar accidentalmente:** las fórmulas documentadas en cabecera (cambiarlas cambia el resultado económico de todos los casos de test); la coexistencia con `prestamos` (Fase 2.3) — si se migra, migrar ambos a la vez.

### GAP5 — Sindicación / publicación multicanal
- **Qué existe:** `publicacionEngine.ts` (modelo normalizado `PublicacionInmueble`, validador, trazabilidad) + adaptadores `publicacionXml.ts`/`publicacionJson.ts`/`publicacionPortales.ts` + `PublicacionInmueblesPanel.tsx` (integrado en `InmueblesSection.tsx`) + tipos de sindicación.
- **Probado:** 35/35 (`publicacionGAP5.test.ts`).
- **Limitaciones reales:** la **publicación real a portales está pendiente** (sin credenciales ni APIs externas; se generan feed/export y estados de sindicación locales); los adaptadores que requieren acceso externo lo declaran explícitamente.
- **Dependencias externas:** credenciales de portales (siempre fuera del cliente/Firestore).
- **NO modificar accidentalmente:** la lectura del circuito de habitaciones (publica **leído**, nunca modifica contratos/disponibilidad); la idempotencia por `inmuebleId + portal`; que el modelo interno no dependa de ningún portal concreto.

### GAP6 — Conciliación bancaria
- **Qué existe:** `src/utils/conciliacion/` — parsers `mt940Parser`/`ofxParser`/`norma43Parser`/`csvParser`, `normalizador`, `matchingEngine` (config de tolerancias), `importEngine` (idempotencia de importaciones), `conciliacionEngine` (Detecta→Propuesta→Validada→Aplicada con histórico append-only), `idempotencia.ts`; UI `ConciliacionBancariaSection.tsx`; colecciones `movimientos_bancarios`/`conciliaciones_bancarias`/`importaciones_bancarias` + reglas.
- **Probado:** 23/23 (`conciliacion.test.ts`): parsers, matching, aplicación, idempotencia, trazabilidad.
- **Limitaciones reales:** sin feed bancario en tiempo real (importación manual de archivos); la aplicación de una conciliación sobre un cobro pasa **exclusivamente** por `registrarPagoPeriodo` de `cobrosEngine` (única vía de escritura sobre la operación contable, nunca silenciosa).
- **Dependencias externas:** archivos bancarios (hoy) / futura API bancaria.
- **NO modificar accidentalmente:** la regla «no modificar silenciosamente contabilidad operativa» (todo cambio produce propuesta + evento de histórico); `registrarPagoPeriodo` como única interfaz de escritura a cobros; la idempotencia de importaciones (re-importar no duplica).

### GAP7 — Facturación / RRSIF / VERI*FACTU
- **Qué existe:** `facturacionEngine.ts` (motor puro: series, numeración correlativa con control de duplicados/saltos, líneas, base/IVA/retención/total, **registro de facturación con huella SHA-256 encadenada** según spec AEAT v0.1.2, verificación independiente de cadena), `facturacionReporte.ts` (reporte RRSIF), `verifactuTransport.ts` (transporte **desacoplado**: cola PENDIENTE→PREPARADO→ENVIANDO→ACEPTADO/ACEPTADO_CON_ERRORES/RECHAZADO/ERROR, reintentos idempotentes), `sha256.ts`, `types/facturacion.ts`, `FacturacionSection.tsx`, colecciones `facturas`/`registros_facturacion`/`envios_verifactu`/`series_facturacion` + reglas.
- **Probado:** 39 tests (`facturacion.test.ts` 28 + `facturacionReporte.test.ts` 6 + `facturacion-notificaciones.test.ts` 5): numeración, huella encadenada, verificación, reporte, notificaciones.
- **Limitaciones reales:** **no hay remisión real a AEAT** ni transmisión RRSIF al SII (el transporte declara explícitamente que NO hay endpoints inventados ni certificados en código); la conexión real exige certificado TLS de representante + WSDL/URL oficiales + credenciales fuera del cliente.
- **Dependencias externas:** AEAT (VERI*FACTU/SII) — certificado y credenciales del usuario, nunca en el repo.
- **NO modificar accidentalmente:** la cadena de huellas (un registro regenerado rompería la cadena; la verificación independiente la detecta); la separación GENERACIÓN (motor puro) / TRANSPORTE (verifactuTransport); que GAP8 **copia** los importes de la factura GAP7 validada (si GAP7 cambia formatos de importe, GAP8 se rompe — tests lo cubren).

### GAP8 — Factura electrónica obligatoria B2B (RD 238/2026)
> **ESTADO: INTEGRADO EN ARENA A — commit de integración: `91da820`.**
> Informe completo: `docs/informe-GAP8-factura-electronica-b2b.md` (enlazar, no duplicar).
- **Qué existe:** modelo separado `types/facturaElectronicaB2B.ts` (importes **copiados** de la factura GAP7 validada, nunca recalculados; ID determinista `feb_sha256(facturaId|formato|version)`), motor + servicio + XML, generadores **CII / UBL 2.1 / Facturae 3.2.2** (`src/utils/generadores/`), validador bloqueante/advertencia, máquina de estados B2B independiente de VERI*FACTU (`TRANSICIONES_B2B`, `modificacionSilenciosaProhibida`), adaptadores de intercambio (`intercambioB2B/adaptadoresB2B.ts`: PREPARACIÓN real en simulado explícito; SPFE y plataforma privada = PENDIENTE, **nunca falso envío**), 8 plantillas en el registro GAP1, panel UI en el detalle de factura, colección `facturas_electronicas_b2b` con reglas deny-by-default.
- **Probado:** 40/40 (`facturaElectronicaB2B.test.ts`); regresión global **330/330** en `91da820`.
- **Limitaciones reales:** ENVÍO REAL = `PENDIENTE` (SPFE AEAT/FACeB2B: pendiente normativo/técnico; plataforma privada: pendiente de servicio; EDIFACT: pendiente de especificación oficial); calendario de obligatoriedad pendiente de orden ministerial (no codificado); B2G/FACe fuera de alcance (Facturae existe solo como sintaxis B2B).
- **Dependencias externas:** SPFE o plataforma privada certificada; certificados/credenciales fuera del cliente.
- **NO modificar accidentalmente:** la identidad determinista y el `idempotencyKey` (el replay no duplica); que los importes se copien de GAP7 (nunca se recalculen); la separación total de la máquina VERI*FACTU; el bloque de reglas `facturas_electronicas_b2b` (inmutables y historial append-only).

---

## 4. GRANDES BLOQUES PENDIENTES

> **Regla de oro de esta sección:** no se inventan reglas fiscales, bancarias ni
> jurídicas. Toda cuestión normativa se **verifica documentalmente antes de
> implementarse**. Nada de lo siguiente está implementado en esta orden.
>
> Navegación: BLOQUE B/C/D aquí (§4) · **BLOQUE E** (§5) · **Capa Transversal
> Experiencia/Ayuda/Tutoriales/IA** (§6, sin numeración GAP) · **Roadmap de
> evolución** (§7) · dependencias entre bloques (§8).

### BLOQUE B — Tesorería + liquidaciones de propietarios + SEPA

Objetivo: cerrar el ciclo económico **inmueble → propietario** (hoy el ERP
conoce los cobros y gastos, pero no liquida ni paga al propietario).

Ámbito a documentar/planificar (no implementar ahora):
- Liquidación mensual por propietario (agregado de cobros por contrato/habitación).
- Cálculo económico de la liquidación: honorarios/gestión, IVA cuando corresponda,
  retenciones cuando corresponda (reglas a **verificar normativamente**, no asumir).
- Gastos anticipados (ya existen en `gastos` con cargo arrendador/arrendatario y deducible IRPF).
- Neto propietario; histórico de liquidaciones; justificante de liquidación (PDF).
- Portal propietario (base existente: `PropietarioPortalSection.tsx`).
- Ordenes de transferencia **PAIN.008** (emisión) y recepción/validación **PAIN.001**
  (bancaria) — hoy **NO existe** ningún generador/validador SEPA en el repo.
- Trazabilidad e idempotencia (patrones ya existentes: `idempotencia.ts` de GAP6,
  históricos append-only).
- Integración con cobros (`cobrosEngine`) y conciliación (`movimientos_bancarios`,
  `importEngine`): la liquidación paga contra lo conciliado.

**Interfaces existentes que debe respetar:** `cobrosEngine` (`generarPeriodosParaContrato`,
`calcularResumenCobros`, `registrarPagoPeriodo`), `fiscalEngine`, `gastosEngine`,
colecciones `propietarios` (IBANs múltiples) y `movimientos_bancarios`.

**Dependencias externas:** entidad/proveedor SEPA para emisión/recepción real de
transferencias; verificación normativa de honorarios/IVA/retenciones.

### BLOQUE C — Morosidad + recobro + expediente de recuperación

Objetivo: detectar deuda, comunicarla y gestionar su recobro con expediente.

Ámbito a documentar/planificar (no implementar ahora):
- Detección de deuda (base existente: `cobrosEngine` ya marca retrasos/incidencias
  de periodo — commit base "avisos y retrasos automáticos").
- Estados de la deuda (nueva máquina de estados; **NO reutilizar los estados de
  incidencia como estados de deuda**).
- Comunicaciones y recordatorios (consumir el dispatcher de **GAP1**, no crear un
  segundo; recordatorios configurables).
- Gestión de recobro y seguimiento jurídico: fechas, profesionales, actuaciones.
- Documentación/evidencias y expediente de recuperación (patrón append-only de
  `audit_logs`/históricos).
- Posible comunicación con seguro de impago (base existente: `segurosEngine`,
  `solicitudes_seguro_impago`, flujo Gmail).
- Trazabilidad completa.

**Reglas temporales:** se tratan como **configurables**, NO como plazos legales,
salvo verificación documental expresa.

### BLOQUE D — Entrada/salida + actas + evidencias + firma digital

Objetivo: profesionalizar el check-in/check-out del inmueble con evidencia
auditable.

Ámbito a documentar/planificar (no implementar ahora):
- Check-in / check-out (base existente: acta de entrega de llaves en
  `contratoEngine`, con lecturas de suministros).
- Inventario en entrada/salida (base existente: `inventarioEngine` + histórico
  append-only) y **comparación** entrada vs salida.
- Fotografías (Storage; patrones de `GestionImagenesModal`/inspección) y lecturas
  de contadores.
- Incidencias detectadas (puente con `incidenciasEngine`).
- Acta final + **PDF** (base: `pdfExportEngine`/jsPDF) + **firma** (OTP; integración
  futura con **proveedor de firma electrónica externo** — hoy no existe; el punto de
  enganche de GAP2 es `referenciaDocumental`).
- Trazabilidad.

**Reglas de datos:** no almacenar datos sensibles innecesarios (DLP: minimizar;
los DNI/adjuntos del funnel público ya son un residual documentado — no ampliarlo).

---

## 5. BLOQUE E — PORTAL DEL INQUILINO + SUMINISTROS

> **GRAN CAPACIDAD PENDIENTE. PLANIFICADO ≠ IMPLEMENTADO.**
> No existe hoy portal de inquilino ni rol INQUILINO en auth (`INQUILINO` solo
> aparece como concepto en finiquito/incidencias). Todo lo descrito aquí son
> **decisiones de producto aprobadas (2026-09-20)**, sujetas a posterior
> implementación y validación en una orden futura. Nada de este bloque se
> implementa en la orden de 2026-09-20.

### 5.1 Naturaleza conceptual

Acceso **independiente y simplificado para el arrendatario**, centrado en su
vivienda y en sus obligaciones/derechos. El inquilino **NO accede al ERP
interno** ni a datos de otros actores: portal de superficie mínima que se
construye **sobre** la realidad económica, contractual y de incidencias que ya
existe en el ERP (se **lee y muestra**, nunca se duplica ni se recalcula).

### 5.2 Dependencias principales

| De | Qué aporta al Portal del Inquilino |
|---|---|
| **B — Tesorería / liquidaciones / SEPA** | Pagos, recibos e información económica del inquilino |
| **C — Morosidad / recobro** | Estados de deuda y comunicaciones hacia el inquilino |
| **D — Entrada/salida / actas / firma** | Check-in/out, actas, inventario, fotografías, firma de documentos |

### 5.3 Funcionalidades previstas (sujetas a implementación y validación)

- **Acceso autenticado del inquilino** (nuevo rol en RBAC + reglas Firestore
  propias, patrón de aislamiento de las colecciones existentes).
- **Vivienda y contrato**; **contrato y anexos** (lectura sobre
  `contratos_formalizacion`, incluidos anexos versionados GAP2).
- **Recibos** y **pagos** (fuente única: `cobrosEngine`/`registroCobros` —
  nunca duplicar la realidad económica).
- **Documentos** del expediente del inquilino.
- **Incidencias** (declaración y seguimiento; base: patrón existente de
  incidencias declaradas por inquilino en cuestionario).
- **Fotografías** (Storage; patrones existentes de inspección/
  `GestionImagenesModal`).
- **Comunicaciones** (consumir el dispatcher de **GAP1** — no crear segundo
  canal).
- **Seguimiento de actuaciones de profesionales** (lectura de
  `trabajos_profesionales`/incidencias asignadas a su vivienda).
- **Suministros** (ver §5.4).
- **Entrada/salida** (interfaz del inquilino sobre el flujo de BLOQUE D).
- **Firma de documentos cuando exista el sistema correspondiente** (enganche
  existente: `referenciaDocumental` de anexos GAP2 + proveedor de firma
  electrónica pendiente como `DEPENDENCIA_EXTERNA`).
- **Notificaciones** (canales INAPP/EMAIL de GAP1 dirigidos al inquilino).
- **Historial de actividad** (append-only, patrón de `audit_logs`/históricos).

### 5.4 Suministros (dentro de BLOQUE E)

Gestión futura de:
- **CUPS**; **contador/lecturas**; **titularidad**;
- **comercializadora/distribuidora**; **tarifa**; **potencia**;
- **cambios de titular**;
- **posibles repartos cuando proceda en alquiler por habitaciones** (base:
  modo `habitaciones` del inmueble + `habitacionesEngine`).

**Requisito previo de una orden futura:** decisión de arquitectura (nuevo rol
RBAC + reglas + portal) y verificación de requisitos de los datos de suministro
(ninguna regla regulatoria se asume: se verifica documentalmente antes de
implementar).

---

## 6. CAPA TRANSVERSAL — EXPERIENCIA, AYUDA, TUTORIALES E IA ASISTENTE

> **Decisión de producto (2026-09-20). Fuera de la numeración GAP** —
> explícitamente **NO** es un GAP9/10/11 ni equivalente. Se gestiona dentro de
> la estructura de este mapa. Estado global: **PREVISTA/FUTURA** (nada
> implementado; hoy no existe Ayuda integrada ni asistente de IA en la app).
>
> **Finalidad:** que la complejidad interna del ERP **no obligue al usuario a
> conocer su arquitectura**. El usuario describe su necesidad en lenguaje
> natural y la capa lo orienta sobre los procesos reales de la aplicación.

### 6.1 Centro de Ayuda y Tutoriales (capacidad futura)

No se plantea como manual externo, sino como **Centro de Ayuda integrado
dentro de la propia aplicación**:

- botón de **Ayuda** global; **ayuda contextual** por pantalla;
- explicación de cada pantalla y sección; bloque «**Cómo funciona**» por
  proceso;
- **tutoriales paso a paso** y **recorridos guiados** (onboarding y
  reactivación);
- **progreso del usuario** por pantalla/tutorial; posibilidad de **saltar y
  reanudar** tutoriales.

**Ayuda por tipo de usuario** (contenidos específicos a prever):
propietario · administrador · profesional/gremio · **inquilino** · usuarios
financieros · usuarios de cobros · usuarios de contratos · usuarios de
incidencias · usuarios de informes/fiscalidad.

Los **contenidos concretos** se desarrollarán **cuando las funcionalidades
estén estabilizadas** (no se redacta ayuda sobre bloques aún en desarrollo:
B/C/D/E).

### 6.2 IA Asistente del ERP (decisión de producto)

No se plantea un chatbot genérico: se plantea una **IA asistente integrada con
el ERP**, capaz de comprender el lenguaje natural del usuario y **orientarlo
sobre los procesos reales de la aplicación**. Ejemplos conceptuales del
comportamiento esperado:

**Problema de uso** — Usuario: *«No me aparece el recibo de este mes del piso
de Alicante.»* → La IA debería: (1) comprender la pregunta; (2) identificar el
inmueble; (3) identificar el contrato; (4) localizar el periodo; (5) comprobar
el flujo correspondiente (cobros → justificación → estado del periodo);
(6) detectar dónde puede estar el problema; (7) explicarlo de forma
comprensible; (8) llevar al usuario al módulo/pantalla correspondiente;
(9) indicar qué acción puede realizar.

**Petición funcional** — Usuario: *«Tengo una avería y no sé qué tengo que
hacer.»* → La IA debería guiar por el flujo real existente:
Incidencia → inmueble → descripción → fotografías → prioridad → profesional →
actuación → presupuesto → reparación → factura → gasto → rentabilidad.

En ambos casos **el usuario NO necesita conocer la arquitectura interna**: la
capa la traduce a pasos y a la navegación adecuada.

### 6.3 Requisitos arquitectónicos para la futura IA (vigen para B/C/D/E y módulos existentes)

Los futuros bloques **B/C/D/E** (y los existentes) deberán construirse de
manera que después sean **interpretables** por esta capa. En particular,
preservar de forma explícita y legible:

- **estados** y **transiciones** (máquinas de estados nombradas, no flags
  sueltos);
- **relaciones entre entidades** (contrato ↔ cobro ↔ factura ↔ movimiento);
- **permisos** (qué puede ver/hacer cada perfil en cada estado);
- **eventos** (emisión por el dispatcher de GAP1 u equivalente);
- **identificadores** (IDs estables y legibles);
- **trazabilidad** e **historial** (append-only);
- **errores** (causas explícitas, no silenciosas);
- **acciones disponibles** (en cada pantalla/estado, qué puede hacer el
  usuario y qué queda deshabilitado);
- **dependencias entre módulos** (ver §8).

**Límites ineludibles de la IA** (requisito permanente): opera **siempre
dentro de los permisos del usuario**. Queda prohibido cualquier diseño que
permita que la IA:

1. acceda a información no autorizada;
2. invente estados;
3. invente acciones realizadas;
4. marque procesos como completados sin confirmación real;
5. modifique información sensible sin autorización;
6. sustituya los controles de seguridad del ERP.

### 6.4 Filosofía — IA como capa de guiado, NO como sustituto del ERP

El ERP **sigue teniendo sus motores, reglas y controles deterministas**. La IA
actúa como: intérprete del lenguaje natural · asistente · diagnóstico
orientativo · guía de navegación · explicador · **interfaz conversacional
sobre las funciones reales del ERP**.

La IA **NO** debe convertirse en una segunda lógica empresarial paralela que
contradiga a los motores oficiales. Cuando una operación requiere una regla de
negocio, **se apoya en el motor correspondiente del ERP** (p. ej. cálculos
económicos → `cobrosEngine`/`facturacionEngine`; estados → las máquinas de
estado existentes; permisos → `authService` + reglas).

---

## 7. EVOLUCIÓN DEL ERP — ROADMAP (capacidades, no «órdenes pequeñas»)

Estas fases son **capacidades funcionales de distinto tamaño** — no se
presentan como cinco órdenes pequeñas:

| Fase | Capacidad | Tamaño / nota |
|---|---|---|
| **B** | Tesorería + liquidaciones de propietarios + SEPA (PAIN.008/001) | Bloque grande |
| **C** | Morosidad + recobro + expediente de recuperación | Bloque grande |
| **D** | Entrada/salida + actas + evidencias + firma digital | Bloque grande |
| **E** | **Portal del Inquilino + suministros** (depende de B, C, D — §5) | Bloque grande |
| **Transversal** | **Experiencia, Ayuda, Tutoriales e IA Asistente** (sin numeración GAP — §6) | Capa transversal; crece y se profundiza con cada bloque estabilizado |
| **Después** | **Integración global**: pruebas end-to-end de circuitos completos, UX, seguridad, rendimiento y endurecimiento final | Cierre de oleada |

Dependencias entre fases: §8.

---

## 8. DEPENDENCIAS ENTRE BLOQUES

Basado en el código real (imports y reglas), no en supuestos. Extiende y corrige
el esquema de trabajo de la orden:

```
AUTH (authService + RBAC + scoping propietarioId)   ← transversal a TODO
CAPA TRANSVERSAL — Ayuda/Tutoriales/IA asistente (PREVISTA, sin numeración GAP — §6)
    ← interpreta estados/eventos/acciones de TODOS los bloques (requisitos §6.3)
    │
CONTRATOS (contratoEngine + contratoCicloEngine GAP2)
    │
    ├── COBROS (cobrosEngine: calendario, justificación, resumen, registrarPagoPeriodo)
    │     │
    │     ├── CONCILIACIÓN (GAP6) — única escritura a cobros: registrarPagoPeriodo
    │     │
    │     ├── FACTURACIÓN (GAP7) — series/registros/RRSIF/VERI*FACTU (datos de renta del contrato)
    │     │     │
    │     │     └── B2B (GAP8) — copia importes de factura GAP7 validada;
    │     │                       info de pago desde cobro conciliado (GAP6)
    │     │
    │     ├── FISCAL (fiscalEngine: resumen anual por inmueble)
    │     │
    │     └── BLOQUE B — liquidación propietario (cobra lo conciliado; paga PAIN.008)
    │
    ├── REPORTING (GAP3) — SOLO LECTURA sobre cobros/fiscal/gastos (no escribir ahí)
    │
    └── BLOQUE D — check-in/check-out, actas, inventario (inventarioEngine), firma
          │
GASTOS (gastosEngine) + PRESTAMOS (prestamosEngine) + FINANCIACIÓN (GAP4)
    ├── RENTABILIDAD (rentabilidadEngine)
    └── BLOQUE B — gastos anticipados y neto propietario

HABITACIONES (habitacionesEngine, circuito cerrado 72/72)
    ├── CONTRATOS (habitacionId en borrador/finalización — GAP2 valida aislamiento)
    ├── COBROS (cobros por unidad; impagos aislados)
    └── SINDICACIÓN (GAP5) — Lee habitaciones; NUNCA modifica el circuito

NOTIFICACIONES (GAP1) — consumidor: eventos GAP2, GAP7, GAP8
    └── BLOQUE C — recordatorios/comunicaciones de recobro (reutilizar dispatcher)

INCIDENCIAS (incidenciasEngine) + MANTENIMIENTO + PROFESIONALES + SEGUROS
    └── BLOQUE C — detección de deuda, recobro, expediente, seguro impago

BLOQUE E — PORTAL DEL INQUILINO + SUMINISTROS (PLANIFICADO — §5)
    ├── BLOQUE B (pagos / recibos / liquidación)
    ├── BLOQUE C (deuda / comunicaciones al inquilino)
    └── BLOQUE D (entrada/salida, actas, firma)
    (lee contratos/cobros/incidencias/profesionales; NUNCA duplica la realidad del ERP)

DESPUÉS — INTEGRACIÓN GLOBAL (end-to-end, UX, seguridad, rendimiento,
endurecimiento final — §7)
```

**Lo que esto significa para futuras Arenas:**

| Se puede modificar de forma independiente | …siempre que se respete |
|---|---|
| UI de cualquier sección (components) | Los motores puros y sus tests (no mover lógica a componentes) |
| Motores de un GAP (p.ej. GAP4) | Sus tests de suite; las interfaces que otros GAP consumen (GAP8←GAP7; BLOQUE B←GAP6/cobros) |
| `firestore.rules` (bloques propios) | El catch-all deny-by-default; los inmutables documentados (facturas, B2B, contratos, inventario_historial) |
| `server.ts` (endpoints) | El contrato de `api/index.ts` + `vercel.json`; no guardar secretos |
| Plantillas de notificación (aditivo) | El dispatcher y el formato de registro `plantillas.ts` |
| Nuevas colecciones | Patrón de reglas con aislamiento por `propietarioId` + `sinSecretos()` donde aplique |
| Nuevos bloques (B/C/D/E) y la capa transversal | Sus interfaces de dependencia (§8) y los requisitos de interpretabilidad para la capa de Ayuda/IA (§6.3): estados/transiciones/permisos/eventos/acciones/errores legibles |

---

## 9. LÍNEAS PARALELAS Y MATERIA PRESERVADA (contexto Git)

- **`main` @ `4d420bd`** contiene una línea paralela (AI Studio): mantenimiento/
  profesionales, circuito de **candidato** (`candidateCircuitEngine.ts`,
  `CandidateCircuitTimeline.tsx`, `PortalDocumentacionPublicaContainer.tsx`,
  `CandidateModal.tsx`, `scripts/test-candidate-circuit.ts`) y seguro de impago.
  **Todo ese trabajo sigue íntegro en `main`** (y en el historial git). El merge de
  alineación (`d24ab1f` en la rama de sesión) resolvió conflictos a favor de la
  línea canónica y **no** commitó los 4 ficheros exclusivos de main. Si en el futuro
  se quiere el circuito de candidato sobre la base canónica, es una **orden de
  portada/reimplementación** (las auditorías del repo recomiendan reimplantar sobre
  A, nunca merge ciego) — no una decisión de este paquete.
- **Ramitas de recuperación** (`recovery/arena-a`, `recovery/arena-b-content`) y
  ramas de sesión anteriores (`01a0ab19`, `01a0ab97`, `01a0ab9d`, `01a0b91c`)
  conservan el trabajo histórico de cada Arena; `refs/pull/1` también.

## 10. DEUDA TÉCNICA / RESIDUALES CONOCIDOS (no corregidos en esta orden)

1. `documentsStore` = `Map` en memoria en `server.ts` (línea ~93): los documentos
   subidos se pierden con cada reinicio de la función serverless. **P2** — migrar a
   Storage como fuente única.
2. Sin **custom claims** → `storage.rules` usa `internalUser()` (maestro o cualquier
   usuario interno) con comentario de residual; el aislamiento fino por
   propietarioId en Storage queda pendiente de emitir claims.
3. `inmuebles` con `allow read: if true` (funnel público): expone la ficha completa
   (incl. campos fiscales/IBAN) en listado público. **P1** documentado en
   `FASE_1.4_SEGURIDAD_PERMISOS.md` §5 — separar ficha pública de datos fiscales.
4. `package.json` canónico sin script `test` (correr `npx vitest run`); añadirlo es
   un cambio de tooling menor pendiente de decisión.
5. Chunk de build >500 kB (warning conocido, no bloqueante).
6. Cobertura vitest fina en GAP3 (1 test) y en subsistemas base (cobros/fiscal/
   gastos no tienen suite propia; se apoyan en tests de integración de GAPs).
7. `/api/*` sin rate-limit (documentado en diagnóstico funcional).
8. Despliegue de reglas: `firestore.rules`/`storage.rules` se publican **manualmente**
   por el usuario con Firebase CLI (no desde el sandbox).

## 11. ÍNDICE DE DOCUMENTACIÓN (enlazar, no duplicar)

| Documento | Contenido |
|---|---|
| `docs/MAPA-MAESTRO-ERP-ACTUAL.md` | **Este documento** — continuidad y estado real |
| `docs/CONTINUIDAD-ARENA.md` | Manual operativo para nuevas sesiones de Arena |
| `docs/CONTRATO-INTEGRACION-ARENAS.md` | Reglas permanentes de trabajo multi-Arena |
| `docs/ESTADO-GIT-ERP.md` | Registro de estado Git (rama, HEAD, tests, build) |
| `docs/informe-GAP2-contratos-especiales.md` | Informe completo GAP2 (Arena C) |
| `docs/informe-GAP8-factura-electronica-b2b.md` | Informe completo GAP8 (Arena C) |
| `docs/informe-auditoria-C-vs-A-2026-09-19.md` | Auditoría comparativa C→A (2026-09-19) |
| `docs/informe-auditoria-D-global-2026-09-19.md` | Auditoría global D (habitaciones/inventario) (2026-09-19) |
| `docs/auditoria/DIAGNOSTICO_FUNCIONAL_2026-09-16.md` | Diagnóstico funcional original vs main vs Arena (2026-09-16) |
| `docs/arquitectura/FASE_*.md` (14) | Arquitectura por fases 1.4–3.6 (cobros, seguridad, gastos, préstamos, recomercialización) |
