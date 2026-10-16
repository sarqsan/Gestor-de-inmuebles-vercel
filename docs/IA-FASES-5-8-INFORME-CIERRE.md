# IA · FASES 5–8 — INFORME DE CIERRE DE ORDEN (entrega en rama de sesión)

> **Conforme al CONTRATO DE INTEGRACIÓN ENTRE ARENAS §4.7** (informe de cierre de
> cualquier Arena): base SHA → HEAD SHA, qué toca, qué NO toca, pruebas,
> limitaciones reales, dependencias externas y política de resolución.
>
> **Estado: ENTREGADO EN RAMA — NO integrado.** La integración en la rama
> canónica corresponde a Arena A (§3.4) y no se ha ejecutado.

| Campo | Valor |
| --- | --- |
| Rama de sesión | `arena/658e62cd-gestor-de-inmuebles-vercel` |
| **Base** | `6280e017bc18c1540fc52c76acd72a78a31f1309` (= `origin/main`, merge del PR #37) |
| **HEAD final** | `b55d01cc9969492345226298b6ce3962af49b0c8` (verificado con `git ls-remote`) |
| Commits | `c71c792` (Fase 5) · `d6a6430` (doc Fase 5) · `0a48357` (Fase 6) · `2de454b` (Fase 7) · `b55d01c` (Fase 8) |
| Alcance | Fases IA 5, 6, 7 y 8 del MAPA MAESTRO (§16.3 `INCIDENCIA_IA_END_TO_END`) |
| Mergeabilidad | **Sin conflictos** con `origin/main`: `git merge-tree --write-tree origin/main HEAD` → árbol `7e670bf443579bb82f88d2de4805f126dedeb157`, exit 0 |

## 1. Qué entrega

| Fase | Contenido | Documento |
| --- | --- | --- |
| **5** | Operación `ASISTENTE_INCIDENCIAS_INQUILINO` en el catálogo central (12.ª): diagnóstico guiado, contrato/inmueble/propietario/incidencia solo desde fuentes autorizadas, tres planos separados, derivación explícita del inquilino, traza mínima | `docs/IA-FASE-5-ASISTENTE-INCIDENCIAS-INQUILINO.md` |
| **6** | Seguimiento y trazabilidad del ciclo de la incidencia: motor puro de eventos por cambio real, hilo append-only con CAS, avisos por el dispatcher GAP 1 con estado **real** de entrega, repositorio duradero de notificaciones, escalado determinista, aislamiento por rol, evolución en el portal | `docs/IA-FASE-6-SEGUIMIENTO-INCIDENCIAS.md` |
| **7** | Gobierno de IA: sin comodines `'*'`, sin tarifas implícitas, sin cuotas ilimitadas; política TODO O NADA verificable, política por defecto que DENIEGA todo, plantilla aprobada y verificador local | `docs/IA-FASE-7-GOBIERNO-IA-PERMISOS-COSTES.md` |
| **8** | Validación en entorno no productivo SIN coste real: guardia de entorno, límites de gasto en peor caso, proveedor simulado, bloqueo explícito del proveedor real, sandbox de las 12 operaciones con cuenta de prueba | `docs/IA-FASE-8-VALIDACION-ENTORNO-NO-PRODUCTIVO.md` |

## 2. Alcance del diff (`origin/main...HEAD`)

`50 ficheros · +8.210 / −187` — 26 nuevos, 24 modificados.

- **Nuevos (26)**: `src/ia/asistenteIncidenciasIA.ts`, `src/seguimiento/incidencias.ts`, `src/lib/{clienteAsistenteIncidencias,seguimientoIncidencias}.ts`, `server/ia/{asistenteIncidenciasInquilino,validacionEntornoIA}.ts`, `server/seguimiento/{seguimientoIncidencias,notificadorIncidencias,rutasSeguimientoIncidencias}.ts`, `server/notificaciones/repositorioNotificacionesFirestore.ts`, `src/components/portal-inquilino/{AsistenteIncidenciaAsistida,EvolucionIncidenciaPortal}.tsx`, 4 tests de fase + 2 UI, 4 documentos de fase, `docs/politica-ia.ejemplo.json` y 2 scripts (`verificar-politica-ia`, `validar-ia-entorno-no-productivo`).
- **Modificados (24)**: `server.ts` (12 rutas IA + montaje del seguimiento), `src/ia/{catalogoOperacionesIA,gobiernoIAContrato}.ts` (operación nueva; contrato de política de Fase 7), `server/ia/{nucleoIA,configuracionIA}.ts` (comentarios/normalización, sin cambio de flujo), `src/notificaciones/plantillas.ts` (+4 plantillas de incidencia), `PortalIncidencias.tsx`, `IncidenciasSection.tsx`, panel de gobierno + su test, `.env.example`, `package.json` (**solo dos scripts npm nuevos; sin dependencias nuevas**), y las suites de pruebas de Fases 1/2 ajustadas al contrato estricto.

### Qué NO toca (importante para la integración)

- **`firestore.rules` / `firebase.json` / `.firebaserc`: sin cambios.** No hay nada que publicar: las colecciones nuevas (`incidencias_seguimiento`, `notificaciones`, `notificaciones_entregas`, `ia_incidencias_trazas`) son de **acceso exclusivamente por servidor** con credencial de servicio, y el catch-all `match /{document=**} { allow read, write: if false }` (`firestore.rules:3863`) las cubre.
- **Sin dependencias nuevas** ni cambios de build (`vercel.json` intacto).
- **Sin migraciones ni backfill** de datos.
- **Sin secretos**: ningún cambio introduce claves; `.env.example` solo documenta `IA_POLITICA_JSON` con la plantilla pública.
- **Sin activación de IA**: no se ha usado ninguna credencial ni servicio de coste real.

## 3. Pruebas (ejecutadas por esta Arena, sobre este HEAD)

| Suite | Resultado |
| --- | --- |
| `tests/ia-fase5-asistente-incidencias.test.ts` | 22/22 |
| `src/components/portal-inquilino/asistente-incidencias.ui.test.tsx` | 5/5 |
| `tests/ia-fase1-integracion-server.test.ts` (matriz 12 endpoints, app real ESM) | 35/35 |
| `tests/seguimiento-incidencias.test.ts` | 23/23 |
| `tests/seguimiento-incidencias-e2e.test.ts` (HTTP real, JWT RS256, Firestore REST simulado) | 8/8 |
| `src/components/portal-inquilino/evolucion-incidencia.ui.test.tsx` | 4/4 |
| `tests/ia-fase7-gobierno-permisos-costes.test.ts` | 18/18 |
| `tests/ia-fase8-validacion-entorno.test.ts` | 17/17 |
| Suites IA de Fases 1/2 + panel (9 ficheros) | 152/152 → tras Fase 7: **328/328** en 22 ficheros |
| **Suite completa** | **228 ficheros · 4.185 passed · 7 todo · 0 fallos** |
| `npx tsc --noEmit -p .` | 0 errores |
| CLI Fase 8 sin política / con `VERCEL=1` / con la plantilla | exit 1 / exit 1 / exit 0 (sandbox 12·5·4·2 operaciones permitidas por perfil) |

**Pendiente de la integración (§3.2 del contrato):** revisión del diff por Arena A y **re-verificación de la suite completa sobre la rama canónica tras el merge**, que esta Arena no puede ejecutar (no trabaja sobre la canónica).

## 4. Limitaciones reales (declaradas, no ocultas)

1. **Cableado fino de los modales profesionales** al seguimiento: el alta del portal del inquilino y `IncidenciasSection` sincronizan; los modales de trabajo profesional reutilizan la misma función pero su cableado definitivo va con el rediseño de esa área.
2. **Reintentos programados (cron)** de avisos pendientes: hoy se reintentan en la siguiente sincronización, con el tope de intentos del dispatcher.
3. **Anexos firmados de contrato** no modelados en Firestore: la interpretación contractual se limita a la lista blanca del portal.
4. **Fase 8 no activada**: el sandbox valida configuración, no sustituye al presupuesto/cuotas de API de Google Cloud.

## 5. Dependencias externas y autorizaciones pendientes

1. **Autorización expresa** del responsable para cualquier consumo real de IA.
2. **Entorno no productivo dedicado** (proyecto y base de datos de pruebas): la configuración del repositorio apunta al proyecto de la aplicación.
3. **Credencial de servicio y clave del proveedor** de ese entorno + `IA_POLITICA_JSON` con la política completa.
4. **Presupuesto y cuotas de API** identificados y verificados en Google Cloud.
5. **Revisión escrita** del consumo y los logs del ensayo con cuenta de prueba.

Mientras falten, el servidor mantiene la IA bloqueada: `503 APROBACION_COMERCIAL_PENDIENTE` con la política por defecto y `503 POLITICA_IA_INVALIDA` con una política mal formada, sin crear el cliente del proveedor.

## 6. Política de resolución de conflictos

No hubo conflictos: la rama se ancló a `6280e017` y `origin/main` no se ha movido (`git rev-list --count HEAD..origin/main` = 0). El merge es limpio según `git merge-tree`. Si Arena A decide **integración selectiva** en lugar de merge, los commits son autónomos por fase (`c71c792`, `0a48357`, `2de454b`, `b55d01c`) y las fases 7 y 8 no dependen de la 6, pero la 6 sí presupone la 5.

## 7. Obligaciones de la integración (§4.8)

Al integrar, el commit de integración debe actualizar `docs/MAPA-MAESTRO-ERP-ACTUAL.md` y `docs/ESTADO-GIT-ERP.md` con el estado de las Fases IA 5–8 (hoy: cerradas en rama, pendientes de integración), y re-verificar la suite completa sobre la canónica.
