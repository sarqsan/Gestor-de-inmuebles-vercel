# Estabilización del Portal del Propietario, lecturas denegadas y alta de inmueble

Fecha: 2026-10-01 · Base: `origin/main` = `21afea4d45271070bee29f93aa9f1c6237834c10` (merge del PR #16,
ya fusionado: no se ha portado nada de él ni se depende de él).

Alcance: una única intervención con tres frentes (contador, lecturas denegadas, alta de inmueble).
No se ha tocado N-TITULARES (modelo ni reparto), la baja patrimonial ya integrada, ni `firestore.rules`.

## 1. Contador de viviendas

**Diagnóstico.** El Portal ya calculaba sus viviendas con `inmueblesOperativos`
(`src/utils/bajaPatrimonialInmueble.ts`) desde el PR #16: la cabecera «Viviendas en cartera», la
pestaña, el título de la lista, la lista y el perfil salen del mismo conjunto
(`PropietarioPortalSection.tsx`, `misViviendas = inmueblesOperativos(todasMisViviendas)`). Sólo los
ids de contratos, gastos e incidencias usan el conjunto completo, a propósito (el histórico económico
no se pierde). **Hasta ahora no había ningún test de render del Portal con una baja**: se añade.

El contador que sí seguía sumando bajas era el de **Administración · Propietarios**
(«Inmuebles en Gestión», tabla y ficha, `AdminControlCenter.tsx`): contaba todos los inmuebles del
propietario mientras que «Ver Inmuebles» (su enlace) lista sólo la cartera operativa, es decir, el mismo
síntoma de «desaparece del listado pero sigue contando».

**Corrección.** Ambos puntos usan `carteraOperativa` (= `inmueblesOperativos(inmuebles)`, ya calculado
en el componente). No hay ningún filtro nuevo. `SIN_EXPLOTACION` sigue sin ser una baja y la baja no
borra nada (el histórico patrimonial la conserva).

Resultado verificado: 2 activas + 1 histórica → 2; 0 activas + 1 histórica → 0; 1 activa con
`SIN_EXPLOTACION` → 1.

Auditoría de contadores residuales: `PropietariosSection` recibe `inmueblesCarteraOperativa` (correcto);
`AdministracionSection` no se monta en ninguna parte; los tres montajes del Portal reciben
`scopedInmuebles` y el Portal filtra con la utilidad común.

## 2. Lecturas denegadas

El texto «Lectura · {etiqueta}: No tienes permisos para consultar estos datos…» es una línea del aviso
`AvisoIncidenciasDatos` (`reportarErrorLectura(origen, error)` → `permission-denied`). La etiqueta
«Carteras» es la de `gestiones_cartera`; «titularidades» salía como clave técnica porque no tenía etiqueta
(se añade «Titularidades»).

| | **«Lectura · titularidades»** | **«Lectura · Carteras»** |
|---|---|---|
| Componente | `PropietarioPortalSection` (efecto de montaje) | `App` (efecto ROADMAP-04, `App.tsx`) |
| Función | `subscribeTitularidadesEscopo` (`src/lib/titularidadesFirestore.ts`) | `subscribeGestionesCarteraGestor` (`src/lib/firebase.ts`) |
| Consulta | un `onSnapshot(doc('titularidades/{inmuebleId}__{propietarioId}'))` por clave | `onSnapshot(query('gestiones_cartera', where('gestorUsuarioId','==', currentUser.id)))` |
| Usuario | PROPIETARIO (aterriza en el Portal al iniciar sesión) | todo PROPIETARIO y PROFESIONAL |
| Momento | al montar el Portal y **cada vez que cambia el conjunto de viviendas** (p. ej. justo tras dar de alta un inmueble) | al fijarse `currentUser`, nada más iniciar sesión |
| Motivo de la consulta | mostrar los titulares de cada vivienda | localizar delegaciones **parciales** donde la persona es gestora (única fuente: el espejo sólo lleva carteras completas) |
| ¿Depende del alta? | **Sí, indirectamente** (ver abajo) | **No** |

### Titularidades — causa demostrada

El `get` de `titularidades/{id}` evalúa `resource.data` en su regla; si el documento **no existe**,
`resource` es `null`, la regla falla y Firestore responde `permission-denied`. El Portal pedía, además de
las claves del índice `titularesIds`, **claves hipotéticas**: `propietarioId`, `propietarioPrincipalId` y
el propietario actual de cada vivienda. Un inmueble anterior a N-TITULARES (el backfill no se ha
ejecutado) o **recién creado en el alta** (que nunca escribía el índice ni las titularidades) no tiene esos
documentos: cada clave inexistente producía una denegación y el aviso. Además se leían viviendas
autorizadas sólo por `inmuebleIds`, cuyas titularidades las Rules no sirven, y la suscripción dependía de
los ids de vivienda y no del índice (un titular recién añadido no se escuchaba hasta remontar).

**Corrección: se elimina la lectura innecesaria.** No se amplía ningún permiso ni se silencia el error:

- las claves salen **sólo del índice** `titularesIds` (`clavesTitularidadesIndexadas`);
- sólo se leen viviendas cuyas titularidades sirven las Rules al usuario (titular canónico o cotitular
  indexado: `puedeLeerTitularidadesDe`, espejo de `puedoLeerTitularidadDe`);
- la suscripción depende de las **claves** (se escucha el titular recién añadido);
- el alta de inmueble escribe ahora sus titularidades (§3), de modo que el índice nunca apunta a un
  documento inexistente.

Una clave indexada que falle sigue reportándose: es un fallo real.

### Carteras — qué se sabe y qué no

La consulta no tiene relación con el alta ni con crear propietarios. Por análisis estático de
`firestore.rules` (`allow list` de `gestiones_cartera` → `gestionInvolucraAMi`), la consulta
`where gestorUsuarioId == uid` queda autorizada cuando el perfil es veraz (`perfilActualVeraz()`), y es
**necesaria** para los gestores con delegaciones parciales: no se elimina. **No se ha demostrado ninguna
lectura legítima bloqueada, así que no se toca ninguna regla.**

La causa concreta de la denegación observada **no se puede determinar offline**: el emulador de Firestore
no es ejecutable en este entorno (sin Java; `storage.googleapis.com` inaccesible), igual que dejaron
documentado `ROADMAP-02` y `DICTAMEN-PRE-MERGE-FINAL`. Causas candidatas, por orden de comprobación:

1. Las reglas **desplegadas** en Firebase no coinciden con las del repositorio (se despliegan a mano:
   `firebase.json`, sin CI).
2. La cuenta afectada no tenía en ese instante perfil/espejo veraz (`usuarios_auth` ↔ `usuarios`).
3. Una limitación del planificador de consultas con la rama `OR` de la regla (no verificable sin emulador).

Mejora de diagnóstico, sin ocultar nada: el log técnico ahora incluye el `gestorUsuarioId` consultado.

> **Actualización (Orden 2).** La auditoría completa, la matriz *consulta → usuario → regla → resultado*, la
> instrumentación `[diag:carteras]` y la prueba concreta en Firebase real están en
> `DIAGNOSTICO_LECTURA_CARTERAS_2026-10-01.md`. Resultado: **B** (la causa de la denegación depende del
> Firebase publicado; el repositorio autoriza la consulta). Se corrigió además que «Reintentar lectura» no
> reintentaba Carteras, y se halló que el proyecto de la app (`gestor-inmuebles-produccion`) no es el que
> nombran las instrucciones de publicación de reglas (`startup-sanctuary-sln7n`).

## 3. Alta de inmueble

**Antes.** «Nuevo inmueble» ofrecía «Inmueble con Segundo Propietario / Co-Arrendador», con selector de
propietario registrado **y campos para teclear a una segunda persona** (nombre, NIF, dirección, teléfono,
email) que acababan como instantánea en `datosFiscales.segundoPropietario`. Modelo binario, personas
embebidas en el inmueble y sin `titularesIds` ni `titularidades`.

**Ahora** (`InmueblesSection`, `src/lib/altaInmuebleTitulares.ts`, `App.handleAddInmueble`):

- Se retira por completo el flujo de segundo propietario tecleado del alta (estado, manejador y UI).
- El alta **sólo selecciona titulares existentes**: un principal y N titulares adicionales (casillas).
  No crea personas ni abre ningún subproceso.
- Si falta el titular, muestra: «Este titular todavía no existe. Créalo desde Propietarios/Titulares y
  después asígnalo a este inmueble.»
- Persistencia: primero el inmueble y, **cuando está guardado**, cada titularidad
  `titularidades/{inmuebleId}__{propietarioId}` + índice `titularesIds` en lote atómico
  (`guardarTitularidad`). Orden obligado por las Rules de `titularidades`, que comprueban el ámbito sobre
  el inmueble ya guardado. Las titularidades nacen **pendientes**: no se asume ningún porcentaje.
- Los campos binarios heredados que aún consumen contratos e informes (`propietarioSecundarioId`,
  `datosFiscales.segundoPropietario`) se derivan del **primer titular adicional**, a partir de la ficha
  existente; nunca se teclean.
- La **edición** de inmueble no se toca (conserva sus datos heredados).

## 4. Firestore Rules

**No se ha modificado `firestore.rules`** (ni `storage.rules` ni los índices). Ninguna lectura legítima
resultó bloqueada: las denegadas de titularidades eran sondeos de documentos inexistentes (innecesarios) y
la de Carteras no es atribuible a las reglas del repositorio. Sigue prohibido: `list` de `titularidades`,
borrado de titularidades y gestiones, y cualquier lectura de titularidades o carteras fuera del ámbito del
titular, su cotitular, el gestor designado o la administración. Aislamiento A/B intacto. Cubierto por tests.

## 5. Validación

| Comprobación | Base (`21afea4`) | Tras los cambios |
|---|---|---|
| `npx tsc --noEmit` | exit 0 | exit 0 |
| `npm run lint` (= `tsc --noEmit`; no hay ESLint en el repositorio) | — | exit 0 |
| `npm run build` | exit 0 | exit 0 (aviso conocido de chunks > 500 kB) |
| `npx vitest run` | 166 archivos · 3035 aprobados · 2 omitidos | **170 archivos · 3089 aprobados · 2 omitidos** · 0 fallos |
| Suites específicas (Portal, baja patrimonial, N-TITULARES, titularidades, Carteras, alta) | — | 27 archivos · 376 tests · 0 fallos |
| `git diff --check` | — | limpio |

Los 54 tests nuevos (3035 → 3089) son: 11 (Portal) + 5 (Administración) + 14 (lecturas acotadas) +
21 (alta con titulares existentes) + 2 (F2) + 1 (etiquetas). Se comprobó por mutación que los de
contador y de lecturas **fallan con el código anterior** y pasan con la corrección.

Suites nuevas o ajustadas:

| Fichero | Qué cubre |
|---|---|
| `tests/portal-contador-viviendas-baja.test.tsx` | A, B, C, H (Portal real) |
| `tests/admin-propietarios-contador-baja.test.tsx` | contador residual de Administración |
| `tests/titularidades-lecturas-acotadas.test.tsx` | qué lee y qué no lee el Portal; Rules no abiertas |
| `tests/alta-inmueble-titulares-existentes.test.tsx` | D, E, F, G |
| `tests/f2-acceso-titularidades.test.ts` | contrato de claves sólo del índice |
| `src/components/sections/altaInmueblePropietario.test.tsx` | test B adaptado al alta con titulares existentes |
| `src/estadoDatos/canalIncidencias.test.ts` | etiquetas legibles de origen |

## 6. Pendiente / fuera de alcance

- Sección «Propietarios / Titulares»: sólo documentada (`docs/propietarios-titulares-seccion-futura.md`).
- Backfill de `titularesIds` y `titularidades` de inmuebles anteriores a N-TITULARES (planificador en seco).
- Validar con emulador `list gestiones_cartera` (Java + descarga de binarios en CI) y comprobar que las
  reglas desplegadas coinciden con las del repositorio.
- Defecto previo observado en la edición: el criterio «persona jurídica» usa `prop.tipo` (campo
  inexistente) y siempre da `false`; no se toca aquí.
