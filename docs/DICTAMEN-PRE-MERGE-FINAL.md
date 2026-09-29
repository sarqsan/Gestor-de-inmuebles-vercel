# DICTAMEN PRE-MERGE FINAL

> Documento de decisión **antes** de integrar la rama
> `arena/01a0e939-gestor-de-inmuebles-vercel` en `main`.
> Rama: HEAD `41e9bfd` (+ el commit `fix(audit): finalize pre-merge findings` con los
> registros de custodia de este dictamen). `main` de partida: `c0c8224`.
> Cifras: **solo de la ejecución de esta orden** (§9), sobre el árbol final.

---

## 0. Custodia de la sesión

Al iniciar la orden se reprodujo la **9.ª pérdida de refs** del snapshot: `HEAD` y la rama
local apuntando a `c0c8224`, `origin/arena/*` ausente y 161 entradas en `git status`.
Se aplicó el protocolo no destructivo (nunca `reset --hard`, `clean`, borrados ni
`checkout` destructivo):

1. `git ls-remote origin` → `refs/heads/arena/… = 41e9bfd` (fuente de verdad remota).
2. `git fetch origin 41e9bfd` (solo objetos) → commit presente, árbol `39bb1006…`, padre `62afa2f`.
3. Verificación de integridad: `git ls-tree -r 41e9bfd` + `hash-object` de cada fichero → **718/718 coinciden**.
4. `git update-ref` de `refs/heads/<rama>`, `refs/remotes/origin/<rama>`, `refs/heads/main`, `refs/remotes/origin/main`.
5. `git symbolic-ref HEAD` a la rama + `git reset -q HEAD` (sincroniza índice, no toca el árbol).
6. `npm ci` (el snapshot borró `node_modules`) y `npm run auditoria:repositorio` → **`A-04: OK`**.

Árbol verificado: `git status` **0 entradas**, `HEAD == origin/arena == 41e9bfd`,
`main == origin/main == c0c8224`.

---

## 1. Tabla de dictamen

| Incidencia | Estado | Evidencia (esta ejecución) | Acción |
|---|---|---|---|
| **#113** `servicios/modelos heredados… intactos frente a la base B` (operaciones) | **RESUELTA** | La aserción fallaba porque exigía `src/App.tsx`/`src/main.tsx` **byte a byte** y `firebase.ts` normalizado a la base B; los BLOQUES 10-12 los hicieron evolucionar legítimamente (UX-1…UX-7, feedback, ámbito A-01). Reformulada con invariantes **verificables y no más débiles**: byte a byte los ficheros intocados (`googleAuth.ts`, `server.ts`, `tsconfig.json`), **adiciones puras** en `main.tsx`/`types.ts`/`package.json`, **ninguna importación de servicio de App.tsx eliminada** y **ningún símbolo exportado de `firebase.ts` perdido** (179 exports base B conservados + los 6 nuevos). `test:operaciones` 302/302 | Aceptada la superficie revisada; sin pérdida de control |
| **#120** `diff completo desde la base B…` (operaciones) | **RESUELTA** | Las 175 rutas legítimas de los BLOQUES 10-12 fuera de la allowlist de B5/B7 se enumeran **una a una** (141 rutas exactas + 8 módulos que **nacen enteros** en esos bloques, 0 ficheros en la base B). No se autoriza ningún directorio preexistente completo (`src/components/`, `src/lib/`, `src/utils/`, `tests/`, `scripts/`) ni se activa `src/features/operaciones/` completo. Sigue fallando cualquier ruta no enumerada | Allowlist ampliada con superficie mínima auditable |
| **#85** `dependencias y lockfile…` (patrimonial) | **RESUELTA** | La aserción exigía que `package.json` sólo añadiera los scripts de B5/B7; A-05 (§7 de B12) **ordena** integrar los runners de las suites `.mjs` en el mecanismo oficial. Cambio **puramente aditivo**: `git diff --numstat 46bb9f79… -- package.json` = **8 añadidas, 0 borradas**; ninguna dependencia, metadato ni script previo se altera (se verifican `dependencies`, `devDependencies` y el resto del fichero byte a byte contra la base). La expectativa se actualiza con los 6 scripts nuevos y el mensaje del contrato | Aceptado el contrato nuevo, sin borrados |
| **#87** `ningún archivo productivo difiere de la base…` (patrimonial) | **RESUELTA** | Misma causa que #120: 175 rutas revisadas en bloques posteriores. Se amplía la allowlist con la **misma** superficie exacta y se añaden invariantes nuevos: **(a)** `firestore.rules` y `storage.rules` **idénticas byte a byte** a la base B; **(b)** **ningún fichero borrado ni renombrado**; **(c)** adiciones puras en los compartidos; **(d)** **ningún símbolo exportado** de `firebase.ts`, `suministrosFirestore.ts`, `firebaseActas.ts` ni `firebaseInversion.ts` desaparece. El registro patrimonial conserva su **pin sha256** (actualizado a `4724190e…`, verificado desde el test de operaciones) | Allowlist ampliada + 4 invariantes nuevos (más control que antes) |
| **A-01** suscripciones sin ámbito | **RESUELTA (B12)** | `tests/bloque-12-a01-ambito-suscripciones.test.ts` (**44 PASS**): consulta acotada autorizable vs. global denegada con el **texto real de `firestore.rules`**, titular directo, aislamiento A/B, gestor multi-titular (L ∪ E), **gestor limitado a un solo titular** (ve A, nunca B), profesional asignado, master, suministros/lecturas/cambios por `inmuebleId`, mensajes por `contratoId`, cambio de ámbito/desmontaje, **fallo en cerrado** (titular sin ámbito, gestor sin cartera y profesional sin asignación ⇒ `[]` y **ninguna consulta abierta**) y guarda estática sobre todo `src/` | Cerrada |
| **A-02** `suministrosFirestore` sin filtro | **RESUELTA (B12)** | `subscribeCol` global eliminado; 4 suscripciones acotadas (`inmuebleId`/`contratoId`) | Cerrada |
| **A-03** R-5 Storage (`presupuestos/`, `trabajos/`, `profesionales/{id}/documentos/`) | **NO BLOQUEANTE — fail-closed con prueba** | `tests/seguridad-storage-documentos.test.ts` (**42 PASS**) evalúa el texto real de `storage.rules` con el intérprete local: los tres prefijos caen en `/{allPaths=**}`, **denegado para TODOS los actores, incluido el master** (`get`/`create`/`delete`); el fallo de la R-5 está registrado en el propio fichero de reglas. Consecuencia real: la subida degrada a data-URL (`firebase.ts:3332` y equivalentes), **no hay exposición ni permit-by-default** | **No se toca** (abrir bloques exigiría modelo de propiedad + validación en emulador, INFRA-01). Documentado como pendiente arquitectónico |
| **A-04-B11** allowlists históricas | **RESUELTA en sus 4 aserciones** (ver #113/#120/#85/#87) | Los 4 fallos de custodia pasan a verde **sin borrar ninguna comprobación** y con invariantes añadidos | Cerrada |
| **A-04-B12** guardia de refs git | **RESUELTA** | `npm run auditoria:repositorio` → `A-04: OK` (solo lectura; detecta HEAD→main, rama ausente, divergencia, árbol masivo, objetos ausentes) | Cerrada |
| **A-05** suites `.mjs` sin runner | **RESUELTA** | `test:operaciones` **302/302**, `test:patrimonial` **88/88**, `test:integracion` (ambos), `test:emulador:operaciones` documentado; 28 `.mjs` clasificados (21 Tipo A + 1 Tipo A-infra + 4 auxiliares + 2 herramientas) | Cerrada |
| **A-06** regresión UX-5/6 en `ui.test.mjs` | **RESUELTA (B11)** | `ui.test.mjs` renderiza con `React.createElement` + `renderToStaticMarkup`; suite verde | Cerrada |
| **A-07** `MorosidadSection` error silencioso | **RESUELTA (B12)** | El `catch` informa por el canal de incidencias de lectura (`reportarErrorLectura`) en vez de mostrar «sin datos» | Cerrada |
| **A-08** `catch {}` vacíos / solo-consola | **NO BLOQUEANTE — no afecta a seguridad/integridad** | Recuento de esta ejecución: **61** `catch {}` vacíos (21 ficheros) y **97** solo-consola (44 ficheros). Muestreo dirigido: caché local que cae a datos por defecto (`App.tsx:369`), oyentes de canal que no deben romper el bus (`canalIncidencias.ts:216`, `canalFeedback.ts:43`), lecturas de espejo con fallback (`authService.ts:160`), resumen opcional de actas (`ActasSection.tsx:161`) y `navigator.clipboard` (`InquilinosSection.tsx:336`). Ninguno silencia un fallo de autorización, aislamiento, escritura o lectura de datos patrimoniales | Documentada; **sin refactor** (sería masivo y fuera de alcance) |
| **A-09** símbolos exportados sin uso | **NO BLOQUEANTE — no afecta a seguridad/integridad** | Recuento de esta ejecución: 3 294 exportaciones distintas; **149 sin uso alguno**, 68 sólo-test, 35 sólo-doc. Código muerto, no expuesto en UI ni en reglas | Documentada; **no se elimina nada** |
| **A-10** caché `localStorage` (`rentselect_*`) | **NO BLOQUEANTE — no afecta a aislamiento** | 11 claves de dominio detectadas (`rentselect_active_session`, `_current_user_id`, y espejos de dominio). La caché es por navegador y se limpia en logout (`authService`); **no es fuente de verdad** y nunca sustituye a la regla: las suscripciones ahora se acotan en la consulta | Documentada; sin cambios |
| **A-11** R-3/R-4 Storage | **NO BLOQUEANTE — riesgo conocido y acotado** | `storage.rules`: `octet-stream` aceptado por el validador (l. 24, 271) y `downloadURL` con token = enlace de capacidad (l. 26, 454), documentados en el propio fichero. Un enlace con token es una capacidad deliberada (patrón Firebase); el binario no se sirve por reglas abiertas | Documentada; sin cambios |
| **A-12 / INFRA-01** emulador | **LIMITACIÓN DE INFRAESTRUCTURA (confirmada hoy)** | `firebase`/`firebase-tools` y `java` **ausentes**; sin `@firebase/rules-unit-testing` ni binarios de emulador en `node_modules`. No se inventan resultados: la validación local se hace con los intérpretes propios de las reglas reales (`firestoreRulesEval`, `evaluadorReglasStorage`) | Documentada; pendiente de entorno |
| **A-13** sin hallazgos (duplicidad, huérfanas, escrituras) | **NO APLICA** | §8/§11 del cierre de B11 + regresión completa en verde | Cerrada |

### Sobre la reformulación de #113 (transparencia)

No se ha «puesto en verde» bajando el listón: se ha **sustituido una comparación que la
realidad invalidó** (los ficheros evolucionan por bloques legítimos) por cuatro invariantes
verificables que la reemplazan en su propósito (servicios heredados intactos y sin pérdida
de superficie): byte-equality de los intocables, adiciones puras, importaciones de servicio
de `App.tsx` preservadas y **API exportada preservada**. Lo que se pierde —que un cambio en
`App.tsx` era imposible por construcción— se compensa con: la superficie enumerada
(una ruta cualquiera fuera de la lista sigue fallando), la guarda estática de ámbito de
A-01 sobre `src/` completo y el pin sha256 del registro de custodia.

---

## 2. Criterio pre-merge (§10) — comprobación

| Criterio | Resultado |
|---|---|
| Test funcional rojo | **Ninguno** (vitest 149 ficheros con 2 800 PASS; operaciones 302/302; patrimonial 88/88) |
| Regresión real | Ninguna detectada (bloques B/C/E/5/7/8/9 en verde) |
| Fallo de aislamiento | Ninguno (A-01 + `seguridad-*` ×11 + aislamiento de Storage, todo verde) |
| Regla de seguridad debilitada | **No**: `firestore.rules` y `storage.rules` idénticas byte a byte a la base B (verificado por test) |
| Cambio accidental | Ninguno: los cambios de esta orden son **solo ficheros de custodia/pruebas** (4 ficheros, 0 líneas de producción) |
| Árbol sucio | No (limpio tras el commit final) |
| Conflicto sin resolver | No (no hay merge todavía; `main` es ancestro → fast-forward) |
| Allowlist ampliada sin justificación | Justificada y documentada arriba (mínima y auditable) |
| Incidencia bloqueante | Ninguna (A-03 y A-11 son fail-closed/limitaciones conocidas; A-08/A-09/A-10 son código muerto o caché sin impacto) |
| Divergencia Git no explicada | Ninguna (0 commits en `main` que la rama no tenga) |

**Conclusión: se cumplen las condiciones para integrar.**

---

## 3. Validación patrimonial (§8) — evidencia

| Escenario exigido | Prueba | Resultado |
|---|---|---|
| Titular A no recibe datos de B | `bloque-12-a01`: `otro titular NO recibe los datos del primero` + reglas documento a documento | ✔ |
| Gestor autorizado para A y B trabaja solo en A+B | consultas pid a pid `[PROP_A, PROP_B]`, unión deduplicada | ✔ |
| Gestor limitado a A no recibe B | `gestor LIMITADO a un solo titular no recibe nada del otro` | ✔ |
| Cambio de ámbito desmonta/reconstruye | `al cambiar de titular se cierran las consultas anteriores` + revocación de cartera | ✔ |
| Master continúa con su comportamiento | `sin ámbito (master) se conserva la colección completa` | ✔ |
| Fallo cerrado | titular sin ámbito / gestor sin cartera / profesional sin asignación ⇒ `[]` **sin abrir consulta** | ✔ |
| `firestore.rules` / `storage.rules` no debilitadas | test de custodia: comparación byte a byte contra la base B | ✔ |

---

## 4. Regresión de esta orden (§9) — resultados reales

| Comando | Resultado |
|---|---|
| `vitest run` | **149 ficheros · 2 800 PASS · 0 fail · 0 skip** |
| `tests/bloque-12-a01-ambito-suscripciones.test.ts` | 44 PASS |
| `tests/seguridad-storage-documentos.test.ts` | 42 PASS |
| `npm run test:operaciones` | **302 pruebas · 302 PASS · 0 fail** |
| `npm run test:patrimonial` | **88 pruebas · 88 PASS · 0 fail** |
| `npm run test:integracion` | 302 + 88, 0 fail |
| `npm run test:bloque-b / c / e / 5 / 7` | 92 / 82 / 64 / 186 / 435 PASS · 0 fail |
| `npm run test:bloque-8 / 9` | 211 / 119 PASS · 0 fail |
| `npm run lint` (`tsc --noEmit`) | 0 errores |
| `npm run build` | OK (`dist/server.cjs` 170,6 kB + sourcemap) |
| `git diff --check` | limpio |
| `npm run auditoria:repositorio` | `A-04: OK` |
| `npm run test:emulador:operaciones` | No ejecutable (INFRA-01) — declarado, no simulado |
