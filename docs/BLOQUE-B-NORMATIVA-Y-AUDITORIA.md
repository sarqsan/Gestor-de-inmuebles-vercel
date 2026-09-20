# BLOQUE B — FASE 2/3: Auditoría previa y verificación normativa (2026-09-20)

## 1. Auditoría: qué existe y qué no existe

### Cobros — EXISTE (base del bloque)
- Modelo `CobroPeriodo` anidado en `ContratoFormalizacion.registroCobros`.
- Distingue previsto vs recibido, estado, fecha de pago, método, referencia bancaria,
  justificante y trazabilidad. Relación contrato/inmueble/propietario/inquilino incluida.
- Lo que NO existe: recibos formales numerados, devengos separados del cobro, movimientos
  bancarios, conciliación automática, id de mandato SEPA.

### Conciliación bancaria (GAP6 citado en la orden) — NO EXISTE
- No hay colección de movimientos, ni motor de conciliación, ni reversos, ni idempotencia
  bancaria. El estado `VERIFICADO` de `CobroPeriodo` es la única marca "conciliado" disponible
  (verificación manual con justificante).
- Decisión BLOQUE B: **no inventar un GAP6**. Se crea `src/tesoreria/conciliacionAdapter.ts`,
  un adaptador documentado que (a) considera "conciliable/liquidable" un cobro si está en
  `RECIBIDO`/`VERIFICADO` con `importeRecibido > 0`; (b) expone `MovimientoTesoreria`
  (lectura) para futura integración camt.052/053/054 sin escribir en estructuras ajenas.

### Gastos — EXISTE parcialmente
- Costes reales en `TrabajoProfesional.importeFinal` + `facturaNumero`, y partidas con IVA en
  `PresupuestoProfesional`. Imputación propietario/inquilino indicada en UI (Art. 21 LAU).
- Lo que NO existe: colección de gastos del inmueble, ni libro de gastos, ni repercusión
  automática, ni IVA/retenciones estructurados.
- Decisión BLOQUE B: nueva colección `gastos_inmuebles` (`GastoInmueble`) con importador
  desde trabajos finalizados (`trabajoId` origen trazable) + alta manual. Campos:
  inmueble, contrato opcional, categoría, base, %IVA, cuota IVA, total, pagadoPor
  (`administracion|propietario`), imputableA (`propietario|inquilino|comunidad|seguro|tercero`),
  estado (`pendiente|pagado|liquidado|anulado`), factura, fechas, auditoría.

### Propietarios — EXISTE
- `Propietario` con NIF/CIF, domicilio fiscal, tipo (física/jurídica/CB),
  `cuentasBancarias[]` (IBAN, BIC, titular, principal). Relación inmueble↔propietario vía
  `propietarioId`/`propietarioPrincipalId`/`propietarioSecundarioId` (+`authUid`/RBAC).
- Lo que NO existe: porcentajes de copropiedad, configuración de honorarios por propietario,
  configuración fiscal por propietario.
- Decisión BLOQUE B: `ConfigLiquidacionPropietario` (subcolección lógica dentro de la
  liquidación + doc `config_liquidacion/{propietarioId}` opcional): % honorarios, %IVA
  honorarios, % retención y motivo, cuenta de abono, notas de fuente normativa.
  **Sin porcentajes de copropiedad**: si hay segundo propietario, la liquidación reparte
  al 50% solo si se configura explícitamente (`repartoCopropiedad`), en otro caso liquida
  al propietario titular indicado. Nunca se inventa un reparto.

### Facturación (GAP7/GAP8 citados) — NO EXISTE
- No duplicar: BLOQUE B no factura; solo registra base/IVA de gastos y de honorarios de
  administración para trazabilidad y futuro enlace con facturación.

### Notificaciones (GAP1 citado) — NO EXISTE dispatcher
- No hay dispatcher ni templates. Decisión: `src/tesoreria/notificaciones.ts` genera eventos
  tipados (`liquidacion.generada|aprobada|pagada|incidencia`, `sepa.preparado|error`) y los
  registra en `audit_logs` vía `registrarAuditoriaFirestore` + callback inyectable para un
  futuro dispatcher. Comportamiento seguro: sin envío real, sin secretos.

## 2. Verificación normativa (fuentes consultadas 2026-09-20)

### SEPA / ISO 20022 / EPC
- Ficheros: **pain.008** (SDD, adeudos domiciliados) y **pain.001** (SCT, transferencias),
  estándar ISO 20022 bajo EPC SEPA Rulebooks. Versiones objetivo: `pain.008.001.02` y
  `pain.001.001.03` (las de uso generalizado en banca española / cuadernos SEPA); el código
  deja la versión como constante configurable para futuras migraciones (p. ej. `.001.08/.001.09`).
- Identificador de acreedor (Creditor ID / AT-02 EPC): obligatorio en cada mandato y en el
  pain.008; dígitos de control con **ISO 7064 Mod 97-10 (EPC262-08)**; identifica al acreedor,
  no a la cuenta ([1](https://www.generatesepa.com/sepa-creditor-identifier)).
- IBAN: validación **ISO 13616 mod-97** + registro nacional; BIC: **ISO 9362**; juego de
  caracteres EPC217-08; referencia de acreedor ISO 11649 RF; direcciones: cambio a formato
  estructurado/híbrido **15-nov-2026** ([2](https://lib.rs/crates/sepa),
  [3](https://docs.rs/sepa/latest/sepa/)).
- Secuencias SDD CORE: `FRST`/`RCUR`/`FNAL`/`OOFF`; cada adeudo exige mandato previo
  (`MndtId` + `DtOfSgntr`) y cuenta deudora válida. El sistema **genera→valida→prepara**,
  nunca ejecuta cargos reales (requiere conector bancario / banca electrónica del cliente).

### Fiscalidad española del alquiler (para parametrización, NO reglas fijas)
- El propietario persona física declara el alquiler como **rendimiento del capital
  inmobiliario (art. 22 LIRPF, Modelo 100)**, base general. Reducción por vivienda habitual
  del arrendatario: **50% con carácter general** (contratos desde 26-05-2023; 60% para
  anteriores), sin reducción en uso vacacional/temporada salvo condiciones
  ([1](https://www.expansion.com/economia/declaracion-renta/2026/01/27/69777fbce5fdea41278b45af.html)).
- Gastos deducibles (art. 23.1.a LIRPF): reparación/conservación, tributos no estatales
  (IBI, basuras si los paga), comunidad, administración/vigilancia/portería, formalización,
  saldos dudoso cobro (+6 meses), seguros, intereses. IBI deducible al 100% prorrateado por
  días ([2](https://selektaproperties.com/impuestos-al-alquilar-un-piso/)).
- **Retención 19%**: solo en arrendamiento/subarrendamiento de **inmuebles urbanos** cuando
  el arrendatario está obligado a retener (empresa/profesional), sobre todos los conceptos
  excluido IVA (art. 75.3.g RIRPF y exoneraciones). **Nunca en arrendamientos para uso de
  vivienda** (permanente o temporal)
  ([3](https://www.consejogestores.org/noticias/tributacion-inmuebles-vacacinales/)).
- **IVA**: arrendamiento de vivienda **exento/sin IVA** salvo servicios complementarios de
  hostelería (10%); local comercial 21%. Los honorarios de administración inmobiliaria a
  propietarios sí llevan IVA general (parametrizable, por defecto 21%).
- Consecuencia para el motor: `ConfigFiscalLiquidacion` exige indicar `aplicaRetencion`,
  `porcentajeRetencion`, `motivoRetencion` (p. ej. "arrendatario empresa, local urbano"),
  `ivaHonorariosPct`, `fuenteRegla` (texto libre con norma). **Por defecto: sin retención
  (vivienda) y honorarios con IVA 21% parametrizable.** Ninguna hipótesis fiscal es regla fija.

## 3. Decisiones de diseño derivadas

1. Solo se liquida **cobrado** (`RECIBIDO`/`VERIFICADO`, `importeRecibido>0`); lo devengado
   pendiente se informa aparte como "pendiente de cobro", nunca como disponible.
2. Redondeo a céntimos por línea y cuadre final (`descuadre técnica ≤ 0,01` se absorbe en
   línea de ajuste visible; > 0,01 bloquea aprobación).
3. Idempotencia por clave natural: liquidación `propietarioId|YYYY-MM`; fichero SEPA por hash
   del contenido canónico + `MsgId` determinista; orden de pago `liquidacionId|destinatario`.
4. Sin secretos bancarios en Firestore: solo IBAN/BIC/titular operativos ya existentes en el
   modelo de propietario; sin credenciales ni claves de banca.
