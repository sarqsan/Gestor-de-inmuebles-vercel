# Intervención única — Carteras («falso No tienes permisos») + Propietarios/Titulares (modelo real)

Base: `origin/main` = `f0e3803` (merge del PR #18). Una sola rama de Arena y un único PR (#19) para los dos
problemas. **`firestore.rules`: modificado ÚNICAMENTE en el bloque `match /propietarios/{propietarioId}`** (titulares
del ámbito del propietario, ver §2). Carteras (`gestiones_cartera` y su lectura) **no se ha tocado**. **Nada se ha
desplegado desde Arena** (no hay credenciales): publicar `firestore.rules` es el paso pendiente (§2.8).

> Convención de este documento: «**demostrado**» = comprobado con el texto real de `firestore.rules`
> (evaluador del repo, documento a documento) o con el render real de la interfaz; «**no verificable aquí**» =
> exige el motor de Google o el proyecto real (no hay Java, ni emulador, ni acceso a `storage.googleapis.com`
> /`maven` desde este entorno: se volvió a comprobar en esta sesión).

> **Corrección de esta revisión.** La primera versión de este PR afirmaba que *un PROPIETARIO solo puede crear y
> mantener su propia ficha y que el alta de otro titular (cónyuge, copropietario…) corresponde a la administración*, y
> la interfaz le mostraba ese aviso. **Eso contradecía el modelo funcional real**: «Un PROPIETARIO puede crear y
> mantener cualquier número de fichas de PROPIETARIOS/TITULARES dentro de su ámbito autorizado» (sin límite 1, 2, 3, 10,
> 50 ni ningún otro, y sin pasar por un master/administrador). Esta revisión corrige las Rules, el cliente, la interfaz
> y las pruebas a ese modelo. El punto abierto «§4 de `docs/propietarios-titulares-seccion-futura.md`» queda resuelto.

---

## 1. CARTERAS — «No se han podido leer tus carteras ni delegaciones»

### 1.1 Auditoría de extremo a extremo de la lectura de `gestiones_cartera`

| Eslabón | Qué hace de verdad | Dónde |
|---|---|---|
| Quién consulta | Solo `PROPIETARIO` y `PROFESIONAL` (un propietario puede ser además gestor, caso E de D1R). El ADMINISTRADOR no abre esta lectura. | `PERFILES_QUE_CONSULTAN_CARTERAS` |
| Qué identidad usa | El **id de PERFIL** `usuarios/{id}` (`currentUser.id`), **no** el UID de Firebase Auth. | `useGestionesCarteraGestor` |
| Consulta | `gestiones_cartera where gestorUsuarioId == <id de perfil>` (escucha viva). | `subscribeGestionesCarteraGestor` |
| Regla `list` | `esAdminInmuebles() \|\| gestionInvolucraAMi(resource.data)`; la rama del gestor es `activeUser() && 'gestorUsuarioId' in d && 'usuarioId' in me() && d.gestorUsuarioId == me().usuarioId`. | `firestore.rules` (`match /gestiones_cartera`, l.1236-1238) |
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
la traza `[diag:carteras]`. Ninguna regla de Carteras se relaja ni se amplía: el bloque `gestiones_cartera` está intacto (la corrección de titulares del §2 solo toca `propietarios`).

### 1.3 Limitación externa (qué falta y cómo cerrarla)

1. **Reglas publicadas.** No se puede ver ni desplegar `firestore.rules` desde Arena (no hay credenciales) ni se ha
   hecho. Para comprobar que lo publicado es lo del repositorio: Firebase Console › proyecto
   `gestor-inmuebles-produccion` › Firestore Database › base `ai-studio-gestordeinmueble-c6444afd-24ca-4983-b195-ceb2c5ebdc51`
   › Reglas (fecha de publicación y diff con `firestore.rules`), o `firebase deploy --only firestore:rules --project
   gestor-inmuebles-produccion` (destino fijado en `.firebaserc` y `firebase.json`).
2. **Tamaño del ruleset.** `firestore.rules` ocupa **214 318 bytes** (3 663 líneas, 116 funciones en el ámbito raíz y
   76 `match` de colección; 210 432 bytes en `origin/main`: la corrección de titulares añade ≈3,9 KB de fuente y **ninguna
   función de ámbito raíz**, porque los helpers nuevos son locales a `match /propietarios` y las funciones raíz son las
   que se recompilan en cada `match` hijo). Firebase documenta un límite de **256 KB de texto fuente** y de **250 KB del ruleset
   compilado** (que no se puede medir fuera de Firebase). Si un `firebase deploy` falla con «total size of compiled
   executables must be smaller than 256000», las reglas publicadas siguen siendo la última versión que sí compiló y
   **no** incluyen lo posterior. Es un riesgo a comprobar, no una causa afirmada.
3. **Planificador de consultas.** La prueba oficial exige `firebase emulators:exec` + `@firebase/rules-unit-testing` en
   un entorno con Java y red. Hasta entonces el veredicto `SOLO_LA_CONSULTA_DE_COLECCION_DENEGADA` de la consola es la
   evidencia de producción.

---

## 2. PROPIETARIOS / TITULARES — el modelo real (corregido)

### 2.1 Modelo de permisos resultante

| Perfil | Entrada de menú | Qué puede hacer con fichas de titular (`propietarios`) |
|---|---|---|
| **PROPIETARIO** | **Propietarios / Titulares** (`titulares`) junto a «Mi Portal Propietario» y «Mis Viviendas» | **Crear TANTAS fichas de titular como necesite en SU ámbito** (cónyuge, copropietario, familiar, sociedad, otro titular patrimonial: no tienen que ser él mismo) y **mantenerlas** (datos fiscales, contacto, domicilio, representante, IBAN, notas). Además crea y mantiene **su propia** ficha. Lee solo su ficha y las de su ámbito. No borra (nadie borra). |
| Administrador Principal (master) | **Propietarios / Titulares** (`propietarios`) | Sin cambios: lee, lista, crea (con auditoría) y mantiene **cualquier** ficha, también las de ámbito. |
| ADMINISTRADOR no master | **Propietarios / Titulares** | Sin cambios: consulta, con explicación. |
| PROFESIONAL / gestor de cartera | — | Sin cambios: lee la ficha del propietario de su cartera y solo edita `fichaPatrimonial` (S3). **No hereda** los titulares del ámbito del propietario. |

**Ámbito = `Propietario.ambitoPropietarioId`**: el `propietarioId` del PROPIETARIO en cuyo ámbito vive la ficha. Solo lo
llevan las fichas de titular que crea un PROPIETARIO; la ficha propia, las heredadas y las del master no lo tienen. Las
Rules lo comparan con `myPropId()` (el `propietarioId` del espejo `usuarios_auth`, que **solo escribe el master**): el
cliente no puede elegir su propio ámbito.

### 2.2 Confirmación expresa: NO existe ningún límite

No hay límite de titulares por propietario ni de titulares por inmueble: ni 1, ni 2, ni 3, ni 10, ni 50, ni otro. La
cantidad **no forma parte de ninguna condición** y no hay contador oculto en:

* **Firestore Rules** — `create`/`update`/`get`/`list` solo evalúan *quién es* (`isPropietarioRole()`, `myPropId()`),
  *de qué ámbito es la ficha* y *la forma del id*; no cuentan documentos, no usan `get`/`exists` para contar y su única
  cifra es el largo del token del id (`{8,48}`). Demostrado: 250 altas seguidas permitidas y la decisión idéntica con
  0, 1, 2, 3, 10, 100 y 1 000 titulares ya en la base (`tests/titulares-ambito-reglas.test.ts` 4, 4b, 4c).
* **Interfaz** — «Crear titular» es siempre el mismo botón (no se oculta ni se desactiva tras guardar ni por el número de
  fichas); 12 altas seguidas desde la interfaz real. Las listas del alta de inmueble y de «Añadir titular» se desplazan
  (`overflow-y-auto`), no se recortan: 30 titulares ofrecidos sin servidor.
* **API / funciones** — la lectura por ámbito es **una** consulta de igualdad (sin `limit`, `in`, `or` ni paginación) y
  entrega 0, 1, 2, 3, 10, 100 y 300 titulares. Inspección estática (`tests/titulares-ambito-datos.test.tsx` W6/W6b):
  ninguna comparación de cantidad de titulares con una cifra ≠ 0 ni recorte de listas en el código de titulares. **La
  única cifra del código relacionado** es el tope de *resultados de la búsqueda de servidor F3* (`MAXIMO_RESULTADOS = 10`,
  mínimo 3 caracteres): limita lo que devuelve **una búsqueda**, no cuántos titulares se crean ni se asignan; el
  PROPIETARIO elige entre **todos** los suyos sin pasar por ella. (`vigentes.length <= 2` del motor de titularidades
  solo elige el *texto* del diagnóstico de porcentajes pendientes; admite cualquier número de titulares.)

### 2.3 Qué regla permite crear titulares dentro del ámbito

`firestore.rules`, `match /propietarios/{propietarioId}` — helpers **locales** al `match`:

```
function titularEnMiAmbito(d) {
  return isPropietarioRole() && myPropId() is string && myPropId().size() > 0
    && 'ambitoPropietarioId' in d && d.ambitoPropietarioId == myPropId();
}
function idDeTitularDeAmbito(id) { return id is string && id.matches('^tit_[a-z0-9]{8,48}$'); }

allow get:  if isMasterAdmin() || ownsPropietario(propietarioId) || carteraGestionadaPorMi(propietarioId)
            || titularEnMiAmbito(resource.data);
allow list: if isMasterAdmin() || titularEnMiAmbito(resource.data);
allow create: if (master…) || (propia: … && !('ambitoPropietarioId' in incoming()) && !idDeTitularDeAmbito(propietarioId))
  || (  // NUEVO — titular en MI ámbito, cualquier cantidad
       !isMasterAdmin() && titularEnMiAmbito(incoming()) && idDeTitularDeAmbito(propietarioId)
       && !incoming().keys().hasAny(['isStaff','isTenant','gestionesPorPropietario','carterasL','carterasE'])
       && !('personaId' in incoming()) && !('roadmap01AuditId' in incoming())
       && 'id' in incoming() && incoming().id == propietarioId );
allow update: if (master…) || (propia: … && !affectedKeys().hasAny(['ambitoPropietarioId'])) || (gestor: solo fichaPatrimonial)
  || (  // NUEVO — titular que YA está en mi ámbito: ámbito, id e identidad inmutables
       !isMasterAdmin() && titularEnMiAmbito(existing())
       && 'ambitoPropietarioId' in incoming() && incoming().ambitoPropietarioId == existing().ambitoPropietarioId
       && !incoming().diff(existing()).affectedKeys().hasAny(['id','personaId','roadmap01AuditId','isStaff','isTenant',
            'gestionesPorPropietario','carterasL','carterasE'])
       && 'id' in existing() && existing().id == propietarioId );
allow delete: if false;
```

**Por qué el id `tit_<token>`** (hallazgo de la revisión): sin un espacio de ids propio, un copropietario A que conoce el id
de la ficha *aún inexistente* de B (se ve en `titularesIds`) podría crear antes esa ficha con su propio ámbito, quedarse con
los datos fiscales que B escribiera después y bloquearle el alta. Las dos formas posibles de resolverlo con el id
`{propietarioId}__{sufijo}` o `{propietarioId}~{sufijo}` se **descartaron** tras inspeccionar el código: `__` es el
separador de la clave de titularidad `{inmuebleId}__{propietarioId}` (que se parte en exactamente dos) y `idAuditoria` del
módulo de operaciones rechaza `~`. La forma reservada `tit_<token>` no contiene `__`, `~`, `/` ni `.`; las fichas de **cuenta**
(`id == propietarioId`) nunca la usan (la rama propia la veta) y la rama de ámbito exige que el id la tenga: **los dos espacios
de ids son disjuntos por construcción**. Operativa del master: el `propietarioId` que asigne a una cuenta **no debe** tener la
forma `tit_<token>` (si la tuviera, su ficha de cuenta se rechaza en vez de colisionar).

### 2.4 Cómo se garantiza el aislamiento (ilimitado ≠ global)

1. **Ámbito del espejo, no del cliente**: el ámbito de una ficha se compara con `myPropId()` (espejo escrito solo por el master).
2. **Lectura**: `get`/`list` solo admiten fichas con **su** ámbito (+ la propia + las carteras que gestiona, como antes). No existe
   `allow list: if true` ni lectura general; el único listado general es el del master. La consulta del cliente es
   `where('ambitoPropietarioId','==', su id)`; pedir el de otro se **deniega** (las Rules no son un filtro). Demostrado con una
   colección mixta de 48 fichas: A ve sus 20, B sus 20, el master todas, un ADMINISTRADOR no master ninguna (`9b`).
3. **Alta**: solo con su ámbito, con id reservado, sin `personaId`, `roadmap01AuditId`, `isStaff`, `isTenant`, `gestionesPorPropietario`,
   `carterasL` ni `carterasE`, y con `id` == id del documento.
4. **Edición**: solo fichas que ya están en su ámbito; el ámbito y el id son inmutables (A no puede regalar ni apropiarse una
   ficha, ni quitarle el ámbito).
5. **Ficha propia endurecida**: la rama propia no admite `ambitoPropietarioId` en el alta ni cambios de ámbito al editar: B no puede
   inyectar su ficha en el ámbito de A.
6. **Carteras no heredadas**: el gestor no lee ni edita los titulares del ámbito del propietario (`8i`).
7. **Búsqueda de servidor F3** (`/api/titulares/buscar`): consulta global por prefijo de nombre; ahora **excluye** las fichas de ámbito
   ajeno salvo para master/ADMINISTRADOR, de modo que no se revela el nombre de un titular de otro propietario.
8. **Comparación diferencial con el bloque anterior**: 560 comparaciones (7 actores × 4 documentos × get/list/delete y 8 cargas
   de create/update) y **ninguna decisión cambia** para fichas sin `ambitoPropietarioId`: lo único nuevo es lo que lleva ámbito propio.
9. **Mutación**: 10 pruebas quitan una a una las guardas nuevas y comprueban que se abre exactamente el agujero que cerraban.

### 2.5 La interfaz (accesible desde el menú real)

PROPIETARIO → **Propietarios / Titulares** → **Crear titular** → ficha completa en un solo formulario (identificación, NIF/CIF/NIE,
contacto, domicilio fiscal, representante, cuentas IBAN, notas) → guardar → confirmación «Titular … creado. Ya puedes asignarlo a
tus inmuebles o crear otro titular» → el botón **sigue ahí**. Cada alta nace con formulario vacío (nada se copia de otra ficha ni de la
propia), con un id `tit_<token>` único y `ambitoPropietarioId` = su `propietarioId`. «Crear mi ficha de titular» es una acción
secundaria que solo aparece si falta la propia (el alta de inmueble exige que el titular económico sea la ficha propia). Si el
guardado se rechaza, el formulario **sigue abierto con lo escrito** y el motivo a la vista («La base de datos ha rechazado el
guardado de esta ficha (permisos)…»); nunca remite a un administrador ni se pierde en silencio (antes se cerraba el modal y la
promesa rechazada quedaba sin gestionar). Se retiró del PROPIETARIO todo texto de «corresponde a la administración» (sección,
ayuda contextual, ayuda de inmuebles, cabecera, nota de la pantalla patrimonial y descripción del menú).

Después se asignan a sus inmuebles: en el **alta** (el titular principal es siempre su ficha propia, como exigen las Rules de
`inmuebles`; sus titulares se marcan como «Otros titulares del inmueble») y en la **ficha del inmueble / Portal** (`Añadir titular`
ofrece TODOS sus titulares sin depender del endpoint de búsqueda, con porcentaje conocido o PENDIENTE). Sin «segundo propietario».

### 2.6 Lo que se mantiene

N-TITULARES real (1, 2, 3, 10, 60… sin límite binario), `inmuebles.titularesIds[]`, `titularidades/{inmuebleId}__{propietarioId}` (con
ids `tit_…` la clave sigue siendo válida y reversible), porcentajes (conocido o PENDIENTE: nunca se inventa 50/50), titular principal,
rol, estado, fechas e histórico (cerrar ≠ borrar). Las Rules de `inmuebles` y `titularidades` **no se han modificado** (el
propietario ya podía asignar a su inmueble cualquier titular).

### 2.7 Pruebas (las 12 exigidas)

| # | Prueba exigida | Dónde se demuestra |
|---|---|---|
| 1 | Un PROPIETARIO crea un titular | `titulares-ambito-reglas` «1»; UI `titulares-ambito-ui` A1 |
| 2 | El mismo crea un segundo | «2»; A1 |
| 3 | …un tercero | «3»; B1 (tres altas con datos distintos) |
| 4 | Muchos, sin condición numérica | «4» (250), «4b» (0…1 000 existentes), «4c» (texto sin contador), A1 (12 por la interfaz), `datos` S1 (0…300 leídos), W6/W6b |
| 5 | Cada ficha conserva sus datos fiscales | UI B1 (formulario vacío, datos distintos por ficha, nada compartido), B2, B3; reglas «5» |
| 6 | Se asignan después a inmuebles autorizados | reglas «6»/«7b»; UI D1 (alta), D3/D5 (panel y Portal) |
| 7 | N-TITULARES con más de dos | reglas «7» (15 titularidades); UI D1 (5 titulares), D2 (7 titularidades PENDIENTES), D3 (30 ofrecidos); `datos` N1–N3 (motor con 1, 2, 3, 5, 10, 60) |
| 8 | No lee ni modifica titulares fuera de su ámbito | reglas «8a»–«8j», diferencial y mutación; `datos` S2/S3, F1/F2 (servidor) |
| 9 | Sin acceso global a `propietarios` | reglas «9a», «9b», «8h» |
| 10 | ADMINISTRADOR/MASTER mantienen sus capacidades | reglas «10a»–«10c» y el diferencial; UI A4 |
| 11 | Alta y edición de inmuebles siguen funcionando | reglas «11a»–«11c»; `titulares-acceso-ui`, `alta-inmueble-titulares-existentes` y el resto de la suite |
| 12 | No se reintroduce «segundo propietario» | UI E1/E2 |

Más: aislamiento de la lectura y aviso propio con «Reintentar lectura» (`datos` I1–I5, R1), Carteras sin cambios (`datos` C1–C3 y
los tests `carteras-*` existentes), y `titulares-acceso-ui.test.tsx` reescrito al modelo (B2, B2b, B3, B5, C3, C5, C6, D2, E2).

### 2.8 Lo que no puede verificarse aquí y qué hay que hacer

1. **Publicar `firestore.rules`** en `gestor-inmuebles-produccion` (no hay credenciales en Arena y no se ha desplegado):
   Firebase Console › Firestore › Reglas, o `firebase deploy --only firestore:rules --project gestor-inmuebles-produccion`.
   **Hasta publicarlas, crear titulares y leerlos se rechaza en producción**: la aplicación lo muestra con un error visible en el
   formulario (alta) y con un aviso propio de capacidad «Titulares: no se han podido leer las fichas de titular de tu ámbito»
   con «Reintentar lectura» (lectura). Ninguno remite a un administrador, y la ficha propia, los inmuebles y el resto del Portal
   siguen funcionando (la lectura por ámbito es **capacidad adicional**, aislada de la lectura primaria).
2. **Planificador de consultas de Firestore**: el evaluador del repo decide documento a documento; no es el motor de Google. La consulta
   `where('ambitoPropietarioId','==', pid)` usa exactamente la forma que las Rules ya demuestran en producción para `inmuebles`
   (`inmuebleEsMio`: valor constante salido de un `get` de ruta fija), pero **su aceptación por el planificador no se ha podido
   probar** (`firebase emulators:exec` + `@firebase/rules-unit-testing`, pendiente de un entorno con Java y red). Si se rechazara,
   el aviso de capacidad lo diría con su causa y `reintentarCapacidad('titulares_ambito')` lo reintentaría; el alta no se vería afectada.
3. **Tamaño del ruleset**: ver §1.3 (+≈3,9 KB de fuente, 0 funciones de ámbito raíz).

---

## 3. Validaciones

`npx tsc --noEmit` · `npm run lint` (= `tsc --noEmit`) · `npm run build` · `npx vitest run` · `git diff --check` — ver la
sección «Validación» del informe final del PR. Pruebas nuevas de esta revisión: `tests/titulares-ambito-reglas.test.ts` (42),
`tests/titulares-ambito-ui.test.tsx` (20), `tests/titulares-ambito-datos.test.tsx` (37) y el fixture
`tests/fixtures/propietarios-bloque-reglas-anterior.txt` (el bloque anterior, para la comparación diferencial); reescritos
`tests/titulares-acceso-ui.test.tsx` (30), `src/patrimonial/pantallaPatrimonial.owner.test.tsx` y
`src/estadoDatos/canalIncidencias.test.ts`. De la entrega anterior se conservan `tests/carteras-*` y la guardia D.6 del espejo.
