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

### 1.2 Lo que falta en código (cliente) — P-08

El cliente lee `firebase-applet-config.json` **versionado en el repositorio**
(`src/lib/firebase.ts`, `src/lib/entornoFirebase.ts`, `src/lib/googleAuth.ts`).
Un despliegue de staging necesita hablar con **otro** proyecto, y no hay forma de
cambiar ese fichero por entorno en Vercel.

Diseño propuesto (no implementado, para no refactorizar el arranque de auth y
storage al final de una sesión larga sin necesidad):

- `VITE_ENTORNO_FIREBASE=staging` + `VITE_FIREBASE_PROJECT_ID`,
  `VITE_FIREBASE_FIRESTORE_DATABASE_ID`, `VITE_FIREBASE_API_KEY`,
  `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_APP_ID`.
- Sin `VITE_ENTORNO_FIREBASE=staging`, el JSON versionado manda **y las variables
  se ignoran**: así nadie puede cambiar el destino de producción desde el panel
  de Vercel por error.
- Un solo módulo (`src/lib/destinoFirebase.ts`) que resuelva el objeto de
  configuración y valide la coherencia, importado por los tres ficheros.

Hasta que P-08 exista, el staging es **operativo en servidor y no en cliente**:
se puede desplegar y verificar `/api/*`, pero la interfaz seguiría apuntando a
producción. Por eso no se marca H-17 como cerrado.

### 1.3 Runbook: crear el staging (requiere tu cuenta de Google)

Pasos concretos, en este orden. **Nada de esto toca producción.**

1. **Proyecto nuevo** en <https://console.cloud.google.com/projectcreate>:
   - Nombre: `gestor-inmuebles-staging`
   - ID: `gestor-inmuebles-staging` (si está cogido, `gestor-inmuebles-staging-2`
     y entonces hay que actualizar `PROYECTO_STAGING` en el código **y** el test
     que fija la lista).
2. **Firestore** en ese proyecto: «Crear base de datos» → **modo nativo** →
   **base con nombre** (no `(default)`), misma forma de ID que producción:
   `ai-studio-staging-<algo>`. Anótalo: va en la configuración del cliente.
3. **Reglas e índices**: los mismos ficheros del repositorio.
   ```bash
   npx firebase-tools@15.33.0 deploy --only firestore:rules,firestore:indexes --project gestor-inmuebles-staging
   ```
   Ojo: `--project` acepta el **ID del proyecto**, no el alias `produccion` de
   `.firebaserc`.
4. **Cuenta de servicio** en ese proyecto (IAM → Cuentas de servicio → crear, rol
   «Cloud Datastore User»), descargar el JSON.
5. **Vercel**: proyecto duplicado, rama `staging`, y variables:
   `ENTORNO_DESPLIEGUE=staging`, `FIREBASE_SERVICE_ACCOUNT=<JSON>`, y las
   `VITE_*` de §1.2 cuando exista P-08.
6. **Verificar el propio despliegue** (no fiarse de que «está desplegado»):
   ```bash
   node scripts/verificar-produccion.mjs --url https://<staging>.vercel.app --json
   ```
   Debe dar salud 200 con `esquemaDiagnostico: 1`, y los tres rechazos (410, 401,
   413).
7. **Evidencia a guardar**: captura de la lista de índices del proyecto de staging
   (como P-01) y la salida del paso 6.

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
| Cliente con destino por entorno (P-08) | 🟡 Pendiente — diseño escrito en §1.2 |
| Proyecto de staging creado | 🟡 Pendiente — requiere la cuenta de Google del titular |
| Runbook de staging | ✅ §1.3 |
| Pre-dictamen técnico fiscal | ✅ Ya existía |
| Carta al asesor | ✅ §2.3, lista para enviar |
| Dictamen firmado | 🟡 Pendiente — externo |

**H-17 no se puede cerrar desde el repositorio.** Se cierra el día que exista un
proyecto de staging verificado y una firma. Lo que sí se ha hecho es quitar la
excusa técnica: antes ni siquiera era posible intentarlo.
