# BLOQUE B — Tesorería, Liquidaciones de Propietarios y SEPA
## FASE 0 — Verificación y alineación (estado real verificado 2026-09-20)

> La conversación anterior de Arena B NO se considera fuente de verdad.
> Fuente de verdad: código del repositorio + Git + esta documentación.

### 0.1 Git (verificado en worktree)

| Concepto | Valor real observado |
|---|---|
| Repositorio | `sarqsan/Gestor-de-inmuebles-vercel` |
| Rama de trabajo | `arena/01a0bfd3-gestor-de-inmuebles-vercel` |
| HEAD inicial | `4d420bd37e96ca24861ab7062e19f4300a8a20f5` ("feat(inmuebles): add professional work closure and security rules") |
| Remoto | `origin` → `https://github.com/sarqsan/Gestor-de-inmuebles-vercel.git` |
| Ramas remotas | solo `origin/main` (sin ramas de continuidad ni otras Arenas visibles) |
| Referencia canónica citada en la orden (`91da820`) | **NO existe** en este clon (`git log --all` contiene un único commit `4d420bd`). No se ha hecho reset/merge ciego. Se trabaja sobre el HEAD real. |
| Worktree | limpio al inicio |
| `docs/MAPA-MAESTRO-ERP-ACTUAL.md`, `docs/CONTRATO-INTEGRACION-ARENAS.md`, `docs/ESTADO-GIT-ERP.md`, `docs/CONTINUIDAD-ARENA.md` | **NO existen** en el repositorio. Solo existe `docs/arquitectura/RECOMERCIALIZACION_INTELIGENTE.md`. Este documento y `docs/MAPA-MAESTRO-ERP-ACTUAL.md` (creado en BLOQUE B) pasan a ser la referencia escrita. |

**Decisión:** no reconstruir historia de otras conversaciones; no tocar nada ajeno al BLOQUE B;
no ejecutar `reset --hard` / `git clean -fd`; conservar todo el trabajo existente.

### 0.2 Código real inspeccionado

- `src/types.ts` (1916 líneas): `Inmueble`, `Propietario` (+`cuentasBancarias[]` con IBAN),
  `ContratoFormalizacion` (+`registroCobros?: CobroPeriodo[]`), `CobroPeriodo`
  (estados `PENDIENTE|RECIBIDO|VERIFICADO|RETRASADO|INCIDENCIA`, `importePrevisto`,
  `importeRecibido`, `fechaPago`, `metodoPago`, `referenciaBancaria`, justificante,
  `historialCambios`), `UsuarioApp` + RBAC (`PERMISOS_SISTEMA`, `ROLES_PREDEFINIDOS`),
  incidencias, pólizas, siniestros, trabajos/presupuestos profesionales.
- `src/utils/cobrosEngine.ts`: generación de periodos mensuales por contrato (inmutables una
  vez creados), `registrarPagoPeriodo`, `registrarIncidenciaPeriodo`, `calcularResumenCobros`,
  `generarResumenFiscalInmueble`. **Los cobros viven anidados dentro del contrato**
  (`contratos_formalizacion/{id}.registroCobros[]`), no en colección propia.
- `src/utils/contratoEngine.ts`: contrato LAU + impresión PDF vía `window.open` (patrón
  reutilizado para el PDF de liquidación).
- `src/lib/firebase.ts`: suscripciones/saves por colección; colecciones existentes:
  `propietarios`, `inmuebles`, `candidatos`, `solicitudes`, `invitaciones`, `slots_visita`,
  `solicitudes_documentacion`, `contratos_formalizacion`, `configuracion_aseguradoras`,
  `solicitudes_seguro_impago`, `usuarios`, `profesionales`, `enlaces_registro`,
  `especialidades`, `audit_logs`, `incidencias`, `polizas_seguros`, `siniestros`,
  `trabajos_profesionales`, `presupuestos_profesionales`, `valoraciones_profesionales`.
- `firestore.rules`: reglas por colección + `isOwnerOfInmueble()` para aislamiento.
- UI: `CobrosSection` (gestión mensual), `PropietarioPortalSection` (tabs Gastos/Cobros/
  Incidencias marcados "Próximamente"), `Sidebar` + `App.tsx` con secciones por rol.
- Tests: `scripts/test-candidate-circuit.ts` ejecutado con `tsx` (`npm test`).
  **No existe vitest, ni GAP1 (dispatcher notificaciones), ni GAP6 (conciliación bancaria),
  ni GAP7/GAP8 (facturación/fiscalidad), ni módulo de gastos, ni SEPA.**

### 0.3 Regla crítica

Sin divergencias de rama que resolver (una sola rama remota). Todo el BLOQUE B se implementa
de forma **aditiva**: nuevos ficheros en `src/tesoreria/`, nueva sección UI `tesoreria`,
nuevas colecciones Firestore y nuevas reglas; los motores existentes (`cobrosEngine`,
`contratoEngine`) **no se modifican** salvo extensiones de tipos estrictamente necesarias.
