# ESTADO GIT DEL ERP — REGISTRO DE ESTADO

> Registro vivo del estado Git del proyecto. **Cada orden que integre o cambie
> el estado actualiza este fichero en el mismo commit.** No se almacenan
> secretos en este documento.

## ESTADO ACTUAL (actualizado 2026-09-20)

| Campo | Valor |
|---|---|
| Repositorio remoto | `origin` → `https://github.com/sarqsan/Gestor-de-inmuebles-vercel.git` |
| Rama canónica | `arena/01a0a413-gestor-de-inmuebles-vercel` |
| HEAD canónico | `91da820b5c18b93b9bdcf1aa9be0a185650948f8` |
| Último commit canónico | `91da820` — `feat(integracion): integrar GAP 8 de factura electronica B2B` |
| Último bloque integrado | **BLOQUE B — Tesorería + Liquidaciones + SEPA** (INTEGRADO EN ARENA A, 2026-09-20, commit `feat(tesoreria): integrar bloque B en ERP canonico`) |
| GAP 1–8 | **CONSOLIDADOS** (commits `b1d45aa` → `91da820`) — intactos tras la integración de B (regresión 330/330) |
| RAMA DE SESIÓN ACTUAL | `arena/01a0bfbe-gestor-de-inmuebles-vercel` |
| — merge de alineación | `d24ab1f` — merge de la canónica `91da820` en la rama de sesión (antes: rama basada en `main` `4d420bd`, árbol **sin** GAP 1–8). Árbol resultante byte-idéntico a `91da820` (verificado: `git diff --cached 91da820` = ∅) |
| — commits de docs | `docs: crear paquete de continuidad y mapa maestro ERP` · `docs: actualizar mapa maestro con portal inquilino y capa IA` |
| — integración BLOQUE B | Commit `feat(tesoreria): integrar bloque B en ERP canonico` — integración **selectiva** de `arena/01a0bfd3` @ `87aed9a` (NO merge ciego; la rama B trabajaba sobre `main` sin GAP1–8). Informe: `docs/integracion-BLOQUE-B-2026-09-20.md`. Nuevo: `src/tesoreria/*` (9 módulos), `TesoreriaSection.tsx`, `lib/tesoreriaFirestore.ts`, `lib/conciliacionSession.ts`, reglas §26–31, origen GAP1 `TESORERIA` + 7 plantillas, script `test:bloque-b` (92 tests) |
| Tests | **330/330** (16 ficheros vitest, regresión) + **92/92** (`npm run test:bloque-b`) — verificados 2026-09-20 en la rama de sesión |
| TypeScript | `npx tsc --noEmit` → **0 errores** — verificado 2026-09-20 |
| Build | `npm run build` → **OK** (warning conocido de chunk >500 kB) — verificado 2026-09-20 |
| Worktree | CLEAN |
| Remoto | SYNCED (push verificado con `git ls-remote`) |
| Fecha de actualización | 2026-09-20 |

## ENTREGA EN RAMA — BLOQUE C (2026-09-20) — **NO INTEGRADO**

| Campo | Valor |
|---|---|
| Bloque | **BLOQUE C — Morosidad avanzada, recobro y expediente legal** |
| Rama de entrega | `arena/01a0c03d-gestor-de-inmuebles-vercel` |
| BASE sobre la que se desarrolló | `5ff8448301ba2e49f4418f9a66d66ec2ff5eb15f` (HEAD canónico tras la integración de B) |
| Commit de cierre | `feat(morosidad): cerrar bloque C de recobro y expediente` (commit único de cierre; sin merge con la canónica) |
| Estado de integración | **NO INTEGRADO en la rama canónica.** Queda a disposición de Arena A para auditoría e integración selectiva |
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
| `arena/01a0bfbe-gestor-de-inmuebles-vercel` | (ver arriba) | Sesión de continuidad: canónica + paquete de continuidad |
| `main` | `4d420bd` | Línea paralela AI Studio (mantenimiento/candidatos/seguros) — preservada, no es base del ERP |
| `arena/01a0bfd3-gestor-de-inmuebles-vercel` | `87aed9a` | BLOQUE B (Tesorería/Liquidaciones/SEPA) sobre `main` — **integrado selectivamente en la rama de sesión (2026-09-20)**; la rama se conserva como origen de referencia |
| `arena/01a0c03d-gestor-de-inmuebles-vercel` | (ver sección «ENTREGA EN RAMA — BLOQUE C») | **BLOQUE C** (morosidad/recobro/expediente legal) sobre `5ff8448` — **DESARROLLADO Y ENTREGADO EN RAMA, NO INTEGRADO** |
| `arena/01a0ab19-…` / `01a0ab97-…` / `01a0ab9d-…` / `01a0b91c-…` | (variados) | Sesiones históricas de Arenas (trabajo de GAPs y auditorías) |
| `recovery/arena-a`, `recovery/arena-b-content` | (variados) | Ramas de recuperación históricas |
| `refs/pull/1/head` | `29a9795` | PR histórica |

## HISTORIAL DE ESTADO (filas nuevas arriba)

| Fecha | Evento | HEAD canónico | Tests / TSC / Build |
|---|---|---|---|
| 2026-09-20 | **BLOQUE C ENTREGADO EN SU RAMA (sin integrar)**: morosidad, recobro, expediente legal, comunicaciones solo por GAP 1, reglas §32–§37, UI de administración + espejo de mínimo privilegio del propietario, 79 tests + batería `test:bloque-c` (82 comprobaciones) y `docs/BLOQUE-C-*.md`. MAPA MAESTRO actualizado solo en lo relativo a estado (sin cambios funcionales) | `5ff8448` **sin cambios** (desde esta rama no se toca la canónica) | en la rama: 409/409 + 92/92 + 82/82 · 0 · OK |
| 2026-09-20 | **BLOQUE B INTEGRADO** (Tesorería + Liquidaciones + SEPA): integración selectiva de `arena/01a0bfd3` @ `87aed9a` sobre la base canónica (sin merge ciego). Nuevo motor de liquidaciones + SEPA PAIN.008/001 (preparación, sin envío real) + TesoreriaSection + «Mis Liquidaciones» en portal propietario + reglas §26–31 + origen GAP1 `TESORERIA` + conector GAP6 de evidencia + importación de gastos canónicos. Se descartó el MAPA MAESTRO de B y sus «rules 22–27» (choque de numeración/aislamiento). Diferencia 100 % aditiva en ficheros compartidos | `91da820` → commit `feat(tesoreria)` | 330/330 + 92/92 · 0 · OK |
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
