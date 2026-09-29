# BLOQUE 11 — AUDITORÍA INTEGRAL FINAL · FASE 1 (INSPECCIÓN)

**Documento obligatorio previo a cualquier modificación de código.**
Árbol auditado: rama `arena/01a0e939-gestor-de-inmuebles-vercel`, **HEAD `a52698011c2596676504567e3f288d339c1c4a13`** («feat(ux): finalize block 10 consistency and cleanup»), padre `e0c3cfa57441f787130a66d86c79d5ba78a34d5c`, `main` = `c0c82245d1adccf752903765ea554cb3544f1072`.
Custodia previa verificada: 711/711 ficheros con `hash-object` idéntico tras recuperar las refs; sha256 del árbol `2e9ab4a338980fc4bc8a67ba13e3fd9380290dd41242cf3cd7ab9c17c03eb5d7` antes = después. Todas las conclusiones de este documento proceden del **árbol definitivo** y de pruebas re-ejecutadas en él, no de históricos.

---

## 1. Alcance y método

- No se añade funcionalidad. Se audita lo existente: arquitectura, aislamiento, reglas, motores, persistencia, duplicidad, errores, código muerto, integración de bloques y UX.
- Toda evidencia es **reproducible por comando** (`grep`, `node --test`, `vitest`, `tsc`, `vite build`) sobre el árbol definitivo; los números que aparecen aquí se han recalculado en este árbol.
- Este documento es la **Fase 1**: inventario de arquitectura y superficie completa de persistencia. Los hallazgos se dictaminan en `docs/BLOQUE-11-AUDITORIA-INTEGRAL-CIERRE.md`.

## 2. Arquitectura (capas y fronteras)

```
UI (src/components/**, src/App.tsx)
  → servicios/adaptadores (src/lib/*Firestore.ts, src/lib/firebase*.ts, src/features/patrimonial/persistence, src/features/operaciones/persistence)
    → motores de dominio puros (src/utils/*Engine.ts, src/utils/actas/*, src/utils/morosidad/*, src/features/*/engine)
      → Firestore / Storage (firestore.rules, storage.rules)
```

| Capa | Ruta | Ficheros (aprox.) | Naturaleza |
|---|---|---|---|
|UI de secciones|`src/components/sections/*.tsx`|~45|React, sin acceso directo a `firebase/firestore`… (ver §5 excepciones)|
|UI de modales/paneles|`src/components/modals/*`, `src/components/inmueble/*`, `src/components/reformas/*`|~60|invocan servicios, no escriben directo salvo `panel.tsx` del módulo operaciones (usa adaptador)|
|Servicios de persistencia|`src/lib/firebase.ts` (3.7k l.), `firebaseActas.ts`, `firebaseInversion.ts`, `morosidadFirestore.ts`, `sindicacionFirestore.ts`, `suministrosFirestore.ts`, `tesoreriaFirestore.ts`|7|única frontera habitual de lectura/escritura|
|Módulos de dominio aislados|`src/features/patrimonial/**` (29 ficheros: motor + persistencia + UI propia)|29|motor puro con su propia caché y adaptador; **no** lo tocan otros bloques|
|Módulo operaciones|`src/features/operaciones/**` (port B→C)|~20|idem, entrada desde `CentroOperativoInmueblePanel`|
|Motores puros|`src/utils/*Engine.ts`, `src/utils/actas/*`, `src/utils/morosidad/*`, `src/lib/*Engine.ts`|~60|sin I/O; deterministas; validados por tests|
|Navegación/UX|`src/navegacion/`, `src/accesibilidad/`, `src/feedback/`, `src/formularios/`, `src/estadoDatos/`|~15|catálogo de 28 secciones en 6 grupos, diálogos accesibles, feedback unificado|
|Reglas|`firestore.rules` (3.524 l., ~80 `match`), `storage.rules` (657 l., 19 `match` + deny final)|2|autoridad real de acceso|

Datos de contexto: `src` ≈ 512 ficheros, ≈166 k LOC sin contar ficheros de test. Ejecutable: `server.ts` (Express/Vite) + `index.html`.

## 3. Inventario de persistencia (Firestore)

### 3.1 Colecciones y subcolecciones

- **68 colecciones** distintas usadas desde el cliente. **Todas** tienen bloque `match` en `firestore.rules` (0 colecciones sin regla).
- Subcolecciones declaradas en reglas y usadas: `operaciones/{propietarioId}/entidades`, `usuarios_auth/{uid}/progreso_tutoriales`.
- Colecciones de sólo-master/staff (sin campo de aislamiento propio porque el control es de rol): `system`, `personas`, `audit_logs`, `usuarios` (canónico de perfiles), `usuarios_auth`, `propietarios`, `inmobiliarias_directorio`.
- El resto se protege con el **campo/derivación de aislamiento** correspondiente (ver §3.4).

### 3.2 Operaciones de escritura (recuento sobre el árbol definitivo)

| Primitiva | Nº de usos en `src` (sin tests) |
|---|---|
|`setDoc`|86|
|`addDoc`|1 (sólo `src/test/e/firestoreMemoria.ts`, doble de test en memoria)|
|`updateDoc`|24|
|`deleteDoc`|41|
|`writeBatch`|7|
|`runTransaction`|24|

Lectura: `onSnapshot` **78** (en 11 ficheros), `getDoc` **49**, `getDocs` **37**.
Ficheros con listeners: `firebase.ts`, `firebaseActas.ts`, `firebaseInversion.ts`, `morosidadFirestore.ts`, `sindicacionFirestore.ts`, `suministrosFirestore.ts`, `tesoreriaFirestore.ts`, `usePortalInquilino`, `OperacionesInmueble`, `gestorFirebase`(mock/gestor), `test/e/firestoreMemoria`.

### 3.3 Patrón de escritura por colección sensible (muestra verificada)

- **Inmueble**: `setDoc` con id derivado del inmueble; `updateDoc` parcial; borrado con `deleteDoc` + auditoría.
- **Gastos / operaciones / facturas**: transacciones (`runTransaction`) o `writeBatch` cuando la operación cruza colecciones (operación ↔ gasto ↔ fiscalidad).
- **Actas / inventario**: escritura + historial (`inventario_historial`), sin `addDoc` ciego.
- **Tesorería / morosidad / sindicación**: `sinSecretosTesoreria` / `sinSecretosMorosidad` / `sinSecretosSindicacion` validados **en reglas**, no sólo en cliente.
- **Borrados**: siempre `deleteDoc` explícito con id conocido (nunca borrado en cascada automático desde el cliente).

### 3.4 Aislamiento declarado en reglas

- Campos explícitos en `resource.data` (20 colecciones): `propietarioId`, `inmuebleId`, `contratoId`, `carteraId`, `profesionalId`, `inquilinoId`, `usuarioId` según la entidad (p. ej. `suministros`→`inmuebleId`; `mensajes_portal`→`contratoId`; `garantias_reparacion`/`trabajos_profesionales`/`presupuestos_profesionales`→`profesionalId`).
- El resto se protege mediante **helpers canónicos** de `firestore.rules` (líneas 155-345): `activeUser()`→`perfilActualVeraz()` (revocación reflejada en cada petición), `myPropId`, `carterasLectura`/`carterasEscritura` (sólo master), `pidEnAmbitoLectura`/`pidEnAmbitoEscritura`, `ambitoPorInmueble*`/`ambitoPorContrato*` (derivación con `get` fail-closed), `gestion*Indexada`, `inmuebleParcial*`, `aisladoEsMio`/`aisladoCreateOk`/`aisladoUpdateOk`, `gastoEsMio`, `facturaEsMia`, `actaEsMia`, `contratoEsMio`, `carterasNoAutoasignadas*`.
- Familias de control detectadas por colección (agrupación real del texto de reglas): 5 colecciones «aisladas» con `aisladoEsMio/CreateOk/UpdateOk/Visible`; 5 con `isValidId` + `sinSecretos*`; 4 con `isStaff`; 4 sólo master/staff; 3 con `inmuebleEnCartera*` + `gasto*`; 2 con `ambitoPorInmueble*` + `tenantTieneContrato`…

### 3.5 Storage

- `storage.rules`: 19 bloques `match` + **deny total final** `/{allPaths=**}`.
- Rutas cubiertas: `inmuebles/`, `cobros_justificantes/`, `gastos_facturas/`, `documentos_solicitados/`, `recomercializacion_fotos/`, `incidencias_fotos/`, `incidencias/`, `reformas_documentos/`, `reformas_fotos/`, `actas_fotos/`, `actas_pdfs/`, `suministros/`, `contratos/`, `recibos/`, `morosidad_evidencias/` y los subárboles de documentos por inmueble.
- **Residual R-5 confirmado en Fase 1**: no existen bloques para `presupuestos/`, `trabajos/` ni `profesionales/{id}/documentos/`; los tres puntos de subida del cliente (`DetalleProfesionalModal:105`, `PresupuestoProfesionalModal:200`, `TrabajoProfesionalModal:171`) caen en el deny final y degradan a data-URL (no hay fuga: no se sube nada). Se dictamina en el cierre.

### 3.6 Cachés en cliente

- `localStorage` (54 usos en producción; 1 en `sessionStorage`): sesión (`rentselect_active_session`, `rentselect_current_user_id`) y **caché de dominio** de 9 claves (`propietarios`, `candidatos`, `inmuebles`, `solicitudes`, `invitaciones`, `slots`, `solicitudes_doc`, `contratos`, `solicitudes_seguro`), escrita desde los listeners de `App.tsx`.
- El cierre de sesión (`authService.ts:1259-1269`) **elimina las 11 claves**, incluidas todas las de dominio. La caché no es autoridad: la lectura autoritativa es Firestore + reglas.

## 4. Superficie de test re-ejecutada (base para §13 de la orden)

- **Vitest**: 148 ficheros / **2.756 pass · 0 skip · 0 fail** (al inicio de la auditoría: 2.754 pass · 2 skip; las 2 omitidas dependían de historial git ausente).
- **Suites `node --test` (.mjs)**, excluidas de vitest por `vite.config.ts`: 21 ficheros `.test.mjs` → operaciones y patrimonial. **Ningún script `npm` las ejecuta** (se lanzan a mano con `node --import tsx --test`).
- **Scripts `tsx`**: `test:bloque-b` (92), `test:bloque-c`, `test:bloque-e`, `test:bloque-5` (186 comprobaciones + 182 vitest), `test:bloque-7` (435 + 428).
- **Reglas evaluadas sin emulador**: `tests/harness/firestoreRulesEval.ts` evalúa el **texto real** de `firestore.rules` (lanza si no cubre una construcción) y lo consumen 13 ficheros `tests/seguridad-*.test.ts` + `tests/fase14-espejo-identidad.test.ts`.

## 5. Hipótesis a dictaminar (entrada de las fases 2-10)

| ID | Hipótesis | Estado en Fase 1 |
|---|---|---|
|H-1|Suscripciones sin ámbito (`subscribe*()` sin `scope`) en secciones abiertas a PROPIETARIO|en dictamen (F3)|
|H-2|`subscribeCol` de `suministrosFirestore.ts:98-111` sin `where`|en dictamen (F3)|
|H-3|R-5 storage (3 subidas degradadas a data-URL)|confirmado (F3)|
|H-4|Referencias de custodia de los tests de integración desactualizadas / base histórica ausente (repo shallow)|observado, requiere reproducción (F11)|
|H-5|Código con 0 consumidores (**147** de 2.152 símbolos exportados no se usan ni en producción ni en tests; otros 129 sólo se usan desde tests)|observado, requiere las 5 condiciones (F9)|
|H-6|`catch {}` vacíos (37 sitios) y `catch` sólo-consola (56 en 22 ficheros)|observado (F8)|

Ninguna hipótesis se da por buena sin evidencia en el cierre.
