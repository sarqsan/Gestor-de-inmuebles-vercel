# FASE 2 — MAPA ORIGEN → DESTINO: Rentasync → ERP BASE

**Fecha:** 2026-09-26 · **Rama:** `arena/01a0d97d-gestor-de-inmuebles-vercel` · **Estado:** análisis y documentación. **NINGUNA escritura en Firestore, NI código funcional, NI migraciones, NI reglas, NI índices.**

**Naturaleza de los datos:** FUENTE EXTERNA — OTRA APP (Rentasync/AEAT). No son datos internos de la app BASE. El ZIP AEAT (Libro Diario) no está disponible y no tiene destino en la BASE.

**Evidencia de trabajo:** `docs/FASE2-ANEXO-EVIDENCIA-EXTERNA.json` (reconstrucción verificada; reproduce exactamente los números validados en FASE 1 con script sobre los ficheros custodiados originales — ver bloque `__VERIFICACION_ESPERADA__` del anexo).

---

## 0. Limitaciones de evidencia (condicionan TODO el mapa)

1. **Reset 3 del sandbox (este turno):** `/home/user/datos-externos/` volvió a borrarse antes de empezar FASE 2. Los JSON custodiados y PROVENANCE.md se perdieron. El anexo reconstruye SOLO lo verificable; lo demás queda `__NO_DISPONIBLE__`.
2. **Final del fichero de gastos nunca recibido:** registro 27 (PDF firmado) truncado en ambos pegados; se desconoce si hay más registros después. Todos los importes "faltantes" de las conciliaciones podrían estar ahí. **PENDIENTE — no se interpreta como inexistente.**
3. **Contradicción A vs B sin resolver:** los dos pegados colocan registros distintos antes del mismo anclaje (`exp_1785785627424`). O son dos exports distintos o un pegado omitió un bloque. Consecuencia directa: posible **doble cómputo de rentas** (p_0: 6.000+6.000; p_1: 8.400+8.760). **NO se decide sin evidencia del usuario.**
4. **Valores por-campo de inmuebles no recuperables** (direcciones, precios, subcampos de contract/mortgage/tenantHistory/yearlyFinancials): el mapa los trata a nivel de bloque con `REQUIERE_MAPEO` por subcampo. El fichero original sigue siendo la fuente canónica.

**Canal de importación de la BASE (verificado este turno):** `ConfiguracionSection.handleExportJSON` exporta solo `{userProfile, inmuebles, candidatos, fechaExportacion}`; `handleProcessImport`/`App.handleImportData` solo aceptan `{inmuebles, candidatos}`, filtran por id existente y persisten **crudo, sin validación**. **No es un canal de migración válido para gastos/cobros/contratos** (categoría D: no usar).

---

## 1. Convenciones del mapa

- **Clasificación:** **A** = integrable directamente · **B** = integrable tras transformación · **C** = requiere validación humana previa · **D** = no integrar directamente (conservar como origen histórico / pendiente).
- **Clave estable de inmueble:** `propertyId` externo (`prop_*`) → `Inmueble.id` en la BASE (reutilización 1:1 con chequeo de colisión). La dirección NO se usa como identificador (regla del usuario). La referencia catastral NO es fiable como clave: 2 vacías + 1 duplicada (verificado en FASE 1).
- **Nulos/incompletos:** nunca se convierten en 0 ni se descartan: se marcan `PENDIENTE` / `NO_DISPONIBLE` / `REQUIERE VALIDACIÓN`.
- **Duplicados:** nunca se eliminan del origen; se documentan y se resuelven por validación humana.
- **Dinero:** redondeo explícito a 2 decimales en la transformación (existe `1933.6999999999998` en origen).
- **Fechas origen:** `date` de gastos = `YYYY-MM-DD` (OK); `registrationDate` = `D/M/YYYY` (ej. real: `7/7/2026`) → conversión con regla explícita día-primer.

---

## 2. Catálogo ORIGEN → DESTINO — INMUEBLES (`inmuebles_rentasync_2026-09-25.json`, 7 registros)

| # | Campo origen (tipo / ejemplo real) | Destino ERP (verificado en `src/types.ts`) | Transformación | Duplicados / nulos | Clas. | Observaciones y evidencia |
|---|---|---|---|---|---|---|
| I-01 | `id` (string, `prop_1783441481122_0`) | `Inmueble.id` | Reutilización 1:1 + chequeo de colisión con inmuebles existentes en BASE | ids únicos en origen (verificado); si colisiona → bloquear y revisar | **A** | Clave estable elegida; los 7 ids en anexo |
| I-02 | `address` (string; uno con espacio final) | `Inmueble.direccion` (obligatorio) + `ciudad` (obligatorio) | `trim()`; extraer/completar `ciudad` manualmente (origen no la separa) | 1 dirección con espacio final (verificado) | **B** (+**C** para `ciudad`) | `ciudad` sin fuente → REQUIERE VALIDACIÓN por inmueble |
| I-03 | `cadastralReference` (string, ej. `9388505YH1498G0006QK`) | `Inmueble.referenciaCatastral` + `Inmueble.datosFiscales.referenciaCatastral` | Copia directa | **2 vacías** (NO_DISPONIBLE, no usar como clave) + **1 duplicada** en dos inmuebles (verificado) | **C** | Duplicado: ¿error de origen o copropiedad? Validar antes de importar |
| I-04 | `registrationDate` (string D/M/YYYY, ej. `7/7/2026`) | `Inmueble.fechaAdquisicion` (YYYY-MM-DD) | Parseo día-primer explícito → ISO | Formato verificado en los 7 | **B** | Regla de parseo documentada; fechas ambiguas (día≤12) → C |
| I-05 | `purchasePrice` (number; valor NO_DISPONIBLE tras reset 3) | `Inmueble.valorAdquisicion` | Copia numérica | — | **B** | Validar semántica "precio de compra" ≠ valoración |
| I-06 | `currentValue` (number; NO_DISPONIBLE) | `Inmueble.valoracionEstimada` | Copia numérica | — | **B** | — |
| I-07 | `monthlyRent` (number; p_1 = 700, desactualizado vs contrato 730) | `Inmueble.precio` (€/mes, obligatorio) + `rentaMensual` | Copia; **para p_1 usar renta del contrato vigente (730)** | p_1 desactualizado (evidencia: anual 8.400 = 700×12 vs mensual 730×12) | **B** (+**C** p_1) | Ver incidencia INC-07 |
| I-08 | `landValuePercent` (number; NO_DISPONIBLE) | **NO EXISTE campo en ERP** (`Inmueble` verificado) | — | — | **D** | Conservar en origen; REQUIERE_MAPEO si el cálculo de amortización lo necesita (fase fiscal) |
| I-09 | `amortizationAmount` (number; NO_DISPONIBLE) | **NO EXISTE campo directo en ERP** | — | — | **D** | ERP tiene `Gasto.capitalAmortizado`/`intereses` por recibo, no amortización anual del inmueble; no forzar |
| I-10 | `expenses.Community/IBI/Insurance/Repairs` (agregados anuales, ej. p_1: IBI 207,97 / Community 420 / Insurance 892,65) | **NO importar** — ERP los deriva de los `Gasto` detallados | — | — | **D** | Importarlos duplicaría el cómputo. Uso exclusivo: reconciliación (ya hecha; deltas en anexo) |
| I-11 | `ownershipPercentageUser1/2` (numbers; suman 100 en los 7, verificado) | **NO EXISTE % en ERP**. Copropiedad = `Inmueble.propietarioPrincipalId` + `propietarioSecundarioId` + `datosFiscales.tieneSegundoPropietario/segundoPropietario` | Crear registros `Propietario`/`PropietarioFiscal`; los % no tienen destino | — | **C** (titulares) + **D** (% → conservar origen) | REQUIERE_MAPEO: impacto fiscal del % (el motor fiscal de la BASE no expone reparto porcentual) |
| I-12 | `owner` (string nombre; NO_DISPONIBLE tras reset 3) | `Propietario.nombre` (+ `nifCif` obligatorio: **NO_DISPONIBLE en origen**) | Crear entidad `Propietario` (tipo `persona_fisica` por defecto → validar) | NIF ausente → bloqueante para fiscal | **C** | Sin NIF no se puede completar el destino fiscal |
| I-13 | `contract{...}` (objeto; presente en 5/7; subcampos NO_DISPONIBLES) | `ContratoFormalizacion` | REQUIERE_MAPEO subcampo a subcampo cuando se recupere el original | 2 inmuebles sin contrato | **C** | El destino exige decenas de campos sin fuente: `propietarioDni/Iban`, `candidato*`, `fianzaLegalMeses/Importe`, `diaLimitePagoMes`, `estado`, `evaluacionAsegurabilidad`, `actaEntregaLlaves`, firmas… |
| I-14 | `tenantName` / `tenantDni` (strings; multi-inquilino por comas en 4 inmuebles; mezcla DNI/NIE) | `Inmueble.inquilinoActualNombre` + `ContratoFormalizacion.candidatoNombre/candidatoDni` (1º) y `cotitularNombre/cotitularDni` (2º) | Split por coma; 1º → candidato, 2º → cotitular | >2 inquilinos → sin modelo en ERP; DNI/NIE mezclado → validar formato | **B** (split) + **C** (>2 / formatos) | ERP NO tiene `interface Inquilino` (verificado FASE 0 y re-verificado: no existe en `src/types.ts`) |
| I-15 | `tenantHistory[]` (solo `prop_...122_1`; fechas invertidas: 2026-10-03 > 2026-09-07) | **NO EXISTE entidad de histórico de inquilinos** | — | Fechas invertidas = error de origen | **D** | Conservar como origen histórico; no forzar a contratos |
| I-16 | `mortgage*` (2/7; subcampos NO_DISPONIBLES) | `Prestamo` (`capitalInicial`, `tasaInteresAnual`, `plazoMeses`, `fechaInicio` YYYY-MM, `diaVencimiento`, `carenciaMeses`, `tramosTipo`, `amortizaciones`) | REQUIERE_MAPEO por subcampo cuando se recupere el original | 5 inmuebles sin hipoteca | **C** | Destino verificado; origen incompleto tras reset 3 |
| I-17 | `yearlyFinancials{"2026":{...}}` (6/7; contenido NO_DISPONIBLE) | **NO importar** — ERP deriva el resumen anual (motor fiscal) de cobros y gastos | — | — | **D** | Doble cómputo si se importa. Uso: reconciliación |

---

## 3. Catálogo ORIGEN → DESTINO — GASTOS E INGRESOS (unión A∪B: 51 registros verificados en anexo)

| # | Campo origen (tipo / ejemplo real) | Destino ERP | Transformación | Duplicados / nulos | Clas. | Observaciones y evidencia |
|---|---|---|---|---|---|---|
| G-01 | `id` (`exp_1783448839031`) | NO reutilizar como `Gasto.id` (formato ERP `gas_{inmuebleId}_{ts}`) ni `CobroPeriodo.id` (`cobro_{contratoId}_{anio}_{mes}`) | Generar id ERP; conservar el original en `Gasto.origenId`/`notas` y en `CobroPeriodo.observaciones` (trazabilidad) | 18 ids perdidos en reset 3 (`__ID_NO_RECUPERADO_R3_*__`) → PENDIENTE de recuperar del original | **B** | Trazabilidad origen→destino obligatoria para reversibilidad (FASE 5) |
| G-02 | `type=gasto` | `Gasto` con `tipo='EXPLOTACION'` (verificado: `TipoGasto`) | Fijo `EXPLOTACION` (ningún gasto externo es financiación) | — | **A** | Las hipotecas vendrían de `mortgage*` (I-16), no de aquí |
| G-03 | `type=ingreso` + `category=rent` | **`CobroPeriodo`** (NO `Gasto`: `CategoriaGasto` no tiene renta — verificado) | Reestructuración 1→N: un registro mensual = 1 `CobroPeriodo`; "año completo" exigiría 12 (ver INC-06) | 24 mensuales + 6 anuales; posible doble cómputo (INC-06) | **B** (+**C** anuales) | Los mensuales de p_0/p_1 ya tienen mes en `description` |
| G-04 | `category=community` (5 reg.; 420 / 360,36 / 445,68 / 723,84 / 521,70) | `Gasto.categoria='COMUNIDAD'` | Directa | **"Derrama comunidad" 521,70 (p_3): agregado del inmueble la cuenta como repairs** → INC-03 | **A** (4 reg.) / **C** (derrama) | — |
| G-05 | `category=ibi` (7 reg.; 4 con description "Basuras") | `Gasto.categoria='IBI'`; si description contiene "Basuras" → `'IMPUESTOS_TASAS'` | Regla por descripción (tasa de basuras ≠ IBI) | — | **B** + **C** (los 4 "Basuras") | Categoría origen mezcla dos impuestos distintos (verificado) |
| G-06 | `category=insurance` (7 reg. en unión: 354,78×2 / 248,52 / 372,72 / 216,19 / 142,21 / 202,41 / 40,88 / 237,60) | `Gasto.categoria='SEGUROS'` (impago) o `'SEGURO_HOGAR'` (hogar, ej. `exp_1783449544140` "Seguro hogar hasta 1 octubre") | Regla por descripción; "impago" → `SEGUROS` | Duplicado 354,78 (INC-05); desfase 237,60 (INC-04) | **B** + **C** (ambiguos) | Enum verificado: `SEGURO_HOGAR` y `SEGUROS` coexisten |
| G-07 | `category=repairs` (0 registros en la evidencia recibida) | `Gasto.categoria='REPARACION'` | Directa | Sin registros; el agregado repairs de p_3 (521,70) viene de la derrama (INC-03) | **A** (regla) | — |
| G-08 | `amount` (number, ej. 354.78) | `Gasto.importe` / `CobroPeriodo.importeRecibido` | Copia; redondeo 2 dec. | — | **A** | — |
| G-09 | `propertyId` (`prop_*`) | `Gasto.inmuebleId` / `CobroPeriodo.inmuebleId` | Mapa 1:1 (I-01) | **0 huérfanos** (verificado en los 51) | **B** | Depende de I-01 ejecutado antes |
| G-10 | `date` (YYYY-MM-DD, ej. `2026-09-01`) | `Gasto.fechaDevengo` + `fechaPago` + `periodoMesAnio` (derivado YYYY-MM) + `ejercicioFiscal` (derivado año) | 1→4 (2 copias + 2 derivados) | **18 registros con fecha NO_DISPONIBLE** (perdidas en reset 3) → PENDIENTE, no inventar | **B** | Aliases `fecha`/`pagado` también existen en `Gasto` |
| G-11 | `description` (string, ej. "Seguro de impago") | `Gasto.concepto` | Copia directa | — | **A** | — |
| G-12 | `receiptType` / `receiptName` / `receiptUrl` (base64 PDF) | `Gasto.documento {id, nombre, url, storagePath}` (+ `justificanteUrl/Path`); binario → **Storage** (`gastos_facturas/`, verificado en `storage.rules`) | base64 → archivo en Storage → URL/path. **NUNCA base64 en Firestore** (convención de la BASE: "por referencia, sin base64 en BD") | Recibo reg. 26: base64 íntegro recibido pero **binario NO está en disco** (reset 3 + límite de herramienta) → PENDIENTE; reg. 27: truncado → PENDIENTE | **B** (pipeline) / **D** (binarios hoy) | Solo 1 registro de la evidencia tiene recibo; metadatos verificados en anexo |
| G-13 | — (sin fuente) campos obligatorios de `Gasto`: `propietarioId`, `aCargoDe`, `estado`, `createdAt/updatedAt` | `Gasto.propietarioId` (del titular del inmueble), `aCargoDe` (`'arrendador'` por defecto), `estado` (`'PAGADO'` por defecto), timestamps de generación | Rellenos por defecto | Defaults = **asunciones** | **C** | `deducible`/`esDeducible`/`tipoDeducible`: NO autocompletar → decisión humana por categoría |
| G-14 | — (sin fuente) campos obligatorios de `CobroPeriodo`: `contratoId`, `inquilinoId`, `mes`, `anio`, `periodoMesAnio`, `nombreMes`, `importePrevisto`, `fechaVencimiento`, `estado`, `historialCambios` | `CobroPeriodo.*` | `mes/anio/nombreMes` derivables de `description` ("Alquiler julio 2026") en los 24 mensuales; el resto depende de contrato/inquilino | Estado del cobro (¿PAGADO? ¿VERIFICADO?) = asunción | **C** | Cadena de dependencia: Propietario → Inmueble → Contrato → Inquilino → Cobro |
| G-15 | `_fuente` (A/B/ambos — campo interno de custodia) | `Gasto.notas` / `CobroPeriodo.observaciones` (trazabilidad de procedencia) | Copia | — | **B** | Permite auditar qué pegado aportó cada registro |

---

## 4. Relaciones y orden de dependencia (para una futura migración — NO ejecutada)

```
Propietario (I-12) → Inmueble (I-01..I-07) → ContratoFormalizacion (I-13, C)
   → Gasto EXPLOTACION (G-02..G-13, independiente de contrato)
   → CobroPeriodo (G-03, G-14: REQUIERE contrato+inquilino)
   → Prestamo + GastoRecurrente (I-16, C)
   → Documentos en Storage (G-12)
```

- Eje inmueble↔operación: `propertyId`→`Inmueble.id` (clave estable).
- Eje inmueble↔titular: `owner`→`Propietario.id`→`Inmueble.propietarioId` (C: falta NIF).
- Eje contrato↔cobro: imposible hoy (contratos incompletos, C).
- Eje gasto↔comprobante: `receiptUrl`→Storage→`Gasto.documento` (B; binarios PENDIENTES).

---

## 5. Registro de incidencias (se mantienen TODAS; ninguna se cierra en falso)

| ID | Incidencia | Evidencia (verificada con script sobre el anexo) | Estado |
|---|---|---|---|
| INC-01 | **Desfase IBI p_0**: agregado 170,59 vs detalle 111,86 → delta 58,73 | Conciliación unión y solo-B (anexo) | REQUIERE VALIDACIÓN (persiste en todo escenario; posible registro no recibido) |
| INC-02 | **Desfase comunidad p_3**: agregado 1.933,70 vs detalle 1.245,54 → delta 688,16 | Ídem | REQUIERE VALIDACIÓN (posible registro en el final no recibido) |
| INC-03 | **Derrama 521,70 p_3** categorizada `community` en el detalle pero el agregado la trata como `repairs` | Ídem (delta repairs 521,70) | C: decisión humana de categoría (IMPUESTOS_TASAS no aplica; REPARACION vs COMUNIDAD) |
| INC-04 | **Desfase insurance p_2545992**: agregado 723,72 vs detalle 486,12 → delta 237,60 = importe exacto del reg. 26 | Ídem | REQUIERE VALIDACIÓN (posible duplicado o registro no recibido; NO decidir) |
| INC-05 | **Duplicado seguro impago 354,78** (`exp_1783449377775` 07-07 / `exp_1783461510013` 07-08, mismo inmueble p_1) | En unión el agregado 892,65 = 354,78×2+142,21+40,88 (cuadra solo con ambos) | **Conservado en origen, NO eliminado.** C: ¿doble entrada o dos pagos reales? |
| INC-06 | **Ambigüedad de rentas A/B**: si es un único fichero, p_0 suma 12.000 y p_1 17.160 (anual+mensual = doble cómputo); si son dos exports, ¿cuál rige? | Rentales unión vs solo-B (anexo) | C: NO decidir sin evidencia del usuario |
| INC-07 | **p_1 anual 8.400 = 700×12** (renta antigua) vs contrato vigente 730×12 = 8.760 (−360) | Conciliación FASE 1 | C: qué renta prevalece en el histórico 2026 |
| INC-08 | **Registro 27 truncado** (PDF firmado, Sello Electrónico): id/importe/inmueble/fecha desconocidos | Truncado en AMBOS pegados | PENDIENTE — conservar, no cero |
| INC-09 | **Posibles registros posteriores no recibidos** | El fichero nunca llegó a su final | PENDIENTE — limitación de evidencia documentada |
| INC-10 | **Referencia catastral no única**: 1 duplicada + 2 vacías | Inventario FASE 1 | C: no usar como clave; clave = `propertyId` |
| INC-11 | **tenantHistory con fechas invertidas** (2026-10-03 > 2026-09-07) en `prop_...122_1` | Inventario FASE 1 | C / D (bloque conservado como origen) |
| INC-12 | **"José Gregorio"**: inquilino de `prop_1783442822113` pero su seguro de impago está cargado en `prop_1783441481122_1` | Registros del anexo | REQUIERE VALIDACIÓN (¿inmueble equivocado en origen?) |
| INC-13 | **Multi-inquilino en string plano** (4 inmuebles, comas; mezcla DNI/NIE) | Inventario FASE 1 | B (split) + C (>2 titulares) |
| INC-14 | **Float `1933.6999999999998`** en agregado de p_3 | Inventario FASE 1 | B: redondeo 2 dec. en transformación |
| INC-15 | **ZIP AEAT (Libro Diario)** no disponible y sin destino en la BASE | Declarado por el usuario | D: FUENTE EXTERNA — OTRA APP |

---

## 6. Listas finales

### E) Migración directa (A) — 5 reglas
1. `Gasto.amount` → `importe` (G-08).
2. `Gasto.description` → `concepto` (G-11).
3. `category=community` → `COMUNIDAD` (4 registros; la derrama va a C) (G-04).
4. `category=repairs` → `REPARACION` (regla; 0 registros hoy) (G-07).
5. `Inmueble.id` = `propertyId` reutilizado con chequeo de colisión (I-01).
6. `type=gasto` → `tipo='EXPLOTACION'` (G-02).

### F) Requieren transformación (B) — resumen
Fechas (1→4 derivados + parseo D/M/YYYY) · ids externos → `origenId`/notas · categorías `ibi`/`insurance` → enums con regla por descripción · rentas → `CobroPeriodo` (reestructuración 1→N) · `address` → trim + `ciudad` · `purchasePrice`→`valorAdquisicion` · `currentValue`→`valoracionEstimada` · `monthlyRent`→`precio`/`rentaMensual` · recibos base64 → Storage + `Gasto.documento` · redondeo 2 dec. · split multi-inquilino · `_fuente` → trazabilidad.

### G) Validaciones humanas necesarias (C) — resumen
`aCargoDe`/`estado`/`deducible` por defecto (G-13) · 4 registros "Basuras"→IMPUESTOS_TASAS · derrama 521,70 (INC-03) · duplicado 354,78 (INC-05) · desfase 237,60 (INC-04) · rentas A/B y anuales-vs-mensuales (INC-06) · 8.400 vs 8.760 (INC-07) · catastral duplicada/vacías (INC-10/03) · `ciudad` por inmueble · NIF del `owner` · contratos incompletos (I-13) · subcampos `mortgage*` (I-16) · estado de cobros (G-14) · "José Gregorio" (INC-12) · >2 inquilinos (INC-13).

### H) Conservar como origen histórico / no integrar (D)
`expenses.*` agregados anuales · `yearlyFinancials` · `landValuePercent` · `amortizationAmount` · `ownershipPercentageUser1/2` (los %) · `tenantHistory[]` · registro 27 (hasta recepción) · ZIP AEAT · ids originales Rentasync (trazabilidad) · canal `handleImportData` de la BASE (no usar como migración).

### PENDIENTE / NO_DISPONIBLE (no interpretado como inexistente)
Final del fichero de gastos (reg. 27 + posibles posteriores) · binarios de recibos PDF · valores por-campo de inmuebles perdidos en reset 3 · ids/fechas/descripciones de 18 registros (`__ID_NO_RECUPERADO_R3_*__`) · subcampos de `contract`/`mortgage`/`tenantHistory`/`yearlyFinancials`.

---

## 7. Reproducibilidad

```bash
# 1) Verificar que el anexo reproduce los números de FASE 1 (conciliación):
python3 - << 'EOF'
# (script de conciliación: ver salida esperada en docs/FASE2-ANEXO-EVIDENCIA-EXTERNA.json → __VERIFICACION_ESPERADA__)
EOF
# 2) Verificar que el repo no ha sufrido cambios funcionales:
git status --porcelain && npm run lint   # tsc --noEmit
```

Este documento solo añade documentación en `docs/`. No toca `src/`, reglas, índices ni configuraciones.

## 8. Estado Git

- Rama: `arena/01a0d97d-gestor-de-inmuebles-vercel` (única permitida en esta sesión).
- Commit: solo los dos artefactos de FASE 2 (`docs/FASE2-MAPA-ORIGEN-DESTINO-RENTASYNC.md`, `docs/FASE2-ANEXO-EVIDENCIA-EXTERNA.json`). **Sin push** (constancia explícita: el commit queda local; el hash se comunica en el informe).
