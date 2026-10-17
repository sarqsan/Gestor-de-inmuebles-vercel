# PLAN DE CAPACIDADES SEGÚN TUS DECISIONES — INFORME Y FASES (16-10-2026)

> **Qué es.** Respuesta punto por punto a tus decisiones sobre la comparativa de mercado
> ([`ANALISIS-MERCADO-CAPACIDADES-2026-10-16.md`](ANALISIS-MERCADO-CAPACIDADES-2026-10-16.md)):
> **qué ya tenemos**, **qué falta de verdad**, **qué queda descartado por tu decisión** y **plan por fases**.
>
> **Qué NO es.** **No se ha añadido nada** al mapa maestro ni al código: este documento solo **propone
> dónde** iría cada cosa (§6). Nada se implementa hasta que lo autorices expresamente, fase por fase.
>
> **Corte:** `main` = `4309f48`; rama de esta sesión `arena/7eef00ef-…`. Todas las afirmaciones de
> «ya existe» están verificadas leyendo el código de este corte (se cita fichero).

---

## 0. Resumen ejecutivo de tus decisiones

| # | Función | Tu decisión | ¿Ya existe? | Veredicto |
|---|---|---|---|---|
| 1 | Pasarela de pago | **NO** | — | **Descartada.** En su lugar: inquilino paga por transferencia, **sube justificante**, y aviso automático a inquilino **y** propietario si pasa el día 5 |
| 1b | Justificante subido **por el inquilino** | **SÍ (nuevo)** | 🟡 el justificante existe, pero **solo lo sube el gestor** | Nueva funcionalidad con cambio de reglas |
| 1c | Aviso al inquilino y al propietario si no se ha cobrado el día 5 | **SÍ, obligatorio** | 🟡 los avisos **se calculan**; **no se envían** ni hay reloj que los dispare | Requiere cerrar antes los avisos reales (§5 Fase A) |
| 2 | Conexión bancaria | **SÍ, si es sencillo** | ❌ no hay conexión; 🟡 sí hay importación de extractos y motor de conciliación | **Dos niveles distintos**: lo sencillo y gratis es categorizar/avisar; «conectar el banco» NO es sencillo ni gratis (§2.2) |
| 3 | Escáner IA de facturas → gasto | **SÍ, sí o sí** | ❌ no existe (el análisis de documentos actual está orientado a candidatos) | Fase E; además consta ya como promesa histórica en el mapa §16.4 |
| 4 | Actualización anual de renta (IRAV/IPC) con aviso 30 días antes al inquilino | **SÍ** | ❌ no existe en el contrato (solo una estimación en el *pricing* de recomercialización) | Fase D |
| 5 | Verificación externa de solvencia (ASNEF/FIM…) | **Solo si es gratis**; prefieres que lo haga la aseguradora de impago | 🟡 existe expediente de seguro de impago muy completo | Matiz importante: **automática no es gratis**; sí es gratis la vía «el candidato descarga su certificado y lo sube» |
| 6 | Domiciliación SEPA | **NO** | 🟡 se generan ficheros PAIN.008 | **Descartada** (coherente con el punto 1) |
| 6b | WhatsApp | **Dudoso por complejidad**; tendría que ser «individual de cada propietario» | 🟡 canal declarado sin implementar | Mi recomendación: **NO por propietario**; sí por enlace directo (gratis) y, más adelante, un único WhatsApp de la organización |
| 6c | Export contable para el asesor | **SÍ, debe estar** | 🟡 **existe** exportación potente por entidad/ámbito/ejercicio, pero **no el paquete del asesor** | Fase F: extensión del exportador canónico (no un sistema nuevo) |
| 6d | Ficha de la aseguradora de impago actual | **Pregunta** | ✅ módulo amplio | Respuesta completa en §2.5 |

**Conclusión de una línea:** de lo que pediste, **nada exige inventar nada nuevo**; lo único que hoy
bloquea el punto 1 (el más importante para ti) es que **los avisos no salen**: hay que cerrar el envío
real y añadir un **reloj** que los dispare. Esa es la Fase A y es prerrequisito de casi todo lo demás.

---

## 1. Punto 1 · Cobro por transferencia, justificante y aviso del día 5

### 1.1 Lo que YA existe (y es mucho)

| Pieza | Estado verificado |
|---|---|
| Calendario de cobros por contrato | `cobrosEngine.generarPeriodosParaContrato()`; el vencimiento sale de `diaLimitePagoMes` (1–5, `src/types.ts:1282`). En los datos de prueba vale **5** |
| Estados del recibo | `PENDIENTE / RECIBIDO / VERIFICADO / RETRASADO / INCIDENCIA` (`ESTADO_INFO` del portal) |
| Justificante del cobro | Modelo `justificante` (nombre, url, storagePath) + Storage `cobros_justificantes/{propietarioId}/{cobroId}/{archivo}` con límite 12 MB, solo PDF/imagen y ámbito por propietario/cartera (`storage.rules:325`) |
| Subida del justificante | **`uploadJustificanteCobro()`** (`src/lib/firebase.ts:3107`), usada **solo desde la sección de Cobros del gestor** (`CobrosSection.tsx:255`) |
| Única vía de escritura del cobro | `registrarPagoPeriodo()` — invariante del ERP: ninguna otra ruta marca un recibo como cobrado |
| Cálculo de avisos | `calcularAvisosCobros()` con `DIAS_AVISO_VENCIMIENTO = 5` (aviso **antes** de vencer), `DIAS_GRACIA_RETRASO = 2` y cuatro tipos: `vence_pronto`, `en_plazo_gracia`, `vencida`, `incidencia` |
| Plantillas de aviso ya escritas | `cobro.proximo_vencimiento`, `cobro.vencimiento_hoy`, `cobro.retraso_pago` (`src/notificaciones/plantillas.ts`) |
| Política de recobro configurable | `dunningPolicy`: paso **D−5 (aviso previo)** → **D+3 primer recordatorio** → D+10 → D+20 → **D+30 escalado a aseguradora**, con `diasGracia: 2` |
| Destinatarios previstos | `destinatarioTipo`: `INQUILINO`, `PROPIETARIO`, `ADMINISTRACION`, `AVALISTA`, `CODEUDOR` (`src/utils/morosidad/eventos.ts:75`) → **el aviso al propietario ya está modelado** |
| El portal del inquilino muestra | IBAN del contrato, «paga antes del día 5», estado de cada recibo y descarga del justificante **si ya existe** (`PortalRecibos.tsx`) |

### 1.2 Lo que FALTA (las tres cosas que has pedido)

**(a) Que el inquilino pueda subir el justificante.** Hoy **no puede**: las reglas de Storage exigen
ámbito de propietario/cartera (`ambitoPidEscritura`) y el inquilino no escribe en
`contratos_formalizacion` más que `incidenciaIds`, `mensajeIds` y `fechaActualizacion`
(`firestore.rules`, bloque de contratos). **Propuesta de arquitectura** (la más segura y la que menos
toca el ERP):

- Los justificantes del inquilino van a una **colección/subcolección nueva** de aportaciones
  (`contratos_formalizacion/{contratoId}/justificantes_inquilino/{periodoId}` + Storage
  `justificantes_inquilino/{propietarioId}/{contratoId}/{periodoId}/…`), con reglas que permitan
  **crear solo al inquilino vinculado a ese contrato** y **solo para su inmueble/periodo**, sin
  `update`/`delete` (trazable e inmutable).
- **El inquilino NUNCA marca el recibo como cobrado.** El estado se cambia solo cuando el propietario
  (o el gestor) **verifica** la aportación y registra el cobro por la vía canónica
  (`registrarPagoPeriodo`). Eso evita el falso «pagado» y evita que un justificante falso cambie la
  contabilidad.

**(b) El aviso el día 5, al inquilino y al propietario.** El cálculo existe; falta que **ocurra**:

1. **Reloj**: el ERP es una SPA + funciones serverless; **no hay cron configurado** (`vercel.json` sin
   `crons`) ni proceso programado. Sin un disparador diario, «si pasa el día 5» no se evalúa solo.
   Opciones: *Vercel Cron* llamando a un endpoint protegido, o un chequeo al abrir sesión (parche, no
   solución: si nadie entra, nadie avisa). Recomiendo **cron diario**.
2. **Envío real**: hoy `/api/notificaciones/enviar` **no puede entregar nada** — el servidor llama al
   resolutor de autorización con verificador y fuente `undefined`, así que el perfil es `null` y el
   dispatcher responde `no_autorizado` (hallazgo A16-03, pendiente). Además el proveedor de correo
   está en **modo seguro**: con `ENABLE_EMAIL=true` devuelve `ok` con un id `safe-*` **sin enviar**.
   Es decir: hoy la app puede *decir* que avisó sin haber avisado. **Esto hay que cerrarlo sí o sí**
   antes de prometer el aviso del día 5.
3. **Regla del día 5 explícita y configurable**: hoy el aviso «vencida» aparece cuando el recibo pasa
   el vencimiento + 2 días de gracia. Tu regla es **día 5 = vencimiento** (que ya es el máximo del
   modelo) con **aviso al propietario** además del recordatorio al inquilino. Es configuración +
   una plantilla de «propietario: renta no cobrada del mes», no motor nuevo.

**(c) Verificación por el propietario.** Al recibir la aportación, el propietario (o el gestor) debe
poder: ver el justificante, **aceptar** (→ `registrarPagoPeriodo` con fecha/importe leídos del
justificante, con confirmación humana) o **rechazar** (→ incidencia de cobro con motivo). El portal
del propietario ya tiene la sección de liquidaciones; falta esta bandeja de verificación.

**Riesgo a evitar:** que la IA lea el importe del justificante y lo dé por cobrado sin confirmación.
Correcto: la IA **propone** (importe, fecha, ordenante) y **el humano confirma**; la escritura sigue
siendo `registrarPagoPeriodo`.

---

## 2. Punto 2 · «Conectar el banco»

### 2.1 Lo que YA existe

- Importación de extractos en cuatro formatos: **MT940, OFX, Norma 43 y CSV** (`src/utils/conciliacion/`).
- Motor de *matching* con tolerancias (`matchingEngine`), estados **Detectada → Propuesta → Validada →
  Aplicada** con histórico append-only, idempotencia de importaciones y persistencia en Firestore
  (`conciliacionFirestore.ts`) y colecciones `movimientos_bancarios`, `conciliaciones_bancarias`,
  `importaciones_bancarias`.
- La aplicación **nunca** escribe contabilidad «en silencio»: aplicar una conciliación sobre un cobro
  pasa siempre por `registrarPagoPeriodo`.

### 2.2 La verdad sobre «conectar el banco» (respuesta honesta)

**No es sencillo y no es gratis**, y conviene saberlo antes de decidir:

| Nivel | Qué es | Dificultad | Coste | Valor |
|---|---|---|---|---|
| **Nivel 1 — Categorización y avisos sobre lo ya importado** | Reglas locales: reconocer «recibo de alquiler de X», «recibo del seguro de Y», «IBI», «comunidad», «hipoteca», y **proponer** la imputación (cobro, gasto, póliza); avisar de lo que no cuadra | **Baja** (motor de reglas + plantillas; reutiliza el motor de conciliación) | **0 €** (sin proveedor) | **Alto e inmediato** |
| **Nivel 2 — Conexión bancaria real (PSD2)** | Un **agregador autorizado** (AISP) que lea los movimientos y los entregue automáticamente | **Media-alta**: alta en el proveedor, consentimiento del titular, gestión de tokens/caducidad, endpoint de recepción, mapeo e idempotencia, y **verificación en entorno no productivo** | **De pago**: licencia + tarifa por cuenta conectada/mes (varía por proveedor y volumen) | Alto, pero **operativo y comercial**, no de código |

**Mi recomendación:** hacer **ya el Nivel 1** (es lo que te da el valor que describes: «que te avise de
los cobros y que categorice los pagos de seguros») y **decidir el Nivel 2 con presupuesto a la vista**,
porque además choca con la Fase 1 de seguridad (base de datos con nombre vs. `(default)` en Storage)
que sigue abierta.

---

## 3. Punto 5 · Verificación de solvencia e **informe de la aseguradora de impago actual**

### 3.1 Lo gratis y lo que no

- **Gratis y compatible hoy**: que **el propio candidato** descargue su **certificado ASNEF** (Equifax
  lo da gratis al interesado) y lo suba al expediente, con consentimiento RGPD explícito. Es lo que
  recomiendan las guías del sector para el arrendador particular, y encaja con el módulo documental y
  de IA que ya tienes (leer el certificado, verificar coherencia y dejar constancia).
- **De pago**: la **consulta automatizada** a ASNEF/RAI/BADEXCUG/FIM/CIRBE exige proveedor y tarifa
  por consulta. No es gratis y no se puede improvisar.
- **Y tienes razón**: en la práctica, quien hace el análisis de riesgo real es **la aseguradora de
  impago**. Por eso la propuesta es potenciar el expediente de la aseguradora (abajo) y dejar la
  consulta externa como opción futura, no como prioridad.

### 3.2 La aseguradora de impago que YA existe en la app (tu pregunta)

Verificado en `src/components/sections/SeguroImpagoSection.tsx`, `src/types.ts` y `mockData.ts`:

| Pieza | Estado |
|---|---|
| Aseguradoras precargadas | **ARAG Seguros**, **Caser**, **Mutua de Propietarios**, **DAS Seguros**, cada una con nombre comercial y **formato de asunto de correo** propio (`[REF-IMPAGO] … {inmueble} {candidato}`) |
| Referencia única | Sí (`REF-IMPAGO-2026-…`): sirve para que la respuesta de la aseguradora se empareje con el expediente |
| Expediente del candidato | 1 o 2 titulares + avalista, ingresos conjuntos y **ratio de esfuerzo** calculado sobre la renta |
| Documentación | Lista de documentos por aseguradora + control de **documentación completa según aseguradora** |
| Análisis IA previo | Resumen, **score de solvencia**, alertas detectadas y **nivel de riesgo** (Bajo/Medio/Alto) |
| Envío | `GMAIL_API` / `GMAIL_WEB` / `MANUAL`, con asunto y cuerpo generados; estados `BORRADOR → CORREO_ENVIADO → SOLICITUD_PENDIENTE → RESPUESTA_RECIBIDA → RESPUESTA_PROCESADA / ERROR_PROCESAMIENTO` |
| Respuesta de la aseguradora | **Procesada por IA**: dictamen (`FAVORABLE`, `FAVORABLE_CONDICIONADO`, `DESFAVORABLE`, `DOCUMENTACION_REQUERIDA`, `EN_ESTUDIO`), importe máximo asegurable, **prima anual**, condiciones, documentos extra y comentarios |
| Decisión del propietario | `ACEPTAR_CANDIDATO`, `SOLICITAR_AVAL_EXTRA`, `RECHAZAR_CANDIDATO`, `TRAMITAR_OTRA_ASEGURADORA`, con notas privadas e historial |

**Qué le falta (mejoras que sí aportarían valor y no dependen de nadie):**
1. **No hay API de aseguradora** (lógico: ninguna la ofrece al particular); el envío depende del correo
   del usuario y es semi-manual.
2. **Cuando la aseguradora acepta, no se crea la póliza**: el expediente de impago debería generar la
   **póliza real** en `polizas_seguros` (compañía, prima, vigencia, coberturas, condiciones) para que
   entre en los **avisos de renovación** que el ERP ya tiene (`seguro.renovacion_poliza`).
3. **No hay puente con morosidad**: si un inmueble asegurado entra en impago, el ERP ya tiene el
   expediente de recobro con el requisito de procedibilidad; debería poder **abrir el siniestro con el
   expediente documental completo** en un clic.
4. **No hay control de documentación pendiente con recordatorios** (pedir el documento que falta al
   inquilino y no perderlo de vista).

Estas cuatro mejoras convierten el módulo actual en el circuito completo **candidato → estudio →
póliza → renovación → impago → siniestro**, que ningún competidor nacional ofrece de punta a punta.

---

## 4. Puntos 3, 4 y 6c (los que has dicho «sí» o «debe estar»)

### 4.1 Escáner IA de facturas → gasto (punto 3)
Hoy `/api/analizar-documento` está orientado a **documentos de candidatos** (nómina, renta, DNI) y
`GastoModal` registra facturas **a mano**. El flujo que falta: **subir foto/PDF de la factura → IA
extrae (proveedor, fecha, base, IVA, total, concepto, posible inmueble y categoría) → el usuario revisa
y corrige → se crea el gasto** con el fichero como justificante. Ya consta en el mapa como promesa
histórica (§16.4 `ESCANER_FACTURAS_IA`) y enlaza con el hallazgo de que esa función existía en otra
aplicación. Nota de coste: usa el núcleo de IA gobernado (con permisos, cuotas y registro); **el
consumo sigue bloqueado por política** hasta que autorices el gasto.

### 4.2 Actualización de renta con aviso 30 días antes (punto 4)
**No existe** en el ciclo contractual. He verificado el marco real para no inventar reglas:
- **IRAV** (Índice de Referencia de Arrendamientos de Vivienda, INE, creado por la **Ley 12/2023**):
  **obligatorio desde enero de 2025** para **vivienda habitual firmada desde el 26/05/2023**; funciona
  como **tope** (aunque el contrato diga IPC) [1](https://lexway.es/actualizacion-renta/) [4](https://alquigest.com/noticias/actualizacion-renta-alquiler-irav-ipc/).
- Contratos **anteriores** al 26/05/2023: se actualizan por **IPC o lo pactado** [2](https://irav.es/) [3](https://www.homyspace.com/blog/irav-2026-que-es-como-afecta-alquiler/).
- El IRAV lo publica el **INE mensualmente** (último dato publicado: **2,54 %**, septiembre 2026) y
  desde el **29/04/2026 no hay tope extraordinario del 2 %** (el RDL que lo fijaba no fue convalidado) [1](https://lexway.es/actualizacion-renta/) [2](https://irav.es/).
- **Temporada no tiene límite** de actualización [3](https://www.homyspace.com/blog/irav-2026-que-es-como-afecta-alquiler/).

**Propuesta funcional** (determinista, con confirmación humana y sin inventar nada):
1. Cada contrato guarda su **cláusula de actualización** (índice pactado: IRAV / IPC / otro; o «no
   procede»).
2. La app avisa **30 días antes del aniversario** de la fecha de revisión (al gestor/propietario).
3. Se introduce/confirma el **valor oficial del índice** aplicable en el mes que toca (el valor no se
   inventa: se registra con fecha y fuente).
4. La app calcula la nueva renta, **aplica el tope legal cuando corresponda** y avisa de si el índice
   pactado resulta limitado por el IRAV.
5. Genera el **anexo de actualización** (documento firmable, encaja con los anexos versionados de
   GAP2) y el **aviso al inquilino un mes antes**, para que el siguiente recibo ya se emita actualizado.
6. El recibo siguiente se emite con la renta nueva (el calendario ya se regenera por contrato).

### 4.3 Export contable para el asesor (punto 6c)
**Sí existe** una base potente que quizá no conocías (`src/lib/importExport/exportador.ts`):

- Entidades exportables hoy: **GASTO, COBRO, INMUEBLE, PROPIETARIO, CONTRATO**.
- Ámbito: **por propietario(s)**, **por inmueble(s)** (uno, varios o todos los de sus propietarios) y,
  para GASTO/COBRO, **por ejercicio(s) y/o meses**.
- Formatos: **JSON, CSV y XLSX** (con tipos reales de celda: importes numéricos, fechas como fecha).
- Auditoría de la exportación y validación de ámbito contra lo autorizado.

**Lo que falta para tu necesidad concreta** (contratos + inquilinos + gastos + cobros + facturas de
uno, dos o todos los inmuebles y de uno o varios años, en un solo paquete):
1. **Un solo paquete multi-entidad** (hoy se exporta una entidad por operación).
2. **FACTURA, LIQUIDACIÓN, PÓLIZA, INCIDENCIA, ACTA** no son entidades exportables todavía.
3. El filtro por año **no aplica a CONTRATO** (el sistema avisa y lo ignora): no puedes pedir «contratos
   vigentes en 2024».
4. **Ningún formato contable**: falta el **libro de ingresos y gastos por fecha** (lo que el asesor
   necesita para el cierre) y, opcionalmente, el **mapeo a un programa** (A3, Holded, Odoo, otros).
5. **ZIP con índice y documentos**: ya existe el motor de expediente fiscal con índice y **hashes**
   (`src/lib/expedienteFiscal/`), pero hoy se invoca **sin los binarios** (los adjuntos referenciados
   no se empaquetan) y **una sola vez por inmueble/ejercicio**.

Conclusión: es **una extensión del exportador canónico**, no un módulo nuevo (≈ una fase corta).

### 4.4 WhatsApp (tu duda)
Tienes razón: **«individual de cada propietario» es la peor opción**. La API de WhatsApp Business exige
una cuenta de empresa (WABA) por número, verificación y **plantillas aprobadas por Meta**: dar de alta
una por propietario multiplicaría trámites, coste y soporte. Alternativas reales, en orden:

1. **Enlace directo (`wa.me`) con mensaje prerrellenado**: gratis, sin API, sin trámites. El gestor
   pulsa «Avisar por WhatsApp» y se abre el chat con el texto ya escrito (recordatorio del recibo,
   cita de avería, aviso de subida). **Es lo que recomiendo ahora.**
2. **Un único WhatsApp de la organización** (una WABA de tu empresa) para envíos automáticos. Coste y
   trámite **una vez**, no por propietario. A decidir más adelante.
3. **Por propietario: no.** Lo desaconsejo en esta fase.

---

## 5. PLAN POR FASES

> Esfuerzo en «semanas-persona» (una persona trabajando en esto). Las fases están **encadenadas**:
> A es puerta de B, D y de la parte de avisos de C.

### FASE A — AVISOS QUE DE VERDAD SALEN (P0, prerrequisito)
**Objetivo:** que la app pueda avisar sin mentir. **Sin esta fase, el punto 1 y el 4 son promesas.**

| Entregable | Detalle |
|---|---|
| Verificador de identidad en el servidor | Inyectar verificador de token y fuente de perfil en el endpoint de notificaciones (cierra A16-03) |
| Transporte de correo real | Proveedor SMTP/servicio de correo con credenciales en el servidor + **distinción explícita** entre «enviado de verdad» y «modo seguro» (prohibido devolver `ok` sin enviar) |
| Reloj diario | Cron (Vercel) que evalúe vencimientos, avisos y actualizaciones pendientes; endpoint protegido e idempotente |
| Bandeja interna | Que el aviso quede también **dentro** de la app (no depender solo del correo) |
| Puerta de salida | Prueba con credenciales de prueba: aviso emitido, recibido y trazado; reintento y fallo visibles; **ningún falso «enviado»** |

**Esfuerzo:** 1,5–2,5 semanas. **Riesgo principal:** credenciales y proveedor (decisión tuya).

### FASE B — COBRO POR TRANSFERENCIA CON JUSTIFICANTE Y AVISO DEL DÍA 5 (punto 1)
| Entregable | Detalle |
|---|---|
| Subida del justificante por el inquilino | Aportación en colección propia + Storage con reglas de ámbito por contrato/periodo, sin update/delete |
| Bandeja de verificación | Propietario/gestor: ver justificante, **aceptar** (registro canónico del cobro) o **rechazar** (incidencia) |
| Lectura asistida del justificante | La IA propone importe/fecha/ordenante; **el humano confirma** (nunca automatiza el cobro) |
| Regla del día 5 | Configuración por contrato (día límite ya existe); aviso **al inquilino** (recordatorio) y **al propietario** (renta no cobrada), con escalado posterior según la política de recobro ya existente |
| Puerta de salida | Simulación de mes completo: sin justificante el día 5 → dos avisos; justificante subido → verificación → cobro registrado; sin duplicados ni falsos positivos |

**Esfuerzo:** 2–3 semanas (con la Fase A hecha). **Depende de:** decisiones §7 (quién verifica).

### FASE C — BANCO NIVEL 1: CATEGORIZACIÓN Y AVISOS (punto 2)
| Entregable | Detalle |
|---|---|
| Reglas de categorización | Diccionario por propietario/inmueble: «alquiler/recibo», «seguro», «IBI», «comunidad», «hipoteca», «suministro» → propuesta de imputación |
| Conciliación automática asistida | Propuesta automática + aviso de lo que no cuadra (usa el motor existente) |
| Alertas | «Han entrado 1.200 € de X», «el seguro de Y se ha cobrado», «falta cobrar la renta de Z» |
| Puerta de salida | Con extractos reales anonimizados: propuestas correctas sobre casos de prueba; **nada se aplica sin confirmación** |

**Esfuerzo:** 1,5–2,5 semanas. **Coste:** 0 €. **Decisión aparte:** Nivel 2 (agregador PSD2) = proyecto
con presupuesto y contrato de proveedor.

### FASE D — ACTUALIZACIÓN DE RENTA CON AVISO A 30 DÍAS (punto 4)
**Esfuerzo:** 1,5–2,5 semanas. Requiere Fase A (avisos). Entregables según §4.2, con **valor del
índice registrado con fuente y fecha** y **tope legal aplicado** cuando corresponda.

### FASE E — ESCÁNER IA DE FACTURAS → GASTO (punto 3)
**Esfuerzo:** 2–3 semanas (con proveedor de IA ya configurado). **Bloqueo administrativo, no técnico:**
el consumo de IA está **desactivado por política**; requiere tu autorización y control de gasto.

### FASE F — PAQUETE CONTABLE DEL ASESOR (punto 6c)
| Entregable | Detalle |
|---|---|
| Multi-entidad en un solo ZIP | Contratos + inquilinos + cobros + gastos + facturas + liquidaciones del/los inmuebles y año(s) elegidos |
| Entidades nuevas exportables | FACTURA, LIQUIDACIÓN (y PÓLIZA si procede) |
| Filtro temporal en contratos | «Contratos vigentes en el ejercicio N» |
| Libro de ingresos y gastos | Fichero con fecha, concepto, inmueble, inquilino/proveedor, base, IVA, total, categoría, deducibilidad |
| Índice y trazabilidad | Índice del ZIP con hashes (motor existente) + informe de la exportación |
| Puerta de salida | Un ZIP por ejercicio que el asesor pueda abrir y cuadrar contra los totales del ERP; ida y vuelta verificada |

**Esfuerzo:** 2–3 semanas.

### FASE G — SOLVENCIA SIN COSTE Y EXPEDIENTE DE SEGURO COMPLETO (punto 5)
**Esfuerzo:** 1,5–2,5 semanas. Entregables: certificado ASNEF subido por el candidato con consentimiento
y checklist de coherencia documental; póliza creada al aceptar la aseguradora; puente
**impago → morosidad → siniestro**; recordatorios de documentación pendiente.

### FASE H — WHATSAPP POR ENLACE (gratis) · **Esfuerzo: 2–3 días**
Mensaje prerrellenado para recordatorios, citas de avería y avisos de subida. La WABA única de la
organización (envío automático) queda como decisión posterior con presupuesto.

**Orden recomendado:** **A → B → C → D → F → E → G → H**.
Justificación: **A** desbloquea todo; **B** es lo que has pedido como obligatorio; **C** es barato y de
efecto inmediato; **D** y **F** son cumplimiento y valor para el asesor; **E** depende de que autorices
gasto de IA; **G** y **H** son mejoras de gran relación valor/esfuerzo al final.

---

## 6. Dónde entraría cada cosa en el MAPA MAESTRO (propuesta, **NO aplicada**)

Según tu instrucción, **no he tocado el mapa**. Esta es la ubicación que propongo para cuando lo
autorices (se haría en un solo commit, con la deriva documental ya detectada):

| Contenido | Sección del mapa | Qué se añadiría |
|---|---|---|
| Avisos reales (verificador, transporte, cron, bandeja) | **§5 · F0 (P0)** + **§2 incidencias A16-03** | F0 pasa a «ejecutada/integrada» solo con su puerta de salida; A16-03 se cierra con evidencia |
| Cobro por transferencia + justificante del inquilino + aviso del día 5 | **§14 · BLOQUE 3** (documentación, economía y trazabilidad) + **§2.1 #5 Cobros** | Nueva capacidad con estados, reglas y puerta de salida |
| Categorización bancaria y avisos (Nivel 1) | **§2.1 #16 Conciliación** + **§14 · BLOQUE 3** | Nueva subcapacidad sobre GAP6 |
| Conexión bancaria real (PSD2) | **§12.1 categoría C** (dependencia externa/proveedor) | Fila con proveedor, coste y punto de enganche |
| Escáner IA de facturas → gasto | **§16.4** (promesa histórica) + **§14 · BLOQUE 3** + **§1 catálogo IA (13.ª operación)** | Se convierte en capacidad planificada; el origen «otra aplicación» se conserva |
| Actualización de renta IRAV/IPC + aviso 30 días | **§14 · BLOQUE 3** + **§2.1 #4 Contratos** | Índice aplicable, tope, anexo y aviso; con nota «verificar normativa antes de codificar» |
| Control de fianza autonómica | **§14 · BLOQUE 3** | Plazos por comunidad, acuse y devolución |
| Paquete contable del asesor | **§14 · BLOQUE 6 como v2 del contrato de exportación** | Multi-entidad, multi-ejercicio, libro contable, ZIP con índice |
| Póliza desde el expediente de impago + puente a siniestro/morosidad | **§2.1 #9 Pólizas y siniestros** + **§4 BLOQUE C** | Cierra el circuito candidato→póliza→impago→siniestro |
| Solvencia externa (de pago) y certificado ASNEF del candidato (gratis) | **§12.1 categoría C** + **§2.1 #3 Captación** | Distingue vía gratuita y vía de proveedor |
| WhatsApp por enlace / WABA única | **§12.1 categoría C** (canal WhatsApp) | Ya está listada como dependencia; se detalla el orden recomendado |

---

## 7. Decisiones que necesito de ti para arrancar sin bloqueos

1. **Vía de correo** para los avisos: ¿proveedor de correo transaccional (contratar) o correo de tu
   cuenta (Gmail) para empezar?
2. **Quién verifica el justificante**: ¿el propietario directamente, o tú/gestor en su nombre?
3. **Avisos del día 5**: ¿solo correo, o también WhatsApp por enlace? ¿Y quieres aviso **previo** (p. ej.
   3 días antes) o solo al vencer?
4. **Escáner de facturas**: ¿autorizas el consumo de IA (con tope de gasto) o prefieres empezar con OCR
   local y revisión manual?
5. **Export contable**: ¿basta el **libro de ingresos y gastos** en Excel/CSV, o quieres mapeo a un
   programa concreto (A3, Holded, Odoo…)? ¿Qué años atrás necesitas?
6. **Banco**: ¿autorizas estudiar presupuesto de agregador (Nivel 2) o solo hacemos el Nivel 1?
7. **Solvencia**: ¿te vale la vía gratuita (certificado que sube el candidato) y potenciar el expediente
   de la aseguradora, dejando la consulta automática de pago descartada?

---

## 8. Custodia de este informe

Solo se añade este documento. **No** se ha modificado código, reglas, configuración, mapa maestro ni
datos; **no** se ha publicado nada, **no** se ha consumido IA ni servicios externos y **no** se ha
contactado con ningún proveedor. Los valores de índice y las obligaciones fiscales citadas proceden de
fuentes públicas del 9–28 de octubre de 2026 y **deberán verificarse normativamente antes de
codificarse**, conforme a la regla de oro del mapa: no se inventan reglas fiscales, bancarias ni
jurídicas.
