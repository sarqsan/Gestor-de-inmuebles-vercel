# BLOQUE 5 — OPERACIONES → FISCALIDAD

Cierre del circuito patrimonial:

```
INMUEBLE → INCIDENCIA → REPARACIÓN → (ORDEN_TRABAJO) → PROVEEDOR → PRESUPUESTO
         → FACTURA → GASTO → DEDUCIBILIDAD → DOCUMENTO → INFORME FISCAL
```

Los pasos son **condicionales por tipo de operación**: una factura de proveedor no
tiene por qué pasar por OT; una póliza no tiene presupuesto; una lectura de
contador no tiene importe. El circuito no exige pasos que la operación real no
tenga, y la trazabilidad declara los que sí existen.

## 1. Piezas del bloque

| Fichero | Papel |
| --- | --- |
| `src/utils/deducibilidadEngine.ts` | **Fuente única** de deducibilidad (decisión + origen de la decisión). Cierre de D1. |
| `src/utils/operacionGastoEngine.ts` | Puente operación → gasto, idempotencia, trazabilidad reconstruible, informe fiscal de operaciones y adaptadores de los modelos existentes. |
| `src/utils/fiscalEngine.ts` | Re-exporta los helpers históricos de deducibilidad (mismos nombres, misma función). |
| `src/utils/gastosEngine.ts` | `calcularTotalesGastos` usa la fuente única (antes: `if (g.deducible)`). |
| `src/utils/rentabilidadEngine.ts` | El NOI usa la fuente única (antes: `deducible !== false`). |
| `src/utils/reportingEngine.ts` | La exportación fiscal conserva `origenOperacion`/`origenOperacionId`/`documentoId`. |
| `src/types.ts` | `Gasto`: referencias de operación (`facturaId`, `reparacionId`, `proveedorId`, `suministroId`, `polizaId`, `lecturaId`). `ExportacionFiscalItem`: campos de procedencia. |
| `src/components/modals/RegistrarActuacionModal.tsx` | Escritor real de mantenimiento: ahora genera el gasto por el puente (trazable e idempotente). |
| `src/components/mantenimiento/MantenimientoPreventivoPanel.tsx` | Pasa el inmueble real a la actuación (validación de aislamiento). |

No se ha creado ningún módulo paralelo: los puentes canónicos ya existentes
(`gastosEngine.generarGastoDesdeTrabajo` para órdenes de trabajo y
`reformasEngine.liquidarGastoDesdeProyecto` para reformas) siguen siendo los
únicos de su ámbito y **no** se han reimplementado. El módulo de Operaciones
(`src/features/operaciones/`) se usa como fuente de la cadena operativa
(incidencia → avería → reparación → proveedor → presupuesto → factura →
documento) mediante adaptadores de solo lectura.

## 2. Identidad e idempotencia del gasto

* ID determinista del documento: `gop_<tipo>_<operacionId>` (+ `_<actuación>`
  cuando la operación es recurrente).
* La operación **es** la fuente de identidad: `origen` + `origenId` quedan
  persistidos en el gasto, de modo que `buscarGastoDeOperacion` lo localiza por
  ID, por operación (`origenId`) o por `facturaId`/`reparacionId`.
* Mantenimiento periódico: un plan tiene **N actuaciones reales**, así que cada
  actuación (tarea + fecha) tiene su propio gasto; repetir el registro de la
  misma actuación **reescribe el mismo documento** (no duplica).
* Si el propio modelo ya asocia un gasto a la actuación
  (`historialActuaciones[].gastoId` o `ultimoGastoId` de esa misma fecha), se
  reescribe **ese** documento: los datos registrados antes de este bloque no se
  convierten en duplicados.
* Sin reloj ni aleatoriedad en la identidad (`Date.now()`/`Math.random()` no
  intervienen): el motor es puro y la fecha de registro la aporta el llamante.

## 3. Decisión sobre `ANULADO`

Semántica del ERP que este bloque **conserva** (no la cambia para hacer pasar un
test):

1. Una operación `ANULADO` **no genera** gasto. La validación se rechaza antes
   de cualquier otra consideración de contenido, así que el motivo no depende de
   que además falte categoría o importe. El documento original se conserva.
2. El rechazo es total: `generarGastoDesdeOperacion` devuelve `error` y **no hay
   gasto parcial**.
3. Una factura `ANULADA` del módulo de Operaciones no se convierte en operación
   (`operacionDesdeFacturaOperativa` → `null`).
4. Un gasto ya persistido con `estado: 'ANULADO'` no computa: los agregados
   fiscales (`calcularGastosEjercicio`, `clasificarGastosDeducibilidad`) y el
   informe del circuito lo ignoran. El informe lo declara como incidencia
   `GASTO_ANULADO`, nunca como fila ni como importe.
5. La trazabilidad del gasto anulado se conserva completa (no se borra la
   historia): la cadena se reconstruye igual.

## 4. Informes y ejercicio fiscal

* El ejercicio lo decide el motor fiscal existente (`fechaDevengo`/`fechaPago`/
  `fecha` o `ejercicioFiscal`), no el informe.
* `generarInformeFiscalOperaciones` devuelve filas + totales + incidencias:
  `SIN_DOCUMENTO`, `SIN_OPERACION`, `DEDUCIBILIDAD_NO_INFERIBLE`, `GASTO_ANULADO`.
* La exportación fiscal (`reportingEngine`) mantiene sus columnas históricas y
  añade `origenOperacion`, `origenOperacionId` y `documentoId` (CSV y JSON).

## 5. Aislamiento

* El inmueble de la operación debe existir en el ámbito aportado y pertenecer al
  propietario declarado (titular principal o secundario); si no, no se genera
  gasto.
* `entidadesDelInmueble` filtra las entidades por inmueble y propietario (el
  catálogo de proveedores vive por propietario, igual que en el módulo de
  Operaciones).
* El informe fiscal puede filtrarse por inmueble o por propietario sin que se
  cruce un gasto de otro ámbito.

## 6. Superficie de custodia autorizada

Los tests de custodia/aislamiento de los bloques anteriores vigilan qué ficheros
pueden diferir de su base. Este bloque amplía esa superficie de forma **explícita
y mínima** (nunca `src/utils/**` completo):

```
src/utils/deducibilidadEngine.ts        (nuevo)
src/utils/operacionGastoEngine.ts       (nuevo)
src/utils/gastosEngine.ts               (modificado)
src/utils/fiscalEngine.ts               (modificado)
src/utils/rentabilidadEngine.ts         (modificado)
src/utils/reportingEngine.ts            (modificado)
src/utils/deducibilidadEngine.test.ts   (nuevo)
src/utils/operacionGastoEngine.test.ts  (nuevo)
src/components/modals/RegistrarActuacionModal.tsx       (modificado)
src/components/modals/RegistrarActuacionModal.test.tsx  (nuevo)
src/components/mantenimiento/MantenimientoPreventivoPanel.tsx (modificado)
src/types.ts                            (ampliación aditiva)
package.json                            (script test:bloque-5, línea añadida)
scripts/test-bloque-5.ts                (nuevo)
docs/BLOQUE-5-OPERACIONES-FISCALIDAD.md (este documento)
```

## 7. Ejecución

```bash
npm run test:bloque-5     # batería del bloque + regresión fiscal/de gastos
npx tsc --noEmit          # tipos
npm run build             # build
node --import tsx --test src/features/operaciones/tests/*.test.mjs   # custodia de Operaciones
node --test src/features/patrimonial/tests/*.test.mjs                # custodia patrimonial
```

## 8. Incidencias conocidas de infraestructura/custodia

* **INFRA-01** (global): el emulador de Firebase no es ejecutable en el entorno
  de trabajo; los tests que dependen de él quedan fuera de esta validación.
* Los commits base históricos citados por los tests de custodia
  (`c4949a62…`, `7657eea2…`, `91ed07d6…`, `877494f…`) **no existen en este clon**.
  Esas comprobaciones no se saltan ni se debilitan: cuando el commit base no está
  disponible, se verifica la referencia local verificable (el commit del que parte
  el bloque) con la misma garantía (los ficheros compartidos no pueden perder ni
  reescribir ninguna línea base) y queda constancia aquí de la limitación. Con la
  base presente, la comprobación original se ejecuta sin cambios.
* `canonical-source.test.mjs`: el sha256 del helper `activeUser` de
  `firestore.rules` no coincide con el esperado de la base B (el resto sí). No se
  ha tocado `firestore.rules` en este bloque: es una incidencia previa.
