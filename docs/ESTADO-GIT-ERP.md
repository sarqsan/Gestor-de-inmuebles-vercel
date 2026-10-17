# ESTADO GIT DEL ERP — REGISTRO DE ESTADO

> Registro vivo del estado Git del proyecto. **Cada orden que integre o cambie
> el estado actualiza este fichero en el mismo commit.** No se almacenan
> secretos en este documento.

## ENTREGA EN RAMA — FASE A (avisos reales) + GMAIL POR SMTP — **PR #42 ABIERTA, NO FUSIONADA**

| Campo | Valor |
|---|---|
| Orden | Cerrar la Fase A de la orden de capacidades: avisos que de verdad salen. Decisiones del 16-10-2026: transporte inicial **Gmail por SMTP** (contraseña de aplicación), aviso del día 5 **solo correo + bandeja**, verificación del justificante (Fase B) por **el propietario**, capa de **banco Nivel 1** registrada para cuando corresponda, SEPA y WhatsApp descartados |
| Ramas | Sesión `arena/7eef00ef-gestor-de-inmuebles-vercel`; destino de integración `main`. **`main` no se ha tocado desde esta rama** |
| BASE sobre la que se desarrolló | `ad113d7` (= `main` tras el PR #39) |
| `main` en el momento de resolver | `7647e2f` (merge de la PR #41, IA · claves `AQ.`), que incorpora `3d285e8` (PR #40) y `264e70e` (parches de PR #41/#42 en `patches/pr42/`) |
| Commits | `904e582` (núcleo de la Fase A: verificador+perfil, correo real vs modo seguro, reloj cron, bandeja) · `b25ca7c` (docs, Fase 0) · `cf5fcf7` (Gmail por SMTP + arreglo del enmascarado de credenciales) · `d86f451` · `f808831` · `3eb23ce` (guía de puesta en marcha en Vercel/Gmail) · `27c5a17` (el aviso identifica el inmueble; Reply-To al propietario; arreglo del cuerpo renderizado) · `ffd047a` (docs: cuenta dedicada, ejemplo real del aviso, nota de la incidencia de custodia) · `69d4bbd` (punto de retorno de la Fase A) |
| HEAD de la rama | `69d4bbd` antes de resolver los conflictos; el HEAD publicado es el **commit de merge de `main` (`7647e2f`) en esta rama**, verificado con `git ls-remote` |
| Integración | **PR #42 abierta contra `main`, NO fusionada.** Al abrirla quedó en `CONFLICTING` (`mergeStateStatus: DIRTY`) **solo por dos documentos**: `docs/ESTADO-GIT-ERP.md` y `docs/MAPA-MAESTRO-ERP-ACTUAL.md`. Resueltos en esta rama conservando la información válida de las dos partes (fila «Resolución de conflictos»). **No se ha fusionado ni desplegado** |
| Resolución de conflictos | Se fusionó `main` (`7647e2f`) en la rama sin reescribir historial. En **`docs/MAPA-MAESTRO-ERP-ACTUAL.md`** se conservó la versión de `main` en la fila y el anexo de la Orden IA 9 (más completos y verificados), y se mantuvieron íntegros la actualización A16-03, el §8 completo (8.1–8.9) y las decisiones de esta orden. En **este fichero** se conservó el bloque de la Fase A y se adoptó el bloque de la Orden IA 9 de `main` (ya «INTEGRADA EN `main`»). **Sin cambios en código funcional** |
| Cambios | Transporte SMTP (`server/notificaciones/proveedorSmtp.ts`, nodemailer 6.10.1), resolución del transporte con modo REAL/MODO_SEGURO (`proveedoresEmail.ts`), reloj de avisos y endpoint de cron protegido, repositorio duradero de notificaciones, bandeja de avisos (`'avisos'` en la navegación), plantillas de cobro reescritas sin datos sensibles, Reply-To extremo a extremo, `EMAIL_DESPACHO_NOMBRE`/`EMAIL_REPLY_TO`, identidad del despacho, `.env.example` y guía de puesta en marcha |
| No tocado (verificado) | `firestore.rules`, `storage.rules`, `firebase.json`, `.firebaserc`, migraciones, datos y `main`. El `crons` de `vercel.json` ya existía de la fase anterior. En la resolución documental **no** se tocó SMTP, notificaciones, cron, permisos ni dependencias |
| Tests (mismo SHA) | Suite completa tras la fusión de `main`: **232 ficheros · 4.294 passed · 7 todo · 2 fallos**, ambos en `tests/guardia-a04-rama-sesion.test.ts` (la guardia exige la rama publicada; se re-ejecuta tras el push y el resultado se anota en la fila siguiente) · `npx tsc --noEmit`: **0 errores**. El build y la guardia se verifican tras publicar. |
| Estado de IA | **CONSUMO BLOQUEADO** (sin cambios en esta ronda) |
| Pendientes reales | (1) **Variables de Vercel ya creadas por el responsable** (`EMAIL_PROVEEDOR`, `SMTP_URL`, `EMAIL_FROM`, `CRON_SECRET`, `EMAIL_DESPACHO_NOMBRE`, `EMAIL_REPLY_TO`): no verificadas desde esta rama. (2) **Desplegar la Fase A** (fusión de la PR #42): hasta entonces `main` no contiene SMTP ni el cron, y `/api/health` no publica `notificaciones`. (3) Prueba real con un recibo vencido y anotación de la evidencia (mapa §8). (4) `patches/pr42/02-smtp-aceptacion-y-seguridad.patch` (endurecimiento de la aceptación SMTP) **aplicable pero no aplicado**: decisión posterior, fuera del alcance de esta orden. El `01-compatibilidad-41.patch` ya **no aplica** (sus cambios están en `main` por la PR #41) |
| Incidencia | Re-clonado del repositorio durante las verificaciones (rama reiniciada al commit base, `origin/arena/…` ausente): resuelto sin pérdida con `fetch` + `update-ref` + `reset -q HEAD`. Registro y protocolo: mapa §8.9 y `docs/CONTINUIDAD-FASE-A-RONDA-2026-10-16.md` §6 |
| Worktree / Remoto | CLEAN / SYNCED tras publicar la resolución |

## INTEGRACIÓN — FASE IA 9 (2026-10-16, PR #39) — **INTEGRADA EN `main`**

| Campo | Valor |
|---|---|
| Orden | IA del MAPA MAESTRO · Fase 9 (llaves de usuario): DECISIÓN §11 = **Vía 2** (clave propia de cada usuario) + alta guiada (§11.2) + tutorial PDF imprimible (§11.2.8). Diseño: `docs/IA-FASE-9-LLAVES-DE-USUARIO-DISENO-Y-DECISIONES.md` (**reconstrucción** declarada: el original y los commits `bf1d1b4`/`f63fbfe`/`1efe2c9`/`37b23f1` no existen en el remoto ni en ningún reflog) |
| Ramas | Entrega `arena/b93c6727-gestor-de-inmuebles-vercel` (HEAD `71f27a9`); integración documental (§4.8) `arena/982887a8-gestor-de-inmuebles-vercel`; destino `main` |
| BASE sobre la que se desarrolló | `4309f48dc017b32fd5c28e0d3282d772fd2dd237` (= `main` tras el PR #38) |
| Commits de la entrega | `815fb5d` (diseño) · `0537ce5` (implementación) · `baeb38e` (corrección de montaje por defecto + regresión) · `7ebd038` (informe de cierre, MAPA, ESTADO GIT) · `71f27a9` (fija el HEAD de la entrega). Verificado con `gh pr view 39` y `git log ad113d7^2` |
| Integración | **PR #39 fusionada en `main`** el 2026-10-16 (15:26 UTC), merge commit **`ad113d7`** (`--merge`, dos padres: `4309f48` base y `71f27a9` HEAD de la entrega). CI del repositorio en verde antes del merge: «Reglas Firestore y Storage (emuladores oficiales)» → `pass`; «Tipos, suite completa y build» → `pass`; Vercel → `pass`. Informe de cierre: `docs/IA-FASE-9-INFORME-CIERRE.md` |
| Cambios | 24 ficheros, ≈ +3.200 / −15 (14 nuevos): contrato puro y tutorial declarativo (`src/ia/{llavesUsuarioContrato,tutorialLlaveUsuarioIA}.ts`); cifrado AES-256-GCM con AAD = uid (`server/ia/cifradoLlavesIA.ts`); servicio `ia_llaves`/`ia_llaves_eventos` con CAS e idempotencia (`server/ia/llavesUsuarioIA.ts`); rutas `GET/PUT/DELETE /api/ia/llave` y `POST /api/ia/llave/verificar` (`server/ia/rutasLlavesIA.ts`); núcleo: cliente del proveedor **sólo** con la llave del usuario, cabecera `X-IA-Llave-Usuario`, 428 `LLAVE_USUARIO_REQUERIDA` (EXIGIR), 503 fallo cerrado, `ia.llaves` en health; `GEMINI_API_KEY` deja de alimentar operaciones; UI `AltaGuiadaLlaveIA` en Configuración + PDF (jsPDF); script `ia:llaves:clave-maestra`; `.env.example` |
| No tocado (verificado) | `firestore.rules`, `firebase.json`, `.firebaserc`, `vercel.json`, dependencias, migraciones y datos. Las colecciones nuevas son de acceso exclusivo por servidor y las cubre el catch-all `deny-by-default` (prueba estática) |
| Re-verificación sobre `main` (`ad113d7`, 2026-10-16) | Suite completa `npx vitest run`: **231 ficheros · 4.234 passed · 7 todo · 0 fallos** (exit 0). `npx tsc --noEmit -p .`: **0 errores**. `npm run build`: **OK** (sólo el aviso preexistente de chunk > 500 kB). `npx tsx scripts/guardia-a04-repositorio.mts`: **A-04: OK**. Incidencia de la primera pasada: la guardia A-04 dio BLOCKED porque la rama de sesión existía sólo en local; al publicarla (`origin/arena/982887a8-…` = `ad113d7`) pasó a OK y sus 2 tests (`guardia-a04-rama-sesion`) quedaron en verde. Sin código modificado |
| Estado de IA | **CONSUMO BLOQUEADO** (sin cambios): 503 `APROBACION_COMERCIAL_PENDIENTE` sin política; además, sin `IA_LLAVES_CLAVE_MAESTRA` el subsistema de llaves queda `NO_CONFIGURADO` (503 `LLAVES_NO_CONFIGURADAS` en el alta; sin cliente del proveedor). **Ninguna variable nueva configurada** en Vercel ni en ningún entorno |
| Pendientes reales | (1) Decisión del responsable: clave maestra `IA_LLAVES_CLAVE_MAESTRA` (generar y guardar como secreto), `IA_LLAVES_SIN_LLAVE` (`RESPALDO`/`EXIGIR`) e `IA_LLAVES_VERIFICACION` (`DESACTIVADA`/`PROVEEDOR`). (2) Fases 7–8 (política `IA_POLITICA_JSON` aprobada, `npm run ia:validar-entorno`, credencial de servicio de Firebase) como requisito previo. (3) Rotación/recifrado de la clave maestra: fuera de alcance. (4) Revisión con Firestore real y Gemini real: no ejecutada (sin consumo) |
| Worktree / Remoto | CLEAN / SYNCED (rama de sesión publicada en `origin` a `ad113d7`) |

## INTEGRACIÓN — ORDEN IA FASES 5–8 (2026-10-16, PR #38)

| Campo | Valor |
|---|---|
| Orden | IA del MAPA MAESTRO · Fases 5 (asistente de incidencias del inquilino), 6 (seguimiento y trazabilidad), 7 (gobierno de permisos/costes) y 8 (validación no productiva) |
| Ramas | Sesión `arena/658e62cd-gestor-de-inmuebles-vercel`; destino de integración `main` |
| BASE sobre la que se desarrolló | `6280e017bc18c1540fc52c76acd72a78a31f1309` (= `main` tras el PR #37) |
| HEAD de la rama | `3a9c456` (verificado con `git ls-remote`); commits `c71c792` · `d6a6430` · `0a48357` · `2de454b` · `b55d01c` · `3a9c456` |
| Integración | **PR #38 fusionada en `main`** (2026-10-16, autorizada expresamente). CI del repositorio en verde antes del merge: «Tipos, suite completa y build» y «Reglas Firestore y Storage (emuladores oficiales)» → `pass`. Informe de cierre de orden: `docs/IA-FASES-5-8-INFORME-CIERRE.md` |
| Cambios | 51 ficheros, +8.295 / −187 (26 nuevos): 12.ª operación `ASISTENTE_INCIDENCIAS_INQUILINO`; `src/seguimiento/incidencias.ts` + `server/seguimiento/*` (hilo append-only con CAS, avisos por dispatcher GAP 1 con estado real de entrega); `server/notificaciones/repositorioNotificacionesFirestore.ts` (`notificaciones` + `notificaciones_entregas`); contrato de política TODO O NADA (sin comodines, sin tarifas implícitas, cuotas finitas) con **deny-by-default** por defecto; portal del inquilino (asistente + evolución); scripts `ia:verificar-politica` y `ia:validar-entorno` |
| No tocado (verificado) | `firestore.rules`, `firebase.json`, `.firebaserc`, `vercel.json`, dependencias, migraciones y datos. Las colecciones nuevas son de acceso exclusivo por servidor y las cubre el catch-all `deny-by-default` |
| Tests (mismo SHA) | Suite completa **228 ficheros · 4.185 passed · 7 todo · 0 fallos**; `npx tsc --noEmit -p .` **0 errores**; 12 suites IA de fase con sus cifras en el informe |
| Estado de IA | **CONSUMO BLOQUEADO**: sin `IA_POLITICA_JSON` el servidor responde 503 `APROBACION_COMERCIAL_PENDIENTE`; con política mal formada, 503 `POLITICA_IA_INVALIDA`. Sin credenciales ni coste real; la activación gradual exige autorización expresa y los límites de gasto verificados (Fase 8) |
| Pendientes reales | Límites/presupuesto y cuotas de API del proveedor verificados en Google Cloud; cableado fino de los modales profesionales a la sincronización; reintentos programados de avisos pendientes; proyecto/entorno no productivo dedicado para la activación gradual |
| Worktree / Remoto | CLEAN / SYNCED |

## ESTADO ACTUAL (actualizado 2026-09-21)

| Campo | Valor |
|---|---|
| Repositorio remoto | `origin` → `https://github.com/sarqsan/Gestor-de-inmuebles-vercel.git` |
| Rama canónica | `arena/01a0bfbe-gestor-de-inmuebles-vercel` (sesión Arena A; la canónica histórica `arena/01a0a413-…` queda en `91da820`) |
| HEAD canónico | **`5e47fc2`** — `merge(gap-r3): integrar seguridad ficha publica de inmueble` (integración de GAP-R3; último commit funcional). Cadena reciente: `c39f183` (O16, GAP-R4) → 4 commits no autorizados y sus 4 reverts (`2332bb1`…`a229a98`, árbol ≡ `c39f183`) → `a18967f` (R1) → `92c8185` (R2) → `5e47fc2` (R3) |
| Último commit canónico | `5e47fc2` — integración selectiva (cherry-pick `-x`) de GAP-R3 desde Arena B |
| Último bloque integrado | **GAP-R3 — Seguridad de la ficha pública de inmueble** (`5e47fc2`), precedido por **GAP-R2** (`92c8185`) y **GAP-R1** (`a18967f`), todos desarrollados en Arena B e integrados por Arena A el 2026-09-21; antes, **BLOQUE D** (commit `d606ff8`) — precedido por **BLOQUE C** (merge `5293c3c`) y **BLOQUE B** (2026-09-20, commit `feat(tesoreria)`) |
| GAP 1–8 | **CONSOLIDADOS** (commits `b1d45aa` → `91da820`) — intactos tras B, C y D (regresión 460/460); GAP1 con su implementación Firestore de `RepositorioNotificaciones` vía BLOQUE C; GAP6 canónico intacto (el GAP6 alternativo de la rama D fue excluido) |
| RAMA DE SESIÓN ACTUAL | `arena/01a0bfbe-gestor-de-inmuebles-vercel` |
| — GAP-R1 / R2 / R3 (trazabilidad B → A) | **R1** desarrollo B `415de41` ↓ integración A `a18967f` · **R2** desarrollo B `58a495a` ↓ integración A `92c8185` · **R3** desarrollo B `8534b43` ↓ integración A `5e47fc2`. Origen: rama `arena/01a0bfd3-gestor-de-inmuebles-vercel` (cadena lineal `415de41`→`58a495a`→`8534b43`). Método: `git cherry-pick -x --no-commit` de cada commit, diff verificado idéntico al origen, un commit de integración por GAP, 0 conflictos. Estado: **CERRADOS / INTEGRADOS**. Pendientes reales: validación Firebase real, despliegue de reglas, backfill de fichas públicas (MAPA §12.6) |
| — integración BLOQUE D | Commit `d606ff8` — `feat(actas): integrar bloque D en ERP canonico`: integración **selectiva** (auditoría 20/20 ficheros, 0 conflictos) de `arena/01a0ab9d` @ `672b7ee` (commits `698e9e6`+`672b7ee`; **excluido** su `5d3ae7f` `feat(gap6)`, que duplicaba el GAP6 canónico). Nuevo: `src/utils/actas/*` (7 motores + 51 tests), `types/actas.ts`, `lib/firebaseActas.ts` (4 colecciones), `ActasSection.tsx`, reglas §38 (renumerado desde «25» de D), storage `actas_fotos`/`actas_pdfs`, `firestore.indexes.json`, navegación (App/Sidebar/MobileNav/Header). Ajustes: predicado OTP reforzado + limpieza real de `codigoPlainTemporal` tras uso. Informe: `docs/BLOQUE_D_ACTAS.md` |
| — merge de alineación | `d24ab1f` — merge de la canónica `91da820` en la rama de sesión (antes: rama basada en `main` `4d420bd`, árbol **sin** GAP 1–8). Árbol resultante byte-idéntico a `91da820` (verificado: `git diff --cached 91da820` = ∅) |
| — commits de docs | `docs: crear paquete de continuidad y mapa maestro ERP` · `docs: actualizar mapa maestro con portal inquilino y capa IA` |
| — integración BLOQUE B | Commit `feat(tesoreria): integrar bloque B en ERP canonico` — integración **selectiva** de `arena/01a0bfd3` @ `87aed9a` (NO merge ciego; la rama B trabajaba sobre `main` sin GAP1–8). Informe: `docs/integracion-BLOQUE-B-2026-09-20.md`. Nuevo: `src/tesoreria/*` (9 módulos), `TesoreriaSection.tsx`, `lib/tesoreriaFirestore.ts`, `lib/conciliacionSession.ts`, reglas §26–31, origen GAP1 `TESORERIA` + 7 plantillas, script `test:bloque-b` (92 tests) |
| Tests | **899/899** (38 ficheros vitest tras R3: 835 de O16 + 15 R1 + 20 R2 + 29 R3) + **92/92** (`npm run test:bloque-b`) + **82 PASS** (`npm run test:bloque-c`) + **64/64** (`npm run test:bloque-e`) — re-verificados 2026-09-21 |
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
| 2026-10-16 | **Aviso «sin IA» en el asistente del inquilino** (decisión 1 = `RESPALDO`): si la cabecera `X-IA-Llave-Usuario` es `ausente`, el diagnóstico indica que es análisis por reglas. El inquilino **no** registra llave (decisión del responsable): el aviso no le pide hacerlo. Solo cliente y UI; el servidor no cambia. Pendiente de diseño: que el consumo lo pague el propietario (ver PR #40) | `1c79c6e` + commit de aviso | 231 ficheros · 4.236 passed · 7 todo · 0 fallos · tsc 0 · build OK |
| 2026-10-16 | **FASE IA 9 INTEGRADA EN `main`** (llaves de usuario, Vía 2): PR #39 fusionada, merge `ad113d7` (base `4309f48`, HEAD de la entrega `71f27a9`). Re-verificación de la suite sobre `main`; guardia A-04 en OK tras publicar la rama de sesión. Consumo de IA **bloqueado**; sin variables configuradas | `ad113d7` | 231 ficheros · 4.234 passed · 7 todo · 0 fallos · tsc 0 · build OK · A-04 OK |
| 2026-09-21 | **GAP-R3 INTEGRADO — seguridad ficha pública de inmueble**: cherry-pick `-x` de `8534b43` (Arena B, padre `58a495a`). `firestore.rules` §1 `inmuebles` deja de ser público (get staff/inquilino vinculado, list staff; escrituras intactas) + nueva `fichas_publicas_inmueble` (get público por id, list autenticado, lista blanca cerrada de claves); `storage.rules`: `inmuebles/{id}/inventario/**` interno; `lib/fichaPublicaInmueble.ts`, `lib/firebase.ts` (espejo), `App.tsx` (suscripción de `inmuebles` solo autenticada; funnel anónimo por ficha). Auto-merge limpio (offsets §6/E), hunks idénticos. **Pendientes:** reglas no desplegadas; validación Firebase real; sin backfill de fichas existentes | `92c8185` → `5e47fc2` | R3 29/29 · R1 15/15 · R2 20/20 · **899/899** (38) + B 92 + C 82 + E 64 · 0 · OK |
| 2026-09-21 | **GAP-R2 INTEGRADO — evidencias de morosidad en Storage**: cherry-pick `-x` de `58a495a` (Arena B, padre `415de41`). `lib/morosidadEvidenciasStorage.ts` (subida validada, sin base64), `MorosidadDetalleModal.tsx` (adjuntar + metadato vía `crearEvidencia`), `storage.rules` +20 líneas solo bloque `morosidad_evidencias` (master-admin, append-only). `firestore.rules`, índices y motor C intactos. **Pendientes:** `storage.rules` no desplegado; validación Firebase real | `a18967f` → `92c8185` | R2 20/20 · R1 15/15 · **870/870** (37) + B 92 + C 82 + E 64 · 0 · OK |
| 2026-09-21 | **GAP-R1 INTEGRADO — persistencia Firestore de la conciliación bancaria (GAP6)**: cherry-pick `-x` de `415de41` (Arena B, padre `97ea0cb`). `lib/conciliacionFirestore.ts` (colecciones ya reguladas `movimientos_bancarios`/`conciliaciones_bancarias`/`importaciones_bancarias`), `ConciliacionBancariaSection.tsx` (carga al montar, persistencia de importaciones y propuestas). Motores GAP6, `cobrosEngine`, reglas e índices intactos | `a229a98` → `a18967f` | R1 15/15 · **850/850** (36) + B 92 + C 82 + E 64 · 0 · OK |
| 2026-09-21 | **RESTITUCIÓN (orden expresa)**: reverts `e0df94e`, `bc5548f`, `1721bf2`, `a229a98` de los cuatro commits no autorizados posteriores a O16 (`2332bb1` pliego R1 docs, `e3e563a` docs, `c90777f` correctiva D2 en producción, `b7af31c` docs). Árbol final byte-idéntico a `c39f183`; D1/D2/D3 siguen **no corregidos**; historia conservada | `c39f183` → `a229a98` (árbol ≡ `c39f183`) | 835/835 (35) + B 92 + C 82 + E 64 · 0 · OK |
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
