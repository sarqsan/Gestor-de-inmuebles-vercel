# BLOQUE E — Portal del Inquilino + Suministros (Arena B)

Rama: `arena/01a0bfd3-gestor-de-inmuebles-vercel` · Estado: **IMPLEMENTADO EN ARENA B / PENDIENTE INTEGRACIÓN** (no merge a Arena A).

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
