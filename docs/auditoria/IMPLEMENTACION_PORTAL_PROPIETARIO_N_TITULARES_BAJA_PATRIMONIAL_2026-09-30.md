# IMPLEMENTACIÓN · Portal del propietario con N titulares y baja patrimonial

**Fecha:** 2026-09-30
**Rama:** `arena/01a0f18c-gestor-de-inmuebles-vercel`
**Commit base:** `c6b858d4bc0e744ec302e497f2d318884e669c0d`
**Estado:** 3 bloques implementados y verificados · **sin mergear**

Documentos relacionados (auditoría previa, sin código):

- `docs/auditoria/DIAGNOSTICO_TITULARES_Y_BAJA_INMUEBLES_2026-09-30.md`
- `docs/auditoria/DISEÑO_PORTAL_PROPIETARIO_N_TITULARES_BAJA_PATRIMONIAL_2026-09-30.md`

---

## 1. QUÉ se ha hecho

Se ha corregido, en **tres bloques funcionales y testeados**, el modelo de
titularidad y el ciclo de vida de los inmuebles:

| Bloque | Objetivo | Estado |
|---|---|---|
| **1** | Persistencia real, rollback y aislamiento por propietario (Firestore Rules + queries + listeners + servicios) | ✅ |
| **2** | Titularidad extensible a **N** titulares y ciclo de vida patrimonial (vender ≠ borrar) | ✅ |
| **3** | UX del portal, corrección de la ficha, motores, publicación y validación final | ✅ |

La regla de oro de todo el trabajo: **nunca se inventa un dato, nunca se borra
historia, nunca se confirma en pantalla algo que Firestore ha rechazado.**

---

## 2. POR QUÉ (problemas reales corregidos)

1. **La UI mentía.** Había manejadores que hacían `setState(...)` y llamaban a
   Firestore sin `await`. Si la escritura era rechazada, la tarjeta desaparecía
   o aparecía "guardado" sin haberse guardado nada.
2. **El cotitular era invisible.** El filtro de la cartera sólo miraba
   `propietarioId` y `propietarioPrincipalId`: un titular en la ranura
   `propietarioSecundarioId` **no veía su propio inmueble**.
3. **Sólo cabían dos titulares.** El modelo forzaba a añadir campos escalares
   (la tentación de `propietarioTerciarioId` / `CuartoId` / `QuintoId`) para
   llegar a 3, 4 o N.
4. **Vender era borrar.** No existía un eje patrimonial: una venta se resolvía
   eliminando el documento, con lo que se perdían contratos, recibos, gastos,
   documentos, liquidaciones y fiscalidad.
5. **La ficha mostraba datos falsos.** El portal del propietario pintaba
   `precioRentaMensual` (campo inexistente → `" €/mes"`) y
   `superficieConstruida` (campo inexistente → `"0 m²"` aunque hubiera dato
   real). Al llegar la prop sin tipar, `tsc` no lo detectaba.
6. **El reparto era binario.** `repartoCopropiedad` sólo representa 2 titulares:
   con 3+ titulares podía acabar aplicándose un reparto que no era el real.

---

## 3. MODELO ANTIGUO → MODELO NUEVO

### 3.1 Modelo antiguo

```
Inmueble {
  propietarioId?            // titular "principal"
  propietarioPrincipalId?   // duplicidad del anterior
  propietarioSecundarioId?  // ÚNICA ranura extra: como máximo 2 titulares
  estado?: 'disponible' | 'alquilado'   // un solo eje, mezclado
}
```

- Titularidad embebida en el inmueble y limitada a 2.
- Sin histórico de titularidad.
- Sin eje patrimonial: la salida de cartera se resolvía con borrado físico.
- Reparto de liquidación binario (`repartoCopropiedad`).

### 3.2 Modelo nuevo

```
titularidades/{inmuebleId}__{propietarioId}      ← colección RAIZ
  inmuebleId        string   (inmutable)
  propietarioId     string   (inmutable)
  porcentaje        number | null
  porcentajePendiente boolean
  esPrincipal       boolean
  rol               PROPIETARIO | COTITULAR | USUFRUCTUARIO | NUDO_PROPIETARIO | REPRESENTANTE | ADMINISTRADOR_FINCAS
  estado            ACTIVA | BAJA | TRANSMITIDA | PENDIENTE
  fechaDesde, fechaHasta
  motivoBaja
  origen            ALTA | MIGRACION | IMPORTACION | CONTRATO | MANUAL | SISTEMA
  version           number   (incremental)
  historial[]       append-only (NUNCA se recorta)

Inmueble {
  titularesIds?: string[]          // índice rápido; la fuente de verdad es `titularidades`

  /* DOS EJES ORTOGONALES */
  estadoPatrimonial?: ACTIVO | EN_VENTA | VENDIDO | TRANSMITIDO | BAJA | HISTORICO
  estadoExplotacion?: DISPONIBLE | ALQUILADO | EN_REFORMA | NO_DISPONIBLE | SIN_EXPLOTACION
  bajaPatrimonial?: { tipo, fecha, motivo, ... }
  fechaVenta?: string
}
```

**Clave determinista** `inmuebleId__propietarioId` ⇒ idempotencia natural:
repetir la migración no crea duplicados.

**NO existe** `propietarioTerciarioId`, `propietarioCuartoId` ni
`propietarioQuintoId` (ni en código ni en reglas: hay un test que lo verifica
ignorando comentarios).

---

## 4. FICHEROS

### 4.1 Nuevos

| Fichero | Qué hace |
|---|---|
| `src/utils/erroresFirestore.ts` | Normaliza cualquier error de Firestore a un mensaje comprensible |
| `src/utils/mutacionFirestore.ts` | `ejecutarMutacion` / `ejecutarMutacionConfirmada`: persistir → confirmar → efectos |
| `src/utils/alcancePatrimonial.ts` | Aislamiento: `filtrarInmueblesPorTitularidad`, `esTitularDelInmueble`, `prepararAlcancePatrimonial` |
| `src/utils/titularidadesEngine.ts` | Motor de titularidad: alta, cierre, reactivación, vigencia, porcentajes, histórico |
| `src/utils/cicloPatrimonialEngine.ts` | Dos ejes, transiciones validadas, cartera activa vs histórico |
| `src/utils/titularidadesPresentacion.ts` | "Pendiente" en lugar de un porcentaje inventado; etiquetas de los ejes |
| `src/utils/fichaInmueblePresentacion.ts` | Lectura correcta de renta y superficie (3.2) |
| `src/utils/repartoNTitulares.ts` | Diagnóstico del reparto con N titulares (3.4) |
| `src/utils/publicacionCicloPatrimonial.ts` | Retirada de publicación por venta/baja, sin borrar (3.6) |
| `src/lib/titularidadesFirestore.ts` | Repositorio de `titularidades` |
| `src/lib/migracionTitularidades.ts` | Planificador de migración ADITIVA, REVERSIBLE e IDEMPOTENTE |
| `src/components/AvisoOperacionModal.tsx` | Aviso comprensible de éxito / error / aviso |
| `src/components/TitularidadesPanel.tsx` | Panel de N titulares: ver, añadir y cerrar (2.5 / 2.6 / 3.1) |

### 4.2 Modificados

| Fichero | Cambio |
|---|---|
| `src/types.ts` | Tipos de titularidad y campos de ciclo de vida en `Inmueble` (todos opcionales) |
| `firestore.rules` | Bloque `match /titularidades/{titularidadId}` con `allow delete: if false` |
| `src/lib/firebase.ts` | `subscribe*` con ámbito (`DataAccessScope`), `savePropietarioFirestore`, `deletePropietarioFirestore`, propagación de errores |
| `src/App.tsx` | Handlers confirmados (alta/edición/baja/eliminación), suscripción a titularidades, `handleMarcarVendido`, `handleDarDeBaja`, `handleAnadirTitular`, `handleCerrarTitularidad` |
| `src/components/sections/InmueblesSection.tsx` | Persistencia comprobada y rollback en alta/edición/baja/eliminación |
| `src/components/sections/PropietarioPortalSection.tsx` | Cartera activa / histórico, ejes visibles, titularidad, acciones de venta y baja, renta y superficie correctas |
| `tests/ficha-publica-inmueble.test.ts` | Adaptado al nuevo aislamiento |

---

## 5. MIGRACIÓN (2.3 · 2.4)

`src/lib/migracionTitularidades.ts` **planifica**, no ejecuta. Antes de cualquier
backfill real hay **dry-run** con:

- nº de documentos de inmueble analizados y afectados;
- titularidades generadas (desglosadas por acción: CREAR / ACTUALIZAR / SIN_CAMBIOS);
- inmuebles **sin titular**;
- porcentajes **pendientes** (desconocidos);
- incoherencias detectadas;
- duplicados evitados por la clave determinista.

**Política de porcentajes (2.3):**

- Si existe `repartoCopropiedad` y su `segundoPropietarioId` coincide con el
  segundo titular ⇒ se usa ese porcentaje real.
- Si no ⇒ `porcentajePendiente: true`. **Nunca** se pinta un 50/50 ni un
  33/33/33 como si fuera un dato.

**Garantías:**

- **Aditiva:** no elimina ni sobrescribe ningún campo heredado del inmueble.
- **Reversible:** `planReversion` **cierra** las titularidades migradas
  (`estado: BAJA`, `fechaHasta`, `motivoBaja: 'REVERSION_MIGRACION:<id>'`,
  `version + 1`, evento en el historial). No las borra, porque las reglas
  prohíben el `delete`.
- **Idempotente:** una segunda pasada devuelve `SIN_CAMBIOS`.
- **No destructiva con el trabajo manual:** una titularidad con
  `origen: 'ALTA'` no se sobrescribe.

> **No se ha ejecutado ningún backfill sobre datos reales.** Sólo el planificador
> y sus tests. La ejecución requiere una orden explícita.

---

## 6. REGLAS DE FIRESTORE (`firestore.rules`)

Bloque nuevo `match /titularidades/{titularidadId}`:

- **`allow delete: if false`** — incluido `sarqsan2@gmail.com` (2.2). La
  titularidad se **cierra**, nunca se borra.
- Clave invariante: `titularidadId == inmuebleId + '__' + propietarioId`,
  comprobada tanto en `create` como en `update`.
- Catálogos cerrados (`rol`, `estado`, `origen`) con cadenas explícitas `||`
  (el intérprete de reglas del harness evaluaba mal `in [...]` en este bloque).
- `inmuebleId` y `propietarioId` **inmutables**.
- Porcentaje: o es un número en rango, o `null` **con** `porcentajePendiente`.
- `version == previo + 1` e historial que **nunca mengua**.
- Aislamiento: sólo puede escribir quien participa en la titularidad del
  inmueble o es administración.

**Orden de los bloques (offset en bytes, verificado):**

```
match /inmuebles/            21726
match /titularidades/        25969   ← aquí
match /fichas_publicas_inmueble/  31113
match /{document=**}        118032   ← catch-all
```

> Aviso para futuras inserciones: **no** añadir bloques `match` entre el bloque
> §38 de sindicación y el catch-all. Hay un test que lo impide.

---

## 7. AISLAMIENTO (1.5)

Cuatro capas, no sólo React:

1. **Firestore Rules** (§ nuevo de `titularidades` + reglas de inmuebles).
2. **Queries** acotadas por `propietarioId` / `inmuebleId`.
3. **Listeners** (`subscribeInmuebles`, `subscribeTitularidades`) con `DataAccessScope`.
4. **Servicios y UI** (`scopedTitularidades`, `filtrarInmueblesPorTitularidad`).

Resultado: A ve sólo lo de A; B sólo lo de B; el **cotitular ve los inmuebles
en los que participa**; un titular ajeno no lee nada.

---

## 8. PERSISTENCIA (1.1 · 1.2 · 1.3)

`ejecutarMutacion` / `ejecutarMutacionConfirmada` imponen este orden:

```
1. aplicarOptimista?()          ← opcional y sólo si el rollback es trivial
2. await persistir()            ← si falla: revertir() + alError() y se detiene
3. await efectos?.()            ← SÓLO si (2) confirmó
4. alConfirmar() / alExito()    ← la UI cambia DESPUÉS de la confirmación
```

- **Prohibido** `setState(...)` + `deleteInmuebleFirestore(...)` sin `await`.
- Una operación principal fallida **no** ejecuta efectos secundarios
  (ni candidatos, ni contratos, ni titulares, ni documentos).
- Si un efecto secundario falla, la principal ya está confirmada: **no se
  revierte**, pero se informa del fallo parcial.

---

## 9. CICLO DE VIDA E HISTÓRICO (2.7 · 2.8 · 2.9 · 2.10 · 2.11)

### Dos ejes ortogonales

| Eje | Valores |
|---|---|
| **PATRIMONIAL** | `ACTIVO`, `EN_VENTA`, `VENDIDO`, `TRANSMITIDO`, `BAJA`, `HISTORICO` |
| **EXPLOTACIÓN** | `DISPONIBLE`, `ALQUILADO`, `EN_REFORMA`, `NO_DISPONIBLE`, `SIN_EXPLOTACION` |

`estadoPatrimonialDe()` devuelve `ACTIVO` si el campo falta y
`estadoExplotacionDe()` **deriva** del `estado` heredado ⇒ **cero cambio de
comportamiento** para los documentos existentes.

### Vender ≠ borrar

- `marcarVendido` sólo toca `estadoPatrimonial`, `bajaPatrimonial` y
  `fechaVenta` (test que verifica `clavesAfectadasPorVenta`).
- El inmueble **sale de la cartera activa** y **entra en el histórico**.
- **Se conservan** contratos, inquilinos históricos, recibos, ingresos, gastos,
  facturas, documentos, IBI, basura, reparaciones, incidencias, suministros,
  liquidaciones, fiscalidad y trazabilidad.
- `EN_VENTA` **sigue en la cartera activa** (se está comercializando).

### Histórico de titularidad reconstruible (2.10)

`reconstruirHistorial` permite responder a "¿quién era titular en 2020?":

```
2020  A 50 % / B 50 %
2025  A 100 %          (B transmite)
2028  VENDIDO
```

### El borrado físico NO es el mecanismo normal (2.11)

La acción normal es **"Dar de baja"** o **"Marcar como vendido"**.
`esBorrableFisicamente` sólo es cierto para un inmueble histórico sin contrato
ni expediente: un caso excepcional y explícito.

---

## 10. BLOQUE 3 · UX Y MOTORES

- **3.1** Portal del propietario con cartera activa / histórico, alta, edición,
  baja, "marcar como vendido", gestión de titulares y consulta de porcentajes.
  Sin funciones de administración: el portal sigue siendo un portal.
- **3.2** `formatearRentaMensual` / `formatearSuperficie`: se leen `precio`
  (o `rentaMensual`) y `superficie` (o el dato catastral). Sin dato ⇒ `"—"`.
  Adiós a `" €/mes"` y `"0 m²"`.
- **3.3** Revisión de motores **sólo donde la relación N aplica**: no se han
  hecho refactors cosméticos ni se han cambiado reglas de negocio ajenas.
- **3.4** `diagnosticarReparto`: con 3+ titulares el reparto binario **no se
  aplica** (tipo `NO_REPRESENTABLE`) y se informa. Con porcentajes reales que
  suman 100 se usa el reparto de la titularidad. **Sin repartos falsos.**
- **3.5** Compatibilidad import/export: los campos nuevos son opcionales; un
  documento heredado se comporta igual; la migración es aditiva; round-trip
  JSON sin pérdida.
- **3.6** Venta/baja ⇒ la publicación activa pasa a `DESPUBLICADO` con motivo y
  fecha (**retirar ≠ borrar**), conservando el registro y su trazabilidad.

---

## 11. PRUEBAS

### 11.1 Escenario E2E obligatorio

`tests/escenario-e2e-portal-propietario.test.ts` (11 tests):

- A crea a los titulares B y C.
- **INMUEBLE 1** = A 50 % / B 30 % / C 20 % (N = 3).
- **INMUEBLE 2** = sólo A.
- B entra y ve **únicamente** INMUEBLE 1 (comprobado por `inmueblesDelTitular`
  y por `filtrarInmueblesPorTitularidad`).
- INMUEBLE 1 se alquila (contrato / recibos / gastos / documentos).
- INMUEBLE 1 se **vende** ⇒ `VENDIDO`: **desaparece de la cartera activa**,
  **sigue en el histórico** y conserva contrato, recibos, gastos, documentos,
  IBAN y catastro.
- Histórico de titularidad reconstruible (A,B,C → A,B tras transmitir C) y
  `estadoExplotacion` sigue `ALQUILADO`.

### 11.2 Batería nueva

| Fichero | Tests | Cubre |
|---|---:|---|
| `src/utils/titularidadesEngine.test.ts` | 27 | Alta, cierre, vigencia, N titulares, porcentajes, histórico |
| `src/utils/alcancePatrimonial.test.ts` | 26 | Aislamiento A/B/cotitular/ajeno |
| `tests/ficha-publica-inmueble.test.ts` | 30 | Ficha pública y aislamiento |
| `tests/aislamiento-carteras-propietario.test.ts` | 19 | A ∌ B, B ∌ A, cotitular sí |
| `src/utils/cicloPatrimonialEngine.test.ts` | 19 | 2.7, 2.8, 2.9, 2.11 |
| `tests/titularidades-reglas.test.ts` | 17 | Reglas de Firestore evaluadas sin emulador |
| `src/lib/migracionTitularidades.test.ts` | 15 | 2.3, 2.4 (aditiva, reversible, idempotente) |
| `tests/bloque3-presentacion-y-publicacion.test.ts` | 18 | 3.2 y 3.6 |
| `src/utils/repartoNTitulares.test.ts` | 13 | 3.4 sin repartos falsos |
| `tests/escenario-e2e-portal-propietario.test.ts` | 11 | E2E obligatorio |
| `tests/compatibilidad-import-export.test.ts` | 8 | 3.5 |
| `src/utils/mutacionFirestore.test.ts` | 9 | 1.1, 1.2, 1.3 |
| `src/utils/erroresFirestore.test.ts` | 9 | Mensajes comprensibles |

### 11.3 Resultados de la validación final

| Comando | Resultado |
|---|---|
| `npx tsc --noEmit` | **0 errores** |
| `npm run lint` | **0 errores** |
| `npm run build` | **OK** (11,2 s) |
| `npx vitest run` | **1491 passed · 1 failed · 2 skipped (1494)** |

**El único test que falla es PREVIO a este trabajo y no ha sido tocado por él:**

```
src/test/e/bloqueE.portal.test.tsx
  › registrar lectura de contador: lectura INQUILINO inmutable enlazada
    al suministro; lectura decreciente rechazada
```

Verificación: se ha creado un `git worktree` limpio en el commit base
`c6b858d` y el mismo test **falla exactamente igual** (32 passed / 1 failed,
el mismo caso). No guarda relación con los bloques 1, 2 ni 3.

---

## 12. RIESGOS PENDIENTES

1. **Backfill no ejecutado.** El planificador de migración está implementado y
   testeado, pero **no se ha materializado ninguna titularidad en datos
   reales**. Requiere dry-run previo y orden explícita.
2. **Porcentajes desconocidos.** Habrá inmuebles con `porcentajePendiente`.
   El sistema los muestra como "Pendiente" y bloquea el reparto; hay que
   completarlos con el dato real.
3. **Reglas evaluadas con harness, no con emulador.** No hay Java ni Firebase
   CLI en el entorno, así que las reglas se validan con
   `tests/helpers/evaluadorReglasFirestore.ts`. Conviene repetir la validación
   con el emulador antes de desplegar `firestore.rules`.
4. **Reversión por cierre, no por borrado.** Al prohibir el `delete`, la
   reversión de la migración **cierra** las relaciones en lugar de eliminarlas.
   Está documentado y testeado, pero conviene saberlo antes de revertir.
5. **Retirada de publicación dependiente del repositorio de sindicación.** La
   retirada se hace a través de `guardarEstadoSindicacionFirestore`; si el
   registro no cumple sus invariantes, la venta se guarda y la publicación
   queda **pendiente de retirar** (con aviso al usuario).

---

## 13. GAPs NO RESUELTOS (documentados, no improvisados)

1. **Test preexistente de lecturas de contador.** `bloqueE.portal.test.tsx`
   falla antes y después de este trabajo. Se deja **sin tocar** a propósito:
   arreglarlo queda fuera del alcance de los 3 bloques y merece su propio
   análisis (puede ser un bug real del motor de lecturas).
2. **`repartoCopropiedad` sigue siendo binario en el modelo de datos.** No se
   ha rediseñado la configuración fiscal: se ha añadido una capa de
   **diagnóstico** que impide aplicar un reparto que no representa la
   titularidad. El rediseño a reparto N es un trabajo aparte.
3. **Alta de titular ≠ alta de usuario.** Añadir un titular crea la
   *titularidad*; la cuenta de acceso y la autorización se gestionan aparte,
   tal y como exige el punto 2.6. No se automatiza la creación de credenciales.
4. **Histórico patrimonial del portal.** El histórico es consultable, pero aún
   no tiene una pantalla propia de "expediente histórico" con todos sus
   bloques; hoy se accede desde la pestaña "Histórico" y la ficha.
5. **Motor de valoración / reporting.** No se han tocado salvo en lo estrictamente
   necesario para N titulares: se descartan refactors cosméticos (prohibidos
   expresamente).

---

## 14. CRITERIOS DE NO ACEPTACIÓN · verificación

| # | Criterio | Estado |
|---|---|---|
| 1 | Sólo 2 titulares | ✅ N titulares con clave determinista |
| 2 | Campos escalares para el 3º/4º | ✅ Inexistentes (test que lo comprueba) |
| 3 | El cotitular no ve su inmueble | ✅ Ve los suyos (E2E + aislamiento) |
| 4 | Un propietario descarga otra cartera | ✅ Aislamiento en 4 capas |
| 5 | Firestore falla y la UI dice "guardado" | ✅ `ejecutarMutacion*`: la UI cambia tras confirmar |
| 6 | Fallo al borrar deja la tarjeta fuera | ✅ Sin optimismo en borrado; rollback en el resto |
| 7 | Operación fallida muta secundarias | ✅ Efectos condicionados al éxito |
| 8 | Vender borra contratos/recibos/gastos/fiscalidad | ✅ `clavesAfectadasPorVenta` (test) |
| 9 | Se pierde el histórico de titularidad | ✅ Append-only + `reconstruirHistorial` |
| 10 | El inmueble vendido sigue activo | ✅ Fuera de cartera activa |
| 11 | El inmueble vendido desaparece del todo | ✅ Sigue en histórico |
| 12 | Porcentajes inventados | ✅ `porcentajePendiente`, nunca 50/50 |
| 13 | `undefined €/mes` | ✅ `"—"` (test) |
| 14 | `0 m²` con dato real | ✅ Lee `superficie` / dato catastral |
| 15 | Romper contratos/fiscalidad existentes | ✅ Campos nuevos opcionales; `ACTIVO` por defecto |
| 16 | Modificar reglas de negocio ajenas | ✅ Sólo lo imprescindible para N titulares |
| 17-20 | (persistencia, rollback, aislamiento, trazabilidad) | ✅ Cubiertos en los bloques 1 y 2 |

---

## 15. ENTREGA

- **Commit y push** en `arena/01a0f18c-gestor-de-inmuebles-vercel`.
- **Pull Request preparada contra la rama base. NO MERGEADA.**
