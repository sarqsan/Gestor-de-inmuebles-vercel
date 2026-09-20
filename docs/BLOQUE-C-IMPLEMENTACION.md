# BLOQUE C — Implementación: Morosidad avanzada, recobro y expediente legal

Fecha: 2026-09-20 · Rama de desarrollo: `arena/01a0c03d-gestor-de-inmuebles-vercel`
BASE sobre la que se trabajó: `5ff8448301ba2e49f4418f9a66d66ec2ff5eb15f`
("feat(tesoreria): integrar bloque B en ERP canonico")

> **Estado de integración: NO integrado en el ERP canónico.** Este bloque está desarrollado,
> verificado y versionado **en esta rama**. La selección, merge e integración final en `main`
> corresponde a **Arena A**. Nada de este documento afirma integración ya realizada.

Etiquetas usadas en todo el bloque:
**IMPLEMENTADO** (código + tests, funciona en la app) · **PREPARADO** (el ERP deja el dossier/documento
listo y trazable, sin afirmar entrega) · **SIMULADO** (doble de test explícito, nunca producción) ·
**EXTERNO** (dependencia externa: no se finge) · **PENDIENTE** (deliberadamente no hecho).

---

## 1. Qué se ha construido (nuevo, aditivo)

| Fichero | Líneas | Contenido |
|---|---:|---|
| `src/types/morosidad.ts` | 818 | Dominio completo del bloque: `ClasificacionDeuda`, `PiezaDeuda`, `EstadoExpediente` (+labels y `ESTADOS_TERMINALES_EXPEDIENTE`), `MotivoTransicion`, `TransicionExpediente`, `PoliticaMorosidad`/`PasoPoliticaMorosidad`/`CriterioEscalado`, `PasoPlanRecobro`, `ComunicacionExpediente`, `EvidenciaMorosidad` + `CLAVES_PROHIBIDAS_EVIDENCIA`, `CompromisoPago`/`CuotaCompromiso`, `ExpedienteAseguradora`, `ExpedienteJuridico` + `EstadoRequisitoProcedibilidad`, `ModuloImporteJuridico`/`ParametrosIntereses`, `ExpedienteMorosidad`, `ResumenMorosidadPropietario` |
| `src/utils/morosidad/morosidadEstados.ts` | 305 | **Máquina de estados**: `TRANSICIONES_MOROSIDAD` (10 estados), `transicionPermitida`, `validarTransicion` (bloqueos con código), `construirTransicion`/`idTransicion` (append-only, determinista, con sufijo de importes/evidencia), `describirEstado`, `ACCIONES_POR_ESTADO` |
| `src/utils/morosidad/dunningPolicy.ts` | 486 | **Política de recobro configurable**: `PASOS_POLITICA_DEFECTO` (PRE-5, D+0, D+3, D+10, D+20, D+30), plantillas por paso, `validarPolitica`, `versionarPolitica`, `generarPlanRecobro`, `proximasAcciones`, `evaluarEscalado` (bloqueos de procedencia) |
| `src/utils/morosidad/morosidadEngine.ts` | 964 | **Motor**: `clasificarCobro`, `construirPiezaDeuda`, `detectarDeudasContrato`, `construirExpediente`, `sincronizarExpediente` (nunca borra deuda huérfana: la marca), `aplicarTransicionEnExpediente`, `crearEvidencia` (saneado anti-secretos), `registrarComunicacionExterna`, `tieneRequerimientoFehaciente`, `resumenMorosidad`, `construirResumenPropietario`/`recortarResumenPropietario` (lista blanca de 20 campos), `resolverPolitica`, `calcularProximaAccion` |
| `src/utils/morosidad/compromisos.ts` | 387 | **Compromisos de pago**: `crearCompromiso`, `validarPlanCuotas`, `construirCuotas` (plana + última absorbe redondeo), `aplicarCobrosAlCompromiso` (cubre **solo** con cobros reales, remanente por cobro), `revisarVencimientos`, `progresoCompromiso`, `compromisoAutorizaCierre` |
| `src/utils/morosidad/legalAmounts.ts` | 479 | **Intereses/gastos/conceptos**: `calcularInteresesSimples`, `validarFuenteNormativa`, `validarParametrosIntereses`, `construirConceptoIntereses/Gastos`, `totalConceptosJuridicos` (estimado vs verificado), `abrirExpedienteAseguradora`, `prepararExpedienteJuridico`, `registrarProcedimientoJudicial` |
| `src/utils/morosidad/eventos.ts` | 211 | Eventos de recobro y mapeo a plantillas GAP 1 (`TIPO_EVENTO_MOROSIDAD`, `EVENTO_POR_PASO`, `construirEventoMorosidad`, `datosPlantillaGAP1`, `estadoComunicacionDesdeDispatch`) |
| `src/utils/morosidad/puenteGAP1.ts` | 324 | **Único canal de comunicación**: `eventoMorosidadAEventoNotificacion`, `claveIdempotenciaMorosidad`, `repositorioNotificacionesFirestore`, `repositorioNotificacionesMemoria` (doble de tests), `contextoAutorizacionDesdeUsuario`, `despacharEventoMorosidadPorGAP1` |
| `src/utils/morosidad/morosidadStore.ts` | 1060 | **Casos de uso** (capa que llama la UI): `RepositorioMorosidad` (inyectable), `detectarYGestionar`, `cambiarEstado`, `registrarComunicacion`, `registrarPago`, `registrarCompromiso`, `escalar`, `recalcularConceptosJuridicos`, `revisarCompromisosVigentes`, auditoría e histórico. **PREPARADO**: `listarLiquidacionesPorCobros` (enlazado en el repositorio, aún sin consumo en la UI) |
| `src/lib/morosidadFirestore.ts` | 291 | Persistencia: subscripciones role-scoped, `saveExpedienteMorosidadFirestore` (+ espejo `morosidad_resumen_propietario`), `appendHistorial/Evidencia` (`merge:false`), `saveCompromiso/Politica`, `deleteExpedienteMorosidadFirestore` (sin uso ordinario), `escritorNotificacionesGAP1`, `crearRepositorioMorosidadFirestore` |
| `src/components/sections/MorosidadSection.tsx` | 708 | UI de administración: cartera, KPIs, filtros, editor de política y versionado |
| `src/components/modals/MorosidadDetalleModal.tsx` | 821 | Detalle del expediente: 8 paneles y **7 formularios** (comunicación, compromiso, pago vía cobros, escalado aseguradora, derivación jurídica, conceptos jurídicos, cambio de estado/cierre), todos a través de los casos de uso |
| `src/utils/morosidad/*.test.ts` | 2.275 | 4 suites y **79 pruebas** (ver `BLOQUE-C-VERIFICACION.md`) |
| `scripts/test-bloque-c.ts` | — | Batería de cierre: **runner/reporter** de las 4 suites reales (`npm run test:bloque-c`); no reimplementa aserciones ni lógica de negocio |

## 2. Qué se ha reutilizado (motores ajenos intactos)

- **`cobrosEngine`** — única vía de pago: `registrarPago` del store delega en
  `registrarPagoPeriodo` y después re-sincroniza el expediente. **Ningún** motor de cobros,
  tesorería o contratos del BLOQUE B ha sido modificado (`git diff` no toca `src/tesoreria/**`
  ni `src/utils/cobrosEngine.ts`).
- **`contratos_formalizacion.registroCobros`** — única fuente de importes. El BLOQUE C **no**
  duplica ni reescribe importes: el `saldoPendiente` es derivado.
- **GAP 1 (`src/notificaciones/*`)** — dispatcher, plantillas, canales, autorización y
  `idempotenciaDeEvento` canónicos. Se **rellena el hueco** que GAP 1 dejó sin implementación
  persistente (`RepositorioNotificaciones` en Firestore) y se añaden 10 plantillas
  `morosidad.*` + el origen `'MOROSIDAD'`. No se crea un segundo sistema de notificaciones.
- **RBAC, `audit_logs` y `sanitizeObjectForFirestore`** canónicos; `profesionales` como
  referencia de letrado (sin segundo alta de profesionales).
- **Reglas de `notificaciones` (§22)** — reutilizadas tal cual; el BLOQUE C **no** las re-regula.

## 3. Qué se ha extendido (mínimo y aditivo)

- `src/types.ts`: `SectionType += 'morosidad'`.
- `src/types/notificaciones.ts`: `OrigenNotificacion += 'MOROSIDAD'`.
- `src/notificaciones/plantillas.ts`: 10 plantillas `morosidad.*` (recordatorio inicial,
  requerimiento de pago, requerimiento fehaciente, pago parcial, compromiso alcanzado/incumplido,
  escalado aseguradora/jurídico, cierre por pago, registro de pagos).
- `src/App.tsx` (+140 l.): estado, subscripciones por rol, memos de contexto/alcance, guardado de
  política, badge y render de la sección restringido a `ADMINISTRADOR`.
- `src/components/Sidebar.tsx` / `MobileNav.tsx`: entrada "Morosidad y Recobro" con badge.
- `src/components/sections/PropietarioPortalSection.tsx` (+118 l.): sub-pestaña `morosidad`
  **de solo lectura** alimentada por el espejo recortado.
- `firestore.rules` (+150 l.): helper `sinSecretosMorosidad()` y secciones §32–§37 (ver §5).

## 4. Decisiones de diseño (las que importan para auditar)

1. **Un solo origen de verdad económico.** El expediente referencia `cobroId`/`contratoId`; no
   copia importes como fuente. Un cambio de estado manual **no puede** hacer desaparecer una deuda:
   cerrar con saldo exige confirmación + motivo habilitante y queda `cerrado_con_saldo_pendiente_registrado`.
2. **Nunca se reescribe la historia.** `TransicionExpediente` es append-only; cambiar la política de
   recobro versiona (`versionarPolitica`) y avisa `dias_gracia_cambiados_no_reescriben_plan_existente`.
3. **Plazos configurables, no legales.** D+3/D+10/D+20/D+30 son offsets de negocio
   (`fechaObjetivo = vencimiento + diasOffset + diasGracia`). El ERP no afirma que sean plazos legales.
4. **Comunicaciones: espejo + emisión por GAP 1.** `registrarComunicacion` emite **solo** si el medio
   es `EMAIL`/`INAPP` y existe dispatcher, adoptando el documento espejo (mismo `id` derivado de la
   clave canónica ⇒ repetir no duplica). Medios de tercero (`BUROFAX`, `CARTA_CERTIFICADA`,
   `NOTARIAL`, `CERTIFICADO_DIGITAL`, `LLAMADA`) ⇒ `REGISTRADA_MANUALMENTE`, `externa:true`,
   **sin** `fechaEnvio` y con `requiereEvidencia:true`.
5. **Honestidad del transporte.** Sin proveedor SMTP/Resend configurado el dispatcher safe-mode
   devuelve `ok:false` + `email_no_configurado`; la comunicación queda `PENDIENTE_ENVIO` y el
   documento `FALLIDA`, **nunca `ENVIADA`**. `INAPP` sí puede constar `ENVIADA` porque la bandeja
   interna es un canal real del producto. Si no hay email ni `usuarioId` de bandeja, el puente
   **no invoca el transporte**: devuelve `PREPARADA` + `destinatario_sin_contacto`.
6. **Doble gate de la vía jurídica.** Filtro de política (`masc_actividad_negociadora_previa_no_declarada`)
   + validación de transición (`juridica_requiere_actividad_negociadora_previa_LO1_2025`).
   `forzar:true` solo omite el filtro de política; el requisito de procedibilidad sigue siendo obligatorio.
   La declaración de MASC/imposibilidad se valida contra el **expediente prospectivo** (se puede
   declarar en la misma acción).
7. **Compromisos sin dinero inventado.** Las cuotas solo se cubren con cobros `RECIBIDO`/`VERIFICADO`
   con `importeRecibido > 0`; `compromisoAutorizaCierre` exige `CUMPLIDO`/`CANCELADO` **y** saldo real 0.
   El incumplimiento transiciona el expediente, escribe histórico, auditoría y emite `compromiso.incumplido`.
8. **Intereses sin tipo inventado.** Solo interés simple, base `SOLO_CAPITAL` (el resto →
   `anatocismo_no_admitido`), sin `tipoAnualPct` + fuente normativa verificable el concepto queda
   `NO_CONFIGURADO`/`ESTIMADO` y no es presentable como definitivo.
9. **Mínimo privilegio en el portal del propietario.** El propietario no lee expedientes,
   comunicaciones internas, evidencias, aseguradora, jurídico ni política: solo el espejo
   `morosidad_resumen_propietario` recortado con lista blanca (`CAMPOS_RESUMEN_PROPIETARIO`, 20 campos)
   y `estadoVisible ∈ {DEUDA_ABIERTA, EN_GESTION, COMPROMISO_ACTIVO, PAGO_PARCIAL, EN_TRAMITE_EXTERNO, SALDADA, EN_REVISION}`.
10. **No se han creado roles nuevos** ni se almacenan secretos o datos innecesarios.
11. **Idempotencia por tramo.** La entidad del evento es `{expedienteId}#{cobroId}`, así dos
    mensualidades no colisionan y el reintento del mismo tramo sí es inocuo. Resuelto **en C**,
    sin tocar el núcleo de GAP 1.
12. **Prescripción como aviso, no como decisión.** Se informan días desde el vencimiento y la
    existencia de reclamación previa registrada; **no** hay reporte automático a ficheros de morosidad.

## 5. Firestore: colecciones y reglas nuevas (§32–§37)

| # | Colección | Reglas |
|---|---|---|
| §32 | `expedientes_morosidad` | get/list solo `isMasterAdmin()`; create con `isValidId`, `incoming().id == expedienteId`, `propietarioId`/`contratoId` no vacíos y `sinSecretosMorosidad()`; update ancla `id`+`propietarioId`+`contratoId`; **`allow delete: if false`** |
| §33 | `expedientes_morosidad_hist` | append-only: create con id/`propietarioId`/`expedienteId` verificados; **`allow update, delete: if false`** |
| §34 | `evidencias_morosidad` | create con id + `propietarioId` + anti-secretos; update solo corrige contenido anclando `id`/`expedienteId`/`propietarioId`/`tipo`; `delete: if false` |
| §35 | `compromisos_morosidad` | propietario: `get`/`list` **solo** con `resource.data.propietarioId == myPropId()`; escritura solo admin; `delete: if false` |
| §36 | `politicas_morosidad` | solo admin, anti-secretos, `delete: if false` (el versionado preserva la historia) |
| §37 | `morosidad_resumen_propietario` | espejo: admin escribe, propietario lee solo el suyo; update ancla `id`+`propietarioId` y pasa `sinSecretosMorosidad()`; `delete: if false` |

- Helper `sinSecretosMorosidad()` (reglas, l. 63-76) rechaza documentos con `credentials`, `apiKey`,
  `accessToken`, `refreshToken`, `privateKey`, `password`, `secret`, `token`, `base64Data`, `adjuntoBase64`.
- `CLAVES_PROHIBIDAS_EVIDENCIA` (capa de datos) incluye además `contraseña`, `access_token`,
  `certificado`, `firmaDigitalPin`, `ibanSecreto`, `cvv`, `pin`, `otp`, `base64Data`, `adjuntoBase64`.
- **`notificaciones` no se re-regula** (sigue rigiendo §22 de GAP 1); el catch-all
  `match /{document=**} { allow read, write: if false; }` continúa siendo el último bloque.
- Las evidencias guardan **referencia** de fichero (`storagePath`, `nombreArchivo`, `tipoMime`,
  `tamanoBytes`): la subida de adjuntos a Storage es **PENDIENTE** y el binario nunca entra en el documento.

## 6. Trazabilidad, auditoría e idempotencia

- **Auditoría** en `audit_logs` canónico: `MOROSIDAD_EXPEDIENTE_ABIERTO`, `_EXPEDIENTE_SINCRONIZADO`,
  `_ESTADO_CAMBIADO`, `_COMUNICACION_{estado}`, `_PAGO_REGISTRADO`, `_COMPROMISO_CREADO`,
  `_COMPROMISO_INCUMPLIDO`, `_ESCALADO_ASEGURADORA`, `_DERIVADO_JURIDICO`, `_CONCEPTOS_JURIDICOS`,
  `_POLITICA_GUARDADA`. Un fallo de auditoría no rompe la operación (patrón canónico del repo).
- **Cada transición** guarda `estadoAnterior/estadoNuevo`, `motivo` (obligatorio por estado), actor,
  `evidenciaId` e importes antes/después.
- **Cada comunicación** guarda `idempotencyKey`, `notificacionId`, `estado` (devuelto por GAP 1,
  jamás inventado), `provider`, `externalId`, `error` y `requiereEvidencia`.
- **Ids deterministas**: `mor_{contrato}_{firma}`, `pieza_{cobroId}`, `paso_{hash8}`,
  `evi_{exp}_{tipo}_{hash8}`, `com_{hash12}`, `cmp_{exp}_{fecha}`, `cuota_{cmp}_{n}`,
  `trn_{hash8}`, `jur_{exp}_{cauce}`, `int_{hash10}`, `evt_{evento}_{cobro|exp}` (FNV-1a hex).

## 7. Qué queda PREPARADO / SIMULADO / EXTERNO / PENDIENTE

**PREPARADO** — dossier de aseguradora (`estado: PREPARADO`, canal `MANUAL_GMAIL`/portal externo,
evidencia del comprobante aportada a mano); expediente jurídico `PREPARADO` (sin `numeroProcedimiento`
salvo registro manual de un acuerdo real); recálculo de conceptos gated por
`requerimiento_fehaciente_registrado_requerido`; gancho `listarLiquidacionesPorCobros` hacia el BLOQUE B;
implementación persistente del repositorio GAP 1.

**SIMULADO** — solo dobles de test: `repositorioNotificacionesMemoria()` y el repositorio en memoria de
`morosidadStore.test.ts`. **Nada simulado en producción**: ningún envío, presentación ni cargo simulado.

**EXTERNO (no se finge)** — transporte de email/WhatsApp/SMS; burofax, carta certificada, acta notarial;
remisión a la aseguradora; presentación de demanda/monitorio y tasación de costas
(`costas_no_liquidables_por_el_ERP_requiere_tasacion_judicial`); verificación jurídica del tipo de
interés y de las cláusulas de gastos de recobro; subida de adjuntos a Storage.

**PENDIENTE (deliberadamente no hecho)** — programador/cron que invoque `detectarYGestionar` y
`revisarCompromisosVigentes` (los casos de uso existen y son idempotentes; el repo no tiene
infraestructura de tareas programadas); consumo del espejo para avisos periódicos al propietario;
integración con GAP 7 (facturación/VERI\*FACTU) y GAP 8 (B2B) para documentación de deuda;
reporte a ficheros de morosidad (solo avisos y banderas, sin decisión automática); pruebas con
emulador de reglas; portal del inquilino y cualquier capacidad de IA (**BLOQUE D: no iniciado**).
