# ANÁLISIS DE MERCADO Y CAPACIDADES — GESTOR DE INMUEBLES vs. SOFTWARE SIMILAR (16-10-2026)

> **Objeto.** Recorrer la aplicación real (secciones, motores y datos de `main` = `4309f48`) y
> compararla con el software de gestión de alquileres y *property management* que hoy compite en el
> mercado, para determinar **qué funciones añadirían más valor**.
>
> **Naturaleza.** Documento de **producto y solo lectura**: no cambia código, reglas ni datos, no
> autoriza desarrollos y no afirma nada sobre el estado desplegado. Cada carencia se apoya en una
> **verificación en el repositorio** (búsqueda o lectura de ficheros) y cada referencia de mercado en
> una fuente pública enlazada. Donde no se ha podido comprobar, se dice.
>
> **Anexo de este mismo corte:** [`COMPROBACION-MAIN-MAPA-2026-10-16.md`](COMPROBACION-MAIN-MAPA-2026-10-16.md)
> (estado real y pendientes técnicos). Este documento **no repite** esa lista: trabaja el eje
> *producto/mercado*, no el eje *deuda de ingeniería*.

---

## 0. Método y límites

**Método.** (a) Inventario del alcance funcional real: `SectionType` de `src/types.ts`, las 33
secciones de `src/components/sections/`, los portales por rol, los motores puros de `src/utils/`,
`src/tesoreria/`, `src/utilities` por dominio y el catálogo de IA; (b) comprobación dirigida de
**ausencias** (pasarela de pago, agregación bancaria, OCR de facturas, verificación externa de
solvencia, firma electrónica cualificada, app/PWA, i18n, API pública, presupuesto por inmueble,
actualización de renta, control de fianza autonómica, SLA de proveedores); (c) contraste con cuatro
grupos de competidores: **suites globales** (AppFolio, Buildium, DoorLoop, Yardi, RealPage,
Entrata, MRI, Rent Manager), **capa de IA agentiva** (EliseAI, Haven, Super, Latchel/Mezo,
Realm-X, Lumina), **software español de gestión de alquileres** (Rentger, Homming, Fynkus, Rentila,
Inmovilla/Witei y similares) y **servicios adyacentes** (verificación de solvencia: CrossCheck,
S-CAIM, Housfy EBI; CMMS: Facilio, MaintainX, Property Meld).

**Límites (honestos).** No se ha probado ningún producto de la competencia: su alcance se toma de su
documentación pública y de comparativas de 2026 (enlazadas). No se ha verificado el estado
**desplegado** de este ERP (reglas publicadas, datos, Vercel, Gemini). Las ausencias se afirman solo
cuando la búsqueda en el código no encuentra implementación; si existe un equivalente parcial, se
dice «parcial» y se nombra el fichero.

---

## 1. Lo que la aplicación ya cubre (recorrido real)

| # | Dominio | Alcance verificado en el código |
|---|---|---|
| 1 | **Identidad, roles y ámbito** | `authService` + RBAC de 4 perfiles (ADMINISTRADOR, PROPIETARIO, PROFESIONAL, INQUILINO) y 5 roles operativos + `GESTOR_PATRIMONIAL`; carteras `gestiones_cartera` con permiso **LECTURA / LECTURA_ESCRITURA**, ámbito por inmueble (`inmuebleIds[]`), responsable GESTOR/TITULAR, ciclo PENDIENTE_ACEPTACION→ACTIVA⇄SUSPENDIDA→REVOCADA con eventos append-only (`src/lib/gestionesCartera.ts`, `carterasGestion.ts`) |
| 2 | **Patrimonio y titularidad** | Propietarios **sin necesidad de cuenta** (`estadoAcceso SIN_CUENTA/INVITADO/ACTIVO`), N titulares por inmueble con cuotas, cambios de principal/secundario, transmisión y baja patrimonial con histórico (`src/lib/titularidadInmueble.ts`, `src/utils/titularidadesEngine.ts`, `transmisionPatrimonial.ts`, `bajaPatrimonialInmueble.ts`) |
| 3 | **Inmueble como centro** | Ficha completa (datos fiscales, catastrales), modo **alquiler por habitaciones** con reserva atómica, inventario físico con histórico append-only, ficha pública mínima con token (`fichas_publicas_inmueble`), panel de centro operativo con expediente |
| 4 | **Captación** | Portal público de solicitud, visita, documentación y cuestionario por token; agenda de visitas; candidatos con estados; scoring propio de solvencia (`solvenciaEngine`); preselección y comparador |
| 5 | **Contrato y ciclo LAU** | `contratoEngine` + `contratoCicloEngine` (GAP2): modalidades VIVIENDA_HABITUAL/TEMPORADA/LOCAL/HABITACION, anexos versionados inmutables, rescisión con finiquito (nunca toca el registro de cobros), prórrogas, acta de llaves |
| 6 | **Cobros** | Calendario materializado en el contrato, justificación/verificación, justificantes en Storage, retrasos automáticos, avisos; **una sola vía de escritura**: `registrarPagoPeriodo` |
| 7 | **Gastos, préstamos y rentabilidad** | Gastos de explotación vs. financiación, recurrentes con *backfill*, facturas, préstamos/hipotecas con cuadro de amortización GAP4, rentabilidad por inmueble y cartera |
| 8 | **Tesorería y liquidación a propietarios** | Liquidación mensual determinista (solo cobra lo efectivamente cobrado), gastos imputables, órdenes de pago, **SEPA PAIN.008/001** con IBAN mod-97/EPC, PDF de liquidación, portal «Mis Liquidaciones» |
| 9 | **Conciliación bancaria** | Parsers MT940/OFX/Norma 43/CSV, motor de *matching* con tolerancias, propuesta→confirmación→aplicación con histórico, persistencia en Firestore |
| 10 | **Facturación y cumplimiento** | Series/numeración, huella **SHA-256 encadenada** (spec AEAT), reporte RRSIF, cola VERI*FACTU desacoplada, factura electrónica B2B con CII/UBL/Facturae y máquina de estados propia |
| 11 | **Incidencias, mantenimiento, profesionales** | Incidencias con categorías/prioridad/responsabilidad LAU y adjuntos; mantenimiento preventivo y garantías; trabajos, presupuestos y valoraciones de profesionales; **portal del profesional** (mis servicios, zonas, asignaciones, perfil) |
| 12 | **Morosidad y recobro** | Máquina de estados con histórico, política configurable D+3/D+10/D+20/D+30 versionada, plan de recobro, comunicaciones por dispatcher GAP1, evidencias en Storage, expediente de aseguradora y jurídico con **requisito de procedibilidad LO 1/2025**, espejo acotado para el propietario |
| 13 | **Actas de entrada/salida** | Acta con inventario por elementos (estados 0–6), lecturas de contadores, evidencias en Storage, **comparación entrada↔salida determinista**, firma por **OTP** (SHA-256, 15 min, 5 intentos, uso único), PDF versionado e inmutable |
| 14 | **Portales por rol** | Inquilino (inicio, contrato, recibos, incidencias, mensajes, suministros, documentos, historial, cuenta), propietario (inmuebles, contratos, profesionales, liquidaciones, morosidad), profesional |
| 15 | **Suministros** | CUPS/contador, titular y comercializadora, lecturas **inmutables** con corrección trazada, cambios de titular, reparto |
| 16 | **Sindicación y publicación** | Generación/normalización de anuncio, `externalId` estable, hash canónico, idempotencia, adaptadores por portal (hoy `PORTAL_NO_CONECTADO`), kit de publicación con IA |
| 17 | **Recomercialización y reformas** | Salida de inquilino, inspección, reformas con ROI y desviación de coste, pricing asistido, estrategia comercial |
| 18 | **Fiscalidad e informes** | Motor fiscal por ejercicio/inmueble, expediente fiscal con **ZIP e índice con hashes**, informes de inversor/rentabilidad, PDF/CSV, dashboard ejecutivo |
| 19 | **Importación/exportación** | Contrato canónico `erp-import-export-v1`: JSON/CSV + adaptador XLSX, *dry-run* obligatorio, procedencia, idempotencia, promoción acotada |
| 20 | **IA y experiencia** | 12 operaciones catalogadas con núcleo central (sesión verificada, idempotencia, registro por usuario), gobierno por perfil **TODO O NADA** que **deniega por defecto**, asistente transversal con 3 consultas tipadas, ayuda contextual, 3 recorridos guiados, progreso persistido |
| 21 | **Accesibilidad y formularios** | Módulo `src/accesibilidad/` (UX-7), `src/formularios/`, feedback de operaciones (`src/feedback/`), estado de datos con error/reintento (`src/estadoDatos/`) |

**Lectura del inventario:** el ERP es **más profundo que el software español medio en ciclo
contractual, actas, morosidad, liquidación a propietarios, conciliación y trazabilidad**, y **más
débil que el mercado en lo que toca al dinero en movimiento, la verificación externa de
candidatos, el mantenimiento profesionalizado y los canales móviles**.

---

## 2. El mercado de referencia (2026)

**a) Suites globales** — AppFolio, Buildium, DoorLoop, Yardi Breeze, RealPage, Entrata, MRI,
Rent Manager, Rentvine, Propertyware, TurboTenant. Su núcleo común: contabilidad completa
(*general ledger*, AP/AR, *trust accounting*), cobro en línea con ACH/tarjeta, portal de inquilino y
propietario con app móvil, gestión de órdenes de trabajo con reparto a proveedores, sindicación de
anuncios, informes de propietario/inversor y **API abierta** [1](https://pickspace.com/property-management-software-features) [3](https://www.buildium.com/blog/best-property-management-software-2026/).

**b) Capa de IA agentiva (la gran novedad de 2026)** — asistentes que **atienden, clasifican y
actúan**: *EliseAI* cubre el ciclo conversacional completo en 51 idiomas escritos y 7 de voz y
automatiza ~90 % de las conversaciones rutinarias de alquiler; *Super* es voz-primero con
*triage* de mantenimiento; *Haven* hace detección de emergencias y emparejamiento de proveedores;
*Mezo/Property Meld* clasifica incidencias sobre 75.000 categorías y reporta 30 % de resolución más
rápida; AppFolio (Realm-X Performers), Yardi (Virtuoso), Entrata y Buildium (Lumina) integran
agentes y **lectura OCR de facturas** [1](https://www.vellum.ai/blog/best-ai-assistants-for-property-managers) [5](https://www.usehaven.ai/post/best-ai-property-management-software-guide) [3](https://www.revela.co/resources/best-ai-property-management-software).

**c) Software español de gestión de alquileres** — aquí está la competencia directa:
* **Rentger** (grupo idealista): recibos/facturas automáticos, **ficheros SEPA de cobro y pago**,
TPV en línea, **integración bancaria**, conciliación, **generación de modelos tributarios
(147/303/115)**, OCR de facturas de suministros, portal de inquilino y propietario, *screening* de
inquilinos, alertas (fin de contrato, actualización de renta, impagos), generador de inventario y
SLA de proveedores en incidencias [6](https://www.softwaredoit.es/rentger/rentger.html) [3](https://app.rentger.com/software_program_integral_management_rental) [2](https://thestackagent.com/software-gestion-alquileres-guia-profesional/).
* **Homming**: **conexión con más de 25 entidades bancarias** importando movimientos hasta 3 veces al
día con conciliación automática, pasarelas de pago (tarjeta y transferencia), **VeriFactu incluido**,
escáner IA de facturas, agente IA conversacional, informes personalizados, **app iOS/Android**, iCal,
y portales de gestor, inquilino, propietario **y proveedor** [2](https://homming.com/planes-de-precios) [5](https://www.elconfidencial.com/vivienda/2026-07-21/automatizacion-gestion-inmobiliaria-profesional-1hms-1svm_4393587/) [2](https://homming.com/blog/automatizar-gestion-alquileres-como-ahorrar-tiempo-y-ganar-tranquilidad).
* **Fynkus / administración de fincas**: app de propietario/comunidad con cuentas mensuales
conciliadas, cobro por SEPA y gestión de incidencias [6](https://www.orendafincas.com/).

**d) Servicios adyacentes** — verificación de solvencia con ficheros reales (**ASNEF, RAI,
BADEXCUG, FIM, CIRBE**), biometría y análisis de autenticidad documental: CrossCheck, S-CAIM,
Housfy EBI [1](https://ofertatucasa.com/blog/verificar-solvencia-inquilino/) [7](https://www.crosscheck.es/) [8](https://www.s-caim.es/informe-de-viabilidad/); y CMMS de mantenimiento con SLA de
proveedores, certificados y mantenimiento preventivo [5](https://oxmaint.com/industries/government/best-cmms-property-management-software-comparison) [3](https://facilio.com/blog/property-management-maintenance-software/).

---

## 3. Matriz comparativa (app vs. mercado)

Leyenda: **✅ sí** · **🟡 parcial** · **❌ no** · *(—)* no aplica al modelo.

| Capacidad | Esta app | Suites globales | España (Rentger/Homming) |
|---|---|---|---|
| Cobro en línea (tarjeta/transferencia/pasarela) | ❌ verificada ausencia | ✅ | ✅ |
| Domiciliación SEPA de recibos | 🟡 genera PAIN.008 (sin ejecución ni retornos) | ✅ | ✅ |
| Conexión bancaria automática (PSD2/agregador) | ❌ importación manual de ficheros | ✅ | ✅ (Homming, 25+ bancos) |
| Conciliación bancaria | ✅ manual asistida con motor de *matching* | ✅ | ✅ (automática) |
| Liquidación a propietario + orden de pago | ✅ | ✅ | ✅ |
| Contabilidad general / exportación contable | ❌ no hay GL ni export A3/Holded/Odoo/QBO | ✅ | ✅ |
| Verificación externa de solvencia (ASNEF/FIM/CIRBE) | ❌ (scoring propio + IA documental) | ✅ | ✅ |
| Antifraude documental / biometría | ❌ | ✅ | ✅ |
| Firma electrónica cualificada | ❌ (OTP interno) | ✅ | ✅ (Signaturit) |
| Escáner IA de facturas → gasto | ❌ (IA orientada a documentos de candidato) | ✅ | ✅ |
| VeriFactu / remisión AEAT | 🟡 cola preparada, `INDISPONIBLE` | n/a | ✅ Homming lo incluye |
| Modelos fiscales (180/347/303) | ❌ (resúmenes, no modelos) | n/a | ✅ Rentger |
| Actualización anual de renta (IPC/IRAV) con anexo y aviso | ❌ (solo estimación en *pricing* de recomercialización) | ✅ | ✅ |
| Control de fianza (depósito autonómico, plazos, devolución) | 🟡 importes modelados; sin trámite ni alertas | n/a (EE.UU.: *deposits/trust*) | ✅ |
| Órdenes de trabajo con reparto a proveedor | 🟡 trabajos/presupuestos y portal del profesional | ✅ | ✅ |
| SLA de proveedor y certificados (seguro RC, altas) | ❌ | ✅ | ✅ Rentger |
| Mantenimiento preventivo | ✅ tareas y garantías | ✅ | ✅ |
| Mantenimiento predictivo / IoT | ❌ | 🟡 (líderes) | ❌ |
| Presupuesto anual por inmueble y desviación | ❌ (solo desviación de obra) | ✅ *variance to budget* | 🟡 |
| App móvil / PWA instalable y *push* | ❌ (sin `manifest` ni *service worker*) | ✅ | ✅ |
| WhatsApp / SMS como canal real | 🟡 canal preparado, `WHATSAPP: null` | ✅ | ✅ |
| Asistente IA conversacional 24/7 (voz/chat) | 🟡 asistente transversal con 3 consultas tipadas | ✅ | ✅ |
| Portal de inquilino / propietario | ✅ (sin app, vía web) | ✅ | ✅ |
| Portal de proveedor | 🟡 sección propia en ERP | ✅ | ✅ Homming |
| Informes tipo *rent roll* / T-12 / paquete de inversor | 🟡 informes de cartera y rentabilidad + PDF | ✅ | 🟡 |
| Sindicación/publicación en portales | 🟡 feed y adaptadores sin conexión real | ✅ | ✅ |
| API pública / webhooks / integraciones | ❌ | ✅ (estándar de compra) | 🟡 |
| Multi-idioma | ❌ (solo español) | ✅ | 🟡 |
| **Multi-titularidad, cuotas y carteras con delegación L/E auditada** | ✅ **por encima del mercado** | 🟡 (multi-entity, sin cuotas) | 🟡 |
| **Actas con OTP, inventario comparado e inmutabilidad** | ✅ **nivel CMMS** | 🟡 | 🟡 |
| **Morosidad con requisito de procedibilidad LO 1/2025** | ✅ **no visto en competidores** | n/a | 🟡 |
| **Expediente fiscal ZIP con índice y hashes** | ✅ | 🟡 | 🟡 |
| **Gobierno de IA con permisos/cuotas y denegación por defecto** | ✅ **por encima del mercado** | 🟡 | ❌ |

---

## 4. Funciones que añadirían más valor (por bloque)

> Orden interno de cada bloque: primero lo que **trae dinero o reduce riesgo de pérdida**, después lo
> que **ahorra trabajo**, después lo que **amplía canal**. Esfuerzo estimado en semanas de una
> persona (sin contar homologaciones externas) y dependencia marcada.

### A · Dinero: cobrar, mover y vigilar el efectivo

**A1. Pasarela de pago para el inquilino (tarjeta y transferencia)** — *valor muy alto ·
esfuerzo S–M · dependencia: proveedor de pagos + reglas* · hoy **no existe ninguna**: el inquilino ve
su recibo pero no puede pagarlo desde el portal. Es la función más repetida del mercado
(Homming: «pagos con tarjeta & transferencia»; Rentger: TPV en línea) [2](https://homming.com/planes-de-precios) [6](https://www.softwaredoit.es/rentger/rentger.html). Encaja con la arquitectura actual: el
resultado debe terminar **siempre** en `registrarPagoPeriodo`, nunca en una escritura paralela.

**A2. Domiciliación SEPA real y ciclo de devoluciones** — *valor alto · esfuerzo M–L · dependencia:
banco/acreedor SEPA* · ya se generan PAIN.008 y existen `mandatos_sepa`, pero no hay ejecución,
**remesa de retorno (R-transactions)**, ni reclamo de adeudos devueltos. Añadirlo convertiría el
calendario de cobros en un circuito cerrado y alimentaría la morosidad **automáticamente** con el
retorno real del banco.

**A3. Conexión bancaria automática (agregación PSD2)** — *valor muy alto · esfuerzo M + contrato con
agregador* · hoy la conciliación depende de descargar ficheros a mano. Homming importa de **más de 25
bancos hasta 3 veces al día** [5](https://www.elconfidencial.com/vivienda/2026-07-21/automatizacion-gestion-inmobiliaria-profesional-1hms-1svm_4393587/). Con el motor de *matching* y la persistencia
de conciliación ya construidos, esto es **casi solo un adaptador**: el salto de valor por unidad de
esfuerzo más alto de toda la lista.

**A4. Previsión de tesorería de 12 meses** — *valor medio-alto · esfuerzo S* · los cobros futuros ya
están materializados en cada contrato y los gastos recurrentes existen: falta la vista de **caja
proyectada por inmueble/cartera** (entradas esperadas, vencimientos, hipotecas, IBI, seguros). Es un
informe nuevo sobre datos que ya son ciertos, no una funcionalidad nueva.

**A5. Exportación contable y cierre de ejercicio para el asesor** — *valor alto en gestoría ·
esfuerzo S–M* · no hay libro diario, ni exportación a A3/Holded/Odoo/QBO, ni asientos. El mercado lo
considera estándar («integrations: QuickBooks, Xero», GL completo) [1](https://pickspace.com/property-management-software-features). Con `gastos`, `cobros`,
`facturas` y `liquidaciones` ya normalizados, un **export contable por ejercicio con mapeo de cuentas
configurable** desbloquea al despacho contable como usuario real.

### B · Captar mejor y proteger la operación (riesgo del inquilino)

**B1. Verificación externa de solvencia** — *valor muy alto · esfuerzo M · dependencia: proveedor
(ASNEF/FIM/CIRBE o un agregador tipo CrossCheck/S-CAIM)* · el scoring propio actual se basa en
documentos aportados y análisis IA; el mercado cruza **ficheros reales de morosidad, biometría y
autenticidad documental**, con consentimiento RGPD explícito [1](https://ofertatucasa.com/blog/verificar-solvencia-inquilino/) [7](https://www.crosscheck.es/). Es la función que más
directamente **reduce la morosidad futura**, y encaja como *puerto* dentro del módulo de candidatos
(el criterio se toma igual, lo que cambia es la calidad del dato).

**B2. Verificación de autenticidad documental (antifraude)** — *valor alto · esfuerzo M · dependencia:
proveedor o modelo* · nóminas y contratos manipulados son el fraude más común del alquiler español;
el mercado ya lo trata como estándar (veracidad documental, comparativa declarado vs. real) [7](https://www.crosscheck.es/).

**B3. *Self-showing* / visita autoguiada con verificación previa** — *valor medio-alto · esfuerzo M* ·
ahorra visitas no cualificadas (el mercado vende «self-showing + verificación de identidad» como
diferenciador de captación) [1](https://www.vellum.ai/blog/best-ai-assistants-for-property-managers). Existe ya toda la base de agenda, slots, invitaciones y
tokens: sería una extensión del portal público, no un sistema nuevo.

**B4. Suscripción real al seguro de impago desde el expediente** — *valor alto · esfuerzo S–M ·
dependencia: aseguradoras* · existe `solicitudes_seguro_impago` y el flujo Gmail; lo que falta es que
el expediente de morosidad se **convierta en siniestro con expediente documental completo**
(cartera, contrato, actas, recibos impagados, comunicaciones) en un clic. El requisito de
procedibilidad que ya modela el ERP es justo lo que la aseguradora pide.

### C · Cumplimiento español (la ventaja competitiva más defendible)

**C1. Actualización anual de renta (IPC/IRAV) con anexo, aviso y trazabilidad** — *valor alto ·
esfuerzo S–M* · hoy **no existe** en el ciclo contractual (solo una estimación dentro de
`pricingRecomerc`). Rentger y Homming lo venden explícitamente («automatic update of the rent»,
«actualización de rentas», alertas) [3](https://app.rentger.com/software_program_integral_management_rental) [2](https://homming.com/blog/automatizar-gestion-alquileres-como-ahorrar-tiempo-y-ganar-tranquilidad). Con `contratoCicloEngine` (anexos versionados)
ya construido, es un motor determinista pequeño + aviso + anexo firmable.

**C2. Control de fianza con obligaciones autonómicas** — *valor alto · esfuerzo M* · el ERP modela
importe y meses (`fianzaLegalMeses`, `fianzaLegalImporte`) y el retorno (`depositoFianzaADevolver`),
pero **no el trámite**: el depósito es obligatorio en el organismo autonómico con plazos por
comunidad (Madrid 30 días, Cataluña 2 meses; Comunitat Valenciana modelos 806/816) y devolución en un
mes desde la entrega de llaves, con sanción administrativa si no se deposita [1](https://legatiq.ai/guias/arrendamientos/cuanto-fianza-alquiler-2026) [2](https://www.arrenta.es/blog/alquiler-gestion/guia-alquiler-gestion-arrendamientos/).
Añadir **calendario de obligaciones por comunidad, acuse de depósito y alerta de devolución** es
valor inmediato y casi único en el mercado nacional.

**C3. Pre-asesoría fiscal del arrendador y modelos informativos (180/347, 303 si procede)** — *valor
alto en propietario particular · esfuerzo M* · ya existen motor fiscal y expediente con hashes; falta
el **borrador de datos para el modelo** con umbrales vigentes (p. ej. 3.005,06 € en el 347) y el
paquete anual para el asesor. Rentger lo ofrece como generación de modelos [2](https://thestackagent.com/software-gestion-alquileres-guia-profesional/) [6](https://declarando.es/blog/calendario-fiscal-del-autonomo).
Debe presentarse siempre como **preparación de datos**, nunca como presentación telemática.

**C4. VeriFactu en producción y firma electrónica cualificada** — *valor alto · esfuerzo M + certificado
del usuario* · la cola ya existe (`verifactuTransport` devuelve `INDISPONIBLE`); el mercado ya vende
«incluye VeriFactu» [2](https://homming.com/planes-de-precios). Ídem firma: OTP interno funciona para
actas, pero contratos y anexos piden firma electrónica reconocida (Signaturit/DocuSign) [2](https://homming.com/planes-de-precios).

**C5. Cumplimiento de límites de renta (zonas tensionadas) e índice de referencia** — *valor medio ·
esfuerzo S–M* · **no hay ninguna mención** en el código. Con el *pricing* y el catastro ya
conectados, avisar de que un precio supera el límite aplicable en una zona declarada tensionada es
un diferenciador de cumplimiento que ningún competidor nacional comunica con claridad.

### D · Operación y mantenimiento profesionalizados

**D1. SLA de proveedor y certificados del profesional** — *valor alto · esfuerzo M* · Rentger vende
«SLA provider» dentro de incidencias [3](https://app.rentger.com/software_program_integral_management_rental) y el CMMS de referencia lo considera definitorio
(«vendor SLA enforcement, compliance documentation per work order») [5](https://oxmaint.com/industries/government/best-cmms-property-management-software-comparison). Falta: tiempo de
respuesta comprometido por categoría, aviso de incumplimiento, y **control de documentos del
proveedor** (seguro de responsabilidad civil, alta, certificados) con caducidad.

**D2. Tablero de despacho de órdenes de trabajo** — *valor alto · esfuerzo M* · el propio análisis del
mercado señala que **incluso los líderes fallan** aquí (asignación manual, confirmación del proveedor,
aviso al inquilino de la hora, cierre e informe) [9](https://ustechautomations.com/resources/blog/buildium-vs-appfolio-property-management-2026). El ERP tiene
trabajos, presupuestos, portal del profesional e incidencias con seguimiento: un **tablero único por
estado/prioridad/profesional** y transiciones con aviso automático es el mayor ahorro de coordinación
posible hoy.

**D3. Presupuesto anual por inmueble y desviación** — *valor alto para propietario e inversor ·
esfuerzo S–M* · no existe (`presupuesto` aparece solo como presupuesto de obra y de profesional). El
mercado lo vende como *variance to budget* con alerta temprana [1](https://pickspace.com/property-management-software-features) [4](https://www.doorloop.com/blog/best-commercial-property-management-software). Con
`gastos_recurrentes`, `gastos`, `financiaciones` y `liquidaciones` el dato ya está.

**D4. Registro de activos con vida útil y plan de CapEx** — *valor medio-alto · esfuerzo M* · hay
inventario por inmueble y garantías, pero no el **activo con fecha de instalación, vida útil,
coste de reposición e historial de averías**, que es lo que permite planificar en vez de reaccionar
[5](https://oxmaint.com/industries/government/best-cmms-property-management-software-comparison). Es el puente natural hacia el bloque 1 del roadmap (seguros y equipo).

### E · Canales, IA y experiencia

**E1. PWA instalable + notificaciones push** — *valor alto · esfuerzo S–M* · **verificado**: no hay
`manifest`, ni *service worker*, ni mensajería FCM; el mercado considera la app móvil estándar y
Homming la personaliza para el gestor [2](https://homming.com/planes-de-precios). Con notificaciones
push (recordatorio de pago, avería asignada, renovación) los avisos dejan de depender del correo.

**E2. Escáner IA de facturas → gasto** — *valor alto y muy visible · esfuerzo M* · está identificado en
el propio mapa (§16.4) como funcionalidad de otra aplicación a recuperar; hoy **no existe** el flujo
factura→campos→corrección→inmueble→gasto. Es la funcionalidad de IA que el mercado percibe como más
útil en el día a día del gestor [5](https://www.usehaven.ai/post/best-ai-property-management-software-guide) [2](https://homming.com/planes-de-precios).

**E3. Asistente ampliado a analista de cartera (`IA_CARTERA_TRANSVERSAL`)** — *valor alto · esfuerzo
M–L* · el asistente actual tiene **3 consultas tipadas**; el mercado 2026 ya vende consulta
generativa sobre toda la cartera [5](https://www.usehaven.ai/post/best-ai-property-management-software-guide). El gobierno de IA (permisos, cuotas, denegación por
defecto) ya está construido: falta **ampliar el catálogo de consultas**, no la infraestructura.

**E4. WhatsApp/SMS transaccional** — *valor alto en España · esfuerzo S–M · dependencia: proveedor* ·
canal declarado pero `WHATSAPP: null`; el recordatorio de pago y la coordinación de averías por
WhatsApp es lo que realmente leen los inquilinos.

**E5. Paquete mensual de propietario («investor package») automático** — *valor alto para captar
propietarios-cartera · esfuerzo S–M* · existe la liquidación y el portal; falta el **informe mensual
con marca, comparativa con el mes anterior, desviación y documentos adjuntos, enviado solo** [1](https://pickspace.com/property-management-software-features).
Es la herramienta comercial más eficaz para ganar carteras a la competencia.

**E6. API pública y webhooks** — *valor medio ahora, alto al escalar · esfuerzo M* · el mercado lo
trata como requisito de compra [1](https://pickspace.com/property-management-software-features); para un ERP que ya tiene contrato de import/export canónico, exponer un subconjunto
(lectura de cartera, altas de incidencia, eventos de cobro) abre integraciones con asesores,
aseguradoras y herramientas propias del propietario.

**E7. Multi-idioma (ES/EN) en portales** — *valor medio · esfuerzo M* · sin i18n; el alquiler a
extranjeros y la gestión de propietarios no residentes lo justifican (EliseAI cubre 51 idiomas
escritos como referencia de mercado) [1](https://www.vellum.ai/blog/best-ai-assistants-for-property-managers).

---

## 5. Diferenciadores que ya existen y conviene proteger

Lo que **no** se debe diluir al añadir funciones, porque es lo que el mercado nacional no tiene:

1. **Multi-titularidad real con cuotas, transmisión y baja patrimonial auditadas** — el mercado
   modela «propietario» como un campo; aquí es una entidad con historia. Ventaja clara frente a
   suites que solo entienden *single owner* o *multi-entity* contable.
2. **Carteras con delegación L/E, aceptación del titular y revocación inmediata sin cambiar la
   titularidad** — resuelve el caso real «el gestor administra inmuebles de terceros» mejor que la
   competencia, que suele resolverlo con permisos planos.
3. **Actas de entrada/salida con OTP, inventario comparado e inmutabilidad** — nivel de CMMS dentro
   de un ERP de alquiler.
4. **Morosidad con requisito de procedibilidad (LO 1/2025)** y política versionada — nadie lo
   comunica como función.
5. **Expediente fiscal en ZIP con índice y hashes** — entregable defendible ante inspección o
   due diligence.
6. **Gobierno de IA explícito** (permisos por perfil, tarifas, cuotas, denegación por defecto) — la
   mayoría del mercado despliega IA sin este control; aquí es una ventaja de confianza y de coste.
7. **Importación/exportación canónica con dry-run y procedencia** — puerta de entrada para migrar
   carteras de la competencia sin riesgo (argumento comercial directo).
8. **Portales de los cuatro roles** (admin, propietario, profesional, inquilino) con superficie
   mínima y saneado por listas blancas.

---

## 6. Priorización recomendada

Criterio: **valor para el negocio ÷ esfuerzo**, penalizando lo que exige homologación externa.

| Prioridad | Función | Valor | Esfuerzo | Dependencia externa |
|---|---|---|---|---|
| **P1** | A3 · Conexión bancaria automática (adaptador sobre la conciliación ya existente) | Muy alto | M | Agregador PSD2 |
| **P1** | A1 · Pasarela de pago del inquilino | Muy alto | S–M | Proveedor de pagos |
| **P1** | E2 · Escáner IA de facturas → gasto (ya identificado en §16.4) | Alto | M | — |
| **P1** | C1 · Actualización anual de renta (IPC/IRAV) con anexo y aviso | Alto | S–M | — |
| **P2** | D2 · Tablero de despacho de órdenes de trabajo | Alto | M | — |
| **P2** | B1 · Verificación externa de solvencia | Muy alto | M | ASNEF/FIM/agregador |
| **P2** | C2 · Control de fianza con obligaciones autonómicas | Alto | M | — |
| **P2** | E1 · PWA + push | Alto | S–M | — |
| **P2** | E5 · Paquete mensual de propietario | Alto | S–M | — |
| **P3** | A5 · Export contable para el asesor | Alto | S–M | — |
| **P3** | D3 · Presupuesto anual y desviación | Alto | S–M | — |
| **P3** | A2 · SEPA real y devoluciones | Alto | M–L | Banco |
| **P3** | E4 · WhatsApp/SMS | Alto | S–M | Proveedor |
| **P3** | E3 · Asistente como analista de cartera | Alto | M–L | — |
| **P4** | D1 · SLA y certificados de proveedor · C3 · modelos 180/347 · C4 · VeriFactu y firma cualificada · C5 · zonas tensionadas · D4 · activos/CapEx · E6 · API pública · E7 · i18n | Medio-alto | M | Según caso |

**Regla de secuencia propuesta:** primero **F0 (P0 técnicos ya documentados)** para que captación y
avisos funcionen de verdad; después **A1+A3** (dinero) y **E2+C1** (ahorro diario y cumplimiento);
después **B1+D2** (riesgo y operación); y el resto por capacidad. No conviene abrir IA nueva ni
canales nuevos antes de cerrar F0: la IA y los avisos se apoyan en esos mismos circuitos.

---

## 7. Fuentes de mercado consultadas (16-10-2026)

- Suites globales y capacidades estándar: [AppFolio](https://www.appfolio.com/blog/best-property-management-softwares-compared-2026) · [Buildium](https://www.buildium.com/blog/best-property-management-software-2026/) · [listado completo de funcionalidades](https://pickspace.com/property-management-software-features) · [comparativa de funciones](https://ustechautomations.com/resources/blog/buildium-vs-appfolio-property-management-2026) · [comercial/inversor](https://www.doorloop.com/blog/best-commercial-property-management-software).
- IA agentiva: [asistentes para property managers](https://www.vellum.ai/blog/best-ai-assistants-for-property-managers) · [guía de software con IA](https://www.usehaven.ai/post/best-ai-property-management-software-guide) · [análisis de IA en PM](https://www.revela.co/resources/best-ai-property-management-software).
- España: [Rentger (funcionalidades)](https://app.rentger.com/software_program_integral_management_rental) · [Rentger (ficha)](https://www.softwaredoit.es/rentger/rentger.html) · [análisis comparativo español](https://thestackagent.com/software-gestion-alquileres-guia-profesional/) · [Homming (planes y funciones)](https://homming.com/planes-de-precios) · [Homming (automatización)](https://homming.com/blog/automatizar-gestion-alquileres-como-ahorrar-tiempo-y-ganar-tranquilidad) · [Homming (prensa: 25 bancos)](https://www.elconfidencial.com/vivienda/2026-07-21/automatizacion-gestion-inmobiliaria-profesional-1hms-1svm_4393587/) · [Fynkus/app de propietarios](https://www.orendafincas.com/).
- Solvencia y antifraude: [guía de estudio de solvencia (ASNEF/RAI/BADEXCUG/FIM)](https://ofertatucasa.com/blog/verificar-solvencia-inquilino/) · [CrossCheck](https://www.crosscheck.es/) · [S-CAIM](https://www.s-caim.es/informe-de-viabilidad/).
- Fianza y fiscalidad española: [fianza y depósito autonómico](https://legatiq.ai/guias/arrendamientos/cuanto-fianza-alquiler-2026) · [guía de gestión de arrendamientos](https://www.arrenta.es/blog/alquiler-gestion/guia-alquiler-gestion-arrendamientos/) · [modelos anuales (180/347)](https://declarando.es/blog/calendario-fiscal-del-autonomo).
- Mantenimiento/CMMS: [capacidades de CMMS para propiedad](https://oxmaint.com/industries/government/best-cmms-property-management-software-comparison) · [comparativa de software de mantenimiento](https://facilio.com/blog/property-management-maintenance-software/).

*(Los datos concretos de plazos y modelos fiscales son los que publican esas fuentes; **cualquier
implementación debe verificarse normativamente antes de codificarse**, conforme a la regla de oro del
mapa maestro: no se inventan reglas fiscales, bancarias ni jurídicas.)*

---

## 8. Custodia de este análisis

Solo se añade este documento. **No** se ha modificado código, reglas, configuración, lockfiles ni
datos; **no** se han publicado reglas, **no** se ha consumido IA ni servicios externos, y **no** se
ha probado ningún producto de terceros (sus capacidades se citan de fuentes públicas). Este documento
es una entrada para decidir producto; **no** autoriza desarrollos: cada función elegida deberá pasar
por su propia orden, con su puerta de salida verificable.
