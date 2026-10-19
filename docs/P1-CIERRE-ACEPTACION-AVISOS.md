# P1 · CIERRE DE ACEPTACIÓN OPERATIVA DE AVISOS (2026-10-19)

> **Alcance de esta ronda.** Demostrar el funcionamiento de
> extremo a extremo del sistema de avisos —cálculo, destinatarios,
> calendario, persistencia, idempotencia, reintentos, auditoría,
> ejecución del cron y entrega por el canal configurado— con el
> **transporte real de la aplicación** dirigido a un servidor SMTP
> de captura local, sin efectos sobre destinatarios reales.
>
> **Lo que NO se hace en esta ronda (aplazado por decisión del
> propietario):** la prueba de entrega real de correo a buzones de
> Internet y la verificación del cron operando en el despliegue de
> Vercel. Quedan como **PENDIENTE DE PRUEBA MANUAL POSTERIOR**
> (§6). No se han enviado correos reales, no se ha desplegado ni
> se ha tocado producción.

---

## 1. Estado de la integración

| Punto | Estado |
|---|---|
| Base (`main`) | `d416ddc` — P2 (PR #49) y P3 (PR #50) integrados, sin tocar |
| Rama de trabajo | `arena/1cadd6f1-gestor-de-inmuebles-vercel` |
| Suite completa (vitest) | **255 archivos · 4605 pruebas correctas** (2 skipped, 7 todo, preexistentes) |
| TypeScript (`tsc --noEmit`) | **0 errores** |
| Build (`vite build` + esbuild server) | **OK** |
| Suite focal P1 | **27/27** (`tests/p1-avisos-cierre-aceptacion.test.ts`) + 91 pruebas Fase A/regresión |

## 2. Matriz de aceptación

### A · Cálculo y calendario — **ACEPTADO**
| Garantía | Evidencia |
|---|---|
| Selección por fecha y situación (día 5 vencido + saldo pendiente) | `P1-A`: vencido el 5 y hoy 6+ avisa; el mismo día 5 **no**; cobrado/VERIFICADO **no**; saldo parcial **sí**; sin vencimiento **no**; futuro **no** |
| Destinatarios autorizados, sin ajenos | `P1-A`: exactamente inquilino + propietario (dominios ficticios `*.example.test`); la guarda del modo de pruebas rechaza cualquier otro dominio **antes** de conectar |
| Límites temporales, duplicados y no-generación | `P1-A` + `P1-B`: programada futura no se adelanta; doble pasada no duplica |
| El cálculo por sí solo no es un envío | `P1-A`: `periodosConAvisoDia5` es función pura; cero invocaciones al dispatcher |

### B · Persistencia e idempotencia — **ACEPTADO**
| Garantía | Evidencia |
|---|---|
| Mismo trabajo de cron dos veces | `P1-B`: mismos ids deterministas (`not_ev_cobro_…`), segunda pasada reporta `duplicada`, **0 mensajes nuevos** en la captura |
| Fallo entre etapas y recuperación | `P1-B`: transporte caído (421) → `FALLIDA` reintentable → pasada siguiente → `ENVIADA` con `intentos: 2` y auditoría `creada → intento_envio → enviada` |
| Reintento sin duplicados cuando el proveedor no garantiza deduplicación | `P1-B`: respuesta ambigua (servidor recibe DATA pero no confirma 250) → **entrega incierta**, reintento automático **bloqueado**, cero mensajes nuevos; reintento forzado por operador queda auditado (`reintento_forzado_entrega_incierta`) |
| Estados persistidos fieles | Repositorio canónico real (`crearRepositorioNotificacionesFirestore`, create-if-absent) sobre almacén fiel: `ENVIANDO → ENVIADA/FALLIDA`, `provider`, `externalId`, auditoría append |

### C · Cron y seguridad — **ACEPTADO**
| Garantía | Evidencia |
|---|---|
| Autenticación del endpoint | `P1-C`: sin `CRON_SECRET` → 503 cerrado (`cron_no_configurado`); secreto ausente/incorrecto/query-string → 401 **con 0 ejecuciones**; Bearer correcto → 200 con resumen; sin credencial de servicio → 503 (`reloj_no_disponible`) |
| Solicitudes no autorizadas no procesan ni envían | `P1-C`: contador de ejecuciones = 0 y bandeja de captura vacía tras 411/401 |
| Proveedor falla, tarda, rechaza o responde inválido | `P1-C` + `P1-D`: lento (250 ms) espera y entrega; 550 → `FALLIDA` con causa; protocolo roto → fallo cerrado |
| Errores registrados sin secretos | `P1-C`: el resumen y errores nunca contienen la URL SMTP ni credenciales (`smtp_error: host: CÓDIGO (NNN)` acotado) |

### D · Transporte y recepción en el entorno de prueba — **ACEPTADO (entorno de prueba)**
| Garantía | Evidencia |
|---|---|
| Recorrido con el transporte real de la app | `P1-D`: `crearTransporteEmailDesdeEntorno` → `EmailProviderSMTP` → **nodemailer real** (greeting/EHLO/AUTH/MAIL/RCPT/DATA sobre TCP) → servidor de captura local (`node:net` puro, `tests/harness/servidorSmtpCaptura.ts`) |
| Mensaje en bandeja de captura y coherencia | `D1`: destinatario, asunto (`Recibo de alquiler pendiente — Calle Prueba 1 (2026-03)`), cuerpo (importe, contrato, despacho, ubicación) y `Reply-To` al propietario verificados; sin DNI/teléfono/IBAN |
| Dos destinatarios ficticios por separado | `D2`: inquilino y propietario verificados individualmente (sobre, contenido y Reply-To por rol) |
| Rechazo, error de transporte, respuesta ambigua | `D3` (550 → `FALLIDA`, nada en bandeja), `D4` (421 → `FALLIDA` reintentable → recuperación), `D5` (cierre sin 250 → **entrega incierta**, nunca `ENVIADA`), `D6` (protocolo roto → fallo cerrado) |
| No marcar entregado lo rechazado o indemonstrable | `D3`/`D5`: el servidor recibió el mensaje pero el sistema **no** lo da por entregado sin `accepted` confirmado |
| Reintentos y auditoría | `D4` + `P1-B`: reintentos acotados a `MAX_REINTENTOS=3`, agotamiento sin falso `ENVIADA`, auditoría por intento |

> **Nota de evidencia:** la recepción en el servidor de captura
> demuestra entrega **al entorno de prueba**, no recepción en una
> bandeja de correo de Internet.

### E · Regresión — **ACEPTADO**
Suite completa 4605 pruebas (incluye P2 y P3), `tsc`, build, y las
pruebas focales Fase A (91) + suite P1 (27). Ver §1.

### Evidencia de cron y SMTP operativos fuera del entorno de prueba — **BLOQUEADO (aplazado por el propietario)**
- No se ha accedido a Vercel ni a credenciales de correo: la
  operación del cron `0 6 * * *` y la entrega SMTP real a buzones
  de Internet **no pueden acreditarse desde aquí** y requieren una
  prueba autorizada, no productiva, con destinatarios controlados.
- Según la orden de cierre, esta verificación queda **PENDIENTE DE
  PRUEBA MANUAL POSTERIOR** (guía: `docs/FASE-A-PUESTA-EN-MARCHA-AVISOS.md`,
  pasos 1–4) y no bloquea el merge.

## 3. Correcciones de defectos P1 realizadas (Fase 5)

1. **Entrega incierta SMTP (duplicado real evitado).** Antes: un
   fallo de red sin respuesta del servidor (cierre/timeout durante
   la transferencia) marcaba `FALLIDA` y el reloj **reenviaba
   automáticamente** al día siguiente — si el mensaje sí fue
   aceptado, el destinatario recibía el aviso **duplicado**. Ahora:
   `EmailProviderSMTP` verifica la sesión (greeting/EHLO/AUTH) antes
   de entregar; un fallo sin respuesta del servidor tras sesión
   verificada se clasifica `entrega_incierta:smtp_respuesta_ambigua:…`,
   y el dispatcher y el reloj **bloquean el reintento automático**
   (revisión humana; reintento forzado posible y auditado).
   Alcance compartido: `server/notificaciones/proveedorSmtp.ts`,
   `src/notificaciones/dispatcher.ts`, `server/notificaciones/relojAvisos.ts`
   (filtro de reintentos), `server/notificaciones/rutaPruebaSmtp.ts`
   (nueva etapa `entrega_incierta`). Regresión: 156 pruebas de
   notificaciones verdes.
2. **HTTP 2xx vacío no es entrega confirmada.** `EmailProviderHTTP`
   (Resend/SendGrid): un 2xx sin identificador de mensaje ya no
   devuelve `ok`; se clasifica `entrega_incierta:<proveedor>_respuesta_sin_id`.
3. **Convención canónica** `entrega_incierta:*` en
   `src/types/notificaciones.ts` (`PREFIJO_ENTREGA_INCIERA`,
   `esEntregaInciera`).

## 4. Automatización no productiva (Fase 2)

- `tests/harness/servidorSmtpCaptura.ts`: servidor SMTP **real**
  sobre TCP (sin dependencias nuevas) con modos inyectables
  (`aceptar`, `rechazar_destinatario`, `fallo_transporte`,
  `respuesta_ambigua`, `lento`, `respuesta_invalida`), bandeja
  consultable con mensaje parseado (cabeceras MIME decodificadas,
  cuerpo quoted-printable/base64) y traza de sesión (credenciales
  enmascaradas).
- `tests/harness/modoPruebasEmail.ts`: modo de pruebas **fail-closed**
  — transporte real de la app apuntado exclusivamente a
  `127.0.0.1:<captura>`; rechaza destinatarios fuera del conjunto
  ficticio **antes de abrir conexión**; se niega a construirse si el
  entorno del proceso contiene credenciales de proveedor o un SMTP_URL
  de producción; **no existe vía de fallback** a un proveedor real
  (si la captura no responde, el envío falla cerrado: `D7` lo demuestra
  con espía de sockets — cero conexiones fuera de loopback).
- Arranque/configuración/ejecución/limpieza automatizados dentro de
  la propia suite (`beforeAll`/`afterAll`); se ejecuta en CI con la
  suite de vitest del workflow `Emulador de reglas y verificación`.
  Datos 100 % ficticios (`*.example.test`, `*.sintetico.invalid`);
  cero credenciales reales.

## 5. Cambios del árbol

- Producción (correcciones P1): `src/types/notificaciones.ts`,
  `src/notificaciones/dispatcher.ts`, `src/notificaciones/canales.ts`,
  `server/notificaciones/proveedorSmtp.ts`,
  `server/notificaciones/relojAvisos.ts`,
  `server/notificaciones/rutaPruebaSmtp.ts`.
- Pruebas: `tests/p1-avisos-cierre-aceptacion.test.ts` (nueva),
  `tests/harness/servidorSmtpCaptura.ts` (nuevo),
  `tests/harness/modoPruebasEmail.ts` (nuevo).
- `package.json`: script `test:p1-avisos` (suite focal).
- Documentación: este archivo.
- **Sin** cambios en `package.json`/`bun.lock` de dependencias, sin
  migraciones, sin tocar P2/P3.

## 6. Pendientes (no bloqueantes)

1. **Entrega real de correo** (correos a buzones de Internet con
   destinatarios controlados y evidencia de recepción sin rebote):
   requiere credenciales Gmail de la cuenta del despacho y buzones
   controlados. **PENDIENTE DE PRUEBA MANUAL POSTERIOR** por decisión
   del propietario; guía en `docs/FASE-A-PUESTA-EN-MARCHA-AVISOS.md`.
2. **Cron operando en producción**: `vercel.json` declara
   `/api/cron/avisos` a las `0 6 * * *`, pero la declaración no es
   evidencia de operación; requiere verificación en el despliegue
   real (misma condición externa).
3. Persistencia contra el **emulador oficial de Firestore**: la
   suite focal usa el repositorio canónico real sobre almacén fiel
   en memoria; sin Java en este entorno no se ejecutó contra el
   emulador (las pruebas de reglas con emuladores siguen pasando
   en CI por su vía).
