# FASE 7 — GATE DE DECISIONES D1–D6 Y PREPARACIÓN CONTROLADA DE B4

**Fecha:** 2026-09-26 · **Rama:** `arena/01a0d97d-gestor-de-inmuebles-vercel` · **Naturaleza:** gate documental. **0 escrituras Firestore/Storage · reglas intactas · B4 NO ejecutado · importador NO ejecutado · modelo Cuenta/Titular/Gestor NO implementado.**
**Fuente central:** el mapa central del ERP es **`docs/MAPA-MAESTRO-ERP-ACTUAL.md`** (preexistente; este documento NO lo duplica). El mapa específico de la migración Rentasync→ERP vive en `docs/FASE2-MAPA-ORIGEN-DESTINO-RENTASYNC.md`; la estrategia en `docs/FASE3-...`; la identidad en `docs/FASE5-...` y `docs/FASE5B-...`; B6 en `docs/FASE6-...`.

---

## 1. Estado actual (precheck 7.1)
- **Reset 9 detectado** al iniciar (HEAD vuelto a `5f7754b`; commits FASE 2–6 perdidos). Restauración documentada: FASE 2 `6f47e7d` · FASE 3 `bfeb6c9` · FASE 4 `c2af212` · FASE 5 `0154dbb` · FASE 5B `096da8e` · FASE 6 `58309af`.
- Ficheros verificados en disco: `src/lib/importacion/` (7 ficheros, 17 tests) · `src/lib/expedienteFiscal/` (5 ficheros, 19 tests) · 6 documentos de fase en `docs/`.
- 9 resets acumulados sin push: **los commits solo existen en el sandbox**.

## 2. D1 — CUENTA / TITULAR / GESTOR
**Ya existe (verificado):** identidad Firebase Auth → `usuarios/{id}` + espejo no falsificable `usuarios_auth/{uid}` (`indexIsTruthful()`); `UsuarioApp.propietarioId` 1:1 con `propietarios/{id}`; alta nominal por invitación de un solo uso (`src/lib/accesoPropietarios.ts`); rol **`GESTOR_INMUEBLES` ya catalogado** en `src/types.ts` (~L1917, con permisos operativos `inmuebles.*`, `contratos.*`, `inquilinos.gestionar`…) y auto-asignación bloqueada por regla (`firestore.rules` L1091). **NO existe** ciclo de vida de cartera (cesión/devolución/revocación) ni relación gestor↔titular.
**Diseñado (FASE 5B §1–5, pendiente de aprobación):** colección independiente `gestiones_cartera/{id}` (`titularId`, `gestorUsuarioId`, `inmuebleIds[]` []=cartera completa, `permiso LECTURA|LECTURA_ESCRITURA`, `responsableActual GESTOR|TITULAR`, `estado PENDIENTE_ACEPTACION|ACTIVA|REVOCADA`, `eventos[]` append-only); cesión/devolución = transiciones sobre el mismo documento (nunca se crea propiedad nueva ni se duplica); revocación inmediata; histórico nunca se borra; auditoría `GESTION_*` en `audit_logs`.
**Ficheros que habría que modificar al implementar (NO ahora):** `firestore.rules` (nuevo match + extensión espejo), `src/types.ts` (entidad + transiciones), `src/lib/authService.ts` (`canAccessInmueble/canAccessContrato` con ámbito gestor), módulo nuevo `accesoGestores.ts` (par puro de `accesoPropietarios.ts`), `src/lib/firebase.ts` (CRUD + helpers de auditoría), `src/lib/adminUsuarios.ts` (asignación), UI de cesión/devolución (bloque B7 futuro).
**Requiere aprobación del usuario:** el modelo completo y la sub-decisión "¿el gestor conserva LECTURA tras ceder?" (propuesta 5B: sí).

## 3. D2 — ENDURECIMIENTO DE INMUEBLES (F5-1)
**Comportamiento actual (verificado):** `isStaff() = isSignedIn() && !isTenant()` → `inmuebles` `get`/`list` abiertos a cualquier no-inquilino.
**Consumidores exactos de `subscribeInmuebles()` (grep verificado):** `src/App.tsx` (estado global de la app), `src/components/sections/DashboardEjecutivoSection.tsx`, y la definición en `src/lib/firebase.ts` L260 (`onSnapshot(INMUEBLES_COL)` **sin filtro where**).
**Impacto del paso "consulta global + filtrado cliente" → "consulta autorizada por ámbito":** la suscripción sin filtro pasaría a `permission-denied` para todo perfil excepto master.
**Prerrequisitos de frontend (antes de tocar reglas):** (1) nueva función `subscribeInmueblesPorAmbito(usuario)`: titular → `where('propietarioId','==',myPropId)` + `where('id','in',inmuebleIds)` combinadas en cliente; gestor → `where('propietarioId','in',carteras)`; master → sin filtro; (2) refactor de los 2 consumidores; (3) auditoría de `get()` por referencia (gasto→inmueble) — cubiertos por la nueva regla `get`.
**Tests de diseño:** batería A–D y J de FASE 5B §11 (emulador) — **no se crea código de test en esta fase** (gate sin implementación); los fixtures quedan especificados en 5B. **NO se tocan `firestore.rules` ni `subscribeInmuebles()`.**

## 4. D3 — STORAGE (claims vs Firestore)
**Contenido del claim:** `propId: string` (titular propio), `carterasL: string[]` (titulares con gestión LECTURA activa), `carterasE: string[]` (LECTURA_ESCRITURA). Nada más (sin emails ni nombres).
**Emisor:** flujo de confianza — `firebase-admin` en el servidor Node existente (`server.cjs`/express) o Cloud Function; NUNCA el cliente.
**Actualización:** en el alta/vinculación (`syncAuthIndex`), y en cada transición de `gestiones_cartera` (aceptación/cesión/devolución/revocación) → re-emisión de claims; el token del cliente los recibe en el siguiente refresh (ventana ≤ 1 h).
**Revocación:** borrar claim + forzar refresh (Admin SDK `revokeRefreshTokens`); **riesgo de obsolescencia:** hasta el refresh, el token viejo conserva el ámbito → mitigación: reglas combinan claim con verificación de estado en Firestore donde el coste sea aceptable, o接受 ventana ≤1h documentada.
**Cesión/devolución:** la transición mueve el titular entre `carterasE` y `carterasL` (o fuera) — mismo mecanismo de re-emisión.
**Límites de tamaño:** el token JWT es pequeño (claims prácticos ~1 KB) → tope documentado (p.ej. 50 carteras × ~16 chars); por encima, degradar a alternativa Firestore.
**Alternativa Firestore (comparación):** `firestore.get(/usuarios_auth/{uid})` desde `storage.rules`: SIEMPRE actual (sin ventana de obsolescencia), sin emisor de claims; coste: 1 lectura extra por operación de Storage y acoplamiento de reglas. **Recomendación:** claims como vía principal + alternativa Firestore como fallback documentado. **No se implementan claims ni se modifica `storage.rules`.**

## 5. D4 — STAGING B COMPLETO (especificación, sin escribir)
- **Colección de lotes:** `importacion_lotes/{loteId}` con `loteId = sha256(ficheroOriginal + sistemaOrigen + actor)` → re-subir el mismo fichero produce el MISMO lote (idempotencia por construcción).
- **Acta/estado:** `{ sha256, sistemaOrigen, actor, fecha, estado: 'PREVIEW'|'CONFIRMADO'|'REVERTIDO', numRegistros, incidencias[], previewHash }`.
- **Registros:** subcolección `importacion_lotes/{loteId}/registros/{registroId}` con `registroId` determinista (`gas_/cob_…` de B1), payload normalizado (B2), `huellaOrigen`, veredicto (`CLASIFICABLE|DUPLICADO_ORIGEN|BLOQUEADO…`), `camposRequierenValidacion` (propietarioId, aCargoDe, estado, deducible — SIEMPRE).
- **Incidencias/documentos:** snapshot de incidencias del lote; documentos referenciados con sha256 cuando exista binario (si no: PENDIENTE).
- **Preview/confirmación:** preview = B3 (ya implementado, byte a byte reproducible); CONFIRMADO solo si el contrato de FASE 5B §9 lo permite (propietarioId conocido, sin truncados, sin conflictos…).
- **Rollback lógico:** antes de promoción, `estado=REVERTIDO` (0 efecto productivo); la promoción a colecciones definitivas es un bloque separado posterior con su propio rollback.
- **Qué se puede SIN `firebase-admin`:** TODO el pipeline puro (parseo, normalización, dedup, preview, actas, CSV/ZIP, tests) — ya existe (B0–B3 + B6). **Qué necesita backend/CLI:** (a) escritura de staging vía `firebase-admin` (sin tocar reglas), o (b) escritura con cliente autenticado master + **nuevo bloque de reglas para `importacion_lotes`** (requiere aprobación + deploy). Una de las dos es imprescindible para ejecutar B4.

## 6. D5 — FICHERO CANÓNICO A/B
- **Qué falta:** los JSON originales de Rentasync (export A y export B) — perdidos tras 3 resets del sandbox, nunca materializados en disco; el ZIP AEAT nunca fue recibido; los binarios de facturas (base64) no son reproducibles.
- **Qué SÍ está verificado:** el anexo `docs/FASE2-ANEXO-EVIDENCIA-EXTERNA.json` — 51 registros transcritos de los pegados en chat (21 GASTO + 30 COBRO + 1 TRUNCADO), importes y conceptos verbatim, huellas de contenido calculadas.
- **Qué sigue truncado:** registro 27 (INC-08) — id/importe/propiedad desconocidos; PDF firmado no re-verificable.
- **Qué depende del fichero:** la identidad canónica del lote (INC-06), la contradicción A vs B (INC-05), el md5/sha256 de los originales, y por tanto **cualquier ejecución real de B4**.
- **Confirmación explícita:** los datos disponibles (anexo) son EVIDENCIA, **NO sustituyen al fichero canónico**: son una transcripción sin hash del original; B4 no debe ejecutarse sobre ellos como fuente.

## 7. D6 — DEPENDENCIAS (ninguna instalada)
| Dependencia | Finalidad | Dónde | ¿Imprescindible? | Alternativa sin ella |
|---|---|---|---|---|
| `firebase-admin` | escribir staging (D4a) + emitir claims (D3) | `scripts/importar-rentasync.ts` (tsx, patrón existente) | Solo si se elige D4a | D4b: cliente master + reglas nuevas (aprobación+deploy) |
| `firebase-tools` | emuladores (tests D2/D3) y deploy de reglas | desarrollo local | No para B4 | deploy desde consola; tests manuales |
| `@firebase/rules-unit-testing` | batería de seguridad FASE 5B §11 | tests | Solo al ejecutar D2 | emulador manual (cobertura menor) |
| Otras | — | — | **Ninguna más**: sha256 (`node:crypto`), ZIP (propio), CSV, tsx y vitest ya existen | — |

## 8. MAPA DE DEPENDENCIAS B4
| Componente B4 | Dependencia | Archivos afectados | Datos afectados | Riesgo | Requisito previo | Estado |
|---|---|---|---|---|---|---|
| Parseo/normalización/dedup/preview | — | `src/lib/importacion/*` | ninguno (puro) | bajo | — | **LISTO** (17/17) |
| Acta de lote + export B6 | — | `src/lib/expedienteFiscal/*` | ninguno (lectura) | bajo | — | **LISTO** (19/19) |
| Escritura en staging | D4 + D6 | `scripts/` nuevo + (`firestore.rules` si D4b) | colección nueva | medio | elegir D4a/D4b | **REQUIERE APROBACIÓN** |
| Asignación `propietarioId` | D1 + contrato de propietario destino | mapping por lote | `gastos/inmuebles.propietarioId` | **alto** | modelo aprobado + mapa titular | **BLOQUEADO** |
| Promoción a definitivas | D1, D4, D2 (recomendado antes) | reglas + motor promoción | productivo | **alto** | checklist completa | **BLOQUEADO** |
| Cobros | contrato de cobros (FASE 3 §J) | `contratos_formalizacion.registroCobros` | productivo | alto | contrato destino existe | **BLOQUEADO** |
| Documentos (B5) | D3 + binarios | Storage | productivo | medio | ficheros originales | **REQUIERE DATO EXTERNO** |
| Rollback (`--revertir-lote`) | D4 | scripts | staging/productivo | medio | staging definido | **REQUIERE APROBACIÓN** |
| Lote real de importación | D5 | — | — | **alto** | fichero canónico custodiado + sha256 | **REQUIERE DATO EXTERNO** |

## 9. CHECKLIST DE AUTORIZACIÓN DE B4
- [ ] **D1** modelo Cuenta/Titular/Gestor aprobado (y sub-decisión LECTURA post-cesión)
- [ ] **D2** aislamiento Firestore de `inmuebles` (con prerrequisito frontend)
- [ ] **D3** estrategia Storage (claims vs Firestore)
- [ ] **D4** staging (variante a o b)
- [ ] **D5** fichero canónico A/B custodiado en el repo con sha256
- [ ] **D6** dependencias aprobadas/instaladas (solo las necesarias según D4)
- [ ] contrato de propietario destino (mapa owner→titular confirmado)
- [ ] contrato de cobros (contrato destino o decisión "sin cobros en B4")
- [ ] estrategia de documentos (B5: PENDIENTE admitido o bloqueo)
- [ ] estrategia de rollback probada en dry-run

## 10. Decisiones que requieren al usuario
D1 (modelo + LECTURA post-cesión) · D2 (endurecer + refactor frontend) · D3 (claims vs Firestore) · D4 (a: admin-SDK / b: reglas nuevas) · D6 (qué instalar) · contratos de propietario destino, cobros, documentos y rollback.

## 11. Datos externos pendientes
Fichero canónico A/B (INC-06) · ZIP AEAT · binarios de facturas (base64 no reproducibles) · registro 27 completo (INC-08) · md5/sha256 de los originales.

## 12. Condiciones exactas para autorizar B4
1. Checklist §9 completa al 100% (cada casilla con decisión explícita del usuario).
2. Fichero canónico presente EN EL REPO (`docs/evidencia/` o ruta acordada) con sha256 registrado antes de ejecutar.
3. Orden expresa del usuario ("ejecutar B4"), empezando SIEMPRE por `--dry-run`; `--confirmar` solo tras revisar el preview y con escritura exclusiva en staging.
4. Si D4b: reglas desplegadas y tests de seguridad verdes antes de la primera escritura.
5. Promoción a colecciones definitivas: bloque independiente con nueva autorización.

## 13. Orden exacto de dependencias para iniciar B4
**D5 (custodiar fichero) → D6 (instalar lo mínimo según D4) → D4 (staging operativo, escritura solo staging) → D1 (modelo titular/gestor → desbloquea propietarioId) → D2 (endurecimiento + frontend, recomendado antes de promoción) → D3 (Storage, necesario para B5 no para B4-staging) → B4 `--dry-run` → B4 `--confirmar` (solo staging) → bloque de promoción (nueva autorización).**

---
### Verificación
Tests: B0–B3 17/17 · B6 19/19 · bloque B 92/92 · bloque C 82/82 (+vitest 79/79) · bloque E 64/64 · `tsc --noEmit` EXIT 0 · build EXIT 0 · consistencia documental OK. **Firestore 0 escrituras · Storage 0 escrituras · datos existentes 0 modificaciones · reglas intactas · ningún importador ejecutado.** Commit FASE 7 sin push.
