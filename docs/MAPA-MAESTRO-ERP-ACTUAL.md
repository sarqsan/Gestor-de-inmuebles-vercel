# MAPA MAESTRO ERP — Estado real (actualizado 2026-09-20, BLOQUE B)

> Fuente de verdad: código + Git. Este mapa solo refleja lo verificado en el repositorio.
> Leyenda: ✅ implementado · 🟡 funcional con mejoras/pendiente de integración externa ·
> ⬜ pendiente · 🔌 dependencia externa (banco/proveedor).

## Módulos y estado

| Área | Estado | Evidencia en código |
|---|---|---|
| Inmuebles | ✅ | `InmueblesSection`, col. `inmuebles` |
| Propietarios + cuentas IBAN | ✅ | `PropietariosSection`, col. `propietarios` |
| Candidatos / preselección / visitas / cuestionarios | ✅ | circuito + tests `test-candidate-circuit` (16/22 en base; 6 fallos preexistentes documentados) |
| Documentación post-visita | ✅ | `solicitudes_documentacion` |
| Formalización LAU + firma + acta llaves | ✅ | `contratoEngine`, col. `contratos_formalizacion` |
| Cobros mensuales (previsto/recibido/estado/justificante) | ✅ | `cobrosEngine`, `CobrosSection` (anidados en contrato) |
| Resumen fiscal anual por inmueble | ✅ | `generarResumenFiscalInmueble` (estructura base) |
| Seguro de impago + Gmail | ✅ | `solicitudes_seguro_impago`, `gmailClient` |
| Incidencias + IA + pólizas + siniestros | ✅ | cols. `incidencias`, `polizas_seguros`, `siniestros` |
| Profesionales / trabajos / presupuestos / valoraciones | ✅ | cols. `trabajos_profesionales`, etc. |
| Usuarios / RBAC / auditoría | ✅ | `authService`, `audit_logs` |
| **BLOQUE B — Tesorería y liquidaciones** | ✅ | `src/tesoreria/*`, `TesoreriaSection`, cols. `liquidaciones_propietarios`, `gastos_inmuebles`, `ordenes_pago` |
| **BLOQUE B — Gastos imputables** | ✅ | `gastosEngine` + importador de trabajos finalizados |
| **BLOQUE B — SEPA pain.008 (adeudos)** | 🟡 | Generador/validador `pain.008.001.02` + mandatos; 🔌 ejecución real vía banca electrónica del cliente |
| **BLOQUE B — SEPA pain.001 (pagos)** | 🟡 | Generador/validador `pain.001.001.03` desde órdenes con origen; 🔌 ejecución real vía banca electrónica |
| **BLOQUE B — Portal propietario: liquidaciones** | ✅ | Subtab "Mis Liquidaciones" + PDF + detalle |
| **BLOQUE B — PDF liquidación** | ✅ | `liquidacionPdf` (patrón `window.print`, sin motor duplicado) |
| Conciliación bancaria automática (camt.053) | 🟡 | Adaptador de lectura + `sugerirConciliacion` documentado; 🔌 extractos bancarios / conector |
| Dispatcher notificaciones (GAP1) | ⬜ | Eventos tipados + auditoría; sin envío real (diseñado para enchufar dispatcher futuro) |
| Facturación (GAP7/GAP8) | ⬜ | Solo base/IVA registrados; sin motor de facturación |
| Portal del inquilino (BLOQUE E) | ✅ IMPLEMENTADO EN ARENA B / PENDIENTE INTEGRACIÓN | Ver docs/BLOQUE-E-IMPLEMENTACION.md |
| IA asistente / Ayuda / Bloques C/D | ⬜ | Fuera de alcance |

## Colecciones Firestore (BLOQUE B, nuevas)

`liquidaciones_propietarios` · `gastos_inmuebles` · `ordenes_pago` · `ficheros_sepa` ·
`mandatos_sepa` · `config_liquidacion` — reglas 22–27 en `firestore.rules`.

## Circuitos cerrados

- Inquilino → Cobro (`CobrosSection`) → Liquidación (`TesoreriaSection`) → Orden → pain.001 → Pago con evidencia → marca cobro→liquidación.
- Cobros pendientes + mandato → pain.008 → banca electrónica → cobro registrado → conciliación sugerida.
