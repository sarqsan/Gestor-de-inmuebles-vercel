# P2 — Propuestas priorizadas (NO son compromisos)

**Fecha:** 2026-10-27 · **Estado:** propuestas evaluadas, **sin implementar**.
P2 queda fuera de la ejecución autorizada salvo decisión expresa del
propietario. Este documento sustituye a la lista informal de la Fase 0 por una
priorización con coste, dependencias, riesgos y criterio de salida.

> **Invariante que atraviesa todas las propuestas:** siguen prohibidas la
> integración bancaria, PSD2, agregadores AISP, importación automática de
> movimientos, iniciación de pagos, pasarelas online (Stripe/Redsys/Bizum/TPV)
> y equivalentes bajo otro nombre. El flujo es **documental y manual**. La IA
> puede extraer y proponer; **nunca confirma pagos ni contabiliza cobros**.

---

## 0. Qué se ha ejecutado ya (para no duplicar)

Antes de valorar P2 conviene recordar qué dejó hecho P0/P1: alta pública de
solicitudes por servidor con token/honeypot/cuota, reglas sin escritura
anónima, OTP con CSPRNG y hash salado, entrega de OTP por correo real con fallo
cerrado, doctor verificable, semillas desactivadas, 9 simulaciones etiquetadas,
secciones huérfanas resueltas, modalidad fiscal configurable y pre-dictamen
P1.4. **P2 no debe rehacer nada de eso.**

---

## 1. Priorización

| Orden | Propuesta | Valor | Coste | Dependencias | Decisión externa |
|---|---|---|---|---|---|
| **P2.1** | **RGPD/DSAR + retención configurable** (P2.C parcial) | Alto (riesgo legal) | Medio | Inventario de datos personales, reglas y Storage | Sí: política de retención y encargado de tratamiento |
| **P2.2** | **Accesibilidad WCAG 2.2 AA + i18n** (P2.C parcial) | Alto (mercado ES/EU) | Medio | Auditoría de los 4 portales | Sí: idiomas objetivo |
| **P2.3** | **E2E de navegador + pruebas de carga** (P2.C parcial) | Alto (confianza) | Medio | Staging o emuladores; Playwright ya en devDeps | Sí: entorno de staging (P-06) |
| **P2.4** | **IA supervisada documental** (P2.B) | Medio-alto | Alto | P1.4, política IA (D4), claves propias, privacidad | **Sí: D4 + DPIA + aprobación comercial** |
| **P2.5** | **API de intercambio DOCUMENTAL + webhooks + sindicación + iCal** (P2.A) | Medio | Alto | Contratos con portales (idealista/Fotocasa/Kyero/Habitaclia) | **Sí: contratos y condiciones de uso** |
| **P2.6** | Observabilidad/APM y trazas | Medio | Medio | Proveedor (coste potencial) | Sí: presupuesto |
| **P2.7** | Firma cualificada (Signaturit/FNMT) | Medio | Alto | Contrato + coste; D2 ya reparó el OTP propio | **Sí: contratación** |

---

## 2. Detalle de las propuestas

### P2.1 — RGPD/DSAR + retención configurable · **recomendada primera**

- Inventario de categorías de datos por colección (inquilinos, candidatos,
  documentos, `audit_logs`, `actas_otp`, justificantes, Storage).
- Endpoints de **acceso, rectificación, supresión y portabilidad** con
  verificación de identidad y registro de la solicitud; supresión que respete
  los plazos legales de conservación contable/fiscal.
- Retención configurable por colección y por contrato, con **borrado diferido
  verificable** (no borrado inmediato de evidencia legal).
- Criterio de salida: matriz de datos + 4 flujos DSAR probados contra emulador
  + prueba de que un borrado no rompe la cadena de auditoría.
- Riesgo: **suprimir un registro contable** → prohibido; se archiva, no se
  elimina, mientras exista obligación legal.

### P2.2 — WCAG 2.2 AA + i18n

- Auditoría con axe/Playwright de los cuatro portales; corrección de foco,
  contraste, etiquetas, navegación por teclado y `role`/`aria-live` en avisos.
- Externalización de cadenas (hoy hay texto fiscal/legal incrustado en JSX) a
  catálogos `es-ES` y, si se decide, `en`/`ca`/`val`.
- Criterio: 0 violaciones críticas/serias en los recorridos clave y captura de
  pantalla por portal.

### P2.3 — E2E de navegador + carga

- Recorridos reales: login por rol, alta pública de solicitud, revisión de
  justificante, firma OTP (con transporte de captura), emisión de factura en
  modo PREPARACION.
- Pruebas de carga sobre el servidor Express local con emuladores: 100
  solicitudes/min (ya cubierto por `tests/rate-limit-solicitud.test.ts` pero
  sin navegador), 20 consultas de catastro/min.
- Criterio: vídeo/traza por recorrido y umbrales de latencia documentados.

### P2.4 — IA supervisada (P2.B)

- Triaje de incidencias, OCR de facturas **en servidor**, extracción de datos de
  justificantes como **propuesta editable** y screening externo solo con
  consentimiento explícito.
- **Invariante verificable:** ningún resultado de IA llama a
  `registrarPagoPeriodo` ni cambia el estado de un cobro. `tests/justificantes-
  sin-contabilizacion.test.ts` es la base a extender.
- Bloqueos: D4 (IA desactivada por defecto hasta verificar política,
  privacidad, límites y claves), DPIA, aprobación comercial del gasto.

### P2.5 — API documental + sindicación (P2.A)

- API de **intercambio documental** (fichas de inmueble, solicitudes,
  documentos), webhooks firmados, iCal de visitas y sindicación a portales.
- **Salvedad explícita (D-14):** sin pagos ni banca bajo ningún nombre. Ningún
  webhook puede disparar un cobro.
- Requiere contratos/credenciales de cada portal; no se inventan endpoints.
  Hoy `PublicacionInmueblesPanel` está etiquetado como simulación y **no publica
  automáticamente**; cualquier integración debe sustituir esa etiqueta solo
  después de una prueba real.

### P2.6 / P2.7 — observabilidad y firma cualificada

- P2.6: trazas con correlación, métricas de colas de correo y errores de
  reglas; requiere elegir proveedor y presupuesto.
- P2.7: firma cualificada externa solo si el OTP propio (reparado en P0.3) no
  cubre la necesidad legal; requiere contrato y coste.

---

## 3. Propuestas DESCARTADAS (no reabrir)

| Propuesta | Motivo |
|---|---|
| Pago online / verificación con Stripe, Redsys, Bizum o TPV | **Exclusión permanente D-02.** |
| Conexión bancaria PSD2 / AISP, importación automática de movimientos | **Exclusión permanente D-03.** |
| Conciliación bancaria automática o «confirmación automática de cobros» | Equivale a la exclusión anterior aunque se llame de otro modo. |
| IA que contabiliza cobros o confirma pagos | Rompe el invariante: la IA propone, la persona registra. |
| Migración preventiva de `registroCobros[]` a subcolección | D-07: sustituida por AE-01; solo con evidencia de tamaño. |

---

## 4. Puerta de entrada a P2

P2 **no arranca** hasta que se cumpla:

1. Cierre de P0 con el emulador oficial de reglas en CI (Java 21) y las 6
   guardias históricas reevaluadas con historial completo.
2. Dictamen fiscal P1.4 firmado (P-05) si se quiere tocar facturación.
3. Decisión sobre **staging** (P-06) y sobre **IA** (D4).
4. Presupuesto y contrato para cualquier servicio externo.

Ninguna de esas decisiones se ha tomado en esta sesión. **No se ha desplegado
ni escrito nada en producción.**
