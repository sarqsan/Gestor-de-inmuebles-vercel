# FASE 6 — Notificaciones y trazabilidad del ciclo de vida de la incidencia

> Cierre de fase: el seguimiento lo decide **el servidor** observando la incidencia
> autorizada; los avisos salen por el **dispatcher canónico (GAP 1)** con su estado REAL
> de entrega persistido. **No se ha activado ningún proveedor externo**: con el email en
> `safe-mode` los avisos quedan `NO_ENVIADA` con su motivo y la bandeja interna (INAPP)
> es la única entrega efectiva.

## Qué se añade

| Pieza | Fichero | Papel |
| --- | --- | --- |
| Motor puro | `src/seguimiento/incidencias.ts` | Deriva eventos de un **cambio real** (registro, estado, prioridad, evidencias/asignación, escalado, resolución, derivación), con id/clave de idempotencia canónicos de GAP 1, destinos autorizados por tipo y pasos de evolución legibles. |
| Servicio | `server/seguimiento/seguimientoIncidencias.ts` | Autoriza por rol sobre la incidencia, observa Firestore, escribe el hilo `incidencias_seguimiento/{incidenciaId}` (append-only, CAS) y reintenta avisos pendientes. |
| Puente GAP 1 | `server/seguimiento/notificadorIncidencias.ts` | Elige el destinatario autorizado, usa la plantilla del evento y NO llama al dispatcher si no hay destinatario (`SIN_DESTINATARIO`). |
| Repositorio duradero | `server/notificaciones/repositorioNotificacionesFirestore.ts` | `notificaciones/{idDeterminista}` + registro append-only `notificaciones_entregas` (una fila por intento real). |
| Rutas | `server/seguimiento/rutasSeguimientoIncidencias.ts` | `GET /api/incidencias/seguimiento`, `POST /api/incidencias/seguimiento/sincronizar` (token verificado, autorización por incidencia, deny-by-default). |
| Cliente/UI | `src/lib/seguimientoIncidencias.ts`, `src/components/portal-inquilino/EvolucionIncidenciaPortal.tsx` | Evolución autorizada en el portal y solicitud explícita de seguimiento. |
| Plantillas | `src/notificaciones/plantillas.ts` | `incidencia.prioridad_cambiada`, `incidencia.actualizada`, `incidencia.escalada`, `incidencia.derivacion_solicitada`. |

## Reglas de la fase

1. **Sin cambio real no hay nada**: la sincronización compara la incidencia observada con la
   última instantánea del hilo; un guardado idéntico responde `SIN_CAMBIOS` sin escribir.
2. **Idempotencia por evento**: el id del evento y la clave del aviso son deterministas
   (`ev:incidencia:<suceso>:<incidencia>`), así que repetir la operación no duplica ni
   eventos ni avisos; el registro de entregas usa id determinista por intento.
3. **Entrega veraz**: sin destinatario autorizado no se llama al dispatcher; sin proveedor
   real el estado es `NO_ENVIADA`/`PENDIENTE` con motivo. Nunca se declara «enviado».
4. **Escalado determinista**: prioridad `URGENTE` sin profesional asignado, o plazo vencido
   según prioridad (4/24/72/168 h), escalan **una sola vez** por motivo.
5. **Aislamiento**: inquilino (sólo sus contratos), propietario (sólo su inmueble),
   profesional (sólo si está asignado), administración; cualquier otro caso ⇒ 403.
   El hilo no guarda texto libre, ni emails, ni notas internas.
6. **No es IA**: no consume cuotas, créditos ni registro de operaciones de IA.

## Configuración (opcional)

| Variable | Efecto |
| --- | --- |
| `SEGUIMIENTO_ADMIN_USUARIO_ID` | Bandeja INAPP de administración para los avisos de escalado. Sin ella, el destino `ADMINISTRACION` queda sin resolver (no se inventa). |
| `ENABLE_EMAIL` / `SMTP_URL` / `EMAIL_FROM` | Proveedor de email. Sin él, EMAIL queda en safe-mode y el aviso se registra como no enviado. |
| (sin credencial de servicio) | Sin `FIREBASE_SERVICE_ACCOUNT` las rutas responden 503 y el repositorio de notificaciones vuelve al almacén en memoria de desarrollo. |

## Pruebas (ejecutadas)

* `tests/seguimiento-incidencias.test.ts` — 23 casos (motor, autorización por rol,
  idempotencia, escalado, entrega real, reintento seguro, CAS con carrera, repositorio).
* `tests/seguimiento-incidencias-e2e.test.ts` — 8 casos de punta a punta sobre la app real
  (tokens RS256, Firestore REST simulado, hilo, notificaciones, aislamiento, escalado,
  «no es IA»).
* `src/components/portal-inquilino/evolucion-incidencia.ui.test.tsx` — 4 casos de interfaz.

## Pendiente (no bloquea la fase)

* Los flujos de gestión que cambian estado llaman a la sincronización en el alta del portal
  del inquilino y en `IncidenciasSection`; los modales profesionales reutilizan la misma
  función pero su cableado fino se hará con el rediseño de esa área.
* Reintentos programados (cron) para avisos pendientes: hoy se reintentan en la siguiente
  sincronización (con tope de intentos del dispatcher).
