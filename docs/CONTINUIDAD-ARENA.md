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
`MAPA-MAESTRO-ERP-ACTUAL.md` §9). Verifica siempre el árbol (FASE 0 de abajo).

### 2.1 BLOQUE C — entregado en rama (2026-09-20) e **INTEGRADO en la canónica (2026-09-21, Arena A)**

El **BLOQUE C** completo (desarrollado en `arena/01a0c03d-gestor-de-inmuebles-vercel`, BASE
`5ff8448`, commit de cierre `91bac8e`) está ahora en la rama canónica: merge `--no-ff`
`5293c3c` — `feat(morosidad): integrar bloque C en ERP canonico` — tras auditoría selectiva de los
33 ficheros (100 % aditivo). Contenido: detección de deuda desde `registroCobros` (solo lectura;
el pago sigue siendo `cobrosEngine.registrarPagoPeriodo`), máquina de estados con histórico
append-only, política de recobro configurable y versionada, plan de recobro, comunicaciones
**únicamente por GAP 1**, evidencias, compromisos cubiertos solo con cobros reales, expedientes de
aseguradora y jurídico (requisito de procedibilidad LO 1/2025), espejo
`morosidad_resumen_propietario` de mínimo privilegio, 6 colecciones nuevas con reglas §32–§37,
79 tests + batería `test:bloque-c`, y la implementación Firestore del
`RepositorioNotificaciones` de GAP 1 (email safe-mode).

Verificación re-ejecutada sobre la canónica integrada (2026-09-21): `npm run test:bloque-c`
(82 PASS) · `npx vitest run` (409/409) · `npm run test:bloque-b` (92/92, sin regresión) ·
`npx tsc --noEmit` (0 errores) · `npm run build` (OK). Documentación:
`docs/BLOQUE-C-IMPLEMENTACION.md`, `docs/BLOQUE-C-VERIFICACION.md`,
`docs/BLOQUE-C-NORMATIVA.md` (compatibles y conservados; el MAPA MAESTRO canónico los referencia).

**Pendientes reales del BLOQUE C** (ver MAPA §4): transporte real de comunicaciones GAP 1,
programador automático de detección, adjuntos en Storage, gancho BLOQUE B solo a nivel interfaz.
**No** inicies el BLOQUE D ni el portal del inquilino (BLOQUE E) sin orden expresa.

## 3. ¿Cuál es el HEAD conocido?

- Canónico: **`91da820`** (`feat(integracion): integrar GAP 8 de factura
  electronica B2B`) — GAP 1–8 consolidados.
- La rama de sesión de 2026-09-20 (`arena/01a0bfbe-gestor-de-inmuebles-vercel`)
  contiene el merge de alineación `d24ab1f` (árbol ≡ `91da820`) + el paquete de
  continuidad + **la integración selectiva del BLOQUE B** (commit
  `feat(tesoreria): integrar bloque B en ERP canonico`, 2026-09-20).
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
- Batería BLOQUE B: **`npm run test:bloque-b`** (`scripts/test-bloque-b.ts`,
  92 asserts: liquidaciones, gastos, SEPA, conciliación, notificaciones,
  puentes GAP1/GAP6 y circuito e2e).
- Umbral de cierre: suite completa en verde (≥330 + nuevos, 0 fallos) +
  `npm run test:bloque-b` (0 fallos) + `npx tsc --noEmit` (0 errores) +
  `npm run build` (OK).

## 8. ¿Qué bloques están cerrados?

- **GAP 1–8 CONSOLIDADOS** en la canónica (detalles y límites reales:
  `MAPA-MAESTRO-ERP-ACTUAL.md` §3). En resumen: notificaciones (motor),
  contratos especiales (motor+UI), reporting (motor), financiación (motor),
  sindicación (generación), conciliación bancaria (motor+UI), facturación/
  RRSIF/VERI*FACTU (motor), factura electrónica B2B (generación).
- **BLOQUE B — Tesorería + liquidaciones + SEPA: INTEGRADO (2026-09-20)** —
  motor de liquidaciones determinista, SEPA PAIN.008/001 (preparación de
  ficheros, **sin envío bancario real**), Tesorería en navegación canónica +
  «Mis Liquidaciones» en portal propietario, reglas §26–31, origen GAP1
  `TESORERIA`, conector GAP6 de evidencia de pago. Pendientes externos: envío
  bancario real, camt.053, XSD oficial (mapa maestro §4 BLOQUE B).
- Bloques base cerrados: auth/roles, inmuebles+habitaciones (circuito 72/72),
  cobros, gastos/préstamos/rentabilidad, incidencias/mantenimiento/profesionales,
  pólizas/siniestros+Gmail, inventario, recomercialización, deploy Vercel.

## 9. ¿Qué bloques están pendientes?

- **BLOQUE C** — Morosidad + recobro + expediente de recuperación.
- **BLOQUE D** — Entrada/salida + actas + evidencias + firma digital.
- **BLOQUE E — Portal del Inquilino + suministros** — PLANIFICADO ≠
  IMPLEMENTADO. Gran capacidad pendiente que depende de B, C y D; acceso
  independiente y simplificado del arrendatario (sin acceso al ERP interno);
  suministros: CUPS, contador/lecturas, titularidad, comercializadora/
  distribuidora, tarifa, potencia, cambios de titular, reparto por habitaciones
  (detalles: mapa maestro §5).
- **Capa transversal — Experiencia, Ayuda, Tutoriales e IA Asistente** — sin
  numeración GAP (no es GAP9/10/11): centro de ayuda in-app + tutoriales por
  tipo de usuario + IA de guiado sobre los motores reales del ERP (mapa
  maestro §6).
- **Después: Integración global** — pruebas end-to-end de circuitos completos,
  UX, seguridad, rendimiento y endurecimiento final (mapa maestro §7).
- Pendientes externos (no son trabajo de código): transporte real de
  notificaciones, remisión AEAT/SII, envío B2B real (SPFE/plataforma),
  publicación a portales, proveedor SEPA, firma electrónica.
- Deuda técnica conocida: `MAPA-MAESTRO-ERP-ACTUAL.md` §10 (documentsStore en
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
8. Interfaces entre bloques (mapa maestro §8): B2B copia importes de GAP7;
   GAP6 escribe en cobros solo vía `registrarPagoPeriodo`; GAP5 lee
   habitaciones sin modificar el circuito; GAP3 solo lectura; eventos de
   GAP2/7/8 usan el dispatcher de GAP1.
9. La futura IA asistente (mapa maestro §6, sin numeración GAP) opera dentro
   de los permisos del usuario: no inventa estados/acciones, no marca
   procesos completados sin confirmación real ni sustituye los controles del
   ERP; cada bloque expone estados/transiciones/permisos/eventos/acciones
   interpretables (§6.3).

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

- [ ] `npm run test:bloque-b` y/o `npm run test:bloque-c` (baterías del bloque entregado)
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
