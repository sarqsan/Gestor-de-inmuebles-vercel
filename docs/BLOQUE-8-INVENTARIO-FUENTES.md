# BLOQUE 8 — Inventario de fuentes y decisión de migración histórica

**Estado de la inspección:** 2026-09-28
**Rama:** `arena/01a0e6d9-gestor-de-inmuebles-vercel`
**HEAD inspeccionado:** `f10a45ee54db2db34761146e2c7b1ed922d8061c`
**Resultado:** inventario y dry-run local completados. **No se han persistido ni migrado registros**: las fuentes originales canónicas no están en el clon y no se deben sustituir por la transcripción de evidencia disponible.

## 1. Fuentes reales disponibles

### Fuente A — Modelo canónico actual

El código del clon contiene modelos, reglas, colecciones, servicios y adaptadores canónicos. Entre otros: `propietarios`, `inmuebles`, `contratos_formalizacion`, `gastos`, `facturas`, `polizas_seguros`, `suministros`, `tareas_mantenimiento`, `garantias_reparacion`, `inventario_inmuebles`, `audit_logs` y `gestiones_cartera`.

Eso acredita el **esquema**, no una exportación de datos de producción ni la correspondencia entre identidades históricas y documentos actuales. No se consultó ni modificó Firebase/producción.

### Fuente B — Evidencia externa reconstruida, no fichero original

Único artefacto histórico materializado en el clon: `docs/FASE2-ANEXO-EVIDENCIA-EXTERNA.json`.

- SHA-256 del artefacto presente: `f1878bac674fee459ab5d78f94942762e37b89a4b83081d564873c525e6cbe88`.
- El propio anexo declara que los originales fueron borrados por resets del sandbox y que contiene una reconstrucción limitada a valores verificados anteriormente.
- Registros de movimientos en el anexo: **52 entradas** — 21 gastos, 30 ingresos y una fila truncada sin tipo.
- Fuentes registradas en esas entradas: 25 del pegado A, 25 del pegado B, una común y una truncada/sin etiqueta.
- Esquema de inmuebles: siete IDs históricos verificados y hechos/agregados de inventario; no incluye los valores originales completos campo por campo.
- Hay una referencia y metadatos de un PDF en un registro, pero no hay URL/binario/StoragePath disponible en el anexo.

El SHA anterior identifica **esta transcripción**, no los JSON de Rentasync originales. Por ello no se acepta como SHA canónico para autorización/promoción.

### Fuente C — Datos incompletos o contradictorios

El anexo conserva filas con IDs placeholders y fechas/campos ausentes, una fila explícitamente truncada, valores inmobiliarios no recuperables, renta anual/mensual ambigua y discrepancias de gastos agregados frente al detalle. Se conservan las incidencias `INC-01…INC-15` del mapa FASE 2; no se resuelven por inferencia.

### Fuente D — Datos no recuperables con lo custodiado

- Los ficheros originales `inmuebles_rentasync_2026-09-25.json` y `gastos_e_ingresos_Todos_Inmuebles_Todas_Anualidades_2026-09-26.json` no aparecen en el clon.
- El ZIP/Libro Diario AEAT no fue recibido.
- El binario PDF descrito en el anexo no está disponible para comprobar su identidad o cargarlo al Storage canónico.
- El registro truncado y posibles registros posteriores no son recuperables desde la evidencia conservada.

### Fuente E — Ausente

No hay un dump/export local de Firestore/Storage con el que resolver los IDs `propertyId` y los IDs antiguos contra titulares, carteras, inmuebles, contratos, gastos, facturas, proveedores, pólizas o suministros canónicos. Tampoco existe en el clon un lote completo y verificable de contratos/proveedores/documentos de Rentasync/AEAT.

## 2. Mapa Legacy → canónico disponible

El mapa campo-a-campo y las incidencias detalladas preexistentes están en `docs/FASE2-MAPA-ORIGEN-DESTINO-RENTASYNC.md`. Se mantiene esa fuente documental, sin duplicar una tabla de mapeos contradictoria.

| Campo/fuente legacy | Destino canónico | Transformación segura | Estado actual |
|---|---|---|---|
| `propertyId` (`prop_*`) | `inmuebles/{id}` / `Inmueble.id` | Sólo vincular con ID/mapeo estable documentado y comprobar titularidad; nunca con dirección aproximada | Los IDs externos existen en el anexo; no hay catálogo/dump actual para resolver las correspondencias. Pendiente. |
| `id` de movimiento | `Gasto.origenId` / historial del `CobroPeriodo` | Conservar como referencia de origen; ID destino determinista del motor B4 | IDs placeholder no autorizables; requieren origen íntegro. |
| `type=gasto`, `amount`, `date`, `description`, `category` | `Gasto` canónico | Normalización B1; monto numérico y fecha civil se validan; categoría ambigua queda en revisión; deducibilidad no se infiere | El motor documenta reglas; la evidencia no basta para promoción sin identidad/catalogación y decisiones pendientes. |
| `type=ingreso`, `category=rent` | `ContratoFormalizacion.registroCobros[]` | Requiere contrato/inquilino canónico y datos explícitos de estado/vencimiento | Sin contratos resueltos y con anualidad/duplicidad A/B pendiente: no migrado. |
| `address`, `owner`, datos de inquilino/contrato/hipoteca | Inmueble, propietario, candidato/contrato, préstamo | Transformación sólo con valores originales recuperados y claves/mapeos inequívocos | La evidencia conservada no contiene valores completos; no crear fichas por similitud. |
| `receiptName`, `receiptType`, marcador `receiptUrl_estado` | Referencia documental canónica existente; binario por flujo Storage canónico del Bloque 6 | Vincular sólo tras verificar binario, entidad y ámbito; no duplicar colección ni Storage | Sólo metadatos/marcador; binario ausente. No se creó documento ficticio. |
| Agregados `expenses.*`, `yearlyFinancials` | No se importan como movimientos | Se mantienen como evidencia de conciliación; el modelo actual deriva resúmenes desde detalle | No se promueven para evitar duplicar economía/fiscalidad. |
| `tenantHistory`, porcentajes/copropiedad y campos sin destino | Sin mapeo automático acreditado | Conservar origen/incidencia fuera de la promoción | Pendiente/no migrable hasta que exista diseño y evidencia. |

## 3. Identidad, aislamiento, trazabilidad y documentos

El motor B4 requiere resolver el inmueble/titular con catálogos o mapeos explícitos; no deriva propietario desde la cuenta ejecutora. Las carteras y delegaciones se aplican por el ámbito actual, no por una asociación histórica supuesta. Si un registro no tiene relación demostrable, queda incompleto/bloqueado.

Las claves de migración y destinos se derivan de fuente, entidad e ID de origen estable; las filas sin ID verificable no se sustituyen por hora, azar o similitud. El informe B4/O7 conserva `source`, `sourceFile`, `sourceId`, versión, transformaciones e incidencias.

Los documentos se vinculan solamente con el sistema documental/Storage canónico existente. Para el PDF citado no se afirma que exista binario y no se genera registro documental nuevo. No hay colección o bucket de migración documental paralelo.

## 4. Dry-run sobre el artefacto disponible

Se ejecutó el motor puro B4 sobre las 52 entradas del anexo, con catálogos de identidad vacíos porque el clon no contiene un snapshot canónico verificable. Resultado reproducible:

| Conteo B4 | Resultado |
|---|---:|
| Registros analizados | 52 |
| AUTO | 0 |
| INCOMPLETO | 36 |
| BLOQUEADO | 15 |
| NO_MIGRABLE (fila truncada) | 1 |
| Escrituras | 0 |

El resultado clasifica **la transcripción de evidencia**, no ejecuta una migración de datos reales y no autoriza promoción. La autorización O7 permanece `BLOQUEADA` al faltar el fichero canónico custodiado y su SHA original. No se ejecutó el Emulator ni una llamada a Firebase/Storage.

## 5. Reversibilidad y decisión

El código O7 existente sólo produce un plan declarativo de staging/rollback; `ejecutarMigracion()` permanece desactivado. No existe una ejecución histórica persistente que requiera rollback, y no se ha borrado ni sobrescrito información. Se conserva como pendiente hasta recibir/custodiar fuentes originales completas, catálogo actual autorizado, resolución explícita de incidencias y habilitación de una vía operativa de promoción bajo aislamiento.

No marcar como migrados inmuebles, contratos, operaciones, gastos, ingresos, facturas, proveedores, pólizas, suministros ni documentos. Para el anexo de evidencia, las únicas entidades históricas demostrables son el inventario parcial (7 IDs) y los 51 movimientos descritos, pero no están preparados para promoverse con seguridad.
