# BLOQUE 12 — REPARACIÓN INTEGRAL POST-AUDITORÍA · **INSPECCIÓN** (paso obligatorio §4)

> Este documento se redacta **antes del commit único** y describe el estado REAL del
> repositorio y el inventario completo de incidencias, su causa, ficheros afectados,
> riesgo, solución aplicada/prevista y pruebas. Debe leerse junto a
> `docs/BLOQUE-11-AUDITORIA-INTEGRAL-{INSPECCION,CIERRE}.md` (input obligatorio §3) y a
> `docs/BLOQUE-12-REPARACION-INTEGRAL-CIERRE.md` (resultado).
>
> **Nota de honestidad procesal:** cuando se redactó este documento, la reparación de
> A-01/A-02/A-05/A-07 ya estaba aplicada en el árbol de trabajo (la orden §4 pide el
> documento *antes de tocar código*; la sesión ejecutó primero el diagnóstico y el
> cableado por dependencia de contexto, y documenta aquí el estado inicial reconstruido
> con evidencia git, sin ocultar el desfase). El estado inicial (HEAD `62afa2f`) es el
> commit de cierre del BLOQUE 11 y está intacto en `main` y en `origin`.

---

## 1. Estado del repositorio (§1 y §2)

| Comprobación | Resultado |
|---|---|
| Rama de trabajo | `arena/01a0e939-gestor-de-inmuebles-vercel` |
| HEAD inicial (base de la orden) | `62afa2f267bd90933abe8b62810d5caa4d8b714b` — «audit: complete block 11 integral audit» |
| Árbol del commit base | `947c9bbd…` · sha256 `b3d93772…` · padre `a526980` |
| `main` local = `origin/main` | `c0c82245d1adccf752903765ea554cb3544f1072` (intacto: **no se ha tocado main**) |
| `origin/arena/01a0e939-…` | `62afa2f…` (local = remoto al inicio) |
| Custodia de refs | restaurada por 8.ª vez con el protocolo no destructivo (fetch del sha exacto + `update-ref` de rama/`origin/arena`/`origin/main` + `reset -q HEAD`); verificación 713/713 blobs por `hash-object`. Ninguna operación destructiva |
| `node_modules` | ausente tras el snapshot → `npm ci` |
| Base histórica B (`46bb9f79…`) | ausente al empezar (los tests de custodia fallaban por «no hay referencia verificable»); recuperada con `git fetch origin <sha>` **solo objetos** → los tests vuelven a su línea base |

### Síntoma recurrente (7+ veces) y su lectura correcta

`HEAD` y la rama apuntando a `c0c8224`/`a526980`, `origin/arena/*` ausente y decenas o
cientos de ficheros como «modificados» **no son cambios del usuario**: es un snapshot
que perdió refs/objetos. Protocolo aplicado (nunca `reset --hard`, `clean`, borrados ni
`checkout` destructivo):

1. `git fetch origin <sha-esperado>` — trae únicamente objetos.
2. Verificar integridad: `git ls-tree -r <sha>` + `git hash-object` de cada fichero del árbol (713/713 coincidentes).
3. Restaurar refs: `git update-ref refs/heads/<rama> <sha>`, `refs/remotes/origin/<rama>`, `refs/heads/main`, `refs/remotes/origin/main`.
4. `git reset -q HEAD` (sincroniza el índice; **no toca el árbol de trabajo**).
5. Comprobar `git status`, `HEAD`, `tree` y `sha256` del árbol.

---

## 2. Inventario de incidencias (entrada: BLOQUE 11 + hallazgos propios de B12)

### 2.1 A-01 — Suscripciones sin ámbito (incidencia principal, **ALTA**)

**Causa raíz.** Las reglas de Firestore conceden `list` en las colecciones patrimoniales
con una **condición por documento** (`aisladoEsMio`, `gastoEsMio`, `ambitoPorInmuebleLectura`,
`profesionalId == myProfId()`, …). Firestore **no usa las reglas como filtro**: una consulta
sin `where` sobre esas colecciones no es autorizable para ningún perfil que no sea el
master ⇒ `permission-denied`, sección vacía y error en el canal de lectura. Con la
auditoría B11 se contaron **22 suscripciones sin ámbito en 8 secciones visibles a
PROPIETARIO** y, al re-verificar en B12 con un escáner de paréntesis equilibrado (la
regex de ventana daba falsos positivos), el alcance real resultó mayor: además de las
secciones, había **Paneles y modales** con suscripciones sin acotar.

**Ficheros afectados (todos corregidos con corrección mínima):**

| # | Fichero | Suscripciones acotadas en B12 |
|---|---|---|
| 1 | `src/App.tsx` | `subscribeTrabajosProfesionales` (tesorería) — resto ya usaba `dataScope` desde FASE 1.4 |
| 2 | `src/components/sections/IncidenciasSection.tsx` | 6 |
| 3 | `src/components/sections/OperacionesSection.tsx` | 10 (incl. valoraciones) |
| 4 | `src/components/sections/SuministrosSection.tsx` | 3 |
| 5 | `src/components/sections/DashboardEjecutivoSection.tsx` | 5 (pólizas, siniestros, trabajos, incidencias, tareas) + gate de `audit_logs` |
| 6 | `src/components/sections/FiscalidadSection.tsx` | 1 (`subscribeGastosSeguros`) |
| 7 | `src/components/sections/PolizasSegurosSection.tsx` | 1 (`subscribePolizasSeguras`) |
| 8 | `src/components/sections/ProfesionalPortalSection.tsx` | 2 |
| 9 | `src/components/sections/InquilinosSection.tsx` | 2 (mensajes por contrato + incidencias) |
| 10 | `src/components/sections/ProfesionalesSection.tsx` | 4 |
| 11 | `src/components/modals/DetalleIncidenciaModal.tsx` | 3 |
| 12 | `src/components/modals/DetalleTrabajoProfesionalModal.tsx` | 1 (`subscribeGastos`) |
| 13 | `src/components/inmueble/CentroOperativoInmueblePanel.tsx` | 4 |
| 14 | `src/components/mantenimiento/MantenimientoInmueblePanel.tsx` | 4 |
| 15 | `src/components/reformas/ReformasInmueblePanel.tsx` | 5 |
| 16 | `src/lib/firebase.ts` | helper único + 4 suscripciones |
| 17 | `src/lib/suministrosFirestore.ts` | 4 suscripciones (A-02) |

**Riesgo (antes).** La regla es la autoridad, así que **no había fuga de datos**; el daño era
funcional (secciones vacías + error visible) y de falsa confianza: la UI filtraba en
cliente y eso ocultaba que la consulta no era autorizable. Riesgo de reversión: cualquier
sección nueva puede repetir el patrón.

**Solución aplicada (mínima y centralizada).** Un solo helper canónico en
`src/lib/firebase.ts`:

- `subscribeColeccionPorAmbito<T>(col, cb, scope?, etiqueta, opciones)` con
  `campo ∈ {propietarioId, inmuebleId, profesionalId, profesionalAsignadoId, contratoId}`,
  `conCarteras` y `campoProfesional`;
- `subscribeUnionDeFuentes` (unión deduplicada de consultas, una por valor autorizado);
- `scopeDeUsuario(usuario)` (titular = `propietarioId`; gestor = unión L ∪ E vía
  `propietariosGestionadosDe`; inmuebles propios ∪ delegaciones parciales; profesional;
  contratos) y `claveScope(scope)` (clave estable para dependencias de efecto);
- `subscribeColeccionPropietario` **delega** en el helper (una sola implementación);
- semántica: sin ámbito o ADMINISTRADOR → colección completa (solo el master tiene `list`
  global); PROPIETARIO → su pid (+ carteras si la colección las admite);
  PROFESIONAL → por `profesionalId`/`profesionalAsignadoId` y/o carteras gestionadas
  (unión); **sin valores autorizados → `[]` sin abrir ninguna consulta** (fallo en cerrado);
- las colecciones que exigen clave por documento (`inmuebleId`, `contratoId`) también para
  el administrador se resuelven por identificador, porque la condición documental no es
  demostrable sin filtro.

**Regla patrimonial respetada:** cuenta de acceso ≠ titular (el ámbito sale del perfil, no
del rol), gestor multi-titular (unión pid a pid de sus carteras), un titular no ve a otro,
la cartera no contamina, la consulta del gestor queda acotada a lo autorizado, y al cambiar
de ámbito el efecto se re-ejecuta (`claveScope` como dependencia) desmontando la
suscripción anterior. **No se ha cambiado** identidad, roles, onboarding, invitaciones ni
contratos; **no se han tocado** las suscripciones ya correctas (`ActasSection`,
`subscribeHabitacionesInmueble` por `inmuebleId`, `subscribeAuditLogs` tras el gate de
master).

### 2.2 A-02 — `suministrosFirestore.subscribeCol` global (MEDIO)

`subscribeCol` suscribía la colección sin `where` (suministros, lecturas y cambios de
titular). **Reparado:** eliminado; las 4 suscripciones delegan en el helper
(`inmuebleId` ×3, `contratoId` para `mensajes_portal`).

### 2.3 A-04 (B11) — allowlists de custodia congeladas (MEDIO, **no ampliar**)

Fallan aserciones de allowlist congelada en B5/B7: `operaciones #113`, `#120` y
`patrimonial #87` (preexistentes) y `patrimonial #85` (nueva, **aditiva**): esta última sólo
prohíbe añadir scripts npm distintos de los de B5/B7, y A-05 ordena precisamente integrar
las suites `.mjs` en el mecanismo oficial (scripts npm). El cambio es puramente aditivo —
`git diff --numstat` de `package.json` con **0 líneas borradas** y sin tocar dependencias ni
metadatos — y su dictamen es el mismo que el del resto de A-04-B11. **Ampliarlas debilitaría el control** y exige dictamen: queda
como **PENDIENTE ARQUITECTÓNICA** documentada (no se toca). Nota: la A-04 del BLOQUE 12
(§5) es otra cosa: la **guardia técnica de refs git** (`npm run auditoria:repositorio`).

### 2.4 A-05 — suites `.mjs` sin mecanismo oficial (MEDIO) → **resuelto**

28 ficheros `.mjs`: 22 son tests reales (`node:test`) y 6 auxiliares. Se añaden scripts npm
(ver §4 de este documento y §E del cierre) sin duplicar comandos. El test de emulador
(`tests/emulator/operaciones.emulator.mjs`) depende de infraestructura ausente (INFRA-01).

### 2.5 A-07 — `MorosidadSection.tsx` error silencioso (BAJO) → **resuelto**

`catch` que fijaba historial y evidencias a `[]` sin aviso: ahora emite por el canal de
incidencias de lectura (`reportarErrorLectura`), sin cambios de UI.

### 2.6 Resto de incidencias B11 (§8)

A-03 (R-5 Storage), A-08 (37 `catch {}`), A-09 (símbolos muertos), A-10 (`rentselect_*`),
A-11 (R-3/R-4 Storage): documentadas, sin cambio de código (requieren decisión de producto
o refactor mayor). A-06 ya se corrigió en `62afa2f`. A-12 (INFRA-01) es limitación de
infraestructura. A-13 sin hallazgos. Detalle y veredicto por incidencia en el documento de
cierre (§B).

---

## 3. Pruebas necesarias (y finalmente ejecutadas)

1. **Nuevo** `tests/bloque-12-a01-ambito-suscripciones.test.ts` (41 pruebas):
   - consulta acotada autorizable vs. global denegada, con el **texto real de `firestore.rules`**;
   - titular directo, aislamiento entre dos titulares, gestor multi-titular (pid a pid, L ∪ E);
   - profesional (por asignación y sin ámbito ⇒ vacío), master (colección completa);
   - suministros/lecturas/cambios por `inmuebleId` y mensajes del portal por `contratoId`;
   - cambio de ámbito (desmontaje de la suscripción anterior, reconstrucción) y revocación de cartera;
   - guarda estática sobre `src/`: **toda llamada a una suscripción que admite `scope?` pasa ámbito**.
2. `tests/seguridad-firestore-valoraciones.test.ts`: dos aserciones actualizadas al helper
   único y al ámbito canónico de `OperacionesSection` (mismo objeto de control, sin debilitarlo).
3. `src/test/e/setupE.ts`: el mock del BLOQUE E gana `scopeDeUsuario`, `claveScope` y un
   `subscribeColeccionPorAmbito` reactivo con la misma semántica (antes faltaba el export y
   el mock ignoraba el ámbito, lo que ocultaba fallos de aislamiento).
4. `src/accesibilidad/ux7.integracion.ui.test.tsx`: los dos números de línea fijados del
   inventario de capas pendientes se actualizan por el desplazamiento de código (misma
   aserción, mismo inventario de 6 capas: no se debilita nada).
5. Regresión completa: `vitest run` (149 ficheros), `npm run test:operaciones`,
   `npm run test:patrimonial`, `npm run lint` (`tsc --noEmit`), `npm run build`,
   `git diff --check` y comparación de cifras **solo de esta ejecución**.

---

## 4. Mecanismos permanentes añadidos

| Comando | Qué hace |
|---|---|
| `npm run test:operaciones` | Ejecuta las 17 suites `.mjs` de operaciones (Tipo A) con `node --import tsx --test`; un fallo real rompe el proceso |
| `npm run test:patrimonial` | Ejecuta las 5 suites `.mjs` patrimoniales (Tipo A) |
| `npm run test:integracion` | Ambas, en secuencia |
| `npm run test:emulador:operaciones` | Suite contra emulador real (requiere `firebase-tools`+`java`: INFRA-01) |
| `npm run auditoria:repositorio` | Guardia A-04 de refs git, **solo lectura**, salida `A-04: OK/WARNING/BLOCKED` |
| `npm run auditoria:reglas:matriz` | Matriz perfil × colección contra el texto real de las reglas |

## 5. Riesgos residuales y límites

- La confirmación en **Firestore real/emulador** sigue bloqueada (INFRA-01); el harness
  evalúa el texto de las reglas documento a documento, no el plan de consulta del motor.
- `trabajos_profesionales`/`presupuestos_profesionales`: la rama de cartera **no se pide**
  porque las reglas solo conceden `list` al profesional por `profesionalId` (verificado en
  `firestore.rules:1519-1521` y `1543-1545`); se documenta como límite conocido, no como
  defecto.
- Las incidencias A-03/A-08/A-09/A-10/A-11 requieren decisión de producto o refactor mayor:
  quedan documentadas, no reparadas.
