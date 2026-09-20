# CONTINUIDAD PARA NUEVAS SESIONES DE ARENA — ERP GESTOR DE INMUEBLES

> Manual operativo. Si llegas a este proyecto sin contexto previo, lee este
> documento + `MAPA-MAESTRO-ERP-ACTUAL.md` + `CONTRATO-INTEGRACION-ARENAS.md` y
> estás operable. **NO es necesario reconstruir la historia de conversaciones
> anteriores. El estado actual del código, Git y la documentación canónica son
> la fuente de verdad del proyecto.**

---

## 1. ¿Cuál es el repositorio?

`github.com/sarqsan/Gestor-de-inmuebles-vercel` (remoto `origin`).
ERP inmobiliario completo: captación → contrato → cobros → gastos →
conciliación → facturación (RRSIF/VERI*FACTU/B2B) → recomercialización, con
auth/roles, IA (Gemini) y deploy en Vercel.

## 2. ¿Cuál es la rama canónica?

`arena/01a0a413-gestor-de-inmuebles-vercel`.
**Importante:** cada sesión de Arena trabaja en SU rama de sesión
(`arena/<id>-gestor-de-inmuebles-vercel`) y entrega ahí; la rama canónica la
mantiene/integra **Arena A**. Si tu sesión se ancló a `main`, **no asumas** que
`main` contiene el ERP: `main` es una línea paralela (ver
`MAPA-MAESTRO-ERP-ACTUAL.md` §7). Verifica siempre el árbol (FASE 0 de abajo).

## 3. ¿Cuál es el HEAD conocido?

- Canónico: **`91da820`** (`feat(integracion): integrar GAP 8 de factura
  electronica B2B`) — GAP 1–8 consolidados.
- La rama de sesión de 2026-09-20 (`arena/01a0bfbe-gestor-de-inmuebles-vercel`)
  contiene el merge de alineación `d24ab1f` (árbol ≡ `91da820`) + el commit de
  este paquete de continuidad.
- Estado completo y actualizado: `docs/ESTADO-GIT-ERP.md`.

## 4. ¿Cómo comprobar el estado al llegar? (FASE 0, 5 minutos)

```bash
git status                      # debe quedar CLEAN; si no, INCREMENTAR y documentar qué es
git branch -vv                  # confirmar rama de sesión
git rev-parse HEAD              # anotar tu punto de partida
git ls-remote origin            # SHAs reales del remoto (comparar con ESTADO-GIT-ERP.md)
git log --oneline -15           # ver los últimos consolidados (GAP 1–8)
ls docs/ && cat docs/ESTADO-GIT-ERP.md
```

Reglas de la FASE 0 (permanentes):
- Si el HEAD esperado no coincide: **investigar** (diff/log) antes de tocar nada.
- **Prohibido** `git reset --hard` / `git clean -fd` sobre trabajo no tuyo.
- Si hay cambios locales no explicados: **detenerse y reportar**.
- Si el árbol no contiene lo que describes los docs (p.ej. arrancaste en `main`),
  alinear con un **merge documentado** a favor de la canónica (precedente:
  `d24ab1f`) — nunca sobrescribiendo.

## 5. ¿Dónde está la arquitectura?

- `docs/MAPA-MAESTRO-ERP-ACTUAL.md` — mapa completo (bloques, estados,
  dependencias, deuda técnica).
- `docs/arquitectura/FASE_*.md` — diseño por fases (cobros 1.x, seguridad 1.4,
  gastos 2.x, recomercialización 3.x).
- Capas: UI React (`src/components`) → motores puros (`src/utils/*Engine.ts`,
  `src/notificaciones/`, `src/utils/conciliacion/`, `src/utils/generadores/`,
  `src/utils/intercambioB2B/`) → datos (`src/lib/firebase.ts`, `authService.ts`)
  → Firebase + `server.ts` (Express, 16 endpoints) → Vercel (`vercel.json`,
  `api/index.ts`).
- Seguridad: `firestore.rules` (~44 bloques, aislamiento por `propietarioId`,
  catch-all deny-by-default) + `storage.rules` (rutas por propietario).

## 6. ¿Dónde están los motores?

`src/utils/` (uno por dominio: `cobrosEngine`, `contratoEngine`,
`contratoCicloEngine`, `habitacionesEngine`, `gastosEngine`, `prestamosEngine`,
`financiacionEngine`, `fiscalEngine`, `rentabilidadEngine`, `incidenciasEngine`,
`mantenimientoEngine`, `profesionalesEngine`, `segurosEngine`, `inventarioEngine`,
`recomercializacionEngine`, `reformasEngine`, `pricingRecomerc`, `reportingEngine`,
`pdfExportEngine`, `publicacionEngine`+adaptadores, `facturacionEngine`,
`facturacionReporte`, `verifactuTransport`, `sha256`, `facturaElectronicaB2B*`,
`generadores/*`, `intercambioB2B/*`, `notificacionesB2B`) +
`src/utils/conciliacion/` (9 módulos) + `src/notificaciones/` (6 módulos) +
`src/types/` (modelos por dominio).

## 7. ¿Dónde están los tests?

- `tests/` (9 ficheros) + `src/utils/*.test.ts` (7 ficheros) = **16 ficheros,
  330 tests** (vitest 5).
- Comando oficial: **`npx vitest run`** (el `package.json` canónico no define
  script `test`).
- Umbral de cierre: suite completa en verde (≥330 + nuevos, 0 fallos) +
  `npx tsc --noEmit` (0 errores) + `npm run build` (OK).

## 8. ¿Qué bloques están cerrados?

- **GAP 1–8 CONSOLIDADOS** en la canónica (detalles y límites reales:
  `MAPA-MAESTRO-ERP-ACTUAL.md` §3). En resumen: notificaciones (motor),
  contratos especiales (motor+UI), reporting (motor), financiación (motor),
  sindicación (generación), conciliación bancaria (motor+UI), facturación/
  RRSIF/VERI*FACTU (motor), factura electrónica B2B (generación).
- Bloques base cerrados: auth/roles, inmuebles+habitaciones (circuito 72/72),
  cobros, gastos/préstamos/rentabilidad, incidencias/mantenimiento/profesionales,
  pólizas/siniestros+Gmail, inventario, recomercialización, deploy Vercel.

## 9. ¿Qué bloques están pendientes?

- **BLOQUE B** — Tesorería + liquidaciones de propietarios + SEPA (PAIN.008/001).
- **BLOQUE C** — Morosidad + recobro + expediente de recuperación.
- **BLOQUE D** — Entrada/salida + actas + evidencias + firma digital.
- **BLOQUE E / siguiente oleada** — Portal de inquilino + suministros (CUPS,
  contadores, reparto).
- Pendientes externos (no son trabajo de código): transporte real de
  notificaciones, remisión AEAT/SII, envío B2B real (SPFE/plataforma),
  publicación a portales, proveedor SEPA, firma electrónica.
- Deuda técnica conocida: `MAPA-MAESTRO-ERP-ACTUAL.md` §8 (documentsStore en
  memoria, claims de Storage, ficha pública con datos fiscales, …).

## 10. ¿Qué reglas no deben romperse?

(Resumen de `CONTRATO-INTEGRACION-ARENAS.md` §5 — ley el contrato completo):

1. Motores puros con tests; la UI no contiene lógica económica.
2. Idempotencia e identidad determinista: todo replay inocuo (GAP1/6/7/8).
3. Históricos append-only: se añaden, nunca se reescriben.
4. Reglas Firestore: aislamiento por `propietarioId` + catch-all
   deny-by-default; inmutables documentados no se relajan.
5. Sin secretos en código/Firestore/Storage/commits.
6. Nada se simula como producción (adaptadores `PENDIENTE` declarados).
7. Sin reglas fiscales/bancarias/jurídicas sin verificación documental.
8. Interfaces entre bloques (mapa maestro §6): B2B copia importes de GAP7;
   GAP6 escribe en cobros solo vía `registrarPagoPeriodo`; GAP5 lee
   habitaciones sin modificar el circuito; GAP3 solo lectura; eventos de
   GAP2/7/8 usan el dispatcher de GAP1.

## 11. ¿Cómo debe trabajar una Arena?

1. Leer este doc + mapa maestro + contrato de integración (≤30 min).
2. FASE 0 de verificación Git (encima). Anotar base SHA.
3. Plan breve de la orden: qué toca, qué NO toca, qué interfaz respeta.
4. Implementar dentro del mandato de tu Arena/BLOQUE (B/C/D/…).
5. Tests del bloque + suite completa + tsc + build en verde **antes** del push.
6. Actualizar `MAPA-MAESTRO-ERP-ACTUAL.md` (+ `ESTADO-GIT-ERP.md` si cambia el
   estado) en el mismo commit.
7. Commit(s) con mensaje del bloque, push a tu rama de sesión, verificar SHA
   remoto, dejar worktree CLEAN.
8. Informe de cierre (ver §12).

## 12. ¿Cómo debe cerrar una orden?

Checklist de cierre (idéntico al del contrato de integración, §4):

- [ ] `npx vitest run` → todo en verde (≥330 + nuevos)
- [ ] `npx tsc --noEmit` → 0 errores
- [ ] `npm run build` → OK
- [ ] Worktree CLEAN (`git status`)
- [ ] Commit + push a la rama de sesión (SHA verificado con `git ls-remote`)
- [ ] **Informe**: base SHA → HEAD SHA · qué se tocó · qué NO se tocó · tests ·
      limitaciones reales · dependencias externas · política de resolución si
      hubo conflictos · actualizaciones de docs
- [ ] `ESTADO-GIT-ERP.md` actualizado si el estado cambió

Con esto, la siguiente sesión arranca desde Git + docs, sin necesidad de
ninguna conversación previa.
