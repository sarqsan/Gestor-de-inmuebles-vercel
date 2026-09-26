# MAPA MAESTRO CANÓNICO DEL ERP — GESTOR DE INMUEBLES

> **Documento principal de continuidad del proyecto.** Si el código cambia, este
> documento se actualiza en el mismo commit/orden que lo introduce.
>
> Fuente de verdad: el estado real del código, Git y la documentación canónica.
> Los documentos históricos (auditorías, informes GAP) se **enlazan**, no se duplican.
>
> Última actualización: 2026-09-23 — **cierre definitivo de GAP 5 (SINDICACIÓN)** integrado
> en la canónica A desde el snapshot preservado de C (`14dac26`): §2.1 y §3 pasan a
> `CERRADO ✅`; reglas `sindicacion_inmuebles` como **§44**; verificación real en A: 164/164
> GAP 5, 27/27 identidad, suite **1286/1286 (52 ficheros)**, 82/82 mutaciones, `tsc` 0, build
> OK. La publicación efectiva por APIs/pasarelas de terceros queda fuera del cierre (ver §12.7).
> Anterior: 2026-09-21 — **§12 RECONCILIACIÓN GLOBAL (ORDEN 15)**:
> clasificación definitiva A–F, GAPs de desarrollo real, matriz GAP→Arena y
> orden técnico. Anteriores: 2026-09-20 — 2.ª actualización: decisiones de producto
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
| `npx vitest run` | **899/899 tests en 38 ficheros** (verificado 2026-09-21 tras la integración de GAP-R3 `5e47fc2`; 835 tras ORDEN 16 + 15 R1 + 20 R2 + 29 R3). `package.json` canónico **no define script `test`** — este es el comando oficial |
| `npx tsc --noEmit` | 0 errores (re-verificado 2026-09-21 tras R1, R2 y R3) |
| `npm run build` | OK (~11 s; warning conocido de chunk >500 kB, documentado y no bloqueante) |
| `npm run dev` | `tsx server.ts` (dev local, puerto 3000) |

Distribución actual de tests:

| Fichero | Tests | Bloque |
|---|---|---|
| `src/utils/contratoCicloGAP2.test.ts` | 44 | GAP2 |
| `tests/facturaElectronicaB2B.test.ts` | 40 | GAP8 |
| `src/utils/publicacionGAP5.test.ts` | 35 | GAP5 (generación) |
| `tests/sindicacion-nucleo-fase1.test.ts` + `sindicacion-estado-persistencia` + `sindicacion-reglas-firestore` + `sindicacion-panel-conexion` | 129 (39 + 42 + 23 + 25) | GAP5 — **CERRADO** (164 con los 35 de generación) |
| `tests/fase14-espejo-identidad.test.ts` | 27 | Identidad/ownership del circuito (espejo `usuarios_auth`, consumidor real §44) |
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
| `tests/informesEngine.test.ts` | 41 (O16: 40 comprobaciones desglosadas + 1 de recuento; antes 1 test envolvente) | GAP3 |
| `tests/conciliacion-persistencia.test.ts` | 27 (GAP-R1, Arena B; Firestore mockeado: 15 base + 12 de cierre — query filtrada, recuperar-tras-actualizar, antifalsificación, invariantes estáticos §24 con control negativo) | GAP6 persistencia |
| `tests/morosidad-evidencias-storage.test.ts` | 20 (GAP-R2, Arena B; Storage mockeado + inspección de `storage.rules`) | C evidencias |
| `tests/ficha-publica-inmueble.test.ts` | 29 (GAP-R3, Arena B; espejo público + inspección de reglas) | Seguridad ficha pública |
| **Total** | **330** (tabla del punto de partida 2026-09-20; no incluye B/C/D/E/§6) | |

> **ORDEN 16 (GAP-R4, 2026-09-21)** — suites propias de motores económicos añadidas:
> `src/utils/cobrosEngine.test.ts` (69) · `src/utils/fiscalEngine.test.ts` (43) ·
> `src/utils/gastosEngine.test.ts` (45) · GAP3 desglosada (+40 netos). Global 835/835.
>
> **GAP-R1 / R2 / R3 (2026-09-21, desarrollo Arena B, integración Arena A)** — `tests/conciliacion-persistencia.test.ts` (15 → 27 tras el cierre de GAP-R1, 2026-09-23),
> `tests/morosidad-evidencias-storage.test.ts` (20), `tests/ficha-publica-inmueble.test.ts` (29). Global 899/899 (38 ficheros).

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
| 12 | Notificaciones transaccionales (GAP1) | Dispatcher de eventos de negocio: plantilla, canal, momento, reintentos, auditoría, idempotencia | `src/notificaciones/*` (6 módulos), `types/notificaciones.ts`, reglas §22 `notificaciones`, endpoint `/api/notificaciones/enviar` | Motor `COMPLETO`; transporte `DEPENDENCIA_EXTERNA` | 26 | Implementación Firestore del `RepositorioNotificaciones` (interface) **INTEGRADA vía BLOQUE C** (`repositorioNotificacionesFirestore`/`escritorNotificacionesGAP1` en `src/lib/morosidadFirestore.ts`, escribe en la colección canónica `notificaciones`; ver `src/utils/morosidad/puenteGAP1.ts`); EMAIL en safe-mode (sin proveedor real); WHATSAPP preparado-no implementado; sin bandeja UI |
| 13 | Contratos especiales (GAP2) | Modalidades (temporada/local/habitación), anexos versionados inmutables, finalización/rescisión irreversible, finiquito, derivados/prórrogas, eventos de ciclo | `contratoCicloEngine.ts`, `CicloContractualPanel.tsx`, `types.ts` (bloque GAP2) | `COMPLETO` | 44 | Eventos de ciclo emitidos hacia GAP1 (dispatcher aún sin transporte real); sin UI de creación directa desde cero (flujo real: sobre borrador LAU) |
| 14 | Reporting (GAP3) | Capa de agregación/lectura sobre cobros/fiscal/gastos; PDF (jsPDF); informes de inversor/rentabilidad | `reportingEngine.ts` (1.116 l.), `pdfExportEngine.ts`, `InformesSection.tsx` | `COMPLETO` | 41 (40 comprobaciones desglosadas en O16) | Capa de SOLO LECTURA: no escribe en cobros/gastos. Sin gráficos (tarjetas HTML). Ver hallazgos D2/D3 en ficha GAP-R4 (§12.2) |
| 15 | Sindicación (GAP5) | **CERRADO 2026-09-23** — generación/normalización de la publicación, identidad estable `inmuebleId+portal` (`externalId`/`clave`), hash canónico y versionado, idempotencia, validación estructurada, adaptadores desacoplados, persistencia del estado con histórico, puerto Firestore, reglas de seguridad **§44** y panel montado | `src/sindicacion/*` (6: `index`, `hashContenido`, `idempotencia`, `validacion`, `adaptadores`, `estadoRepositorio`), `src/lib/sindicacionFirestore.ts`, `publicacionEngine.ts`, `publicacionXml.ts`, `publicacionJson.ts`, `publicacionPortales.ts`, `PublicacionInmueblesPanel.tsx` (604 l., montado en `InmueblesSection.tsx`), colección `sindicacion_inmuebles`, reglas §44 + espejo `usuarios_auth` | **`CERRADO` ✅** | 164 (35 generación + 39 núcleo + 42 persistencia + 23 reglas + 25 panel) + 27 identidad (`fase14-espejo-identidad.test.ts`) | La conexión/publicación efectiva mediante APIs o pasarelas de terceros queda **fuera del cierre funcional** (integración externa independiente; no reabre GAP 5) |
| 16 | Conciliación bancaria (GAP6) | Importación MT940/OFX/Norma43/CSV, matching con cobros/gastos, propuestas→confirmación→aplicación, idempotencia | `src/utils/conciliacion/*` (9 módulos), `ConciliacionBancariaSection.tsx`, colecciones `movimientos_bancarios`/`conciliaciones_bancarias`/`importaciones_bancarias` | `COMPLETO` | 23 | Flujo Detecta→Propone→Valida→Aplica; la única escritura sobre operaciones es `registrarPagoPeriodo` (cobrosEngine). Sin feed bancario real (import manual) |
| 17 | Facturación / RRSIF / VERI*FACTU (GAP7) | Series/numeración, líneas/IVA/retenciones, registro de facturación con hash SHA-256 encadenado (spec AEAT v0.1.2), reporte RRSIF, máquina VERI*FACTU con transporte desacoplado | `facturacionEngine.ts`, `facturacionReporte.ts`, `verifactuTransport.ts`, `sha256.ts`, `FacturacionSection.tsx`, colecciones `facturas`/`registros_facturacion`/`envios_verifactu`/`series_facturacion` | Motor `COMPLETO`; remisión `DEPENDENCIA_EXTERNA` | 39 | NO hay remisión real a AEAT/SII (sin endpoints inventados, sin certificados en código); RRSIF se genera, no se transmite |
| 18 | Factura electrónica B2B (GAP8) | **INTEGRADO EN ARENA A** — integración commit `91da820`. Modelo B2B separado, validador bloqueante, CII/UBL 2.1/Facturae 3.2.2, máquina de estados, idempotencia, reglas deny-by-default, panel UI | `types/facturaElectronicaB2B.ts`, `facturaElectronicaB2BEngine.ts`, `facturaElectronicaB2BService.ts`, `generadores/*` (3), `intercambioB2B/adaptadoresB2B.ts`, `notificacionesB2B.ts`, `FacturaElectronicaB2BPanel.tsx`, colección `facturas_electronicas_b2b` | Generación `COMPLETO`; envío real `DEPENDENCIA_EXTERNA` | 40 | Ver §3 (GAP8). EDIFACT `PENDIENTE-ESPECIFICACIÓN`; SPFE/plataforma privada `PENDIENTE`; B2G/FACe fuera de alcance |
| 19 | Backend IA (Express) | 16 endpoints: análisis de documentos/cuestionario/incidencia/inspección, correo aseguradora, cláusula, pricing, kit publicación, catastro, notificaciones, upload | `server.ts` (2.605 l.), `api/index.ts`, `vercel.json` | `FUNCIONAL_CON_MEJORAS` | — | Residual P2: `documentsStore` en memoria (ver #3). Sin rate-limit (documentado en diagnóstico) |
| 20 | Seguridad perimetral | Reglas Firestore por colección (aislamiento por `propietarioId`, deny-by-default catch-all), reglas Storage por ruta, RBAC en cliente | `firestore.rules` (1.347 l., ~50 bloques), `storage.rules` (161 l.), `firebase.json` | `FUNCIONAL_CON_MEJORAS` | — | Residuales documentados en `FASE_1.4_SEGURIDAD_PERMISOS.md` §5 (ficha pública con datos fiscales; Storage sin claims) |
| 21 | **Tesorería + Liquidaciones + SEPA (BLOQUE B)** | **INTEGRADO EN ARENA A (2026-09-20)** — cierre del ciclo inmueble→propietario: liquidación mensual determinista, gastos imputables, órdenes de pago, SEPA PAIN.008/001 (preparación, sin envío real), portal propietario, conciliación evidencia | `src/tesoreria/*` (9 módulos), `TesoreriaSection.tsx`, `lib/tesoreriaFirestore.ts`, `lib/conciliacionSession.ts`, colección `liquidaciones_propietarios`/`gastos_inmuebles`/`ordenes_pago`/`ficheros_sepa`/`mandatos_sepa`/`config_liquidacion`, reglas §26–31 | `COMPLETO` (motor + integración) | 92 (batería `test:bloque-b`) | **Preparación** de ficheros SEPA: NO hay envío bancario real (sin APIs/EBICS/certificados inventados). Evidencia de pago requiere movimiento GAP6 conciliado en sesión. Ver §4 BLOQUE B |
| 23 | **Actas de entrada/salida + firma OTP + PDF (BLOQUE D)** | **INTEGRADO EN LA RAMA CANÓNICA (Arena A, 2026-09-21)** — origen: rama `arena/01a0ab9d-gestor-de-inmuebles-vercel` (commits `698e9e6`+`672b7ee`, excluido su `feat(gap6)` que duplicaba el GAP6 canónico), tras auditoría selectiva 20/20 ficheros. Acta ENTRADA/SALIDA con inventario por elementos (estados expresivos con nivel 0–6), lecturas de contadores, evidencias en Storage (sin base64), incidencias propias de acta, comparación entrada↔salida determinista (sin IA, matching id-first), máquina de estados con histórico, firma vinculada a versión, OTP (SHA-256, 15 min, 5 intentos, uso único, contexto; transporte `PENDIENTE_PROVEEDOR`), PDF jsPDF persistido en Storage con referencia/versión/fecha en Firestore, versionado inmutable de actas firmadas (nuevo documento + `actaAnteriorId` + cadena) protegido en reglas | `src/types/actas.ts`, `src/utils/actas/*` (7 módulos + 51 tests), `src/lib/firebaseActas.ts`, `ActasSection.tsx`, colecciones `actas`/`actas_evidencias`/`actas_incidencias`/`actas_otp`, reglas §38 + storage `actas_fotos`/`actas_pdfs`, `firestore.indexes.json` | `COMPLETO` (motor + UI + reglas; integrado y validado) | 51 (vitest `bloqueD.test.ts`); re-validado en canónica: vitest 460/460 · tsc 0 · build OK | OTP real SMS/email = `PENDIENTE_PROVEEDOR` (no hay proveedor inventado); canal MANUAL entrega en persona con `codigoPlainTemporal` controlado (solo ACTIVO/!usado, limpieza obligatoria tras uso — reforzado en la integración); comparación determinista sin IA; B/C intactos (tests 92+82). Ver §4 BLOQUE D y `docs/BLOQUE_D_ACTAS.md` |
| 22 | **Morosidad + recobro + expediente legal (BLOQUE C)** | **INTEGRADO EN LA RAMA CANÓNICA (Arena A, 2026-09-21, merge `5293c3c`)** — origen: rama `arena/01a0c03d-gestor-de-inmuebles-vercel` (commit `91bac8e`, base `5ff8448`), tras auditoría selectiva 33/33 ficheros. Detección de deuda desde `registroCobros` (SOLO lectura; el pago sigue siendo `cobrosEngine.registrarPagoPeriodo`), máquina de estados con histórico append-only, política de recobro configurable (D+3/D+10/D+20/D+30) versionada, plan de recobro, comunicaciones **solo por GAP1**, evidencias, compromisos cubiertos con cobros reales, expedientes de aseguradora y jurídico con requisito de procedibilidad LO 1/2025, espejo de mínimo privilegio para el propietario | `src/types/morosidad.ts`, `src/utils/morosidad/*` (8 módulos), `src/lib/morosidadFirestore.ts`, `MorosidadSection.tsx`, `MorosidadDetalleModal.tsx`, colecciones `expedientes_morosidad`/`_hist`/`evidencias_morosidad`/`compromisos_morosidad`/`politicas_morosidad`/`morosidad_resumen_propietario`, reglas §32–§37 | `COMPLETO` (motor + UI + reglas; integrado y validado) | 79 (vitest) + 82 (batería `test:bloque-c`); re-validado en canónica: vitest 409/409 · tsc 0 · build OK | Comunicaciones externas = `DEPENDENCIA_EXTERNA` (email en safe-mode = `PENDIENTE_ENVIO`/`FALLIDA`, nunca `ENVIADA`); burofax/notaría/aseguradora/tribunal = registro manual con evidencia (PREPARADO, sin envío real); intereses sin tipo fijado por el ERP (solo parámetros del usuario, `ESTIMADO`/`VERIFICADO`); reglas verificadas textualmente (sin emulator). Pendientes reales: transporte real GAP1, programador de detección, adjuntos en Storage, gancho BLOQUE B solo a nivel interfaz (`listarLiquidacionesPorCobros`). Ver §4 BLOQUE C y `docs/BLOQUE-C-*.md` |
| 24 | **Portal del Inquilino + Suministros (BLOQUE E)** | **INTEGRADO EN LA RAMA CANÓNICA (Arena A, 2026-09-21)** — origen: rama `arena/01a0bfd3-gestor-de-inmuebles-vercel` (E reconciliado `97ea0cb` sobre `7d21d44`), integración selectiva (sin merge ciego; excluidos permisos `tesoreria.*` duplicados y bloque `tesoreria` duplicado en `App.tsx`). Perfil `INQUILINO` (rol `INQUILINO_PORTAL`, alta solo por invitación con contrato vinculado y Auth UID como ID), alcance inquilino→contrato(s)→inmueble, portal móvil aislado (inicio, contrato, documentos, recibos, incidencias, mensajes, suministros, historial, cuenta), vistas saneadas por whitelist, suministros (CUPS/contador, titular, reparto), lecturas **inmutables** con `corrigeLecturaId`, cambios de titular, hilo de mensajes por contrato, adaptador de solo lectura sobre actas D, gestión ERP `InquilinosSection`/`SuministrosSection` | `src/inquilino/*` (4 módulos), `src/lib/suministrosFirestore.ts`, `src/components/portal-inquilino/*` (13), `InquilinosSection.tsx`, `SuministrosSection.tsx`, `authService.ts` (helpers tenant), colecciones `mensajes_portal`/`suministros`/`lecturas_suministro`/`cambios_titular`, reglas §39–§42 + helpers E.0 + blindaje `isStaff()`, storage E.1–E.4 | `COMPLETO` (motor + UI + reglas; integrado y validado) | 64 (batería `test:bloque-e`) + 73 (vitest `src/test/e/`, validación funcional automatizada O8); re-validado en canónica: vitest 533/533 · B 92 · C 82 · tsc 0 · build OK | Reglas verificadas textualmente (sin emulator); el registro público propietario/profesional conserva su limitación preexistente (lista `enlaces` sin sesión), el flujo inquilino usa `get` por ID. Ver §5 y `docs/BLOQUE-E-IMPLEMENTACION.md` |

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
`facturas_electronicas_b2b`,
`liquidaciones_propietarios`, `gastos_inmuebles`, `ordenes_pago`,
`ficheros_sepa`, `mandatos_sepa`, `config_liquidacion` (BLOQUE B),
`gestiones_cartera` (BLOQUE F — **diseño aprobado 2026-09-26, NO implementada**;
campos propuestos asociados: `propietarios.estadoAcceso`,
`inmuebles.estadoDatos` + `inmuebles.camposFaltantes`).

Storage (rutas con reglas): `cobros_justificantes/`, `gastos_facturas/`,
`documentos_solicitados/`, `inmuebles/`, `incidencias/`, `profesionales/`,
`presupuestos/`, `trabajos/`, `inventario/` y afines (ver `storage.rules`).

---

## 3. GAP 1–8 (estado consolidado)

Los ocho GAP del ERP están **consolidados en la rama canónica** (commits
`b1d45aa` → `91da820`). Informe de integración por GAP: ver `docs/informe-GAP2-*`
y `docs/informe-GAP8-*` (enlazados, no duplicados).

### GAP1 — Notificaciones transaccionales
- **Qué existe:** dispatcher completo (`src/notificaciones/`: `dispatcher.ts`, `plantillas.ts`, `canales.ts`, `resolucion.ts`, `autorizacion.ts`, `adaptadores.ts`), tipos (`src/types/notificaciones.ts`), reglas Firestore §22 (aislamiento por propietario), endpoint `/api/notificaciones/enviar`, plantillas de negocio (incl. bloques `facturacion.*` y `facturacion.b2b_*` añadidos por GAP7/8). **BLOQUE B (2026-09-20):** nuevo origen `TESORERIA` + 7 plantillas `tesoreria.*` + adaptador `eventoTesoreriaAEventoNotificacion` (aditivo; el envío efectivo sigue pendiente del repositorio, como el resto de orígenes).
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
- **Probado:** 41 tests vitest (`informesEngine.test.ts`, O16: las 40 comprobaciones del runner `tests_reporting.ts` expuestas una a una + recuento). Desglose R4: motor `reportingEngine.ts` (rangos, RBAC, cartera, inmueble, rentabilidad, fiscal, exportación CSV/JSON, no-duplicación) y `pdfExportEngine.ts` cubiertos por el runner; **sin cobertura**: `generarEvolucionTemporal` directo, `crearHistorialInforme`, `filtrarInmueblesPorUsuario`, UI `InformesSection.tsx`; sin persistencia propia (nada que probar). Hallazgos D2 (gastos filtrados por `g.fecha`, campo que el ERP no rellena) y D3 (rangos dependientes de zona horaria) documentados en la ficha GAP-R4 (§12.2) — **no corregidos** (fuera del alcance de O16).
- **Limitaciones reales:** sin gráficos (tarjetas HTML); informes generados en memoria desde datos suscritos; sin persistencia propia de informes.
- **Dependencias externas:** ninguna (motor puro).
- **NO modificar accidentalmente:** su naturaleza de **solo lectura** (no debe escribir en cobros/gastos/fiscal); no duplicar cálculos que ya viven en `cobrosEngine`/`fiscalEngine`/`gastosEngine`.

### GAP4 — Financiación hipotecaria
- **Qué existe:** `financiacionEngine.ts` (motor determinista: amortización francesa/lineal, tipo fijo/variable/mixto con transición, carencia ninguna/solo-intereses/total, amortización anticipada reducir-cuota/reducir-plazo, LTV; fórmulas anglosajonas explícitas documentadas en cabecera), `types/financiacion.ts`, `FinanciacionSection.tsx`, colección `financiaciones` + reglas §23 (con `sinSecretos()`).
- **Probado:** 29/29 (`financiacion.test.ts`).
- **Limitaciones reales:** motor de cálculo (sin I/O); el pliegue en el cash-flow de cartera/rentabilidad está preparado a nivel de datos pero no es un circuito cerrado de UI; la capitalización de intereses en carencia total es una **elección documentada del modelo**, no un estándar universal.
- **Dependencias externas:** ninguna.
- **NO modificar accidentalmente:** las fórmulas documentadas en cabecera (cambiarlas cambia el resultado económico de todos los casos de test); la coexistencia con `prestamos` (Fase 2.3) — si se migra, migrar ambos a la vez.

### GAP5 — Sindicación / publicación multicanal — **CERRADO ✅ (2026-09-23)**
- **Estado:** bloque terminado para el alcance definido en este mapa e **integrado en la canónica A** (delta preservado por Arena C en `14dac26`, adaptado a la arquitectura posterior de A). Verificación sobre A: **164/164** tests propios (35 generación/normalización + 39 núcleo: hash canónico, versionado, decisor de idempotencia, validación estructurada, contrato de adaptador + 42 persistencia del estado con histórico inmutable e independencia de portal + 23 reglas §44 + 25 panel montado), **27/27** identidad/ownership, suite completa **1286/1286 (52 ficheros)**, `tsc --noEmit` 0 errores, `npm run build` OK, `scripts/mutaciones-sindicacion.py` **82/82** mutaciones detectadas (0 supervivientes, 0 anclas rotas).
- **Qué existe:** `src/sindicacion/` (motor determinista sin I/O: `hashContenido.ts` con `formaCanonicaPublicable`, `idempotencia.ts`, `validacion.ts`, `adaptadores.ts` con `ejecutarOperacion` y `CLAVES_CREDENCIAL_PROHIBIDAS`, `estadoRepositorio.ts` con `externalId`/`clave`/`version`/`operacionesRegistradas`), `src/lib/sindicacionFirestore.ts` (único contacto con Firestore: `crearRepositorioEstadoSindicacionFirestore`), `publicacionEngine.ts`/`publicacionXml.ts`/`publicacionJson.ts`/`publicacionPortales.ts` (generación/export), `PublicacionInmueblesPanel.tsx` (604 l., montado en `InmueblesSection.tsx`), colección `sindicacion_inmuebles` y `firestore.rules` **§44** (helper `sinSecretosSindicacion()`; en C era §38 — en A se reancló a §44 sin tocar §38–43 de BLOQUE D/JD).
- **Identidad/ownership del circuito:** resuelta con el espejo canónico `usuarios_auth/{uid}` (no falsificable: `indexIsTruthful()` contra el perfil autoritativo `usuarios/{id}`) y el circuito `me → activeUser → isPropietarioRole → myPropId/myInmuebleIds → canReachInmuebleId`; `syncAuthIndex` lo mantiene al login, al restaurar la sesión y tras el alta por invitación. **Sin cambios en `authService.ts` ni en las reglas de identidad de A.** El harness `tests/harness/firestoreRulesEval.ts` respeta el anidamiento de `match` (la subcolección §6 F3 `usuarios_auth/{uid}/progreso_tutoriales` no se mezcla con el espejo) y `fase14` D.6 distingue el único escritor del espejo (`authService.ts`) de los consumidores legítimos de la subcolección (`experiencia/progreso.ts`, `experiencia/index.ts`, `lib/progresoTutorialesFirestore.ts`).
- **Alcance del cierre:** feed/export, validación, estados de sindicación persistidos con histórico, aislamiento por propietario e idempotencia. **La conexión/publicación efectiva mediante APIs o pasarelas de terceros queda fuera del cierre funcional actual y se abordará, si procede, como una integración externa independiente, sin reabrir GAP 5.**
- **B y D:** no aportan trabajo pendiente relevante para esta integración (sus módulos no se tocaron).
- **Dependencias externas:** credenciales/endpoints de portales (siempre fuera del cliente y de Firestore; nunca se inventan).
- **NO modificar accidentalmente:** la lectura del circuito de habitaciones (publica **leído**, nunca modifica contratos/disponibilidad); la idempotencia por `inmuebleId + portal`; que el modelo interno no dependa de ningún portal concreto; que el núcleo siga sin I/O ni Firebase; el `hashContenido`/`version` como cadena verificable y las guardas de §44 (`documentoCoherente`/`actorPuedeEscribirEstado`, `x.matches('…')` en forma método — la única que entiende el evaluador de A en `tests/helpers`).

### GAP6 — Conciliación bancaria
- **Qué existe:** `src/utils/conciliacion/` — parsers `mt940Parser`/`ofxParser`/`norma43Parser`/`csvParser`, `normalizador`, `matchingEngine` (config de tolerancias), `importEngine` (idempotencia de importaciones), `conciliacionEngine` (Detecta→Propuesta→Validada→Aplicada con histórico append-only), `idempotencia.ts`; UI `ConciliacionBancariaSection.tsx`; colecciones `movimientos_bancarios`/`conciliaciones_bancarias`/`importaciones_bancarias` + reglas. **BLOQUE B (2026-09-20):** espejo de sesión aditivo (`lib/conciliacionSession.ts`, 2 líneas en la sección) que expone movimientos/propuestas al selector de evidencia de pago de Tesorería. **Lógica de conciliación intacta.**
- **Probado:** 23/23 (`conciliacion.test.ts`): parsers, matching, aplicación, idempotencia, trazabilidad. Persistencia Firestore: 27/27 (`conciliacion-persistencia.test.ts`, ver GAP-R1 en §12.3).
- **Limitaciones reales:** sin feed bancario en tiempo real (importación manual de archivos); la aplicación de una conciliación sobre un cobro pasa **exclusivamente** por `registrarPagoPeriodo` de `cobrosEngine` (única vía de escritura sobre la operación contable, nunca silenciosa).
- **Dependencias externas:** archivos bancarios (hoy) / futura API bancaria.
- **NO modificar accidentalmente:** la regla «no modificar silenciosamente contabilidad operativa» (todo cambio produce propuesta + evento de histórico); `registrarPagoPeriodo` como única interfaz de escritura a cobros; la idempotencia de importaciones (re-importar no duplica).

### GAP-R1 — Persistencia Firestore de la conciliación bancaria (GAP6)
- **Estado:** CERRADO. Implementación `415de41` (`feat(gap-r1)`, 2026-09-21); consolidación en esta rama: tests de query filtrada + invariantes estáticos §24 + control negativo de discriminación (commit `feat(reconciliation): persist bank reconciliation in Firestore`).
- **Arquitectura adoptada:** motor canónico intacto (importar → proponer → confirmar → aplicar; sin segundo motor). `src/lib/conciliacionFirestore.ts`: carga acotada por propietario, guardado en batch atómico idempotente, transiciones con merge. La sección carga al montar con unión race-safe (lo local gana; modelo append-only) y persiste importación + 4 transiciones; banner de carga/error. `conciliacionSession.ts` queda como caché derivado solo para la evidencia de pago de Tesorería (no fuente de verdad).
- **Colecciones (existentes, reutilizadas; reglas §24 sin cambios):** `movimientos_bancarios`, `conciliaciones_bancarias`, `importaciones_bancarias`. DocIds namespaced+saneados `${propietarioId}_${idDeterminista}` (`hashIdempotencia` no incluye propietario). Sin índices compuestos (3 equality mono-campo + orden client-side).
- **Aislamiento:** las 3 consultas filtran `where(propietarioId == pid)`; reglas: master (email verificado) + propietario-sobre-lo-propio; `propietarioId` exigido en create e inmutable en update (`existing == incoming == myPropId`); delete solo master; `sinSecretosBancarios()`; profesional/inquilino/anónimo sin vía. Guard client-side anti-demo (`prop_demo` nunca toca Firestore).
- **Persistencia real:** sobreviven movimientos, propuestas con transiciones e importaciones (disponibles tras cierre y en otro dispositivo al abrir). Efímero legítimo: filtros/búsqueda/selección UI. `ResumenConciliacion` se recalcula (`calcularResumenConciliacion`), no se almacena. Cero localStorage/sessionStorage en el circuito.
- **Tests:** `tests/conciliacion-persistencia.test.ts` 27/27 (Firestore mockeado): 15 R1 (roundtrip, aislamiento A/B, inválidos, idempotencia, merge, guardas) + 12 consolidación (where demostrado en las 3 queries, recuperar-tras-actualizar, falsificación neutralizada, 8 invariantes §24 + extractor + control negativo §14 que falla ante reglas relajadas).
- **Limitaciones reales:** carga one-shot al montar (sin live-sync entre pestañas; cada dispositivo recupera al abrir); validación de reglas contra Firebase real pendiente (sin emulator en el repo, por orden); defecto D2 conocido (matching de gastos no puntúa fecha por `g.fecha` vs `fechaDevengo`) — afecta puntuación, no persistencia; fuera de alcance R1.
- **NO modificar accidentalmente:** el sellado `propietarioId` en escritura; los docIds namespaced (cambiar el esquema rompería idempotencia); las reglas §24 (los invariantes estáticos fallan si se relajan).

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
> Navegación: BLOQUE B/C/D/F aquí (§4) · **BLOQUE E** (§5) · **Capa Transversal
> Experiencia/Ayuda/Tutoriales/IA** (§6, sin numeración GAP) · **Roadmap de
> evolución** (§7) · dependencias entre bloques (§8).

### BLOQUE B — Tesorería + liquidaciones de propietarios + SEPA — **IMPLEMENTADO (2026-09-20)**

> Estado real del código (integración selectiva de `arena/01a0bfd3` @ `87aed9a`
> sobre la base canónica; sin merge ciego). Informe de comparación:
> `docs/integracion-BLOQUE-B-2026-09-20.md`. Informes del bloque B:
> `docs/BLOQUE-B-FASE0-VERIFICACION.md`, `docs/BLOQUE-B-IMPLEMENTACION.md`,
> `docs/BLOQUE-B-NORMATIVA-Y-AUDITORIA.md`.

**IMPLEMENTADO:**
- **Liquidación mensual determinista** (`src/tesoreria/liquidacionEngine.ts`):
  solo cobra liquida lo efectivamente cobrado (RECIBIDO/VERIFICADO); lo pendiente
  es informativo (no suma al neto); honorarios/IVA parametrizables; retenciones
  **solo si procede y con fuente/motivo obligatorios**; gastos imputables;
  redondeo a céntimos y descuadre > 0,01 € bloquea; id `liq_{prop}_{YYYY-MM}`
  idempotente + `hashCalculo`; estados `BORRADOR→APROBADA→PAGADA→ANULADA/REVERSADA`
  con histórico append-only; trazabilidad cobro↔línea. **No existe segundo motor
  de cobros**: lee `contrato.registroCobros` del cobrosEngine canónico.
- **Gastos de tesorería** (`gastosEngine.ts` + colección `gastos_inmuebles`):
  proyección de liquidación (imputableA/pagadoPor/estado) con importación
  **unidireccional** desde el modelo oficial `gastos` (canónico, intacto) y
  desde trabajos finalizados; guard anti doble registro si el trabajo ya tiene
  `gastoId` canónico.
- **Órdenes de pago** (`sepaPain001.ts` + `ordenes_pago`): origen trazable
  obligatorio (nunca importe libre), solo liquidaciones APROBADAS, idempotente
  `op_liq_{id}`.
- **SEPA PAIN.008** (`sepaPain008.ts`) y **PAIN.001** (`sepaPain001.ts`):
  generadores validados (IBAN mod-97, BIC, Creditor Identifier EPC, charset,
  EndToEndId, CtrlSum/NbOfTxs, idempotencia por hash) + ficheros descargables.
  **SOLO PREPARACIÓN DE FICHEROS: no hay ejecución bancaria real** (no se
  inventan APIs bancarias, EBICS, certificados ni endpoints).
- **PDF de liquidación** (`liquidacionPdf.ts`, patrón `window.print` canónico).
- **Tesorería en la navegación canónica** (`TesoreriaSection.tsx`, 5 tabs) y
  **«Mis Liquidaciones» en el Portal Propietario** (`PropietarioPortalSection.tsx`):
  aislamiento por `propietarioId`, detalle de líneas, referencia de pago, estados.
- **GAP 1**: origen `TESORERIA` + 7 plantillas `tesoreria.*` + adaptador
  `eventoTesoreriaAEventoNotificacion` (idempotencia canónica) en
  `src/notificaciones/*`. El envío efectivo sigue `DEPENDENCIA_EXTERNA` del
  dispatcher GAP1 (sin repositorio Firestore del dispatcher), igual que los
  demás orígenes. Auditoría de tesorería → `audit_logs` (auditoría, no sustituto).
- **GAP 6 (conector no destructivo)**: evidencia de pago de liquidación desde
  movimientos con propuesta **CONFIRMADA** (`movimientosBancariosParaLiquidacion`,
  `evidenciaPagoDesdeMovimientoBancario`) + espejo de sesión
  (`lib/conciliacionSession.ts`, 2 líneas aditivas en la sección de conciliación).
  Cadena completa: propietario→liquidación→orden→PAIN.001→evidencia→conciliación.
  **No se inventa conciliación automática.**
- **Seguridad** (`firestore.rules` §26–31, numeración canónica): propietario solo
  sus liquidaciones/gastos/config; órdenes/ficheros/mandatos (IBANs) solo
  administrador principal; invariante `propietarioId`; histórico append-only;
  sin borrado ordinario (anulación/reversión); `sinSecretosTesoreria()`.
  El «bloques 22–27» de la rama B **se descartó** (choque de numeración con
  canónico y aislamiento más débil).

**PENDIENTE / DEPENDENCIA EXTERNA (no resuelto por esta integración):**
- Emisión/recepción bancaria real de PAIN.008/001 (entidad/proveedor SEPA).
- Recepción/validación de **camt.053** (extractos SEPA) — `sugerirConciliacion`
  queda como interfaz documentada para esa futura integración.
- Sin XSD oficial SEPA (validación estructural + reglas EPC); XML sin `PstlAdr`
  (obligatorio SEPA a partir de 15/11/2026, **a verificar**).
- Parámetros fiscales (honorarios/IVA/retención) configurables y trazados,
  **sin asesoramiento fiscal**; la obligación legal de retención es del usuario
  (marcado «a verificar» en `BLOQUE-B-NORMATIVA-Y-AUDITORIA.md`).
- Persistencia de movimientos GAP6 en Firestore (el GAP6 actual es por sesión;
  la evidencia de pago opera sobre la sesión de conciliación).
- Transporte real del dispatcher GAP1 (común a todos los orígenes).

### BLOQUE C — Morosidad + recobro + expediente de recuperación — **INTEGRADO EN CANÓNICA (Arena A, 2026-09-21)**

Objetivo: detectar deuda, comunicarla y gestionar su recobro con expediente.

> **Estado real:** el bloque está implementado, verificado y versionado, y **INTEGRADO en la
> rama canónica** por Arena A (merge `5293c3c`, 2026-09-21) a partir de la entrega de la rama
> `arena/01a0c03d-gestor-de-inmuebles-vercel` (commit `91bac8e`, base `5ff8448`), tras auditoría
> selectiva de los 33 ficheros (100 % aditivo; cero escritura en `registroCobros`; pagos solo vía
> `cobrosEngine.registrarPagoPeriodo`; comunicaciones solo vía dispatcher GAP1).
> Batería sobre la canónica integrada: `test:bloque-c` 82 PASS · `test:bloque-b` 92/92 ·
> `vitest run` 409/409 · `tsc --noEmit` 0 · build OK.
> Detalle: `docs/BLOQUE-C-IMPLEMENTACION.md` (qué se construyó y qué no),
> `docs/BLOQUE-C-VERIFICACION.md` (resultados exactos de tests/tsc/build y sus límites) y
> `docs/BLOQUE-C-NORMATIVA.md` (fuentes, criterios y lo que el ERP no afirma).

Ámbito previsto en el plan (texto original de esta sección; hoy INTEGRADO salvo lo que se indica en cada punto):
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
  `solicitudes_seguro_impago`, flujo Gmail). **En la rama:** expediente de aseguradora
  `PREPARADO` con evidencia del comprobante; **no** se automatiza el envío (reutilizar el flujo
  Gmail sería una integración nueva: queda `PENDIENTE`).
- Trazabilidad completa.

**Reglas temporales:** se tratan como **configurables**, NO como plazos legales,
salvo verificación documental expresa. **Comprobado en la rama:** D+3/D+10/D+20/D+30 son
`diasOffset` de la política del propietario
(`fechaObjetivo = vencimiento + diasOffset + diasGracia`) y cambiar la política no reescribe el
histórico ni los planes ya generados (`versionarPolitica`).

### BLOQUE D — Entrada/salida + actas + evidencias + firma digital — **INTEGRADO EN CANÓNICA (Arena A, 2026-09-21)**

Objetivo: profesionalizar el check-in/check-out del inmueble con evidencia
auditable.

> **Estado real:** el bloque está implementado, verificado y **INTEGRADO en la rama
> canónica** por Arena A (2026-09-21) a partir de la entrega de la rama
> `arena/01a0ab9d-gestor-de-inmuebles-vercel` (commits `698e9e6` + `672b7ee`, sobre base
> `9cb01a43`), tras auditoría selectiva de los 20 ficheros del BLOQUE D (0 conflictos).
> **Excluido** el commit `5d3ae7f` (`feat(gap6)`) de esa rama: creaba un segundo sistema de
> conciliación sobre `src/utils/conciliacion/*`, que la canónica ya consolidó en `58c5454`
> (GAP6). Ajustes de integración: reglas D renumeradas a **§38** (§25 canónico = GAP7);
> predicado OTP reforzado y limpieza real de `codigoPlainTemporal` tras uso.
> Batería sobre la canónica integrada: `bloqueD.test.ts` 51/51 · `test:bloque-b` 92/92 ·
> `test:bloque-c` 82 · `vitest run` 460/460 · `tsc --noEmit` 0 · build OK.
> Detalle: `docs/BLOQUE_D_ACTAS.md` (implementación, modelo, correcciones D2 y pendientes).

Ámbito previsto en el plan (texto original de esta sección; hoy INTEGRADO salvo lo que se indica):
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

### BLOQUE F — GESTIÓN PATRIMONIAL (Cuenta / Propietario / Gestor + Carteras) — **DISEÑO APROBADO (2026-09-26), NO IMPLEMENTADO**

> **Fuente contractual:** `docs/D1-REVISADA-MODELO-CUENTAS-PROPIETARIOS-GESTORES.md`
> (D1 revisada; decisiones S1–S7 aprobadas formalmente el 2026-09-26, commit
> `1415521`). Esta sección sintetiza el modelo aprobado para que el mapa sea
> navegable; en caso de discrepancia prevalece el documento contractual.
> Diseño relacionado: `docs/FASE5-INSPECCION-PERSISTENCIA-IDENTIDAD.md` y
> `docs/FASE5B-DECISIONES-ARQUITECTURA-SEGURIDAD.md`.

**F.1 — Modelo de identidad y acceso.**
```
Cuenta/Auth (Firebase Auth uid + espejo usuarios_auth/{uid})
  ↓ 1:1
Perfil/usuario (usuarios/{id}: tipoPerfil, roles, permisos)
  ↓ 0..1
Propietario legal (propietarios/{id}: identidad legal, fiscal, bancaria)
```
Conceptos separados: **cuenta de acceso ≠ perfil ≠ propietario legal ≠ gestor ≠
cartera ≠ inmueble**. Reglas explícitas del modelo aprobado:
- **UN PROPIETARIO NO NECESITA TENER CUENTA** (la ficha `propietarios/{id}` existe
  y sostiene inmuebles/gastos/contratos/documentación sin usuario ni Auth;
  `estadoAcceso: SIN_CUENTA|INVITADO|ACTIVO`).
- **UNA CUENTA NO NECESITA TENER INMUEBLES** (p. ej. gestor/profesional nuevo).
- Crear propietario ≠ crear cuenta ≠ dar acceso: el acceso posterior se da por
  invitación nominal de un solo uso (flujo existente `accesoPropietarios.ts`) que
  vincula al propietario existente **sin cambiar** propietarioId, titularidad,
  histórico ni datos.
- NO existe ni se creará una colección paralela `personas` (S2).

**F.2 — `gestiones_cartera/{id}` (relación gestor ↔ propietario; N:M).**
Campos: `titularId` (propietarioId), `gestorUsuarioId`, `inmuebleIds[]`
(`[]` = cartera completa), `permiso: LECTURA|LECTURA_ESCRITURA`,
`responsableActual: GESTOR|TITULAR`, `estado`, `fechaInicio/fechaFin?`,
`eventos[{tipo, actorId, actorRol, fecha, motivo?}]` (append-only),
`creadoPor/createdAt/updatedAt`.
Estados: **`PENDIENTE_ACEPTACION` → `ACTIVA` ⇄ `SUSPENDIDA` → `REVOCADA`**
(S5: `SUSPENDIDA` = interrupción temporal; no es eliminación ni cambio de
titularidad). Ciclo: alta → aceptación (obligatoria si el titular tiene cuenta;
S4) → activación → modificación de permisos/ámbito (auditada) → cesión al
titular / devolución al gestor (transiciones sobre el mismo documento) →
suspensión / revocación (inmediata). **La gestión NO modifica la titularidad
legal**: `inmuebles.propietarioId` es invariante bajo cualquier transición.

**F.3 — Propietarios múltiples.** Un usuario con capacidad patrimonial trabaja
con N propietarios sin convertirlos en cuentas:
```
Gestor
├── Santiago   (propietarios/… — sin cuenta)
├── Yolanda    (propietarios/… — sin cuenta)
└── Propietario N
```

**F.4 — Rol `GESTOR_PATRIMONIAL` (S1).** Rol patrimonial **independiente** para
gestionar carteras/propietarios/inmuebles de terceros con permisos explícitos.
**`GESTOR_INMUEBLES` se mantiene sin cambios** para su funcionalidad operativa
existente (candidatos/visitas/contratos/seguros); no se sustituye ni renombra.

**F.5 — Importación con destino explícito.** Toda importación (migración
histórica Rentasync y futuras fuentes Excel/CSV/JSON) requiere
**`propietarioDestinoId` explícito** por registro/lote, resuelto desde un mapa
owner→`propietarios/{id}` confirmado por el usuario. **PROHIBIDO** resolver el
destino como "propietario de la cuenta que ejecuta la importación": cuenta
ejecutora y propietario destino son conceptos distintos.

**F.6 — Datos incompletos (S6).** `inmuebles.estadoDatos: COMPLETO|INCOMPLETO|
BLOQUEADO` + `camposFaltantes[]`. La ausencia de campos **no impeditivos** NO
descarta datos válidos: un inmueble puede entrar `INCOMPLETO` y completarse
después con guía contextual; `BLOQUEADO` solo ante impedimento real.

**F.7 — Auditoría e histórico (invariantes).** Titularidad inmutable bajo
gestión · histórico no borrable (`gestiones_cartera` nunca se elimina;
`eventos[]` y `audit_logs` append-only) · auditadas: aceptación, transferencia
(cesión), devolución, revocación, suspensión, cambios de permisos, creación de
propietario, invitación posterior.

**F.8 — No regresión (resumen; lista contractual en D1R §25).** Sin colección
`personas` · propietario sin cuenta válido · cuenta sin propiedades válida ·
gestión ≠ titularidad · revocar no elimina datos · dar acceso no crea
propietario nuevo · importar nunca deduce el propietario por la cuenta.

**F.9 — Estado y secuencia aprobada.** D1 APROBADA → integración en este mapa
(realizada en esta actuación) → **implementación de `gestiones_cartera`** (fase
independiente, pendiente) → D2 (endurecimiento servidor de `inmuebles`) → D3
(claims/ámbito) → B4 dry-run sobre staging → revisión → autorización
independiente. Archivos que se modificarán en la implementación: lista exacta
en D1R §20.

---

## 5. BLOQUE E — PORTAL DEL INQUILINO + SUMINISTROS

> **BLOQUE E INTEGRADO EN LA CANÓNICA (2026-09-21).** Portal del inquilino +
> suministros, procedente de Arena B y reconciliado contra `7d21d44`
> (`97ea0cb`), integrado de forma selectiva sobre la canónica: perfil
> `INQUILINO` en auth/RBAC (`INQUILINO_PORTAL`), `src/inquilino/*` (scope,
> portalEngine, suministrosEngine, actasAdapter solo lectura de D),
> `src/lib/suministrosFirestore.ts`, portal móvil `src/components/portal-inquilino/*`,
> `InquilinosSection` / `SuministrosSection`, reglas Firestore §39–§42 + helpers
> E.0 + blindaje `isStaff()` y Storage E.1–E.4. Suite `test:bloque-e` 64/64.
> Detalle: `docs/BLOQUE-E-IMPLEMENTACION.md`.
>
> **Validación automatizada funcional de E (ORDEN 8, 2026-09-21) — PARCIAL,
> CON LIMITACIONES DOCUMENTADAS.** Batería `src/test/e/` (vitest, 73 tests en 3
> ficheros: `bloqueE.servicios.test.ts` 32 · `bloqueE.portal.test.tsx` 33 ·
> `bloqueE.navegacion.test.tsx` 9 — node + jsdom/Testing Library) sobre la
> implementación real de E con Firestore/Auth/Storage sustituidos por dobles en
> memoria con traza de accesos (`firestoreMemoria.ts`, `setupE.ts`) y datos
> sintéticos `TENANT_TEST_A`/`TENANT_TEST_B` (`fixturesE.ts`). Cubre: invitación,
> registro (válida/usada/desactivada/inexistente/PROPIETARIO/error red),
> resolución del inquilino, portal completo (9 pantallas, estados vacíos/error/
> reintento/índice huérfano), saneado (sin DNI/notas/teléfonos/costes/facturas),
> operaciones (mensaje, avería, lectura inmutable, rechazos del motor, error de
> escritura), autorización (helpers + escrituras acotadas), aislamiento A/B en UI
> y a nivel de consulta (cero rutas cruzadas en la traza), navegación
> Sidebar/MobileNav/enrutado `App.tsx`. Resultado: 73/73 · suite total 533/533
> (460 previos + 73) · E 64 · B 92 · C 82 · tsc 0 · build OK. **NV (NO VALIDADO
> AUTOMÁTICAMENTE — LIMITACIÓN DE ENTORNO):** reglas reales de Firestore/Storage
> §39–§42 / E.1–E.4 (sin emulador ni Java en el sandbox; solo verificación
> textual de `test:bloque-e`), Firebase Auth real, subida real a Storage, index
> compuesto real. Sin defectos de E detectados.
>
> **REINTEGRACIÓN EN ARENA B (2026-09-25, merge PR4 `main`→`arena/01a0bfd3`).**
> Unión del portal E canónico (experiencia §6, `data-tour`, suscripciones
> acotadas §10.9) con la autenticación PR4 de Arena B (login único, registro
> autónomo, invitaciones nominales, administración segura, baja de acceso,
> fix `lastLoginAt`/permisos `94340ea`). Base `7d21d44`, sin segundas
> implementaciones: un solo `authService`, un solo portal E, reglas unidas.

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
> la estructura de este mapa. Estado global: **FASES 1–4 IMPLEMENTADAS
> (2026-09-21, Arena A)** — ver §6.5–§6.8; la validación real de Gemini (F4) y
> la publicación de la regla F3 son pendientes **externos** (§12).
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

### 6.5 Estado real — FASE 1 implementada (2026-09-21)

**Motor transversal** `src/experiencia/` (puro, sin Firebase, sin persistencia,
sin auditoría propia):

- `tipos.ts` — `ExperienceContextInput`/`ExperienceContext` (module, section,
  route, role, roles, permissions, entity, state, `missing[]`), `HelpEntry`,
  `Tutorial`/`TutorialStep`, `SesionTutorial`, `EvaluacionPaso` y el **contrato
  para la futura IA**: `CapacidadERP`, `IntentRequest`, `IntentResolution`,
  `ResolveUserIntent` (solo tipos; sin llamadas a Gemini).
- `contexto.ts` — `getExperienceContext()` / `contextoDesdeUsuario()`: resuelve
  módulo por sección (`MODULO_POR_SECCION`, todas las `SectionType`), tolera
  contexto incompleto; **rol y permisos se leen de `UsuarioApp`** (RBAC
  canónico; nunca se amplían).
- `ayuda.ts` — registro tipado `AYUDA_REGISTRO` (9 entradas iniciales sobre
  funciones reales: inicio, tesorería admin/propietario, morosidad, actas,
  portal inquilinos, suministros, incidencias, centro) + `ayudaParaContexto`,
  `buscarAyuda` (texto/keywords, sin acentos, stopwords), filtrado por rol y
  por permisos requeridos, `modulosConAyuda`.
- `tutoriales.ts` — modelo + sesión inmutable (`iniciar/avanzar/retroceder/
  finalizar/cancelar/reanudar/progreso`) + `evaluarPaso` (PERMISO_INSUFICIENTE,
  RUTA_INEXISTENTE, RUTA_INACCESIBLE, TARGET_NO_VISIBLE, con explicación).
  **Tutorial real nº 1**: `tutorial.tesoreria.liquidacion` (BLOQUE B, 5 pasos:
  abrir Tesorería → generar borrador → revisar líneas → aprobar → registrar
  pago; permisos `tesoreria.ver/liquidar/pagar`).
- `intenciones.ts` — `CAPACIDADES_ERP`, `capacidadesDisponibles(ctx)` (filtra
  por permisos reales), `construirIntentRequest`, `resolverIntencionLocal`
  (determinista, referencia/fallback para el futuro resolutor IA; devuelve
  `NO_AUTORIZADO` sin exponer contenido).

**UI** (`src/components/experiencia/*`, `src/components/sections/CentroAyudaSection.tsx`):
`ContextualHelp` (botón «?» accesible en el `Header` junto al título de cada
pantalla; no renderiza nada si la pantalla no tiene ayuda o el usuario no puede
verla), `TutorialPlayer` (panel flotante no bloqueante; navega vía
`setActiveSection` del host respetando el route guard), Centro de Ayuda como
sección `ayuda` integrada en Sidebar/MobileNav/Header de los tres perfiles ERP
(sin menú paralelo). `App.tsx`: sección `ayuda` en los route guards (extraídos a
`SECCIONES_PROPIETARIO`/`SECCIONES_PROFESIONAL`, misma lista) y sesión de
tutorial en memoria. El portal del inquilino (E) no incorporaba ayuda en F1 (ver §6.6).

**Tests**: `src/experiencia/experiencia.test.ts` (25: contexto, ayuda,
tutoriales, seguridad RBAC, contrato de intención) +
`src/components/experiencia/experiencia.ui.test.tsx` (13, jsdom: ayuda
contextual, Centro de Ayuda, reproductor con el tutorial real, navegación).
Suite global **571/571** (533 + 38) · B 92 · C 82 · D 51 · E 64 · batería E 73 ·
tsc 0 · build OK.

### 6.6 Estado real — FASE 2 implementada (2026-09-21)

**Alcance F2**: ayuda contextual en el Portal del Inquilino, ampliación del
registro de contenidos y recorridos guiados con resaltado real de `target`.
Ningún segundo sistema: se reutilizan `ContextualHelp`, `TutorialPlayer` y el
motor `src/experiencia/`. Sin persistencia, sin IA, sin cambios funcionales en
B/C/D/E ni en reglas Firebase.

**Motor**
- `tipos.ts` — nuevo concepto **`HostExperiencia`** (`'ERP'` | `'PORTAL_INQUILINO'`)
  en `ExperienceContext`, `HelpEntry` y `Tutorial`: el inquilino solo ve
  contenido del portal y el staff solo el del ERP. `SesionTutorial.saltados[]`.
- `contexto.ts` — `host` en el contexto (por defecto ERP); `PANTALLAS_PORTAL`
  (las 10 pantallas reales del shell del portal) y módulo derivado de la
  pantalla cuando `host === 'PORTAL_INQUILINO'`.
- `targets.ts` (**nuevo, transversal, sin dependencias**) — convención
  `data-tour="<id>"` + `selectorTour(id)`, `localizarTarget`, `esVisible`/
  `targetVisible` (hidden, `display:none`, `visibility:hidden`, ancestros,
  desconectado), `resaltarTarget(selector)` → `RESALTADO | NO_ENCONTRADO |
  NO_VISIBLE` con un **overlay `position:fixed; pointer-events:none`** que
  se reposiciona en scroll/resize (no bloquea la app ni altera el nodo
  destino), `limpiarResaltado()` idempotente, `hayResaltadoActivo()`.
- `tutoriales.ts` — rutas validadas según el host del tutorial;
  `tutorialesDisponibles` filtra por host; `saltar()` (registra el paso en
  `saltados`, completa si es el último). Registro = **3 tutoriales**.
- `ayuda.ts` — registro **23 entradas** (9 F1 + 14 F2), todas sobre funciones
  reales y con «qué es / qué puedo hacer / qué necesito / qué significa cada
  estado»: ERP → `ayuda.cobros.gestion`, `ayuda.contratos.formalizacion`,
  `ayuda.morosidad.estados` (máquina de estados C), `ayuda.actas.estados-firma`
  (D, incl. inmutabilidad de actas firmadas y OTP externo), `ayuda.incidencias.estados`;
  Portal (host `PORTAL_INQUILINO`, rol INQUILINO) → `ayuda.portal.{inicio,
  contrato, recibos, incidencias, suministros (lecturas + cambio de titular),
  mensajes, documentos, historial, cuenta}`. `ayudaVisibleEn` filtra por host.

**Recorridos guiados reales (§6 F2 · 2)**
- `recorrido.portal.primeros-pasos` — Portal del Inquilino (host PORTAL,
  rol INQUILINO, sin permisos de gestión): inicio → recibos → averías
  (`portal-nueva-averia`, el FAB real) → lecturas → «Más» › mensajes
  (`portal-mas-mensajes`). Se inicia desde la ayuda de «Inicio».
- `recorrido.inquilinos.invitar` — ERP (BLOQUE E, rol ADMINISTRADOR, permisos
  `inquilinos.ver` / `inquilinos.gestionar`): menú «Portal Inquilinos»
  (`nav-inquilinos`) → pestaña Invitaciones → compartir enlace → Accesos →
  Mensajes. Disponible en el Centro de Ayuda y desde la ayuda de la sección.
- `tutorial.tesoreria.liquidacion` (F1) ahora resalta `nav-tesoreria`.

**Marcadores `data-tour`** (atributos inertes; sin cambio de lógica):
`Sidebar`/`MobileNav` → `nav-<SectionType>`; `InquilinosSection` →
`inquilinos-tab-<accesos|invitaciones|mensajes|vinculacion>`;
`InquilinoPortalShell` → `portal-tab-<inicio|recibos|incidencias|suministros|mas>`,
`portal-mas-<contrato|mensajes|documentos|historial|cuenta>`;
`PortalIncidencias` → `portal-nueva-averia`.

**UI**
- `ContextualHelp` — props `host`, `entityType/entityId/state`, `tema`
  (`claro`/`oscuro`). En el **portal** se monta en la cabecera del shell junto
  a «Actualizar», **solo si hay `contratoActivo`** (sin contrato/sin vínculos/
  error → no se muestra, la pantalla no se rompe); usa la pantalla actual y el
  contrato como contexto; no enlaza al Centro de Ayuda del ERP.
- `TutorialPlayer` — botón «Saltar», resaltado real por `useEffect` (reintento
  breve tras el cambio de sección; limpieza al cambiar de paso, cancelar,
  finalizar y desmontar), `targetVisible` solo se evalúa cuando el host está en
  la ruta del paso; `onNavegar(route)` → el host decide (route guard intacto);
  prop `posicion` (`abajo-derecha` ERP · `abajo-centro` portal, sobre la nav).
- `InquilinoPortalShell` — sesión de tutorial en memoria + `<TutorialPlayer>`;
  la navegación de los pasos usa `ir()` del propio shell.

**Seguridad (§6 F2 · 7)**: la capa sigue leyendo rol/permisos de `UsuarioApp`;
un recorrido nunca ejecuta acciones (solo resalta y explica), nunca navega por
sí mismo (delega en el host y sus guards), y los pasos sin permiso/ruta quedan
`PERMISO_INSUFICIENTE`/`RUTA_INACCESIBLE`/`RUTA_INEXISTENTE` con explicación.
Tests comprueban que los permisos del usuario no cambian y que no se crean
invitaciones/enlaces al recorrer el tutorial ERP.

**Tests F2 (18 nuevos)**: `src/experiencia/targets.test.ts` (9: visible /
inexistente / oculto / sustitución / cambio de sección; registro de 3
recorridos con rutas, permisos y targets reales; recorridos portal y ERP con
saltar/finalizar/cancelar; seguridad RBAC y guards) +
`src/components/experiencia/experiencia.f2.ui.test.tsx` (9, jsdom con el
arnés de E: ayuda en las 9 pantallas reales del portal, ausencia sin contrato o
con contrato inexistente, sin contenido de gestión ni datos ajenos, recorrido
del portal de extremo a extremo con resaltado, ciclo de vida del resaltado en
`TutorialPlayer`, permiso insuficiente, desmontaje, recorrido ERP sobre
`Sidebar` + `InquilinosSection` reales). Tests F1 ajustados al registro
ampliado (38 → siguen 38). Suite global **589/589** (571 + 18) · B 92 · C 82 ·
D 51 · E 64 · batería E 73 · tsc 0 · build OK.

**Limitaciones F2**: el resaltado se verifica en jsdom (sin layout real; en
navegador el overlay se posiciona con `getBoundingClientRect`); no hay
recorridos para C (morosidad) ni D (actas) todavía — solo ayuda de estados;
la ayuda del portal no cubre pantallas que no existen (p. ej. actas del
inquilino no tiene vista propia en el portal); sin persistencia del progreso
(al recargar se pierde la sesión).

### 6.7 Estado real — FASE 3 implementada (2026-09-21): progreso persistido

**Alcance F3**: persistir y recuperar el progreso de los tutoriales (iniciar →
avanzar → abandonar → volver → reanudar → completar). Sin IA, sin nuevos
tutoriales, sin pantalla «Mis tutoriales», sin gamificación.

**Modelo Firestore elegido**

```
usuarios_auth/{uid}/progreso_tutoriales/{host}__{tutorialId}
{ tutorialId, host: 'ERP'|'PORTAL_INQUILINO', currentStep, stepCount,
  completed, skippedSteps[], startedAt, updatedAt, completedAt? }   (ISO-8601)
```

Justificación: `usuarios_auth/{uid}` es el espejo de identidad por UID de
Firebase Auth que ya existe (FASE 1.4) y la única clave que las reglas pueden
comprobar con `request.auth.uid`; el progreso cuelga del usuario como
subcolección (no hay colección global de progreso, no se toca `usuarios/{id}`
—cuyo id no siempre coincide con el UID— ni `audit_logs`). El id del documento
incluye el `host` para que un mismo `tutorialId` en ERP y Portal no colisione.
`stepCount` detecta progresos de otra versión del tutorial (se reinicia desde 0).
`completed` es pegajoso: repetir un tutorial no lo «des-completa». Solo se
guarda estado; el contenido sigue siendo el registro tipado del código. Ni
localStorage ni sessionStorage.

**Servicio (único, transversal)** `src/lib/progresoTutorialesFirestore.ts`:
`getTutorialProgress(tutorialId, host?)`, `saveTutorialProgress(sesion,
tutorial)`, `clearTutorialProgress(tutorialId, host?)` y el objeto inyectable
`servicioProgresoTutoriales`. Usa `auth.currentUser`/`db` canónicos de
`src/lib/firebase.ts` (sin segunda abstracción de auth); el UID nunca es un
parámetro; valida `tutorialId` contra `TUTORIALES_REGISTRO` y coherencia de
host; valida el documento con `esProgresoValido` al escribir **y al leer** (un
documento corrupto se trata como ausencia); nunca lanza: devuelve
`ResultadoProgreso` (`NO_AUTENTICADO | TUTORIAL_DESCONOCIDO | DATOS_INVALIDOS |
ERROR_FIRESTORE`). Parte pura en `src/experiencia/progreso.ts`
(`progresoDesdeSesion`, `sesionDesdeProgreso`, `idProgreso`, `rutaProgreso`).

**Integración** — `TutorialPlayer` acepta `servicio?` (lo inyectan `App.tsx` y
`InquilinoPortalShell.tsx`; ERP y Portal comparten motor y servicio). Al abrir:
lee el progreso; si es reanudable (en curso, misma versión, paso > 0 o con
saltos) sustituye la sesión y muestra «Reanudado desde el paso N»; si no, deja
constancia del paso 0. Guarda en cada cambio de sesión (avanzar, retroceder,
saltar, finalizar → `completed=true`), al «Salir» (cancelar guarda el paso
actual) y al desmontar si quedó algo sin guardar. La sesión en memoria del host
sigue siendo el estado de UI. Si Firestore falla o no hay sesión Auth: el
tutorial continúa en memoria, aviso no intrusivo («No se pudo guardar el
progreso; puedes continuar y se reintentará» + «Reintentar»), y el siguiente
cambio vuelve a intentarlo. Sin sistema offline propio.

**Reglas nuevas** (`firestore.rules`, dentro de `match /usuarios_auth/{uid}`):
`match /progreso_tutoriales/{progresoId}` — `get` solo si
`request.auth.uid == uid`; `list: false`; `create/update` solo el propio uid
con `isValidId(progresoId)` y `esProgresoTutorialValido(incoming(), progresoId)`
(claves exactas `hasAll/hasOnly`, host ∈ {ERP, PORTAL_INQUILINO}, `progresoId
== host + '__' + tutorialId`, enteros con rango, `currentStep < stepCount`,
`completed` bool, lista ≤ 100, fechas string ≤ 40); `delete` solo el propio
uid. Ni `isMasterAdmin` ni staff acceden al progreso ajeno. Ninguna regla
existente se ha relajado; reglas B/C/D/E intactas; deny-by-default final.

**Arnés de tests (aditivo)**: `firestoreMemoria.doc()` admite rutas a
subcolecciones; el mock de `lib/firebase` expone `auth.currentUser` vivo desde
`authSintetico`. Batería E sigue 73/73.

**Tests F3 (20 nuevos)**: `src/experiencia/progreso.test.ts` (13: modelo y
validación, conversión sesión⇄progreso, servicio sin usuario / sin progreso /
guardar / actualizar / cancelar / completar / borrar / tutorial desconocido /
error Firestore / doc corrupto / dos hosts; seguridad: A nunca toca la ruta de
B, comprobación **estática** de `firestore.rules`, sin contenido ni permisos en
el documento) + `src/components/experiencia/experiencia.f3.ui.test.tsx` (7,
jsdom: inicio desde 0 y guardado en avanzar/retroceder/saltar, salir y reanudar,
completar y reabrir, error Firestore con «Reintentar», sin sesión Auth / sin
servicio, otra versión del tutorial, y el Portal del Inquilino real: abandonar,
volver y reanudar bajo su propio UID). Suite global **609/609** (589 + 20) ·
F1+F2 56 · B 92 · C 82 · D 51 · E 64 · batería E 73 · tsc 0 · build OK.

**NV — Firebase real**: el sandbox no tiene red hacia Firebase ni emulador
(sin Java); las reglas nuevas están **comprobadas estáticamente** y el
comportamiento del servicio está probado sobre el Firestore en memoria del
arnés E. La regla real (`usuarios_auth/{uid}/progreso_tutoriales`) queda **NO
VALIDADA** contra Firebase hasta publicarla (publicación manual de reglas
pendiente, como el resto). No se han creado datos en Firestore real.

**Posible mejora menor posterior (no F4):** vista «Mis tutoriales» en el
Centro de Ayuda a partir del progreso persistido. La F4 (IA asistente) se
describe en §6.8.

### 6.8 Estado real — FASE 4 implementada (2026-09-21): IA asistente transversal (primera implementación controlada)

**Principio aplicado**: la IA es **solo una capa de interpretación** sobre
capacidades REALES; la autoridad sigue siendo el ERP («Usuario → rol →
permisos → contexto → capacidad permitida → ejecución»). La IA nunca decide
permisos, nunca toca Firestore, nunca ejecuta nada por sí misma.

**Circuito real (probado en tests, sin proveedor real)**: petición en lenguaje
natural → `ExperienceContext` (§6.5) → `capacidadesDisponibles(ctx)` (RBAC
real) → **interpretación** (proveedor IA o local) → `AIIntentRequest` →
**`validarResolucionIA`** (determinista) → `AIIntentResolution` →
**confirmación** si procede → **ejecución por el host** (route guard propio,
tutoriales F2, ayuda F1). El host conserva la última palabra: el asistente
solo le entrega una `AccionHost` validada (`NAVEGAR` / `TUTORIAL` /
`EXPLICAR`).

**Contrato (`src/experiencia/tipos.ts`)**: `AIIntentRequest` (texto, host,
módulo/sección, perfil y rol, **capacidades disponibles** — nunca códigos de
permiso — y rutas navegables del host), `PropuestaIA` (lo que devuelve el
proveedor: intención, capacidad propuesta, parámetros, confianza, explicación,
alternativas), `AIIntentResolution` (estado `RESUELTA | REQUIERE_CONFIRMACION |
AMBIGUA | SIN_CAPACIDAD | SIN_PERMISO | NO_SOPORTADA | ERROR`, capacidad,
parámetros, `requiereConfirmacion`, `confirmada`, `errores`, `avisos`,
`origen` IA|LOCAL|VALIDADOR, `proveedor`). Trazabilidad **dentro de la
resolución** (sin `audit_logs` ni colección nueva).

**Catálogo de capacidades (`src/experiencia/intenciones.ts`, 28)**: 3
transversales sin host (`cap.ayuda.explicar`, `cap.ayuda.tutorial`,
`cap.navegacion.ir` — revalidan sus parámetros contra ayuda/tutoriales/rutas
del contexto) + `cap.ayuda.consultar` (ERP) + 10 **consulta ERP** (inmuebles,
propietarios, contratos, cobros, tesorería, morosidad —solo ADMINISTRADOR—,
actas, incidencias, inquilinos, suministros; cada una ligada al permiso real
`PERMISOS_SISTEMA`) + 5 **escritura ERP** heredadas de F1 (liquidar, pagar,
SEPA, invitar inquilino, gestionar suministros: en F4 su ejecución es
**únicamente abrir la pantalla real tras confirmación explícita**; ninguna
operación de negocio se dispara desde el asistente) + 9 **Portal**
(`host = PORTAL_INQUILINO`, solo perfil INQUILINO: inicio, contrato, recibos,
incidencias, suministros, mensajes, documentos, historial, cuenta).
**No hay capacidades nuevas de negocio**; `resolverIntencionLocal` (F1) se
mantiene como último recurso.

**Validación determinista (`validarResolucionIA`, `src/experiencia/asistente.ts`)**:
capacidad existe en el catálogo → está en `capacidadesDisponibles(ctx)` →
host coincide → parámetros según esquema (`helpEntryId` en la ayuda visible,
`tutorialId` en los tutoriales del contexto, `route` en las rutas navegables
del host) → `ESCRITURA` o `sensible` ⇒ `REQUIERE_CONFIRMACION` → nunca amplía
permisos (una capacidad no permitida da `SIN_PERMISO` sin exponer contenido).
Funciona aunque el proveedor devuelva basura (`ERROR`/`NO_SOPORTADA`).
`confirmarResolucion` **revalida** y marca `confirmada`; `ejecutarResolucion`
**nunca** produce acción sin `confirmada` cuando la requiere, y revalida de
nuevo contra el contexto en el momento de ejecutar.

**Confirmaciones**: consulta, navegación y ayuda = directas; escritura =
confirmación explícita previa («¿Quieres continuar?» → «Sí, continuar» /
«Cancelar»). Nada sensible está en el primer conjunto (no hay capacidad que
firme, apruebe, envíe SEPA o modifique reglas).

**Proveedor IA — qué es real y qué no**:
- **Adaptador servidor** `POST /api/asistente/interpretar` (`server.ts`):
  reutiliza `getGeminiClient()` / `generateGeminiWithRetry()` y el modelo
  canónico `gemini-3.7-flash`, la misma `GEMINI_API_KEY`, **sin segunda
  configuración ni secretos nuevos**. Recibe solo el `AIIntentRequest` (sin
  permisos, sin datos de negocio), devuelve una `PropuestaIA` en JSON; sin
  clave responde `{ disponible: false }`. **No ejecuta nada ni accede a
  Firestore.**
- **Proveedor cliente** `crearProveedorGeminiRemoto()`
  (`src/experiencia/proveedorGemini.ts`): llama al endpoint anterior con
  tiempo máximo; si no está disponible o falla, el asistente **cae al modo
  local con aviso visible** («modo local»).
- **Proveedor local determinista** `proveedorLocal` (`asistente.ts`):
  interpretación por patrones y palabras clave sobre las capacidades
  permitidas + `buscarAyuda` + `tutorialesDisponibles`; es la referencia de
  los tests y la garantía de funcionamiento sin red.
- **NV — Gemini real NO VALIDADO**: el sandbox no tiene red hacia Google;
  ninguna llamada real a Gemini se ha realizado. La ruta de código está
  escrita y tipada, pero su validación con la API real queda **PENDIENTE**
  (requiere `GEMINI_API_KEY` en el entorno del servidor y una prueba manual).
  No se afirma lo contrario. **Procedimiento de prueba externa (5 casos) en
  `docs/F4-PRUEBA-REAL-GEMINI.md`** (ORDEN 14, 2026-09-21).
- **Revisión pre-validación (ORDEN 14)**: el endpoint responde sin clave
  `{disponible:false}` (200) y con clave sin red `502 PROVEEDOR_ERROR`
  (comprobado en Arena, clave no filtrada); el cuerpo enviado al servidor no
  contiene permisos ni secretos. **Defecto corregido**: una propuesta del
  proveedor con **capacidad inexistente** o **intención fuera del contrato**
  se presentaba como respuesta final del proveedor (`SIN_CAPACIDAD`/
  `NO_SOPORTADA`, origen IA); ahora se trata como violación del esquema → se
  rechaza y se cae al resolutor local con aviso (`violaEsquema` en
  `asistente.ts`). `SIN_PERMISO`, `NINGUNA` y `AMBIGUA` siguen siendo
  respuestas legítimas del proveedor. +1 test (F4 = 29).

**UI (`src/components/experiencia/AsistentePanel.tsx`)**: botón «Asistente»
+ panel ligero (no chat): petición, estado «Interpretando…», interpretación
con explicación/contenido de ayuda, alternativas ante ambigüedad, confirmación
explícita, errores claros (sin permiso / no soportada / proveedor caído), aviso
de modo local. Accesibilidad: `role=dialog` con nombre, `aria-expanded` /
`aria-controls`, foco al abrir, Escape cierra, `role=status` en carga,
`data-testid="asistente-resolucion"` + `data-estado`. Hosts: `Header.tsx`
(escritorio), `MobileNav.tsx` (móvil, tema oscuro), ambos desde `App.tsx`
(`ejecutarAccionAsistente` → `setActiveSection` con las `seccionesAccesibles`
del ERP / `iniciarTutorial` F2), y `InquilinoPortalShell.tsx` con
`host = PORTAL_INQUILINO` y solo las pantallas del portal. El portal **nunca
deriva** a Tesorería/Morosidad/Actas/inmuebles: una petición de ese tipo se
responde «no está disponible en el portal del inquilino».

**Tests F4 (28 nuevos en `f98feed` + 1 en ORDEN 14 = 29)**: `src/experiencia/asistente.test.ts` (19 + 1: contrato
—válida, ambigua, no soportada, sin capacidad, sin permiso—; seguridad
—permitida aceptada, no permitida rechazada, ampliación de permisos
rechazada, ERP nunca capacidad Portal, Portal nunca capacidad ERP, petición
IA sin códigos de permiso—; confirmación —lectura/navegación no, escritura
sí, sin confirmar no ejecuta, confirmada ejecuta—; proveedor —respuesta
válida, mal formada, capacidad inexistente, parámetros inválidos, proveedor
no disponible → fallback local; respuesta fuera del contrato rechazada y
SIN_PERMISO/NINGUNA/AMBIGUA respetadas—) + `src/components/experiencia/experiencia.f4.ui.test.tsx`
(9, jsdom: visible en Header/MobileNav y accesibilidad, navegación,
loading + interpretación, ambigüedad, confirmación/cancelación con Firestore
en memoria intacto, errores y modo local, Portal real con contrato y sin
contrato, tutorial y ayuda del portal, host con `accessibleSections` que
conserva la última palabra). Ajuste justificado en F1: el test de «contexto
vacío» de `capacidadesDisponibles` admite ahora las capacidades
transversales sin host/permiso (no conceden nada por sí mismas: revalidan
parámetros contra el contexto). Suite global **638/638** (609 + 29) · B 92 ·
C 82 · D 51 · E 64 · batería E 73 · tsc 0 · build OK.

**PENDIENTE (no implementado, no marcar como hecho)**: validación real con
Gemini (llamada real y ajuste del prompt); capacidades futuras (diagnóstico
guiado del §6.2 sobre datos del usuario, acciones de negocio con parámetros
reales, sensibles con doble confirmación); publicación externa del endpoint
(despliegue en Vercel con `GEMINI_API_KEY`); métricas de uso. Reglas
Firestore/Storage **sin cambios** en F4.

---

## 7. EVOLUCIÓN DEL ERP — ROADMAP (capacidades, no «órdenes pequeñas»)

Estas fases son **capacidades funcionales de distinto tamaño** — no se
presentan como cinco órdenes pequeñas:

| Fase | Capacidad | Tamaño / nota |
|---|---|---|
| **B** | Tesorería + liquidaciones de propietarios + SEPA (PAIN.008/001) | **IMPLEMENTADO (2026-09-20)** — ver §4 BLOQUE B (pendientes: envío bancario real, camt.053) |
| **C** | Morosidad + recobro + expediente de recuperación | **INTEGRADO (2026-09-21, Arena A — merge `5293c3c`)** — ver §4 BLOQUE C (pendientes: transporte real de comunicaciones GAP1, emulator de reglas, programador de detección, adjuntos en Storage) |
| **D** | Entrada/salida + actas + evidencias + firma digital | **INTEGRADO (2026-09-21, Arena A)** — ver §4 BLOQUE D (pendiente externo: transporte real OTP SMS/email) |
| **E** | **Portal del Inquilino + suministros** (depende de B, C, D — §5) | **INTEGRADO (2026-09-21, Arena A — `10f07b3`; validación automatizada `7dcb3ea`, 73/73)** — ver §5 (NV: reglas reales sin emulador) |
| **Transversal** | **Experiencia, Ayuda, Tutoriales e IA Asistente** (sin numeración GAP — §6) | **FASES 1, 2, 3 y 4 IMPLEMENTADAS (2026-09-21)**: motor de contexto + ayuda contextual (ERP y Portal del Inquilino) + Centro de Ayuda + 23 contenidos + recorridos guiados con resaltado real (3 tutoriales) + progreso persistido por usuario en `usuarios_auth/{uid}/progreso_tutoriales` (regla real NV) + **asistente IA transversal controlado** (28 capacidades reales, validación determinista RBAC, confirmación previa en escritura, adaptador Gemini canónico + proveedor local; §6.5–6.8). Pendiente: **validación real de Gemini** (NV), capacidades futuras, publicación externa |
| **Después** | **Integración global**: pruebas end-to-end de circuitos completos, UX, seguridad, rendimiento y endurecimiento final | Cierre de oleada |

Dependencias entre fases: §8.

---

## 8. DEPENDENCIAS ENTRE BLOQUES

Basado en el código real (imports y reglas), no en supuestos. Extiende y corrige
el esquema de trabajo de la orden:

```
AUTH (authService + RBAC + scoping propietarioId)   ← transversal a TODO
CAPA TRANSVERSAL — Ayuda/Tutoriales/IA asistente (IMPLEMENTADA F1–F4, sin numeración GAP — §6)
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

BLOQUE E — PORTAL DEL INQUILINO + SUMINISTROS (INTEGRADO — §5; re-unido con auth PR4 en Arena B 2026-09-25)
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
3. ~~`inmuebles` con `allow read: if true` (funnel público): expone la ficha completa
   (incl. campos fiscales/IBAN) en listado público.~~ **Resuelto en el repositorio por GAP-R3**
   (`5e47fc2`, 2026-09-21): `inmuebles` ya no es legible sin sesión; el funnel anónimo usa el
   espejo `fichas_publicas_inmueble` (ver §12.2). **Pendiente operativo:** publicar las reglas y
   materializar las fichas de los inmuebles existentes (§12.6, pendientes 2 y 3).
4. `package.json` canónico sin script `test` (correr `npx vitest run`); añadirlo es
   un cambio de tooling menor pendiente de decisión.
5. Chunk de build >500 kB (warning conocido, no bloqueante).
6. ~~Cobertura vitest fina en GAP3 y en subsistemas base~~ **Resuelto en ORDEN 16 (GAP-R4)**:
   suites propias `cobrosEngine` 69 · `fiscalEngine` 43 · `gastosEngine` 45 · GAP3 41.
7. `/api/*` sin rate-limit (documentado en diagnóstico funcional).
8. Despliegue de reglas: `firestore.rules`/`storage.rules` se publican **manualmente**
   por el usuario con Firebase CLI (no desde el sandbox).
9. Colección `valoraciones_profesionales` (GAP base «Profesionales», usada por
   `OperacionesSection`/`ProfesionalesSection` vía `subscribeValoracionesProfesionales`/`saveValoracionProfesionalFirestore`).
   Histórico: la regla existía en `4d420bd` (§21 antiguo) y desapareció en la
   integración AI Studio `24a2e23` → la colección caía en el deny-by-default.
   **RESUELTO (2026-09-22, bloque 2I-bis de `firestore.rules`): regla restaurada y
   endurecida** (la histórica `isSignedIn()` NO se recuperó):
   - aislamiento por `propietarioId` (nuevo campo opcional de `ValoracionProfesionalTrabajo`,
     copiado siempre de `trabajo.propietarioId`); `get`/`list` del propietario solo con
     `propietarioId == myPropId()`; master acceso completo; `update`/`delete` solo master;
   - consulta del propietario filtrada: `subscribeValoracionesProfesionales(callback, scope)`
     delega en `subscribeColeccionPropietario` (`where('propietarioId','==', pid)`), y
     `OperacionesSection` le pasa el ámbito del usuario actual (sin `orderBy`, sin índices nuevos);
   - creación validada contra `trabajos_profesionales`: el trabajo debe existir, pertenecer al
     propietario y el `inmuebleId` coincidir con el del trabajo; `usuarioId` (id interno del
     usuario, escrito por `ValoracionProfesionalModal`) es solo trazabilidad, nunca autorización;
   - PROFESIONAL sin acceso (no existe consumidor montado); INQUILINO/anónimo denegados;
   - documentos históricos sin `propietarioId` quedan fuera del alcance del propietario
     (visibles solo para master; sin migración);
   - test semántico `tests/seguridad-firestore-valoraciones.test.ts` (32 casos, incluye
     discriminación contra `33fcf38`). **Publicación de las reglas en Firebase: PENDIENTE**
     (manual, ver §10.8).

## 11. ÍNDICE DE DOCUMENTACIÓN (enlazar, no duplicar)

| Documento | Contenido |
|---|---|
| `docs/MAPA-MAESTRO-ERP-ACTUAL.md` | **Este documento** — continuidad y estado real |
| `docs/CONTINUIDAD-ARENA.md` | Manual operativo para nuevas sesiones de Arena |
| `docs/CONTRATO-INTEGRACION-ARENAS.md` | Reglas permanentes de trabajo multi-Arena |
| `docs/ESTADO-GIT-ERP.md` | Registro de estado Git (rama, HEAD, tests, build) |
| `docs/F4-PRUEBA-REAL-GEMINI.md` | §6 F4: procedimiento de validación REAL de Gemini fuera de Arena (5 casos, registro de resultados). Gemini = NO VALIDADO hasta rellenarlo |
| `docs/integracion-BLOQUE-B-2026-09-20.md` | Informe de comparación A↔B e integración selectiva del BLOQUE B (2026-09-20) |
| `docs/BLOQUE-B-FASE0-VERIFICACION.md` | Verificación pre-integración del bloque B (rama B) |
| `docs/BLOQUE-B-IMPLEMENTACION.md` | Informe de implementación del bloque B (rama B) |
| `docs/BLOQUE-B-NORMATIVA-Y-AUDITORIA.md` | Decisiones fiscales/bancarias del bloque B (fuentes y «a verificar») |
| `docs/BLOQUE_D_ACTAS.md` | BLOQUE D (rama `arena/01a0ab9d-…`, integrado 2026-09-21): auditoría final D2, modelo, correcciones críticas, pendientes externos (transporte OTP) y ajustes de integración en canónica |
| `docs/BLOQUE-C-IMPLEMENTACION.md` | BLOQUE C (rama `arena/01a0c03d-…`): qué se construyó, qué se reutilizó, etiquetas IMPLEMENTADO/PREPARADO/SIMULADO/EXTERNO/PENDIENTE |
| `docs/BLOQUE-C-VERIFICACION.md` | BLOQUE C: resultados exactos (tests, tsc, build), límites de la verificación e inventario de cambios para la auditoría de Arena A |
| `docs/BLOQUE-C-NORMATIVA.md` | BLOQUE C: fuentes legales utilizadas, qué se codificó, qué NO afirma el ERP y pendientes de verificación jurídica |
| `docs/informe-GAP2-contratos-especiales.md` | Informe completo GAP2 (Arena C) |
| `docs/informe-GAP8-factura-electronica-b2b.md` | Informe completo GAP8 (Arena C) |
| `docs/informe-auditoria-C-vs-A-2026-09-19.md` | Auditoría comparativa C→A (2026-09-19) |
| `docs/informe-auditoria-D-global-2026-09-19.md` | Auditoría global D (habitaciones/inventario) (2026-09-19) |
| `docs/auditoria/DIAGNOSTICO_FUNCIONAL_2026-09-16.md` | Diagnóstico funcional original vs main vs Arena (2026-09-16) |
| `docs/arquitectura/FASE_*.md` (14) | Arquitectura por fases 1.4–3.6 (cobros, seguridad, gastos, préstamos, recomercialización) |
| `docs/D1-REVISADA-MODELO-CUENTAS-PROPIETARIOS-GESTORES.md` | **BLOQUE F (§4)**: diseño D1 revisada APROBADO (S1–S7, 2026-09-26) — Cuenta/Propietario/Gestor/Carteras, `gestiones_cartera`, modelo contractual, reglas de no regresión y secuencia D1→mapa→implementación→D2→D3→B4 |
| `docs/FASE5-INSPECCION-PERSISTENCIA-IDENTIDAD.md` · `docs/FASE5B-DECISIONES-ARQUITECTURA-SEGURIDAD.md` · `docs/FASE7-GATE-B4-DECISIONES.md` | Inspección de identidad/permisos (F5-1), decisiones D1–D6 y gate de autorización de B4 |
| `docs/FASE2-MAPA-ORIGEN-DESTINO-RENTASYNC.md` (+ anexo JSON) · `docs/FASE3-ESTRATEGIA-MIGRACION-ARQUITECTURA-IMPORT-EXPORT.md` · `docs/FASE6-B6-EXPEDIENTE-FISCAL-EXPORT-ZIP.md` | Migración Rentasync→ERP: mapa de campos con evidencia, estrategia/pipeline de importación-exportación y motor de expediente fiscal (B6) |

---

## 12. RECONCILIACIÓN GLOBAL (ORDEN 15, 2026-09-21) — MAPA DEFINITIVO

> Auditoría de solo lectura sobre `2c47332` (HEAD = remoto, worktree limpio).
> Regresión re-ejecutada: global **638/638** (32 ficheros) · B 92 · C 82 · D 51 ·
> E 64 · batería E 73 · F1–F3 76 · F4 29 · tsc 0 · build OK. Corrección F4
> (`violaEsquema`, `asistente.ts`) presente. Cruce MAPA ↔ código: 33 secciones
> de UI, 69 bloques `match` en `firestore.rules`, 17 endpoints Express, 32
> suites. Única discrepancia código↔reglas: `valoraciones_profesionales` (§10.9,
> ya conocida). Cabecera de §6 y diagrama §8 actualizados (decían «IA prevista»).

### 12.1 Clasificación (una categoría por elemento)

**A — YA IMPLEMENTADO (funcional y probado)**
Auth+RBAC (4 perfiles, 5 roles predefinidos, `PERMISOS_SISTEMA`) · Inmuebles + habitaciones (72) ·
Captación pública/candidatos/visitas/cuestionario/solvencia/comparador ·
Contratos LAU + ciclo GAP2 (44) · Cobros · Gastos/préstamos/rentabilidad ·
Financiación GAP4 (29) · Incidencias/mantenimiento/profesionales (9) · Pólizas y
siniestros + Gmail OAuth (única integración externa E2E real) · Inventario (12) ·
Recomercialización/reformas/pricing/kit IA · Notificaciones GAP1 motor (26) +
repositorio Firestore (vía C) · Reporting GAP3 (1 suite envolviendo 40 checks) ·
Sindicación GAP5 **CERRADO** (164 + 27 identidad; §44) · Conciliación GAP6 (23) · Facturación
GAP7 motor (39) · B2B GAP8 generación (40) · Backend IA Express (16 endpoints +
asistente) · Seguridad perimetral (reglas deny-by-default) · **BLOQUE B** ·
**BLOQUE C** · **BLOQUE D** · **BLOQUE E** · **§6 F1–F4** (código cerrado).

**B — IMPLEMENTADO / VALIDACIÓN EXTERNA PENDIENTE**
| Elemento | Qué falta (fuera de Arena) |
|---|---|
| §6 F4 asistente IA | Llamada real a Gemini (`docs/F4-PRUEBA-REAL-GEMINI.md`, 5 casos) |
| Reglas Firestore/Storage B, C, D, E, §6 F3 | Publicación manual `firebase deploy --only firestore:rules,storage --project startup-sanctuary-sln7n` + `firestore.indexes.json` (6 índices de D) |
| Reglas E y F3 contra Firebase real | Emulador/entorno real (sin Java ni red en el sandbox) |
| Auth/Storage reales del Portal E | Registro por invitación y subida real a Storage en entorno real |

**C — DEPENDENCIA EXTERNA / PROVEEDOR / DECISIÓN (no hay desarrollo que hacer hasta disponer de ella)**
| Elemento | Dependencia | Punto de enganche ya existente |
|---|---|---|
| Envío real de email (GAP1 → C, B, GAP2/7/8, E) | Proveedor SMTP/Resend/SendGrid + secretos en backend | `EmailProvider` (`canales.ts`), `ENABLE_EMAIL`/`SMTP_URL`/`EMAIL_FROM` |
| WhatsApp | WhatsApp Business API | canal `WHATSAPP: null` en `server.ts` |
| OTP de firma D (SMS/email) | Proveedor de transporte | `TransporteOtpAdapter` / `TransportePendienteAdapter` (`PENDIENTE_PROVEEDOR`) |
| Firma electrónica cualificada (D, GAP2 anexos) | Proveedor de firma | `referenciaDocumental` |
| Emisión/recepción bancaria SEPA (B), camt.053 | Entidad/proveedor bancario (EBICS/API) | `sugerirConciliacion`, ficheros PAIN generados |
| Feed bancario GAP6 en tiempo real | API bancaria | importación manual de MT940/OFX/N43/CSV |
| Remisión VERI*FACTU / SII (GAP7) | Certificado AEAT + WSDL oficiales | `verifactuTransport.ts` (cola desacoplada) |
| Envío B2B SPFE/plataforma privada, EDIFACT (GAP8) | Especificación oficial / plataforma certificada / orden ministerial | `adaptadoresB2B.ts` (nunca falso envío) |
| Publicación real en portales (GAP5 — fuera del cierre funcional; no reabre el GAP) | Cuenta de agente (Kyero feed XML) o acceso operador (resto: `PENDIENTE_ACCESO_OPERADOR`) | `ADAPTADORES_PORTAL` + estado persistido en `sindicacion_inmuebles` |
| Custom claims (Storage por propietario, §10.2) | Decisión + Cloud Functions/Admin SDK fuera del cliente | `internalUser()` |
| Reparación regla `valoraciones_profesionales` (§10.9) | Orden expresa + publicación manual | — |
| PR #2 (draft) | Decisión del usuario | — |
| Parámetros fiscales B (retención), `PstlAdr` SEPA 2026, calendario B2B | Verificación normativa por el usuario | marcados «a verificar» |

**D — DESARROLLO REAL PENDIENTE** → §12.2 (fichas). Son los únicos elementos que
justifican una orden de desarrollo.

**E — DUPLICADO / ABSORBIDO (no volver a desarrollar)**
| Referencia histórica | Absorbido en |
|---|---|
| «Portal del propietario» | `PropietarioPortalSection` + espejo `morosidad_resumen_propietario` (C) + liquidaciones (B) |
| «Comunicaciones de recobro» (C) | Dispatcher GAP1 (`puenteGAP1.ts`); sin segundo canal |
| «Notificaciones al inquilino» (E §5.3) | Hilo `mensajes_portal` (decisión E: no duplicar GAP1 en el portal) |
| «Acta de llaves» de `contratoEngine` | BLOQUE D (actas completas); la de contrato queda como base histórica |
| «Inventario en entrada/salida» | D (`actaInventarioEngine`) sobre `inventarioEngine` |
| «Entrada/salida del inquilino» (E §5.3) | `actasAdapter` solo lectura en el portal |
| `feat(gap6)` de la rama D | Excluido: GAP6 canónico `58c5454` |
| Permisos `tesoreria.*` y bloque `tesoreria` de la rama E | Excluidos: B canónico |
| Repositorio Firestore de GAP1 | Implementado por C (`escritorNotificacionesGAP1`), usado por `App.tsx` |
| «Segundo motor de ayuda/tutoriales/IA» | Un solo motor §6 para ERP y Portal |
| GAP9/10/11 | Nunca creados: §6 sin numeración GAP |

**F — OBSOLETO / DESCARTADO**
| Referencia | Motivo |
|---|---|
| §5.3/§5.4 «Funcionalidades previstas» de E | Texto de planificación previo a la integración; E está implementado (se conserva como histórico) |
| «Programador de detección» de C | La detección es determinista bajo demanda desde `registroCobros`; no existe cron en Vercel (`vercel.json` sin `crons`) y no hay decisión de crearlo → no es GAP |
| «Emulator de reglas» de C | Imposible en sandbox; equivale a B (publicación/validación externa) |
| Línea paralela `main` (circuito de candidato `candidateCircuitEngine`, 4 ficheros) | Fuera de la canónica por decisión (§9); portarla exigiría orden expresa; **no** es GAP vigente |
| `documentsStore` en memoria (§10.1) | Residual P2 preexistente al funnel público; no bloquea ningún bloque; se mantiene como deuda, no como GAP |
| Script `test` en `package.json`, chunk >500 kB, rate-limit `/api/*` | Deuda de tooling/hardening, no funcionalidad |

### 12.2 GAPs de desarrollo REAL (fichas)

Solo hay **cuatro** pendientes que requieren código. Ninguno es un bloque nuevo:
son cierres de circuitos ya existentes.

**GAP-R1 — Persistencia Firestore de la conciliación bancaria (GAP6)** — **CERRADO / INTEGRADO (2026-09-21)**
- Objetivo: que movimientos, propuestas e importaciones sobrevivan a la sesión.
- Desarrollo: **Arena B**, commit `415de41` (`feat(gap-r1): persistencia Firestore del estado de conciliación bancaria (GAP 6)`, rama `arena/01a0bfd3-gestor-de-inmuebles-vercel`). Integración: **Arena A**, commit `a18967f` (`merge(gap-r1)`, cherry-pick selectivo, 0 conflictos, diff idéntico al origen).
- Entregado: `src/lib/conciliacionFirestore.ts` (carga por propietario, guardado de importación en lote, actualización de propuesta; ids deterministas; validadores de forma) sobre las colecciones **ya reguladas** `movimientos_bancarios` / `conciliaciones_bancarias` / `importaciones_bancarias`; `ConciliacionBancariaSection.tsx` carga el estado persistido al montar (fusión sin duplicados), persiste cada importación y cada cambio de propuesta, y muestra banner de error; `conciliacionSession.ts` (espejo para B) se conserva. Sin cambios en `src/utils/conciliacion/*`, `cobrosEngine`, reglas ni índices.
- Validación canónica tras `a18967f`: R1 **15/15** (`tests/conciliacion-persistencia.test.ts`, Firestore mockeado) · suite **850/850** · `tsc` 0 · build OK · GAP6 23/23 intacto.
- **Cierre de GAP-R1 (2026-09-23, solo tests + documentación; origen Arena B `3d18b10`, integración selectiva en la canónica sin tocar código funcional ni reglas §24):**
  - *Arquitectura de persistencia:* motor canónico intacto (importar → proponer → confirmar → aplicar; sin segundo motor). `conciliacionFirestore.ts`: carga acotada por propietario (one-shot al montar), guardado en batch atómico idempotente, transiciones con `merge`; la sección fusiona lo persistido con lo local sin duplicados (modelo append-only) y persiste importación + transiciones de propuesta con banner de carga/error. `conciliacionSession.ts` es caché derivado para la evidencia de pago de Tesorería (B), no fuente de verdad. `ResumenConciliacion` se recalcula (`calcularResumenConciliacion`), no se almacena. Cero localStorage/sessionStorage en el circuito.
  - *Colecciones (existentes, reutilizadas; reglas §24 sin cambios):* `movimientos_bancarios`, `conciliaciones_bancarias`, `importaciones_bancarias`. DocIds namespaced y saneados `${propietarioId}_${idDeterminista}` (`hashIdempotencia` no incluye propietario). Sin índices compuestos (3 igualdades mono-campo + orden en cliente).
  - *Aislamiento por propietario:* las 3 consultas filtran `where('propietarioId','==', pid)` (única condición demostrable para `list`); `propietarioId` sellado en escritura (un documento con propietario falsificado se neutraliza al guardar); guard client-side anti-demo (`prop_demo` nunca toca Firestore).
  - *Invariantes de seguridad §24 (fijados por test estático, mismo patrón que BLOQUE C):* las 3 colecciones existen antes del catch-all; `delete` solo master; `create` exige `incoming().propietarioId == myPropId()`; `update` exige propietario inmutable (`existing == incoming == myPropId`); sin accesos genéricos `isSignedIn()`; todo `allow` pasa por `isMasterAdmin()` o `isPropietarioRole()` (profesional/inquilino/anónimo sin vía); `sinSecretosBancarios()` en las 3. Control negativo §14: los invariantes fallan ante un bloque relajado.
  - *Tests:* `tests/conciliacion-persistencia.test.ts` **27/27** = 15 base (roundtrip, aislamiento A/B, inválidos, idempotencia, merge, guardas) + 12 de cierre (registro/verificación de las 3 queries filtradas, recuperar-tras-actualizar, antifalsificación, extractor de bloque + 8 invariantes §24 + control negativo).
  - *Limitaciones conocidas:* carga **one-shot** al montar (sin live-sync entre pestañas/dispositivos; cada dispositivo recupera al abrir); validación de reglas contra Firebase real/emulador pendiente (§12.6 pendiente 1); defecto **D2** (matching de gastos no puntúa fecha por `g.fecha` vs `fechaDevengo`) afecta a la puntuación, no a la persistencia — fuera del alcance de R1.
  - *NO modificar accidentalmente:* el sellado de `propietarioId` en escritura; el esquema de docIds namespaced (cambiarlo rompería la idempotencia); las reglas §24 (los invariantes estáticos fallan si se relajan).
- Nota: el hallazgo **D2** (§12.2 GAP-R4) sigue sin corregir; el matching de gastos persistido no puntúa fecha (comportamiento documentado, no regresión de R1).
- Arena: **B** → integrado por **A**. Prioridad original: 1. **Estado: CERRADO.**

**GAP-R2 — Adjuntos de evidencias de morosidad en Storage (C)** — **CERRADO / INTEGRADO (2026-09-21)**
- Objetivo: subir el comprobante real (burofax, justificante) en vez de solo metadatos.
- Desarrollo: **Arena B**, commit `58a495a` (`feat(gap-r2): persistencia storage de evidencias de morosidad`). Integración: **Arena A**, commit `92c8185` (`merge(gap-r2)`, cherry-pick selectivo, 0 conflictos, diff idéntico al origen).
- Entregado: `src/lib/morosidadEvidenciasStorage.ts` (ruta `morosidad_evidencias/{propietarioId}/{expedienteId}/…`, validación cliente PDF/JPEG/PNG/WEBP < 10 MB, `uploadBytes` + `getDownloadURL`, sin base64 ni localStorage); `MorosidadDetalleModal.tsx` adjunta el fichero y registra el metadato vía `crearEvidencia` del motor C (motor intacto); `storage.rules` +20 líneas: bloque `morosidad_evidencias` (lectura/creación solo master-admin con `esEvidenciaValida()`, sin update/delete, deny-by-default). `firestore.rules` e índices sin cambios.
- Validación canónica tras `92c8185`: R2 **20/20** (`tests/morosidad-evidencias-storage.test.ts`, Storage mockeado) · suite **870/870** · `tsc` 0 · build OK · C 82 + morosidad vitest intactos.
- **Anotación expresa:** la implementación de Storage está integrada en el repositorio; las reglas de `storage.rules` **todavía no están desplegadas en Firebase**; la validación contra Firebase real/emulador **queda pendiente** (§12.6).
- Arena: **B** (en lugar de C, por asignación del usuario) → integrado por **A**. Prioridad original: 3. **Estado: CERRADO.**

**GAP-R3 — Cierre de la ficha pública de inmueble (residual P1 §10.3)** — **CERRADO / INTEGRADO (2026-09-21)**
- Objetivo: que `inmuebles` con `allow read: if true` no exponga campos fiscales/IBAN al funnel público.
- Decisión de diseño aplicada: **documento público derivado** (espejo mínimo `fichas_publicas_inmueble`, un documento por inmueble con id = inmuebleId y lista blanca cerrada de claves), no reglas por campo.
- Desarrollo: **Arena B**, commit `8534b43` (`feat(gap-r3): seguridad ficha publica de inmueble`). Integración: **Arena A**, commit `5e47fc2` (`merge(gap-r3)`, cherry-pick selectivo; auto-merge limpio en `firestore.rules` y `App.tsx` por offsets de §6/E, hunks idénticos al origen; 0 conflictos).
- Entregado: `firestore.rules` §1 `inmuebles` → **se endureció el acceso público**: `get` solo staff o inquilino vinculado, `list` solo staff, escrituras sin cambios; nueva colección **`fichas_publicas_inmueble`** (`get` público por id, `list` autenticado —sin enumeración anónima—, escritura master/propietario titular con `clavesFichaPublicaOk()`); `storage.rules`: catálogo `inmuebles/{id}/{fichero}` sigue público solo en el primer nivel y **`inmuebles/{id}/inventario/**` pasa a interno**; `src/lib/fichaPublicaInmueble.ts` (construcción del espejo, campos públicos/privados, get por id y por token, adaptador de vista); `src/lib/firebase.ts` mantiene el espejo al guardar/borrar inmueble (mejor esfuerzo); `src/App.tsx`: la suscripción completa de `inmuebles` solo en el flujo autenticado; visita, solicitud y cuestionario anónimos resuelven exclusivamente la ficha pública. Índices sin cambios.
- Validación canónica tras `5e47fc2`: R3 **29/29** (`tests/ficha-publica-inmueble.test.ts`) · R1 15/15 · R2 20/20 · suite **899/899** (38 ficheros) · `tsc` 0 · build OK · R4, C, D, E, §6 intactos.
- **Anotaciones expresas:** las reglas nuevas (Firestore y Storage) **todavía no están desplegadas en Firebase**; la validación contra Firebase real/emulador **queda pendiente**; **no existe backfill automático** de las fichas públicas: las de los inmuebles existentes se materializan al volver a guardar cada inmueble (`saveInmuebleFirestore`), salvo que posteriormente se ordene implementar un backfill controlado (§12.6, pendiente 3).
- Arena: **B** (en lugar de A, por asignación del usuario) → integrado por **A**. Prioridad original: 2. **Estado: CERRADO.**

**GAP-R4 — Cobertura de tests de los motores base (cobros/fiscal/gastos) y GAP3 (§10.6)** — **CERRADO (ORDEN 16, 2026-09-21)**
- Objetivo: suites propias para `cobrosEngine` (interfaz económica central de B, C, GAP6, E), `fiscalEngine`, `gastosEngine` y desglose de la suite GAP3 (antes 1 test que envolvía 40 checks).
- Entregado (solo tests, producción intacta): `src/utils/cobrosEngine.test.ts` **69** · `src/utils/fiscalEngine.test.ts` **43** · `src/utils/gastosEngine.test.ts` **45** · `tests/informesEngine.test.ts` **41** (40 comprobaciones individuales + recuento). Global **835/835** (35 ficheros) = 638 + 197. Deterministas (reloj congelado 2026-09-21 con `vi.setSystemTime`, sin red/Firebase/Gemini/localStorage), estables en UTC y Europe/Madrid.
- Cobertura por motor: cobros (calendario, generación/idempotencia de periodos, transición PENDIENTE→RETRASADO y gracia, avisos y orden, `registrarPagoPeriodo`/incidencias con trazabilidad e inmutabilidad, resumen e invariantes, resumen fiscal por inmueble, circuito habitaciones/ids cruzados); fiscal (prioridad de deducibilidad `esDeducible`→`tipoDeducible`→categoría, ocupación y periodos sin alquiler, ingresos/gastos por ejercicio con todos los estados, documentación, resumen anual e histórico, RBAC propietario, consistencia); gastos (catálogo e invariantes, `crearGasto`/`normalizarGasto`, agregados explotación/financiación/caja, recurrentes con backfill 12 meses e idempotencia, puente OT→gasto con elegibilidad/idempotencia/sincronización).
- **Hallazgos clasificados D (defecto real) — NO corregidos en O16, requieren orden independiente**:
  - **D1 — Deducibilidad divergente entre `gastosEngine` y `fiscalEngine`.** `esGastoDeducible()` (`fiscalEngine.ts` l.145) ignora el campo operativo `deducible` (el que rellenan `GastoModal`, `crearGasto`, recurrentes y OT) y su lista de categorías no incluye `IBI`, `SEGURO_HOGAR`, `ADMINISTRACION`, `OTRO_EXPLOTACION` del catálogo de `gastosEngine`. Observado: IBI 300 € creado por el ERP → `totalNoDeducible=300`; COMUNIDAD marcada `deducible=false` por el usuario → deducible en fiscal. Impacto: `FiscalidadSection`, `resultadoNetoOperativo`, exportación fiscal GAP3. No bloquea GAP-R1. Norma fiscal aplicable = a verificar externamente; la corrección de coherencia es de código.
  - **D2 — Reporting GAP3 y matching GAP6 filtran gastos por `g.fecha`, campo que el ERP no rellena.** `reportingEngine.ts` (cartera l.223, evolución l.409/448/476, inmueble l.610, rentabilidad l.732, fiscal l.774, exportación l.927/936) y `conciliacion/matchingEngine.ts` l.254 leen `gasto.fecha`; `crearGasto`/`normalizarGasto`/`GastoModal` solo escriben `fechaDevengo`/`fechaPago`. Observado: gasto real de 120 € → `informeCartera.economia.gastosTotales=0`, exportación fiscal 0 ítems GASTO, candidato GAP6 con «Fecha fuera ventana 999d». Impacto: informes y exportación omiten todos los gastos del ERP; puntuación de fecha nula en conciliación de gastos. **Afecta a GAP-R1 (Arena B debe conocerlo; no lo bloquea, pero el matching de gastos no puntúa fecha hasta corregirse).** `fiscalEngine` no está afectado (usa `fechaDevengo`).
  - **D3 — Rangos de fechas de GAP3 dependen de la zona horaria.** `formatFechaISO()` usa `toISOString()` sobre fechas locales (`reportingEngine.ts` l.56–99): con `TZ=Europe/Madrid`, `crearRangoAnual(2026)` = `2025-12-31..2026-12-30` y `crearRangoMensual(2024,2)` = `2024-01-31..2024-02-28`; los 4 checks «Fechas» del runner GAP3 fallan bajo esa TZ (pasan en UTC, que es donde corre la regresión). Mismo patrón en `fiscalEngine.calcularPeriodosSinAlquiler` (`toISOString().split('T')`), que en Madrid devuelve `inicio: 2025-12-31` para un hueco que empieza el 1 de enero. Impacto: informes con un día de desplazamiento en producción (navegador en Madrid). No bloquea GAP-R1.
- Riesgos: duplicación NULA; regresión NULA. Arena: **A**. Prioridad original: 4. **Estado: CERRADO.**

### 12.3 Matriz GAP → Arena y dependencias

| GAP | Arena | Depende de | Bloquea a | Requiere publicación de reglas |
|---|---|---|---|---|
| GAP-R4 tests base | A | — | GAP-R1 (recomendado, no obligatorio) — **CERRADO O16** | No |
| GAP-R1 persistencia GAP6 | B → A | — | Uso real de la evidencia de pago de B | No (reglas ya existían) — **CERRADO / INTEGRADO `a18967f`** |
| GAP-R3 ficha pública | B → A | Decisión de diseño (documento público derivado) | — | Sí (**pendiente de publicar**) — **CERRADO / INTEGRADO `5e47fc2`** |
| GAP-R2 adjuntos morosidad | B → A | — | — | Sí (`storage.rules`, **pendiente de publicar**) — **CERRADO / INTEGRADO `92c8185`** |

Sin dependencias cruzadas entre R1, R2 y R3: se desarrollaron en la rama de Arena B
(`415de41` → `58a495a` → `8534b43`) y **Arena A los integró** uno a uno por cherry-pick selectivo
(`a18967f` → `92c8185` → `5e47fc2`). Los cuatro GAPs R1–R4 están **CERRADOS**.

### 12.4 Orden técnico de ejecución

| Fase | GAP | Arena | Dependencia previa | Resultado esperado |
|---|---|---|---|---|
| **0** (externo, sin Arena) | Publicación de reglas B/C/D/E/F3 + índices; prueba real Gemini F4 | Usuario | — | Reglas e IA validadas en Firebase/Gemini reales; registro en `F4-PRUEBA-REAL-GEMINI.md` |
| **1** | GAP-R4 | A | — | **HECHO (O16)**: suites `cobrosEngine` 69 / `fiscalEngine` 43 / `gastosEngine` 45 / GAP3 41; global 835 (solo tests). Hallazgos D1–D3 pendientes de orden |
| **2** | GAP-R1 | B (rama propia) → integra A | Fase 1 recomendada | **HECHO**: B `415de41` → A `a18967f`; conciliación persistida; GAP6 23 + 15 tests; sin segundo motor; suite 850 |
| **3** | GAP-R3 | B (rama propia) → integra A | Decisión de diseño documentada | **HECHO**: B `8534b43` → A `5e47fc2`; espejo `fichas_publicas_inmueble`; 29 tests; suite 899. Reglas **pendientes de publicar**; backfill de fichas **pendiente de decisión** |
| **4** | GAP-R2 | B (rama propia) → integra A | — | **HECHO**: B `58a495a` → A `92c8185`; evidencias con archivo en Storage; 20 tests; C 82 verde; suite 870. `storage.rules` **pendiente de publicar** |
| **5** | Integración global (§7 «Después») | A | Fases 1–4 (**hechas**) + Fase 0 (**pendiente**) | E2E, UX, endurecimiento (rate-limit, `documentsStore`, script `test`) |

Cuando llegue un proveedor (email, OTP, SEPA, AEAT, portales) se abre la orden
correspondiente de la categoría C sobre el punto de enganche indicado; hasta
entonces **no hay desarrollo que hacer**.

### 12.5 Qué NO debe tocarse
`src/tesoreria/*`, `lib/tesoreriaFirestore.ts`, reglas §26–31 (B) · `src/utils/morosidad/*`,
§32–37 (C) · `src/utils/actas/*`, `lib/firebaseActas.ts`, §38 (D) · `src/inquilino/*`,
`portal-inquilino/*`, §39–42, E.0–E.4 (E) · `src/experiencia/*`, `components/experiencia/*`,
`usuarios_auth/{uid}/progreso_tutoriales` (§6) · `cobrosEngine.registrarPagoPeriodo` como
única escritura de cobros · cadena de huellas GAP7 · identidad determinista GAP8 ·
dispatcher GAP1 (un solo dispatcher) · configuración Gemini de `server.ts` · deny-by-default.

### 12.6 Pendientes técnicos reales tras R1 + R2 + R3 (2026-09-21)

Estado de los bloques: **R1 cerrado** · **R2 cerrado** · **R3 cerrado** · **R4 cerrado** (O16) ·
BLOQUE C integrado · BLOQUE D integrado · BLOQUE E reconciliado e integrado · §6 integrado.
Ningún GAP cerrado se reabre. Los únicos pendientes técnicos que existen realmente son:

**PENDIENTE 1 — Validación Firebase real.** R2 y R3 (y R1) están validados mediante tests con
Firestore/Storage mockeados, inspección estructural de las reglas, `tsc` y build; **no** se ha
ejecutado validación contra Firebase real ni emulador (el sandbox no dispone de red hacia
Firebase, credenciales ni emulador). Estado: **PENDIENTE — NO BLOQUEA LA INTEGRACIÓN DE CÓDIGO,
SÍ EL CIERRE OPERATIVO DEL DESPLIEGUE.**

**PENDIENTE 2 — Despliegue de reglas.** Las modificaciones de `firestore.rules` (R3: §1 `inmuebles`
endurecido + `fichas_publicas_inmueble`) y `storage.rules` (R2: `morosidad_evidencias`; R3:
`inmuebles/{id}/inventario/**` interno) están **únicamente en el repositorio**; **no están
publicadas en Firebase**. Publicación manual por el usuario con Firebase CLI (nunca desde el
sandbox; ver §10.8 y O12b).

**PENDIENTE 3 — Materialización de fichas públicas existentes.** R3 **no incluye backfill
automático**. Antes de activar las nuevas reglas en producción hay que resolver de forma
controlada la creación de `fichas_publicas_inmueble` para los inmuebles ya existentes: hasta
entonces cada ficha solo se crea al volver a guardar su inmueble. No implementado; pendiente
de una orden específica.

Trazabilidad Git (ver `docs/ESTADO-GIT-ERP.md`): R1 `415de41` → `a18967f` · R2 `58a495a` →
`92c8185` · R3 `8534b43` → `5e47fc2` (HEAD canónico).

### 12.7 Cierre de GAP 5 en la canónica (2026-09-23)

- **Origen:** snapshot preservado por Arena C, commit `14dac266` («chore(sindicacion): preserva
  snapshot completo para integracion»). **No** se hizo merge de C: se integró el delta cerrado por
  inventario (14 ficheros nuevos byte a byte, `firestore.rules` fusión selectiva, panel de 604 l.).
- **Ficheros nuevos (14):** `src/sindicacion/{index,estadoRepositorio,adaptadores,validacion,hashContenido,idempotencia}.ts`,
  `src/lib/sindicacionFirestore.ts`, `tests/sindicacion-{nucleo-fase1,estado-persistencia,panel-conexion,reglas-firestore}.test.ts`,
  `tests/harness/firestoreRulesEval.ts`, `tests/fase14-espejo-identidad.test.ts`, `scripts/mutaciones-sindicacion.py`.
- **Reglas:** helper `sinSecretosSindicacion()` + bloque `match /sindicacion_inmuebles/{docId}` como
  **§44**, antes de la denegación global; +126 líneas, 0 eliminadas; BLOQUE D (§38–42), §43, identidad,
  `usuarios_auth`/§6 F3 y `storage.rules` intactos. Publicación en Firebase: PENDIENTE (canal manual, §12.6).
- **Adaptaciones a la arquitectura de A (solo material heredado de C):** harness respeta `match`
  anidados; `fase14` D.6 admite consumidores de la subcolección §6 F3 sin debilitar el control del
  espejo; §44 usa `x.matches('…')`; M66 reanclada a §44/catch-all; R.16 comprueba la forma método.
- **NO portado (A prevalece):** `authService.ts`, `types.ts`, `lib/firebase.ts`, `App.tsx`,
  `server.ts`, `storage.rules`, `package.json`, `package-lock.json`.
- **Resultado en A:** GAP 5 164/164 · identidad 27/27 · suite 1286/1286 (52 ficheros) · mutaciones
  82/82 · `tsc` 0 · build OK. **GAP 5 CERRADO; no se reabre.** La conexión efectiva con
  portales/APIs de terceros es una integración externa independiente (categoría C de §12.1).
