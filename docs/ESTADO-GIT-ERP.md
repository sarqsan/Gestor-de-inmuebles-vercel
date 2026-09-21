# ESTADO GIT DEL ERP — REGISTRO DE ESTADO

> Registro vivo del estado Git del proyecto. **Cada orden que integre o cambie
> el estado actualiza este fichero en el mismo commit.** No se almacenan
> secretos en este documento.

## ESTADO ACTUAL (actualizado 2026-09-21)

| Campo | Valor |
|---|---|
| Repositorio remoto | `origin` → `https://github.com/sarqsan/Gestor-de-inmuebles-vercel.git` |
| Rama canónica | `arena/01a0bfbe-gestor-de-inmuebles-vercel` (sesión Arena A; la canónica histórica `arena/01a0a413-…` queda en `91da820`) |
| HEAD canónico | commit `fix(gap3,gap6): filtrar gastos por fecha efectiva (fechaDevengo/fechaPago), no por alias g.fecha (correctiva D2)` |
| Último commit canónico | O17 D2 `fix(gap3,gap6)` (hijo de `e3e563a`) ← `e3e563a`/`2332bb1` (docs) ← `c39f183` (`test(gap-r4)`, GAP-R4 CERRADO) ← `ce67c09`/`3f1509c` (ORDEN 15) ← … ← `d606ff8` (integración selectiva BLOQUE D) |
| Último bloque integrado | **BLOQUE D — Actas de entrada/salida + firma OTP + PDF** (INTEGRADO EN ARENA A, 2026-09-21, commit `d606ff8`) — precedido por **BLOQUE C** (merge `5293c3c`) y **BLOQUE B** (2026-09-20, commit `feat(tesoreria)`) |
| GAP 1–8 | **CONSOLIDADOS** (commits `b1d45aa` → `91da820`) — intactos tras B, C y D (regresión 460/460); GAP1 con su implementación Firestore de `RepositorioNotificaciones` vía BLOQUE C; GAP6 canónico intacto (el GAP6 alternativo de la rama D fue excluido) |
| RAMA DE SESIÓN ACTUAL | `arena/01a0bfbe-gestor-de-inmuebles-vercel` |
| — integración BLOQUE D | Commit `d606ff8` — `feat(actas): integrar bloque D en ERP canonico`: integración **selectiva** (auditoría 20/20 ficheros, 0 conflictos) de `arena/01a0ab9d` @ `672b7ee` (commits `698e9e6`+`672b7ee`; **excluido** su `5d3ae7f` `feat(gap6)`, que duplicaba el GAP6 canónico). Nuevo: `src/utils/actas/*` (7 motores + 51 tests), `types/actas.ts`, `lib/firebaseActas.ts` (4 colecciones), `ActasSection.tsx`, reglas §38 (renumerado desde «25» de D), storage `actas_fotos`/`actas_pdfs`, `firestore.indexes.json`, navegación (App/Sidebar/MobileNav/Header). Ajustes: predicado OTP reforzado + limpieza real de `codigoPlainTemporal` tras uso. Informe: `docs/BLOQUE_D_ACTAS.md` |
| — merge de alineación | `d24ab1f` — merge de la canónica `91da820` en la rama de sesión (antes: rama basada en `main` `4d420bd`, árbol **sin** GAP 1–8). Árbol resultante byte-idéntico a `91da820` (verificado: `git diff --cached 91da820` = ∅) |
| — commits de docs | `docs: crear paquete de continuidad y mapa maestro ERP` · `docs: actualizar mapa maestro con portal inquilino y capa IA` |
| — integración BLOQUE B | Commit `feat(tesoreria): integrar bloque B en ERP canonico` — integración **selectiva** de `arena/01a0bfd3` @ `87aed9a` (NO merge ciego; la rama B trabajaba sobre `main` sin GAP1–8). Informe: `docs/integracion-BLOQUE-B-2026-09-20.md`. Nuevo: `src/tesoreria/*` (9 módulos), `TesoreriaSection.tsx`, `lib/tesoreriaFirestore.ts`, `lib/conciliacionSession.ts`, reglas §26–31, origen GAP1 `TESORERIA` + 7 plantillas, script `test:bloque-b` (92 tests) |
| Tests | **848/848** (36 ficheros vitest, regresión global tras ORDEN 17: 638 + 197 de GAP-R4 + 13 de la correctiva D2) + **92/92** (`npm run test:bloque-b`) + **82 PASS** (`npm run test:bloque-c`) + **64/64** (`npm run test:bloque-e`) — re-verificados 2026-09-21 |
| TypeScript | `npx tsc --noEmit` → **0 errores** — re-verificado 2026-09-21 |
| Build | `npm run build` → **OK** (warning conocido de chunk >500 kB) — re-verificado 2026-09-21 |
| Worktree | CLEAN |
| Remoto | SYNCED (push verificado con `git ls-remote`) |
| Fecha de actualización | 2026-09-21 |

## ENTREGA EN RAMA — BLOQUE C (2026-09-20) — **INTEGRADO EN CANÓNICA (2026-09-21, Arena A)**

| Campo | Valor |
|---|---|
| Bloque | **BLOQUE C — Morosidad avanzada, recobro y expediente legal** |
| Rama de entrega | `arena/01a0c03d-gestor-de-inmuebles-vercel` |
| BASE sobre la que se desarrolló | `5ff8448301ba2e49f4418f9a66d66ec2ff5eb15f` (HEAD canónico tras la integración de B) |
| Commit de cierre | `91bac8e` — `feat(morosidad): cerrar bloque C de recobro y expediente` (commit único de cierre; sin merge con la canónica) |
| Estado de integración | **INTEGRADO en la rama canónica (Arena A, 2026-09-21)**: merge `--no-ff` `5293c3c` — `feat(morosidad): integrar bloque C en ERP canonico` — tras auditoría selectiva de los 33 ficheros (100 % aditivo; cero escritura en `registroCobros`; pagos solo vía `cobrosEngine.registrarPagoPeriodo`; comunicaciones solo vía dispatcher GAP1). Corrección de coherencia en la integración: se eliminó `deleteExpedienteMorosidadFirestore` (código muerto contradictorio con la propia regla §32, que deniega el delete para todos) y se alineó el comentario del header de `morosidadFirestore.ts`. |
| Cambios | 16 ficheros nuevos (~8.800 líneas: 8 módulos + 4 suites + tipos + lib + 2 pantallas + script de batería) y 9 modificados (aditivos): `firestore.rules` +150, `src/App.tsx` +140, `PropietarioPortalSection.tsx` +118, `notificaciones/plantillas.ts` +93, `types/notificaciones.ts` +6, `Sidebar.tsx`/`MobileNav.tsx` +5, `types.ts` +2, `package.json` +1 script |
| No tocado (verificado) | `src/tesoreria/**`, `src/utils/cobrosEngine.ts`, `src/notificaciones/dispatcher.ts`, `server.ts`, `src/firebase.ts` — **cero regresión sobre los motores de B y de los GAP** |
| Tests en la rama | `npm run test:bloque-c` → **82 PASS · 0 FAIL**; `npx vitest run` → **409/409** (20 ficheros; baseline 330 → +79); `npm run test:bloque-b` → **92/92** |
| TypeScript | `npx tsc --noEmit` → **0 errores** |
| Build | `npm run build` → **OK** (solo el warning preexistente de chunk >500 kB) |
| Nuevas colecciones | `expedientes_morosidad`, `expedientes_morosidad_hist`, `evidencias_morosidad`, `compromisos_morosidad`, `politicas_morosidad`, `morosidad_resumen_propietario` |
| Reglas | §32–§37 + helper `sinSecretosMorosidad()`; numeración propia (no reutiliza números de otros bloques); `notificaciones` sigue rigiéndose por §22 sin cambios; el catch-all deny-by-default continúa siendo el último bloque |
| Límites declarados | Reglas verificadas **textualmente** (el repo no tiene emulator de reglas); email en safe-mode (`PENDIENTE_ENVIO`/`FALLIDA`, nunca `ENVIADA`); burofax/notaría/aseguradora/tribunal = **EXTERNO** con registro manual y evidencia; adjuntos = solo referencia (subida a Storage **PENDIENTE**); sin programador automático de detección |
| Documentación | `docs/BLOQUE-C-IMPLEMENTACION.md` · `docs/BLOQUE-C-VERIFICACION.md` · `docs/BLOQUE-C-NORMATIVA.md` |
| Desviación declarada | Al inicio la rama estaba estrictamente por detrás de `5ff8448` y sin trabajo propio: se ejecutó `git reset --hard 5ff8448` tras verificar que `4d420bd` era ancestro. Ningún commit ajeno se perdió |

## RAMAS DEL REMOTO (foto 2026-09-20)

| Rama | SHA | Contenido |
|---|---|---|
| `arena/01a0a413-gestor-de-inmuebles-vercel` | `91da820` | **CANÓNICA** — ERP GAP 1–8 consolidado |
| `arena/01a0bfbe-gestor-de-inmuebles-vercel` | `5293c3c` (+docs) | **CANÓNICA ACTUAL** — ERP GAP 1–8 + BLOQUE B + BLOQUE C integrados |
| `main` | `4d420bd` | Línea paralela AI Studio (mantenimiento/candidatos/seguros) — preservada, no es base del ERP |
| `arena/01a0bfd3-gestor-de-inmuebles-vercel` | `87aed9a` | BLOQUE B (Tesorería/Liquidaciones/SEPA) sobre `main` — **integrado selectivamente en la rama de sesión (2026-09-20)**; la rama se conserva como origen de referencia |
| `arena/01a0c03d-gestor-de-inmuebles-vercel` | `91bac8e` | **BLOQUE C** (morosidad/recobro/expediente legal) sobre `5ff8448` — **INTEGRADO en la canónica (2026-09-21, merge `5293c3c`)**; la rama se conserva como origen de referencia |
| `arena/01a0ab9d-gestor-de-inmuebles-vercel` | `672b7ee` | **BLOQUE D** (actas entrada/salida, firma OTP, PDF) sobre `9cb01a43` — **INTEGRADO selectivamente en la canónica (2026-09-21, commit `d606ff8`)**; su commit `5d3ae7f` (`feat(gap6)`) fue **excluido** (duplicaba el GAP6 canónico); la rama se conserva como origen de referencia |
| `arena/01a0ab19-…` / `01a0ab97-…` / `01a0ab9d-…` / `01a0b91c-…` | (variados) | Sesiones históricas de Arenas (trabajo de GAPs y auditorías) |
| `recovery/arena-a`, `recovery/arena-b-content` | (variados) | Ramas de recuperación históricas |
| `refs/pull/1/head` | `29a9795` | PR histórica |

## HISTORIAL DE ESTADO (filas nuevas arriba)

| Fecha | Evento | HEAD canónico | Tests / TSC / Build |
|---|---|---|---|
| 2026-09-21 | **ORDEN 17 — correctiva D2**: informes GAP3 y matching GAP6 filtraban gastos por `g.fecha` (alias que el ERP nunca escribe) → todos los gastos quedaban fuera de informes/exportación y los candidatos GASTO de conciliación puntuaban «fuera ventana 999d». Nuevo `gastosEngine.fechaEfectivaGasto` (DEVENGO para reporting, PAGO para conciliación), 8 filtros + lista + exportación de `reportingEngine.ts` y candidato de `matchingEngine.ts` migrados. Sin cambios en `fiscalEngine`, `cobrosEngine`, `registrarPagoPeriodo`, reglas ni UI. +13 tests (`src/utils/d2FechaGasto.test.ts`; 8 fallaban antes del fix). D1 y D3 siguen **pendientes de orden** | `e3e563a` → commit `fix(gap3,gap6)` | 848/848 (36 ficheros) + B 92 + C 82 + E 64 · 0 · OK |
| 2026-09-21 | **Traspaso GAP-R1 → Arena B (solo docs)**: pliego en MAPA §12.6 (base obligatoria `c39f183`, alcance en 5 puntos sobre colecciones ya reguladas `movimientos_bancarios`/`conciliaciones_bancarias`/`importaciones_bancarias`, persistencia del `contratoActualizado` vía prop `onSaveContrato`, prohibiciones, aviso D2, criterios de integración por Arena A) + fila en anexo §8 de `CONTRATO-INTEGRACION-ARENAS.md`. Sin cambios en código ni tests; D1–D3 siguen **no corregidos** (requieren orden) | `c39f183` → `2332bb1` | sin re-ejecución (cambio exclusivamente documental; último verde sobre `c39f183`: 835/835 · 0 · OK) |
| 2026-09-21 | **ORDEN 16 — GAP-R4 CERRADO**: suites propias `cobrosEngine` (69), `fiscalEngine` (43), `gastosEngine` (45) + GAP3 desglosada (41, antes 1). Solo tests; producción intacta. Hallazgos D1 (deducibilidad divergente gastos↔fiscal), D2 (reporting GAP3 y matching GAP6 filtran gastos por `g.fecha`, campo no rellenado por el ERP) y D3 (rangos GAP3 dependientes de zona horaria) documentados en MAPA §12.2, **no corregidos** (requieren orden) | `ce67c09` → commit `test(gap-r4)` | 835/835 (35 ficheros) + B 92 + C 82 + D 51 + E 64 + batería E 73 + F1–F3 76 + F4 29 · 0 · OK |
| 2026-09-21 | **BLOQUE D INTEGRADO** (actas de entrada/salida, inventario, contadores, evidencias Storage, comparación determinista sin IA, firma OTP, PDF persistido, versionado inmutable de firmadas): integración **selectiva** por Arena A (commit `d606ff8`) de `arena/01a0ab9d` (`698e9e6`+`672b7ee`, base `9cb01a43`) tras auditoría de los 20 ficheros (0 conflictos). **Excluido** `5d3ae7f` (`feat(gap6)`: segundo sistema de conciliación, el GAP6 canónico ya existe desde `58c5454`). Ajustes de coherencia: reglas D → §38 (colisión: §25 canónico = GAP7), predicado OTP `sinSecretoPlanoExcesivo` reforzado (lo que declaraba su comentario) y limpieza real de `codigoPlainTemporal` al persistir OTP usado/expirado (defecto: `merge:true` no borraba el campo omitido). Pendiente externo: transporte real OTP (SMS/email) `PENDIENTE_PROVEEDOR` | `7ed7f59` → `d606ff8` (+commit docs de la integración) | 51/51 (bloqueD) + 92/92 (B) + 82/82 (C) · 0 · OK |
| 2026-09-21 | **BLOQUE C INTEGRADO** (morosidad, recobro, expediente legal, comunicaciones solo por GAP 1, reglas §32–§37, UI de administración + espejo de mínimo privilegio del propietario): integración **selectiva** por Arena A (merge `--no-ff` `5293c3c` de `91bac8e`, hija directa de `5ff8448`) tras auditoría de los 33 ficheros (100 % aditivo; cero escritura en `registroCobros`; pago solo vía `cobrosEngine.registrarPagoPeriodo`; comunicaciones solo vía dispatcher GAP1, nunca `ENVIADA` sin transporte real; compromisos cubiertos solo con cobros reales; intereses sin tipo inventado). GAP1: se integra su implementación Firestore de `RepositorioNotificaciones` (email safe-mode). Corrección de coherencia: eliminada la función muerta `deleteExpedienteMorosidadFirestore` (contradecía la regla §32, que deniega el delete para todos). MAPA MAESTRO → BLOQUE C `COMPLETO`/INTEGRADO; pendientes reales declarados (transporte real GAP1, programador de detección, adjuntos Storage, gancho B a nivel interfaz) | `5ff8448` → `5293c3c` (+commit docs de la integración) | 409/409 + 92/92 + 82/82 · 0 · OK |
| 2026-09-20 | **BLOQUE C ENTREGADO EN SU RAMA (sin integrar)**: morosidad, recobro, expediente legal, comunicaciones solo por GAP 1, reglas §32–§37, UI de administración + espejo de mínimo privilegio del propietario, 79 tests + batería `test:bloque-c` (82 comprobaciones) y `docs/BLOQUE-C-*.md`. MAPA MAESTRO actualizado solo en lo relativo a estado (sin cambios funcionales) | `5ff8448` **sin cambios** (desde esta rama no se toca la canónica) | en la rama: 409/409 + 92/92 + 82/82 · 0 · OK |
| 2026-09-20 | **BLOQUE B INTEGRADO** (Tesorería + Liquidaciones + SEPA): integración selectiva de `arena/01a0bfd3` @ `87aed9a` sobre la base canónica (sin merge ciego). Nuevo motor de liquidaciones + SEPA PAIN.008/001 (preparación, sin envío real) + TesoreriaSection + «Mis Liquidaciones» en portal propietario + reglas §26–31 + origen GAP1 `TESORERIA` + conector GAP6 de evidencia + importación de gastos canónicos. Se descartó el MAPA MAESTRO de B y sus «rules 22–27» (choque de numeración/aislamiento). Diferencia 100 % aditiva en ficheros compartidos | `91da820` → commit `feat(tesoreria)` | 330/330 + 92/92 · 0 · OK |
| 2026-09-21 | ORDEN 15 — reconciliación global: MAPA §12 (clasificación A–F, 4 GAPs reales R1–R4, matriz GAP→Arena, orden técnico). Sin cambios funcionales | `2c47332` → commit docs | 638/638 · 0 · OK |
| 2026-09-21 | §6 F1–F4 (`f836a70`, `4994705`, `29d0542`, `f98feed`, `2c47332`); BLOQUE E (`10f07b3`), batería E (`7dcb3ea`), auditoría O9 (`7b45f4e`) | `2c47332` | 638/638 · 0 · OK |
| 2026-09-20 | 2.ª actualización del mapa maestro: Portal del Inquilino como BLOQUE E (dependencias B/C/D, PLANIFICADO ≠ IMPLEMENTADO) + Capa Transversal Experiencia/Ayuda/Tutoriales/IA (sin numeración GAP) + roadmap de evolución. Solo documentación; sin cambios funcionales | `91da820` | 330/330 · 0 · OK |
| 2026-09-20 | Paquete de continuidad (mapa maestro, contrato de integración, estado Git, manual de continuidad). Merge de alineación `d24ab1f` en rama de sesión (árbol ≡ `91da820`) | `91da820` | 330/330 · 0 · OK |
| 2026-09-20 | GAP8 integrado (commit `91da820`) | `91da820` | 330/330 · 0 · OK |
| 2026-09-19/20 | GAP7 (`8d72c01`), GAP6 (`58c5454`), GAP5 (`f76ae05`), GAP1–4 (`b1d45aa`) consolidados | `8d72c01` → … | en verde en cada consolidado (ver informes) |
| 2026-09-19 | Auditorías C vs A y D global (documentación) | — | — |
| 2026-09-16 | Diagnóstico funcional original vs main vs Arena (documentación) | — | — |

## REGLAS DE USO

1. «HEAD canónico» siempre se refiere a la rama canónica declarada (hoy
   `arena/01a0a413-…`); si Arena A designa otra rama canónica, se actualiza
   aquí el mismo día.
2. Los valores Tests/TSC/Build se re-verifican **al integrarse cualquier
   bloque**, no se copian por inercia.
3. Ningún secreto, token o credencial en este fichero (ni en diffs citados).
