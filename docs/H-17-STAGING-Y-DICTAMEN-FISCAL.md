# H-17 — Staging y dictamen fiscal

**Fecha:** 2026-10-29 · **Estado:** 🟡 **abierto por decisión externa**, con la
parte técnica que lo desbloquea **hecha y probada**.

> H-17 tenía dos mitades y ninguna era código: «no existe staging» y «no hay
> dictamen fiscal firmado». Al ir a escribirlas se descubrió que la primera **no
> era solo una decisión externa**: el servidor rechazaba cualquier proyecto que no
> fuese producción, así que un staging era **imposible por código**. Documentar un
> staging así habría sido repetir la trampa que el propio informe denuncia
> («staging documentado» ≠ «staging operativo»).

---

## Parte 1 · Staging

### 1.1 Lo que ya está hecho (servidor)

`server/titularidades/configuracionFirebase.ts` exigía literalmente
`projectId === 'gestor-inmuebles-produccion'`. Ahora:

| Antes | Ahora |
|---|---|
| Un único proyecto escrito a mano | Lista cerrada de **dos** destinos: `gestor-inmuebles-produccion` y `gestor-inmuebles-staging` |
| Cualquier otro proyecto → bloqueado | Sigue bloqueado: la lista es cerrada, no un comodín |
| No existía forma de declarar entorno | `ENTORNO_DESPLIEGUE` (`produccion` \| `staging`); **ausente = producción** |
| — | El proyecto del JSON **y** el entorno declarado deben coincidir, o se bloquea con `FIREBASE_ENTORNO_INCOMPATIBLE` |

**Por qué la coincidencia es lo importante.** Sin ella habría dos fallos graves,
uno en cada dirección:

- un `firebase-applet-config.json` de **staging** desplegado en el dominio real:
  el servidor hablaría con la base de pruebas creyendo servir a clientes;
- un **staging** apuntando a la base **real**: un entorno sin garantías podría
  escribir datos de clientes.

Los dos casos están cubiertos por prueba (`tests/h17-entorno-despliegue.test.ts`,
13 casos), incluida la compatibilidad hacia atrás: **sin declarar nada,
producción funciona igual que antes**. No hay ningún cambio de comportamiento en
el despliegue actual.

### 1.2 Cliente: destino por entorno — ✅ hecho (P-08)

El cliente leía `firebase-applet-config.json` **versionado** desde tres módulos
(`firebase.ts`, `entornoFirebase.ts`, `googleAuth.ts`). Como Vercel no puede variar
un fichero versionado por entorno, un despliegue de staging habría seguido
hablando con **producción** en la interfaz.

Ahora hay **un solo punto de resolución**: `src/lib/destinoFirebase.ts`.
`src/lib/firebase.ts` y `src/lib/entornoFirebase.ts` lo consumen; `googleAuth.ts`
es la excepción documentada (ver «Residuo conocido» al final de este apartado).

**Variables** (solo Vercel, proyecto de staging):

| Variable | Obligatoria | Valor |
|---|---|---|
| `VITE_ENTORNO_FIREBASE` | sí (para staging) | `staging` |
| `VITE_FIREBASE_PROJECT_ID` | sí | `gestor-inmuebles-staging` |
| `VITE_FIREBASE_APP_ID` | sí | el del proyecto de staging |
| `VITE_FIREBASE_API_KEY` | sí | clave web pública |
| `VITE_FIREBASE_AUTH_DOMAIN` | sí | `gestor-inmuebles-staging.firebaseapp.com` |
| `VITE_FIREBASE_FIRESTORE_DATABASE_ID` | sí | base **con nombre** de staging |
| `VITE_FIREBASE_STORAGE_BUCKET` | sí | bucket de staging |
| `VITE_FIREBASE_MESSAGING_SENDER_ID`, `..._MEASUREMENT_ID`, `..._OAUTH_CLIENT_ID`, `..._RECAPTCHA_SITE_KEY` | no | opcionales |

**Las cinco reglas que hacen esto seguro** (todas con prueba):

1. **Sin `VITE_ENTORNO_FIREBASE`, manda el JSON versionado** y las
   `VITE_FIREBASE_*` se **ignoran por completo**. Una variable suelta mal puesta
   en el panel de Vercel **no puede cambiar el destino de producción**.
2. **Staging incompleto falla**, con el nombre de la variable que falta. No cae a
   producción en silencio: ese modo de fallo dejaría el staging apuntando a la base
   de clientes sin que nadie lo note.
3. **Staging apuntando al proyecto real → bloqueado** (`DESTINO_STAGING_INCOHERENTE`).
4. **Valor de entorno desconocido → bloqueado**: no se asume producción.
5. **La base debe ser con nombre**: la base por defecto no forma parte de la
   arquitectura, tampoco en staging.

Y el staging **se ve**: la pantalla de Configuración marca `· STAGING` junto al
proyecto activo y muestra un aviso de que los datos no son los reales. Un entorno
de pruebas indistinguible del real es la forma más fácil de dar por bueno un dato
de prueba o de creer que se está probando en una copia.

**Prueba de arranque real** (`tests/p08-arranque-cliente-staging.test.ts`): con el
entorno de staging puesto, se importa el arranque del cliente y se comprueba que
la app de Firebase queda en `gestor-inmuebles-staging`, que `googleAuth` reutiliza
**esa misma** app (no una segunda) y que un staging incompleto **no arranca**. No
es una lectura de código: es el SDK inicializado.

### Residuo conocido (P-09)

`src/lib/googleAuth.ts` **no se ha tocado**. La guardia de custodia
(`src/features/operaciones/tests/integration-boundaries.test.mjs`) lo exige byte a
byte idéntico a `main`, y saltársela está prohibido: no se edita el fichero que
vigila. Sigue haciendo `initializeApp(firebaseConfig)` con el JSON versionado, pero
esa rama **no se ejecuta**: cuando se evalúa, `getApps().length` ya es 1 porque
`firebase.ts` arrancó antes.

Ese «antes» es un orden de importación, y un orden no es una garantía del lenguaje.
Por eso el arranque **falla en voz alta** en vez de degradarse: si la app existente
apunta a otro proyecto, `verificarAppPrecedente()` lanza
`DESTINO_APP_PRECEDENTE_INCOMPATIBLE` y no se reutiliza ni se crea una segunda app.
Escenario cerrado: *staging que escribe en la base de clientes porque el módulo
equivocado cargó primero*. Como mucho, un staging que no arranca — nunca un dato
real en pruebas.

Para eliminarlo del todo hay que llevar `googleAuth.ts` al manifiesto revisado
(`custodia-parche-p0.json`) con su parche byte a byte. El manifiesto está fijado a
la base `658f692`, que no existe en este clon superficial; hacerlo a ciegas sería
reescribir la custodia sin poder verificarla. Queda registrado como **P-09**.

**Nota de compatibilidad:** en producción no cambia nada. El destino resuelto es
el mismo fichero, el mismo proyecto y la misma base; y la guardia de topología
(AG-03.2) sigue exigiendo base con nombre y prohibiendo `getFirestore(app)`.

Con P-08 hecho, el staging es **operativo en servidor y en cliente** en cuanto
exista el proyecto. Lo que falta ya no es código: es crear el proyecto (§1.3) y
la firma fiscal (§2).

### 1.3 Runbook: crear el staging

**Ningún paso de esta lista se hace en una terminal.** Tú solo abres páginas web y
haces clics; lo que requiera tocar código lo hago yo. **Nada de esto toca
producción**: se trabaja siempre en el proyecto nuevo.

#### (A) Lo que haces tú — 5 tareas, solo clics

**Tarea A.1 · Crear el proyecto (3 min)**
1. Entra en <https://console.firebase.google.com> con tu cuenta de Google.
2. Arriba a la izquierda, clic en el nombre del proyecto → **«Crear proyecto»**.
3. Nombre: `gestor-inmuebles-staging`. Si el identificador que propone ya está
   cogido, acepta el que añada un número al final y **dímelo**: hay que ajustar
   un literal en el código (lo hago yo).
4. Analítica: **desactívala** (no hace falta y gasta cuota).
5. Clic en **«Crear proyecto»** → espera → **«Continuar»**.
6. 📸 **Captura 1** (qué demuestra: que el proyecto de pruebas existe y no es el
   real): la pantalla de inicio del proyecto, donde se lee el nombre arriba a la
   izquierda. `Impr Pant`, o `Windows + Mayús + S` y arrastra un recuadro
   (en Mac: `Cmd + Mayús + 4`).

**Tarea A.2 · Crear la base de datos con nombre (3 min)**
1. Menú izquierdo → **«Firestore Database»** → **«Crear base de datos»**.
2. Ubicación: la misma que producción (`europe-west1` si no recuerdas cuál, dime
   y lo miro).
3. Modo: **«Modo de producción»** (nunca «modo de prueba»: las reglas abiertas son
   el error clásico).
4. **El ID de la base**: en el desplegable de bases, clic en **«Añadir base de
   datos»**… no hace falta: el proyecto nuevo nace con la base `(default)`, y la
   arquitectura exige **base con nombre**. Para crearla con nombre, en la consola
   de Google Cloud: <https://console.cloud.google.com/firestore/databases> →
   **«Crear base de datos»** → **«Dar un nombre a la base de datos»** →
   `ai-studio-staging-1` (o el que prefieras, **anótalo**) → modo nativo →
   **«Crear»**.
5. 📸 **Captura 2** (qué demuestra: que la base tiene nombre y no es la
   `(default)`): la lista de bases de datos, con el nombre visible.

**Tarea A.3 · Publicar reglas e índices en el proyecto nuevo (5 min)**
1. En el repo, abre en el navegador el fichero `firestore.rules` y usa el botón de
   copiar del visor de GitHub (el icono de dos hojas, arriba a la derecha del
   fichero). No hace falta abrir ningún editor.
2. En la consola de Firebase **del proyecto nuevo**: Firestore Database →
   pestaña **«Reglas»** → clic dentro del texto → `Ctrl + A` (seleccionar todo) →
   `Ctrl + V` (pegar) → **«Publicar»**.
3. Índices: pestaña **«Índices»** → **«Crear índice»**, uno por cada índice de
   `firestore.indexes.json`. Son los mismos 10 que ya creaste en producción.
4. 📸 **Captura 3** (qué demuestra: que el staging tiene las MISMAS reglas, no unas
   relajadas): la pestaña «Reglas» con la última línea `allow read, write: if
   false;` visible (clic dentro del texto y `Ctrl + Fin` para ir al final).
5. 📸 **Captura 4**: la lista de índices en estado **«Habilitado»**.

**Tarea A.4 · Dar de alta la aplicación web (2 min)**
1. Rueda dentada (⚙️, arriba a la izquierda) → **«Configuración del proyecto»** →
   pestaña **«General»** → baja hasta **«Tus apps»** → icono **`</>`** (web).
2. Apodo: `panel`. **No** marques Hosting.
3. Se abre un cuadro con un bloque de configuración. **No lo copies**: solo hace
   falta que esté creada la app.
4. 📸 **Captura 5** (qué demuestra: que la app web existe y de qué proyecto es):
   la pantalla con el apodo `panel` y el `projectId` visible.

**Tarea A.5 · Copiar a un sitio seguro los 6 datos y decírmelos**
No los pegues aquí en el chat salvo el `projectId`, el `authDomain`, la base y el
bucket (esos cuatro son públicos). La **clave API web** también es pública por
diseño, pero si prefieres no escribirla, la pones tú directamente en Vercel en la
tarea B.4. **Nunca** me pases la cuenta de servicio: esa sí es secreta.

| Dato | Dónde está | ¿Secreto? |
|---|---|---|
| `projectId` | Configuración del proyecto → General | no |
| `authDomain` | `<projectId>.firebaseapp.com` | no |
| `firestoreDatabaseId` | el nombre que pusiste en A.2 | no |
| `storageBucket` | Configuración → General → «Bucket» | no |
| `apiKey` (web) | Configuración → General → «Tus apps» | no (es pública, va en el navegador) |
| `appId` | Configuración → General → «Tus apps» | no |

**Lo que NO debe salir de tu ordenador:** la **cuenta de servicio** (JSON con clave
privada). Esa se pega solo en Vercel (tarea B.3), nunca en el chat, ni en un
commit, ni en una captura.

#### (B) Lo que hago yo, cuando me des los datos de A.5

1. Ajustar el literal del proyecto de staging en el código y en el test que fija la
   lista (si el nombre lleva sufijo).
2. Montar el despliegue de staging en Vercel y las variables `VITE_FIREBASE_*`
   (§1.2). Si prefieres ponerlas tú: Vercel → proyecto → **Settings** →
   **Environment Variables** → **Add New**, seis filas, ámbito *Preview*.
3. Verificar el despliegue **desde CI**, no desde tu ordenador: el workflow
   `verificacion-produccion.yml` ya comprueba salud 200 y los rechazos 410/401/413
   contra la URL que se le indique. Te doy el resultado con la lista de
   comprobaciones, sin que tengas que ejecutar nada.
4. Dejar la evidencia en `docs/` y cerrar P-02 cuando esté verificado.

#### Lo que NO hay que hacer

- No dupliques el proyecto de producción «copiando» la base: el staging nace vacío
  a propósito. Una copia con datos reales es un riesgo de privacidad.
- No publiques las reglas de staging en producción ni al revés: son ficheros
  distintos de proyectos distintos.
- No uses el modo de prueba de Firestore en ningún momento.

### 1.4 Para qué sirve el staging cuando exista

Es el único sitio donde se puede comprobar **con datos reales** lo que la suite
solo prueba con emuladores o unidades:

- alta de una solicitud por el portal público con el token de H-06 (y que un
  `sol-<id>` inventado dé 404);
- firma de un acta con OTP de punta a punta;
- creación de un inmueble nuevo y verificación de que recibe `tokenSolicitud`.

Todo eso hoy **no se ha ejecutado nunca contra una base real**. Es el hueco que
H-17 cierra.

---

## Parte 2 · Dictamen fiscal

### 2.1 Qué hay ya

`docs/P1.4-DICTAMEN-FISCAL-PREVIO-2026-10-27.md` es un **pre-dictamen técnico**:
clasifica las operaciones del ERP, reúne siete fuentes primarias (AEAT y BOE) y
fija las puertas de decisión. **No es un dictamen firmado y no sustituye a uno.**

### 2.2 Qué falta y quién lo hace

Una persona con criterio fiscal (asesor, responsable de producto) tiene que
firmar. Lo que falta no es análisis: es **firma**. Por eso el entregable es una
carta lista para enviar, no otro informe.

### 2.3 Carta para el asesor — copiar y enviar

> Asunto: **Consulta previa — encaje fiscal de un ERP de gestión de alquileres**
>
> Somos titulares de un software de gestión de alquileres (captación, contratos,
> cobros, gastos y facturación). Antes de invertir en el módulo de facturación
> electrónica necesitamos tu criterio por escrito sobre seis puntos. El análisis
> técnico con las fuentes ya está hecho y te lo adjuntamos; **no pedimos que lo
> repitas, pedimos que lo valides o lo corrijas**.
>
> 1. **Obligado tributario.** En cada operación (recibo de alquiler de vivienda a
>    persona física, honorarios del administrador al propietario, facturas
>    recibidas de proveedores), ¿**quién** expide la factura: el propietario, el
>    gestor o una sociedad intermedia?
> 2. **¿El ERP se comercializa como SIF?** Es decir, ¿lo vendemos como «sistema
>    informático de facturación» (con obligaciones de productor y declaración
>    responsable) o como herramienta de gestión que además emite?
> 3. **Locales, temporada y habitación.** ¿Clasificación definitiva y tratamiento
>    en IVA/IRPF de cada uno?
> 4. **Modalidad.** ¿**VERI*FACTU** o **NO VERI*FACTU**? La AEAT admite las dos;
>    la elección es del obligado y cambia conservación, remisión y QR.
> 5. **Factura electrónica B2B.** ¿Aplica a nuestro caso? Si aplica, ¿SPFE o
>    plataforma privada, y qué copia fiel (UBL) hay que conservar?
> 6. **Vigencia de las fuentes.** Las hemos consultado en octubre de 2026
>    (RD 238/2026, Orden HAC/1028/2026, plazos RRSIF 1-1-2027 y 1-7-2027,
>    obligaciones B2B 6-10-2027/2028/2029). ¿Siguen vigentes a día de hoy?
>
> Nuestro criterio técnico actual, que puedes corregir: el flujo mayoritario
> (vivienda a persona física) es **no sujeto** por no haber obligación de
> expedir factura; el ERP **sí puede emitir** facturas de locales y de honorarios,
> así que **no** damos el conjunto del producto por «no sujeto».

### 2.4 Mientras no haya dictamen: qué está bloqueado

Esto **no cambia** con este documento y sigue igual que antes:

| Bloqueado | Por qué |
|---|---|
| Transporte AEAT (envío de registros) | Sin dictamen no se sabe si hay obligación ni en qué modalidad |
| Plataforma B2B / SPFE | Depende de la respuesta 5 |
| Declaración responsable de SIF | Depende de la respuesta 2 |
| Activar modalidad `VERI*FACTU` | Depende de la respuesta 4 |

Lo que **sí** funciona hoy: emisión interna de recibos y facturas con numeración,
huella encadenada y trazabilidad. El ERP no se presenta como «sistema
VERI*FACTU» en ningún sitio del código (se corrigió en D-09).

---

## Resumen de estado

| Pieza | Estado |
|---|---|
| Guardia de entorno en servidor | ✅ Hecha y probada (13 casos) |
| Compatibilidad de producción | ✅ Sin cambios: ausente = producción |
| Cliente con destino por entorno (P-08) | ✅ Hecho — `src/lib/destinoFirebase.ts`, 18 casos |
| Proyecto de staging creado | 🟡 Pendiente — requiere la cuenta de Google del titular |
| Runbook de staging | ✅ §1.3 |
| Pre-dictamen técnico fiscal | ✅ Ya existía |
| Carta al asesor | ✅ §2.3, lista para enviar |
| Dictamen firmado | 🟡 Pendiente — externo |

**H-17 no se puede cerrar desde el repositorio.** Se cierra el día que exista un
proyecto de staging verificado y una firma. Lo que sí se ha hecho es quitar la
excusa técnica: antes ni siquiera era posible intentarlo, ni por el servidor (que
rechazaba cualquier proyecto que no fuese producción) ni por el cliente (que leía
un fichero versionado).
