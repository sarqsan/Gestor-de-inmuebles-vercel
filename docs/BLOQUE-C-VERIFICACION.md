# BLOQUE C — Verificación y cierre (2026-09-20)

Rama de desarrollo: `arena/01a0c03d-gestor-de-inmuebles-vercel`
BASE: `5ff8448301ba2e49f4418f9a66d66ec2ff5eb15f` ("feat(tesoreria): integrar bloque B en ERP canonico")
Commit de cierre: el HEAD de esta rama con mensaje
**`feat(morosidad): cerrar bloque C de recobro y expediente`** (commit único de cierre; los
cambios se desarrollaron sobre el worktree y se versionan en él).

> **Este bloque NO está integrado en el ERP canónico.** Queda versionado y documentado en esta
> rama para que **Arena A** lo audite e integre selectivamente. No se ha hecho merge con nadie.

---

## 1. Estado de Git verificado antes de tocar nada

| Concepto | Valor real observado |
|---|---|
| Repositorio | `sarqsan/Gestor-de-inmuebles-vercel` |
| Rama de sesión | `arena/01a0c03d-gestor-de-inmuebles-vercel` (creada sobre `4d420bd`, luego alineada a `5ff8448`) |
| HEAD al iniciar | `4d420bd…` (estrictamente por detrás del HEAD canónico indicado `5ff8448`) |
| HEAD de trabajo | `5ff8448301ba2e49f4418f9a66d66ec2ff5eb15f` |
| Remoto | `origin` → `https://github.com/sarqsan/Gestor-de-inmuebles-vercel.git` |
| Baseline de tests antes del bloque | **330** tests vitest + **92** de `npm run test:bloque-b`, todos verdes |
| GAP 1–GAP 8 y BLOQUE B | presentes e IMPLEMENTADOS en `5ff8448` (verificado leyendo código y `docs/`) |

**Desviación declarada:** al inicio de la sesión la rama estaba estrictamente por detrás del HEAD
canónico y **no contenía trabajo propio**, por lo que se ejecutó `git reset --hard 5ff8448`
después de comprobar que `4d420bd` era ancestro de `5ff8448` (ningún commit ajeno perdido).
Se documenta aquí porque es una operación destructiva, aunque en este caso no destruyó trabajo.

## 2. Batería de cierre — resultado exacto

| Comando | Resultado |
|---|---|
| `npm run test:bloque-c` | **82 PASS · 0 FAIL (82 comprobaciones)** = 79 tests reales de vitest + 3 comprobaciones estructurales (las 4 suites ejecutadas · cobertura ≥ 79 · 0 tests omitidos). vitest informado: `79 tests de 79; fallo: 0` |
| `npm run test:bloque-b` (regresión del bloque anterior) | **92 PASS · 0 FAIL (92 pruebas)** |
| `npx vitest run` (todo el repo) | **20 test files passed · 409 tests passed · 0 failed** (baseline 330 → **+79**) |
| `npx tsc --noEmit` (= `npm run lint`) | **0 errores, exit code 0** |
| `npm run build` | **Éxito**: `✓ built in 11.29s` (12.11 s en la ejecución previa; la diferencia es solo tiempo de bundling); `dist/server.cjs 156.2kb`, `dist/server.cjs.map 262.3kb`, `⚡ Done in 14ms`. Único aviso: *chunks > 500 kB* (`dist/assets/index-*.js` ≈ 3,45 MB), **preexistente**, no introducido por el BLOQUE C |

### Desglose por suite (vitest, exacto)

| Suite | Pruebas | Estado | Qué fija |
|---|---:|---|---|
| `src/utils/morosidad/morosidadEstados.test.ts` | 19 | ✅ 19/19 | Transiciones válidas/inválidas, motivos obligatorios, bloqueos (`pagada_requiere_saldo_cero`, `cierre_con_saldo_requiere_*`, `escalado_requiere_requerimiento_o_confirmacion`, `juridica_requiere_actividad_negociadora_previa_LO1_2025`), estados terminales, id determinista del histórico (replay no duplica; importes distintos del mismo día no colisionan) |
| `src/utils/morosidad/morosidadEngine.test.ts` | 33 | ✅ 33/33 | Clasificación de cobros, construcción de piezas, sincronización (deuda huérfana **no** se borra: `cobro_sin_fuente:{fecha}`), política por defecto y versionado, plan de recobro (`fechaObjetivo = vencimiento + diasOffset + diasGracia`), evidencias (saneado anti-secretos, id determinista), comunicaciones manuales por medio, estados de comunicación, importes jurídicos (sin tipo inventado), espejo del propietario (20 campos, sin datos de inquilino/estrategia) |
| `src/utils/morosidad/morosidadStore.test.ts` | 18 | ✅ 18/18 | Casos de uso con repositorio en memoria + **dispatcher GAP 1 real**: detección y apertura, cambio de estado con histórico y auditoría, comunicación `EMAIL` → documento GAP 1 con `PENDIENTE_ENVIO`/`FALLIDA` (jamás `ENVIADA`), repetición idempotente, pago solo vía `registrarPagoPeriodo`, compromiso cubierto con cobros reales, incumplimiento que transiciona el expediente, escalado a aseguradora y gate jurídico (doble bloqueo MASC), recálculo de conceptos bloqueado/aceptado, aislamiento por `propietarioId` |
| `src/utils/morosidad/firestoreRulesMorosidad.test.ts` | 9 | ✅ 9/9 | Invariantes textuales de §32–§37: `isMasterAdmin()` en toda escritura, invariante de `id`, `propietarioId` exigido, append-only del histórico, `allow delete: if false` en las 6 colecciones, propietario solo lee espejos recortados, helper anti-secretos definida antes de su uso, §22 de `notificaciones` no re-regulado, y **catch-all final `allow read, write: if false`** |

### Comprobaciones estructurales del script de cierre

```
✅ [C-80] las 4 suites del BLOQUE C se han ejecutado
✅ [C-81] cobertura mínima del bloque respetada (79 pruebas ≥ 79)
✅ [C-82] ningún test queda omitido/pendiente (nada se oculta con skip)
```

## 3. Límites de la verificación (lo que NO se ha verificado)

1. **Reglas de Firestore: verificación textual, no de ejecución.** El repo no contiene
   `@firebase/rules-unit-testing` ni emulator de reglas, así que `firestoreRulesMorosidad.test.ts`
   comprueba los **invariantes del fichero** (quién puede escribir, qué se ancla, qué está denegado),
   no la evaluación del motor de reglas sobre documentos reales. **PENDIENTE**: suite de emulator
   en la integración final.
2. **Sin transporte real de comunicaciones.** Con `emailProvider: null` (safe-mode del repo) el
   email queda `PENDIENTE_ENVIO` en el expediente y `FALLIDA` en `notificaciones`, con
   `error: 'email_no_configurado (safe-mode: sin proveedor SMTP/Resend)'`. **No se ha probado**
   la entrega real porque no hay proveedor configurado en el entorno.
3. **Sin integraciones externas**: aseguradora, AEAT/tribunales, burofax, notaría, Storage.
   Todo ello es **EXTERNO** y el código lo representa como dossier preparado + evidencia manual.
4. **Sin ejecución de las tareas periódicas** en un entorno con `setInterval`/cron: los casos de uso
   `detectarYGestionar` y `revisarCompromisosVigentes` son idempotentes y están cubiertos por tests,
   pero no se ha instalado un programador (no existe infraestructura de jobs en el repo).
5. **Sin pruebas E2E en navegador** (el repo no tiene Playwright/Cypress). La UI se valida por tipos
   (`tsc`), build y revisión del cableado en `App.tsx`.

## 4. Inventario de cambios del bloque (para la auditoría de Arena A)

**Ficheros nuevos (16):** `src/types/morosidad.ts`, `src/lib/morosidadFirestore.ts`,
`src/components/sections/MorosidadSection.tsx`, `src/components/modals/MorosidadDetalleModal.tsx`,
`src/utils/morosidad/` (8 módulos + 4 suites), `scripts/test-bloque-c.ts`. Total ≈ 8.800 líneas.

**Ficheros modificados (9):** `firestore.rules` (+150), `src/App.tsx` (+140),
`src/components/sections/PropietarioPortalSection.tsx` (+118), `src/notificaciones/plantillas.ts` (+93),
`src/types/notificaciones.ts` (+6), `src/components/Sidebar.tsx` (+5), `src/components/MobileNav.tsx` (+5),
`src/types.ts` (+2), `package.json` (+1 script).

**No tocado (verificado):** `src/tesoreria/**`, `src/utils/cobrosEngine.ts`, `src/notificaciones/dispatcher.ts`,
`src/utils/habitaciones*`, `src/utils/inventario*`, `server.ts`, `src/firebase.ts`.

**Cambios adicionales justificados** (necesarios para la coherencia del bloque, sin nueva función de negocio):
emisión GAP 1 desde `registrarComunicacion` + `EVENTO_POR_TIPO_EVENTO`; corrección de
`aplicarCobrosAlCompromiso` (asignación de remanente por cobro: antes podía dejar importes huérfanos o
duplicar cobertura); propagación de `propietarioId` a histórico y evidencias (lo exigen §33/§34);
sufijo en `idTransicion` (evita pisar un item append-only); `base64Data`/`adjuntoBase64` en
`CLAVES_PROHIBIDAS_EVIDENCIA` (coherencia con las reglas); `usuarioIdAdministracion` en el puente
(destinatario de bandeja interna); validación del jurídico contra el expediente prospectivo.

## 5. Checklist para la integración por Arena A

1. `git fetch origin && git checkout arena/01a0c03d-gestor-de-inmuebles-vercel`
2. `npm install` → `npm run test:bloque-c` (82 PASS) → `npm run test:bloque-b` (92 PASS) → `npx vitest run` (409 PASS) → `npx tsc --noEmit` (0) → `npm run build` (OK)
3. Revisar `firestore.rules` §32–§37 y el catch-all (numeración propia del bloque C: **no** reutiliza números de otros bloques).
4. Publicar/deployar reglas y crear las 6 colecciones nuevas (no hay migración de datos: el bloque es aditivo y derivativo).
5. Decidir si se conecta un proveedor de email real (entonces `EMAIL` pasará de `PENDIENTE_ENVIO` a entrega real) y si se añade el programador de `detectarYGestionar`.
6. **No** hay BLOQUE D en esta rama: ni portal del inquilino, ni IA, ni scoring automático.
