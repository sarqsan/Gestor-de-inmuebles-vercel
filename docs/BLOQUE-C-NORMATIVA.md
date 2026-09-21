# BLOQUE C — Marco normativo, criterios y decisiones (2026-09-20)

> **Principio rector del bloque:** el ERP **no asesora ni decide en Derecho**. Codifica como reglas de
> negocio los requisitos que afectan a la **procedibilidad y a la prueba**, exige fuentes y evidencias,
> y **nunca inventa** porcentajes, plazos legales ni estados de un procedimiento. Todo lo que depende
> de un tercero o de un criterio jurídico humano queda marcado **EXTERNO** o **PENDIENTE DE
> VERIFICACIÓN JURÍDICA**.

## 1. Fuentes consultadas y qué se ha codificado

| Fuente | Contenido relevante | Efecto en el código |
|---|---|---|
| **LAU** (Ley 29/1994; consolidación vigente 2023-05-25) art. 17.4 | El arrendador está obligado a emitir recibo del importe satisfecho; si no lo emite, la prueba del pago por el arrendatario le impone costas | La evidencia de pago se referencia desde la fuente canónica de cobros; el ERP no sustituye ni anula el recibo legal. **IMPLEMENTADO** como trazabilidad, no como emisión de recibos |
| LAU art. 22.2 (enervación) | La enervación no es admisible si hubo otra previa, o si el arrendador **requirió de pago** por cualquier medio que permita acreditar su constancia con al menos **4 meses** de antelación a la demanda | Un `ComunicacionExpediente` de medio fehaciente con evidencia registrada se modela como **`requerimientoFehacienteExiste`** y es requisito de procedencia del escalado (**IMPLEMENTADO** como bandera y gate). El cálculo de los 4 meses **no** se automatiza: **PENDIENTE / verificación jurídica** |
| **LEC** art. 250.1.1º, 437.4.3º, 439, 440.3, 449.1 | Desahucio por impago = **juicio verbal** cualquiera que sea la cuantía; acumulación objetiva de la reclamación de cantidad "de análoga naturaleza"; los rentas vencidas son condenables si se piden; el LAJ da **10 días** para desalojar/pagar/enervar/oponer; recurso exigiendo estar al corriente de rentas | `ExpedienteJuridico.cauceAviso` documenta el cauce (verbal de desahucio + acumulación de cantidad, y monitorio como alternativa) para que el dossier llegue completo al letrado. **PREPARADO**: el ERP no presenta nada ni sigue plazos procesales |
| **LEC** art. 812-819 (monitorio) + Ley 13/2009 | Deuda líquida, vencida, exigible y documentada; límite **250.000 €**; sin abogado/procurador bajo **2.000 €**; control de cláusulas abusivas en la admisión | El expediente exige que las piezas sean importe determinado por mes y estén documentadas (evidencias/comunicaciones) antes de escalar. **IMPLEMENTADO** como validaciones de procedencia del dossier |
| **LO 1/2025** (BOE-A-2025-76), DF 5.2 — MASC previos | Requisito de procedibilidad: actividad negocial previa en los procedimientos del Libro II y en los Juicios Verbales especiales (incluidos desahucio por falta de pago y monitorio, según la práctica mayoritaria de Juntas de Jueces); omisión no subsanable, sí subsanable la aportación del documento acreditativo; exenciones: monitorio europeo, demanda ejecutiva, medidas cautelares previas, diligencias preliminares, jurisdicción voluntaria, parte del sector público | `EstadoRequisitoProcedibilidad = NO_VERIFICADO \| PENDIENTE \| CUMPLIDO_EVIDENCIA \| IMPOSIBILIDAD_DECLARADA` en `ExpedienteJuridico`, **gate** de la transición `ESCALADA → JURIDICA` (`juridica_requerido…`, código `juridica_requiere_actividad_negociadora_previa_LO1_2025`) con evidencia asociada (`masc_cumplido_requiere_evidencia`) y aviso `masc_pendiente_puede_impedir_admision_a_tramite_LO_1_2025`. **IMPLEMENTADO** como control documental; **nunca** lo decide la máquina |
| **CC** art. 1100, 1101, 1108 | La mora exige requerimiento (o demanda); indemnización de daños e intereses; a falta de pacto, interés legal del dinero | `ParametrosIntereses.inicioMoraRequiereRequerimiento` → error `mora_exige_requerimiento_art1100_CC` si se intenta computar mora sin requerimiento registrado. Solo **interés simple**, base `SOLO_CAPITAL` (`anatocismo_no_admitido`). **Sin tipo numérico fijado por el ERP**: requiere `tipoAnualPct` + fuente (`validarFuenteNormativa`) y mientras tanto el concepto es `ESTIMADO` y `no_presentable_como_definitivo`. **IMPLEMENTADO**; el tipo vigente → **PENDIENTE / EXTERNO** |
| **CC** art. 1964.2 (redacción Ley 42/2015) y 1973 | Prescripción de **5 años** desde que pudo exigirse; en obligaciones de tracto sucesivo el plazo corre para cada incumplimiento (cada mensualidad tiene su cómputo); la prescripción se interrumpe por reclamación judicial **o extrajudicial** y por reconocimiento de deuda | Aviso de `prescripcion` por pieza (días desde vencimiento) y bandera `reclamacionPreviaRegistrada`; cada `ComunicacionExpediente` queda como **acto de interrupción trazable** (fecha + medio + evidencia). **IMPLEMENTADO** como información; **no** se extinguen deudas automáticamente |
| **Ley 12/2023** (medidas frente a la ocupación) | Suspensión del desahucio para hogares vulnerables: 2 meses naturales / 4 meses personas jurídicas, ampliable; indicadores ~3× IPREM y carga > 30 % | El modelo admite atributos fechados de vulnerabilidad/suspensión como **datos declarados con evidencia**, nunca decididos por el ERP. **PREPARADO** (campo de notas/atributos en el expediente jurídico); sin automatismos |
| **LOPDGDD** art. 20.1.d y **RD 1720/2007** art. 194 | En sistemas de información de solvencia patrimonial: datos de impago solo mientras persista el incumplimiento y hasta **5 años desde el vencimiento**; deuda cierta, vencida y exigible, con reclamación previa; cancelación al pagar; límite de conservación histórica de 6 años; umbral de 300 € citado por la doctrina | **No existe** en el BLOQUE C ningún alta, remisión ni integración con ficheros de morosidad: sería **EXTERNO** y requiere base jurídica y contrato de encargo. El ERP solo muestra avisos (`prescripcion`, `reclamación previa registrada`) y **nunca** decide el reporte. **IMPLEMENTADO** como salvaguarda informativa; el reporte: **no hecho a propósito** |
| Guía de cláusulas LAU (transportes.gob.es) | La LAU vigente **no** fija un porcentaje de "gastos de demora"; los gastos de recobro frente al arrendatario exigen cláusula y tienen control de abusividad | `construirConceptoGastos` exige justificante/evidencia (`gasto_requiere_justificante_evidencia`) y la penalización solo puede existir con cláusula documentada en `fuenteNormativa`. **Sin cifras fijas** en el código |

## 2. Criterios de política de recobro y su naturaleza

- `PASOS_POLITICA_DEFECTO`: **PRE-5** (aviso previo), **D+0**, **D+3**, **D+10**, **D+20**, **D+30** con
  acción, canal, destinatarios, prioridad y activación configurables por propietario.
- `fechaObjetivo = vencimiento + diasOffset + diasGracia` (por defecto `diasGracia = 2`, compartido con
  `DIAS_GRACIA_RETRASO` de `cobrosEngine`); tolerancia de céntimos para evitar falsos impagos por redondeo.
- Estos días **no son plazos legales**: la exigencia de la demanda no es un requisito de validez formal y el
  burofax/acuse es práctica probatoria. Documentado en los comentarios del módulo y en la UI del editor de política.
- Cambiar la política **no** altera el histórico ni los planes ya generados (`versionarPolitica` emite
  `paso_retirado:*`, `paso_nuevo:*`, `dias_gracia_cambiados_no_reescriben_plan_existente`).
- Escalado automático **no existe**: `evaluarEscalado` devuelve bloqueos
  (`politica_dias_minimos:{n}`, `politica_meses_minimos:{n}`, `requiere_requerimiento_fehaciente_registrado`,
  `masc_actividad_negociadora_previa_no_declarada`) y la acción siempre la ejecuta una persona.

## 3. Datos que el ERP NO afirma (honradez de estados)

| Afirmación | ¿Puede hacerla el ERP? | Por qué / qué hace en su lugar |
|---|---|---|
| "Email/WhatsApp enviado" | **No** sin transporte configurado | `PENDIENTE_ENVIO` (expediente) y `FALLIDA` (documento GAP 1) con `email_no_configurado` en safe-mode |
| "Burofax/carta certificada/notaría remitidos" | **No** | `REGISTRADA_MANUALMENTE`, `externa:true`, sin `fechaEnvio`, con `requiereEvidencia:true`; la evidencia es lo que da valor probatorio |
| "Demanda presentada / número de procedimiento" | **No** | `ExpedienteJuridico.estado = PREPARADO`; `numeroProcedimiento` solo existe si una persona lo registra con evidencia (`registrarProcedimientoJudicial`) |
| "Comunicación a la aseguradora efectuada" | **No** | `ExpedienteAseguradora.estado = PREPARADO` + `envio_manual_requiere_evidencia_del_comprobante` |
| "Intereses/gastos definitivos" | **No** sin fuente | `conceptoSinConfigurar` → `NO_CONFIGURADO`, o `ESTIMADO` con `no_presentable_como_definitivo` |
| "Deuda extinguida por prescripción" | **No** | Solo aviso de días y de reclamación previa registrada |
| "Alta en fichero de morosidad" | **No** | Ni siquiera se modela: **no existe** esa capacidad en el BLOQUE C |
| "Pago registrado" | **Sí**, pero solo si existe en la fuente canónica | Vía `cobrosEngine.registrarPagoPeriodo` (`RECIBIDO`/`VERIFICADO`), nunca por un estado manual |

## 4. Aspectos de protección de datos y seguridad aplicados

- **Minimización en el portal del propietario:** `recortarResumenPropietario` con lista blanca
  `CAMPOS_RESUMEN_PROPIETARIO` (20 campos). No se exponen nombre/contacto del inquilino, política de
  recobro, estrategia de escalado, aseguradora, letrado ni evidencias internas.
- **No hay roles nuevos**; se reutiliza RBAC (`ADMINISTRADOR` escribe, `PROPIETARIO` lee su espejo).
- **Aislamiento por `propietarioId`** en las 6 colecciones nuevas y en el espejo (reglas §32–§37).
- **Secretos prohibidos en datos de recobro:** `sinSecretosMorosidad()` en reglas +
  `CLAVES_PROHIBIDAS_EVIDENCIA` (incluidos `ibanSecreto`, `cvv`, `pin`, `otp`, `privateKey`,
  `base64Data`, `adjuntoBase64`); **no se guardan credenciales de acceso ni datos de pago del inquilino**.
- **Adjuntos:** solo referencia a Storage; el binario no entra en Firestore (la subida es **PENDIENTE**).
- **Conservación:** el expediente no se borra ordinariamente (`allow delete: if false`); cualquier
  política de conservación/bloqueo por prescripción es decisión del responsable del tratamiento y queda
  **PENDIENTE** de definir con su base jurídica.

## 5. Pendientes de verificación jurídica (no afirmados)

1. **Texto exacto y alcance de LAU art. 17.5** (fianza y gastos de devolución de documentos) — **PENDIENTE
   DE VERIFICAR**; no se ha codificado regla alguna a partir de él.
2. **Redacción exacta de LOPDGDD arts. 19-21** (deber de información en procedimientos de solvencia) —
   **PENDIENTE DE VERIFICAR**; el bloque no realiza altas, por lo que no hay efecto práctico.
3. **Importe del interés legal del dinero vigente (2026)** — **NO confirmado** en las fuentes consultadas;
   el ERP **no lo fija**: debe introducirlo el usuario con su fuente y fecha de consulta.
4. **Discrepancia de fuentes sobre el plazo de la enervación** (una fuente secundaria indicaba "30 días"
   frente a los "4 meses" del art. 22.2 LAU en la norma al día del BOE) — se ha seguido el criterio del BOE
   y **no** se ha automatizado cómputo alguno: **REQUIERE CONFIRMACIÓN JURÍDICA**.
5. **Admisibilidad del monitorio frente a cantidades de renta** (criterio de "cantidades análogas") —
   documentado como aviso para el letrado; el ERP **no** elige el cauce: **PENDIENTE / EXTERNO**.

> Estos cinco puntos son los únicos **no confirmados** tras la búsqueda documental. Ninguno se ha
> codificado como valor numérico, umbral automático ni afirmación de derecho.
