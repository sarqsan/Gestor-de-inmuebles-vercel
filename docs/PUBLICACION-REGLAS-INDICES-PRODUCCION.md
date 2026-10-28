# Publicación de reglas e índices en producción — 2026-10-28

Guía para **pegar en la consola de Firebase** exactamente lo que falta en producción.
No hay secretos en este documento: las reglas, los índices y el nombre de la base de
datos son configuración pública.

Estado de partida (`main@90110ef`): el **código** ya está desplegado en Vercel; las
**reglas e índices NO están publicados**. Mientras siga así, la app se comporta como
si las reglas antiguas (más permisivas) siguieran vigentes.

---

## 1. Datos de destino (no confundir)

| Dato | Valor |
|---|---|
| Proyecto | `gestor-inmuebles-produccion` |
| Base de datos Firestore (**no** es `(default)`) | `ai-studio-gestordeinmueble-c6444afd-24ca-4983-b195-ceb2c5ebdc51` |
| Bucket de Storage | `gestor-inmuebles-produccion.firebasestorage.app` |
| Reglas Firestore (destino) | `firestore.rules` — 4 083 líneas, `sha256 96024678…6bdb62` |
| Reglas Storage | `storage.rules` — **sin cambios, no se publica** |
| Índices | `firestore.indexes.json` — 10 índices compuestos, `sha256 5002edd6…e80fcb` |

Consola → **Firestore Database → Reglas**. Si el proyecto tiene varias bases, selecciona
la del cuadro anterior; la URL correcta contiene `/firestore/databases/ai-studio-gestordeinmueble-c6444afd-24ca-4983-b195-ceb2c5ebdc51/rules`.

---

## 2. Antes de tocar nada (2 minutos, evita un incidente)

1. **Guarda lo publicado.** En la pestaña *Reglas*, copia el texto actual a un fichero
   local (`reglas-produccion-antes-2026-10-28.rules`). Es tu rollback.
2. **Identifica qué versión tienes publicada.** Busca en ese texto:
   - Si aparece `function otpEsMio(d)` y `allow create: if isSignedIn();` → tienes la
     versión de `main@2563831` y basta con aplicar los **5 cambios** de §3.
   - Si **no** aparecen → tu ruleset es anterior: **pega el fichero completo** (§3, opción A).
3. **Comprueba que el código desplegado es el nuevo**: en el navegador, `Ver código fuente`
   no sirve; basta saber que el despliegue de producción corresponde a `main@90110ef`
   (deployment `ApWvAQ7m11DWdV8dLirTrrH94BnB`). Es compatible con las reglas nuevas (§5).

---

## 3. Reglas Firestore

### Opción A (recomendada): pegar el fichero completo

En el editor de reglas de la consola: seleccionar todo → borrar → pegar el contenido
íntegro de **`firestore.rules`** (raíz del repositorio, `main@90110ef`, 4 083 líneas)
→ **Publicar**.

Por qué es la opción segura: el fichero es el que se ha probado contra los emuladores
oficiales en CI (91/103, 12 omitidas de la suite P3, ver §5). Un pegado completo no
admite erratas de transcripción; una edición a mano sí.

Al publicar, Firestore valida la sintaxis y rechaza el despliegue si hay un error:
si aparece un mensaje de compilación, **no se ha publicado nada** y el ruleset anterior
sigue vigente.

### Opción B: los 5 cambios exactos (si ya tienes la versión de `main@2563831`)

> Sustituye cada bloque **ANTES** por el **DESPUÉS**, respetando la indentación.
> Son los únicos cambios entre la versión anterior y la nueva.

#### Cambio 1 — `match /candidatos/`: se retira el alta anónima

ANTES:
```
      // Alta pública de captación (sin sesión, campos mínimos) y alta interna.
      allow create: if isStaff() || ('inmuebleId' in incoming() && ambitoPorInmuebleEscritura(incoming().inmuebleId)
        && propietarioCoherenteConInmueble(incoming())) || (
        incoming().keys().hasAll(['nombre', 'email', 'telefono', 'estado'])
        && incoming().nombre is string
        && incoming().nombre.size() > 0
        && !('propietarioId' in incoming())
      );
```

DESPUÉS:
```
      // P0.2.2 — SIN alta anónima. El candidato lo crea el SERVIDOR mediante
      // `POST /api/solicitud/:token` (Admin SDK, fuera de estas reglas) o el
      // personal interno / titular en su ámbito. La rama pública histórica
      // (`nombre/email/telefono`) queda RETIRADA: era escritura sin sesión,
      // sin antispam y sin validación de propietario.
      allow create: if isStaff() || ('inmuebleId' in incoming() && ambitoPorInmuebleEscritura(incoming().inmuebleId)
        && propietarioCoherenteConInmueble(incoming()) && isSignedIn());
```

#### Cambio 2 — `match /solicitudes/`: se retira el alta anónima

ANTES:
```
    // 4. SOLICITUDES DE ALQUILER (creación pública de captación)
    // =========================================================================
    match /solicitudes/{solicitudId} {
```
y más abajo:
```
      allow create: if incoming().keys().hasAll(['nombre', 'email', 'telefono', 'inmuebleId', 'estado'])
        && incoming().nombre is string
        && incoming().email is string;
```

DESPUÉS (cabecera):
```
    // 4. SOLICITUDES DE ALQUILER (alta pública por SERVIDOR, P0.2)
    // =========================================================================
    match /solicitudes/{solicitudId} {
```
y la regla:
```
      // P0.2.2 — SIN alta anónima de solicitudes. Solo personal interno o
      // titular/gestor autenticado en su ámbito; el alta pública la escribe el
      // SERVIDOR (`POST /api/solicitud/:token`) con token, honeypot y límite.
      allow create: if isStaff() || (isSignedIn() && 'inmuebleId' in incoming()
        && ambitoPorInmuebleEscritura(incoming().inmuebleId)
        && propietarioCoherenteConInmueble(incoming()));
```

#### Cambio 3 — `match /audit_logs/`: nadie firma una auditoría a nombre de otro

ANTES:
```
      allow create: if isSignedIn();
```

DESPUÉS:
```
      // P0.2.8 — sigue siendo append-only, pero un usuario YA NO puede
      // escribir un registro de auditoría atribuido a OTRO correo. Se admiten
      // los registros automáticos sin autor declarado (`usuarioEmail` ausente
      // o vacío) que genera el transporte de diagnóstico.
      allow create: if isSignedIn() && (
        isMasterAdmin()
        || !('usuarioEmail' in incoming())
        || incoming().usuarioEmail == ''
        || incoming().usuarioEmail == authEmail()
      );
```

#### Cambio 4 — `match /actas/`: la evidencia de firma solo la escribe el servidor

**4a.** Justo después de la función que termina en
`: incoming().version >= existing().version;` y su `}` de cierre, añade:

```
      // H-03 — La evidencia de firma sólo la escribe el SERVIDOR. El navegador
      // no puede cambiar `firmas`, `estadoFirma` ni `fechaFirma`, ni declarar un
      // acta FIRMADA (o CERRADA sin estar ya firmada): eso permitía fabricar una
      // firma sin OTP. El servidor de firma escribe con credencial de servicio y
      // no pasa por estas reglas.
      function evidenciaFirmaSoloServidor() {
        return incoming().firmas == existing().firmas
          && incoming().estadoFirma == existing().estadoFirma
          && (('fechaFirma' in incoming()) == ('fechaFirma' in existing()))
          && (!('fechaFirma' in existing()) || incoming().fechaFirma == existing().fechaFirma)
          && !(incoming().estado == 'FIRMADA' && existing().estado != 'FIRMADA')
          && !(incoming().estado == 'CERRADA' && !(existing().estado in ['FIRMADA', 'CERRADA']));
      }
      // H-03 — Tampoco se puede nacer con firmas ni con estado de firma cerrado.
      function altaSinEvidenciaDeFirma() {
        return 'firmas' in incoming()
          && incoming().firmas.size() == 0
          && (!('estadoFirma' in incoming()) || incoming().estadoFirma == 'PENDIENTE')
          && !('fechaFirma' in incoming());
      }
```

**4b.** En `allow create` del acta, tras `&& 'version' in incoming() && incoming().version >= 1`
añade una línea:
```
        && altaSinEvidenciaDeFirma()
```

**4c.** En `allow update` del acta, tras `&& estadoValido()` (el que va después de
`noModificacionSilenciosaFirmada()`) añade una línea:
```
        && evidenciaFirmaSoloServidor()
```

#### Cambio 5 — `match /actas_otp/`: el OTP es material del servidor

Reemplaza **todo** el bloque `match /actas_otp/{otpId} { … }` (que incluye las funciones
`otpEsMio`, `sinSecretoPlanoExcesivo` y los cinco `allow`) por:

```
    match /actas_otp/{otpId} {
      // H-07 — El OTP es material del SERVIDOR, no del navegador.
      // ===========================================================
      // Antes el cliente creaba el documento (con su hash), lo leía para mostrar
      // el estado, lo actualizaba al fallar y podía fijar `estado`/`usado`. Con
      // eso la "validación" era una decisión del propio interesado.
      // Ahora: generación, entrega, intentos y consumo ocurren en las rutas
      // /api/actas/otp/* con credencial de servicio (no pasan por reglas). El
      // navegador NO crea, NO modifica, NO borra y NO puede listar hashes; sólo
      // el master conserva lectura de diagnóstico.
      allow get, list: if isMasterAdmin();
      allow create, update, delete: if false;
    }
```

---

## 4. Índices compuestos (10)

Consola → **Firestore Database → Índices → Crear índice**.
Para los diez: **Ámbito de consulta = Colección** (no «Grupo de colecciones»).

| # | Colección | Campos (en orden) |
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

Notas:
- Es aditivo y **no rompe consultas**: los índices se construyen en segundo plano
  (estado *Creando* → *Habilitado*). No bloquea la publicación de reglas.
- Si la consola dice que el índice ya existe, no hay nada que hacer.
- La fuente de verdad es `firestore.indexes.json` (CI comprueba que ese fichero y el
  `firebase.json` que lo declara siguen ahí); el cuadro de arriba es su transcripción.

---

## 5. Pre-vuelo ejecutado (por qué es seguro publicar)

- **Emuladores oficiales (CI, run `40717780643`)**: 91/103 correctas, **12 omitidas**.
  Las 12 omitidas son exactamente la suite **P3** (`documentos-p3.emulador.test.ts`),
  aparcada por P3 superseded (conciliación/tesorería fuera de alcance). **Ningún caso
  de actas, OTP, solicitudes, candidatos ni audit_logs queda omitido**: todos se
  ejecutan contra las reglas reales del fichero.
- **Compatibilidad con el código desplegado (`main@90110ef`)**:
  - `solicitudes` / `candidatos`: la app **ya no escribe** desde el navegador
    (`App.tsx` no importa `guardarSolicitudPublicaFirestore` ni
    `guardarCandidatoPublicoFirestore`); el alta la hace el servidor. Las dos
    funciones siguen exportadas, pero sin llamadas.
  - `actas_otp`: ningún fichero de `src/` menciona la colección; el OTP vive en
    `server/actas/` con credencial de servicio.
  - `actas` (evidencia de firma): el único escritor de cliente es
    `saveActaFirestore`, y la UI impide pasar a `FIRMADA` a mano (solo
    `FIRMADA → CERRADA`). El motor de firma de cliente (`actaFirmaEngine`) **no
    tiene ninguna llamada** en `src/`.
  - `audit_logs`: al publicar, la regla exige que `usuarioEmail` sea el del usuario
    autenticado o vacío. Se corrigieron **7 puntos** que rellenaban el hueco con
    literales (`'sistema'`, `'admin@rentselect.es'`, `'propietario'`,
    `'desconocido'`, `'sindicacion@erp'`): con la regla nueva esos envíos se
    habrían denegado y la traza se habría perdido en silencio (son best-effort).
    Ahora se envía `''` y un test lo impide reintroducir.
- **Riesgo residual aceptado**: una pestaña abierta con el bundle *anterior* al
  despliegue todavía intentaría el alta anónima; esas escrituras fallarán con
  `permission-denied` hasta recargar. Se resuelve solo con un F5.

---

## 6. Verificación después de publicar

En la consola, pestaña **Reglas → simulador** (o `Rules Playground`), con el ruleset
ya publicado:

| Caso | Ruta | Operación | Autenticación | Datos | Esperado |
|---|---|---|---|---|---|
| 1 | `solicitudes/prueba` | create | sin sesión | `{nombre:'x', email:'a@b.c', telefono:'1', inmuebleId:'inm_1', estado:'NUEVA'}` | **Denegar** |
| 2 | `candidatos/prueba` | create | sin sesión | `{nombre:'x', email:'a@b.c', telefono:'1', estado:'NUEVO'}` | **Denegar** |
| 3 | `actas_otp/prueba` | create | cualquier usuario | `{}` | **Denegar** |
| 4 | `actas_otp/prueba` | get | usuario no master | — | **Denegar** |
| 5 | `audit_logs/prueba` | create | `a@b.c` | `{usuarioEmail:'otro@b.c'}` | **Denegar** |
| 6 | `audit_logs/prueba` | create | `a@b.c` | `{usuarioEmail:'a@b.c'}` | **Permitir** |

Y en la app desplegada, un humo **sin escribir datos**:
`GET /api/health` debe responder 200 con `esquemaDiagnostico: 1`.

Cuando esté publicado, dímelo y cierro el punto en el registro con:
versión publicada (la consola la muestra), casos 1-6 verificados y estado de los 10 índices.

---

## 7. Rollback (si algo se rompe)

1. Reglas → pestaña de **historial de versiones** de la consola → seleccionar la versión
   anterior → **Restaurar/Publicar**. O pegar el fichero guardado en §2.1 y publicar.
2. Los índices no necesitan rollback: son aditivos y no cambian permisos. Si alguno
   sobra, se borra sin afectar a las consultas que no lo usan.
3. Aviso: al revertir las reglas vuelven a quedar abiertas las escrituras anónimas de
   `solicitudes`, `candidatos` y `actas_otp`. Es un cambio de seguridad, no de
   funcionamiento: revierte solo si has detectado un fallo real en los permisos
   legítimos, no por comodidad.

---

## 8. Lo que NO hay que tocar

- `storage.rules`: **sin cambios** respecto a lo publicado (`sha256 631d45ac…34e93b9`).
  No lo publiques «por si acaso»: no hay ninguna modificación que desplegar.
- `firebase.json`: solo cambia para el CLI (declara `indexes`). No afecta al proyecto.
- No crees índices de un solo campo ni «exenciones» (`fieldOverrides`): el fichero no
  declara ninguna.
