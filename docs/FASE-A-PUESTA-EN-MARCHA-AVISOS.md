# FASE A · PUESTA EN MARCHA DE LOS AVISOS REALES (Vercel + Gmail)

> **Para qué es este documento.** La Fase A ya está en el código: el endpoint de
> notificaciones verifica la identidad, el canal de correo distingue
> **envío real** de **modo seguro** (prohibido fingir), hay un **reloj diario**
> protegido y una **bandeja interna** con el estado real de entrega. Falta
> enchufar las credenciales en Vercel y comprobarlo. Son **cuatro variables de
> entorno y un despliegue**; el cron ya está declarado en `vercel.json`.
>
> **Nada de este documento se ha ejecutado**: no se ha configurado ningún
> secreto, no se ha desplegado y no se ha enviado ningún correo.

---

## 0. Camino corto · lo que tienes que hacer tú (unos 15 minutos)

> Si solo vas a leer una parte del documento, lee esta. El resto es referencia y
> solución de problemas.

**Paso 1 · Consigue la contraseña de aplicación de Gmail** (de la cuenta que
enviará los avisos; Gmail la exige para que un programa pueda enviar correo):

1. Activa la **verificación en dos pasos** de esa cuenta (si aún no lo está):
   <https://myaccount.google.com/security>.
2. Entra en <https://myaccount.google.com/apppasswords>.
3. Escribe un nombre, por ejemplo «Gestor de inmuebles», y pulsa **Crear**.
4. Google muestra 16 letras en 4 grupos (`abcd efgh ijkl mnop`). Cópialas y
   **quítales los espacios**: `abcdefghijklmnop`.

**Paso 2 · Pega 4 valores en Vercel** (es donde está publicada la app):

1. Entra en <https://vercel.com> y abre el proyecto de la app (el del dominio con
   el que entras al ERP; si dudas, mira la pestaña **Domains**).
2. **Settings** → **Environment Variables** → **Add New** (una por una). Deja
   marcado **Production** (y **Preview** si quieres).

| Key (nombre) | Value (valor) | Ejemplo (cuenta `alquileres@gmail.com`, clave `abcdefghijklmnop`) |
|---|---|---|
| `EMAIL_PROVEEDOR` | `SMTP` | `SMTP` |
| `SMTP_URL` | `smtps://CUENTA%40gmail.com:CLAVE@smtp.gmail.com:465` | `smtps://alquileres%40gmail.com:abcdefghijklmnop@smtp.gmail.com:465` |
| `EMAIL_FROM` | `Gestor de Inmuebles <CUENTA@gmail.com>` | `Gestor de Inmuebles <alquileres@gmail.com>` |
| `CRON_SECRET` | una frase larga al azar, sin espacios (unos 40 caracteres) | `V7kP2mQ9xL4tR8wZ3nB6yH1sD5fG0jC` (inventa la tuya y **apúntala**) |

> Los dos fallos más fáciles: en `SMTP_URL` la `@` del correo se escribe
> **`%40`**, y la clave de aplicación va **sin espacios**.

**Paso 3 · Republica.** **Deployments** → en el último despliegue, menú **⋯** →
**Redeploy**. Las variables no entran en vigor hasta que se republica.

**Paso 4 · Comprueba (2 minutos).**

1. Abre `https://TU-DOMINIO/api/health` (el dominio con el que entras al ERP).
   Debe aparecer `"email":{"modo":"REAL","proveedor":"SMTP"}` y
   `"cron":{"configurado":true}`.
2. Abre `https://TU-DOMINIO/api/cron/avisos?secret=TU_CRON_SECRET` — debe
   responder `{"ok":true,...}` con el resumen. Ejecuta el reloj a mano; es
   idempotente: repetirlo no duplica avisos.
3. Abre el ERP → **Bandeja de avisos**: cada aviso aparece como «Enviada» o «No
   entregada» con el motivo, para no dar nada por enviado sin serlo.

Con esos cuatro pasos, la Fase A queda cerrada salvo la prueba con un contrato
real (un recibo vencido ⇒ dos correos: inquilino y propietario).

---

## 1. Qué se configura (resumen)

| Variable | Para qué | Ejemplo |
|---|---|---|
| `EMAIL_PROVEEDOR` | Elige el transporte del canal EMAIL: `SMTP` (Gmail u otro servidor) o `RESEND` / `SENDGRID` (API) | `SMTP` |
| `SMTP_URL` | Conexión SMTP **con** usuario y contraseña de aplicación | `smtps://despacho%40gmail.com:CLAVE_DE_APLICACION@smtp.gmail.com:465` |
| `EMAIL_FROM` | Remitente visible de los avisos (debe ser la cuenta autenticada o un alias suyo) | `Gestor de Inmuebles <despacho@gmail.com>` |
| `EMAIL_DESPACHO_NOMBRE` *(opcional)* | Nombre que firma los textos («Le escribimos desde …») | `Gestor de Inmuebles` |
| `EMAIL_REPLY_TO` *(opcional)* | Buzón al que responden los avisos que no van a un propietario | `despacho@gmail.com` |
| `CRON_SECRET` | Protege el reloj diario (`GET /api/cron/avisos`). Sin él, el reloj responde 503 y **no ejecuta nada** | 64 caracteres aleatorios |

El **cron** ya está declarado en `vercel.json` (`/api/cron/avisos`, `0 6 * * *`).
No hay que crearlo a mano.

---

## 2. ¿Hace falta sincronizar el Gmail del propietario? **No**

- **Para recibir** los avisos no hace falta sincronizar nada: la app envía a la
  dirección de correo que ya consta en la ficha del propietario (y a la del
  inquilino, que sale del contrato).
- **Para enviar**, la app usa **un único buzón de la plataforma** (el que se
  configure en `SMTP_URL`). Es lo estándar y lo que permite que los avisos
  salgan aunque nadie esté conectado (el reloj corre en el servidor).

### Si no quieres usar tu Gmail personal: crea un buzón para el ERP

No hace falta más código ni trámites largos. La recomendación es **crear una
cuenta de Gmail dedicada** (por ejemplo `avisos.tudespacho@gmail.com`), activarle
la verificación en dos pasos y generar su contraseña de aplicación. Esa cuenta
es la que se pone en `SMTP_URL` y `EMAIL_FROM`:

- tu correo personal **nunca** aparece como remitente ni recibe respuestas por
  error (los avisos al inquilino llevan al propietario como respuesta);
- si algún día hay que cortar los envíos, se revoca esa contraseña y se acabó,
  sin tocar tu cuenta;
- el nombre que firma los textos se elige a mano (`EMAIL_DESPACHO_NOMBRE`), así
  que puede decir «Gestión de Alquileres · [tu nombre]» sin exponer tu correo.

### ¿Y enviar «desde» el Gmail del propietario? No es posible (ni falta que hace)

Se pidió que los avisos al inquilino **no salgan de la cuenta personal del
despacho** y que el inquilino identifique siempre el inmueble y al propietario.
Lo segundo ya está hecho; lo primero, tal cual, **no es técnicamente posible**:

- Gmail **exige que el remitente (`De`) sea la cuenta autenticada** o un alias
  autorizado dentro de ella. Para que un aviso saliera «desde» el buzón del
  propietario, el sistema necesitaría **su contraseña de aplicación** (o una
  delegación OAuth que Google solo concede a proveedores verificados): custodiar
  las claves de decenas de propietarios es un riesgo inaceptable y ni siquiera
  es lo que hace el software profesional.
- Lo que sí se hace, y es el uso estándar del sector: el aviso sale del **buzón
  único del despacho** y el inquilino **responde al propietario** con un clic
  (cabecera *Reply-To*). Además, el texto identifica inmueble, contrato y
  propietario, para que el inquilino lo relacione y **responda directamente al
  propietario** sin depender de terceros.
- Si el propietario prefiere que su dirección aparezca en el mensaje (para que
  el inquilino lo reconozca a primera vista), se puede añadir un **alias en
  Gmail** («Enviar como») y usarlo en `EMAIL_FROM`, pero eso ya es una decisión
  de configuración de correo, no del ERP.

### Lo que ve el inquilino en el mensaje

- **Asunto**: `Recibo de alquiler pendiente — Calle Prueba 1 (2026-03)`.
- **Cuerpo** (resumen): quién escribe (nombre del despacho), inmueble con
  dirección y localidad, propietario, mes e importe pendiente, vencimiento,
  **referencia del contrato** y aviso de que es un mensaje automático que nunca
  pide claves ni pagos por enlace.
- **Nada sensible**: no se incluye DNI, IBAN, teléfono ni referencia catastral
  de nadie (lo verifica una prueba automática).
- **Responder**: la respuesta del inquilino va al **propietario**; la del
  propietario, al buzón del despacho.
- En la app, la sección **Bandeja de avisos** muestra el mismo texto con
  «Ver mensaje», para que el despacho sepa exactamente qué se envió.

### Sincronizar el Gmail de cada propietario sería otra cosa muy distinta:
  obligaría a que cada uno autorizara su cuenta (OAuth), a custodiar sus tokens
  en el servidor y a pasar la verificación de Google para *scopes* sensibles de
  Gmail. **No se recomienda** en esta fase: multiplica trámites y riesgos sin
  mejorar el aviso. Lo que ya existe en la app es el envío **desde el
  navegador** con la sesión del usuario (lo usa el módulo de seguro de impago);
  ese token dura 1 hora y no sirve para el reloj diario.

---

## 3. Paso a paso

### 3.1 · Crear la contraseña de aplicación de Gmail (5 minutos)

Requisitos de Google (no se inventan aquí):

1. La cuenta debe tener **verificación en dos pasos** activada.
2. Entra en <https://myaccount.google.com/apppasswords> (con esa cuenta).
3. Crea una contraseña de aplicación (por ejemplo, nombre «Gestor de inmuebles»).
4. Google muestra **16 caracteres** en cuatro grupos; al pegarlos en la URL,
   **quita los espacios**.

**URL resultante (forma recomendada, con la `@` codificada como `%40`):**

```
smtps://despacho%40gmail.com:CLAVE_SIN_ESPACIOS@smtp.gmail.com:465
```

> Requisitos de Gmail para el remitente: `EMAIL_FROM` debe ser **esa misma
> cuenta** (o un alias autorizado dentro de ella). Gmail rechaza enviar como una
> dirección ajena. Límite aproximado de una cuenta personal: **~500
> destinatarios/día**, de sobra para avisos de alquiler.

### 3.2 · Añadir las variables en Vercel

**Opción A — panel web:** Proyecto → **Settings** → **Environment Variables** →
añade las cuatro variables (marca *Production* y, si quieres, *Preview*).

**Opción B — CLI** (desde el repositorio, con `vercel login` hecho):

```bash
vercel env add EMAIL_PROVEEDOR production     # SMTP
vercel env add SMTP_URL production            # smtps://despacho%40gmail.com:CLAVE@smtp.gmail.com:465
vercel env add EMAIL_FROM production          # Gestor de Inmuebles <despacho@gmail.com>
vercel env add CRON_SECRET production         # p.ej. salida de: openssl rand -hex 32
```

> **Nunca** cambies las credenciales en Firestore ni en el código: solo viven en
> el entorno del servidor. Si algún día se filtra la contraseña de aplicación,
> se revoca desde la misma página de Google y listo.

### 3.3 · Desplegar

Las variables nuevas se aplican en el siguiente despliegue: `git push` a la rama
de producción o **Redeploy** del último despliegue desde el panel.

### 3.4 · Comprobar que quedó bien

1. **Estado del transporte** (sin secretos):

   ```bash
   curl -s https://TU-DOMINIO/api/health
   ```

   Debe devolver `"notificaciones":{"email":{"modo":"REAL","proveedor":"SMTP"},"cron":{"configurado":true}}`.
   Si dice `"modo":"MODO_SEGURO"`, faltan variables; el sistema **nunca** dirá
   que envió si no envió.

2. **Probar el reloj a mano** (idempotente: repetirlo el mismo día no duplica
   avisos ni reenvía correos):

   ```bash
   curl -s -H "Authorization: Bearer $CRON_SECRET" https://TU-DOMINIO/api/cron/avisos
   ```

   Respuesta esperada: `ok: true` con el resumen — `fecha`, `origen`,
   `pendientesProcesadas`, `pendientesEntregadas`, `pendientesFallidas`,
   `contratosRevisados`, `consultaTruncada`, el detalle en `emitidos` (con
   `entregada`/`duplicada`) y `noEmitidos` (con el motivo), más `errores` y los
   recuentos `entregadas` / `duplicadas` / `fallidas`. Controles: `401` si el
   secreto no es correcto; `503` con `error: "cron_no_configurado"` si falta
   `CRON_SECRET` y `503` con `error: "reloj_no_disponible"` si falta la
   credencial de servicio de Firestore — en ambos casos **no se ejecuta nada**.

3. **Comprobar en la app**: sección **Bandeja de avisos**. Cada aviso muestra su
   estado real (Enviada / Pendiente / No entregada con la causa) y, si salió,
   proveedor e id externo.

### 3.5 · Horario del cron

`0 6 * * *` = **6:00 UTC**, que en Madrid son las **08:00** en horario de verano
y las **07:00** en invierno. Si quieres otra hora, se cambia en `vercel.json` y
se vuelve a desplegar. (En el plan gratuito de Vercel, los cron diarios están
permitidos; el reloj procesa hasta 100 contratos por pasada y marca
`consultaTruncada` si se alcanza el tope.)

---

## 4. Solución de problemas

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| `modo: "MODO_SEGURO"` en `/api/health` | Falta `EMAIL_PROVEEDOR`, `SMTP_URL` o `EMAIL_FROM` (o el despliegue es anterior a las variables) | Añadir/repasar variables y **redesplegar** |
| `503 cron_no_configurado` | Falta `CRON_SECRET` | Añadirlo y redesplegar (es deliberado: sin secreto, el reloj no corre) |
| `401 no_autorizado` al probar el cron | Secreto distinto o cabecera mal formada | Usar `-H "Authorization: Bearer $CRON_SECRET"` exacto |
| Avisos en la bandeja con estado **No entregada** y error `smtp_error: Invalid login` | Contraseña de aplicación mal copiada (con espacios), 2FA desactivada o usuario sin codificar | Regenerar la contraseña, pegarla **sin espacios**, usar `%40` en la URL |
| Error `smtp_error` con `531`/`553` | `EMAIL_FROM` no es la cuenta autenticada ni un alias suyo | Poner la misma cuenta (o crear el alias en Gmail) |
| `noEmitidos: sin_email_contacto` | El inmueble/contrato no tiene email de inquilino o propietario | Completar el dato en la ficha (el reloj **no** inventa destinatarios) |
| Nada llega el día esperado | El recibo no está vencido o ya consta cobrado | El aviso del día 5 salta **después** del vencimiento y solo con saldo pendiente |

---

## 5. Qué queda pendiente para cerrar formalmente la Fase A

1. Configurar las variables y desplegar (este documento).
2. **Prueba con datos de prueba**: un contrato de prueba con un recibo vencido →
   ejecutar el cron → comprobar dos correos (inquilino y propietario) y su
   registro en la bandeja.
3. Anotar la evidencia (fecha, dominio, resultado) en el mapa maestro (§8).

El resto de la Fase A (verificador, transporte, reloj y bandeja) ya está
implementado y con pruebas automáticas en verde.
