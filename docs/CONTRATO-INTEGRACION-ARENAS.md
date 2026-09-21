# CONTRATO DE INTEGRACIÓN ENTRE ARENAS — ERP GESTOR DE INMUEBLES

> **Reglas permanentes** de trabajo multi-Arena sobre
> `github.com/sarqsan/Gestor-de-inmuebles-vercel`.
>
> Todo lo que no está escrito aquí se resuelve **conservando** el trabajo ajeno y
> **documentando** la decisión. Este contrato se actualiza solo por consenso
> documentado (commit de docs con referencia a la orden que lo motiva).

---

## 1. ROL DE CADA ARENA

| Arena | Mandato | Ámbito (ver `MAPA-MAESTRO-ERP-ACTUAL.md` §4-7) |
|---|---|---|
| **Arena A** | Rama canónica, integración, QA global, revisión de conflictos | Todo el ERP; decide qué se integra y en qué orden |
| **Arena B** | Tesorería + liquidaciones de propietarios + SEPA | **BLOQUE B** (PAIN.008 / PAIN.001, neto propietario, histórico) |
| **Arena C** | Morosidad + recobro + expediente de recuperación | **BLOQUE C** (deuda, comunicaciones, expediente, seguro impago) |
| **Arena D** | Entrada/salida + actas + evidencias + firma digital | **BLOQUE D** (check-in/out, inventario comparado, acta PDF, firma) |
| (Futuras) | BLOQUE E (portal inquilino + suministros) u otros | Solo con orden expresa |

**Cada Arena trabaja EXCLUSIVAMENTE en su bloque.** Si una orden cruza bloques,
se divide o se delega — no se «roba» trabajo de otra Arena.

## 2. BASE GIT IDENTIFICABLE

1. Toda Arena **ancla su sesión a un SHA exacto** de la rama canónica
   (`arena/01a0a413-gestor-de-inmuebles-vercel` o su sucesora designada por A)
   y lo declara en el informe: base `91da820` → HEAD final `<sha>`.
2. Cada bloque se entrega como **commits sobre una base identificable**, con
   mensajes `feat(bloque): …` que indiquen el bloque (B/C/D) y la orden.
3. **Prohibido** trabajar «a ciegas»: no se asume el estado del repo sin leer
   `docs/ESTADO-GIT-ERP.md` + `docs/MAPA-MAESTRO-ERP-ACTUAL.md` + `git log`.
4. Si la base del repo ha cambiado desde que se empezó la orden, **rebasar o
   reanclar conscientemente** (como hizo Arena C con el GAP8: reanclaje al
   consolidado `8d72c01` antes de entregar), y documentarlo.

## 3. NO SOBRESCRIBIR, NO MERGIAR A CIEGAS

1. **Ninguna Arena sobrescribe silenciosamente código de otra.** Los conflictos
   se resuelven con análisis, y la resolución se explica en el informe (política
   aplicable hoy: la línea canónica con tests en verde manda en disputas de
   funcionalidad equivalente — ver merge `d24ab1f` de la rama de sesión
   `arena/01a0bfbe-gestor-de-inmuebles-vercel`).
2. **No se hacen merges ciegos.** Todo merge exige: diff revisado, tests en
   verde tras el merge, y nota de la política de resolución.
3. El trabajo de una Arena que no se integra **no se borra**: permanece en su
   rama de sesión/historial y se documenta en el mapa maestro (§9 de este repo).
4. **Arena A es la única que integra en la rama canónica.** B/C/D entregan
   rama de sesión + informe; A integra (o reencuadra) y actualiza la
   documentación canónica en el mismo commit de integración.
5. **Revisión de conflictos:** cualquier conflicto entre bloques lo arbitra
   Arena A documentando la decisión en el mapa maestro.

## 4. CIERRE DE ORDEN (checklist obligatorio de CUALQUIER Arena)

Un bloque NO se considera terminado hasta que **todo** lo siguiente consta:

| # | Requisito | Comprobación |
|---|---|---|
| 1 | Tests del bloque (vitest) | `npx vitest run` → suite completa en verde (≥330 + los nuevos, 0 fallos) |
| 2 | TypeScript | `npx tsc --noEmit` → 0 errores |
| 3 | Build | `npm run build` → OK |
| 4 | Commit | Mensaje con bloque y orden; trabajo 100 % commiteado |
| 5 | Push | Push a la rama de sesión; SHA verificado con `git ls-remote` |
| 6 | Worktree limpio | `git status` → nothing to commit |
| 7 | **Informe** | En `docs/` (o entregado con la orden): base SHA → HEAD SHA, qué toca, qué NO toca, tests, limitaciones reales, dependencias externas, política de resolución si hubo conflictos |
| 8 | **Actualización de continuidad** | Si la orden cambia el estado del ERP: actualizar `MAPA-MAESTRO-ERP-ACTUAL.md` y `ESTADO-GIT-ERP.md` en el commit de integración |

## 5. REGLAS TÉCNICAS PERMANENTES (no romperse)

1. **Motores puros:** la lógica de negocio vive en `src/utils/*Engine.ts` /
   `src/notificaciones/` / `src/utils/conciliacion/` — determinista, sin I/O,
   con tests. La UI no contiene lógica económica; `src/lib/firebase.ts` no
   contiene reglas de negocio.
2. **Idempotencia e identidad determinista** donde ya existen (GAP1 keys,
   GAP6 importaciones, GAP7 huella encadenada, GAP8 `idempotencyKey`): no
   romperse; todo replay debe ser inocuo.
3. **Históricos append-only** (contratos, finiquito, inventario, conciliación,
   B2B, auditoría): se añaden, no se reescriben ni se borran.
4. **Reglas Firestore:** aislamiento por `propietarioId` + catch-all
   deny-by-default. Los inmutables documentados (contratos, facturas, B2B,
   inventario_historial, `sinSecretos()`) no se relajan sin orden expresa.
5. **Sin secretos** en código, Firestore, Storage ni commit. Los secretos
   (GEMINI_API_KEY, certificados AEAT, credenciales SEPA/portales) viven en
   entorno/secretos del usuario.
6. **Nada se simula como producción:** los adaptadores pendientes (SPFE,
   plataformas privadas, SEPA, firma) declaran su estado `PENDIENTE`
   explícito y **nunca** emiten un falso envío/aceptación.
7. **Normativa:** no se codifican reglas fiscales/bancarias/jurídicas sin
   verificación documental. Los temporales son configurables, no «plazos
   legales», salvo verificación expresa.
8. **Interfaces entre bloques** (ver mapa maestro §8): B2B copia (no
   recalcula) importes de GAP7; GAP6 escribe en cobros solo vía
   `registrarPagoPeriodo`; GAP5 lee habitaciones sin modificar el circuito;
   GAP3 es solo lectura; los eventos de GAP2/7/8 usan el dispatcher de GAP1.
9. **Capa Transversal de Experiencia/Ayuda/Tutoriales/IA** (mapa maestro §6,
   **sin numeración GAP**): cuando se implemente, la IA opera siempre dentro
   de los permisos del usuario; no inventa estados ni acciones, no marca
   procesos completados sin confirmación real ni sustituye los controles del
   ERP; la lógica de negocio vive siempre en los motores oficiales. Todo
   bloque (B/C/D/E) debe exponer estados/transiciones/permisos/eventos/
   acciones interpretables (mapa maestro §6.3).

## 6. CONFLICTOS TÍPICOS Y CÓMO RESOLVERLOS

| Situación | Regla |
|---|---|
| Dos Arenas tocan el mismo motor | Quien entrega primero (con tests verdes) integra; el segundo **reancla** a la nueva base y re-entrega |
| B necesita una mejora en cobros | No la hace él: la pide por orden a A (o la lleva a su informe como dependiente) |
| C necesita recordatorios | Usa el dispatcher de GAP1 (plantillas aditivas); no crea segundo canal |
| D necesita acta PDF | Usa `pdfExportEngine`/jsPDF; no añade librerías de PDF |
| B necesita IBANs del propietario | Lee `propietarios` (ya existen cuentas múltiples); no duplica datos bancarios en otra colección |
| Cambio de reglas que afecta a varios bloques | Solo A lo integra; exige re-verificación de las suites de todos los bloques afectados |

## 7. VERSIÓN Y APLICACIÓN

- Versión 1.0 — 2026-09-20 (paquete de continuidad sobre consolidado `91da820`).
- Aplicable a todas las sesiones de Arena A/B/C/D sobre este repositorio desde
  su creación, y a las posteriores salvo cambio documentado.

---

## 8. ANEXO — CONSTANCIA DE ENTREGAS (informativo; no crea ni modifica reglas)

| Fecha | Bloque | Rama de entrega | BASE | Estado | Verificación declarada |
|---|---|---|---|---|---|
| 2026-09-20 | **BLOQUE C** — Morosidad + recobro + expediente legal | `arena/01a0c03d-gestor-de-inmuebles-vercel` | `5ff8448` | **ENTREGADO EN RAMA**; **INTEGRADO en canónica (Arena A, 2026-09-21, merge `5293c3c`)** tras auditoría selectiva 33/33 ficheros | `test:bloque-c` 82 PASS · vitest 409/409 · `test:bloque-b` 92/92 (sin regresión) · `tsc --noEmit` 0 · build OK — re-verificado sobre la canónica 2026-09-21. Docs: `docs/BLOQUE-C-*.md` |
| 2026-09-21 | **BLOQUE D** — Actas de entrada/salida + firma OTP + PDF | `arena/01a0ab9d-gestor-de-inmuebles-vercel` | `9cb01a43` | **INTEGRADO SELECTIVAMENTE en canónica (Arena A, 2026-09-21, commit `d606ff8`)** tras auditoría de los 20 ficheros (0 conflictos). Excluido su `5d3ae7f` (`feat(gap6)`): duplicaba el GAP6 ya consolidado en la canónica. Reglas D renumeradas a §38 (colisión con §25 = GAP7) | `bloqueD.test.ts` 51/51 · `test:bloque-b` 92/92 · `test:bloque-c` 82 PASS · vitest 460/460 · `tsc --noEmit` 0 · build OK — verificado sobre la canónica 2026-09-21. Docs: `docs/BLOQUE_D_ACTAS.md` |

Notas de aplicación a esta entrega (conforme a §5 y §6; no son reglas nuevas):

- El BLOQUE C **no** ha modificado motores ajenos (cobros, tesorería, dispatcher GAP 1, conciliación):
  la diferencia en los ficheros compartidos es aditiva. Cualquier ajuste que Arena A considere
  necesario se hace **en la canónica**, no reescribiendo la rama de C.
- El bloque consume GAP 1 para las comunicaciones (10 plantillas aditivas `morosidad.*` + origen
  `MOROSIDAD`) y rellena el hueco del `RepositorioNotificaciones` persistente: **Arena A decide** si
  esa implementación pasa a ser canónica de GAP 1 o queda como adaptador del módulo de morosidad.
- Reglas Firestore numeradas **§32–§37** (no reutilizan numeración de otros bloques) y `notificaciones`
  no re-regulado: sin conflicto con §22 (GAP 1) ni con §26–§31 (BLOQUE B).
- **BLOQUE D no iniciado** desde esta rama (tampoco el portal del inquilino, que es BLOQUE E).
