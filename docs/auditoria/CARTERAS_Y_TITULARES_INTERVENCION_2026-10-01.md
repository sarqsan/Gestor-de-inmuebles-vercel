# Intervención única — Carteras («falso No tienes permisos») + Propietarios/Titulares accesible

Base: `origin/main` = `f0e3803` (merge del PR #18). Una sola rama de Arena y un único PR para los dos
problemas. **`firestore.rules`: 0 líneas modificadas y nada desplegado.**

> Convención de este documento: «**demostrado**» = comprobado con el texto real de `firestore.rules`
> (evaluador del repo, documento a documento) o con el render real de la interfaz; «**no verificable aquí**» =
> exige el motor de Google o el proyecto real (no hay Java, ni emulador, ni acceso a `storage.googleapis.com`
> /`maven` desde este entorno: se volvió a comprobar en esta sesión).

---

## 1. CARTERAS — «No se han podido leer tus carteras ni delegaciones»

### 1.1 Auditoría de extremo a extremo de la lectura de `gestiones_cartera`

| Eslabón | Qué hace de verdad | Dónde |
|---|---|---|
| Quién consulta | Solo `PROPIETARIO` y `PROFESIONAL` (un propietario puede ser además gestor, caso E de D1R). El ADMINISTRADOR no abre esta lectura. | `PERFILES_QUE_CONSULTAN_CARTERAS` |
| Qué identidad usa | El **id de PERFIL** `usuarios/{id}` (`currentUser.id`), **no** el UID de Firebase Auth. | `useGestionesCarteraGestor` |
| Consulta | `gestiones_cartera where gestorUsuarioId == <id de perfil>` (escucha viva). | `subscribeGestionesCarteraGestor` |
| Regla `list` | `esAdminInmuebles() \|\| gestionInvolucraAMi(resource.data)`; la rama del gestor es `activeUser() && 'gestorUsuarioId' in d && 'usuarioId' in me() && d.gestorUsuarioId == me().usuarioId`. | `firestore.rules` l.1184-1186 |
| Qué documentos lee la regla | Solo tres, de ruta fija: `usuarios/{uid}` (ámbito admin), `usuarios_auth/{uid}` (espejo) y `usuarios/{espejo.usuarioId}` (ficha). Como máximo 3 documentos distintos (el límite documentado es 10 por petición y el mismo documento repetido puede cachearse). | `perfilActualVeraz()` |
| Modelo | `gestiones_cartera/{titular~gestor}`: `propietarioId`, `gestorUsuarioId`, `inmuebleIds` (`[]` = cartera completa), `estado`, `permiso`, `resolucionInvitacion`. El índice `usuarios_auth/{uid}.gestionesPorPropietario` (`{ titular → idGestión }`) lo escribe solo el master y **es el que usan las Rules** para autorizar los inmuebles delegados. | `carterasGestion.ts`, rules `gestionActivaCompletaIndexada` / `inmuebleParcialIndexado` |
| Uso en la aplicación | Solo acota el ámbito: delegaciones parciales `ACTIVA` + aceptadas (`ambitosInmueblesParcialesActivosDe`) y su escritura. Las carteras completas salen de `carterasL/E` del espejo. | `App.tsx` |

**Demostrado.** Con un estado coherente (espejo y ficha veraces, id de consulta = `espejo.usuarioId`) la regla
`list` autoriza la consulta y la regla `get` autoriza cada relación; `get` y `list` comparten el predicado
(`gestionInvolucraAMi`) y `get` añade solo `leerGestionInvitada`. La consulta no abre nada: sin `where`, con el
id de otra persona o sin sesión se deniega. Además, **todo lo que la rama del gestor necesita del estado es lo
mismo que necesitan las lecturas del resto del Portal** (`perfilActualVeraz()`, `esAdminInmuebles()`,
`myPropId()`): si ese estado estuviera roto, fallaría todo el Portal, no solo Carteras. Que «el resto funcione»
descarta, por tanto, un perfil/espejo roto y deja a la **propia consulta de colección** (o a las reglas
publicadas en `allow list`) como único punto distinto.

**No verificable aquí.** (a) Si el motor de Google *demuestra* la consulta `where gestorUsuarioId ==` contra esa
regla (planificador de consultas), (b) qué reglas están realmente PUBLICADAS en
`gestor-inmuebles-produccion` / base `ai-studio-gestordeinmueble-c6444afd-…`. El repositorio no ha ejecutado
nunca sus reglas en el emulador (ROADMAP-02: «la prueba oficial de query-planning queda pendiente de
Emulator»); el informe de los PR anteriores no podía pasar de «reglas publicadas o planificador».

### 1.2 Causa y corrección

**Hallazgo estructural (incoherencia consulta ↔ modelo).** La consulta de colección era la **única** lectura de
Carteras que dependía de que el motor demostrase una consulta; el modelo ya contiene lo necesario para leer sin
consulta: el índice `gestionesPorPropietario` del espejo propio (el mismo con el que las Rules autorizan los
inmuebles) y reglas `get` evaluadas sobre el documento real. La consulta denegada con el estado cumplido
producía un aviso falso («No tienes permisos») aunque la persona estuviera autorizada.

**Corrección acotada** (`firebase.ts` → `subscribeGestionesCarteraGestor`; `diagnosticoCarteras.ts`;
`carterasGestion.ts`; `indiceEspejoCarteras.ts`; `onboardingCarterasFirebase.ts`):

| Tras la consulta denegada, el diagnóstico (solo lectura de los dos documentos propios + un reintento) decide… | Acción | Aviso |
|---|---|---|
| El reintento inmediato se autoriza (transitoria: p. ej. el espejo aún no existía) | Se **reabre la consulta** (una sola vez, nunca un bucle) | Ninguno |
| **Todos** los términos de la regla del gestor se cumplen y la consulta sigue denegada | Se lee **por relación**: escucha del espejo propio + un `get` por cada gestión que indexa | **Ninguno** si se autorizan (o si no hay relaciones); si algún `get` se deniega: aviso REAL con la causa |
| Cualquier causa observable (espejo ausente/no activo, ficha no enlazada/no activa, tipo distinto, **id de consulta distinto del que enlaza el espejo**, sin sesión…) | **No** se lee por relación | Aviso con la causa y qué hacer |

* El aviso REAL ahora dice *qué comprobación falló y qué puede hacer la persona* (código del veredicto incluido):
  «perfil y sesión no sincronizados → cierra sesión y vuelve a entrar», «las reglas publicadas en Firebase no
  coinciden con las de la aplicación → avisa al administrador», etc. (`ayudaUsuarioDeCausa`; textos fijos, sin datos
  personales).
* El panel «Mis carteras delegadas» (`cargarCarterasOnboarding`) leía con la misma consulta y recibe el mismo
  criterio: si la consulta se deniega con la identidad del espejo cumplida, lee por relación; si algún `get` se
  deniega, relanza la denegación original.
* Veredicto nuevo `SOLO_LA_CONSULTA_DE_COLECCION_DENEGADA` (consola `[diag:carteras] denegada`): el estado cumple la
  regla y **lo único denegado es la consulta (`list`)**. Es la prueba, en la propia sesión afectada, de que la causa
  es la consulta/reglas publicadas y no la identidad. Si ni el `get` por relación se autoriza, el veredicto sigue
  siendo `REGLAS_PUBLICADAS_O_PLANIFICADOR` y la explicación señala reglas publicadas (el `get` no usa planificador).

**Conservado.** Reintento (`reintentarCapacidad('gestiones_cartera')`, contador propio, aviso único por origen),
alcance `CAPACIDAD` (nunca el aviso global «No se han podido leer algunos datos»), aislamiento por gestor (cada `get`
lo decide la regla real; un índice con la gestión de otro gestor se deniega por documento y jamás se entrega) y
la traza `[diag:carteras]`. Ninguna regla se relaja ni se amplía: `firestore.rules` intacto.

### 1.3 Limitación externa (qué falta y cómo cerrarla)

1. **Reglas publicadas.** No se puede ver ni desplegar `firestore.rules` desde Arena (no hay credenciales) ni se ha
   hecho. Para comprobar que lo publicado es lo del repositorio: Firebase Console › proyecto
   `gestor-inmuebles-produccion` › Firestore Database › base `ai-studio-gestordeinmueble-c6444afd-24ca-4983-b195-ceb2c5ebdc51`
   › Reglas (fecha de publicación y diff con `firestore.rules`), o `firebase deploy --only firestore:rules --project
   gestor-inmuebles-produccion` (destino fijado en `.firebaserc` y `firebase.json`).
2. **Tamaño del ruleset.** `firestore.rules` ocupa **210 432 bytes** (3 611 líneas, 116 funciones en el ámbito raíz y
   76 `match` de colección). Firebase documenta un límite de **256 KB de texto fuente** y de **250 KB del ruleset
   compilado** (que no se puede medir fuera de Firebase). Si un `firebase deploy` falla con «total size of compiled
   executables must be smaller than 256000», las reglas publicadas siguen siendo la última versión que sí compiló y
   **no** incluyen lo posterior. Es un riesgo a comprobar, no una causa afirmada.
3. **Planificador de consultas.** La prueba oficial exige `firebase emulators:exec` + `@firebase/rules-unit-testing` en
   un entorno con Java y red. Hasta entonces el veredicto `SOLO_LA_CONSULTA_DE_COLECCION_DENEGADA` de la consola es la
   evidencia de producción.

---

## 2. PROPIETARIOS / TITULARES — acceso real desde la interfaz

### 2.1 Por qué no era visible (inspección del código real)

* `PropietariosSection` existía (con su botón «Crear titular»), pero en `App.tsx` solo se montaba si
  `tipoPerfil !== 'PROPIETARIO'`. El PROPIETARIO veía en `propietarios` su **portal** (`PropietarioPortalSection`), que
  no contiene ninguna alta de titular: **ninguna entrada del menú llevaba a Propietarios/Titulares**.
* El alta de inmueble (PR #18) eliminó el «segundo propietario» manual y dice «Créalo desde Propietarios/Titulares»,
  pero su botón navegaba a `propietarios`, es decir, **de vuelta al portal**: un callejón sin salida. La condición
  `|| tipoPerfil === 'PROPIETARIO'` de `puedeGestionar` era código muerto (esa rama nunca se ejecutaba).
* Para el ADMINISTRADOR la entrada se llamaba «Propietarios & IBAN» (nadie la reconocía como «Titulares»); el
  ADMINISTRADOR no master quedaba en consulta con un aviso poco claro.
* Con las Rules actuales **solo el Administrador Principal crea la ficha de un tercero**; el PROPIETARIO crea y edita
  **únicamente la suya** (`propietarioId == myPropId()`); `list` es solo del master y `delete` no existe. Por eso no
  basta con «enseñar el botón» a todos: se ofrecería una acción que Firestore denegaría.

### 2.2 Desde qué pantalla y rol queda accesible

| Perfil | Entrada de menú (escritorio y móvil) | Pantalla | Qué puede hacer |
|---|---|---|---|
| Administrador Principal (master) | **Propietarios / Titulares** (`propietarios`, antes «Propietarios & IBAN») | `PropietariosSection` | **Crear titular** y editar cualquier ficha |
| ADMINISTRADOR no master | **Propietarios / Titulares** | `PropietariosSection` | Consulta, con explicación |
| PROPIETARIO | **Propietarios / Titulares** (nueva, `titulares`) junto a «Mi Portal Propietario» y «Mis Viviendas» | `PropietariosSection` en modo «mi ficha» | Completar y mantener **su** ficha (personal + contacto + fiscal + IBAN); «Crear mi ficha de titular» solo si aún no existe; se le explica que el alta de otro titular (p. ej. un cotitular) la hace la administración |
| PROFESIONAL / gestor | — | — | El gestor no crea ni lista titulares (S3) |

Además: el botón del alta de inmueble lleva al PROPIETARIO a `titulares` y al resto a `propietarios`; el aviso «Este
titular todavía no existe…» incluye ahora un botón «Abrir Propietarios/Titulares»; el título de cabecera y la ayuda
contextual de la nueva sección existen; las acciones «Editar», «Eliminar» y «Añadir IBAN» solo se ofrecen sobre las
fichas que cada perfil puede editar (antes «Añadir IBAN» se ofrecía también en consulta).

### 2.3 Cómo se crea un titular (flujo de diseño respetado)

Propietarios/Titulares → **Crear titular** → un solo formulario con ficha personal + contacto + fiscal (+ domicilio,
representante, cuentas IBAN y notas) → guardar → detección de duplicado por NIF (no crea una segunda ficha) → el
titular existente se **selecciona** al crear o editar un inmueble (el alta de inmueble no crea titulares) y se añaden
cotitulares desde «Titulares del inmueble». Sin «segundo propietario» manual, sin copiar datos fiscales entre
titulares, sin tocar `titularesIds` ni `titularidades`.

### 2.4 Lo que NO se ha hecho

* **No se cambian las Rules** para que un PROPIETARIO cree fichas de terceros. Sería una decisión de producto y
  seguridad (datos fiscales de otra persona; `list` seguiría siendo del master, así que no se podría detectar
  duplicados) ya documentada como abierta en `docs/propietarios-titulares-seccion-futura.md` §4 (opciones: solo
  administración, endpoint de servidor auditado o petición aprobada por la administración). La ayuda existente
  (`ayuda.propietarios.titulares`) ya decía lo mismo.

---

## 3. Validaciones

`npx tsc --noEmit` · `npm run lint` (= `tsc --noEmit`) · `npm run build` · `npx vitest run` · `git diff --check` — ver la
sección «Validación» del informe final del PR. Pruebas nuevas: `tests/carteras-lectura-por-relacion.test.ts` (29),
`tests/carteras-panel-por-relacion.test.ts` (7), `tests/titulares-acceso-ui.test.tsx` (28) y ampliaciones de los ficheros
de Carteras, navegación y la guardia D.6 del espejo (lista cerrada de lectores del espejo: se añade
`indiceEspejoCarteras.ts`, de solo lectura).
