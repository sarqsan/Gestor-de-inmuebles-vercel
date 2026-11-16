# AG-10 — Guardado automático del contrato

**Rama:** `arena/ae8cf389-gestor-de-inmuebles-vercel` (misma PR #89)
**Base:** `main` @ `cdc9975` (producción)
**Estado:** bloque **COMPLETO** (primera entrega + transacción). PR abierta:
**no fusionada, no desplegada**, pendiente de validación.

---

## 1. Diagnóstico

### Criterio original (auditoría global, S2 · prioridad 6)

> Guardado automático del contrato completo desde todos los clientes
> (`registroCobros[]` embebido, `setDoc merge` sin `await`): ventana de pérdida de
> actualización entre clientes simultáneos (titular + gestor) y escrituras
> denegadas para gestor L/inquilino con incidencia «contratos».
> · Corrección mínima: limitar el guardado automático a perfiles con permiso de
> escritura y escribir los periodos nuevos mediante transacción.
> · Verificación: prueba unitaria del efecto por perfil + prueba de concurrencia.

### Estado real en `main` (`cdc9975`): **PENDIENTE**

El efecto de materialización (`src/App.tsx`) hacía:

```js
cobrosEnsureRef.current.set(contrato.id, firma);   // 1. se marca ANTES
if (sincro.necesitaGuardado) {
  saveContratoFirestore(sincro.contratoActualizado);   // 2. SIN await
  setContratos((prev) => prev.map(...));               // 3. estado local SIEMPRE
}
```

Cuatro defectos concretos, todos vivos:

| # | Defecto | Consecuencia real |
|---|---|---|
| 1 | **Sin permiso**: se intentaba para todos los perfiles que veían el contrato | Inquilino y gestor de solo lectura → `permission-denied` en cada sesión e incidencia «contratos» |
| 2 | **Sin `await`** ni captura del rechazo | Fallo de red o denegación → promesa rechazada sin manejar y **estado en memoria actualizado con datos no persistidos** |
| 3 | **Firma marcada antes de escribir** | Tras un fallo, la firma ya estaba puesta → **no se reintentaba**. Los cobros aparecían materializados en pantalla y se perdían al recargar |
| 4 | **Sin estado visible** | El usuario no sabía si sus cambios estaban guardados |

**Sobre el punto 4 del encargo** (guardado automático fiable, recuperación tras
recarga, preservar datos al navegar, errores y reintentos, estado visible): el
efecto no tenía **ninguna** de esas garantías. No era un guardado automático: era
una escritura a ciegas.

---

## 2. Implementación

### Reutilización, no reinvención

- **Permisos:** ya existía `canWriteContrato` (`authService.ts`), el criterio único
  que usan Formalización y Cobros. **Se reutiliza.** Escribí primero un módulo
  propio con la misma lógica y **lo retiré al descubrirlo**: duplicar el criterio
  habría sido justo el «modelo paralelo» que el proyecto prohíbe.
- **Errores:** se reportan por `reportarErrorGuardado`, el canal de incidencias
  existente. No hay sistema de errores nuevo.
- **Persistencia:** `saveContratoFirestore` como única vía. En la primera entrega
  se dejó intacta; la sección 7 documenta cómo se convirtió en transaccional.
  **No se toca `firestore.rules`, ni datos, ni migraciones.**

### Mecanismo nuevo: `src/lib/guardadoContratoAutomatico.ts`

Envoltorio puro que aporta lo que faltaba:

- **`await` real y captura del error.** Cualquier error de red o permiso se
  reporta y **no** se declara guardado.
- **Reintentos** con espera creciente y tope configurable (por defecto 3).
- **Deduplicación**: mismo contenido en vuelo → no se lanza una segunda escritura.
- **Protección frente a sobrescrituras**: si llega contenido más reciente mientras
  hay un guardado en vuelo, el antiguo se descarta (`OBSOLETO`) en vez de competir
  por el documento. Es lo que evita que un `registroCobros` calculado desde una
  lectura vieja pise un pago registrado por otro cliente.
- **Estado observable** por contrato: `PENDIENTE` → `GUARDANDO` → `GUARDADO` /
  `ERROR` / `OBSOLETO`.
- **Huella estable** (`huellaContrato`), insensible al orden de claves, para que la
  deduplicación no dependa de cómo se construya el objeto.

### Conexión en `App.tsx`

- Se exige `canWriteContrato` **antes** de intentar escribir.
- La firma de idempotencia **solo se marca cuando la escritura confirma**. En
  `ERROR` queda sin marcar, de modo que el siguiente render **reintenta solo**.
- `setContratos` se ejecuta únicamente en el camino de éxito: nunca más un estado
  local que refleje algo que no está en Firestore.
- Los reintentos se apoyan en el estado del gestor (`useRef`), que sobrevive a los
  re-renderizados.

### Visibilidad para el usuario

`FormalizacionSection` recibe `estadoGuardado` y muestra dos avisos accesibles:

- **«Guardando cambios…»** (`role="status"`, `aria-live="polite"`) con el número de
  contratos pendientes.
- **«No se pudo guardar»** (`role="alert"`) cuando se agotan los reintentos,
  indicando que los cambios siguen en pantalla y que se reintentará.

El guardado correcto no genera aviso permanente: solo se avisa de lo que el usuario
necesita saber.

---

## 3. Pruebas

**26 nuevas** en dos suites (primera entrega; la sección 8 añade 50 más).

### `src/lib/guardadoContratoAutomatico.test.ts` — 14

| Escenario exigido | Cobertura |
|---|---|
| Guardado automático | Se guarda, se notifica `GUARDANDO`→`GUARDADO` y se confirma |
| Errores de conexión y reintentos | Fallo + reintento que acaba guardando; error reportado, no tragado |
| Agotamiento de reintentos | `ERROR` visible, 3 intentos, **nunca se notifica GUARDADO** |
| Espera creciente | `[100, 200, 300]` |
| Prevención de duplicados | Mismo contenido en vuelo → una sola escritura |
| Protección frente a sobrescrituras | Contenido más reciente descarta el antiguo como `OBSOLETO` |
| Cambios rápidos consecutivos | v1→v2→v3, persiste el último |
| Aislamiento | Dos contratos no se bloquean |
| Sin permiso | No se intenta guardar |
| Huella | Estable ante orden de claves, cambia si cambia el importe, ignora `undefined` |

### `src/lib/guardadoContratoPermisos.test.ts` — 12

Por perfil: titular escribe; **inquilino no**; **profesional no**; otro propietario
no; gestor con `carterasE` sí; profesional sin cartera no; delegación parcial solo
su inmueble; sin usuario no.

Y cuatro guardas sobre el **código real** de `App.tsx`: permiso antes de escribir,
persistencia vía gestor, firma no marcada antes de confirmar, estado local solo en
éxito.

### Prueba de mutación

Eliminé la comprobación de permiso del efecto y **1 prueba falló**, confirmando que
la guarda detecta el defecto. Después restauré el código.

### Un error de tipos que corregí

La primera versión de la prueba usaba `tipoPerfil: 'GESTOR'`, que **no existe**
(`ADMINISTRADOR | PROPIETARIO | PROFESIONAL | INQUILINO`). `tsc` lo detectó con 3
errores. Un gestor es un `PROFESIONAL` cuya escritura la concede `carterasE`; la
prueba se corrigió a ese modelo real. **No habría llegado a producción con tipos
rotos, pero sí habría dejado un informe que describía un perfil inexistente.**

---

## 4. Resultados

| Comprobación | Resultado |
|---|---|
| Pruebas específicas AG-10 | **26/26** |
| Regresión completa | **332 archivos / 5.508 pruebas / 0 fallos** (primera entrega) |
| `tsc --noEmit` | **0 errores** |
| `npm run build` | **OK** |

---

## 5. Archivos

| Archivo | Cambio |
|---|---|
| `src/lib/guardadoContratoAutomatico.ts` | **nuevo** — gestor con reintentos, deduplicación y estado |
| `src/lib/guardadoContratoAutomatico.test.ts` | **nuevo** — 14 pruebas |
| `src/lib/guardadoContratoPermisos.test.ts` | **nuevo** — 12 pruebas por perfil + guardas |
| `src/App.tsx` | efecto de materialización: permiso, `await`, firma tras confirmar, estado |
| `src/components/sections/FormalizacionSection.tsx` | prop `estadoGuardado` + dos avisos accesibles |
| `docs/ag10/INFORME-AG10.md` | este informe |

## 6. Límites respetados

- **Sin cambios** en `firestore.rules`, `storage.rules`, `src/types.ts`, datos ni
  migraciones. Tampoco en el esquema de `contratos_formalizacion`.
- **AG-08 y AG-11 no se han tocado.**
- No se alteran contratos existentes ni documentos históricos: el cambio afecta a
  *cuándo* y *cómo* se intenta la escritura, no a su contenido.
- Un solo bloque, una sola PR.

## 7. Transacción del contrato (cierre de AG-10)

### El defecto que quedaba vivo

La primera entrega resolvía el *efecto* (permiso, `await`, firma tras confirmar,
estado visible, descarte por obsolescencia) pero **no la escritura**: seguía siendo
`getDoc` + `setDoc(merge)` del contrato **completo**.

`registroCobros` viaja **embebido** en `contratos_formalizacion`, y en Firestore una
lista es un campo indivisible. Por tanto, `merge: true` no protege nada: cada
cliente escribía *su* copia del calendario y la última pisaba:

- un pago registrado por otro cliente (`importeRecibido`, `fechaPago`, `justificante`,
  estado `RECIBIDO`/`VERIFICADO`),
- una incidencia manual,
- un periodo materializado en paralelo,
- una firma ya estampada,
- los índices `incidenciaIds`/`mensajeIds` que el inquilino añade por `arrayUnion`.

Y envolver esa escritura en `runTransaction` **no habría arreglado nada**: una
transacción confirma su contenido con aislamiento desde su propia lectura; si la
lectura base es vieja, la pérdida se confirma igual. La transacción sólo sirve si
el **contenido a escribir se decide dentro** de ella.

### La transacción implementada

**`src/lib/contratoTransaccion.ts`** (nuevo, puro —no importa Firebase—) contiene la
política de datos; **`saveContratoFirestore`** (`src/lib/firebase.ts`) la ejecuta
dentro de `runTransaction`:

1. **Lee el estado persistido dentro de la transacción** (`tx.get(refC)`). Si el
   documento cambia entre la lectura y el commit, Firestore aborta y reejecuta; el
   bucle externo añade además reintento acotado para `aborted`,
   `failed-precondition` y `unavailable`. `permission-denied` **no se reintenta**.
2. **Sólo viajan los periodos declarados** (`periodos: EscrituraPeriodo[]`). Los
   flujos ya no reenvían el array del contrato en memoria.
3. **Cada escritura se resuelve contra lo persistido**, con dos políticas:
   - `descartar` (materialización automática): si el periodo cambió desde la
     lectura base, **se conserva el persistido**. Un pago nunca se degrada a
     `RETRASADO`.
   - `reintentar` (pago/incidencia del usuario, edición, importación): se aplica
     **la intención** del usuario —sólo los campos que cambió— sobre el periodo
     fresco, y el historial se **une por id**. No se pierde ni el cambio del
     usuario ni el pago del otro cliente.
4. **Los periodos no declarados se conservan** tal y como estén persistidos.
5. **Campos monotónicos protegidos**: una instantánea vieja no puede desmarcar una
   firma (salvo que el usuario la hubiera visto y la retire), quitar una entrada de
   historial ni recortar `incidenciaIds`/`mensajeIds` (se omiten del payload; su
   vía es `arrayUnion`).
6. **Idempotencia real**: si la fusión no cambia nada, la transacción **no escribe**
   (`hayCambios: false`, `escrito: false`). Reintentar no genera commits vacíos ni
   duplicados.
7. **Integridad**: se mantienen las validaciones de inmueble/habitación inmutables,
   ahora evaluadas contra el estado real dentro de la transacción, y se rechaza un
   periodo que pertenezca a otro contrato.

### Cómo quedan los cinco flujos

| Flujo | Punto de escritura | Política |
|---|---|---|
| **Alta** | `App.handleSaveContrato` | `CREAR_SOLO_NUEVOS`: crea los periodos que falten; nunca pisa historia. `existe: false` impide dar de alta dos veces el mismo id |
| **Edición** | `App.handleSaveContrato` (con lectura base) | `FUSIONAR` + `reintentar` sobre la **diferencia** de periodos (`escriturasPorDiferencia`) |
| **Importación** | `importExportFirebase.anexarCobro` | declara **sólo el cobro importado**; idempotente por id y sin borrar pagos |
| **Cierre** | `persistirTransicionAlquilerFirestore` + `handleSaveContratosBatch` | `CONSERVAR` en la transición de alquiler; `reintentar` por diferencia en la conciliación de Tesorería |
| **Materialización automática** | `materializarPeriodosCobroFirestore` | `descartar` por diferencia: sólo crea/actualiza lo que el cálculo cambia |

Los cuatro primeros conservan su comportamiento legítimo (la ficha completa se
sigue guardando); lo que cambia es que el **calendario** ya no se reenvía a ciegas.

### Documentos devueltos a la interfaz

`saveContratoFirestore` devuelve el **documento persistido**, no la instantánea del
cliente. La pantalla incorpora inmediatamente los pagos que otro cliente escribió
mientras tanto, en lugar de esperar al siguiente snapshot.

## 8. Pruebas añadidas en esta entrega

**50 nuevas** (además de las 26 de la primera entrega, que se conservan intactas).

| Suite | Pruebas | Qué fija |
|---|---|---|
| `tests/ag10/contrato-transaccion.test.ts` | 22 | Concurrencia **real** sobre `saveContratoFirestore` con un Firestore en memoria de control de versión optimista (`tests/ag10/bancoFirestore.ts`): dos modificaciones simultáneas, pago mientras se materializa, conflicto que obliga a reejecutar, reintento sin duplicidades, `permission-denied` sin reintento, integridad de los cinco flujos y conservación de datos económicos |
| `tests/ag10/contrato-transaccion.puro.test.ts` | 18 | Política de datos sin Firebase: clasificación de periodos, `descartar` vs `reintentar`, fusión del documento, firmas monotónicas, unión de historial, detección de cambio concurrente, idempotencia |
| `tests/ag10/guardia-flujos.test.ts` | 10 | Guardia sobre el **código real**: `runTransaction` + lectura dentro de la transacción en `saveContratoFirestore`; los cinco flujos declaran base/períodos; el núcleo no importa Firebase; se conservan permiso, gestor de reintentos y firma tras confirmar |

El banco de pruebas **no imita** la transacción: ejecuta el código real y aborta con
`aborted` cuando un documento cambia entre la lectura y el commit, como el SDK.

## 9. Resultados

| Comprobación | Resultado |
|---|---|
| Pruebas específicas AG-10 | **76/76** (26 previas + 50 nuevas) |
| Regresión completa | **335 archivos / 5.558 pruebas / 0 fallos** |
| `tsc --noEmit` | **0 errores** |
| `npm run build` | **OK** |
| Emulador de reglas | **No ejecutado**: el entorno no tiene JRE. No se toca `firestore.rules` |

## 10. Límites respetados

- **Sin cambios** en `firestore.rules`, `storage.rules`, `src/types.ts`, datos ni
  migraciones. El esquema de `contratos_formalizacion` no cambia: la transacción
  escribe los mismos campos.
- **AG-08 y AG-11 no se han tocado.**
- Se conservan las 26 pruebas anteriores, `canWriteContrato`, los reintentos, la
  deduplicación, el descarte de operaciones obsoletas, la confirmación de
  persistencia antes de marcar la firma y los indicadores visibles de guardado y
  error.
- Una sola rama y una sola PR (#89). **No fusionada, no desplegada.**

## 11. Riesgos residuales conocidos

- **El SDK ya no garantiza la transacción sin conexión.** Firestore reintenta las
  transacciones al recuperar la red, pero una transacción de larga duración falla en
  lugar de encolarse como un `setDoc`. Por eso el gestor de guardado reintenta con
  espera creciente y el estado queda en `ERROR` visible (sin marcar la firma), en
  lugar de dar por bueno un estado no persistido. Es el intercambio correcto:
  antes se perdía el pago, ahora se ve el fallo y se reintenta.
- La fusión protege el **contenido** de los periodos; no intenta resolver
  conflictos semánticos entre dos pagos distintos del mismo mes registrados a la
  vez: gana la intención del último en confirmar y el historial conserva ambas
  entradas de trazabilidad.
