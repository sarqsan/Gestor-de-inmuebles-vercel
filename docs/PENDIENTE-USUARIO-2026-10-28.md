# Lo que queda de tu parte — 28-10-2026

| | |
|---|---|
| **Estado** | 🟡 **PENDIENTE — no iniciado** |
| **De quién** | El usuario (consola de Firebase, cuenta de Google propia) |
| **Registrado** | 2026-10-28 |
| **Aplazado a** | **2026-10-29 o después, en ordenador** |
| **Por qué en ordenador** | Ver §«Por qué no vale el móvil» |
| **Duración estimada** | ~12 min (índices ~5 + simulador ~7) |
| **Bloquea a** | El cierre del registro de publicación de reglas e índices. **No bloquea** H-17 ni el trabajo de código |
| **Cómo se cierra** | Rellenar el cuadro de §5 de este documento y pegarlo. El registro se actualiza con fecha, versión y resultado; hasta entonces esto sigue **publicado pero no confirmado** |
| **Registro padre** | `docs/PENDIENTES-ABIERTOS.md` → **P-01** |

> Dos tareas en la consola de Firebase, unos **12 minutos**, y **nada de código**.
> Todo lo demás (reglas, código, despliegue, pruebas) está hecho y fusionado en
> `main@7e20bfd`.
>
> Esto no es una auditoría: son dos comprobaciones que **solo puede hacer el
> dueño de la consola**, porque requieren entrar con tu cuenta de Google.
>
> **Progreso 2026-10-29:** los **10 índices, creados** (informado por el usuario;
> falta ver que la consola los muestre en *Habilitado*). **Queda la Tarea 2**, el
> simulador: ver §2, ya ampliada con el detalle del token de autenticación.

## 0.0 Por qué no vale el móvil

No es una preferencia: las dos tareas son incómodas o directamente imposibles
desde el teléfono.

- **Crear índices**: el formulario pide añadir campos uno a uno y elegir
  Ascendente/Descendente en desplegables. En pantalla pequeña se toca el campo
  equivocado, y un índice con el orden cambiado **no da error**: simplemente no
  sirve y la consulta sigue fallando.
- **Simulador de reglas**: hay que pegar JSON, marcar «Autenticado» y escribir un
  email exacto. En móvil el campo de email se autocorrige y `a@b.c` acaba siendo
  otra cosa; el síntoma es un «Permitido» que parece un fallo de seguridad y no
  lo es.
- **Copia y pega del cuadro de resultados** (§5): en el móvil se pierde el
  formato y no se puede comparar con la tabla.

Se hace en el ordenador, con las dos pestañas abiertas.

---

## 0. Antes de nada: lo que **NO** tienes que hacer

| No hagas esto | Por qué |
|---|---|
| **No vuelvas a publicar las reglas.** | Ya están publicadas. El fichero del repo **no ha cambiado** desde entonces: `firestore.rules` sigue con `sha256 81b9ae93…413d` y **4 064 líneas**. |
| **No toques `storage.rules`.** | Sin cambios respecto a lo publicado (`sha256 631d45ac…34e93b9`). Publicarlo «por si acaso» es el único movimiento que puede romper algo. |
| **No borres ni crees índices de un solo campo**, ni «exenciones» (`fieldOverrides`). | El proyecto no declara ninguno; los automáticos de Firestore no se tocan. |
| **No reviertas las reglas si un caso del simulador sale distinto de lo esperado.** | Primero me lo cuentas. Revertir reabre las escrituras anónimas de `solicitudes`, `candidatos` y `actas_otp`, que es justo lo que cerramos. |

**Comprobación de 5 segundos** de que lo publicado es lo que hay en el repo: abre
la pestaña **Reglas** y mira el número de la **última línea**. Debe ser
**4 064**. Si no lo es, para y avísame antes de tocar nada: significaría que la
consola tiene otra versión distinta de la del repositorio.

---

## 1. Tarea 1 — Confirmar los 10 índices (≈5 min)

**Abre esto:**

<https://console.firebase.google.com/project/gestor-inmuebles-produccion/firestore/databases/ai-studio-gestordeinmueble-c6444afd-24ca-4983-b195-ceb2c5ebdc51/indexes>

*(Firestore Database → pestaña **Índices**. Proyecto `gestor-inmuebles-produccion`,
base con nombre `ai-studio-gestordeinmueble-c6444afd-…`. La base «(default)» no
se usa: no mires ahí.)*

Tienen que existir estos diez. Para todos: **Ámbito = Colección** (no «Grupo de
colecciones»), y el orden de campos importa.

| # | Colección | Campos (en ese orden) |
|---|---|---|
| 1 | `actas` | `ownerId` ASC · `propertyId` ASC · `fechaCreacion` DESC |
| 2 | `actas` | `ownerId` ASC · `contractId` ASC · `fechaCreacion` DESC |
| 3 | `actas` | `ownerId` ASC · `tipo` ASC · `estado` ASC |
| 4 | `actas_evidencias` | `ownerId` ASC · `actaId` ASC · `orden` ASC |
| 5 | `actas_incidencias` | `ownerId` ASC · `actaId` ASC · `fechaHora` DESC |
| 6 | `actas_otp` | `ownerId` ASC · `actaId` ASC · `estado` ASC |
| 7 | `gestiones_cartera` | `propietarioId` ASC · `estado` ASC |
| 8 | `gestiones_cartera` | `gestorUsuarioId` ASC · `estado` ASC |
| 9 | `ia_operaciones` | `uidTitular` ASC · `iniciadaEn` DESC |
| 10 | `ia_operaciones` | `uid` ASC · `iniciadaEn` DESC |

Cómo leer lo que ves:

| Estado en la columna «Estado» | Qué significa | Qué haces |
|---|---|---|
| **Habilitado** | listo | nada |
| **Creando** | se está construyendo en segundo plano (minutos) | esperar y volver a mirar |
| No aparece | falta | **Crear índice** con la fila de la tabla. Si la consola dice que ya existe, perfecto: no hay nada que hacer |

Los índices son **aditivos**: crearlos o dejarlos creándose no cambia permisos ni
rompe nada. Solo afectan a pantallas concretas (actas, cartera de gestiones,
operaciones de IA) que, sin ellos, fallan con «la consulta requiere un índice».

---

## 2. Tarea 2 — Los 6 casos del simulador (≈7 min)

**Abre esto:**

<https://console.firebase.google.com/project/gestor-inmuebles-produccion/firestore/databases/ai-studio-gestordeinmueble-c6444afd-24ca-4983-b195-ceb2c5ebdc51/rules>

En la pestaña **Reglas**, pulsa **Simulador de reglas** (en la interfaz en inglés,
*Rules Playground*). Es el mismo botón con dos nombres: **no hay que elegir entre
uno y otro**.

### 2.1 Dónde está el botón y cómo se ve

- Está **dentro de la pestaña Reglas**, no en otra pantalla: en el editor, arriba a
  la derecha, junto a «Publicar». Se llama **Simulador** / **Simulador de reglas**
  (icono de matraz o de reproducción). En consolas antiguas, **Rules Playground**.
- Al pulsarlo, el editor se parte y aparece un panel a la derecha. Si no lo ves,
  la ventana es estrecha: ensancha el navegador o busca el icono lateral.
- **No hay un botón «Publicar» que haya que pulsar aquí.** El simulador solo
  evalúa; no guarda ni aplica nada.

El panel tiene cuatro bloques, en este orden:

| Bloque | Qué es | Qué se pone |
|---|---|---|
| **Ubicación** / *Location* | la ruta del documento | `/solicitudes/prueba` — **empieza por `/`**, sin `databases/...`: la base ya está elegida al estar en su pestaña |
| **Operación** / *Operation* | el tipo | `get` o `create` según el caso |
| **Autenticado** / *Authenticated* | interruptor | ON u OFF según el caso |
| **Carga útil** / *Payload* | el JSON | el de la tabla |

### 2.2 El detalle que hace fallar el caso 6 sin motivo: el email va DENTRO del token

Marcar **Autenticado** y escribir un UID **no basta**. Las reglas leen
`request.auth.token.email`, así que el email tiene que estar en el JSON de
autenticación, no en un campo suelto. En los casos autenticados, abre el bloque de
autenticación y pega exactamente esto:

```json
{"uid":"prueba","token":{"email":"a@b.c","email_verified":true}}
```

Cambia solo el email donde el caso lo pida. Si `token.email` falta, `authEmail()`
devuelve `''` y el caso 6 (**Permitir**) saldrá **Denegado** aunque hayas marcado
«Autenticado»: es el falso negativo más frecuente de este simulador.

Para el caso 4, el email debe ser `a@b.c` y **no** `sarqsan2@gmail.com`: el master
sí puede leer OTP (para diagnóstico), así que con su correo el resultado correcto
es «Permitido» y parecería un fallo de seguridad.

### 2.3 Qué NO rellenar

- **No** hace falta «Documento existente» en los casos `create`: son altas.
- En el caso `get` (caso 4) el documento no tiene por qué existir: la regla se
  evalúa antes de leer y el resultado esperado es «Denegado» igual.
- **No** rellenes «Hora de la solicitud» (*Request time*): no interviene en estos
  seis casos.

Los seis son **de solo lectura del simulador**: no escriben nada en la base de
datos, aunque el resultado diga «Permitir».

| # | Ruta | Operación | Autenticación | Datos a pegar | Esperado |
|---|---|---|---|---|---|
| 1 | `solicitudes/prueba` | `create` | **sin** sesión | `{"nombre":"x","email":"a@b.c","telefono":"1","inmuebleId":"inm_1","estado":"NUEVA"}` | **Denegar** |
| 2 | `candidatos/prueba` | `create` | **sin** sesión | `{"nombre":"x","email":"a@b.c","telefono":"1","estado":"NUEVO"}` | **Denegar** |
| 3 | `actas_otp/prueba` | `create` | **con** sesión (cualquier usuario) | `{}` | **Denegar** |
| 4 | `actas_otp/prueba` | `get` | **con** sesión, que **no** sea master | *(no hace falta)* | **Denegar** |
| 5 | `audit_logs/prueba` | `create` | con sesión, email `a@b.c` | `{"usuarioEmail":"otro@b.c"}` | **Denegar** |
| 6 | `audit_logs/prueba` | `create` | con sesión, email `a@b.c` | `{"usuarioEmail":"a@b.c"}` | **Permitir** |

**Importante para no confundir qué demuestra esto.** Los seis casos **ya están
probados automáticamente contra el fichero** `firestore.rules` en el emulador de
CI (run verde en cada PR), en estos ficheros:

| Caso | Dónde está probado en el emulador |
|---|---|
| 1 | `tests/emulador/reglas-altas-servidor.emulador.test.ts` → *un anónimo NO puede crear, modificar ni borrar solicitudes* |
| 2 | `tests/emulador/reglas-altas-servidor.emulador.test.ts` → *un anónimo NO puede crear candidatos* |
| 3 y 4 | `tests/emulador/actas-otp.emulador.test.ts` → *el navegador no crea ni lee OTP* |
| 5 y 6 | `tests/emulador/reglas-altas-servidor.emulador.test.ts` → *audit_logs · append-only sin suplantación* |

Entonces, ¿qué añade el simulador? **Prueba la consola, no el fichero.** El
emulador demuestra que el fichero del repo es correcto; el simulador demuestra
que **lo que hay publicado en el proyecto** es ese fichero. Es la única forma de
detectar que se publicó otra cosa (una versión anterior, o un borrador a medias).

Qué está comprobando cada uno, en una línea (para que sepas qué se rompe si sale
al revés):

1. Nadie da de alta una solicitud desde el navegador: el alta la hace el servidor
   con el token del inmueble (H-06).
2. Igual con los candidatos.
3. El OTP de firma de actas no lo escribe el navegador: es material del servidor.
4. El navegador tampoco puede leer los hashes de OTP (solo el master, para
   diagnóstico).
5. Un registro de auditoría no puede atribuirse a **otro** correo (suplantación).
6. Pero sí puede registrar tu propio correo: la auditoría sigue funcionando.

---

## 2.4 Alternativa mucho más corta (3 minutos) si el simulador se atraganta

El simulador es la parte más torpe de la consola: seis formularios, un editor de
JSON y un campo de autenticación que casi nadie acierta a la primera. Hay un
camino equivalente y más corto, **verificado por identidad del texto**.

**La lógica, para que no sea fe ciega:**

1. CI ejecuta la batería de reglas del emulador **contra `firestore.rules`**. Eso
   demuestra el comportamiento del fichero.
2. Tú demuestras que el texto **publicado en la consola** es exactamente ese
   fichero (mismo `sha256`).
3. Por tanto lo publicado se comporta como lo probado.

El eslabón 2 es el que se rompe en silencio (alguien publicó una versión
anterior), y es justo el que el simulador iba a detectar. Comparar el texto lo
detecta igual, y sin equivocarse de `ASC`/`DESC` en un formulario.

### 2.4.1 Por qué buscar con Ctrl+F dentro de la consola engaña

Registrado el 2026-10-29: el usuario buscó dos textos que **sí** están en el
fichero (líneas 3645 y 3655) y no los encontró, con el recuento de líneas
correcto (4064). No era un problema de las reglas: es el editor.

- El editor de la consola **solo tiene dibujadas en pantalla las líneas visibles**.
  La búsqueda del navegador (Ctrl+F) únicamente ve lo dibujado, así que un texto
  que está en la línea 3645 **no lo encuentra** si no está a la vista. Ausencia de
  resultado **no** significa ausencia de texto.
- Además, frases con guion largo (`—`) o tildes fallan si se escriben con un
  guion normal o desde un teclado distinto.

**Regla práctica:** busca **después de pegar en un editor de texto**, nunca
dentro del editor de la consola. Y busca cadenas cortas en ASCII.

### 2.4.1bis Ruta sin teclado: capturas de pantalla (la que hay que usar)

Aviso registrado el 2026-10-29: las secciones §2.4.2 y §2.4.3 piden pegar texto en
un editor o abrir una terminal. **Si eso no es tu caso, sáltalas**: no hacen
falta. Todo lo que queda se puede comprobar con **clic y una captura de
pantalla**, y quien la lee (yo) saca la conclusión.

**Captura en Windows:** tecla `Impr Pant`, o `Windows + Mayús + S` para recortar
solo una zona. **En Mac:** `Cmd + Mayús + 4`. Luego pega en el chat.

| Captura | Dónde | Qué demuestra |
|---|---|---|
| **A** | Firestore → **Índices** | que están los 10 y en estado *Habilitado* |
| **B** | Firestore → **Reglas**, desplazado **hasta abajo** | que el final del texto es el correcto (ver §2.4.2) |
| **C** | Firestore → **Reglas**, parte superior de la pantalla | *solo si quieres seguir con el simulador*: sirve para señalar el botón exacto que tienes |

Con **A** y **B** se cierra P-01. La **C** es opcional y solo para que yo te
señale el botón del simulador sobre tu propia pantalla, en lugar de describirlo.

**Cómo desplazar el editor de reglas hasta abajo:** clic **una vez dentro del
texto** de las reglas y pulsa **Ctrl + Fin** (`Cmd + Flecha abajo` en Mac). No
hace falta seleccionar nada.

### 2.4.2 *(opcional, si sabes usar un editor de texto)* Comparación de marcadores en 1 minuto

1. Clic **dentro del editor de reglas** → **Ctrl+A** → **Ctrl+C**.
2. Abre el **Bloc de notas** (o TextEdit / gedit) y **pega**.
3. Con el foco en esa ventana, **Ctrl+F** y busca estas tres cadenas, una a una
   (todas en ASCII, sin tildes ni guiones largos):

   | Cadena a buscar | Debe aparecer |
   |---|---|
   | `rules_version = '2';` | en la **primera** línea |
   | `actas_otp` | **1 vez** |
   | `DENEGACIÓN GLOBAL POR DEFECTO` | cerca del final |

4. Y comprueba que las **últimas líneas** del texto pegado son exactamente estas:

   ```text
       match /{document=**} {
         allow read, write: if false;
       }
     }
   }
   ```

Si las tres cadenas aparecen y el final coincide, lo publicado es la versión
buena: el recuento de líneas (4064) ya lo habías confirmado.

### 2.4.3 *(opcional, solo si tienes el repositorio y sabes usar una terminal)* Comprobación definitiva

1. Consola → **Firestore → Reglas** → clic dentro del editor → **Ctrl+A** → **Ctrl+C**.
2. Abre un editor de texto, pega y guarda como **`reglas-consola.txt`** en la
   carpeta del repositorio (junto a `firestore.rules`).
3. En la terminal, desde esa carpeta:

   ```bash
   node scripts/verificar-reglas-publicadas.mjs reglas-consola.txt
   ```

**Qué te va a decir:**

| Salida | Significado | Qué haces |
|---|---|---|
| `✓ OK — lo publicado en la consola es EXACTAMENTE el fichero del repositorio` | publicado = probado | pega esa línea y cerramos |
| `✗ DISTINTO` + «*tiene X líneas y el del repositorio 4064*» | hay publicada otra versión | **no toques nada**, avísame |
| `✗ DISTINTO` + «*primera diferencia está en la línea N*» | mismo tamaño, contenido cambiado | avísame con el número de línea |

La comparación **no da falso negativo por formato**: da igual que el pegado use
saltos de línea de Windows, espacios al final de línea o una línea en blanco de
más. Solo falla si el **contenido** difiere.

**Y si aun así quieres el simulador**, con este atajo ya hecho basta con dos
casos de humo en lugar de seis —los dos que cubren los extremos—:

- **Caso 1** (anónimo, `/solicitudes/prueba`, `create`) → **Denegado**.
- **Caso 6** (`/audit_logs/prueba`, `create`, autenticado con `a@b.c`) → **Permitido**.

---

## 3. Cómo interpretar un resultado inesperado

| Lo que ves | Qué significa | Qué haces |
|---|---|---|
| Caso **1 o 2** dice «Permitir» | Escritura anónima abierta: las reglas publicadas **no** son las del repo | **No toques nada.** Avísame con captura |
| Caso **3 o 4** dice «Permitir» | El navegador puede escribir/leer OTP: es el fallo más grave de la lista | **No toques nada.** Avísame |
| Caso **5** dice «Permitir» | Se acepta suplantación en `audit_logs` | avísame |
| Caso **6** dice «Denegar» | Casi siempre es del simulador, no de las reglas: revisa que marcaste **Autenticado** y que el email es `a@b.c` | vuelve a probarlo; si sigue, avísame |

Ante cualquier duda, la respuesta correcta es **parar y contarme**, no revertir.

---

## 4. Qué me devuelves (copia y pega, o una captura)

```
Índices: __/10 habilitados
   (si falta alguno: cuál y en qué estado)
Caso 1: 
Caso 2: 
Caso 3: 
Caso 4: 
Caso 5: 
Caso 6: 
```

Con eso cierro el punto en el registro de publicación con fecha, versión y
resultado. Hasta entonces queda como **publicado pero no confirmado**, que es
distinto y así lo digo.

---

## 5. Por qué estas dos cosas y no otras

- **Las reglas ya están en vigor.** Publicarlas fue el paso que cerraba las
  escrituras anónimas; está hecho. Lo que falta no es publicar, es **comprobar
  que lo publicado es lo que probamos en el emulador**: el emulador prueba el
  fichero, no la consola.
- **Los índices solo se notan cuando fallan**, y fallan en pantallas concretas
  (actas, cartera, IA) en mitad de una operación real. Es mejor descubrirlo
  ahora, con la lista delante, que en producción.
- **Ninguna de las dos requiere que yo tenga acceso**: son tu cuenta de Google y
  tu consola. Por eso no puedo adelantarlas ni comprobarlas por ti.
