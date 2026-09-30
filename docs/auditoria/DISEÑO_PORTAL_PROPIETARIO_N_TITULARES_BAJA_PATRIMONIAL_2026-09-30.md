# DISEÑO — PORTAL PROPIETARIO: N TITULARES + BAJA PATRIMONIAL

**Fecha:** 2026-09-30
**Rama:** `arena/01a0f18c-gestor-de-inmuebles-vercel` · **Commit base:** `c6b858d`
**Estado:** DOCUMENTO DE DISEÑO. **NO SE IMPLEMENTA NADA.**
**Órdenes respetadas:** sin cambios de código · sin cambios de datos · sin cambios de `firestore.rules` · sin migraciones · sin usuarios · sin commit · sin push · sin PR · sin merge.
**Documento previo:** `docs/auditoria/DIAGNOSTICO_TITULARES_Y_BAJA_INMUEBLES_2026-09-30.md`

---

## 1. RESUMEN EJECUTIVO

### 1.1 Veredicto

El ERP tiene un **modelo patrimonial binario** (`propietarioPrincipalId` + `propietarioSecundarioId`) y un **modelo de borrado destructivo** (`deleteDoc` sobre `inmuebles/{id}`). Ninguno de los dos sirve para gestionar patrimonio real. Ambos deben sustituirse por:

| Dimensión | Hoy | Objetivo |
|---|---|---|
| **Titularidad** | 2 ranuras fijas en el documento del inmueble | Colección normalizada `titularidades` (N titulares, con porcentaje, vigencia y estado) |
| **Cuenta ↔ titular** | `usuarios.propietarioId` escalar (1:1) | `vinculaciones_acceso` (N:M) + `usuarios_auth.propietarioIds[]` |
| **Gestor** | Inexistente como entidad (sólo un rol sin relación) | `vinculaciones_acceso` con `tipo: 'GESTOR'` y alcance acotado |
| **Ciclo de vida** | `estado: 'disponible' \| 'alquilado'` (sólo explotación) | Dos ejes: `estadoPatrimonial` + `estadoExplotacion` |
| **Baja / venta** | `deleteDoc` físico (sólo MASTER) | `estadoPatrimonial: 'VENDIDO' \| 'BAJA'` — fuera de cartera activa, **histórico íntegro** |
| **Histórico** | Se destruye con el borrado | `titularidades` inmutables + `titularidades_historial` append-only + `historialPatrimonial` en el inmueble |
| **Aislamiento** | `list` de `inmuebles` = `isStaff()`, filtrado en cliente | `list` acotado por `titularesIds.hasAny(myPropIds())` + listener con `where` |

### 1.2 Hallazgos nuevos de esta auditoría (no cubiertos por el diagnóstico previo)

| # | Hallazgo | Impacto |
|---|---|---|
| **N1** | **Ya existe un patrón de baja lógica en el ERP**: `inventarioEngine.aplicarBajaLogica()` (`src/utils/inventarioEngine.ts:202-225`) pone `estado: 'BAJA'`, `activo: false` y añade entrada de `historial`. `ElementoInventario` tiene `activo`, `fechaAlta`, `fechaModificacion`, `creadoPor`, `actualizadoPor`, `historial[]`. **Es el precedente exacto a replicar** para inmuebles y titularidades. | Positivo — reduce riesgo |
| **N2** | **Ya existe un patrón de aislamiento correcto en reglas**: `sindicacion_inmuebles` (`firestore.rules:2129-2194`) tiene `allow list` acotado por `propietarioId`, `documentoCoherente()` con validación campo a campo, y un comentario explícito: *"retirar no borra, deja `DESPUBLICADO` con su trazabilidad"*. **Es la plantilla de reglas a copiar** para `titularidades`. | Positivo — reduce riesgo |
| **N3** | **Ya existe el concepto "VENDIDO" pero no hace nada**: `EstadoRecomercializacion` incluye `'CERRADO_VENDIDO'` y `ExpedienteRecomercializacion.resultadoCierre?: 'REARRENDADO' \| 'VENDIDO'` (`types.ts:2001`, `:2159`). `handleCerrarExpedienteRecomerc` (`App.tsx:2643-2672`) recibe `VENDIDO` y… **sólo libera el inmueble** (`estado: 'disponible'`). La venta no tiene ningún efecto patrimonial. | GAP G4 |
| **N4** | **`ContratoFormalizacion` duplica la titularidad binaria**: `tieneSegundoPropietario`, `segundoPropietarioNombre`, `…Dni`, `…Direccion`, `…Telefono`, `…Email`, `…EsPersonaJuridica` (`types.ts:1080-1086`). Son **7 campos copiados** en cada contrato. Con N titulares sería inasumible. | GAP G7 |
| **N5** | **La recomendación `repartoCopropiedad` es binaria y MASTER-only**: `config_liquidacion/{propietarioId}` (`rules:1751-1758`) con `segundoPropietarioId` + `porcentajeSegundo` (`tesoreria/tipos.ts:57-58`). Es el **único** sitio donde hoy hay porcentaje de participación. | Clave para la migración |
| **N6** | **28 de 40 listeners no reciben `DataAccessScope`**: `subscribeInmuebles`, `subscribeCandidatos`, `subscribePolizas`, `subscribeSiniestros`, `subscribeFacturas`, `subscribeTrabajosProfesionales`, `subscribeInventarioInmueble`, `subscribeHabitacionesInmueble`, `subscribeUsuarios`, `subscribeProfesionales`, … (`src/lib/firebase.ts`). El aislamiento es cliente en todos ellos. | GAP G6 severo |
| **N7** | **Estado fantasma `'reservado'`**: `AdminControlCenter.tsx:129` filtra `i.estado === 'alquilado' || i.estado === 'reservado'`, pero `'reservado'` **no existe** en el tipo (`types.ts:484`). Código muerto que además infla la tasa de ocupación. | GAP G3 (menor) |
| **N8** | **`Inmueble` ya tiene datos patrimoniales**: `valorAdquisicion`, `valoracionEstimada`, `fechaAdquisicion`, `rentabilidadEstimada` (`types.ts:515-518`). Falta `fechaVenta`, `valorVenta`, `adquirente`. | Facilita el diseño |
| **N9** | **No hay `node_modules` instalado** ⇒ no se puede ejecutar `tsc --noEmit` para confirmar el error de tipos del bug visual. Confirmado por análisis estático: `precioRentaMensual` y `superficieConstruida` **no están declarados en ningún punto de `src/`** fuera de las 2 líneas que los usan. | Ver §17 |

### 1.3 Principio rector

> **BAJA/VENDIDO ≠ BORRADO DEL HISTÓRICO · TITULARIDAD ACTUAL ≠ HISTORIAL PATRIMONIAL**

Y un segundo principio, operativo:

> **La UI nunca confirma una operación que Firestore no ha confirmado.**

---

## 2. MODELO ACTUAL (inventario completo)

### 2.1 Titular — `propietarios/{id}` (`Propietario`, `types.ts:425-455`)

Entidad **correcta y suficiente** para representar a un titular. Campos: identidad fiscal, tipo, contacto, domicilio de notificaciones, representante legal, `cuentasBancarias[]`, notas privadas, metadatos.

**Falta:** porcentaje de participación (vive hoy en `config_liquidacion`), vigencia, estado del titular.

### 2.2 Cuenta de acceso — `usuarios/{id}` (`UsuarioApp`, `types.ts:1695-1719`)

- `propietarioId?: string` — **escalar, 1:1**.
- `inmuebleIds?: string[]` — única vía de delegación (concedida sólo por MASTER).
- `roles[]`, `permisos[]` — **declarativos, sin uso funcional** (verificado: ningún componente evalúa `permisos`; sólo se muestran en `AuthModal.tsx:135-136` y en el contexto de tutoriales).
- Espejo `usuarios_auth/{uid}` con `propietarioId: string` (`authService.ts:95`) — **es lo que leen las reglas**.

### 2.3 Relación cuenta ↔ titular — 1:1 estricta

```
usuarios.propietarioId (string) ──► propietarios/{id}
```

Helper de reglas `myPropId() = me().propietarioId` (`rules:154-156`). **Toda** la capa de aislamiento depende de este escalar: `ownsPropietario`, `contratoEsMio`, `gastoEsMio`, `aisladoEsMio`, `canReachInmuebleId`, `myInmuebleIds`.

### 2.4 Relación titular ↔ inmueble — binaria y redundante

**(a) Escalares en `Inmueble` (`types.ts:499-503`):**

```ts
propietarioId?: string;              // "ID permanente del titular vinculado"
propietarioPrincipalId?: string;
propietarioSecundarioId?: string;
```

**(b) Copia desnormalizada `Inmueble.datosFiscales` (`types.ts:467-476`):**

```ts
propietarioPrincipal: PropietarioFiscal;      // nombre, nifDni, direccion, …
tieneSegundoPropietario?: boolean;
segundoPropietario?: PropietarioFiscal;
```

Ambos mecanismos conviven y **se desincronizan** (reconocido en `PropietariosSection.tsx:1322`).

### 2.5 Inventario de acoplamiento a principal/secundario (producción, 33 ficheros)

| Capa | Ficheros y líneas |
|---|---|
| **Tipos** | `types.ts:474-475` (`datosFiscales`), `:500-501` (escalares), `:1080-1086` (contrato) |
| **UI alta/edición inmueble** | `InmueblesSection.tsx:366`, `:486-487`, `:509-510`, `:636`, `:660-671`, `:742-743`, `:779-780`, `:1155-1177`, `:1812` |
| **UI admin** | `AdminControlCenter.tsx:206`, `:779`, `:860`, `:1257`, `:1315` |
| **UI propietario** | `PropietarioPortalSection.tsx:101` · `PropietariosSection.tsx:107-112`, `:141` |
| **Otros UI** | `CrearUsuarioModal.tsx:107` · `RecomercializarModal.tsx:96` · `HabitacionesInmueblePanel.tsx:91` · `ActasSection.tsx:47` · `AdministracionSection.tsx:447` · `ConciliacionBancariaSection.tsx:59` · `InformesSection.tsx:91` · `TesoreriaSection.tsx:380` · `FormalizarContratoModal.tsx:589-628` |
| **App** | `App.tsx:542` (scoping), `:2452` |
| **Contratos LAU** | `contratoEngine.ts:221-304`, `:409-421`, `:472-473`, `:528-529`, `:618-621` |
| **Portal inquilino** | `inquilino/portalEngine.ts:171` |
| **Tesorería** | `tesoreria/tipos.ts:57-58` · `tesoreria/liquidacionEngine.ts:86`, `:314` |
| **Fiscalidad** | `fiscalEngine.ts:587-588` |
| **Gastos / trabajos** | `gastosEngine.ts:618`, `:685` |
| **Cobros** | `cobrosEngine.ts:696` |
| **Habitaciones** | `habitacionesEngine.ts:190`, `:371`, `:515` |
| **Publicación / sindicación** | `publicacionEngine.ts:130`, `:328` · `fichaPublicaInmueble.ts:125-126`, `:157` |
| **Conciliación** | `conciliacion/matchingEngine.ts:205`, `:217` |
| **Informes** | `reportingEngine.ts:124`, `:172`, `:653`, `:716`, `:816`, `:893` |
| **Auth / permisos** | `authService.ts:851` |
| **Tests** | `tests_reporting.ts:68,88,108,127` · `tests_conciliacion.ts:33` · `fixturesE.ts:74` |

> **Conclusión:** 33 ficheros de producción acoplados al par principal/secundario. **No es un cambio local.**

### 2.6 Estructuras que YA soportan N elementos y son reutilizables (F)

| Estructura | Referencia | Reutilizable como… |
|---|---|---|
| `UsuarioApp.inmuebleIds: string[]` | `types.ts:1709` | Alcance delegado por inmueble |
| `Profesional.inmuebleIdsAsignados: string[]` | `types.ts:1777` | Asignación N:M profesional↔inmueble |
| `Profesional.creadoPorPropietarioId` | `types.ts:1757` | Trazabilidad de quién crea una entidad |
| `Inmueble.suministroIds[]` / `contratoIdsAutorizados[]` | `types.ts:552`, `:556` | Índices de consulta para reglas |
| `ContratoFormalizacion.contratosDerivadosIds[]` | `types.ts:1150` | Cadena histórica |
| `Propietario.cuentasBancarias[]` | `types.ts:452` | Subentidad N-aria ya modelada |
| `ContratoFormalizacion.anexos: AnexoContractual[]` | `types.ts:1161` | Versionado con `SUPERSEDIDO` |
| `indiceInmutableOCrece()` | `rules:381-389` | Helper de reglas para listas que sólo crecen |
| `listaSoloCrece()` / `mismoCampoOpcional()` | `rules:391-405` | Inmutabilidad parcial en reglas |
| `documentoCoherente()` de sindicación | `rules:2132-2151` | **Plantilla de validación campo a campo** |
| `FinalizacionContrato` | `types.ts:866-874` | **Plantilla de cierre con motivo y autor** |
| `aplicarBajaLogica()` de inventario | `inventarioEngine.ts:202-225` | **Plantilla de baja lógica** |
| `backfillFichasPublicas.ts` | `src/lib/` | **Plantilla de script de backfill** (analizar → materializar → informe) |
| `tests/harness/firestoreRulesEval.ts` + `tests/helpers/evaluadorReglasFirestore.ts` | `tests/` | Verificación textual de reglas |

### 2.7 Histórico que YA existe y NO debe perderse (G)

| Histórico | Referencia | Riesgo |
|---|---|---|
| `ContratoFormalizacion.historial[]` | `types.ts:1187` | Se destruye al borrar el inmueble (el contrato queda huérfano) |
| `registroCobros: CobroPeriodo[]` (96 recibos del caso real) | `types.ts:1190` | **Ídem** |
| Cadena `contratoOrigenId` → `contratoDerivadoId` → `contratosDerivadosIds[]` | `types.ts:1146-1150` | Se rompe |
| `finalizacion: FinalizacionContrato` + `finiquito` | `types.ts:1156`, `:1163` | Se pierde |
| `anexos: AnexoContractual[]` (versionado) | `types.ts:1161` | Se pierde |
| `generarHistoricoFiscalInmueble()` (n ejercicios) | `fiscalEngine.ts:620-641` | Se pierde |
| `inventario_historial` + `HistorialInventarioItem` | `types.ts:591`, `:625` | Colección huérfana |
| `actas`, `actas_evidencias`, `actas_incidencias`, `actas_otp` | `rules:1899-2094` | **Valor probatorio** comprometido |
| `expedientes_morosidad_hist` (append-only) | `rules:1793-1806` | Se pierde |
| `liquidaciones_propietarios`, `ordenes_pago`, `ficheros_sepa` | BLOQUE B | Se pierde |
| `facturas`, `registros_facturación`, `envios_verifactu` | VERI*FACTU | **Riesgo legal**: facturas sin soporte |
| `sindicacion_inmuebles` (`DESPUBLICADO` con trazabilidad) | `rules:2129` | Queda fuera; debe despublicarse antes de la venta |
| `datosFiscales` (copia histórica congelada) | `types.ts:467` | **Debe conservarse como foto histórica**, no migrarse |

> **Consecuencia directa:** el `deleteDoc` actual destruye **todo** lo anterior. Por eso la baja debe ser un cambio de estado, nunca un borrado.

---

## 3. PROBLEMAS CONFIRMADOS

| ID | Problema | Evidencia | Clase |
|---|---|---|---|
| **P1** | Titularidad binaria; sin array, sin porcentaje por inmueble | `types.ts:499-503`, `:467-476` | G7 |
| **P2** | `propietarioId` escalar ⇒ 1 cuenta = 1 titular | `types.ts:1710`, `rules:154-156` | G7 |
| **P3** | Contrato duplica la titularidad en 7 campos copiados | `types.ts:1080-1086` | G7 |
| **P4** | Reparto de liquidación binario y MASTER-only | `tesoreria/tipos.ts:57-58`, `rules:1751-1758` | G7 |
| **P5** | Cotitular secundario invisible (no entra en scoping) | `App.tsx:542`, `PropietarioPortalSection.tsx:101` | G3+G6 |
| **P6** | `datosFiscales` desincronizado de `propietarios/{id}` | `PropietariosSection.tsx:1322` | G3 |
| **P7** | Propietario no puede crear/asociar titulares | `rules:418-422` | G5 |
| **P8** | Alta de inmueble sin preselección ⇒ `permission-denied` silencioso + fantasma en localStorage | `InmueblesSection.tsx:168`, `firebase.ts:364-366` | G4 |
| **P9** | Borrado optimista + `delete` sin `await` + error tragado | `App.tsx:1662-1683`, `firebase.ts:371-381` | G4 |
| **P10** | Efecto colateral destructivo aun cuando el borrado falla | `App.tsx:1670-1682`, `rules:988-1006` | G4+G6 |
| **P11** | `list` de `inmuebles` = `isStaff()` y listener sin `where` | `rules:450`, `firebase.ts:261-277`, `App.tsx:967` | G6 |
| **P12** | 28 listeners sin `DataAccessScope` | `firebase.ts` (ver §2.6/N6) | G6 |
| **P13** | `candidatos` update/delete = `isSignedIn()` | `rules:988`, `:1006` | G6 |
| **P14** | No existe baja lógica / VENDIDO / HISTÓRICO para inmuebles | `types.ts:484` | G5 |
| **P15** | `'CERRADO_VENDIDO'` existe en recomercialización pero no afecta al inmueble | `App.tsx:2643-2672` | G4 |
| **P16** | Sin comprobación de dependencias antes de borrar; sin cascada | `InmueblesSection.tsx:3392-3409` | G4/G5 |
| **P17** | `deleteDoc` físico en 29 colecciones (ver §11) | `firebase.ts` | G4 |
| **P18** | Campos inexistentes en la tarjeta "Mis Viviendas" | `PropietarioPortalSection.tsx:336`, `:351` | G4 |
| **P19** | Estado fantasma `'reservado'` | `AdminControlCenter.tsx:129` | G3 |
| **P20** | Rol ADMINISTRADOR ausente en reglas (dependencia documental) | §18 | G6 |
| **P21** | `permisos[]` sin uso funcional | verificado en §2.2 | G3 |
| **P22** | `propietarioId` y `propietarioPrincipalId` redundantes, tratados como alternativos por las reglas | `rules:452-464` | G3 |

---

## 4. MODELO OBJETIVO — N TITULARES

### 4.1 Decisión: colección raíz `titularidades` + índice array en `Inmueble`

**Descartado explícitamente:** `propietarioTerciarioId`, `propietarioCuaternarioId`, … (ordén expresa del usuario).

**Alternativas evaluadas:**

| Opción | "Titulares de un inmueble" | "Inmuebles de un titular" | Aislamiento demostrable en reglas | Veredicto |
|---|---|---|---|---|
| **A. Array embebido `Inmueble.titulares[]`** | ✅ trivial (ya en el doc) | ❌ No consultable sin índice compuesto + no demostrable en reglas para `list` | ⚠️ difuso | Rechazada |
| **B. Subcolección `inmuebles/{id}/titulares/{tid}`** | ✅ natural | ❌ Requiere collection-group query; las reglas de collection-group no pueden acotar por el padre de forma demostrable | ❌ | Rechazada |
| **C. Colección raíz `titularidades` + `Inmueble.titularesIds[]`** | ✅ `where('inmuebleId','==',id)` | ✅ `where('titularesIds','array-contains',pid)` | ✅ `resource.data.titularesIds.hasAny(myPropIds())` | **✅ ELEGIDA** |

**Razón decisiva:** la opción C resuelve **simultáneamente** el problema de N titulares (§4) y el de aislamiento de carteras (§10), porque el índice `titularesIds[]` en el documento del inmueble permite escribir una regla de `list` **demostrable** — exactamente el patrón que `sindicacion_inmuebles` ya usa con éxito.

### 4.2 Esquema `titularidades/{titularidadId}`

```ts
export type EstadoTitularidad =
  | 'ACTIVA'        // participa ahora
  | 'SUSPENDIDA'    // participa pero temporalmente inactiva (p.ej. litigio)
  | 'FINALIZADA'    // dejó de participar (transmisión, extinción)
  | 'CANCELADA';    // alta errónea anulada

export type RolTitularidad =
  | 'TITULAR'            // pleno dominio
  | 'USUFRUCTUARIO'      // usufructo
  | 'NUDO_PROPIETARIO'   // nuda propiedad
  | 'REPRESENTANTE';     // apoderado / administrador de la comunidad

export interface Titularidad {
  /** Inmutable. `tit_<inmuebleId>_<propietarioId>` o nanoid. */
  id: string;

  // --- Identidad de la relación (INMUTABLES) ---
  inmuebleId: string;
  propietarioId: string;
  /** Índice de unicidad: `${inmuebleId}__${propietarioId}`. Impide duplicados. */
  clave: string;

  // --- Participación ---
  /** 0 < p <= 100. Dos decimales. La suma por inmueble de las ACTIVAS debe ser 100. */
  porcentaje: number;
  /** A lo sumo UNA titularidad ACTIVA por inmueble puede ser principal. */
  esPrincipal: boolean;
  rol: RolTitularidad;

  // --- Vigencia ---
  fechaDesde: string;        // YYYY-MM-DD
  fechaHasta?: string;       // YYYY-MM-DD · null/undefined = vigente
  estado: EstadoTitularidad;

  // --- Motivación y trazabilidad ---
  motivoAlta?: string;
  motivoBaja?: string;
  origen: 'ALTA_INMUEBLE' | 'MIGRACION' | 'COMPRAVENTA' | 'HERENCIA'
        | 'DONACION' | 'DIVISION' | 'APORTACION' | 'OTRO';
  /** true cuando el porcentaje no consta en origen y debe confirmarse (NUNCA inventar). */
  porcentajePendiente?: boolean;
  /** true cuando el titular no tiene ficha en `propietarios` (viene de `datosFiscales`). */
  fichaPendiente?: boolean;
  documentoReferencia?: string;  // escritura, referencia registral…

  // --- Versionado ---
  version: number;

  // --- Metadatos (refuerzan el patrón de ElementoInventario) ---
  creadoPor: string;         // nombre
  creadoPorId?: string;
  creadoEn: string;          // ISO
  actualizadoPor?: string;
  actualizadoEn?: string;

  // --- Histórico embebido (lectura rápida) ---
  historial?: HistorialTitularidadItem[];
}

export interface HistorialTitularidadItem {
  id: string;
  fecha: string;                  // ISO
  usuarioId?: string;
  usuarioNombre: string;
  accion: 'ALTA' | 'MODIFICACION_PORCENTAJE' | 'CAMBIO_PRINCIPAL'
        | 'SUSPENSION' | 'FINALIZACION' | 'CANCELACION' | 'REACTIVACION';
  estadoAnterior?: EstadoTitularidad;
  estadoNuevo?: EstadoTitularidad;
  porcentajeAnterior?: number;
  porcentajeNuevo?: number;
  detalle?: string;
}
```

**Invariantes (validables en reglas y en motor):**

1. `id == clave` compuesta → **sin duplicados por escritura**.
2. `inmuebleId` y `propietarioId` **inmutables** tras el alta (`request.resource.data.X == existing().X`).
3. Suma de `porcentaje` de las `ACTIVAS` por inmueble `== 100` (± 0,01 de tolerancia). **Validación en motor**, no en reglas (Firestore no puede agregar).
4. A lo sumo una `esPrincipal: true` por inmueble.
5. `fechaHasta` sólo presente en estados terminales.
6. **`NUNCA se borra una titularidad`**: los cambios de titularidad son `FINALIZADA` + nueva `ALTA`.

### 4.3 Cambios en `Inmueble`

```ts
export interface Inmueble {
  // ... campos existentes ...

  // --- NUEVO: índices de consulta (los leen las reglas) ---
  /** IDs de propietario con titularidad ACTIVA. Espejo de `titularidades`. */
  titularesIds?: string[];
  /** Igual pero incluye titularidades históricas (para informes/auditoría). */
  titularesHistoricosIds?: string[];
  /** Titular principal vigente. Sustituye a propietarioId/propietarioPrincipalId. */
  titularidadPrincipalId?: string;

  // --- COMPATIBILIDAD (sólo lectura durante la transición) ---
  /** @deprecated Usar `titularesIds`. Se conserva para no romper 33 ficheros de golpe. */
  propietarioId?: string;
  /** @deprecated */
  propietarioPrincipalId?: string;
  /** @deprecated */
  propietarioSecundarioId?: string;
  /** @deprecated Foto histórica congelada. NO se regenera, NO se sincroniza. */
  datosFiscales?: DatosFiscalesInmueble;
}
```

> **Decisión de diseño:** los campos antiguos se mantienen como **índice de compatibilidad** con write-through desde el motor de titularidades (no desde la UI), de modo que `reportingEngine`, `fiscalEngine`, `cobrosEngine`, etc. sigan funcionando mientras se migran ficha a ficha. **Se eliminarán en una fase posterior.**

### 4.4 Reglas de `titularidades` (borrador, inspirado en `sindicacion_inmuebles`)

```
match /titularidades/{titularidadId} {

  function coherente(d) {
    return d.id == titularidadId
      && d.clave == d.inmuebleId + '__' + d.propietarioId
      && isValidId(d.inmuebleId) && isValidId(d.propietarioId)
      && d.porcentaje is number && d.porcentaje > 0 && d.porcentaje <= 100
      && d.esPrincipal is bool
      && d.rol in ['TITULAR','USUFRUCTUARIO','NUDO_PROPIETARIO','REPRESENTANTE']
      && d.estado in ['ACTIVA','SUSPENDIDA','FINALIZADA','CANCELADA']
      && d.fechaDesde is string
      && (!('fechaHasta' in d) || d.fechaHasta is string)
      // coherencia estado ↔ vigencia
      && (d.estado == 'ACTIVA' || d.estado == 'SUSPENDIDA'
          ? !('fechaHasta' in d)
          : ('fechaHasta' in d))
      && d.origen is string
      && d.version is int && d.version >= 1;
  }

  // El actor puede escribir si el inmueble está en su ámbito:
  // titular del propio inmueble, gestor autorizado, o MASTER.
  function actorAlcanza(inmId) {
    return isMasterAdmin()
      || (isPropietarioRole() && titularOAlcanza(inmId));
  }

  allow get:  if isMasterAdmin() || (isPropietarioRole() && titularOAlcanza(resource.data.inmuebleId));
  allow list: if isMasterAdmin()
                || (isPropietarioRole() && resource.data.propietarioId in myPropIds());
  allow create: if actorAlcanza(incoming().inmuebleId) && coherente(incoming());
  allow update: if actorAlcanza(existing().inmuebleId)
                  && coherente(incoming())
                  // identidad estructural inmutable
                  && incoming().inmuebleId == existing().inmuebleId
                  && incoming().propietarioId == existing().propietarioId
                  && incoming().clave == existing().clave
                  && incoming().version == existing().version + 1;
  // Las titularidades NUNCA se borran: el histórico es patrimonial.
  allow delete: if false;
}

// Apéndice inmutable: auditoría de cambios de titularidad.
match /titularidades_historial/{eventoId} {
  allow get, list: if isMasterAdmin() || (isPropietarioRole() && ...);
  allow create: if actorAlcanza(incoming().inmuebleId);
  allow update, delete: if false;   // append-only
}
```

> ⚠️ **Verificación obligatoria con `tests/harness/firestoreRulesEval.ts` y el emulador antes de tocar `firestore.rules`.** En esta orden NO se modifican las reglas.

### 4.5 Motor `titularidadesEngine.ts` (nuevo)

Funciones previstas (aisladas y testeables, al estilo de `inventarioEngine.ts`):

```
validarTitularidades(inmuebleId, titularidades): { valida, errores }
crearTitularidad(datos, actor): Titularidad
modificarPorcentaje(t, nuevoPct, actor): Titularidad
finalizarTitularidad(t, fechaHasta, motivo, actor): Titularidad
resolverTitularesActivos(inmuebleId, titularidades): Titularidad[]
resolverTitularPrincipal(inmuebleId, titularidades): Titularidad | null
resolverParticipacion(inmuebleId, propietarioId, fecha): number
repartir(dto, importe, fecha): { propietarioId, importe }[]      // N-ario
titularidadesDeInmueble / inmueblesDeTitular
proyectarIndices(titularidades): { titularesIds[], titularesHistoricosIds[], titularidadPrincipalId }
```

`repartir()` sustituye a `liquidacionEngine.repartoCopropiedad` (binario) por un **reparto N-ario por porcentaje y vigencia** — conservando la semántica actual cuando sólo hay 2 titulares.

---

## 5. SEPARACIÓN CUENTA DE ACCESO / TITULAR / GESTOR

### 5.1 Las tres realidades

| Realidad | Entidad | Colección | Cardinalidad |
|---|---|---|---|
| **A. CUENTA DE ACCESO** | `UsuarioApp` | `usuarios/{id}` + `usuarios_auth/{uid}` | 1 sesión = 1 cuenta |
| **B. TITULAR PATRIMONIAL** | `Propietario` | `propietarios/{id}` | 1 persona/entidad = 1 ficha fiscal |
| **C. GESTOR** | `VinculacionAcceso` | `vinculaciones_acceso/{id}` | 1 cuenta puede gestionar N carteras |

**Relación A↔B y A↔C: N:M, explícita y versionada.**

### 5.2 Nueva colección `vinculaciones_acceso/{id}`

```ts
export type TipoVinculacion = 'TITULAR' | 'GESTOR' | 'PROFESIONAL';

export interface VinculacionAcceso {
  id: string;
  usuarioId: string;              // la cuenta que accede
  propietarioId: string;          // la cartera / titular sobre la que se actúa
  tipo: TipoVinculacion;

  /** Alcance. */
  alcance: 'CARTERA_COMPLETA' | 'INMUEBLES_CONCRETOS';
  inmuebleIds?: string[];         // sólo si alcance == 'INMUEBLES_CONCRETOS'

  /** Delegación granular (sustituye al `permisos[]` declarativo que hoy no se usa). */
  capacidades?: ('VER' | 'EDITAR' | 'ARCHIVAR' | 'ASOCIAR_TITULARES'
              | 'CREAR_TITULARES' | 'GESTIONAR_CONTRATOS' | 'VER_FISCAL')[];

  estado: 'ACTIVA' | 'SUSPENDIDA' | 'REVOCADA';
  fechaDesde: string;
  fechaHasta?: string;
  motivo?: string;

  otorgadaPor: string;            // nombre del titular que delega
  otorgadaPorId: string;
  otorgadaPorTipo: 'TITULAR' | 'MASTER';
  otorgadaEn: string;

  revocadaPor?: string;
  revocadaEn?: string;
  motivoRevocacion?: string;

  version: number;
  historial?: HistorialVinculacionItem[];
}
```

**Por qué una colección y no un array en `usuarios`:**
- Permite trazar quién delegó, cuándo, con qué alcance y por qué.
- Permite caducidad y revocación con histórico.
- El espejo `usuarios_auth` sólo necesita copiar lo imprescindible para las reglas.

### 5.3 Espejo `usuarios_auth/{uid}` — cambio mínimo y compatible

```ts
{
  // compatibilidad: sigue existiendo, == propietarioIds[0] ?? ''
  propietarioId: string;
  // NUEVO
  propietarioIds: string[];        // titularidades propias
  gestorDePropietarioIds: string[];// carteras delegadas
  inmuebleIds: string[];           // ya existe (alcance por inmueble)
  profesionalId: string;
  tipoPerfil: string;
  estado: string;
  roles: list;
  email: string;
}
```

`indexIsTruthful()` (`rules:230-258`) debe ampliarse para validar los dos nuevos arrays contra `usuarios/{id}`. **Es el punto más delicado de las reglas**: el espejo es la única defensa anti-elevación.

### 5.4 Nuevos helpers de reglas

```
function myPropIds()      { return me().propietarioIds; }              // NUEVO
function myGestorIds()    { return me().gestorDePropietarioIds; }      // NUEVO
function myPropId()       { return me().propietarioId; }               // se conserva (compat.)

/** ¿Alcanza el actor este inmueble? Tres vías: titular, gestor, o asignación directa. */
function titularOAlcanza(inmId) {
  return isPropietarioRole() && (
    resource_propietario_titular(inmId)      // es titular del inmueble
    || myGestorIds().hasAny(propietariosDe(inmId))
    || myInmuebleIds().hasAny([inmId])
  );
}
```

> **Nota:** `myPropId()` se conserva durante la transición para no reescribir las 254 referencias de golpe. La migración de reglas puede hacerse helper a helper.

### 5.5 Lo que NO se asume

| No se asume | Realidad objetivo |
|---|---|
| 1 cuenta = 1 inmueble | 1 cuenta ⇒ N inmuebles (vía N titularidades) |
| 1 cuenta = 1 titular | 1 cuenta ⇒ N titulares (`propietarioIds[]`) |
| 1 inmueble = 1 cuenta | 1 inmueble ⇒ N titulares ⇒ N cuentas (o 0, si ningún titular tiene cuenta) |
| El titular tiene cuenta | **Puede no tenerla.** La titularidad existe aunque nadie se haya registrado |
| El gestor es titular | **No.** El gestor actúa por delegación, nunca es titular |

---

## 6. CICLO DE VIDA DEL INMUEBLE

### 6.1 Auditoría del campo actual `Inmueble.estado` (`types.ts:484`)

```ts
estado: 'disponible' | 'alquilado';
```

**Qué representa realmente: EXCLUSIVAMENTE el estado de EXPLOTACIÓN/OCUPACIÓN.** Se usa para:
- KPIs de ocupación: `DashboardEjecutivoSection.tsx:240-241`, `InicioSection.tsx:43`, `AdminControlCenter.tsx:128-131`, `reportingEngine.ts:187`
- Filtros y badges: `InmueblesSection.tsx:386`, `:846-851`, `:1848-1853`
- Ficha pública: `fichaPublicaInmueble.ts:202`
- **Mutado automáticamente** al finalizar contrato: `App.tsx:2372` y `App.tsx:2663` (`estado: 'disponible'`)

**Lo que NO representa:** propiedad, vigencia patrimonial, venta, baja, archivo.

**Conclusión:** confirmado. `'disponible' | 'alquilado'` **es insuficiente** para representar el ciclo patrimonial.

**Evidencia colateral:** `AdminControlCenter.tsx:129` ya filtra por un tercer valor inexistente (`'reservado'`) ⇒ el propio código demuestra que hace falta un dominio más rico.

### 6.2 Dos ejes ortogonales

```
┌─────────────────────────────────────────────────────────────┐
│  EJE PATRIMONIAL (¿de quién es / está en cartera?)           │
│  estadoPatrimonial                                            │
├─────────────────────────────────────────────────────────────┤
│  ACTIVO        → en la cartera operativa del titular         │
│  EN_VENTA      → activo, pero en proceso de transmisión       │
│  VENDIDO       → transmitido. Fuera de cartera. Histórico     │
│  TRANSMITIDO   → sin venta (donación, herencia, aportación)   │
│  BAJA          → retirado sin transmisión (derribo, fin       │
│                  de gestión, error de alta corregido…)        │
│  HISTORICO     → consolidado como histórico (terminal)        │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  EJE DE EXPLOTACIÓN (¿qué se hace con él?)                    │
│  estadoExplotacion   [alias de `estado` durante la transición]│
├─────────────────────────────────────────────────────────────┤
│  DISPONIBLE      → sin contrato vigente                       │
│  ALQUILADO       → con contrato vigente                       │
│  EN_REFORMA      → indisponible temporalmente                 │
│  NO_DISPONIBLE   → fuera de mercado por decisión del titular  │
│  SIN_EXPLOTACION → no aplica (VENDIDO/BAJA/HISTORICO)         │
└─────────────────────────────────────────────────────────────┘
```

**El caso real del usuario se representa así:**

```
Inmueble A, 2028 (vendido tras 8 años alquilado)
  estadoPatrimonial = 'VENDIDO'
  estadoExplotacion = 'ALQUILADO'      ← se CONSERVA como foto histórica
  baja = { tipo: 'VENTA', fechaEfectiva: '2028-03-15',
           importeVenta: 185000, adquirente: '…', motivo: '…',
           ejecutadoPor: '…', ejecutadoPorId: '…', fechaOperacion: '…' }

  contrato 2020-2028   → CONSERVADO (estado FINALIZADO, esVigente = false)
  96 recibos           → CONSERVADOS
  IBI, gastos, facturas→ CONSERVADOS
  documentos, incidencias, suministros → CONSERVADOS
  liquidaciones        → CONSERVADAS
  información fiscal   → CONSERVADA (generarHistoricoFiscalInmueble sigue funcionando)
  titularidades        → FINALIZADAS con fechaHasta = 2028-03-15
```

### 6.3 Estructura `BajaInmueble` (réplica de `FinalizacionContrato`)

```ts
export type TipoBajaInmueble =
  | 'VENTA'
  | 'DONACION'
  | 'HERENCIA'
  | 'APORTACION_SOCIEDAD'
  | 'DERRIBO'
  | 'FIN_GESTION'          // el titular deja de gestionarlo con nosotros
  | 'ERROR_ALTA';          // alta errónea (la única que permite delete físico)

export interface BajaInmueble {
  tipo: TipoBajaInmueble;
  fechaEfectiva: string;             // YYYY-MM-DD
  motivo?: string;
  observaciones?: string;

  // Datos de la transmisión (sólo si tipo == 'VENTA' y afines)
  importeVenta?: number;
  adquirente?: string;
  adquirenteNif?: string;
  gastosTransmision?: number;
  plusvaliaMunicipal?: number;

  // Trazabilidad
  ejecutadoPor: string;
  ejecutadoPorId?: string;
  fechaOperacion: string;            // ISO
  /** true si previamente se retiraron los anuncios de los portales. */
  despublicado?: boolean;
  /** Snapshot de las titularidades vigentes en el momento de la baja. */
  titularidadesAlCierre?: { propietarioId: string; porcentaje: number }[];
}

export interface HistorialPatrimonialItem {
  id: string;
  fecha: string;                     // ISO
  usuarioId?: string;
  usuarioNombre: string;
  accion: 'ALTA' | 'CAMBIO_ESTADO_PATRIMONIAL' | 'CAMBIO_ESTADO_EXPLOTACION'
        | 'VENTA' | 'BAJA' | 'REACTIVACION' | 'DESPUBLICACION' | 'ARCHIVADO';
  estadoPatrimonialAnterior?: EstadoPatrimonialInmueble;
  estadoPatrimonialNuevo?: EstadoPatrimonialInmueble;
  detalle?: string;
}
```

### 6.4 Máquina de estados

```
                    ┌──────────► EN_VENTA ────────┐
                    │                             │
  (alta) ──► ACTIVO ─┤                             ├──► VENDIDO ────► HISTORICO
                    │                             │
                    └──────────► BAJA ────────────┘
                    │                             │
                    └──► TRANSMITIDO ─────────────┘

  Reactivación: VENDIDO/BAJA → ACTIVO  (permitida, queda trazada; es el
                mecanismo de recuperación ante una baja equivocada)
  Terminal:     HISTORICO (no vuelve a ACTIVO salvo por MASTER, auditado)
```

**Transiciones permitidas y quién las ejecuta:**

| Transición | Quién | Efectos colaterales obligatorios |
|---|---|---|
| `— › ACTIVO` | Titular / Gestor / MASTER | Alta de `titularidades`, `historialPatrimonial` |
| `ACTIVO › EN_VENTA` | Titular / Gestor | Aviso de que hay que despublicar |
| `EN_VENTA › VENDIDO` | Titular / Gestor / MASTER | `despublicarPortales()`, `finalizarTitularidades()`, `finalizarContratosVigentes()`, `baja` completo |
| `ACTIVO › BAJA` | Titular / Gestor / MASTER | `despublicarPortales()`, `finalizarTitularidades()` |
| `ACTIVO › TRANSMITIDO` | Titular / MASTER | igual que VENTA |
| `VENDIDO/BAJA › HISTORICO` | MASTER (o automático a los N años) | Consolidación, sólo lectura |
| `VENDIDO/BAJA › ACTIVO` | Titular / MASTER | **Reactivación** auditada |

### 6.5 ¿Hacen falta más estados?

Sí, pero **no en el eje patrimonial**. Recomendación:

- **`EN_REFORMA`** en el eje de explotación — ya hay `necesidades_reforma` y `proyectos_reforma`; el inmueble puede estar indisponible por obra.
- **`PENDIENTE_ASIGNACION`** como marcador **transversal** (no estado) para inmuebles migrados sin titular identificable (ver §15).
- **`EN_VENTA`** es opcional pero recomendable: permite ocultar del funnel de alquiler sin dar de baja.

**No** se recomiendan: `ARCHIVADO` como estado distinto de `HISTORICO` (serían redundantes), ni `BLOQUEADO` (ya existe `UsuarioApp.estado` para cuentas, no aplica a inmuebles).

---

## 7. BAJA vs VENTA vs ELIMINACIÓN FÍSICA

### 7.1 Tres operaciones, tres naturalezas distintas

| Operación | Qué hace | Quién | Reversible | Destruye datos |
|---|---|---|---|---|
| **1. ARCHIVAR / DAR DE BAJA** | `estadoPatrimonial = 'BAJA'` | Titular / Gestor / MASTER | ✅ Sí | ❌ No |
| **2. VENDER / TRANSMITIR** | `estadoPatrimonial = 'VENDIDO' \| 'TRANSMITIDO'` + `baja` | Titular / Gestor / MASTER | ⚠️ Sí, auditado | ❌ No |
| **3. ELIMINAR FÍSICO** | `deleteDoc` | **Sólo MASTER** | ❌ No | ✅ Sí |

### 7.2 Criterio de bloqueo del delete físico

```ts
export function puedeEliminarFisicamente(ctx: ContextoInmueble): {
  permitido: boolean;
  bloqueos: { entidad: string; count: number; accion: string }[];
} {
  // Se ELIMINA sólo si NO existe NINGUNA de estas condiciones:
  //  · contratos (vigentes O históricos)
  //  · cobros / recibos / registroCobros
  //  · gastos / gastos_recurrentes / prestamos
  //  · facturas / registros_facturacion / envios_verifactu
  //  · liquidaciones_propietarios / ordenes_pago / ficheros_sepa
  //  · actas / actas_evidencias / actas_incidencias
  //  · incidencias / tareas_mantenimiento / garantias_reparacion
  //  · trabajos_profesionales / presupuestos_profesionales / valoraciones
  //  · inventario_inmuebles / inventario_historial / habitaciones_inmueble
  //  · polizas_seguros / siniestros
  //  · suministros / lecturas_suministro / cambios_titular
  //  · expedientes_morosidad (+ hist + evidencias + compromisos)
  //  · expedientes_recomercializacion / analisis_inversion
  //  · publicaciones activas (sindicacion_inmuebles != DESPUBLICADO/BORRADOR)
  //  · mensajes_portal / notificaciones
  //  · titularidades históricas (sólo se permite si todas son del mismo alta
  //    y no han tenido modificaciones)
  //
  // Y ADEMÁS: antigüedad < 24h y estadoPatrimonial == 'ACTIVO'
  //           y origen == 'ERROR_ALTA'
}
```

**En la práctica:** el delete físico queda reservado al **error de alta reciente** (borrar un inmueble creado por equivocación en las últimas horas). **Nunca** para un inmueble con historia.

**Mensaje accionable obligatorio cuando se bloquea** (nada de "no se puede eliminar" a secas):

> **No se puede eliminar este inmueble**
>
> Tiene información vinculada que debe conservarse:
> • 1 contrato (2020‑2028, FINALIZADO)
> • 96 recibos
> • 12 facturas
> • 3 actas de entrada/salida
> • 8 años de información fiscal
>
> **Qué puedes hacer:**
> → **Dar de baja / marcar como vendido** para retirarlo de tu cartera activa. Se conservará todo el histórico y podrás seguir consultándolo e informando de él.
> → Contactar con administración si necesitas una depuración excepcional.

### 7.3 Efectos automáticos de la BAJA/VENTA (ninguno destructivo)

| Paso | Acción | Reversible |
|---|---|---|
| 1 | Comprobar dependencias (**no bloquea**, sólo informa) | — |
| 2 | Retirar anuncios de portales: `sindicacion_inmuebles` → `DESPUBLICADO` | ✅ |
| 3 | Borrar/ocultar `fichas_publicas_inmueble/{id}` (el inmueble no debe seguir captando) | ✅ (se regenera) |
| 4 | Finalizar contratos vigentes (`estado=FINALIZADO`, `esVigente=false`, `finalizacion={…}`) | ⚠️ auditado |
| 5 | Finalizar `titularidades` activas (`fechaHasta`, `estado='FINALIZADA'`, `motivoBaja`) | ⚠️ auditado |
| 6 | Finalizar suministros / cambios de titularidad | ⚠️ auditado |
| 7 | Escribir `baja` + `historialPatrimonial` | — |
| 8 | `estadoPatrimonial = 'VENDIDO' \| 'BAJA'` | ✅ |
| 9 | **Conservar** `estadoExplotacion` como foto (`ALQUILADO`) | — |
| 10 | Auditar en `audit_logs` | — |
| 11 | **NO borrar** contratos, recibos, gastos, facturas, actas, documentos, incidencias, suministros, liquidaciones ni datos fiscales | — |

### 7.4 Visibilidad tras la baja

| Vista | Inmueble `VENDIDO` / `BAJA` |
|---|---|
| Cartera activa / "Mis Viviendas" | ❌ No aparece por defecto (filtro `estadoPatrimonial === 'ACTIVO'`) |
| Histórico patrimonial | ✅ Aparece con su fecha de baja |
| Informes (cartera, rentabilidad, fiscal) | ✅ Incluible con selector de rango / "incluir histórico" |
| Exportación CSV/JSON/AEAT | ✅ **Debe seguir siendo exportable** |
| Ficha del inmueble | ✅ Sólo lectura, con banner de estado |
| Portal del inquilino | Se rige por el contrato; si está FINALIZADO el acceso histórico se mantiene según la política vigente |
| Funnel público / solicitudes | ❌ Bloqueado (ficha pública retirada) |

---

## 8. HISTORIAL PATRIMONIAL

### 8.1 Capas

| Capa | Ubicación | Garantía |
|---|---|---|
| **Trazabilidad operativa** | `Inmueble.historialPatrimonial[]` | Escritura en el mismo documento |
| **Auditoría de sistema** | `audit_logs/{id}` (`allow update, delete: if false`) | Inmutable por reglas |
| **Histórico de titularidad** | `titularidades` (inmutables) + `titularidades_historial` (append-only) | Inmutable por reglas |
| **Histórico económico** | Colecciones existentes (`contratos_formalizacion`, `gastos`, `facturas`, `liquidaciones_propietarios`, …) | **No se tocan** |
| **Histórico fiscal** | `generarHistoricoFiscalInmueble(inmuebleId, ejercicios[], …)` | Sigue funcionando porque el inmueble existe |

### 8.2 Regla de oro

> **Ninguna operación de baja, venta o cambio de titularidad borra un documento hijo.**
> Sólo cambia estados y añade entradas de histórico.

### 8.3 Reconstrucción

```
reconstruirHistorialPatrimonial(inmuebleId):
  titularidades   → ordenadas por fechaDesde  (incluye FINALIZADAS)
  contratos       → cadena contratoOrigenId → contratoDerivadoId
  cobros          → contrato.registroCobros[]
  gastos/facturas → por inmuebleId + rango
  actas           → por inmuebleId
  fiscal          → generarHistoricoFiscalInmueble(inmuebleId, ejercicios)
  hitos           → Inmueble.historialPatrimonial[]
```

Todo ello **sigue funcionando sin cambios** siempre que el documento `inmuebles/{id}` exista. Ésta es la razón de peso número uno para no borrar.

---

## 9. HISTORIAL DE TITULARIDAD

### 9.1 Caso del usuario, resuelto

```
2020-2025   Titular A 50%   Titular B 50%
2025-2028   Titular A 100%
2028        Venta
```

Se modela con **3 documentos** en `titularidades` (ninguno borrado):

| id | inmuebleId | propietarioId | % | desde | hasta | estado |
|---|---|---|---|---|---|---|
| `t1` | INM-A | prop-A | 50 | 2020-01-10 | 2025-06-30 | `FINALIZADA` |
| `t2` | INM-A | prop-B | 50 | 2020-01-10 | 2025-06-30 | `FINALIZADA` |
| `t3` | INM-A | prop-A | 100 | 2025-06-30 | 2028-03-15 | `FINALIZADA` |

Y en `titularidades_historial` (append-only) las transiciones:
`ALTA(A,50)` · `ALTA(B,50)` · `FINALIZACION(A, motivo: 'compraventa entre cotitulares')` · `FINALIZACION(B, …)` · `ALTA(A,100)` · `FINALIZACION(A, motivo: 'venta del inmueble')`.

**Consulta punto-en-el-tiempo:**
```
resolverParticipacion(inmuebleId, propietarioId, fecha) → %
titularesEn(inmuebleId, fecha) → Titularidad[]
```

### 9.2 Invariantes

1. `titularidades` **nunca se borra** (`allow delete: if false`).
2. `titularidades_historial` **append-only** (`allow update, delete: if false`).
3. `inmuebleId`, `propietarioId`, `clave` **inmutables** en `titularidades`.
4. `version` monótona creciente.
5. La suma de porcentajes `ACTIVA` por inmueble == 100 (validado en motor; **nunca se inventa** un porcentaje: se marca `porcentajePendiente`).

### 9.3 Impacto en el contrato

Hoy: 7 campos `segundoPropietario*` copiados en `ContratoFormalizacion`.

Objetivo: **el contrato guarda una foto de los titulares en el momento de la firma**:

```ts
/** @deprecated — sustituido por `titularesAlFirmar`. */
tieneSegundoPropietario?: boolean;
segundoPropietarioNombre?: string;
// …

/** NUEVO — foto inmutable de la titularidad en la fecha de firma. */
titularesAlFirmar?: TitularContrato[];
export interface TitularContrato {
  propietarioId?: string;
  nombre: string;
  nifDni: string;
  direccion: string;
  telefono?: string;
  email?: string;
  esPersonaJuridica?: boolean;
  porcentaje?: number;
  rol?: RolTitularidad;
  /** true si no constaba porcentaje en origen. */
  porcentajePendiente?: boolean;
}
```

**Ventaja:** `contratoEngine` pasa de concatenar 2 bloques a iterar `titularesAlFirmar` — el texto del contrato LAU (`contratoEngine.ts:409-421`, `:472-473`, `:528-529`, `:618-621`) se genera con un bucle. **El contrato ya firmado no se altera** aunque cambie la titularidad: la foto es inmutable. Exactamente el mismo criterio que ya aplica `datosFiscales`.

---

## 10. AISLAMIENTO DE CARTERAS

### 10.1 Problema confirmado

```js
// firestore.rules:445-450
allow get:  if isStaff();
allow list: if isStaff();     // ← cualquier no-inquilino lista TODO
```

```ts
// src/lib/firebase.ts:261-277  — colección COMPLETA, sin where
export function subscribeInmuebles(callback) {
  return onSnapshot(INMUEBLES_COL, snap => { … });
}
// src/App.tsx:967  — se invoca SIN dataScope
const unsubscribeInm = subscribeInmuebles((data) => { … });
```

⇒ **Todo propietario descarga todos los inmuebles** (IBAN, NIF, inquilino, notas internas) y el filtro se hace después en React (`scopedInmuebles`, `App.tsx:537-553`).

### 10.2 Solución (3 capas, en este orden)

**Capa 1 — Reglas (la única garantía real):**

```
match /inmuebles/{inmuebleId} {
  allow get: if isMasterAdmin()
    || (isPropietarioRole() && (
         resource.data.titularesIds.hasAny(myPropIds())
      || resource.data.titularesIds.hasAny(myGestorIds())
      || myInmuebleIds().hasAny([inmuebleId])
    ))
    || (isTenant() && …);          // se conserva el bloque BLOQUE E

  // ÚNICA condición demostrable para una consulta:
  // el cliente DEBE filtrar por titularesIds array-contains(-any).
  allow list: if isMasterAdmin()
    || (isPropietarioRole() && (
         resource.data.titularesIds.hasAny(myPropIds())
      || resource.data.titularesIds.hasAny(myGestorIds())
    ));

  allow create: …  // sin cambio de fondo
  allow update: …  // sin cambio de fondo
  allow delete: if isMasterAdmin();   // se conserva
}
```

**Capa 2 — Consultas acotadas en el listener:**

```ts
export function subscribeInmuebles(
  callback: (inmuebles: Inmueble[]) => void,
  scope?: DataAccessScope          // ← NUEVO parámetro
): Unsubscribe
```

Estrategia según `scope`:
- **MASTER / ADMIN** → colección completa (sin cambio).
- **PROPIETARIO con `propietarioIds.length <= 10`** →
  `query(INMUEBLES_COL, where('titularesIds', 'array-contains-any', propIds))`
- **PROPIETARIO con más de 10** → particionar en chunks de 10 y **fusionar** los snapshots (de-dup por `id`).
- **PROPIETARIO con `inmuebleIds` explícitos** →
  `where(documentId(), 'in', chunk(inmuebleIds, 10))` fusionado.

> ⚠️ **Restricciones de Firestore a documentar:** `array-contains-any` admite **máx. 10 valores** y sólo **una** cláusula `array-contains`/`array-contains-any` por consulta. El diseño multi-chunk las respeta.

**Capa 3 — Cliente como defensa en profundidad (no como mecanismo):**
`scopedInmuebles` y `misViviendas` se mantienen, pero pasan a ser una **comprobación de coherencia**: si llega un inmueble fuera de ámbito, se registra un warning (no se muestra). Nunca la única barrera.

### 10.3 Resto de listeners sin scope (P12)

**Prioridad por sensibilidad de los datos:**

| Prioridad | Colecciones | Motivo |
|---|---|---|
| **P0** | `inmuebles` | Contiene IBAN, NIF, inquilino, notas internas |
| **P1** | `polizas_seguros`, `siniestros`, `facturas`, `registros_facturacion`, `envios_verifactu`, `facturas_electronicas_b2b`, `financiaciones` | Datos económicos/fiscales |
| **P1** | `trabajos_profesionales`, `presupuestos_profesionales`, `valoraciones_profesionales` | Datos económicos |
| **P2** | `inventario_inmueble`, `inventario_historial`, `habitaciones_inmueble` | Ya tienen `canAccess*` en motor; falta acotar la query |
| **P2** | `candidatos`, `solicitudes`, `invitaciones`, `slots_visita`, `solicitudes_documentacion` | Datos personales de terceros |
| **P3** | `usuarios`, `profesionales`, `enlaces_registro`, `audit_logs`, `configuracion_aseguradoras`, `especialidades`, `modulos_config` | Directorios internos |

### 10.4 `candidatos` (P13)

```js
allow update: if isSignedIn() || (…);      // rules:988
allow delete: if isSignedIn();             // rules:1006
```
⇒ **Cualquier usuario autenticado modifica/borra los candidatos de cualquier cartera.** Es el origen del daño colateral de `handleDeleteInmueble`. Debe acotarse por `inmuebleId ∈ ámbito`.

### 10.5 Matriz objetivo de lectura

| Actor | Inmuebles propios | Inmuebles donde es cotitular | Inmuebles delegados como gestor | Inmuebles ajenos | Histórico propio |
|---|---|---|---|---|---|
| **Titular** | ✅ | ✅ (vía `titularesIds`) | — | ❌ | ✅ |
| **Gestor autorizado** | — | — | ✅ (alcance definido) | ❌ | ✅ (mientras dure la delegación) |
| **Gestor no autorizado** | — | — | ❌ | ❌ | ❌ |
| **MASTER** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Inquilino** | `get` sólo de su vivienda (BLOQUE E, se conserva) | | | | |

---

## 11. PERSISTENCIA Y MANEJO DE ERRORES

### 11.1 Patrón obligatorio: `ejecutarMutacion`

Sustituye a los ~30 handlers que hoy hacen `setState(optimista)` + `save*(…)` sin `await`.

```ts
interface OpcionesMutacion<T> {
  /** Estado previo para rollback. */
  snapshot: T;
  /** Aplica el cambio en el estado local (optimista). */
  aplicar: (s: T) => T;
  /** Persistencia. DEBE relanzar el error. */
  persistir: () => Promise<void>;
  /** Efectos colaterales. SÓLO se ejecutan si `persistir` resuelve. */
  efectos?: () => Promise<void>;
  /** Mensaje accionable para el usuario. */
  mensajeError: string;
}

// Secuencia:
// 1. aplicar(snapshot)            → UI optimista
// 2. await persistir()            → SI FALLA: rollback(snapshot) + error visible + return
// 3. await efectos?.()            → SI FALLA: NO revierte el paso 2 (ya confirmado),
//                                   pero informa y deja constancia en audit_logs
// 4. invalidar/actualizar localStorage SIEMPRE desde el estado confirmado
```

**Reglas derivadas:**

1. **Toda escritura usa `await`.** Ningún `save*Firestore` / `delete*Firestore` se invoca sin esperar.
2. **Los servicios `src/lib/firebase.ts` dejan de tragar errores.** El `catch` + `console.error` se sustituye por `catch` + enriquecimiento del error + `throw`. (Afecta a `saveInmuebleFirestore:364`, `deleteInmuebleFirestore:379`, `savePropietarioFirestore:244`, `deletePropietarioFirestore:254`, …).
3. **Atomicidad con `writeBatch`.** Ya hay precedente (`firebase.ts:627-632`, `:667-671`, `conciliacionFirestore.ts:235`). Alta/baja de inmueble + sus `titularidades` + entrada de `audit_logs` van en el **mismo batch**.
4. **Sin efectos colaterales si la operación principal falla.** El caso de los candidatos (`App.tsx:1670-1682`) se elimina: la desvinculación pasa a ser un **paso posterior explícito** dentro de `efectos`, o se sustituye por un campo `inmuebleEliminado`/`inmuebleArchivado` que no destruye la relación.
5. **localStorage nunca contradice a Firestore.** El localStorage es **caché de arranque**, no fuente de verdad: se escribe **después** de la confirmación, se invalida ante cualquier error de escritura, y el listener deFirestore tiene siempre prioridad.
6. **Mensaje accionable.** Todo error muestra: qué falló, por qué (permisos / validación / red) y qué puede hacer el usuario.

### 11.2 Preselección del titular en el alta (P8)

`InmueblesSection` ya recibe `currentUser` (`InmueblesSection.tsx:100`, `:126`) pero **no tiene ni un `useEffect`** (verificado: 0 ocurrencias).

Solución:

```ts
// Derivado, no efecto — evita desincronizaciones.
const titularPorDefecto =
  currentUser?.tipoPerfil === 'PROPIETARIO'
    ? (currentUser.propietarioId ?? currentUser.propietarioIds?.[0] ?? '')
    : '';

const [newSelectedPropId, setNewSelectedPropId] = useState<string>('');
const propIdEfectivo = newSelectedPropId || titularPorDefecto;
```

Y a mayores:
- Si `tipoPerfil === 'PROPIETARIO'` → el selector se muestra **bloqueado** con su propia ficha (no tiene que "descubrirla").
- `handleCreateInmuebleSubmit` **valida** que `propIdEfectivo` no esté vacío y **bloquea el envío** con un error visible si lo está.
- El alta escribe, en el mismo batch: `inmuebles/{id}` + `titularidades/{id}` (100 %, `esPrincipal: true`) + `audit_logs`.

### 11.3 Operaciones equivalentes a auditar con el mismo patrón

| Operación | Handler actual | Riesgo actual |
|---|---|---|
| Crear inmueble | `App.tsx:1686` | Sin `await` real, sin validación de `propietarioId`, sin rollback |
| Editar inmueble | `App.tsx:1696` | Sin `await`, sin rollback |
| Eliminar inmueble | `App.tsx:1662` | Ver §12 |
| Guardar propietario/titular | `App.tsx:2675` | `await` sí, pero el servicio traga el error |
| Eliminar propietario/titular | `App.tsx:2689` | `await` sí, servicio traga el error; **reglas lo deniegan siempre al propietario** |
| Asociar titular a inmueble | — | **No existe** (P7) |
| Guardar profesional | `App.tsx` `handleSaveProfesional` | Mismo patrón |
| Finalizar contrato | `App.tsx:2340` | `await` sí, pero muta el inmueble **dentro del `setState`** (`:2377` llama a `saveInmuebleFirestore` sin `await`) |
| Cerrar expediente recomercialización | `App.tsx:2643` | Mismo patrón |

> **Nota:** `App.tsx:2377` y `:2669` llaman a `saveInmuebleFirestore` **dentro del callback de `setState`** — un antipatrón: el `setState` debe ser puro. Corregir junto con el resto.

---

## 12. EL BORRADO ROTO — DISEÑO DE LA SOLUCIÓN

### 12.1 Secuencia actual (reconstruida)

```
click papelera (InmueblesSection.tsx:957 / :1877)
  → setInmuebleToDelete(inm)
  → ConfirmDeleteModal (genérico, sin comprobación de dependencias)
  → onDeleteInmueble(id)  [App.tsx:3700]
  → handleDeleteInmueble  [App.tsx:1662]
       ① setInmuebles(filter)  + localStorage      ← OPTIMISTA
       ② deleteInmuebleFirestore(id)               ← SIN await, SIN catch
       ③ setCandidatos(...) + saveCandidatoFirestore ← EFECTO COLATERAL
  → ② deleteDoc('inmuebles', id) → rules:465 allow delete: isMasterAdmin()
  → ❌ FirebaseError permission-denied
  → firebase.ts:379  catch { console.error }        ← SILENCIADO
  → UI: tarjeta oculta · Firestore: documento intacto · candidatos: ya desvinculados
  → siguiente snapshot o recarga: REAPARECE
```

### 12.2 Secuencia objetivo

```
click «Gestionar baja» (nuevo)
  → evaluarDependencias(inmueble)                   ← SIEMPRE
  → Modal según resultado:

     A) Sin dependencias bloqueantes y antigüedad < 24h
        → «Eliminar definitivamente» (requiere confirmación reforzada)
     B) Con dependencias (caso general)
        → «Dar de baja / Marcar como vendido»
           · selector tipo de baja (VENTA / TRANSMISIÓN / BAJA / ERROR_ALTA)
           · fecha efectiva · motivo · datos de transmisión si aplica
           · resumen de lo que se conserva
           · resumen de lo que se retira (anuncios, ficha pública)

  → ejecutarMutacion({
       persistir: async () => { batch: inmueble + titularidades + historial + audit },
       efectos:   async () => { despublicarPortales(); retirarFichaPublica(); },
     })
  → OK  → estado local confirmado · localStorage actualizado · toast de éxito
  → KO  → rollback al snapshot · error visible y accionable · CERO efectos colaterales
```

### 12.3 Eliminación del daño colateral (P10)

**Hoy:** el paso ③ se ejecuta **siempre**, incluso si ② falla, y **persiste** (`rules:988` permite `update` a cualquier firmado).

**Objetivo, en este orden:**

1. **Ordenar:** los efectos colaterales van **después** del `await`, dentro de `efectos`, y sólo si la operación principal resolvió.
2. **No destruir la relación:** en lugar de `inmuebleId: ''`, se añade al candidato un campo `inmuebleDesvinculado?: { inmuebleId, fecha, motivo }`, conservando la trazabilidad. `candidatos` deja de mutarse destructivamente.
3. **Acotar las reglas de `candidatos`** (P13) para que nadie pueda tocar candidatos de otra cartera.
4. **Auditar** la operación: `audit_logs` con `resultado: 'EXITO' | 'ERROR'` — hoy el borrado no registra nada.

### 12.4 Listado de entidades que hoy usan delete físico (29 en `src/lib/`)

`propietarios`, `inmuebles`, `fichas_publicas_inmueble`, `candidatos`, `invitaciones`, `slots_visita`, `solicitudes_documentacion`, `contratos_formalizacion`, `gastos`, `gastos_recurrentes`, `prestamos`, `expedientes_recomercializacion`, `inmobiliarias_directorio`, `propuestas_inmobiliaria`, `leads_inmobiliario`, `incidencias`, `tareas_mantenimiento`, `garantias_reparacion`, `necesidades_reforma`, `proyectos_reforma`, `configuracion_aseguradoras`, `solicitudes_seguro_impago`, `solicitudes`, `usuarios`, `profesionales`, `enlaces_registro`, `especialidades`, `polizas_seguros`, `siniestros`, `trabajos_profesionales`, `presupuestos_profesionales`, `inventario_inmuebles`, `financiaciones`, `facturas`, `actas` (+ `deleteObject` de Storage).

**Clasificación objetivo:**

| Categoría | Entidades | Tratamiento |
|---|---|---|
| **Patrimonial — NUNCA delete** | `inmuebles`, `contratos_formalizacion`, `facturas`, `registros_facturacion`, `envios_verifactu`, `actas`, `liquidaciones_propietarios`, `gastos`, `titularidades` | Baja lógica / estado terminal |
| **Histórico — append-only** | `titularidades_historial`, `inventario_historial`, `expedientes_morosidad_hist`, `audit_logs` | `allow update, delete: if false` |
| **Económico — baja lógica** | `gastos_recurrentes`, `prestamos`, `polizas_seguros`, `siniestros`, `ordenes_pago`, `ficheros_sepa` | Estado / anulación |
| **Operativo — delete permitido** | `invitaciones`, `slots_visita`, `solicitudes_documentacion`, `candidatos`* , `solicitudes`, `leads_inmobiliario`, `propuestas_inmobiliaria`, `necesidades_reforma` | Delete con ámbito |
| **Directorio — delete restringido** | `usuarios`, `profesionales`, `propietarios`, `enlaces_registro`, `especialidades`, `configuracion_aseguradoras`, `inmobiliarias_directorio` | MASTER + auditoría |

\* `candidatos`: reevaluar. Hoy es el origen del daño colateral; antes de permitir delete hay que acotarlo por ámbito.

---

## 13. DEPENDENCIAS DEL INMUEBLE — INVENTARIO Y POLÍTICA

### 13.1 Inventario por `inmuebleId` (40 colecciones)

| Dominio | Colecciones |
|---|---|
| **Contractual** | `contratos_formalizacion`, `anexos` (embebidos), `registroCobros` (embebido) |
| **Inquilinos / Portal** | `usuarios.contratoIds`, `mensajes_portal`, `suministros`, `lecturas_suministro`, `cambios_titular` |
| **Economía** | `gastos`, `gastos_recurrentes`, `prestamos`, `gastos_inmuebles`, `liquidaciones_propietarios`, `ordenes_pago`, `ficheros_sepa`, `mandatos_sepa`, `config_liquidacion` |
| **Bancario** | `movimientos_bancarios`, `conciliaciones_bancarias`, `importaciones_bancarias` |
| **Morosidad** | `expedientes_morosidad`, `expedientes_morosidad_hist`, `evidencias_morosidad`, `compromisos_morosidad`, `morosidad_resumen_propietario` |
| **Mantenimiento** | `incidencias`, `tareas_mantenimiento`, `garantias_reparacion`, `trabajos_profesionales`, `presupuestos_profesionales`, `valoraciones_profesionales` |
| **Reformas / inversión** | `necesidades_reforma`, `proyectos_reforma`, `analisis_inversion` |
| **Activos** | `inventario_inmuebles`, `inventario_historial`, `habitaciones_inmueble` |
| **Seguros** | `polizas_seguros`, `siniestros` |
| **Captación** | `candidatos`, `solicitudes`, `invitaciones`, `slots_visita`, `solicitudes_documentacion`, `solicitudes_seguro_impago` |
| **Actas** | `actas`, `actas_evidencias`, `actas_incidencias`, `actas_otp` |
| **Publicación** | `sindicacion_inmuebles`, `fichas_publicas_inmueble` |
| **Facturación** | `facturas`, `registros_facturacion`, `envios_verifactu`, `series_facturacion`, `facturas_electronicas_b2b` |
| **Otros** | `propuestas_inmobiliaria`, `leads_inmobiliario`, `expedientes_recomercializacion`, `notificaciones`, `financiaciones` |

### 13.2 Política por escenario

| Escenario | A) Activo | B) Vendido | C) Histórico | D) Cambio de titularidad | E) Deja de pertenecer al propietario |
|---|---|---|---|---|---|
| **Contratos** | Vigente | FINALIZADO, conservado | Conservado | **Intacto** (foto `titularesAlFirmar`) | Conservado; deja de listarse en la cartera del titular saliente |
| **Recibos / cobros** | Activos | Conservados | Conservados | Intactos | Conservados |
| **Gastos / IBI** | Activos | Conservados | Conservados | Intactos | Conservados |
| **Ingresos / facturas** | Activos | Conservados | Conservados | Intactos | **Conservados** (obligación VERI*FACTU) |
| **Documentos** | Accesibles | Accesibles (sólo lectura) | Accesibles | Intactos | Accesibles según titularidad histórica |
| **Incidencias** | Gestionables | Consultables | Consultables | Intactas | Consultables |
| **Suministros** | Activos | Finalizados / cambio titularidad | Conservados | Intactos | Conservados |
| **Actas** | — | **Conservadas** (valor probatorio) | Conservadas | Intactas | Conservadas |
| **Liquidaciones** | Activas | Última se cierra | Conservadas | Se recalcula el reparto desde la nueva titularidad | Conservadas |
| **Información fiscal** | Activa | **Conservada y exportable** | Conservada | Reparto N-ario por vigencia | Conservada |
| **Titularidades** | ACTIVA | FINALIZADA (fechaHasta) | FINALIZADA | FINALIZADA + nueva ALTA | FINALIZADA |
| **Publicaciones** | Según estrategia | **DESPUBLICADO** + ficha retirada | Retiradas | Intacto | Retirar si el nuevo titular no gestiona |
| **Inventario** | Activo | Conservado (foto) | Conservado | Intacto | Conservado |

**Principio:** en **todos** los escenarios B–E el documento hijo **se conserva**. Sólo cambian estados y vigencias.

---

## 14. IMPACTO EN EL RESTO DEL ERP

### 14.1 Contratos

| Afectado | Cambio |
|---|---|
| `ContratoFormalizacion` | Nuevo `titularesAlFirmar: TitularContrato[]` (foto inmutable); deprecar los 7 campos `segundoPropietario*` |
| `contratoEngine.ts:221-304` | Iterar `titularesAlFirmar` en lugar de `owner1`/`owner2` |
| `contratoEngine.ts:409-421`, `:472-473`, `:528-529`, `:618-621` | Generar el bloque de arrendadores con bucle; firma múltiple |
| `FormalizarContratoModal.tsx:589-628` | UI de N titulares en lugar del checkbox binario |
| `portalEngine.ts:171` (`segundoArrendadorNombre`) | Pasar a lista |
| `contratoCicloEngine.ts` | Sin cambio: el ciclo es del contrato, no del titular |

**Riesgo legal:** la redacción del contrato LAU con N arrendadores debe revisarse (solidaridad, notificaciones, fianza). **Requiere validación jurídica antes de implementar.**

### 14.2 Fiscalidad

| Afectado | Cambio |
|---|---|
| `fiscalEngine.ts:587-588` | Hoy un solo `propietarioId`/`propietarioNombre`. Pasar a **imputación por porcentaje y vigencia**: el resumen fiscal de un ejercicio debe repartirse entre los titulares que lo fueron en cada tramo |
| `ResumenFiscalAnual` | Añadir `desglosePorTitular: { propietarioId, porcentaje, diasProporcionales, ingresos, gastos }[]` |
| `generarHistoricoFiscalInmueble` | Sin cambio de interfaz; sigue funcionando porque el inmueble existe |
| `canAccessResumenFiscal` (`:647`) | Ampliar a `propietarioIds[]` |
| Exportación AEAT | **El inmueble vendido debe seguir siendo exportable.** Hoy se perdería con el delete |

> ⚠️ **Punto sensible:** la imputación fiscal por tramos de titularidad es un cambio de cálculo con impacto tributario. Debe validarse con asesoría fiscal y **no** activarse por defecto: se recomienda un flag y mantener el criterio actual (titular principal) hasta validación.

### 14.3 Import / Export

| Punto | Impacto |
|---|---|
| `handleImportData` (`App.tsx:1862-1880`) | Hoy importa `inmuebles` y `candidatos` tal cual y hace `saveInmuebleFirestore` **sin `await`**. Debe: validar `titularesIds`, crear las `titularidades` correspondientes, usar `await`, y reportar errores por fila |
| Exportación CSV/JSON fiscal (`InformesSection.tsx:131-162`) | Añadir columnas de titular y porcentaje; incluir inmuebles históricos |
| PDF (`pdfExportEngine.ts`) | Añadir el bloque de titularidades al informe de inmueble |
| `reportingEngine.ts:124`, `:172`, `:653`, `:716`, `:816`, `:893` | Sustituir `propietarioId \|\| propietarioPrincipalId` por `titularesIds.includes(…)` |
| Filtros de informes | Añadir selector «incluir inmuebles vendidos/históricos» |

### 14.4 Gestores

| Punto | Impacto |
|---|---|
| `notificaciones/autorizacion.ts:19-25` | `InfoUsuarioResuelta` ya modela `propietarioId`, `inmuebleIds` — ampliar a `propietarioIds[]`, `gestorDePropietarioIds[]` |
| `notificaciones/dispatcher.ts:149-171` | "El actor no puede enviar notificaciones de la cartera de otro propietario" → ampliar a la lógica N:M |
| `notificaciones/resolucion.ts:185` | Ídem |
| Rol `GESTOR_INMUEBLES` (`types.ts:1909`) | Sigue existiendo como rol, pero la **autorización real** pasa a `vinculaciones_acceso` |

### 14.5 Publicación de fichas

| Punto | Impacto |
|---|---|
| `sindicacion_inmuebles` | **La baja debe despublicar.** Hoy no hay ningún enlace entre baja de inmueble y retirada de anuncios |
| `fichas_publicas_inmueble/{id}` | Retirar en la baja (hoy sólo se borra en el delete). Reglas: `allow delete: if isMasterAdmin()` ⇒ hay que permitir la retirada al propietario de su cartera |
| `fichaPublicaInmueble.ts:125-126`, `:157` | `propietarioEfectivo` → `titularesIds[0]` / titular principal |
| `publicacionEngine.ts:130`, `:328` | Ídem |

### 14.6 Auditoría

| Punto | Impacto |
|---|---|
| `AuditLog.entidadAfectada` (`types.ts:1824`) | Añadir `'titularidad'`, `'titular'`, `'baja_inmueble'`, `'vinculacion'` |
| Hoy el borrado de inmueble **no audita nada** | Toda baja/venta/cambio de titularidad debe generar `audit_logs` |

---

## 15. MIGRACIÓN PROPUESTA (**NO EJECUTAR**)

### 15.1 Principios

1. **No destructiva:** no se borra ni se sobrescribe ningún campo de origen.
2. **Aditiva:** se crean `titularidades` y los índices nuevos; los campos antiguos se conservan.
3. **Idempotente:** ejecutable N veces sin duplicar (clave `inmuebleId__propietarioId`).
4. **Analizable antes de materializar:** patrón `backfillFichasPublicas.ts` (`analizarFichasPublicas` → `materializarFichasPublicas` → `InformeBackfill`).
5. **Reversible:** cada titularidad creada guarda `origen: 'MIGRACION'` y un `migracionId`, permitiendo borrar sólo lo creado por esa ejecución.

### 15.2 Reglas de transformación por inmueble

| Caso de origen | Titularidades generadas | Porcentaje |
|---|---|---|
| **Sólo `propietarioId`/`propietarioPrincipalId`** | 1 · `esPrincipal: true` | 100 % |
| **`propietarioPrincipalId` + `propietarioSecundarioId`** | 2 · principal + secundario | Ver 15.3 |
| **Sólo `datosFiscales.propietarioPrincipal` (sin ID)** | 1 con `fichaPendiente: true` si no se resuelve el NIF | 100 % · `porcentajePendiente` según 15.3 |
| **`datosFiscales.segundoPropietario` (sin ID)** | 1 con `fichaPendiente: true` si no se resuelve el NIF | Ver 15.3 |
| **Ningún titular identificable** | **0**. Se marca el inmueble `pendienteAsignacion: true` y se reporta | — |

**Resolución de NIF → `propietarioId`:** buscar en `propietarios` por `nifCif` normalizado (mayúsculas, sin espacios/guiones). Si hay coincidencia única → vincular. Si no → crear la titularidad con `fichaPendiente: true` y el NIF en `documentoReferencia` para reconciliación manual. **Nunca crear fichas de propietario automáticamente.**

### 15.3 Reconstrucción de porcentajes (**sin inventar datos**)

```
SI existe config_liquidacion/{titularPrincipal}.repartoCopropiedad
   Y reparto.segundoPropietarioId == propietarioSecundarioId:
      principal  = 100 - reparto.porcentajeSegundo
      secundario = reparto.porcentajeSegundo
      porcentajePendiente = false
      origen = 'MIGRACION' (con nota 'desde config_liquidacion')

SI NO:
      principal  = 50
      secundario = 50
      porcentajePendiente = TRUE       ← NUNCA se asume el 50/50 como real
      Requiere confirmación del usuario en la primera edición.
```

> **Regla absoluta:** ningún porcentaje migrado se presenta al usuario como dato cierto sin `porcentajePendiente: false`. La UI debe mostrar «porcentaje pendiente de confirmar» y solicitarlo.

### 15.4 Backfill

```
scripts/backfill-titularidades.ts   (plantilla: src/lib/backfillFichasPublicas.ts)

Fase 0 — DRY RUN
   leer inmuebles → proyectar titularidades → InformeMigracion
   { totalInmuebles, con1Titular, con2Titulares, sinTitular,
     porcentajesResueltos, porcentajesPendientes, fichasPendientes,
     incidencias[] }
   SALIDA: informe. NO escribe.

Fase 1 — MATERIALIZAR (writeBatch por lotes de 400)
   · crear titularidades/{id}  con origen:'MIGRACION', migracionId
   · actualizar inmuebles/{id} con titularesIds[], titularesHistoricosIds[],
                               titularidadPrincipalId
   · NO tocar propietarioId / propietarioPrincipalId /
            propietarioSecundarioId / datosFiscales   ← se conservan

Fase 2 — VERIFICAR
   · por inmueble: ¿suma de % de ACTIVAS == 100?
   · ¿titularesIds coincide con las titularidades activas?
   · ¿coincide el nº de titulares con el origen (1 o 2)?
   · ¿titular principal == propietarioPrincipalId?
   · Informe de discrepancias.

Fase 3 — ESPEJO (opcional y posterior)
   · usuarios_auth/{uid}: propietarioId → propietarioIds[]
   · Requiere reescribir indexIsTruthful() en reglas ANTES.
```

### 15.5 Rollback

```
scripts/rollback-titularidades.ts --migracion-id=<id>
   · Borrar titularidades donde origen == 'MIGRACION' AND migracionId == <id>
   · Limpiar titularesIds / titularesHistoricosIds / titularidadPrincipalId
     (sólo si fueron escritos por ese migracionId)
   · NO tocar los campos originales (nunca se modificaron) ⇒ rollback totalmente seguro
```

**Ventaja del diseño aditivo:** el rollback es trivial porque **los datos de origen nunca se tocan**.

### 15.6 Datos que NO existen hoy y no se pueden recuperar

| Dato | Consecuencia |
|---|---|
| Porcentaje real cuando no hay `config_liquidacion` | `porcentajePendiente: true` |
| `fechaDesde` de la titularidad | Se infiere de `Inmueble.createdAt` / `fechaAdquisicion` y se marca como inferido |
| `fechaHasta` de titularidades ya extinguidas | **Irrecuperable** — no estaba en el modelo |
| Histórico de cambios de titularidad anterior al modelo | **Irrecuperable** |
| Motivo de altas/bajas pasadas | **Irrecuperable** |
| Titularidades de inmuebles ya borrados físicamente | **Irrecuperable** (éste es el coste real del delete) |

> **Conclusión:** la migración **no puede reconstruir el histórico de titularidad anterior**. Sólo puede establecer el estado actual y empezar a registrar desde ahí. **Ésta es la razón para implementar el modelo nuevo lo antes posible:** cada día que pasa se pierde más histórico.

---

## 16. COMPATIBILIDAD HACIA ATRÁS

### 16.1 Estrategia: compatibilidad en dos direcciones con write-through

```
┌── NUEVO (fuente de verdad) ──┐        ┌── VIEJO (índice de compatibilidad) ──┐
│ titularidades/{id}           │──────► │ Inmueble.titularesIds[]              │
│                              │        │ Inmueble.titularidadPrincipalId      │
│                              │──────► │ Inmueble.propietarioId               │
│                              │──────► │ Inmueble.propietarioPrincipalId      │
│                              │──────► │ Inmueble.propietarioSecundarioId     │
│                              │  ✗     │ Inmueble.datosFiscales  (CONGELADO)  │
└──────────────────────────────┘        └──────────────────────────────────────┘
```

- **Escritura:** sólo el motor de titularidades escribe los campos antiguos (write-through). La UI nueva nunca los toca.
- **Lectura:** los 33 ficheros acoplados siguen leyendo los campos antiguos **hasta que se migren uno a uno**.
- **`datosFiscales`:** se **congela**. No se regenera, no se sincroniza. Es una foto histórica y como tal se trata (mismo criterio que ya aplica hoy).
- **`propietarioSecundarioId`:** se rellena con el **primer** titular no principal. Con 3+ titulares, los demás **sólo** están en `titularidades`. Eso significa que durante la transición, los módulos no migrados **sólo ven 2 titulares** — hay que documentarlo y priorizar la migración de `reportingEngine`, `fiscalEngine` y `cobrosEngine`.

### 16.2 Plan de retirada de los campos antiguos

1. Fase 4: implementar `titularidades` + write-through.
2. Fase 5: migrar los 33 ficheros acoplados (por prioridad).
3. Fase 6: **`tsc` + grep** para confirmar 0 referencias a `propietarioPrincipalId`/`propietarioSecundarioId`.
4. Fase 7: marcar `@deprecated`, mantener 1 release.
5. Fase 8: dejar de escribirlos.
6. Fase 9: eliminarlos del tipo (requiere que los datos antiguos ya no se lean).

### 16.3 Compatibilidad del espejo `usuarios_auth`

- `propietarioId` (string) **se mantiene** durante la transición = `propietarioIds[0]`.
- `propietarioIds` (array) se añade.
- Reglas: `myPropId()` y `myPropIds()` conviven; los helpers existentes se migran uno a uno.
- `indexIsTruthful()` debe aceptar **ambas** representaciones durante la transición.

---

## 17. BUG VISUAL — TARJETA "MIS VIVIENDAS" (P18)

### 17.1 Confirmación

```ts
// src/components/sections/PropietarioPortalSection.tsx
336:  {inm.precioRentaMensual} €/mes
351:  <span>{inm.superficieConstruida || 0} m²</span>
```

**Análisis estático (no hay `node_modules`, no se puede ejecutar `tsc --noEmit`):**

- `grep -rn "precioRentaMensual" src/` → **sólo** la línea 336. **No está declarado en `types.ts` ni en ningún sitio.**
- `grep -rn "superficieConstruida" src/` → **sólo** la línea 351. **No está declarado.**
- En `Inmueble` (`types.ts:478-545`) los campos reales son:
  - `precio: number` (`:483`) — «Euros al mes»
  - `rentaMensual?: number` (`:528`) — alias operativo
  - `superficie: number` (`:486`) — «m2»
  - `datosCatastrales.superficieCatastralConstruida?: number` (`:2049`)

> **Por qué ocurre:** son nombres **inventados**, probablemente por confusión con `DatosCatales.superficieCatastralConstruida` y con el alias `rentaMensual`. `tsconfig.json` **no activa `strict`**, y el acceso a una propiedad inexistente en TS **sí** debería ser error de compilación… por lo que `npm run lint` (`tsc --noEmit`) **ya estaría fallando** o nunca se ejecuta en CI. **Hay que verificarlo en cuanto haya `node_modules`.**

### 17.2 Comportamiento en pantalla

| Línea | Renderiza | Resultado visible |
|---|---|---|
| `:336` `{inm.precioRentaMensual} €/mes` | `undefined` → React no renderiza nada | **« €/mes»** (sin número) |
| `:351` `{inm.superficieConstruida \|\| 0} m²` | `undefined \|\| 0` → `0` | **«0 m²»** |

### 17.3 Campos que deberían utilizarse

```tsx
{inm.precio} €/mes                                    // canon
{inm.precio ?? inm.rentaMensual ?? 0} €/mes           // con fallback al alias
{inm.superficie} m²                                   // canon
{inm.superficie ?? inm.datosCatastrales?.superficieCatastralConstruida ?? 0} m²
```

### 17.4 ¿Afecta a otras pantallas?

**No.** Verificado: `precioRentaMensual` y `superficieConstruida` aparecen **sólo** en esas 2 líneas.

Pero el **mismo patrón de riesgo** existe en el resto de `PropietarioPortalSection`: la tarjeta muestra `inm.tipoInmueble`, `inm.alias`, `inm.direccion`, `inm.ciudad`, `inm.codigoPostal`, `inm.habitaciones`, `inm.banos`, `inm.precio`… — todos existen salvo los dos detectados. **Recomendación:** añadir `tsc --noEmit` al CI; habría detectado esto en la primera build.

### 17.5 Relación con el portugués que aparece en el código

Hallazgo colateral sin impacto funcional: `src/notificaciones/autorizacion.ts:15` contiene *"Demonstració IMPORTANTE"* y `:97` `perfilFuente` (mezcla es/ca/pt) en comentarios. Sólo documental.

---

## 18. ADMINISTRADOR vs MASTER — DEPENDENCIAS CON ESTE DISEÑO

**No se corrige en esta orden** (indicación expresa), pero el diseño **depende** de ello en 3 puntos:

| # | Dependencia | Por qué afecta |
|---|---|---|
| **D1** | `isMasterAdmin()` = `authEmail() == 'sarqsan2@gmail.com'` (`rules:28-31`); **no existe `isAdminRole()`** | Cualquier regla nueva para `titularidades`, `vinculaciones_acceso` o baja patrimonial debe decidir si se ancla a `isMasterAdmin()` (coherente con el resto) o introduce un rol de administración real. **Recomendación del diseño: NO abrir esa caja aquí.** Reutilizar `isMasterAdmin()` + `isPropietarioRole()` para no mezclar órdenes, y dejar constancia. |
| **D2** | Un ADMINISTRADOR no-master ve toda la UI pero **sus escrituras se deniegan** | Cualquier pantalla nueva de titularidad/baja debe comportarse igual que el resto o quedará incoherente. El diseño propone que la UI **avise** cuando la escritura esté denegada (§11), lo que mitiga el problema sin resolverlo. |
| **D3** | El alta de titulares por un propietario requiere tocar `propietarios/{nuevoId}` | Hoy `rules:418-422` lo prohíbe a todo el que no sea MASTER. Para que un propietario pueda **crear** la ficha de un cotitular habrá que modificar esa regla — **inevitablemente**. Es la única excepción que este diseño necesita abrir en el bloque ADMINISTRADOR/MASTER, y debe hacerse de forma acotada: «un propietario puede crear `propietarios/{id}` si lo asocia como titular a un inmueble de su titularidad», con `id` generado y validado. |

> **Se documenta, no se corrige.** La corrección global del problema ADMINISTRADOR ≠ MASTER queda fuera de esta orden.

---

## 19. PLAN DE IMPLEMENTACIÓN POR FASES

| Fase | Contenido | Riesgo | Rompe compat. |
|---|---|---|---|
| **F0 — Cimientos de persistencia** (prerequisito de todo) | `ejecutarMutacion()` · `await` en todos los handlers · servicios dejan de tragar errores · rollback · mensajes accionables · `writeBatch` · corregir `saveInmuebleFirestore` dentro de `setState` (`App.tsx:2377`, `:2669`) | Bajo | No |
| **F1 — Preselección del titular + validación de alta** | `propIdEfectivo` derivado de `currentUser` · selector bloqueado para PROPIETARIO · validación en `handleCreateInmuebleSubmit` | Bajo | No |
| **F2 — Bug visual + limpieza** | `precio`/`superficie` en la tarjeta · estado fantasma `'reservado'` · `tsc --noEmit` en CI | Muy bajo | No |
| **F3 — Tipos y motor** (sin reglas ni UI) | `Titularidad`, `EstadoTitularidad`, `RolTitularidad`, `HistorialTitularidadItem`, `BajaInmueble`, `EstadoPatrimonialInmueble`, `HistorialPatrimonialItem`, `TitularContrato`, `VinculacionAcceso` · `titularidadesEngine.ts` · `cicloPatrimonialEngine.ts` · **tests unitarios** | Bajo | No (sólo añade) |
| **F4 — Migración de datos** | `scripts/backfill-titularidades.ts` · DRY RUN + informe · materialización por batches · verificación · rollback | **Medio** | No (aditivo) |
| **F5 — Reglas Firestore** | `titularidades`, `titularidades_historial`, `vinculaciones_acceso`, `inmuebles` (`list` acotado), `candidatos` (acotar), `fichas_publicas_inmueble` (permitir retirada) · `myPropIds()`, `myGestorIds()`, `titularOAlcanza()` · verificación con `tests/harness` + emulador | **Alto** | — |
| **F6 — Listeners acotados** | `subscribeInmuebles(callback, scope)` con `array-contains-any` + chunking · pasar `dataScope` en `App.tsx:967` · extender al resto según §10.3 | Medio | No |
| **F7 — UI: ciclo patrimonial** | Reemplazar el delete por «Gestionar baja» · evaluación de dependencias · modal informado · banner de estado · pestaña «Histórico patrimonial» en el portal | Medio | Sí (cambia el flujo de borrado) |
| **F8 — UI: N titulares** | Panel de titularidad en la ficha del inmueble · alta/edición/finalización de titularidades · validación de suma 100 % · portal del propietario | Medio | Sí |
| **F9 — Flujos de titulares y acceso** | Crear ficha patrimonial ↔ crear cuenta de acceso ↔ vincular ↔ dar acceso a cartera ↔ compartir inmueble ↔ delegar (6 operaciones separadas, §5/§20) | Medio-Alto | Sí |
| **F10 — Motores afectados** | `contratoEngine` (N arrendadores) · `fiscalEngine` (imputación por tramos) · `liquidacionEngine` (reparto N-ario) · `reportingEngine` · `cobrosEngine` · `gastosEngine` · `habitacionesEngine` · `publicacionEngine` · `matchingEngine` | **Alto** | Sí (cambia cálculos) |
| **F11 — Import/Export** | Importar con titularidades · exportar con titular y porcentaje · incluir histórico | Medio | Sí (formato) |
| **F12 — Retirada de campos antiguos** | Según §16.2 (fases 6-9) | Medio | Sí |

**Orden obligatorio:** F0 antes que nada. F1–F2 pueden ir en paralelo. F3 antes de F4. F4 antes de F5 (las reglas necesitan el índice `titularesIds` poblado). F5 antes de F7 (sin reglas no hay baja real). F10 es la de mayor riesgo funcional y debe ir con validación jurídica/fiscal.

---

## 20. FLUJOS UX — CREACIÓN DE TITULARES DESDE PROPIETARIO (§5 de la orden)

### 20.1 Las 6 operaciones, estrictamente separadas

| # | Operación | Qué crea | Dónde | Requiere |
|---|---|---|---|---|
| **1** | **Crear ficha patrimonial** | `propietarios/{id}` | Panel «Mis Titulares» | Datos fiscales + NIF único |
| **2** | **Crear cuenta de acceso** | `usuarios/{id}` + `usuarios_auth/{uid}` | Invitación (`enlaces_registro`) | Email + contraseña del invitado |
| **3** | **Vincular cuenta ↔ titular** | `vinculaciones_acceso` (tipo `TITULAR`) | Automático al aceptar la invitación (`authService.ts:547-581` ya lo hace) | Que la cuenta exista |
| **4** | **Dar acceso a cartera** | `vinculaciones_acceso` (tipo `GESTOR`) | Panel «Delegación» | Alcance + capacidades + caducidad |
| **5** | **Compartir un inmueble** | `titularidades/{id}` | Ficha del inmueble → «Titulares» | Ficha patrimonial + porcentaje |
| **6** | **Delegar gestión** | `vinculaciones_acceso` + capacidades | Panel «Delegación» | Vínculo previo |

> **Regla de oro:** la operación 1 **nunca** crea la 2. La 2 **nunca** crea la 1. Son ciclos de vida independientes: un titular puede no tener cuenta (heredero, menor, sociedad sin portal) y una cuenta puede no ser titular de nada (gestor).

### 20.2 Caso objetivo: A añade B, B añade C, C añade D

```
A (titular + cuenta)
 │
 ├─ Panel «Mis Titulares» → «Añadir titular»
 │     · ¿Ya tiene ficha? → buscar por NIF → vincular
 │     · ¿No? → formulario fiscal → crear propietarios/{id}
 │     · ¿Debe tener acceso? → «Enviar invitación de acceso»
 │           → enlaces_registro (tipoPerfil:'PROPIETARIO', propietarioIdVinculado)
 │           → B se registra → authService crea usuarios + propietarios ya existente
 │           → vinculaciones_acceso (TITULAR)
 │           → B queda como titular de la cartera de A
 │
 └─ B repite el proceso con C, y C con D
```

**Permiso para "añadir":** un titular puede crear otro titular **si** es titular principal (o tiene la capacidad `CREAR_TITULARES` delegada) de al menos un inmueble activo. Queda trazado en `titularidades.creadoPorId` / `propietarios` y en `audit_logs`.

### 20.3 Pantallas nuevas en el portal

1. **«Mis Titulares»** — listado de fichas patrimoniales vinculadas a mi cartera; alta; invitación de acceso; estado de la invitación.
2. **«Titulares» en la ficha del inmueble** — N titulares con %, vigencia, rol; alta/baja; validación de suma 100; aviso de `porcentajePendiente`.
3. **«Delegación / Gestores»** — quién gestiona mi cartera, con qué alcance y hasta cuándo; revocación.
4. **«Histórico patrimonial»** — inmuebles vendidos/dados de baja + histórico de titularidad reconstruible.
5. **«Gestionar baja»** — sustituye al actual botón de eliminar (§7 / §12).

---

## 21. PLAN DE PRUEBAS

### 21.1 Pruebas solicitadas (TEST 1–14)

| # | Prueba | Capa | Criterio de éxito |
|---|---|---|---|
| **T1** | 1 inmueble + 1 titular | Motor + Reglas + UI | 1 `titularidad` ACTIVA 100 %, `esPrincipal`, suma == 100, `titularesIds == [A]` |
| **T2** | 1 inmueble + 2 titulares | Ídem | 2 titularidades, suma 100 %, `propietarioSecundarioId` coherente (compat.) |
| **T3** | 1 inmueble + 3 titulares | Ídem | 3 titularidades, suma 100 %, el 3º **sólo** en `titularidades` |
| **T4** | 1 inmueble + 4 titulares | Ídem | 4 titularidades, suma 100 % |
| **T5** | 2 inmuebles con combinaciones distintas | Ídem | INM-1 {A,B,C} · INM-2 {A,C} · los 3 ven lo que corresponde, nadie ve lo demás |
| **T6** | Titular secundario inicia sesión | Reglas + Listener + UI | B ve INM-1; `titularesIds.hasAny(myPropIds())` lo permite; **sin** depender de `inmuebleIds` manual |
| **T7** | Titular sin relación | Reglas | `get`/`list` denegados; el listener no devuelve el inmueble; **no llega al cliente** |
| **T8** | Alta confirmada | App + Servicio | `await` · el doc existe en Firestore · `localStorage` coherente · sin preselección manual |
| **T9** | Firestore falla → rollback | App + UI | Estado local **vuelve al snapshot** · error visible · **cero** efectos colaterales (candidatos intactos) |
| **T10** | Inmueble alquilado años → vendido | Motor + Reglas + UI | Fuera de cartera activa · en histórico · contrato FINALIZADO y presente · 96 recibos · gastos · documentos · fiscal consultable y exportable · titularidades FINALIZADAS · anuncios DESPUBLICADOS |
| **T11** | Cambio de titularidad | Motor + Histórico | Reconstrucción punto-en-el-tiempo correcta (caso 2020-25 / 2025-28 / 2028) |
| **T12** | Gestor autorizado | Reglas + Vinculaciones | Ve y opera dentro de su alcance; no más allá |
| **T13** | Gestor no autorizado | Reglas | Denegado en lectura y escritura |
| **T14** | Delete físico restringido | Reglas + UI | Bloqueado con mensaje accionable si hay dependencias; sólo MASTER y sólo sin histórico |

### 21.2 Pruebas adicionales recomendadas

| # | Prueba |
|---|---|
| T15 | Migración idempotente: ejecutar el backfill 2× → mismo resultado, sin duplicados |
| T16 | Rollback de migración: datos de origen intactos |
| T17 | `porcentajePendiente`: nunca se muestra un % inventado como cierto |
| T18 | Suma ≠ 100 → la UI bloquea y explica |
| T19 | Titularidad duplicada (misma `clave`) → rechazada por reglas |
| T20 | Intento de mutar `inmuebleId`/`propietarioId` de una titularidad → denegado |
| T21 | `titularidades_historial` append-only: update/delete denegados |
| T22 | Inmueble vendido → ficha pública retirada y portales DESPUBLICADOS |
| T23 | Inmueble vendido → exportación fiscal del ejercicio de venta incluye todo |
| T24 | Reactivación de una baja errónea, auditada |
| T25 | Inquilino (BLOQUE E) sigue viendo su vivienda tras un cambio de titularidad |
| T26 | `array-contains-any` con >10 titularidades → chunking correcto, sin huecos ni duplicados |
| T27 | Aislamiento: el payload de red de un propietario no contiene inmuebles ajenos |
| T28 | Regresión: los 33 ficheros acoplados siguen funcionando tras el write-through |

### 21.3 Herramientas del repo a reutilizar

- `vitest` (ya usado: `src/utils/*.test.ts`, `src/test/e/`).
- `tests/harness/firestoreRulesEval.ts` + `tests/helpers/evaluadorReglasFirestore.ts` para verificación **textual** de reglas (criterio ya usado: *"Reglas verificadas textualmente (sin emulator)"*).
- Patrón de aislamiento: `src/utils/inventarioIsolation.test.ts` y `src/utils/habitacionesIsolation.test.ts`.
- Patrón de backfill: `tests/backfill-fichas-publicas.test.ts`.
- Scripts: `scripts/test-bloque-b.ts`, `-c`, `-e`.

---

## 22. RIESGOS

| ID | Riesgo | Prob. | Impacto | Mitigación |
|---|---|---|---|---|
| **R1** | **Reglas: `hasAny`/`array-contains-any` no demostrable** para el `list` acotado | Media | **Alto** — bloquearía F5 | Verificar con emulador **antes** de escribir las reglas. Plan B: índice `titularesIds` + consulta por `documentId()` desde una colección de permisos materializada |
| **R2** | **Límite de 10 valores** en `array-contains-any` | Alta | Medio | Chunking + fusión de snapshots (diseñado) |
| **R3** | **Duplicidad de escrituras** por listeners replicados durante la transición | Media | Medio | Flags por fase; desactivar listeners antiguos al activar los nuevos |
| **R4** | **Imputación fiscal por tramos** errónea | Media | **Alto** (tributario) | No activar por defecto; mantener criterio actual con flag; validación por asesoría fiscal |
| **R5** | **Redacción de contratos LAU con N arrendadores** jurídicamente incorrecta | Media | **Alto** (legal) | Validación jurídica antes de F10; mantener el generador de 2 bloques hasta entonces |
| **R6** | **Migración con porcentajes desconocidos** | **Alta** | Medio | `porcentajePendiente: true`; nunca presentar el 50/50 como dato cierto |
| **R7** | **Histórico de titularidad anterior irrecuperable** | **Alta** (ya ocurrido) | Alto | Documentarlo; empezar a registrar ya (§15.6) |
| **R8** | **33 ficheros acoplados** ⇒ regresiones | Alta | Medio | Write-through + migración por prioridad + T28 |
| **R9** | **`indexIsTruthful()` roto** al añadir arrays al espejo | Media | **Alto** (elevación de privilegios) | Tests específicos del espejo (`tests/fase14-espejo-identidad.test.ts` ya existe → ampliar) |
| **R10** | **Coste de lectura** de N titularidades por inmueble | Baja | Bajo | Índice `titularesIds` en el propio inmueble; las titularidades se cargan por inmueble o por titular, nunca todas |
| **R11** | **Dependencia de ADMINISTRADOR ≠ MASTER** (D3) | Alta | Medio | Documentado en §18; abrir **sólo** la excepción mínima de `propietarios/{nuevoId}` |
| **R12** | **`node_modules` ausente** ⇒ no hay verificación de tipos | Alta | Medio | Instalar y ejecutar `tsc --noEmit` como Gate 0 de F0 |

---

## 23. GAPS CLASIFICADOS (G1–G7)

| ID | Gap | Clase |
|---|---|---|
| **G-01** | Modelo de titularidad binario; sin array ni porcentaje por inmueble | **G7** |
| **G-02** | `usuarios.propietarioId` escalar ⇒ 1 cuenta = 1 titular | **G7** |
| **G-03** | `ContratoFormalizacion` duplica la titularidad en 7 campos | **G7** |
| **G-04** | `repartoCopropiedad` binario | **G7** |
| **G-05** | `fiscalEngine` imputa a un solo titular | **G7** |
| **G-06** | No existe entidad gestor (sólo un rol sin relación) | **G7** |
| **G-07** | No existe `vinculación cuenta↔titular` explícita y versionada | **G7** |
| **G-08** | Sin modelo de ciclo de vida patrimonial (`estado` = sólo explotación) | **G7** |
| **G-09** | Propietario no puede crear titulares | **G5** |
| **G-10** | Propietario no puede asociar titulares a inmuebles | **G5** |
| **G-11** | No existe baja lógica / VENDIDO / HISTÓRICO para inmuebles | **G5** |
| **G-12** | No existe histórico de titularidad | **G5** |
| **G-13** | No existe despublicación automática al dar de baja | **G5** |
| **G-14** | No existe auditoría del borrado/baja de inmuebles | **G5** |
| **G-15** | Cotitular secundario invisible para sí mismo | **G3** + **G6** |
| **G-16** | `datosFiscales` desincronizado (copia congelada sin marcar como tal) | **G3** |
| **G-17** | `'CERRADO_VENDIDO'` existe pero no produce ningún efecto patrimonial | **G4** |
| **G-18** | Borrado optimista + sin `await` + error tragado | **G4** |
| **G-19** | Efecto colateral destructivo aun cuando el borrado falla | **G4** |
| **G-20** | Alta sin preselección de titular ⇒ alta fantasma en localStorage | **G4** |
| **G-21** | Campos inexistentes en la tarjeta "Mis Viviendas" | **G4** |
| **G-22** | Sin comprobación de dependencias antes de borrar | **G4** |
| **G-23** | `deleteDoc` físico sin cascada ni bloqueo en 29 colecciones | **G4** |
| **G-24** | `list` de `inmuebles` = `isStaff()`; listener sin `where` | **G6** |
| **G-25** | 28 listeners sin `DataAccessScope` | **G6** |
| **G-26** | `candidatos` update/delete = `isSignedIn()` | **G6** |
| **G-27** | `propietarios` create exige `id == myPropId()` (bloqueo absoluto) | **G6** (dependencia D3) |
| **G-28** | Rol ADMINISTRADOR ausente en reglas | **G6** (fuera de esta orden) |
| **G-29** | `permisos[]` declarativo sin uso funcional | **G3** |
| **G-30** | `propietarioId` / `propietarioPrincipalId` redundantes | **G3** |
| **G-31** | Estado fantasma `'reservado'` | **G3** |
| **G-32** | `saveInmuebleFirestore` invocado dentro del callback de `setState` | **G3** |
| **G-33** | `import` sin validación de titularidad, sin `await`, sin reporte de errores | **G3** |
| **G-34** | Ficha pública no se retira al dar de baja (sólo al borrar) | **G3** |
| **G-35** | Sin `tsc --noEmit` verificable en el entorno actual | **G2** |

**Resumen:** G1 = 0 · G2 = 1 · G3 = 10 · G4 = 7 · G5 = 6 · G6 = 7 · G7 = 8

---

## 24. ARCHIVOS QUE HABRÍA QUE MODIFICAR

### 24.1 Nuevos (F3)

| Archivo | Contenido |
|---|---|
| `src/utils/titularidadesEngine.ts` | Motor de titularidades (§4.5) |
| `src/utils/cicloPatrimonialEngine.ts` | Máquina de estados patrimonial (§6) |
| `src/utils/mutacionFirestore.ts` | `ejecutarMutacion` (§11.1) |
| `src/utils/dependenciasInmueble.ts` | `puedeEliminarFisicamente` + inventario (§7.2) |
| `src/lib/titularidadesFirestore.ts` | Servicios + listeners acotados |
| `src/lib/vinculacionesFirestore.ts` | Servicios de `vinculaciones_acceso` |
| `src/components/sections/portal-propietario/TitularesPanel.tsx` | UI N titulares |
| `src/components/sections/portal-propietario/HistoricoPatrimonialPanel.tsx` | UI histórico |
| `src/components/sections/portal-propietario/DelegacionPanel.tsx` | UI gestores |
| `src/components/modals/GestionarBajaInmuebleModal.tsx` | Sustituye al delete (§12.2) |
| `src/components/modals/TitularidadModal.tsx` | Alta/edición de titularidad |
| `scripts/backfill-titularidades.ts` | Migración (§15.4) |
| `scripts/rollback-titularidades.ts` | Rollback (§15.5) |
| `src/utils/titularidadesEngine.test.ts` · `cicloPatrimonialEngine.test.ts` · `titularidadesIsolation.test.ts` · `pruebas T1–T28` | Tests |

### 24.2 A modificar — tipos

| Archivo | Cambio |
|---|---|
| `src/types.ts` | `Titularidad`, `EstadoTitularidad`, `RolTitularidad`, `HistorialTitularidadItem`, `TitularContrato`, `BajaInmueble`, `EstadoPatrimonialInmueble`, `EstadoExplotacionInmueble`, `HistorialPatrimonialItem`, `VinculacionAcceso`, `HistorialVinculacionItem` · `Inmueble`: `titularesIds[]`, `titularesHistoricosIds[]`, `titularidadPrincipalId`, `estadoPatrimonial`, `estadoExplotacion`, `baja`, `historialPatrimonial`, `@deprecated` en los 3 campos antiguos · `ContratoFormalizacion`: `titularesAlFirmar[]`, `@deprecated` en los 7 `segundoPropietario*` · `AuditLog.entidadAfectada`: añadir valores |

### 24.3 A modificar — servicios / listeners

| Archivo | Cambio |
|---|---|
| `src/lib/firebase.ts` | **`subscribeInmuebles(callback, scope)`** · todos los `save*`/`delete*` dejan de tragar errores y los relanzan · `writeBatch` en alta/baja · nuevos servicios de `titularidades` y `vinculaciones` · `syncAuthIndex` con `propietarioIds[]` |
| `src/lib/authService.ts` | `propietarioIds[]` en el espejo (`:95`) · alta por invitación con vinculación explícita (`:547-581`) |
| `src/lib/fichaPublicaInmueble.ts` | `propietarioEfectivo` desde `titularesIds` (`:157`) · retirada de ficha en la baja |
| `src/lib/tesoreriaFirestore.ts` | Reparto N-ario |

### 24.4 A modificar — motores (F10)

`contratoEngine.ts` · `fiscalEngine.ts` · `liquidacionEngine.ts` · `reportingEngine.ts` · `cobrosEngine.ts` · `gastosEngine.ts` · `habitacionesEngine.ts` · `publicacionEngine.ts` · `conciliacion/matchingEngine.ts` · `inventarioEngine.ts` (referencia de patrones, no cambia) · `portalEngine.ts`

### 24.5 A modificar — UI (33 ficheros acoplados + portal)

`App.tsx` (handlers, scoping, listeners, `SECCIONES_PROPIETARIO`) · `PropietarioPortalSection.tsx` · `PropietariosSection.tsx` · `InmueblesSection.tsx` · `AdminControlCenter.tsx` · `AdministracionSection.tsx` · `InformesSection.tsx` · `TesoreriaSection.tsx` · `ActasSection.tsx` · `ConciliacionBancariaSection.tsx` · `DashboardEjecutivoSection.tsx` · `RecomercializacionSection.tsx` · `FormalizarContratoModal.tsx` · `CrearUsuarioModal.tsx` · `RecomercializarModal.tsx` · `HabitacionesInmueblePanel.tsx` · `notificaciones/autorizacion.ts` · `notificaciones/dispatcher.ts` · `notificaciones/resolucion.ts`

### 24.6 A modificar — infraestructura

| Archivo | Cambio |
|---|---|
| `firestore.rules` | **F5 completa** (§4.4, §10.2, §12.4) — **NO TOCAR EN ESTA ORDEN** |
| `firestore.indexes.json` | Índices para `titularidades` (`inmuebleId`, `propietarioId`, `clave`) e `inmuebles` (`titularesIds` array) |
| `package.json` | Scripts `test:titularidades`, `migrate:titularidades` |
| `tsconfig.json` | Activar `strict` (a medio plazo; hoy taparía G-21) |

---

## 25. ARCHIVOS QUE NO DEBERÍAN TOCARSE

| Archivo / carpeta | Motivo |
|---|---|
| **`firestore.rules`** | **Prohibido en esta orden.** Es la F5 y requiere verificación con emulador |
| **`storage.rules`** | Fuera de alcance; contiene el email master hard-coded (`:43`) — no mezclar |
| Cualquier dato de Firestore | Prohibido |
| `src/data/mockData.ts` | `INITIAL_PROPIETARIOS` e `INITIAL_INMUEBLES` ya son `[]`; no reintroducir semillas |
| `docs/` existentes | Son el registro histórico de decisiones; se añaden documentos, no se reescriben |
| Bloque E (`src/inquilino/*`, `src/components/portal-inquilino/*`, `src/lib/suministrosFirestore.ts`) | Está cerrado y validado (533/533). Sólo afectado de forma **pasiva**: el inquilino sigue viendo su vivienda tras un cambio de titularidad. **No reabrir sin necesidad** |
| BLOQUE B (tesorería) y BLOQUE C (morosidad) | Salvo el reparto N-ario de liquidaciones (F10). No reestructurar |
| `src/sindicacion/*` | Sólo consumir `retirar` → `DESPUBLICADO`. No modificar el motor de sindicación |
| `src/utils/verifactuTransport.ts`, `facturaElectronicaXml.ts` | Obligaciones legales cerradas; sólo se amplía la exportación |
| `src/experiencia/*` (tutoriales, asistente) | No bloquea; reevaluar en F8 si los tutoriales mencionan "propietario principal/secundario" |
| `patches/*` | Histórico de parches aplicados; intocable |
| `bun.lock` / `package-lock.json` | Sólo si se añaden dependencias (no previstas) |

---

## 26. ORDEN RECOMENDADO DE IMPLEMENTACIÓN

```
GATE 0 ── npm install && npx tsc --noEmit        ← imprescindible antes de nada
   │                                              (hoy hay 2 errores garantizados: G-21)
   ▼
F0  Cimientos de persistencia  ─────────────────── PREREQUISITO DE TODO
   │   await · rollback · errores visibles · writeBatch · servicios que relanzan
   │   ⚠️ Sin F0, cualquier fase posterior hereda el fallo silencioso
   ▼
F1  Preselección del titular + validación de alta   (bajo riesgo, alto valor)
F2  Bug visual + 'reservado' + tsc en CI            (muy bajo riesgo)
   ▼
F3  Tipos + motores + tests unitarios               (sólo añade, no rompe)
   ▼
F4  Migración aditiva (DRY RUN → materializar → verificar → rollback listo)
   ▼
F5  Reglas Firestore  ─────────────────── RIESGO ALTO · verificar R1 con emulador
   ▼
F6  Listeners acotados (subscribeInmuebles con scope)
   ▼
F7  UI: ciclo patrimonial (sustituye el delete roto)   ← cierra P9, P10, P14, P16, P22
   ▼
F8  UI: N titulares en la ficha del inmueble           ← cierra P1, P5, P6
   ▼
F9  Flujos de titulares y delegación (6 operaciones)   ← cierra P7, G-06, G-07
   ▼
F10 Motores (contrato / fiscal / liquidación / informes)
       ⚠️ RIESGO ALTO · requiere validación jurídica (R5) y fiscal (R4)
   ▼
F11 Import / Export
   ▼
F12 Retirada de campos antiguos (§16.2)
```

**Recomendación de agrupación en órdenes de trabajo:**

1. **Orden A** = Gate 0 + F0 + F1 + F2 → devuelve diagnóstico fiable y elimina los fallos silenciosos.
2. **Orden B** = F3 + F4 → modelo y datos listos, sin tocar reglas ni UI.
3. **Orden C** = F5 + F6 → aislamiento real (requiere validación con emulador).
4. **Orden D** = F7 + F8 → el propietario puede dar de baja y gestionar N titulares.
5. **Orden E** = F9 → titulares y gestores.
6. **Orden F** = F10 + F11 → cálculos y exportación (con validación externa).
7. **Orden G** = F12 → limpieza.

---

## ANEXO A — ÍNDICE DE EVIDENCIAS

| Tema | Referencia |
|---|---|
| Modelo titular / inmueble | `src/types.ts:425-455`, `:467-476`, `:478-545` (`:499-503`), `:603-629` |
| Cuenta de acceso | `src/types.ts:1695-1719` · `firestore.rules:265-312` |
| `myPropId` / `ownsPropietario` / `canReachInmuebleId` | `firestore.rules:154-170` |
| Reglas `propietarios` | `firestore.rules:412-429` |
| Reglas `inmuebles` (delete = isMasterAdmin) | `firestore.rules:444-466` (`:450`, `:465`) |
| Reglas `candidatos` (abierto) | `firestore.rules:979-1007` (`:988`, `:1006`) |
| Reglas `config_liquidacion` | `firestore.rules:1751-1758` |
| **Patrón de reglas a replicar** | `firestore.rules:2129-2194` (`sindicacion_inmuebles`) |
| Helpers de inmutabilidad en reglas | `firestore.rules:381-405` |
| `isMasterAdmin` | `firestore.rules:28-31` · `src/lib/authService.ts:38` |
| `deleteInmuebleFirestore` / `subscribeInmuebles` | `src/lib/firebase.ts:371-381`, `:261-277` |
| Listener sin scope | `src/App.tsx:967-982` |
| `handleDeleteInmueble` | `src/App.tsx:1662-1683` |
| `handleAddInmueble` / `handleUpdateInmueble` | `src/App.tsx:1686-1710` |
| `handleSavePropietario` / `handleDeletePropietario` | `src/App.tsx:2675-2698` |
| `handleFinalizarContrato` | `src/App.tsx:2340-2384` |
| `handleCerrarExpedienteRecomerc` (VENDIDO sin efecto) | `src/App.tsx:2643-2672` |
| `handleImportData` | `src/App.tsx:1862-1880` |
| `SECCIONES_PROPIETARIO` | `src/App.tsx:286-311` |
| `scopedInmuebles` / `scopedPropietarios` | `src/App.tsx:537-566` |
| **Patrón de baja lógica** | `src/utils/inventarioEngine.ts:202-225` |
| `canAccess*` inventario | `src/utils/inventarioEngine.ts:62-99` |
| Contrato: titularidad binaria | `src/utils/contratoEngine.ts:221-304`, `:409-421`, `:472-473`, `:528-529`, `:618-621` |
| `ContratoFormalizacion` campos duplicados | `src/types.ts:1080-1086` |
| `FinalizacionContrato` (plantilla) | `src/types.ts:866-874` |
| `AnexoContractual` (versionado) | `src/types.ts:876-907` |
| Cadena histórica de contratos | `src/types.ts:1146-1155` |
| `EstadoRecomercializacion` / `resultadoCierre` | `src/types.ts:1994-2004`, `:2155-2161` |
| Fiscal: un solo titular / histórico | `src/utils/fiscalEngine.ts:587-588`, `:620-641`, `:647-680` |
| Liquidación: reparto binario | `src/tesoreria/tipos.ts:57-58` · `liquidacionEngine.ts:83-90`, `:305-314` |
| Plantilla de backfill | `src/lib/backfillFichasPublicas.ts:260-457` |
| Plantilla de tests de aislamiento | `src/utils/inventarioIsolation.test.ts`, `src/utils/habitacionesIsolation.test.ts` |
| Verificación de reglas | `tests/harness/firestoreRulesEval.ts`, `tests/helpers/evaluadorReglasFirestore.ts` |
| Espejo de identidad | `src/lib/authService.ts:86-100` · `firestore.rules:230-258` |
| Alta por enlace | `src/lib/authService.ts:455-627` |
| Notificaciones: autorización/cartera | `src/notificaciones/autorizacion.ts:19-25` · `dispatcher.ts:149-171` · `resolucion.ts:185` |
| Exportación | `src/components/sections/InformesSection.tsx:96-188` |
| Bug visual | `src/components/sections/PropietarioPortalSection.tsx:336`, `:351` |
| Estado fantasma | `src/components/admin/AdminControlCenter.tsx:129` |
| Roles y permisos | `src/types.ts:1838-1846`, `:1891-1946` |

---

**FIN DEL DOCUMENTO DE DISEÑO.**
**No se ha modificado código, datos, reglas ni usuarios. No hay commit, push, PR ni merge.**
