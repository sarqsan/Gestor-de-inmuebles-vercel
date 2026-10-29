# H-17 — Dictamen fiscal (y la decisión de NO tener entorno de pruebas)

> **El nombre del fichero es histórico.** Se llamaba «Staging y dictamen fiscal»
> porque se escribió cuando se creía que hacía falta un entorno de pruebas. Ya no:
> **no hay ni habrá entorno de pruebas**. El fichero conserva su nombre porque
> renombrarlo cuenta como borrar documentación anterior y la guardia patrimonial
> lo prohíbe. El contenido es el vigente.

**Fecha:** 2026-10-29 · **Estado:** 🟡 **abierto solo por lo fiscal** (firma del
asesor). La parte de «entorno de pruebas» **queda cerrada como decisión en
contra**, tomada por el titular.

---

## Parte 1 · Entorno de pruebas — **no se hace** (decisión del titular)

### 1.1 Qué se llegó a hacer y por qué se retira

H-17 nació de un informe de auditoría que pedía «poder validar sin tocar datos
reales». Ese pendiente se convirtió, sin preguntar antes al titular, en la
preparación de un segundo entorno: un proyecto de Firebase de pruebas, una
variable `ENTORNO_DESPLIEGUE` en el servidor y siete `VITE_FIREBASE_*` en el
cliente.

**El titular no quiere un entorno de pruebas y nunca lo pidió** (2026-10-29). Un
pendiente escrito en un informe no es una petición. Todo eso se ha **retirado**:

| Se retiró | Dónde estaba |
|---|---|
| Lista de dos destinos (`produccion` \| `staging`) | `server/titularidades/configuracionFirebase.ts` |
| `ENTORNO_DESPLIEGUE` y `PROYECTO_POR_ENTORNO` | idem |
| `VITE_ENTORNO_FIREBASE` y las siete `VITE_FIREBASE_*` | `src/lib/destinoFirebase.ts` |
| Etiqueta `· STAGING` y aviso «datos no reales» | `src/components/sections/ConfiguracionSection.tsx` |
| Guía de creación del staging | Se borró de este documento |

Nada de esto llegó a estar activo: el proyecto de pruebas nunca se creó y las
variables nunca se declararon en Vercel. El despliegue real no ha cambiado.

### 1.2 Lo que SÍ se conserva: un solo destino, y a prueba de errores

Al quitar la puerta se queda el candado, que es lo que de verdad protege los datos
reales y **no** tiene nada que ver con tener un entorno de pruebas:

- **Cliente** (`src/lib/destinoFirebase.ts`): solo se admite el proyecto real. Si
  el fichero de configuración declarara otro, la aplicación **no arranca**
  (`DESTINO_PROYECTO_INCOMPATIBLE`). No hay variable de entorno que pueda
  cambiarlo.
- **Servidor** (`server/titularidades/configuracionFirebase.ts`): un único
  proyecto permitido. Cualquier otro se bloquea con `FIREBASE_PROYECTO_INCOMPATIBLE`,
  y la credencial de servicio debe ser del mismo proyecto.
- **Orden de arranque**: si un módulo ya creó la app de Firebase con otro proyecto,
  se lanza `DESTINO_APP_PRECEDENTE_INCOMPATIBLE` en vez de reutilizarla en
  silencio.
- **Base con nombre**: obligatoria en ambos lados (AG-03.2 sigue intacta).

En una frase: **la aplicación solo puede hablar con tu base de datos; si algo la
deja mal configurada, se para en vez de conectarse a otro sitio.**

### 1.3 Residuo conocido (P-09)

`src/lib/googleAuth.ts` **no se puede tocar**: la guardia de custodia
(`src/features/operaciones/tests/integration-boundaries.test.mjs`) lo exige byte a
byte idéntico a `main`, y no se edita el fichero que vigila. Sigue haciendo
`initializeApp(firebaseConfig)` con el JSON versionado, pero esa rama **no se
ejecuta**: cuando se evalúa, `getApps().length` ya es 1 porque `firebase.ts`
arrancó antes. Y si ese orden cambiara, la guardia de arranque lo convierte en un
fallo explícito.

Para eliminarlo del todo hay que llevar el fichero al manifiesto revisado
(`custodia-parche-p0.json`), que está fijado a la base `658f692` — no disponible
en este clon. Queda registrado como **P-09**; no afecta a la decisión de no tener
entorno de pruebas.

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
| **Entorno de pruebas** | ❌ **No se hace** — decisión del titular (2026-10-29). Código retirado |
| Destino único en cliente | ✅ `src/lib/destinoFirebase.ts` — si no es el proyecto real, no arranca |
| Destino único en servidor | ✅ Un solo proyecto permitido; credencial del mismo proyecto |
| Garantía de no escribir en otro sitio | ✅ `DESTINO_PROYECTO_INCOMPATIBLE` / `FIREBASE_PROYECTO_INCOMPATIBLE` / `DESTINO_APP_PRECEDENTE_INCOMPATIBLE` |
| Compatibilidad del despliegue actual | ✅ Sin cambios: mismo proyecto, misma base, sin variables |
| Residuo de custodia en `googleAuth.ts` | 🟡 P-09 (no bloquea nada) |
| Pre-dictamen técnico fiscal | ✅ Ya existía |
| Carta al asesor | ✅ §2.3, lista para enviar |
| **Dictamen firmado** | 🟡 **Pendiente — lo único que queda de H-17** |

**H-17 sigue abierto por una sola razón: falta la firma del asesor fiscal.** La
parte de entorno de pruebas está cerrada en contra, y el candado que impide que la
aplicación hable con otro proyecto está hecho y probado.
