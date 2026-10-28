# INFORME CONSOLIDADO DE EJECUCIÓN — 2026-10-27

**Repositorio:** `sarqsan/Gestor-de-inmuebles-vercel`
**Rama:** `arena/fb69e0b0-gestor-de-inmuebles-vercel` · **Base:** `2563831`
**Orden ejecutada:** Fase A = P0 completo → P1 viable → P2 como propuestas priorizadas.
**Estado final:** P0 **completado y verificado localmente**; P1 **ejecutado en su parte viable**; P2 **documentado como propuestas, sin implementar**.

> Este es el **único informe consolidado** de la ejecución. El registro
> acumulativo con el detalle por bloque está en
> `docs/REGISTRO-EJECUCION-2026-10-27.md`.

---

## 1. Resumen ejecutivo

Se han cerrado las brechas que impedían afirmar que la aplicación funciona de
verdad: ahora hay un diagnóstico verificable (`npm run doctor` + `/api/health`
de capacidades), las semillas están desactivadas por defecto, el alta pública
de solicitudes pasa por el servidor con token, honeypot y cuota, las reglas ya
no permiten escritura anónima, el OTP de actas usa CSPRNG y hash salado con
entrega de correo real que falla cerrado, y la interfaz dejó de presentar como
reales nueve simulaciones y varios permisos que no tenían efecto.

En P1 se ha eliminado la afirmación técnica falsa de que el ERP era VERI*FACTU,
se ha hecho configurable la modalidad fiscal, se ha escrito el pre-dictamen
normativo (que **no es** un dictamen fiscal firmado), se ha fijado con pruebas
el invariante «los justificantes nunca contabilizan cobros», se ha desacoplado
la fuente del IRAV y se ha auditado la escalabilidad documental **sin migrar
nada**. P2 se entrega como cartera priorizada de propuestas con dependencias y
puertas de decisión.

**Resultado verificable:** `tsc` 0 · `build` 0 · `npm test` **304/304 archivos,
5.123 pruebas OK, 0 fallos** · `test:integracion` **384 pass / 0 fail / 6
skipped** · `doctor` estático 0 · `/api/health` real **200** sin secretos.

**Lo que NO se ha hecho:** ningún despliegue, ninguna escritura en producción,
ningún secreto real, ninguna dependencia nueva, ningún contrato de servicio,
ninguna migración de datos y ninguna integración bancaria o de pagos.

---

## 2. Exclusiones permanentes respetadas (no reabribles)

Sin integración bancaria automática, PSD2, agregadores AISP, importación
automática de movimientos, iniciación de pagos ni pasarelas online
(Stripe/Redsys/Bizum/TPV) o equivalentes bajo otro nombre. El flujo es
**documental y manual**: los inquilinos aportan justificantes; propietarios y
profesionales aportan facturas. La IA puede extraer y **proponer** datos, pero
**nunca confirma pagos ni contabiliza cobros**. El registro definitivo sigue
siendo la acción humana `registrarPagoPeriodo`. Esta invariante está ahora
cubierta por `tests/justificantes-sin-contabilizacion.test.ts`.

---

## 3. Entregables

### Fase 0 / auditoría (documentación, commit `375af75`)

| Entregable | Contenido |
|---|---|
| `docs/AUDITORIA-FUNCIONAL-PORTALES-2026-10-27.md` | Inventario real de lo implementado/faltante en los cuatro portales (administrador, propietario, profesional, inquilino), brechas y comparación de mercado. |
| `docs/FASE-0-AUDITORIA-PREPARACION-2026-10-27.md` | Estado real del repositorio, 24 hallazgos (H-01…H-24), 15 desviaciones corregidas (D-01…D-15), hoja de ruta P0/P1/P2, matriz de servicios externos, aislamiento, riesgos y decisiones pendientes P-01…P-06. |

### P0 (commit `2e48032`, 88 archivos)

| Bloque | Entregables principales |
|---|---|
| **P0.1** | `scripts/doctor.mjs` + `npm run doctor`; `server/diagnostico/capacidades.ts` y `/api/health` con `esquemaDiagnostico:1` y 14 capacidades; `src/lib/masterAdmin.ts` como fuente única; `src/lib/flags.ts` + `src/data/estadoInicial.ts` con semillas opt-in; `docs/CONFIGURACION-VERIFICABLE.md` (26 variables); inventario y etiquetado de 9 simulaciones; `doctor`/`test`/`typecheck` en `package.json` y CI. |
| **P0.2** | `POST /api/solicitud/:token` con token, honeypot, cuota 8/min y cuerpo ≤256 KB; escritura atómica servidor de `solicitudes`+`candidatos`; `server/shared/rateLimit.ts`; `server/catastro/autorizacionCatastro.ts` con ID token y cuota 20/min; cliente `src/lib/portalPublico.ts`; `src/lib/conversionSolicitud.ts`; `SolicitudesSection` y `SolicitudDetailModal` cableados; `firestore.rules` sin `create` anónimo y con autoría en `audit_logs`. |
| **P0.3** | `actaOtpEngine.ts` con CSPRNG, SHA-256 salado y error tipado; `server/actas/rutasEntregaOtp.ts`, `src/lib/entregaOtpApi.ts`, plantilla `acta.otp_firma`; `ActasSection` sin código plano y con aviso de entrega fallida; `firestore.rules` prohíbe texto plano en `actas_otp` (con precedencia corregida). |
| **P0.4** | `docs/SECCIONES-HUERFANAS-P0.4.md`; imports muertos retirados; paridad menú↔guarda probada; permisos y módulos etiquetados como informativos con toggles desactivados; índices (H-14) documentados como **PENDIENTES**; CI con `test:integracion` y `doctor`. |
| **Registro** | `docs/REGISTRO-EJECUCION-2026-10-27.md` con P0.1…P0.4, pruebas y límites. |

### P1 (commit `13898d9`, 15 archivos)

| Bloque | Entregable | Estado |
|---|---|---|
| P1.1 | `tests/justificantes-sin-contabilizacion.test.ts` — invariante de cobros | ✅ Verificado |
| P1.2 | `server/indices/fuenteIrav.ts` + `tests/irav-fuente-viva.test.ts` | ⚠️ Parcial: descarga del INE **pendiente**, no simulada |
| P1.4 | `docs/P1.4-DICTAMEN-FISCAL-PREVIO-2026-10-27.md` | ⚠️ Pre-dictamen; **falta dictamen firmado P-05** |
| P1.5-pre | `src/lib/configuracionFiscal.ts`, variable 27, aviso visible, 2 tests | ✅ Verificado; P1.5 transporte AEAT **bloqueado** |
| P1.9.3 | `docs/AE-01-AUDITORIA-ESCALABILIDAD-DOCUMENTAL-2026-10-27.md` | ✅ Auditoría sin migración |

**P1 no ejecutado (con motivo):** P1.3 mensajería, P1.5 transporte AEAT/B2B,
P1.6 portal profesional, P1.7 PWA/push, P1.8 custom claims/2FA, P1.9.1
dependencias, P1.9.2 code-splitting, P1.10 registro de corta duración. El
detalle de cada bloqueo está en el registro. Ninguno se presenta como hecho.

### P2 (este commit, documentación)

`docs/P2-PROPUESTAS-PRIORIZADAS-2026-10-27.md`: siete propuestas priorizadas
(RGPD/DSAR, WCAG+i18n, E2E+carga, IA supervisada, API documental/sindicación,
observabilidad, firma cualificada) con valor, coste, dependencias, criterio de
salida y puertas de decisión; más una tabla de propuestas **descartadas** para
no reabrir las exclusiones permanentes. **Ninguna está implementada.**

---

## 4. Commits y puntos de reversión

| # | Commit | Contenido | Reversión |
|---|---|---|---|
| 1 | `375af75` | Auditoría y Fase 0 (solo documentos) | Sin riesgo: no toca código. |
| 2 | `2e48032` | **P0 completo** (P0.1→P0.4) | `git revert 2e48032`. Incluye cambios en `firestore.rules` **no desplegados**. |
| 3 | `13898d9` | P1 viable | `git revert 13898d9`. Independiente de P0 salvo por `FacturacionSection.tsx`, `doctor.mjs`, `.env.example` y 2 tests. |
| 4 | *HEAD al cierre* | P2 + informe consolidado + rama añadida al workflow de CI | Documentación y configuración de CI: sin cambio funcional en la app. |

> **Nota de trazabilidad:** el checkout restaurado de esta sesión partía
> únicamente del commit base `2563831` (clon superficial, `git reflog` sin
> commits propios; los identificadores `708312b` y `2dddca2` citados en fases
> anteriores **no están en el historial de este checkout**). No había commits
> anteriores de la sesión, por lo que **todo el trabajo se ha consolidado en
> estos cuatro commits** de la
> rama `arena/fb69e0b0-gestor-de-inmuebles-vercel`. No se han creado otras
> ramas ni se ha empujado a `main`.

---

## 5. Pruebas reales ejecutadas

Todas sobre el sandbox, sin producción. La última corrida completa es la del
cierre de P1.

| Verificación | Resultado exacto |
|---|---|
| `npx tsc --noEmit` | **EXIT 0** |
| `npm run build` | **EXIT 0** — `index-CrHZJI0z.js` 5.565,58 kB (1.385,58 kB gzip); `dist/server.cjs` 673,3 kB |
| `npm test` (Vitest) | **304/304 archivos · 5.123 passed · 2 skipped · 7 todo · 0 fallos** (233,68 s) |
| Tests nuevos P0+P1 | **29 archivos de pruebas nuevos, 0 fallos** (60 pruebas P0.1 y 27 pruebas P1 verificadas por separado) |
| `npm run test:integracion` | operaciones **299 pass / 0 fail / 3 skipped**; patrimonial **85 pass / 0 fail / 3 skipped** → **384 pass / 0 fail / 6 skipped** |
| `npm run doctor` (estático) | **EXIT 0** — 27/27 variables documentadas, 6 comprobaciones estáticas en verde |
| `GET /api/health` (app Express real) | **HTTP 200**, `esquemaDiagnostico:1`, 14 capacidades, **0 secretos filtrados** |
| `npm run doctor -- --url http://127.0.0.1:3000/api/health` | **1/8 capacidades reales**, salida **1** (honesto: faltan credenciales) |
| `npm run doctor -- --url https://gestor-inmuebles-produccion.vercel.app/api/health` | **código 2 y cero peticiones** (guardia anti-producción) |
| Sondas HTTP reales | catastro sin sesión **401**; entrega OTP sin sesión **401**; cron sin `CRON_SECRET` **503**; alta pública sin Firestore **503 fallo cerrado** |
| P0.2 antispam | 100 peticiones/min → **solo 8 escrituras**; honeypot y campos fuera de lista blanca → **0 escrituras** |
| P0.3 OTP | 5.000 códigos CSPRNG; **0 códigos planos**; `MODO_SEGURO` nunca devuelve `ok:true` |
| P0.4 paridad | ADMIN 30, PROPIETARIO 24, PROFESIONAL 5/7 secciones; única capacidad extra `inversion` |

### Pruebas NO ejecutadas (no se declaran superadas)

- **`npm run test:emulador:reglas`**: `java` no está instalado en el sandbox.
  Los tests de reglas de P0.2/P0.3 son verificaciones del **texto real** con el
  harness del repositorio, **no** el emulador oficial. El workflow de GitHub
  instala Java 21 y debe ejecutarlo.
- **Seis guardias históricas** `f782…`/`46bb…` están marcadas con `skip`
  explícito porque el clon superficial no contiene esos commits. El mensaje
  dice «**NO se declara superada**». Con `fetch-depth: 0` en CI deben
  reevaluarse; no se cuentan como pruebas reales superadas.
- **E2E con navegador** y **pruebas de carga**: propuestas P2.3, no ejecutadas.
- **E2E OTP con emulador oficial**: pendiente, igual que el emulador de reglas.

---

## 6. Despliegues e integraciones

### Verificadas (local / emuladores / texto de reglas)

| Integración | Estado |
|---|---|
| Servidor Express local sin credenciales | Arranque real, `/api/health` 200, fallo cerrado en todas las rutas dependientes de Firestore/Storage. |
| Correo | `MODO_SEGURO`: **no envía**. La entrega OTP falla cerrado y nunca confirma. |
| IA | **BLOQUEADA** por aprobación comercial; sin clave de modelo. |
| Cron | **503** sin `CRON_SECRET`; no ejecuta nada. |
| Catastro | Exige ID token verificado; sin sesión ni siquiera contacta con la sede. |
| Reglas Firestore | Modificadas en el **worktree** (P0.2/P0.3), validadas por harness de texto. **No publicadas.** |
| Configuración | 27/27 variables documentadas; `.env.example` **sin ningún valor activo**. |

### Pendientes / NO realizadas

| Elemento | Estado y motivo |
|---|---|
| **Despliegue de `firestore.rules`** | ❌ No desplegado. Requiere staging y autorización. Las reglas del trabajo son locales. |
| **Publicación de los 10 índices** (`firestore.indexes.json`) | ⚠️ **H-14 PENDIENTE**: `firebase.json` no declara la clave `indexes`. Un `firebase deploy --only firestore` publicaría reglas y **no** los índices. Hay que validar la forma array multi-base con la CLI y probar `--dry-run` antes de tocar `firebase.json`. |
| **Staging** | ❌ No existe (P-06). Todo lo que escribiría datos se probó con emuladores o servidor local sin credenciales. |
| **Emulador oficial de reglas** | ❌ Sin Java en el sandbox; se ejecuta en CI con Java 21. |
| **Firebase Admin real / custom claims** | ❌ Requiere dependencia nueva `firebase-admin` y decisión P-04. |
| **AEAT / VERI*FACTU / SPFE / plataforma B2B** | ❌ Bloqueado por P1.4/P-05. Adaptadores de producción con `disponible(): false`. |
| **Descarga viva del IRAV (INE)** | ⚠️ Sin salida de red a `ine.es` y sin staging; proveedor remoto `PENDIENTE` que falla cerrado. |
| **Sindicación a portales / iCal / webhooks** | ❌ Propuesta P2.5; requiere contratos. Hoy la UI está etiquetada como simulación. |
| **Firma cualificada, Web Push, APM** | ❌ Propuestas P2.6/P2.7 con coste/contrato. |
| **Dependencias (`npm audit --omit=dev`)** | ⚠️ **10 vulnerabilidades** (1 crítica `dompurify`, 8 altas, 1 moderada) sin corregir: P1.9.1 requiere autorización para tocar el lockfile. Bundle principal ~5,57 MB (1,39 MB gzip) sin code-splitting (P1.9.2). |

---

## 7. Bloqueos (decisiones externas imprescindibles)

| ID | Bloqueo | Impacto |
|---|---|---|
| **P-05** | Dictamen fiscal firmado (asesor fiscal / responsable de producto). | Bloquea **P1.5**: transporte AEAT, plataforma B2B, elección VERI*FACTU/NO VERI*FACTU y declaración responsable de SIF. Hasta entonces la modalidad queda en `PREPARACION`. |
| **P-06** | Proyecto Firebase de **staging**. | Bloquea pruebas de backend real, publicación de reglas/índices y cualquier E2E con datos. |
| **P-04 / D5** | Identidad del administrador principal y autorización de `firebase-admin` para custom claims. | Bloquea P1.8. Hoy `MASTER_ADMIN_EMAIL` solo afecta al servidor; `firestore.rules` mantiene el literal y el test de paridad lo garantiza. |
| **D-07** | Auditoría AE-01 sin migración. | `registroCobros[]` no se migra hasta medir tamaño real en staging/emulador. |
| **D4** | Política, privacidad, límites y claves de IA. | Bloquea P2.4 (IA supervisada). |
| **H-14** | Índices no declarados en `firebase.json`. | Las consultas compuestas pueden fallar en producción. Pendiente de validar con CLI. |
| **Java 21** | Emulador oficial de reglas. | Las reglas nuevas no tienen verificación de emulador en este sandbox; solo CI. |
| **Clon superficial** | Guardias históricas f782/46bb. | 6 pruebas omitidas explícitamente; requieren `fetch-depth: 0`. |

---

## 8. Riesgos principales

| Riesgo | Severidad | Situación / mitigación |
|---|---|---|
| Afirmar cumplimiento VERI*FACTU sin remisión | Alta | **Corregido**: modalidad configurable con `PREPARACION` por defecto y aviso visible. |
| Escritura anónima en `solicitudes`/`candidatos` | Alta | **Corregido en el worktree**, pero **las reglas no están desplegadas**: en producción sigue vigente la versión anterior hasta que se publique. |
| Código OTP en texto plano | Alta | **Corregido en código y reglas locales**; mismo matiz de despliegue. |
| Toggles de permisos/módulos sin enforcement | Media | Etiquetados como informativos y desactivados; `firestore.rules` no consulta `modulos_config`. |
| Índices no publicados → consultas fallidas | Media | Documentado (H-14) con test de contrato; pendiente de arreglo en `firebase.json`. |
| Fuente IRAV caducada | Media | El motor ya se niega a calcular >45 días; el snapshot es de 2026-10-17 y caduca el ~2026-12-01. **Requiere refresco antes de esa fecha.** |
| 10 vulnerabilidades npm (1 crítica) | Media-Alta | Inventariadas; corrección condicionada a autorización del lockfile (P1.9.1). |
| Bundle ~5,57 MB | Media | Sin code-splitting (P1.9.2). |
| Simulaciones presentadas como reales | Media | 9 inventariadas y etiquetadas; 4 conservan texto explícito verificado por tests. |
| Concurrencia en `registroCobros[]` | Media | Documentada en AE-01; propuesta de transacción/versionado pendiente. |
| Interpretar el pre-dictamen como dictamen | Media | Aviso explícito y lista de firmas pendientes. |

---

## 9. Estado Git

- Rama de trabajo: **`arena/fb69e0b0-gestor-de-inmuebles-vercel`** (única rama
  usada; `main` intacta en `2563831`).
- Commits de esta sesión: `375af75` → `2e48032` → `13898d9` → *(este informe)*.
- `git status`: **sin cambios pendientes** tras este commit (salvo `node_modules`
  y `dist`, ignorados; no se han versionado artefactos generados).
- Clon superficial: `git rev-parse --is-shallow-repository` = `true`.
- **No se ha hecho `git push`** en esta sesión: los commits están en el
  worktree local de la rama. Se evita deliberadamente para no activar
  canalizaciones de despliegue que pudieran estar conectadas al repositorio.
  Para publicarlos: `git push origin arena/fb69e0b0-gestor-de-inmuebles-vercel`.
- El workflow `.github/workflows/emulador-reglas.yml` **no incluía esta rama**
  en `push.branches`; se ha añadido en el último commit para que, al publicar,
  se ejecuten los emuladores oficiales, tipos, suite, integración, doctor y
  build. El workflow **no despliega nada**.
- No se ha abierto ningún pull request, ni fusionado/ cerrado ninguno.

---

## 10. Próximos pasos priorizados (fuera de esta ejecución)

1. **Publicar los cambios con seguridad:** `git push` de la rama y ejecutar la
   CI con `fetch-depth: 0` y **Java 21** para el emulador oficial de reglas y
   las 6 guardias históricas. Hasta que eso pase, no desplegar reglas.
2. **P-05: encargar el dictamen fiscal.** Sin él, P1.5 y cualquier transporte
   AEAT/B2B quedan bloqueados. Reconfirmar la vigencia de las 7 fuentes AEAT/BOE.
3. **P-06: crear staging** y, con él, verificar `firebase deploy --only
   firestore:indexes --dry-run` (H-14) antes de publicar reglas e índices.
4. **Refrescar el IRAV** antes de ~2026-12-01 (o implementar la descarga viva
   del INE con endpoint verificado); mientras tanto, el motor se negará a
   calcular, que es el comportamiento seguro.
5. **P1.9.1 / P1.9.2:** autorizar `overrides` del lockfile para las 10
   vulnerabilidades y atacar el code-splitting del bundle.
6. **Medir AE-01 en emulador** (120/240/480 periodos) y resolver la
   concurrencia de `registrarPagoPeriodo` con transacción/versionado.
7. Solo entonces valorar **P2.1 (RGPD/DSAR)**, **P2.2 (accesibilidad)** y
   **P2.3 (E2E de navegador)**, en ese orden.

---

## 11. Comandos para reproducir la verificación

```bash
npm ci
npx tsc --noEmit
npm test                    # Vitest
npm run test:integracion    # node:test (operaciones + patrimonial)
npm run build
npm run doctor              # estático
npx tsx server.ts &         # servidor local SIN credenciales
npm run doctor -- --url http://127.0.0.1:3000/api/health
npm run test:emulador:reglas # REQUIERE Java 21 (no disponible en el sandbox)
```

---

## 12. Declaración final de honestidad

- **No se ha desplegado nada**, no se han escrito datos en producción, no se
  han usado secretos reales, no se han creado recursos externos ni contratado
  servicios, y no se han añadido dependencias.
- Las reglas de Firestore **sí se han modificado en el repositorio**, pero
  siguen **sin publicar**: el riesgo correspondiente permanece abierto.
- Las pruebas con emulador oficial, las guardias históricas omitidas y el E2E
  de navegador **no se presentan como superadas**.
- Ninguna simulación se ha presentado como integración real; las nueve
  inventariadas están etiquetadas en la interfaz.
- P2 son **propuestas**, no compromisos de entrega.
EOF
echo "OK"; wc -l docs/INFORME-CONSOLIDADO-EJECUCION-2026-10-27.md