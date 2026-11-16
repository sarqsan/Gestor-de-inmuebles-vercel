# AG-10 — Guardado automático del contrato

**Rama:** `arena/eaaeb98c-gestor-de-inmuebles-vercel`
**Base:** `main` @ `cdc9975` (producción)
**Estado:** PR abierta. **No fusionada, no desplegada.**

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
- **Persistencia:** `saveContratoFirestore`, sin cambios. **No se toca
  `firestore.rules`, ni datos, ni migraciones.**

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

**26 nuevas** en dos suites.

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
| Regresión completa | **332 archivos / 5.508 pruebas / 0 fallos** |
| `tsc --noEmit` | **0 errores** |
| `npm run build` | **OK** (19,0 s) |

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

## 7. Lo que queda fuera, y por qué

La auditoría sugiere «escribir los periodos nuevos mediante **transacción
(leer-modificar-escribir)**». **No lo he implementado**, y quiero ser explícito:

- La transacción exige leer el documento dentro de la propia transacción
  (`runTransaction`), es decir, tocar `saveContratoFirestore`, que es el punto de
  escritura compartido por **cinco** flujos (alta, edición, importación, cierre y
  este efecto). Cambiarlo afecta a todos.
- El encargo de este bloque prohíbe expresamente **cambiar reglas y permisos**, y
  pide «no alterar contratos ya existentes». Una transacción cambia el modelo de
  escritura de toda la aplicación, no solo de este efecto.
- Lo que **sí** he resuelto es la causa concreta del riesgo señalado —que una
  lectura vieja pise un pago reciente— mediante el descarte por obsolescencia y la
  firma tras confirmación.

Queda, por tanto, **PARCIALMENTE COMPLETADA** en este punto: el guardado automático
es fiable, observable y reintentable, pero la escritura sigue siendo `setDoc merge`
y no una transacción. Si se quiere cerrar del todo, es un bloque propio con su
propia revisión.
