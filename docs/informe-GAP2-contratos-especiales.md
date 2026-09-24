# INFORME FINAL — GAP 2: CONTRATOS ESPECIALES, ANEXOS, RESCISIÓN Y FINIQUITO

Arena: C · Cuenta: harqiba@gmail.com · Rama: `arena/01a0ab97-gestor-de-inmuebles-vercel`

---

## GIT

| Campo | Valor |
|---|---|
| Rama | `arena/01a0ab97-gestor-de-inmuebles-vercel` |
| HEAD inicial | `1bebc81` (previa sincronización no destructiva con el remoto; el sandbox arrancó en `9cb01a4` con el contenido ya protegido en el remoto) |
| HEAD final | `e373d4e258b5d938c9caa309b68952fd2317a5aa` |
| Remoto | `e373d4e258b5d938c9caa309b68952fd2317a5aa` (verificado con `ls-remote`) |
| Local = remoto | ✅ 0 ahead / 0 behind |
| Working tree | Solo residuos preexistentes ajenos al bloque (parche IVA de profesionales ~52 líneas, `package.json`, `storage.rules` antiguo, `package-lock.json` de npm) — documentados, no tocados, no commiteados |
| Commit | `feat(contratos): GAP 2 — contratos especiales, anexos, rescisión y finiquito` |

---

## IMPLEMENTACIÓN

### Archivos creados
| Archivo | Contenido |
|---|---|
| `src/utils/contratoCicloEngine.ts` | Motor puro del ciclo contractual (~640 líneas): modalidades, anexos, terminación, finiquito, derivados, eventos, RBAC |
| `src/utils/contratoCicloGAP2.test.ts` | 44 tests del GAP 2 |
| `src/components/CicloContractualPanel.tsx` | UI mínima del ciclo (modalidad / anexos / finalización / finiquito) |

### Archivos modificados
| Archivo | Cambio |
|---|---|
| `src/types.ts` | +168 líneas: `ModalidadContractual`, `RESCINDIDO` en `EstadoFormalizacion`, `FinalizacionContrato`, `AnexoContractual`, `ConceptoFiniquito`, `FiniquitoContrato`, `EventoContrato`, campos opcionales en `ContratoFormalizacion` (modalidadContractual, finalidadUso, motivoTemporalidad, duracionMeses, contratoOrigenId/DerivadoId, version, finalizacion, anexos, finiquito) |
| `src/utils/contratoEngine.ts` | Label de `RESCINDIDO`; los borradores nuevos nacen con `modalidadContractual` inferida y `version: 1` |
| `src/components/sections/FormalizacionSection.tsx` | Monta `CicloContractualPanel` en cada expediente; filtros `FINALIZADO`/`RESCINDIDO`; KPI de renta excluye terminales; suscripción acotada a habitaciones de contratos por habitación |
| `src/App.tsx` | Pasa `currentUser` y `onSaveContrato` a FormalizacionSection (2 líneas) |
| `firestore.rules` | Contratos: `fechaCreacion` inmutable + prohibido salir de estado terminal (`FINALIZADO/RESCINDIDO/CANCELADO`) |

### Modelo contractual
`ContratoBase` (el `ContratoFormalizacion` existente, sin sustituir) con modalidad tipada extensible:
`VIVIENDA_HABITUAL | TEMPORADA | LOCAL_USO_DISTINTO | HABITACION`.
Temporada exige motivo/causa + fecha fin expresa; local exige finalidad/uso; habitación exige `habitacionId`. Solo almacena datos aportados por el usuario — no genera afirmaciones jurídicas.

### Anexos
Embebidos en el documento del contrato (mismo patrón que `registroCobros`; sin colecciones paralelas). Versionados: un anexo `CONFIRMADO` no se modifica — `crearNuevaVersionAnexo` lo pasa a `SUPERSEDIDO` (se conserva) y crea v(n+1) con `anexoOriginalId`.

### Rescisión / finalización
`finalizarContrato` / `finalizarContratoConHabitacion`: estado terminal según tipo (`FINALIZACION_NATURAL`/`MUTUO_ACUERDO`→FINALIZADO, `RESCISION_ANTICIPADA`→RESCINDIDO, `CANCELACION_EXPEDIENTE`→CANCELADO), fecha efectiva validada, motivo, usuario, bloque `finalizacion`, historial append-only. Un contrato terminal no puede volver a activo (motor + regla Firestore).

### Finiquito
Conceptos a favor de propietario (rentas pendientes, suministros, daños, otros) y de inquilino (fianza, garantías, saldos), con importes **reclamado / pendiente / pagado / devuelto** y `saldoFinal` con signo interpretable (>0 cobra propietario, <0 devuelve propietario). Se genera tras la terminación con sugerencias en solo-lectura desde cobros existentes; el cierre exige todo liquidado. **Nunca modifica `registroCobros`** (tests 4.7 y 5.7).

### Integración económica
Sin segundo motor: `generarPeriodosParaContrato` (ya corta en `fechaFinContrato`) y `calcularResumenCobros` se reutilizan tal cual. La fiscalidad (`generarResumenFiscalInmueble`) sigue alimentándose por `inmuebleId + registroCobros`, que los contratos especiales conservan. Limitación documentada: el resumen fiscal actual no diferencia por modalidad contractual (los datos para hacerlo ya están disponibles en `modalidadContractual`).

### Integración habitaciones
`finalizarContratoConHabitacion` valida el aislamiento (habitación ↔ contrato ↔ inmueble) y libera la habitación **solo** si está `OCUPADA` por este contrato, delegando en `finalizarOcupacionHabitacion` del circuito consolidado. `contratoId` se conserva en la habitación como trazabilidad (comportamiento del circuito cerrado, no alterado).

### Prórrogas / renovaciones
`crearContratoDerivado`: relación `contratoOrigenId ↔ contratoDerivadoId`, versión incremental, copia el núcleo (inmueble/habitación/propietario/candidato) y NO duplica cobros ni anexos del origen. Un origen no admite dos derivados.

---

## SEGURIDAD

- **Firestore rules:** contratos_formalizacion mantiene invarianza de `inmuebleId`/`habitacionId`; nuevas: `fechaCreacion` inmutable y transición terminal irreversible. Anexos/finiquito, al ir embebidos, heredan estas reglas (no hay colecciones nuevas que regular).
- **RBAC:** `canGestionarCicloContrato` delega en `canAccessContrato` de `authService` (admin global; propietario solo su cartera; profesional sin acceso a contratos).
- **Aislamiento:** `accesoCruzadoContratoDenegado` por propietario/inmueble/habitación; la finalización con habitación deniega habitación ajena o de otro inmueble.
- **Invariantes:** sin hard delete (histórico append-only), sin reactivación silenciosa, sin alteración retroactiva de cobros, anexo confirmado inmutable.
- Sin `adminUser`, sin localStorage de auth, sin secretos en cliente, sin firma electrónica externa (quedamos preparados: `referenciaDocumental` en anexos es el punto de enganche).

---

## TESTS

| Prueba | Resultado |
|---|---|
| Vitest — tests nuevos GAP 2 | **44/44** (modalidades 8, histórico/derivados 6, anexos 6, finalización 8, finiquito 9, habitaciones 5, eventos 2) |
| Vitest — regresión circuito habitaciones | **72/72** (28 circuito + 20 aislamiento + 24 economía) — sin variación |
| Vitest total | **116/116 pasando** |
| TypeScript | 1 error: `TrabajoProfesionalModal / tamano` (TS2353) — **preexistente**, no introducido por este bloque |
| Lint | No existe script independiente; `lint` = `tsc --noEmit` (ídem) |
| Build | ✅ OK (warning de chunk conocido) |

Nota conocida: `inventarioIsolation.test.ts` es un script de auto-verificación sin suite vitest (vitest lo reporta como fichero sin tests); es preexistente desde el aislamiento (8378a73) y no se ha tocado.

---

## LIMITACIONES REALES

**Implementado (operativo y testeado):**
- Modalidades contractuales, validaciones y UI de modalidad.
- Anexos versionados con inmutabilidad tras confirmación.
- Finalización/rescisión/cancelación formal irreversible con trazabilidad.
- Finiquito completo (conceptos, movimientos, saldo, cierre).
- Derivados/prórrogas con relación histórica.
- Integración con habitaciones y con cobros/fiscalidad existentes.
- Reglas Firestore endurecidas.

**Preparado (sin ejecutar):**
- Eventos del ciclo contractual (`crearEventoContrato` + `PUNTOS_EVENTO_CONTRATO`): el dispatcher lo aporta el motor de notificaciones de Arena B (GAP 1); aquí solo el contrato de eventos y los puntos de emisión documentados.
- Referencia documental de anexos lista para firma electrónica externa (no integrada por decisión de la orden).
- Dato `modalidadContractual` disponible para diferenciar fiscalidad por modalidad en el futuro.

**Pendiente:**
- UI de creación directa de contratos especiales desde cero (hoy la modalidad se aplica sobre el borrador LAU existente, que es el flujo real de la app).
- Conversión de `inventarioIsolation.test.ts` a suite vitest (fuera del alcance de este bloque).

**Dependiente de infraestructura externa:**
- Envío real de notificaciones (motor de B).
- Proveedor de firma electrónica (excluido expresamente).

---

## INTEGRACIÓN PARA ARENA A

- **SHA exacto a integrar:** `e373d4e258b5d938c9caa309b68952fd2317a5aa`
- **Archivos principales:** `src/utils/contratoCicloEngine.ts`, `src/utils/contratoCicloGAP2.test.ts`, `src/components/CicloContractualPanel.tsx`, los añadidos de `src/types.ts` (bloque GAP 2), `src/utils/contratoEngine.ts` (label RESCINDIDO + modalidad en borrador), `src/components/sections/FormalizacionSection.tsx`, 2 líneas de `src/App.tsx`, bloque de `contratos_formalizacion` en `firestore.rules`.
- **Posibles conflictos con A:** `src/types.ts`, `FormalizacionSection.tsx` y `App.tsx` si A ha evolucionado esas zonas (A tiene `candidateCircuitEngine` y cierre de trabajos en main `4d420bd`); el bloque de tipos GAP 2 es aditivo y los nuevos archivos no colisionan. `firestore.rules`: portar solo el bloque `contratos_formalizacion` sobre las reglas endurecidas de A.
- **Dependencias nuevas:** ninguna (sin librerías nuevas).
- **Orden recomendado:** 1) tipos GAP 2 → 2) `contratoCicloEngine.ts` + tests → 3) label/borrador en `contratoEngine.ts` → 4) reglas Firestore → 5) UI (`CicloContractualPanel` + FormalizacionSection + App).
- **Adaptaciones necesarias:** si A integra antes el ecosistema de habitaciones de C (`f05ff1e`), `finalizarContratoConHabitacion` encaja directamente; en caso contrario, portar primero `habitacionesEngine` o desactivar esa rama hasta su integración.

---

## CRITERIO DE CIERRE

🟢 **GAP 2 CERRADO** — contratos especiales, anexos, rescisión/finalización y finiquito operativos; histórico preservado; economía y habitaciones intactas (116/116 tests); seguridad cubierta (reglas + RBAC); commit `e373d4e` empujado y verificado en GitHub. Sin merge en Arena A.
