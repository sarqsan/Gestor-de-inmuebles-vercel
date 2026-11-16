# AG-08 · Orden de cierre — BLOQUEO DE EJECUCIÓN

**Fecha:** 2026-11-16
**Rama:** `arena/64778317-gestor-de-inmuebles-vercel`
**Punto de partida:** `main` @ `c498f7526512c596760dfcc18977d25b675c5166`
**Estado:** **NO EJECUTADO — bloqueado por falta de credenciales. Se requiere acción del usuario.**

---

## 1. Resumen

La orden pide trabajar **directamente contra el proyecto Firebase de PRODUCCIÓN**
(`gestor-inmuebles-produccion`): inventario real, respaldo real, `--aplicar` real y
verificación posterior.

**Ese acceso no es posible desde este entorno.** Este documento lo acredita y detalla
exactamente qué falta y cómo desbloquearlo. **No se ha realizado ninguna lectura ni
escritura contra Firestore real, y no se ha ejecutado `--aplicar`.**

> Datos verificados de partida: `main` = `c498f75`, que contiene las PR #91 y #92
> fusionadas y el código de preparación desplegado en producción (`deployment 7836112394`).

---

## 2. Comprobaciones de disponibilidad (todas ejecutadas)

| # | Requisito para la orden | Comprobación | Resultado |
|---|---|---|---|
| 1 | Service account de GCP | Búsqueda en el repo y en rutas habituales (`serviceAccount.json`, `sa.json`, `gcp-sa.json`, `*.pem`) | **No existe ninguna** |
| 2 | Credenciales en el entorno | Variables `GOOGLE_*`, `FIREBASE_*`, `GCP_*`, `GCLOUD*` | **Ninguna definida** |
| 3 | Credenciales en el home | `~/.config/gcloud`, `~/.config/firebase`, `~/.netrc`, `/secrets`, `/run/secrets` | **Ninguna existe** |
| 4 | Service account adjunta a la máquina | Metadatos GCE (`metadata.google.internal`) | **No disponible** |
| 5 | SDK necesario | `firebase-admin` declarado / instalado | **No declarado y no instalado** |
| 6 | CLI de Google Cloud / Firebase | `gcloud`, `firebase` | **Ninguno instalado** |
| 7 | Secretos de CI con credenciales | Workflows de `.github/workflows/` | **Ningún workflow usa credenciales de GCP/Firebase** |
| 8 | `.env` con credenciales | Solo existe `.env.example` | **Sin secretos** |
| 9 | Conectividad de red a GCP | Puertos 443 a `firestore.googleapis.com`, `identitytoolkit.googleapis.com`, `accounts.google.com`, `storage.googleapis.com` | **Alcanzables** |

**Conclusión:** la red funciona, pero **no hay ninguna identidad con la que
autenticarse**. Sin credenciales, Firestore rechaza toda lectura y escritura.

---

## 3. Por qué no se ha improvisado una vía alternativa

Se evaluaron y **descartaron deliberadamente** estas alternativas:

| Alternativa | Por qué se descarta |
|---|---|
| **Usar la cuenta del Administrador Principal** (`sarqsan2@gmail.com`) | Requeriría su **contraseña**, que no tenemos ni debemos tener. Además `isMasterAdmin()` es una comprobación de **email dentro del token ya autenticado**: no permite *obtener* sesión, solo reconocerla. |
| **Usar la API key pública** de `firebase-applet-config.json` | Por diseño no autentica a un usuario ni autoriza escrituras de administración. Usarla para intentar saltarse las reglas sería justo lo que AG-08 ha estado previniendo. |
| **Añadir un service account al repositorio o a CI** | Prohibido por las reglas permanentes (sin credenciales en el repo) y por esta misma orden (no introducir dependencias/artefactos no autorizados). |
| **Modificar temporalmente `firestore.rules`** para permitir lectura | Prohibido expresamente y **debilitaría la seguridad**; además las reglas tampoco dan acceso de *list* sin sesión. |
| **Instalar `firebase-admin`** | Declarado como prohibido en esta orden. |

Cualquiera de estas vías habría supuesto una violación de las restricciones para
poder apuntar un número. **No se ha hecho nada de eso.**

---

## 4. Consecuencias sobre la orden

Las fases 1 (inventario), 2 (respaldo), 4 (eliminación), 5 (verificación posterior)
y 6 (revisión de reglas) **no pueden ejecutarse**: todas requieren acceso de lectura
o escritura a Firestore de producción.

Por tanto, y según el propio criterio de la orden («**Si el respaldo no es
verificable, DETENTE**»), el procedimiento **se detiene antes de cualquier acción**.

**Lo que NO se ha hecho** (confirmación expresa):

- ❌ Ninguna conexión a Firestore de producción.
- ❌ Ninguna lectura de documentos reales.
- ❌ Ninguna escritura.
- ❌ `migrar-passwordhash.mjs --aplicar` **no ejecutado**.
- ❌ Ningún campo `passwordHash` eliminado.
- ❌ `firestore.rules` y `storage.rules` **intactos**.
- ❌ Ninguna cuenta, contraseña o credencial alterada.
- ❌ Ninguna dependencia instalada o añadida.
- ❌ Sin PR nueva, sin ramas acumuladas, sin fusiones ni despliegues.

---

## 5. Qué hace falta para desbloquear

Se requiere **una** de estas dos cosas, decidida por el usuario:

### Opción A — Service account con permisos mínimos (recomendada)

1. Crear en GCP un service account en `gestor-inmuebles-produccion` con el rol
   **`roles/datastore.user`** (mínimo para leer y actualizar documentos de Firestore).
   No conceder `roles/owner` ni permisos de Auth.
2. Descargar su clave JSON y proporcionarla al entorno como **secreto**, nunca en el
   repositorio (p. ej. variable `GOOGLE_APPLICATION_CREDENTIALS` apuntando a una ruta
   fuera del árbol de trabajo).
3. Autorizar explícitamente la instalación de `firebase-admin` (la orden actual la
   prohíbe; sería necesaria solo para ejecutar el script).

Con eso, el flujo sería: **inventario → respaldo → informe → PARADA para tu
autorización → `--aplicar` → verificación**.

### Opción B — Ejecutar tú el procedimiento

El código ya está desplegado y probado. Puedes lanzarlo desde una máquina con
credenciales siguiendo `docs/ag08/INFORME-AG08.md` §12.2–12.4:

```bash
# 1) Respaldo (vuelta atrás real)
gcloud firestore export gs://<bucket-privado>/ag08-pre --collection-ids=usuarios

# 2) Dry-run: inventario y recuento, SIN escribir
node scripts/ag08/migrar-passwordhash.mjs --proyecto gestor-inmuebles-produccion \
     --credencial <sa.json> --respaldo <id-export> --salida <dir>

# 3) PARADA. Enviar el recuento para autorizar.

# 4) Aplicar (solo tras autorización)
node scripts/ag08/migrar-passwordhash.mjs --aplicar \
     --proyecto gestor-inmuebles-produccion --credencial <sa.json> \
     --respaldo <id-export> --manifiesto-respaldo <dir>/respaldo-ag08-*.json \
     --salida <dir>
```

> **Aviso:** las guardas del script **bloquean producción por diseño** (§12.6 del
> informe; lista negra inmutable + lista blanca `AG08_PROYECTOS_PRUEBA`). Para una
> ejecución real contra producción habría que **modificar esa guarda de forma
> explícita y revisada**, y esa modificación es precisamente el control que impide
> un accidente. Debe hacerse con autorización expresa y en un commit revisado, no
> desactivándola sobre la marcha.

---

## 6. Dictamen

**NO EJECUTADO — bloqueado por ausencia de credenciales.**

No es un fallo del procedimiento: es una carencia de acceso del entorno, y detenerse
era la conducta correcta. Ejecutar de otro modo habría exigido violar las
restricciones de esta misma orden.

**AG-08 permanece en el estado ya desplegado:** código sin `passwordHash` en
producción, campo inmovilizado por regla en los documentos antiguos, y el
procedimiento de limpieza listo y verificado (45 pruebas + 39 comprobaciones
end-to-end) a la espera de acceso.
