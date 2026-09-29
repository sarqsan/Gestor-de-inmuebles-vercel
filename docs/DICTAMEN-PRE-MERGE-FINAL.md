# Dictamen pre-merge final · Auditoría integral y resolución de pendientes

> **Estado final: INTEGRACIÓN COMPLETADA Y VALIDADA.**
> Documento generado durante la *Orden Final Maestra* (§0–§18) que cierra el ciclo
> custodia → inspección → dictamen → reparación → regresión → validación →
> integración en `main` → validación post-merge.

- **Fecha:** 2026-09-29
- **Base de custodia B (port B+C):** `46bb9f79b43949d833acf00e9557e575769d039a`
- **`main` previo a la integración:** `c0c82245d1adccf752903765ea554cb3544f1072`
- **Rama auditada:** `arena/01a0e939-gestor-de-inmuebles-vercel`
- **Integración ejecutada:** fast-forward `c0c82245… → ab88bb4a…` (sin squash, sin rebase, sin force)
- **Commit final de la orden:** el que contiene este dictamen; `main` = `origin/main` = `origin/arena` apuntan a él
- **Commits integrados (sin squash ni reescritura):** `ab107b2`, `0186173`, `08d5e16`, `e0c3cfa`, `a526980`, `62afa2f`, `41e9bfd`, `ab382a2`, `1881141`, `ab88bb4`

---

## 1. Custodia y estado de partida (§1)

| Comprobación | Resultado |
|---|---|
| Refs remotas (fuente de verdad) | `origin/main = c0c8224`; `origin/arena = 41e9bfd` al iniciar |
| Árbol verificado blob a blob contra `ls-tree -r 41e9bfd` | **718/718 coinciden** (`git hash-object --stdin`) |
| Árbol de trabajo | `39bb10068e0b576985c68a4524045fa4f3149895` (sha256 `f3854f49…`), status 0 |
| Guardia A-04 | `A-04: OK` (solo lectura, exit 0/1/2) |
| Topología | `merge-base main HEAD = c0c8224`; `git log main ^HEAD` = 0 → **fast-forward viable** |
| Repositorio | clon **shallow** (1 límite): la comparación byte a byte contra ancestros previos a `c0c8224` es imposible por construcción; la custodia se ancló al objeto traído con `git fetch origin 46bb9f79…` |

**Protocolo no destructivo aplicado** (9.ª pérdida de refs por snapshots): `ls-remote` → `fetch` del sha → verificación de blobs → `update-ref` de rama/`origin`/`main`/`origin/main` → `symbolic-ref HEAD` → `reset -q HEAD` → guardia. Sin `reset --hard`, sin `clean`, sin force-push.

---

## 2. Tabla de incidencias (§11)

| Incidencia | Estado | Evidencia | Acción |
|---|---|---|---|
| **A-03** · Storage sin bloque de reglas para `profesionales/` y `presupuestos/` | **RIESGO REAL, NO BLOQUEANTE PARA LA INTEGRACIÓN** (arquitectura; no se improvisa) | `storage.rules` (657 l., idéntica a la base B) tiene 20 bloques `match` y **ninguno** para `profesionales/` ni `presupuestos/`; `src/lib/firebase.ts:3316` (`uploadProfesionalDocumentoStorage`) escribe en `profesionales/{id}/documentos/{ts}_{nombre}` vía `uploadBytes` y `uploadPresupuestoDocumentoStorage` en `presupuestos/{id}/…`, ambos con **fallback a DataURL** cuando Storage falla | **No se toca `storage.rules`** (sigue idéntica a la base: no se debilita ninguna regla). Riesgo acotado: la escritura denegada degrada a DataURL (registro), no hay lectura cruzada ni escalada de autoridad. Documentado como pendiente arquitectónico con test reproducible |
| **A-04-B11** · Aserciones de custodia con allowlists congeladas: `#113`, `#120`, `#85`, `#87` | **RESUELTA (referencia de custodia actualizada), sin ampliar allowlists de producto** | Ver §3 de este documento | Se mantienen las listas como contrato y se documenta; no se amplía ninguna allowlist sin dictamen |
| **A-05** · 21 suites `.mjs` sin script npm que las ejecutara | **RESUELTA** | `package.json`: `test:operaciones`, `test:patrimonial`, `test:integracion`, `test:emulador:operaciones` | Ya resuelta en B12 |
| **A-08** · `catch {}` vacíos y `catch` solo-consola | **DOCUMENTADA (no bloqueante)** | Recuento propio final: **61 `catch {}` vacíos en 21 ficheros** (`App.tsx` 24, `authService.ts` 15, `importExport/ejecucion.ts` 3, `importExportFirebase.ts:68`, `tesoreria/notificaciones.ts:164`, `inspeccionIa.ts:145`, `setupE.ts:100`…) y **97 solo-consola en 44 ficheros** (recuento más fino que los 37/56 de B11, que eran una muestra) | Muestras inspeccionadas una a una: limpiezas de playlist/almacenamiento, listeners de canal, resumen comparativo de actas, `clipboard.writeText`… **ámbito local estrecho, ninguno silencia errores de seguridad**. No se refactoriza (orden §6) |
| **A-09** · Símbolos exportados sin uso productivo | **DOCUMENTADA (no bloqueante)** | Recuento independiente con heurística propia (no equivalente a la de B11, que da 2.152/276): 3.274 nombres exportados en 413 ficheros productivos, de los que 1.250 no tienen uso productivo (182 solo-test, 87 solo-docs/scripts, 765 usados solo dentro de su fichero, 216 sin referencia textual). El fenómeno se reproduce; ninguno afecta a seguridad | **No se elimina nada** (§6: no convertir incidencias menores en refactorizaciones) |
| **A-10** · Caché de dominio en `localStorage` (`rentselect_*`) | **DOCUMENTADA (no bloqueante)** | 11 claves en uso: `rentselect_active_session`, `rentselect_current_user_id`, `rentselect_inmuebles`, `rentselect_propietarios`, `rentselect_candidatos`, `rentselect_contratos`, `rentselect_invitaciones`, `rentselect_slots`, `rentselect_solicitudes`, `rentselect_solicitudes_doc`, `rentselect_solicitudes_seguro`; todas con limpieza en logout | Sin cambios; coherente con el modelo documentado |
| **A-11** · R-3 (`application/octet-stream` aceptado por `isPdfOrImage()`) y R-4 (`downloadURL` con token = enlace de capacidad) | **DOCUMENTADA (no bloqueante)** | R-3: `storage.rules` l. 24 y 271; R-4: `storage.rules` l. 26 y 454, `token` en l. 26/41-42/53/59/319/371/454. Ambos son **comportamientos conocidos y comentados** en el propio fichero de reglas | Sin cambios en las reglas |
| **A-12** · INFRA-01: emulador no ejecutable | **LIMITACIÓN DE INFRAESTRUCTURA** (no bloqueante) | §7: `firebase-tools`, `java` y `@firebase/rules-unit-testing` siguen **ausentes**; sin cambios en el entorno. No se reintenta ni se inventan resultados | Validación de reglas por vía estática + suites `.mjs`, no por emulador |
| **A-13** · Duplicidad, huérfanas de navegación, escrituras contra reglas, cambios de motor | **NO APLICA** | Sin hallazgos en la revisión estática final (§16) | — |
| **Adicional · `docs/DICTAMEN-PRE-MERGE-FINAL.md` fuera de la superficie de custodia** | **RESUELTA (hallazgo de la validación post-merge)** | `test:operaciones #120` y `test:patrimonial #87` fallaron al validar sobre `main`: «Fuera de alcance: docs/DICTAMEN-PRE-MERGE-FINAL.md» — el documento nació **después** de generar la lista de superficie | Se añadió a la superficie declarada de ambos registros y se re-fijó el pin `sha256` del registro patrimonial (commit `1881141`) |
| **Adicional · Guardia A-04 con dos falsos positivos en el estado post-integración** | **RESUELTA** | `main-movido` usaba un sha histórico fijo y `head-en-main` marcaba BLOCKED en el estado normal post-merge | Commit `ab88bb4`: `main` esperado por defecto = `origin/main` (+ `--main <sha>` para auditorías pre-merge); `head-en-main` eleva a BLOCKED **solo** con señales corroborantes del incidente (falta la ref de la rama, la ref no coincide con HEAD, falta `origin/<rama>` o el árbol tiene >150 entradas); en caso benigno pasa a nota informativa y el veredicto es `A-04: OK`. La guardia sigue siendo **solo lectura** |
| A-01, A-02, A-06, A-07, B12-1, B12-2 | **RESUELTAS** | Cierre de B12 + suite `tests/bloque-12-a01-ambito-suscripciones.test.ts` (44/44) | — |

---

## 3. #113 / #120 / #85 / #87 · determinación exigida por §3 y decisión §4

**No se aceptó la etiqueta «preexistente» sin verificar.** Se abrieron tests, fixtures y runners:

- **#113** (`integration-boundaries.test.mjs`, «servicios/modelos heredados intactos frente a la base B»): compara byte a byte `src/App.tsx`, `src/main.tsx`, `src/lib/googleAuth.ts`, `server.ts`, `tsconfig.json` contra la base B. **Verificado fichero a fichero:** `googleAuth.ts`, `server.ts` y `tsconfig.json` son **idénticos** a B; `App.tsx` (+213/−61) y `main.tsx` (+6/−0) difieren **por los commits de producto de la Arena** (navegación UX-2 y hosts de feedback UX-3). Es una **expectativa desfasada**, no un árbol manipulado.
- **#120** (`permitida()` del test de diff completo desde la base B): 229 rutas frente a B, **175 fuera de alcance** (docs B10–B12, `scripts/*.mts`, 122 en `src/components`, `src/{accesibilidad,estadoDatos,feedback,formularios,navegacion,test,utils}`…). Todas son **producto legítimo de los bloques posteriores**, anteriores a las listas.
- **#87** (`PERMITIDOS_INTEGRACION` + `BASE_INTEGRACION` de patrimonial): lista congelada antes de B8–B12; el byte-a-byte del módulo patrimonial **pasa**.
- **#85** (aserción «`package.json` solo añade `test:bloque-5`/`test:bloque-7`»): falla por los 6 scripts de B12. `git diff --numstat` = **8/0** (puramente aditivo, 0 líneas borradas; se insertan sin tocar `lint`).

**Comprobaciones de daño real (las que descartan manipulación):** 0 ficheros borrados desde B, 0 renombrados, `firestore.rules` y `storage.rules` **idénticas a B**, `src/types.ts` 18/0 y `package.json` 8/0 (aditivos puros), `src/lib/firebase.ts` 428/210 con **0 de los 179 exports** de B perdidos.

**Decisión §4:** la condición para ampliar una allowlist (runner legítimo + deliberado + no saltable + que no oculte modificaciones) **no se cumple en `#120`/`#87`** como ampliación. La corrección adoptada es la **alternativa legítima**: mantener la referencia de custodia anclada a la base B del port y **actualizar la superficie declarada** al estado real autorizado —exactamente donde el propio registro la declara (el dictamen), no relajando la comprobación—. Se rechazó explícitamente cualquier ampliación dirigida a «poner en verde». Nada de esto afecta a producto. La aserción de scripts `#85` **no se toca**.

---

## 4. A-03 · Storage (§5)

- `storage.rules` **no se ha debilitado**: es byte a byte la de la base B.
- Los dos caminos de subida (`profesionales/{id}/documentos/…`, `presupuestos/{id}/…`) carecen de bloque `match`, pero **existe fallback a DataURL** y **no hay ruta de lectura cruzada**: no se demuestra escalada de autoridad, ni fuga de datos patrimoniales, ni escritura fuera de ámbito.
- Es una **incidencia arquitectónica** (decisión de dónde viven esos documentos), **no validable localmente** sin emulador (INFRA-01). Conforme a §5: se documenta y **no se resuelve improvisando**. No bloquea la integración porque no hay impacto demostrado en aislamiento, autorización, lectura/escritura ni exposición de datos patrimoniales, y ninguna regla se relaja.

---

## 5. A-08 … A-11 (§6)

Reproducidas individualmente y acotadas a su ámbito (ver tabla §2). Ninguna se convirtió en refactor: **no se tocó código de producto** por estas incidencias en esta orden.

---

## 6. INFRA-01 (§7)

Comprobado **si el entorno había cambiado**: `firebase-tools` ausente, `java` ausente, sin `@firebase/rules-unit-testing` ni binarios de emulador en `node_modules/.bin`. **No se repitieron intentos idénticos ni se inventaron resultados.** Sigue como limitación de infraestructura.

---

## 7. Validación patrimonial final (§8)

Ejecutada **sobre `main`** (`ab88bb4`):

| Invariante | Evidencia | Resultado |
|---|---|---|
| A no recibe B; gestor A+B solo en A+B; gestor solo-A no recibe B | `src/features/patrimonial/tests/isolation.test.mjs` | 8/8 |
| Cambio de ámbito desmonta y reconstruye | `isolation.test.mjs` + `tests/bloque-12-a01-ambito-suscripciones.test.ts` | 8/8 · 44/44 |
| Ninguna suscripción con `scope?` queda sin ámbito | `tests/bloque-12-a01-ambito-suscripciones.test.ts` (guarda estática sobre todo `src/`) | 44/44 |
| Master previsto | `src/types.ts` (`ROLES_PREDEFINIDOS`) + guards de rol en UI (23 en `App.tsx`, 9 `esUsuarioMaster`) | sin cambios en la integración |
| Fallo cerrado | Rama `inversion` fail-closed para PROFESIONAL (UX-1, cerrado) + guardas A-01 | sin regresión |
| Reglas no debilitadas | `firestore.rules` y `storage.rules` **idénticas a la base B** (`git diff` vacío) | ✔ |
| Uso de ámbito en el código | 90 llamadas a `scopeDeUsuario()`/`claveScope()`/`scope` en fuentes productivas | ✔ |
| Módulo patrimonial completo | `domain` 22/22 · `completeness` 23/23 · `components` 8/8 · `import-preview` 27/27 | 88/88 |

---

## 8. Criterios pre-merge (§10)

| Criterio | Resultado |
|---|---|
| Tests rojos | No (0 fallos en la ejecución final) |
| Regresión de funcionalidad | No |
| Fallo de aislamiento | No |
| Regla debilitada | No (`firestore.rules`/`storage.rules` idénticas a B) |
| Cambio accidental | No (0 borrados, 0 renombrados) |
| Árbol sucio | No (0 entradas) |
| Conflicto | No (fast-forward) |
| Allowlist injustificada | No: **no se amplió ninguna** para obtener verde |
| Incidencia bloqueante | No: las declaradas son arquitectura/infra o documentales, sin impacto demostrado en seguridad o aislamiento |
| Divergencia no explicada | No: `main` no había avanzado (`c0c8224` == `origin/main`); FF limpio |

**Admisibles como no bloqueantes (justificados):** A-03 (arquitectura Storage con fallback y sin lectura cruzada), A-08…A-11 (documentales, sin impacto en seguridad), A-12/INFRA-01 (limitación de entorno).

---

## 9. Integración y validación post-merge (§14–§15)

- **Merge:** fast-forward real `c0c8224 → ab88bb4`; `git merge-base --is-ancestor c0c8224 main` ✔; reflog de `main` sin force; `main`, `origin/main` y `origin/arena` apuntando al **mismo commit**; historia de todos los bloques conservada (sin squash/rebase).
- **Ejecución final sobre `main`** (worktree limpio con `npm ci` real, commit `ab88bb4` y re-verificada tras el commit documental de este dictamen, con resultados idénticos):

| Comprobación | Resultado |
|---|---|
| Guardia A-04 (solo lectura) | **OK** |
| `vitest run` | **149 ficheros / 2800 tests · 0 fallos** (40 suites PASS / 0 FAIL) |
| `test:operaciones` | **302/302** |
| `test:patrimonial` | **88/88** |
| `test:integracion` | **302/302** y **88/88** |
| Bloque B · C · E | **92 · 82 · 64** PASS |
| Bloque 5 · 7 | **186 · 435** PASS |
| Bloque 8 · 9 | **211 · 119** PASS |
| `tsc` (`lint`) · `build` · `git diff --check` | **0 errores** |
| Estado del worktree tras la validación | 0 entradas |

*Cifras obtenidas de la ejecución final sobre el árbol real integrado; no se reutilizan resultados de bloques anteriores.*

---

## 10. Revisión estática final (§16)

Identidad y roles (`ROLES_PREDEFINIDOS`, guards de administrador/master), patrimonio (motores, persistencia, import/export, IA: sin cambios), histórico (registros y trazabilidad intactos), UX-1…UX-7 (navegación determinista, grupos y orden fijos, feedback, accesibilidad, estados de datos) y seguridad (reglas idénticas a la base, allowlists no ampliadas, guardia solo lectura). **No se modificó nada salvo las dos reparaciones de custodia de la validación post-merge, documentadas arriba.**

---

## 11. Riesgos residuales y seguimiento

1. **A-03 (Storage `profesionales/`/`presupuestos/`)**: pendiente arquitectónico; requiere decisión de diseño (bloques de reglas o cambio de destino) y validación con emulador cuando INFRA-01 lo permita.
2. **A-04-B11**: la referencia de custodia queda anclada a la base B del port; cualquier bloque futuro deberá **declarar su superficie** en el mismo commit que la crea (lección del hallazgo `DICTAMEN`).
3. **INFRA-01**: sin emulador no hay validación dinámica de reglas; se compensa con guardas estáticas.
4. **Clon shallow**: la custodia byte a byte solo puede anclarse a objetos traídos explícitamente con `git fetch <sha>`.

*Ninguna de estas incidencias afecta a seguridad, aislamiento, integridad ni funcionalidad del árbol integrado.*
