# Sección «Propietarios / Titulares» — modelo y siguiente trabajo

> **Estado actual:** la sección se construyó en ORDEN 4 (PR #18, `PropietariosSection`), su **acceso** se corrigió el
> 2026-10-01 (`docs/auditoria/CARTERAS_Y_TITULARES_INTERVENCION_2026-10-01.md`) y el **punto abierto de §4 está RESUELTO**
> (PR #19): un PROPIETARIO crea y mantiene **cualquier número** de fichas de titular dentro de su ámbito
> (`Propietario.ambitoPropietarioId`), sin pasar por el master y sin límite; el ámbito es la única frontera. El texto de
> abajo conserva el diseño original y marca lo que ha cambiado.
>
> *Estado original de este documento: SOLO DISEÑO. Esta intervención únicamente preparaba el modelo y desacoplaba el
> alta de inmueble (ver §5), sin rediseñar la pantalla de Propietarios ni tocar `firestore.rules`.*

Fecha: 2026-10-01 · Base: `origin/main` = `21afea4d45271070bee29f93aa9f1c6237834c10`.

## 1. Decisión de modelo (no negociable)

1. **Una única entidad de titular, completa y reutilizable.** Es la ficha que ya existe:
   `propietarios/{id}` (interfaz `Propietario`, `src/types.ts`). **No** habrá un «titular
   básico» y otro «completo»: un titular se da de alta una vez, con todos los datos que el
   ERP necesita, y se reutiliza en todos los inmuebles en los que figure.
2. **El titular es independiente del inmueble.** La relación es N:M y vive en:
   - `titularidades/{inmuebleId}__{propietarioId}` (clave determinista; el cierre nunca borra), y
   - el índice `inmuebles.titularesIds[]` (se escribe en el mismo lote atómico que la titularidad).
3. **Titular ≠ cuenta de acceso ≠ persona.** Crear o asignar un titular no crea ninguna cuenta
   (`usuarios_auth`); `personaId` es un vínculo opcional que no concede permisos.
4. **Sin personas duplicadas.** Ejemplo del contrato:

   | Titular | Inmuebles | Relaciones |
   |---|---|---|
   | A | 1, 2, 3 | `1__A`, `2__A`, `3__A` |
   | B | 1, 4 | `1__B`, `4__B` |

   Dos fichas de persona, cinco relaciones. El inmueble 1 tiene N = 2 titulares; el modelo no
   limita a «principal + secundario».
5. **Los porcentajes no se asumen.** Una titularidad nace `PENDIENTE` (`porcentajeTitularidad = null`)
   y se declara después en el panel de titularidades. Nunca 100, nunca 50/50 por defecto.

## 2. Datos que debe contener la ficha del titular

Son los campos que `Propietario` ya tiene hoy; la futura sección debe permitir darlos de alta
**todos** en un único formulario (alta completa), sin tener que completarlos en otra pantalla.

| Bloque | Campos actuales (`Propietario`) | Notas |
|---|---|---|
| Identificación | `nombre` (nombre y apellidos o razón social), `tipoPropietario` (`persona_fisica` \| `persona_juridica` \| `comunidad_bienes`), `nifCif` | El NIF/CIF/NIE es la clave natural para detectar duplicados. |
| Contacto | `telefono`, `email` | |
| Domicilio fiscal y de notificaciones | `direccion`, `ciudad`, `codigoPostal`, `provincia?` | Es la dirección fiscal del titular, no la del inmueble. |
| Representación legal | `tieneRepresentanteLegal?`, `nombreRepresentante?`, `nifRepresentante?`, `cargoRepresentante?`, `tituloRepresentacion?` | Obligatoria en la práctica para personas jurídicas. |
| Datos bancarios | `cuentasBancarias[]` → `CuentaBancariaPropietario` (`id`, `alias`, `iban`, `banco?`, `titular?`, `swiftBic?`, `esPrincipal?`) | Una o varias; una principal. |
| Notas | `notasPrivadas?` | Sólo visibles para quien gestiona la ficha. |
| Vínculos y trazabilidad | `fechaCreacion`, `fechaActualizacion`, `personaId?`, `roadmap01AuditId?` | `personaId` y la auditoría los escribe sólo el master. |

## 3. Dónde viven los datos fiscales

**En el titular, no en el inmueble.** Todo lo que necesite identificar fiscalmente a una persona
debe resolverse por `propietarioId` contra la ficha, sin copiar datos:

- liquidaciones (`src/tesoreria/liquidacionEngine.ts`),
- informes y exportaciones,
- documentos y contratos (`src/utils/contratoEngine.ts` ya refresca principal y secundario **por
  id** desde la ficha y sólo usa el snapshot como respaldo),
- fiscalidad.

`inmuebles.datosFiscales.propietarioPrincipal` y `.segundoPropietario` son **instantáneas
heredadas** (modelo binario): sirven de respaldo cuando el usuario no ve la ficha de los demás
titulares (p. ej. un propietario sólo ve la suya). Deben retirarse cuando todos los consumidores
lean la ficha por id (§6).

## 4. Alta completa del titular (trabajo futuro)

Propuesta para la sección, a validar antes de construir:

1. **Un solo formulario** con los bloques de §2 (identificación → contacto → domicilio fiscal →
   representación → cuentas bancarias). Sin pasos «mínimos» que dejen fichas incompletas.
2. **Detección de duplicados por NIF/CIF/NIE antes de crear**: si existe, se ofrece abrir la
   ficha existente, no crear otra.
3. **Validaciones**: formato NIF/CIF/NIE, IBAN, código postal; `nifRepresentante` y
   `nombreRepresentante` si `tieneRepresentanteLegal`.
4. **No crea cuenta de acceso ni porcentajes** (ver §1.3 y §1.5).
5. **Después de crear**, la ficha queda disponible en el selector del alta de inmueble y en el
   panel de titularidades.

### Decisión (resuelta el 2026-10-01, PR #19): ¿quién puede crear la ficha de un tercero?

**El propio PROPIETARIO, dentro de su ámbito y sin límite de cantidad.** El modelo funcional real es: PROPIETARIO →
Propietarios/Titulares → «Crear titular» → tantos como necesite (cónyuge, copropietario, familiar, sociedad u otro titular
patrimonial, no necesariamente él mismo) → cada ficha completa e independiente → luego asignable a sus inmuebles. No hace
falta un master/administrador y no hay «1, 2, 3, 10, 50»: la cantidad no es parte de ninguna condición.

Con las Rules actuales (`match /propietarios/{propietarioId}`):

- `create`: **master** (con auditoría); el PROPIETARIO para **su ficha** (`propietarioId == myPropId()`, sin ámbito); y el
  PROPIETARIO para **cualquier número de fichas de titular de su ámbito** (`ambitoPropietarioId == myPropId()`, id reservado
  `tit_<token>`, sin `personaId` ni campos de cuenta/cartera/auditoría). El gestor no crea propietarios.
- `update`: master; el PROPIETARIO sobre su ficha y sobre las fichas **que ya están en su ámbito** (ámbito e id inmutables); el
  gestor con cartera de escritura solo sobre `fichaPatrimonial`.
- `get`/`list`: master; el PROPIETARIO, su ficha y las de su ámbito (`list` solo como consulta `where('ambitoPropietarioId','==', su id)`);
  el gestor, la ficha de las carteras que gestiona. `delete`: nunca.

**Ilimitado ≠ global.** Lo único que acota es la autorización/ámbito: no hay acceso a titulares de carteras ajenas, ni
`allow list: if true`, ni lectura general de `propietarios`. La búsqueda de servidor F3 tampoco revela nombres de titulares de
otro ámbito. La decisión, su prueba y lo pendiente de verificar en el motor real están en el informe del PR #19.

## 5. Contrato con el alta de inmueble (ya aplicado)

- El alta **sólo selecciona titulares que ya existen**: un principal y, opcionalmente, N
  titulares adicionales. No crea personas ni abre ningún subproceso.
- Si falta el titular, el alta muestra: **«Este titular todavía no existe. Créalo desde
  Propietarios/Titulares y después asígnalo a este inmueble.»**
- Se persiste primero el inmueble y **después** cada titularidad (lote atómico titularidad +
  índice `titularesIds`), porque las Rules de `titularidades` comprueban el ámbito sobre el
  inmueble ya guardado. Las titularidades nacen con porcentaje pendiente.
- Un PROPIETARIO ve en el selector su ficha **y todas las fichas de titular de su ámbito** (nunca las de otros). Su titular
  principal es siempre su ficha propia (las Rules de `inmuebles` exigen su `propietarioId`); los demás titulares se marcan como
  «Otros titulares del inmueble» (sin límite de número) o se añaden después desde «Titulares / Titularidades», eligiendo
  directamente entre los suyos o con la búsqueda de servidor, que sólo devuelve `{ id, nombre }` y excluye los titulares de
  otro ámbito.
- Los campos binarios heredados (`propietarioSecundarioId`, `datosFiscales.segundoPropietario`)
  se **derivan del primer titular adicional**, a partir de la ficha existente (nunca tecleados).

## 6. Legado que sigue vigente y plan de retirada

| Elemento | Estado hoy | Retirada prevista |
|---|---|---|
| Bloque «Segundo Propietario / Co-Arrendador» en la **edición** de inmueble | Se conserva (preserva datos ya guardados) | Sustituir por el panel de titularidades cuando exista la sección. |
| «Asignación manual / Personalizada» del arrendador principal en el alta | Se conserva (alta sin titular) | Exigir un titular existente cuando la sección permita crearlo en un paso. |
| Snapshot `datosFiscales.propietarioPrincipal/segundoPropietario` | Respaldo para contratos e informes | Cuando todo consumidor lea la ficha por id. |
| Inmuebles anteriores a N-TITULARES (sin `titularesIds` ni `titularidades`) | **Backfill sin ejecutar** (`src/lib/migracionTitularidades.ts` es un planificador en seco) | Ejecutar la migración tras un *dry-run* revisado. |
| Criterio «persona jurídica» en la edición (`prop.tipo`, campo inexistente: siempre `false`) | Defecto previo, fuera de alcance | Usar `tipoPropietario` (como `contratoEngine`) al unificar el formulario. |

## 7. Criterios de aceptación de la futura sección

1. Un titular se da de alta **una sola vez** con todos los datos de §2 y nunca se duplica por NIF.
2. Asignar un titular a un inmueble crea sólo la relación (`titularidades` + índice), no copia datos.
3. A → 1, 2, 3 y B → 1, 4 funciona sin duplicar personas y con aislamiento: B no ve 2 ni 3.
4. Liquidaciones, informes, exportaciones, documentos y fiscalidad leen los datos fiscales de la
   ficha del titular, no del inmueble.
5. La creación de fichas de terceros está decidida (PROPIETARIO, en su ámbito, sin límite) y protegida por Rules sin permisos globales.
6. No se borra histórico: cerrar una titularidad o dar de baja un inmueble conserva todo.
7. Ninguna vista cuenta inmuebles dados de baja como cartera operativa (`inmueblesOperativos`).

## 8. Alcance de las intervenciones

*Intervención original (ORDEN 4, PR #18):* no se construyó la sección, no se cambiaron Rules, no se modificaron
porcentajes de titularidad, no se ejecutó ningún backfill y no se borraron datos históricos.

*PR #19 (2026-10-01):* se construyó el acceso a la sección, se resolvió §4 (titulares en el ámbito del propietario, con cambio
acotado de Rules en `match /propietarios`) y se mantiene intacto lo demás: porcentajes de titularidad, N-TITULARES, `titularesIds`,
`titularidades`, histórico, sin backfill y sin borrar datos.
