# Pendientes abiertos — registro único

> Todo lo que queda abierto en el proyecto, con **de quién es** y **dónde está el
> cómo**. Si algo no está aquí, no está pendiente; si está aquí y ya se hizo,
> hay que cerrarlo en el mismo commit que lo hizo.
>
> Actualizado: **2026-10-28**. `main` = `7e20bfd`.

## Estados

| Estado | Significado |
|---|---|
| 🟡 **PENDIENTE** | Acordado, no empezado |
| 🔵 **EN CURSO** | Alguien trabaja en ello ahora mismo |
| ⛔ **BLOQUEADO** | No se puede avanzar sin algo externo (acceso, Java, credenciales) |
| ✅ **HECHO** | Cerrado con evidencia; se anota la fecha y se deja la fila una versión |

## Registro

| ID | Qué | De quién | Estado | Desde | Dónde está el cómo |
|---|---|---|---|---|---|
| **P-01** | Confirmar en la consola de Firebase los **10 índices** y los **6 casos del Rules Playground** | **Usuario** (cuenta de Google) | 🟡 PENDIENTE — **índices creados** y **recuento de reglas 4064 confirmado** (2026-10-29, informado por el usuario); faltan los marcadores o el simulador | 2026-10-28 | `docs/PENDIENTE-USUARIO-2026-10-28.md` |
| **P-02** | **H-17** — staging + dictamen fiscal: solo procedimiento y evidencia | Agente | 🟡 PENDIENTE | 2026-10-28 | `docs/ROADMAP-01-BLOQUEANTES-VALIDACION-Y-AUDITORIA.md` |
| **P-03** | **Bundle ~5,56 MB**: code-splitting (la primera carga del panel lo arrastra entero) | Agente | 🟡 PENDIENTE | 2026-10-27 | `docs/AUDITORIA-GLOBAL-ERP-2026-10-20.md` |
| **P-04** | **Sin E2E de navegador**: los flujos críticos están probados por unidades e integración, no por un navegador real | Agente | 🟡 PENDIENTE | 2026-10-27 | `docs/AUDITORIA-FUNCIONAL-PORTALES-2026-10-27.md` |
| **P-05** | `actions/*` desactualizadas: GitHub fuerza Node 24 sobre `checkout@v4`/`setup-node@v4`. **Aviso ya activo en cada run** | Agente | 🟡 PENDIENTE | 2026-10-28 | Aviso del propio run + §«Errores conocidos» |
| **P-06** | **H-15** parcial: quedan supuestos de emulador sin cubrir | Agente | 🔵 EN CURSO (parcial) | 2026-10-27 | `docs/INFORME-AUDITORIA-CIERRE-2026-10-27.md` |
| **P-07** | Dependencias con versión mayor retenida (`firebase@9.14.0`, `nodemailer@10.2.1`): decisión de **no** degradar, documentada | Agente | ⛔ BLOQUEADO por decisión | 2026-10-27 | `npm audit` + informe de cierre |

## Detalle de P-01 (lo del usuario)

Dos tareas, ~12 min, sin código:

1. **10 índices** en Firestore → Índices, base con nombre
   `ai-studio-gestordeinmueble-c6444afd-…` (no «(default)»).
2. **6 casos** en Firestore → Reglas → Simulador de reglas.

**No hay que republicar nada.** Las reglas ya están publicadas y el fichero del
repo no ha cambiado (`firestore.rules` = `sha256 81b9ae93…413d`, 4 064 líneas).
`storage.rules` sin cambios. Comprobación de 5 segundos antes de empezar: la
última línea de la pestaña Reglas debe ser **4 064**.

**Qué NO hacer mientras P-01 esté abierto:** ni revertir reglas, ni volver a
publicarlas «por si acaso», ni dar por confirmados los índices. Ante un resultado
inesperado en el simulador: parar y avisar.

**Dos caminos equivalentes** (§2.4 del documento del usuario):

- **A · simulador**: los 6 casos del Rules Playground.
- **B · identidad**: copiar el texto publicado y compararlo con `firestore.rules`
  (`node scripts/verificar-reglas-publicadas.mjs reglas-consola.txt`). Si el `sha256`
  coincide, lo publicado es lo que CI prueba en el emulador; con eso basta y
  sobran los seis formularios.

**Cómo se cierra P-01:** el usuario pega el cuadro de resultados de §5 de
`docs/PENDIENTE-USUARIO-2026-10-28.md`. En el mismo commit se anota aquí la
fecha, la versión publicada que muestre la consola y el estado de los 10 índices.
Hasta entonces esto se describe siempre como **publicado pero no confirmado**,
nunca como verificado.

## Lo que NO está pendiente

Para que no se reabra por inercia:

- **Reglas de Firestore y Storage**: publicadas en `gestor-inmuebles-produccion`.
- **H-01…H-05, H-07…H-14, H-16, D-09/R-5**: cerrados con evidencia. H-06 cerrado el
  2026-10-28 (PR #71) y verificado en producción.
- **Verificación de producción**: automatizada; un run verde solo cuenta si su
  resumen dice `**Commit verificado:** <sha>`.
- **Integración bancaria / PSD2 / pasarelas de pago**: excluidas por decisión del
  usuario, no son deuda.
