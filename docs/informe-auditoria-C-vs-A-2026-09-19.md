# INFORME — AUDITORÍA COMPARATIVA C → A (2026-09-19)

Arena: C · Modo: INCÓGNITO · Cuenta: harqiba@gmail.com
Repo: `sarqsan/Gestor-de-inmuebles-vercel` · Rama: `arena/01a0ab97-gestor-de-inmuebles-vercel`

> Alcance: solo lectura. No se ha modificado código, ni A, ni B, ni D, ni `main`,
> ni el circuito de habitaciones cerrado.

---

## 0. VERIFICACIÓN DEL PUNTO DE PARTIDA

| Comprobación | Resultado |
|---|---|
| Circuito comercial habitaciones cerrado y validado | ✅ 72/72 tests (28 circuito + 20 aislamiento + 24 economía) re-ejecutados en esta sesión, todos en verde |
| Rama remota | ✅ `f05ff1ea38a1d63ef9dab266e8e55a295c207f37` (coincide con lo declarado) |
| HEAD local | ⚠️ `9cb01a43` (base), **no** `f05ff1e` |

**Nota de estado:** este sandbox está clonado en el commit base `9cb01a43` con el
contenido del circuito aplicado en el working tree (parte commiteada idéntica a
`f05ff1e` — verificado con `git diff f05ff1e` sobre `firebase.ts`, `types.ts`,
`contratoEngine.ts`, `cobrosEngine.ts`: sin diferencias; `habitacionesEngine.ts` y
los 3 ficheros de tests existen físicamente como untracked). A efectos funcionales,
el working tree auditado == `f05ff1e`. No se ha tocado nada de ese circuito.

**Hallazgo estructural clave:** C y A comparten exactamente el mismo commit base
(`9cb01a4 feat: add maintenance and professional management`). Los únicos commits
que C ha añadido sobre ese base son:

```
f05ff1e  cerrar circuito comercial de alquiler por habitaciones
f872447  integrar alquiler por habitaciones en cobros y rentabilidad
8378a73  cerrar alquiler por habitaciones y aislamiento de unidades
d060100  add room rental mode to properties
```

→ **Todo lo que no sea ecosistema-habitaciones ya existe en A por linaje.**
La auditoría, por tanto, se reduce a distinguir qué aportó C fuera del circuito
cerrado y qué es base común.

---

## 1. HUECOS PRIORITARIOS IDENTIFICADOS EN A

### A. Notificaciones

No existe en C ningún pipeline real de notificaciones:

- ❌ Sin Firebase Cloud Messaging / Push.
- ❌ Sin Resend / SendGrid / Mailgun / SMTP / Postmark.
- ❌ Sin Firebase Cloud Functions, colas, eventos ni tareas programadas
  (no hay directorio `functions/`; cero `onSchedule`/cron).
- ⚠️ `notificacionesEmail` en Configuración: simple checkbox de preferencia,
  **sin backend que lo consuma**. Texto UI (“recibir alertas cuando un candidato
  envíe documentación”) que no está implementado.
- ⚠️ “Avisos” en portales propietario/profesional: solo copy de roadmap
  (“Próximamente”), sin lógica.
- ⚠️ WhatsApp: `generarMensajeWhatsappSolicitud` + `ConfirmWhatsappSentModal` =
  copiar/pegar manual, sin API.

**Lo único transaccional de extremo a extremo** es el flujo **Gmail API para
aseguradoras de impago**: `googleAuth.ts` (OAuth scopes gmail.send/readonly) →
`gmailClient.ts` (MIME RFC 2822 con adjuntos, send, search, detalle) →
`DetalleSolicitudSeguroModal` (envío del expediente, sondeo de bandeja,
auto-procesado de la respuesta con Gemini) → config persistida en
`system/gmail_config` con listener en tiempo real. **Está en el commit base,
luego A ya lo tiene.** No es recuperable de C: A no lo necesita de C.

### B. Informes avanzados de rentabilidad

- `generarResumenFiscalInmueble` (resumen fiscal anual por inmueble) y los
  helpers de rentabilidad (`rentabilidadInmuebleDesdeCircuito`,
  `historialEconomicoHabitacion`, `ingresosInmuebleDesdeCircuito`) → forman
  parte de `f872447`/`f05ff1e` = **circuito cerrado, no re-auditar**.
- ❌ Sin PDF (no hay jsPDF ni librería alguna; solo `window.print()` para
  contrato LAU y cuestionario).
- ❌ Sin gráficos (ninguna librería de charts; las “métricas” son tarjetas HTML).
- ❌ Sin informes para inversores, ROI de cartera, evolución temporal ni export CSV.
- `InformeInteligente` (`reportGenerator.ts` + `SmartReportModal`) = informe de
  **solvencia de candidato**, no de rentabilidad; base común.

→ **C no aporta nada fuera del circuito cerrado en este hueco.**

### C. Contratos adicionales

- Generador LAU (`generarTextoContratoLAU`), acta de entrega con lecturas de
  suministros, impresión PDF, cláusulas predeterminadas + redacción con IA
  (`/api/redactar-clausula`) → base común.
- Modalidades: solo `completo` | `habitaciones` (esta última = circuito cerrado).
- ❌ Sin temporada, uso distinto de vivienda, turístico, anexos, prórrogas ni
  renovaciones automáticas.

→ **Nada nuevo fuera del circuito.**

---

## 2. REVISIÓN DE FUNCIONALIDADES ADICIONALES DE C

Todas las siguientes existen en el **commit base compartido**, por lo que A las
posee por linaje (salvo que A las hubiera eliminado deliberadamente, cosa que no
consta en ninguna auditoría previa):

| Área | Estado en C | Origen |
|---|---|---|
| Cobros / impagos (recibos, efectivo con recibo, incidencias de periodo) | Operativo | base |
| Fiscalidad (`generarResumenFiscalInmueble`) | Operativo (UI “Estructura Base”) | base+circuito |
| Seguros impago (aseguradoras configurables, solicitudes, dictamen IA) | Operativo E2E | base |
| Pólizas y siniestros (`polizas_seguros`, `siniestros`) | Operativo | base |
| Profesionales (catálogo, especialidades, métricas, enlaces de registro) | Operativo | base |
| Trabajos / presupuestos / valoraciones profesionales | Operativo | base |
| Incidencias (categorías, prioridades, responsabilidades, histórico, métricas, dictamen pericial IA) | Operativo | base |
| Portal propietario (viviendas, contratos, profesionales privados, perfil) | Operativo; tabs “Gastos” = Próximamente | base |
| Portal profesional (perfil, especialidades, zonas) | Operativo; “Partes de trabajo” = Próximamente | base |
| Preselección / candidatos / comparador / solvencia | Operativo | base |
| Agenda de visitas (slots, invitaciones, portales públicos con token) | Operativo | base |
| Documentación (solicitudes, presets, subida, análisis Gemini OCR) | Operativo | base |
| Cuestionario público (PDF generado + parseo + análisis IA) | Operativo | base |
| Admin (usuarios, roles, enlaces, especialidades, auditoría, toggle de módulos) | Operativo | base |
| Auditoría (`audit_logs`, append) | Operativo | base |
| Publicaciones/galería pública (`PublicPropertyGallery`) | Solo galería embebida en portal de visita; no hay estado “publicado” ni portal de anuncios | base |
| Reformas / valoración / recomercialización | ❌ No existen como módulos | — |
| Gastos / hipotecas / patrimonio | ❌ Solo flags en `ModulosConfig` (`gastos:false, hipotecas:false, patrimonio:false`), sin código detrás | base (fantasma) |

---

## 3–4. CAPACIDADES OCULTAS (utils / engines / server)

- `server.ts` (Express + Gemini, commit base): 6 endpoints IA
  (`analizar-documento`, `generar-correo-aseguradora`,
  `analizar-respuesta-aseguradora`, `analizar-cuestionario`,
  `redactar-clausula`, `analizar-incidencia-ia`) + `/api/upload-document`.
  🔴 **`documentsStore` es un `Map` en memoria**: los documentos subidos se
  pierden con cada reinicio. Arquitectura frágil que A no debería heredar tal cual.
- `firebase.ts`: sanitizadores anti-`undefined`, seed inicial, 89 funciones
  exportadas (base).
- Compresores cliente (`imageCompressor`, `fileCompressor`), utilidades de
  imagen (base).

---

## 5. FUNCIONALIDADES NUEVAS DESCUBIERTAS (fuera del circuito cerrado)

Solo hay **una** aportación de C que no estaba en el base y no pertenece al
circuito comercial cerrado:

### 🟡 INVENTARIO DE INMUEBLE + FICHA TÉCNICA

- **Descripción:** inventario por inmueble (mobiliario, electrodomésticos,
  suministros…) con categorías/estados tipados, baja lógica, historial
  append-only y panel “Ficha Técnica” con adjuntos.
- **Dónde está en C:** `src/utils/inventarioEngine.ts` (118 líneas),
  `src/components/FichaTecnicaInventarioPanel.tsx` (672 líneas),
  colecciones `inventario_inmuebles` + `inventario_historial` (Firestore),
  reglas Firestore §22, reglas Storage por ruta, test
  `inventarioIsolation.test.ts`. Introducido en el commit `8378a73`.
- **Cómo funciona:** consultas acotadas por `inmuebleId` (nunca
  `getAll().filter()` como seguridad); control de acceso cliente en
  `canAccessInventarioInmueble` / `canMutateInventario` (delegan en
  `canAccessInmueble`: admin/propietario mutan; profesional solo lectura);
  historial inmutable (update/delete denegados por reglas).
- **Qué falta en A:** no consta inventario en A. Es patrimonio/estado físico del
  inmueble, complementario (no duplicado) a la economía patrimonial que A ya
  tiene (ValorPatrimonio/Comercializacion).
- **Dependencias:** `Inmueble`, RBAC existente, Storage para adjuntos. Ninguna
  dependencia del circuito de habitaciones.
- **Seguridad:** reglas Firestore correctas para inmutabilidad del histórico,
  pero **permisos de lectura/escritura basados solo en `signedIn()`** (sin
  verificación de propiedad del inmueble en la regla).
- **Madurez:** media-alta (UI completa, persistencia, aislamiento testeado).
- **Recomendación:** reimplementar sobre arquitectura A con reglas reforzadas
  (verificar `inmuebleId` contra el documento `inmuebles` o el perfil del
  usuario). No copiar tal cual.

**No hay ninguna otra funcionalidad nueva fuera del roadmap.** Los toggles
`gastos/hipotecas/patrimonio` de `ModulosConfig` son fantasma (sin código) y A
ya tiene la economía patrimonial real → nada que recuperar.

---

## 6. SEGURIDAD DE LA CANDIDATA

- Firebase Auth + RBAC por perfiles: ✅ (reutiliza `authService`).
- Aislamiento por inmueble/propietario: ✅ en lógica de cliente; ⚠️ en reglas
  Firestore/Storage (solo `signedIn()`), reforzar al reimplementar en A.
- Histórico append-only: ✅ por reglas.
- Sin secretos, sin APIs externas, sin dependencia de arquitectura obsoleta.
- Veredicto: 🟡 útil → **reimplementar sobre arquitectura A**, no trasladar.

---

## 7. TESTS (suites existentes de C, sin modificar)

| Métrica | Valor |
|---|---|
| Ficheros de test | 4 |
| Suites vitest pasadas | 3 (`habitacionesCircuitoComercial` 28, `habitacionesIsolation` 20, `habitacionesEconomia` 24) |
| Tests pasando | **72/72** |
| Tests fallando | 0 |
| Suites fallidas | 1 fichero: `inventarioIsolation.test.ts` → “No test suite found” |
| Errores | El anterior: es un script de auto-verificación por consola (imprime `inventarioIsolation tests OK` al importarse) sin `describe/it`. **Preexistente desde `8378a73`, no es una regresión** y no se ha tocado |
| `tsc --noEmit` | 1 error: `TrabajoProfesionalModal.tsx(150,9) TS2353 'tamano'` — **preexistente conocido, sin cambios** |
| Build (vite) | ✅ OK (warning de chunk >500 kB, conocido) |

---

## 8. TABLA COMPARATIVA FINAL C → A

| Funcionalidad | C | A | Diferencia real | Acción |
|---|---|---|---|---|
| Circuito comercial habitaciones (candidato→cobro) | 🟢 cerrado | 🟢 cerrado (auditoría previa) | Ninguna | Nada / no tocar |
| Inventario inmueble + ficha técnica | 🟢 | 🔴 | C aporta capacidad inexistente | 🟡 Reimplementar en A (con reglas reforzadas) |
| Notificaciones (email/push/colas) | 🔴 (no existe; solo un checkbox sin backend) | 🔴 | Ninguna en C | Nada que recuperar de C; si A lo necesita, construir de cero |
| Flujo Gmail API aseguradoras | 🟢 | 🟢 (base común) | Ninguna | Nada |
| Informes rentabilidad/fiscales | 🟡 (resumen fiscal anual, dentro del circuito cerrado) | 🟢 (circuito cerrado + economía patrimonial propia) | A es superior | Nada |
| Contratos adicionales (temporada/turístico/prórrogas) | 🔴 | 🔴 | Ninguna | Nada |
| Seguros impago / pólizas / siniestros | 🟢 | 🟢 (base común) | Ninguna | Nada |
| Profesionales / trabajos / presupuestos / valoraciones | 🟢 | 🟢 (base común) | Ninguna | Nada |
| Incidencias + dictamen IA | 🟢 | 🟢 (base común) | Ninguna | Nada |
| Portales (propietario/profesional/públicos) | 🟢 | 🟢 (base común) | Ninguna | Nada |
| Economía patrimonial (ValorPatrimonio/Comercializacion) | 🔴 (solo toggle fantasma) | 🟢 | A es superior | Nada |
| `server.ts` docs en memoria (`documentsStore`) | 🔴 frágil | 🟢/🟡 según A | Código arriesgado | Descartar patrón |

---

## 9. CUATRO LISTAS FINALES

### 🟢 YA ESTÁ EN A — no tocar
Circuito comercial de habitaciones completo (candidato → visita → reserva →
selección → contrato → cobros → histórico), aislamiento, transacciones,
concurrencia, contratos sucesivos e histórico; y todo el listado de base común
(seguros, siniestros, profesionales, incidencias, portales, agenda,
documentación, cuestionario, admin/auditoría, flujo Gmail aseguradoras).

### 🟢 A YA ES SUPERIOR — no recuperar código de C
- Economía patrimonial real (ValorPatrimonio, Comercializacion) — en C solo hay
  toggles sin implementar.
- Informes de rentabilidad de cartera/inversor: C no los tiene en absoluto.

### 🟡 C TIENE FUNCIONALIDADES ÚTILES QUE FALTAN EN A
1. **Inventario de inmueble + Ficha Técnica**
   - Qué hace: inventario físico por inmueble con categorías/estados, baja
     lógica, historial append-only y adjuntos.
   - Dónde en C: `src/utils/inventarioEngine.ts`,
     `src/components/FichaTecnicaInventarioPanel.tsx`, colecciones
     `inventario_inmuebles` / `inventario_historial`, reglas Firestore §22.
   - Cómo funciona: queries acotadas por `inmuebleId`, RBAC reutilizado,
     historial inmutable.
   - Qué falta en A: el módulo completo.
   - Dependencias: solo `Inmueble` + RBAC + Storage adjuntos.
   - Dificultad: baja-media (~800 líneas equivalentes).
   - Riesgos: reglas actuales basadas en `signedIn()` → reforzar propiedad del
     inmueble al reimplementar; no mezclar IDs con el circuito de habitaciones.
   - Propuesta: orden de desarrollo para A — “Inventario de inmueble sobre
     arquitectura A”, replicando el modelo de datos y reescribiendo reglas con
     verificación de propiedad.

Lista ordenada por dependencia técnica: **solo contiene este elemento.**

### 🔴 CÓDIGO QUE NO DEBE RECUPERARSE
- `documentsStore` en memoria de `server.ts` (pérdida de datos en reinicio).
- Toggles fantasma `gastos/hipotecas/patrimonio` de `ModulosConfig`.
- Cualquier texto UI de “avisos/notificaciones” sin backend (copy, no código).
- El script `inventarioIsolation.test.ts` tal cual (no es suite vitest; si se
  reimplementa el inventario en A, convertirlo a tests reales).

---

## RESPUESTA FINAL

> ¿Qué funcionalidades de C merece la pena reconstruir en A porque A realmente
> no las tiene?

**Una sola: el Inventario de Inmueble con Ficha Técnica.** Todo lo demás o ya
está en A (base común), o forma parte del circuito de habitaciones ya cerrado, o
A es superior. Si se considera que el inventario ya fue trasladado a A en una
fase previa no registrada aquí, entonces la respuesta sería: **ninguna**.

**Siguiente cuello de botella técnico recomendado:**
convertir la seguridad “`signedIn()` + filtro en cliente” del inventario/habitaciones
en verificación de propiedad real dentro de las reglas de Firestore (helper de
reglas reutilizable que compruebe `inmuebleId` contra el perfil del usuario),
para que la futura orden de desarrollo del inventario en A nazca ya con reglas
fuertes y no haya que endurecerlas a posteriori.
