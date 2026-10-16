# IA · FASE 5 — Asistente de incidencias para inquilinos

> Cierre de fase: la operación vive en el **gobierno central de IA** (mismo núcleo
> que las 11 anteriores) y **no se activa sola**: sin política aprobada
> (`IA_POLITICA_JSON` con tarifas) el núcleo sigue respondiendo
> `APROBACION_COMERCIAL_PENDIENTE`. Lo único que se añade aquí es código y
> pruebas; **no se ha consumido proveedor real ni se ha tocado producción**.

## Qué se añade

| Pieza | Fichero | Papel |
| --- | --- | --- |
| Catálogo | `src/ia/catalogoOperacionesIA.ts` | Nueva operación `ASISTENTE_INCIDENCIAS_INQUILINO` → `POST /api/asistente/incidencias-inquilino` (12ª del catálogo). |
| Motor puro | `src/ia/asistenteIncidenciasIA.ts` | Señales de riesgo, urgencia, medidas preventivas/prohibidas, preguntas aclaratorias, interpretación contractual orientativa, decisión económica, incertidumbre, límites, `distinguirPlanos` y fusión **validada** de la propuesta del proveedor. |
| Servidor | `server/ia/asistenteIncidenciasInquilino.ts` | Fuente autorizada (`usuarios_auth` → `usuarios` → `contratos_formalizacion` → `inmuebles`/`propietarios` → `incidencias`), normalización del cuerpo, asistente y traza mínima. |
| Ruta | `server.ts` | `nucleoIA.operacion('ASISTENTE_INCIDENCIAS_INQUILINO')`: autenticación, idempotencia, permisos, cuotas/saldo y registro ANTES del manejador. |
| Cliente | `src/lib/clienteAsistenteIncidencias.ts` | Único punto de acceso por `solicitarIA` (token + `Idempotency-Key`), con mensajes de usuario por código. |
| UI | `src/components/portal-inquilino/AsistenteIncidenciaAsistida.tsx` | Diagnóstico guiado, tres planos separados, incertidumbre, límites y derivación **a petición del inquilino**. |

## Garantías de la fase

1. **Identidad y alcance en servidor**: el `uid` sale del token verificado; el contrato,
   el inmueble, el propietario y la incidencia se leen de fuentes autorizadas. Un
   `contratoId`/`incidenciaId` enviados por el cliente son sólo sugerencias que se
   validan contra `usuarios/{usuarioId}.contratoIds` y `contratoIdsVisibles`.
2. **Mínimo privilegio**: al análisis sólo llega la lista blanca contractual del portal
   (nunca DNI, avalista, scoring, notas internas, historial de formalización ni contacto
   del profesional).
3. **Sin automatismos de negocio**: no atribuye responsabilidad legal/contractual, no
   crea cargos ni obligaciones, no estima importes (`importeEstimadoPorLaIA: null`) y no
   escribe en la incidencia ni en el contrato. La derivación es una sugerencia que el
   inquilino decide.
4. **Proveedor opcional y acotado**: si falla, responde raro o intenta claves prohibidas,
   se descarta (`origenRespuesta: 'DETERMINISTA'`) con aviso; nunca rebaja la urgencia
   determinista ni añade medidas inseguras.
5. **Trazabilidad mínima**: un documento por operación en `ia_incidencias_trazas/{operacionId}`
   con códigos y contadores (sin prompts, sin descripciones, sin nombres ni importes).
6. **Fallo cerrado**: sin credencial de servicio (fuente autorizada) la ruta responde 503;
   sin política aprobada el núcleo bloquea antes de llegar al manejador.

## Pruebas (ejecutadas)

* `tests/ia-fase5-asistente-incidencias.test.ts` — 22 casos (autorización, claves
  prohibidas y privacidad, incertidumbre/señales, fallos de proveedor, límites, traza).
* `src/components/portal-inquilino/asistente-incidencias.ui.test.tsx` — 5 casos (token,
  idempotencia, tres planos, rechazo del servidor, proveedor caído, derivación explícita).
* Matriz funcional de 9 casos sobre la app real (arranque ESM nativo) con identidad
  `INQUILINO`: `tests/ia-fase1-integracion-server.test.ts`.

## Pendiente (no bloquea la fase)

* La interpretación de cláusulas se limita a la lista blanca contractual del portal; los
  anexos firmados no están modelados en Firestore todavía (se documenta como límite).
* El catálogo pasa de 11 a 12 operaciones: la política de gobierno (permisos explícitos y
  tarifas finitas) se cierra en la Fase 7.
