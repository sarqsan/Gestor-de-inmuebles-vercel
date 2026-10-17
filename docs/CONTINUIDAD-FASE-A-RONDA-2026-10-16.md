# PUNTO DE RETORNO · Fase A de avisos reales (ronda 16-10-2026)

> **Para qué es este documento.** Mañana (o cuando haga falta) se retoma desde
> aquí sin depender de ninguna conversación: qué está hecho, qué falta, quién
> hace cada cosa y cómo comprobarlo. La guía operativa paso a paso es
> `docs/FASE-A-PUESTA-EN-MARCHA-AVISOS.md`; este documento es el parte de estado.

---

## 1. Dónde estamos

| Campo | Valor |
|---|---|
| Rama de sesión | `arena/7eef00ef-gestor-de-inmuebles-vercel` |
| HEAD publicado | `ffd047a` (último push verificado) — commits de la ronda: `cf5fcf7` · `d86f451` · `f808831` · `3eb23ce` · `27c5a17` · `ffd047a` |
| Base sobre `main` | `ad113d7` (PR #39 ya integrada); `main` **no** se ha tocado en esta ronda |
| Estado | Worktree CLEAN · suite completa **232/232 ficheros (4.270 pruebas)** · `tsc` 0 errores · `build` OK · guardia A-04 **OK** |
| Documentos de la ronda | `docs/FASE-A-PUESTA-EN-MARCHA-AVISOS.md` (guía de puesta en marcha) · mapa maestro §8.8 y §8.9 |

---

## 2. Lo que ya está hecho y probado (no hay que repetirlo)

1. **Transporte de correo real con Gmail por SMTP**: `EMAIL_PROVEEDOR=SMTP` +
   `SMTP_URL` + `EMAIL_FROM` ⇒ modo **REAL**; si falta algo ⇒ **MODO_SEGURO**, que
   nunca dice «enviado» (prohibido el falso acuse).
2. **El aviso identifica el inmueble y al propietario**: asunto y texto con
   dirección y localidad, propietario, mes, importe, vencimiento y referencia
   del contrato. **Sin datos sensibles** (nada de DNI, IBAN, teléfonos ni
   referencia catastral): lo verifica una prueba automática.
3. **Respuestas dirigidas**: el inquilino responde **al propietario** y el
   propietario al despacho (cabecera *Reply-To*; `EMAIL_REPLY_TO`). El remitente
   sigue siendo el buzón único del despacho, porque Gmail exige que el `De` sea
   la cuenta autenticada.
4. **Arreglo de un fallo real**: el cuerpo del correo se renderizaba y se
   descartaba (se habría enviado la clave de la plantilla como mensaje). Ahora
   se guarda y se envía el texto renderizado; el canal falla en claro si falta.
5. **Bandeja de avisos** con estado real de entrega y «Ver mensaje» (el mismo
   texto que salió por correo).
6. **Reloj diario protegido** (`GET /api/cron/avisos`, `CRON_SECRET`, fallo
   cerrado, idempotente) y declarado en `vercel.json` (`0 6 * * *`).

---

## 3. Lo que falta, y **quién** lo hace

### 3.1 · Tú (el responsable): configuración en Vercel y Gmail — ~15 minutos

Sigue **`docs/FASE-A-PUESTA-EN-MARCHA-AVISOS.md` §0** (camino corto) o §3:

1. Crear el buzón dedicado del ERP (recomendado) o usar uno existente:
   verificación en dos pasos + **contraseña de aplicación** de Gmail.
2. En Vercel (Settings → Environment Variables, *Production*):
   `EMAIL_PROVEEDOR=SMTP`, `SMTP_URL`, `EMAIL_FROM` y `CRON_SECRET`, más
   `EMAIL_DESPACHO_NOMBRE` y `EMAIL_REPLY_TO` si se quieren (opcionales).
3. **Redeploy** (las variables no entran en vigor hasta republicar).
4. Comprobar: `/api/health` con `"modo":"REAL"` y `"cron":{"configurado":true}`
   y una llamada de prueba al reloj con `?secret=TU_CRON_SECRET`.

> Yo no tengo acceso a tu Vercel ni a tu Gmail, y nunca te pediré credenciales.
> Si algo falla, con pegar aquí lo que devuelva `/api/health` o el error que
> muestre la bandeja basta para diagnosticarlo (hay tabla de problemas en §4 de
> la guía).

### 3.2 · Prueba final (juntos): cerrar la puerta de salida F0

1. Crear un **contrato de prueba** con un recibo **vencido y sin cobrar**.
2. Ejecutar el reloj a mano (`/api/cron/avisos?secret=…`).
3. Comprobar: **dos correos** (inquilino y propietario), respuesta del inquilino
   dirigida al propietario, y ambos avisos en la **Bandeja de avisos** con su
   acuse real.
4. Anotar la evidencia (fecha, dominio, resultado) en el mapa maestro §8.

Con eso la **Fase A queda cerrada oficialmente**.

---

## 4. Decisiones ya tomadas en esta ronda (no volver a preguntar)

| Tema | Decisión |
|---|---|
| Vía de correo | **Gmail por SMTP con contraseña de aplicación** (buzón dedicado del ERP; Resend/SendGrid quedan como alternativas documentadas) |
| ¿Sincronizar el Gmail del propietario? | **No**: solo es destinatario. El envío sale del buzón único y las respuestas se dirigen con *Reply-To* |
| Avisos del día 5 | **Solo correo + bandeja**, sin aviso preventivo previo (el responsable lo considera precipitado) |
| Verificación del justificante (Fase B) | La hará **el propietario** |
| Conexión bancaria | **Nivel 1** (categorización y avisos sobre los extractos que ya se importan, 0 €) registrada para hacerla cuando corresponda; el agregador PSD2 sigue descartado |
| SEPA y WhatsApp | **Descartados** |

---

## 5. Lo siguiente, cuando la Fase A esté verificada

- **Fase B** — justificante del inquilino: aportación en su portal, IA que
  propone importe/fecha/ordenante (el humano confirma), **verificación por el
  propietario** y la escritura canónica del cobro sigue siendo
  `registrarPagoPeriodo`. Detalle en `docs/PLAN-CAPACIDADES-DECISIONES-2026-10-16.md` §5–§6.
- Después: **Fase D** (escáner de facturas → gasto) y **Fase F** (actualización
  de renta con el índice oficial y aviso 30 días antes). La capa de banco Nivel 1
  entra tras B y D.
- Pendiente administrativo ya registrado: **PR #40** (Fase IA 9 integrada en
  `main`, de otra sesión) sigue **abierta**; no es de esta rama.

---

## 6. Si el repositorio aparece «reiniciado» (incidencia de custodia)

Ya ocurrió una vez en esta ronda (mapa §8.9). Síntoma: la rama de sesión apunta
al commit base, `origin/arena/…` ausente y la guardia A-04 en WARNING
(`origin-ausente`). **No se pierde nada**: el trabajo está en el remoto y en el
árbol de trabajo. Recuperación (nada destructivo):

```bash
git fetch origin arena/7eef00ef-gestor-de-inmuebles-vercel
git update-ref refs/heads/arena/7eef00ef-gestor-de-inmuebles-vercel FETCH_HEAD
git reset -q HEAD                 # resincroniza el índice SIN tocar el árbol
npx tsx scripts/guardia-a04-repositorio.mts    # debe decir «A-04: OK»
```

Nunca `reset --hard`, `clean -fd` ni borrados: hay trabajo sin commitear en el
árbol con frecuencia.
