# BLOQUE E — Portal del Inquilino + Suministros (Arena B)

Origen: `arena/01a0bfd3-gestor-de-inmuebles-vercel` (reconciliado `97ea0cb`) · Estado: **INTEGRADO EN LA CANÓNICA** (`arena/01a0bfbe-gestor-de-inmuebles-vercel`, 2026-09-21, integración selectiva sobre `7d21d44`).

## 1. Auditoría previa (obligatoria, ejecutada)

- **Arena A**: no existe como rama ni código en este repositorio (verificado `git branch -a` + `ls-remote`). No se ha tocado ni fusionado nada fuera de la rama de sesión.
- **BLOQUE B**: presente y verificado (commit `87aed9a`, suite 79/79). E lo consume sin modificarlo.
- **BLOQUE C (morosidad) / BLOQUE D (actas/firma/OTP)**: **no existen** en el repo (ni ramas ni código). No se ha creado ningún motor paralelo; E deja puntos de hook documentados (§8).
- **Inexistentes confirmados**: `vitest` (las suites son `tsx scripts/test-*.ts`), dispatcher de notificaciones GAP1, conciliación GAP6, colección `comunicaciones`/`cobros_periodo` (los cobros viven **embebidos** en `ContratoFormalizacion.registroCobros` y se derivan con `cobrosEngine`), `subscribeCobros`, segundo auth/RBAC (se extiende el canónico).
- **Hallazgo corregido**: `storage.rules` no cubría `incidencias/{id}/…` (caía en DEFAULT DENY); la sección E lo regula.

## 2. Alcance implementado

Portal aislado móvil (inicio → vivienda/contrato → documentos/recibos/pagos → incidencias → comunicaciones → suministros → historial) + submódulo Suministros (CUPS/contador, titular, comercializadora, tarifa, potencia, cambio de titular, historial, reparto por habitaciones) + lecturas **inmutables** con trazabilidad (`corrigeLecturaId`) + historial visible derivado.

## 3. Modelo de datos (aditivo, sin romper tipos existentes)

- `UsuarioApp`: `tipoPerfil += 'INQUILINO'`, `contratoIds[]`, `habitacionIdentificador?`, `enlaceRegistroId?`.
- `EnlaceRegistro`: `tipoPerfil += 'INQUILINO'`, `contratoIdVinculado?`, `inmuebleIdVinculado?`.
- RBAC: rol `INQUILINO_PORTAL`, permisos `inquilinos.ver/gestionar`, `suministros.ver/gestionar` (categorías nuevas); `GESTOR_INMUEBLES` los incluye; `SUPERADMIN` los hereda.
- Nuevas colecciones: `suministros`, `lecturas_suministro` (inmutable), `cambios_titular`, `mensajes_portal`.
- Índices de capacidad (autodescubrimiento sin listados): `contrato.{incidenciaIds, mensajeIds}`, `inmueble.{suministroIds, contratoIdsAutorizados}`, `suministro.{lecturaIds, cambioTitularIds, contratoIdsAutorizados}`, `incidencia.contratoIdsVisibles`.
- `AuditLog.entidadAfectada += contrato | incidencia | suministro | mensaje`.

## 4. Seguridad (deny-by-default + aislamiento inquilino→contrato→inmueble)

- `firestore.rules`: **E.0** helpers (`isTenant`, `isStaff`, `tenantTieneContrato`, `indiceInmutableOCrece`, `enlaceInquilinoValido`…); **E.1–E.4** mensajes/suministros/lecturas/cambios; deny `list` para inquilino en todas las colecciones (lee por `get` + índices); blindaje `isStaff()` en 22 secciones; `audit_logs` no legible por inquilino (sí escribible); lecturas `update/delete: false`; alta INQUILINO solo desde invitación activa vinculada; `contratoIds` inmutables para el titular.
- `storage.rules`: **E.0–E.4** evidencias de incidencias, fotos de lectura (subida vía contrato activo), documentos de contrato y recibos; PDF/imágenes ≤ 10 MB; borrado solo personal; lectura de inquilino acotada a sus contratos vía `firestore.get`.
- Requisito: el inquilino usa su **Auth UID como ID** de `usuarios/{uid}` (las reglas resuelven el alcance por esa ruta) y exige proveedor Firebase Auth Email/Contraseña.
- Vistas saneadas por whitelist (`portalEngine`): el portal nunca muestra notas privadas, scoring de asegurabilidad, avalista, DNI/dirección del arrendador, importes/facturas de trabajos, contactos de profesionales ni autoría interna. Los adjuntos son siempre referencias a Storage (nunca base64).

## 5. Reutilización canónica (cero motores paralelos)

Auth/RBAC/usuarios/enlaces, `Incidencia` + `crearHistorialItem`, `ContratoFormalizacion` + `cobrosEngine` + `imprimirContratoPDF`/`generarTextoActaEntrega`, auditoría (`saveAuditLogFirestore`), Storage directo. Sin IA, sin segundo sistema de cobros/morosidad/tesorería/notificaciones/contratos/inmuebles.

## 6. Piezas nuevas

- Motor puro: `src/inquilino/{scope, suministrosEngine, portalEngine}.ts` (authService delega en `scope`).
- Persistencia: `src/lib/suministrosFirestore.ts` (sin `updateLectura` a propósito).
- Portal móvil: `src/components/portal-inquilino/*` (shell + 9 vistas + registro público `?registroInq=`).
- ERP: `InquilinosSection` (accesos, invitaciones, hilos, vinculación) y `SuministrosSection` (admin completo; propietario: consulta + lecturas). Invitación: `enlaces_registro` + concesión de alcance; revocación retira alcance.

## 7. Pruebas

- `npm run test:bloque-e`: **64/64 PASS** (alcance, invitación, lecturas, reparto, titular, mensajes, saneado, historial, reglas estáticas).
- `npm run test:bloque-b`: **79/79 PASS** (sin regresión).
- `npm test` (circuito candidatos): **16/22**, idéntico al baseline `87aed9a` (fallos 01/04/11/17/21/22 preexistentes, verificados por stash).
- `npx tsc --noEmit`: 0 errores. `npm run build`: OK.
- No ejecutables (documentado §1): suites C/D y `vitest` (inexistentes en el repo).

## 8. Hooks C/D y limitaciones honestas

- **C (morosidad)**: el portal muestra estados de cobro tal cual (`PENDIENTE/RETRASADO/…`); cuando C exista, sus campos calculados se pintan en `PortalRecibos` sin cambiar reglas (lectura vía contrato).
- **D (actas/firma/OTP)**: el portal muestra el acta y estados de firma actuales; la firma electrónica futura se engancha en `PortalContrato`/`PortalDocumentos`.
- El documento de contrato es atómico en `get`: los campos internos se ocultan solo a nivel de vista saneada (mejora futura: subcolección privada).
- La subida de foto de lectura exige `inmueble.contratoActivoId` (acción «Marcar activo» en Vinculación); la lectura sin foto siempre funciona.
- El registro público propietario/profesional (`PortalRegistroView`) tiene una limitación preexistente (lista `enlaces` sin sesión); el flujo inquilino usa `get` por ID y no la hereda.

## 9. Commits (rama de sesión)

1. `299fd51` modelo + RBAC + reglas · 2. `ec20c16` motor + persistencia + tests · 3. `c4f78c0` portal + registro · 4. ERP + docs (este commit).

## 10. Reconciliación contra la canónica de Arena A (2026-09-21)

Merge `5030630`: canónica `7d21d44` INTO rama B (base `4d420bd`), sin reescritura
de E y sin tocar Arena A. Tag de seguridad previo: `respaldo-e-pre-reconciliacion`.

**Resolución del merge (canónica + E, sin duplicar matches de reglas):**
- `package.json` (scripts canónicos + `test:bloque-e`), `Sidebar`/`MobileNav`
  (items E tras actas/recomercialización), `authService` (canónico + guarda E:
  INQUILINO sin espejo `usuarios_auth`).
- `types.ts` (canónico + secciones/campos/roles E; campos E reubicados en
  `Inmueble`), `App.tsx` (estados/handlers `tesoreria*` + morosidad canónicos;
  rutas E: portal INQUILINO, `?registroInq=`, secciones inquilinos/suministros).
- `firestore.rules`: modelo canónico §0–§38 + helpers E.0, §11/§13 uniones E,
  trasplantes tenant en §2 contratos e incidencias, E.1–E.4 renumeradas §39–§42.
- `storage.rules`: interno canónico + E.0–E.4 tenant-scoped.

**Adaptaciones E→canónica (mínimas, justificadas):**
- Categorías/estados de incidencia a valores canónicos; `resolucion` acepta
  `string | ResolucionIncidencia` (normalizador `textoResolucionIncidencia`).
- Render `TesoreriaSection` a nombres `tesoreria*` (cambio ERP, no E).
- Adaptador D de solo lectura (`src/inquilino/actasAdapter.ts`): actas por
  `contractId` + saneado PII; sección en Documentos (tipo/estado/versión/PDF).
  Sin OTP/versionado/escrituras: firma y PDF los genera gestión.
- Tests E-60/E-62 actualizados a §39–§42 y lista de actas acotada (misma
  intención de seguridad).

**Decisiones de reutilización (auditoría §4):**
- E no usa ni duplica dispatcher GAP1, `comunicaciones`, `cobros_periodo`,
  `subscribeCobros` ni motores C/D: cero duplicaciones, nada que borrar.
- `mensajes_portal` SE MANTIENE (hilo portal-específico inquilino↔gestión).
- Recibos leen `contrato.registroCobros` (vista, sin recalcular); morosidad y
  actas-escritura quedan fuera del portal.

**Re-auditoría de seguridad (tenant):** 7 endurecimientos solo-tenant (roles
canónicos intactos): `solicitudes`, `configuracion_aseguradoras`,
`solicitudes_seguro_impago`, lista `notificaciones`, escrituras
`profesionales`/`especialidades`, `system/*`≠`modulos_config` (protege
`gmail_config`). Verificado: INQUILINO sin acceso ERP (shell exclusiva), sin
espejo (roles canónicos falsos), sin mutar ids, sin IA, 9 vistas aisladas.

**Aceptación:** E 64/64 · B 92/92 · C 82/82 · D 51/51 · full 460/460 · tsc 0 ·
build OK. B/C/D funcionalmente intactos.

**Veredicto: LISTO PARA INTEGRACIÓN** (pendiente: orden de integración en A).
