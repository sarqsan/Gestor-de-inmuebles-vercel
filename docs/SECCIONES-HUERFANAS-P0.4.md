# Decisión P0.4 sobre secciones huérfanas y controles sin enforcement

**Fecha:** 2026-10-27 · **Decisión:** aplicada por la orden maestra de ejecución
continua, siguiendo las recomendaciones por defecto de la Fase 0 (§10, P-02 y
P-03). No se elimina código de negocio: se retiran imports muertos y se etiqueta
lo que no tiene efecto real.

| Superficie | Estado ANTES | Decisión P0.4 | Consecuencia |
|---|---|---|---|
| `SolicitudesSection.tsx` | Importada pero nunca montada | **MONTADA** en `activeSection === 'solicitudes'` (P0.2.5) y cableada al modal de detalle (P0.2.6) | Las altas públicas ya tienen bandeja de revisión |
| `AdministracionSection.tsx` | Importada en `App.tsx` pero nunca renderizada; `AdminControlCenter` es la vista real | **RETIRAR el import muerto** y conservar el fichero como legado. Es un duplicado de la administración; migrar paneles específicos, si procede, en P1 | Cero imports muertos; se evita mantener dos verdades |
| `CuestionarioSection.tsx` | Importada en `App.tsx` pero nunca renderizada; el cuestionario público vive en su contenedor de servidor | **RETIRAR el import muerto**; el fichero queda como legado hasta decidir su reutilización | Sin superficie fantasma |
| `ProfesionalesSection.tsx` | Ni importada; ~54 KB sin referencias | **NO MONTAR en P0** (P-02): el portal profesional ya se sirve con `Mi Portal Profesional` (`administracion`), `inmuebles` y `avisos`. Migrar presupuestos/facturas/valoraciones se evalúa en P1.6 con el portal profesional | Evita duplicar navegación y permisos; decisión documentada, no silenciada |
| 5 módulos sin referencias (`auditoriaHistoricaRoadmap01`, `conciliacionSession`, `migracionTitularidades`, `facturacionReporte`, `publicacionCicloPatrimonial`) | Sin uso | **Conservar** (no son secciones de UI; son servicios/listados de auditoría) y registrar en el informe consolidado. Eliminarlos exige auditoría de dependencias transitivas previa | Sin eliminaciones destructivas |
| Toggles de `modulosConfig` | Botones que prometían «habilitar/deshabilitar funciones» sin enforcement real | **P-03: desactivar los controles y etiquetarlos como INFORMATIVOS** | Ningún control da falsa sensación de autorización |
| Catálogo `PERMISOS_SISTEMA` | Presentado como «Permisos Granulares Activos» | **Renombrado a «declarativo / informativo»** con aviso de que la autorización real la definen el perfil veraz y `firestore.rules` | Honestidad sobre el alcance real |

## Paridad menú ↔ guarda (H-13)

`seccionesDePerfil('PROFESIONAL')` ofrece 5 destinos (7 con
`GESTOR_PATRIMONIAL`). La guarda `SECCIONES_PROFESIONAL` de `App.tsx` permite 6
(8 con gestor): la diferencia es **solo `inversion`**, una capacidad
existente que el menú decide no ofrecer. Es una asimetría deliberada y
documentada en `src/navegacion/navegacion.test.ts` («fail-closed: capabilities
permitidas pero no ofrecidas»). La invariante que importa —**todo lo que el
menú muestra está dentro de la guarda**— se verifica en
`tests/paridad-nav-guarda.test.ts`. No se ha ampliado ningún permiso.
