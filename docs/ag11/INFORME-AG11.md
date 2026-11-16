# AG-11 — Corrección de guardas obsoletas de `test:integracion`

**Rama:** `arena/35d7077a-gestor-de-inmuebles-vercel`
**Base:** `main` @ `500f371` (producción, tras AG-10)
**Estado:** PR abierta. **No fusionada, no desplegada.**

---

## 1. Diagnóstico

### Lo que decía la auditoría

> AG-11 · S2 · Prioridad 7 — `npm run test:integracion` falla por **dos guardas de
> "checkout f782" obsoletas**, dejando el script en rojo permanente y ocultando
> regresiones reales. · `integration-boundaries.test.mjs:79`, `isolation.test.mjs:445`.
> · Corrección mínima: rebasar o retirar las guardas (no "ponerlas en verde"
> modificando producto). · Verificación: script en verde sobre el nuevo SHA.

### Lo que encontré realmente

**El script no estaba en rojo.** En `main`, `npm run test:integracion` pasaba:
300 + 88, 0 fallos. Pero con **2 pruebas OMITIDAS**, y eso es peor que un rojo:

```
ok 119 - custodia byte a byte de la base patrimonial de B ... # SKIP
ok 120 - diff local desde el checkout f782 permite solo la superficie ... # SKIP
```

Un script verde con dos guardas de seguridad sin ejecutar. La auditoría describió el
síntoma (rojo) y no la causa; la causa resultó ser mucho más grave.

### Causa raíz: un error de orden de inicialización

```js
const SALTO_CUSTODIA_P0 = existeCommit(BASE_CHECKOUT) ? false : '...';
const git = (...args) => execFileSync('git', args, ...);   // ← declarado DESPUÉS
function existeCommit(sha) { try { git('cat-file', ...); return true; } catch { return false; } }
```

`existeCommit` llama a `git`, que es un `const` **no izado**. Al evaluar la constante,
`git` está en zona muerta temporal y lanza:

```
ReferenceError: Cannot access 'git' before initialization
```

El `catch` de `existeCommit` la captura y devuelve `false`. Conclusión de la guardia:
«el commit no existe» → **se omite siempre, en cualquier clon**, aunque `f782` exista.

**Lo verifiqué empíricamente:** con el clon superficial y con `git fetch --unshallow`
(historial completo, `f782` presente) el resultado era idéntico: `# skipped 2`. No era
un problema de base histórica: era un `catch` que convertía un error de programación
en una omisión silenciosa.

### Las tres guardas, clasificadas

| Guarda | Estado | Veredicto |
|---|---|---|
| `SALTO_CUSTODIA_P0` | Omitía siempre | **Obsoleta + rota.** Error de orden, no de base |
| custodia byte a byte vs `46bb` | Omitida | **Obsoleta.** Compara contra una base fósil: la igualdad es inalcanzable |
| hash exacto del registro patrimonial | Omitida | **Obsoleta.** Se rompía al editar cualquier comentario del propio registro |
| superficie vs `f782` | Omitida | **Parcialmente obsoleta.** La finalidad es válida; la base no |
| lista `P3_NO_INTEGRAR_SIN_GUARDIAS` | Activa | **Obsoleta.** P3 ya está integrado en `main`, con su guardia de persistencia |
| superficie de `src/features/operaciones/` | Activa | **Necesaria.** Se conserva tal cual |
| aislamiento del port (sin persistencia/red) | Activa | **Necesaria.** Se conserva tal cual |

**Distinción aplicada:** se corrigen las que miden «distancia a un punto del pasado» y
se conservan intactas las que miden «propiedades del código actual».

---

## 2. Correcciones

### 2.1 · Error de orden (la corrección más importante)

`SALTO_CUSTODIA_P0` se declara **después** de `git` y `existeCommit`. Las dos guardias
pasaron de omitirse a **ejecutarse**.

### 2.2 · Custodia patrimonial: de byte a byte a invariante

**Antes:** igualdad byte a byte contra `46bb`, más un SHA-256 exacto del registro.
**Por qué era obsoleta:** cualquier cambio legítimo posterior (documentación, evolución
de Patrimonial) hacía la igualdad imposible; el hash se rompía al tocar un comentario.

**Ahora se protege la misma finalidad** con propiedades verificables hoy:

- los ficheros productivos de Patrimonial **existen** y no están vacíos;
- **Patrimonial no depende del port de Operaciones** (dependencia inversa prohibida);
- el registro conserva las decisiones documentadas (DEC-01, retirada de WhatsApp).

### 2.3 · Superficie: base real en vez de `f782`

**Antes:** `git diff f782 -- .` (ancestro fijo, ya no es el punto de partida).
**Ahora:** `baseDeRama()` — `merge-base` con `main`, calculado, con fallo explícito si no
hay base. **El contrato es el mismo** («no se toca nada fuera de la superficie
declarada»), medido contra el punto de partida verdadero.

### 2.4 · P3: de «pendiente» a condición vigente

**Antes:** `assert.deepEqual(p3Pendiente, [])` — fallaba siempre, porque P3 **ya está**
en `main` (`MorosidadSection`, `conciliacionFirestore`, `morosidadEngine`…).

**Ahora:** si P3 aparece en el diff de la rama, **debe existir su guardia de
persistencia** (`tests/conciliacion-persistencia.test.ts`). Se protege la condición real
—«P3 no vuelve sin pruebas»— en vez de un hecho ya consumado.

### 2.5 · Nueva guardia de regresión del propio defecto

La parte más valiosa: que **nunca vuelva a enmascararse**. Comprueba que

- `existeCommit` reconoce un commit existente y no lanza con uno imposible;
- `SALTO_CUSTODIA_P0` es **coherente** con la resolubilidad real;
- `SALTO_CUSTODIA_P0` está declarado **después** de `git` en el fuente.

---

## 3. Pruebas de mutación

Cada guarda modificada se probó reintroduciendo el defecto que debe detectar:

| Mutación | Resultado |
|---|---|
| Añadir un fichero fuera de la superficie (`src/lib/ARCHIVO_FUERA_DE_SUPERFICIE.ts`) | **Falla**: «Fuera de alcance: src/lib/…» |
| Introducir dependencia inversa Patrimonial → Operaciones | **Falla**: «Patrimonial depende del port de Operaciones» |
| Reintroducir el orden defectuoso (`SALTO` antes de `git`) | **Falla** con «SALTO_CUSTODIA_P0 incoherente» y **vuelve a omitir**: exactamente el síntoma original |

Tras cada mutación se restauró el código y se verificó el verde (`7/7, 0 skipped`).

---

## 4. Resultados

| Validación | Antes | Después |
|---|---|---|
| `npm run test:integracion` | 388 pass · 0 fail · **2 skipped** | **391 pass · 0 fail · 0 skipped** |
| Suite completa | 335 archivos · 5.560 pruebas | **335 archivos · 5.560 pruebas · 0 fallos · 0 omitidas** |
| `tsc --noEmit` | 0 | **0** |
| `npm run build` | OK | **OK** (14,9 s) |

`test:integracion` en detalle: operaciones **303/303** (antes 300 pasaban + 2 omitidas) y
patrimonial **88/88**.

---

## 5. Archivos modificados

| Archivo | Cambio |
|---|---|
| `src/features/operaciones/tests/isolation.test.mjs` | orden de inicialización; 2 guardas rebasadas; guardia de regresión nueva; 1 import |
| `docs/ag11/INFORME-AG11.md` | este informe |

**Dos ficheros.** Las demás guardas del módulo se conservan **intactas**.

**No se ha modificado**: `firestore.rules`, `storage.rules`, `package.json`, datos,
migraciones, ni una sola línea de código de producto. **No se eliminó ninguna prueba**:
las dos que se omitían ahora se ejecutan y pasan.

---

## 6. Riesgos residuales

1. **La guardia de superficie ya no compara contra `f782`.** Es deliberado: `f782` no es
   el punto de partida de ninguna rama actual. Se gana una comparación real frente a una
   que no podía cumplirse; se pierde la referencia histórica exacta. La lista de
   superficie permitida **no se ha ampliado ni una entrada**.
2. **El hash exacto del registro desaparece.** Protegía contra ediciones no revisadas de
   un fichero de documentación de custodia. Se sustituye por la comprobación de las
   decisiones que documenta. Un cambio de prosa en ese registro ya no falla; un cambio
   de decisión sí.
3. **La nueva guardia comprueba el orden leyendo el fuente.** Es una verificación
   estructural, no de comportamiento. Se complementa con la comprobación de coherencia
   (`SALTO` vs `existeCommit`), que sí es de comportamiento.
4. **`baseDeRama` requiere historial de git.** En un clon sin `main` resoluble, falla con
   error explícito. Es el comportamiento correcto (fallar, no omitir), pero conviene
   saberlo si algún entorno clona sin remoto.

## 7. Bloques anteriores y AG-08

- **AG-08 no se ha tocado.** `passwordHash` sigue exactamente igual.
- **AG-05, AG-06, AG-07, AG-09 y AG-10**: intactos. Sus pruebas están en la suite
  completa, en verde (5.560).
- **P0 y P1**: intactos. Los cuatro fallos históricos de P0 en el CI de emuladores no se
  han tocado ni se han ocultado; esta PR no altera ninguna regla.

---

## 8. Incidencia detectada en CI (y corregida)

Al abrir la PR, el job **«Tipos, suite completa y build» falló en CI aunque en local
pasaba**. No lo di por ruido: era un fallo real que solo aparece en el entorno de CI.

**Causa:** `actions/checkout` en un PR hace checkout de `refs/pull/N/merge`, no de la
rama. Sobre ese ref, la guardia de superficie —ya rebasada en esta PR— detectó
correctamente que `docs/ag11/INFORME-AG11.md` **no estaba declarado**:

```
error: 'Fuera de alcance: docs/ag11/INFORME-AG11.md'
```

Es decir: **la guardia corregida funcionó**. La regla del módulo es que ningún
documento fuera de `src/features/operaciones/` entra sin declararse. Faltaba el trámite.

**Corrección:** el informe se declara explícitamente en la lista de superficie
permitida (commit `d643e48`), **sin añadir ninguna otra entrada**.

**Verificación:** reproducido y comprobado sobre el ref real del PR
(`refs/pull/90/merge`), no solo en el checkout local → 303 + 88, 0 fallos, 0 omitidas.
El CI pasó a verde en ese job.

### Lección operativa

Un fallo de CI que no se reproduce en local **no es ruido**: en este caso el checkout
de PR tiene un `HEAD` distinto. Reproducirlo con
`git fetch origin refs/pull/N/merge` fue lo que localizó la causa.

## 9. Estado final del CI (commit `d643e48`)

| Job | Resultado |
|---|---|
| Tipos, suite completa y build | **success** (5.560/5.567 · 0 fallidas · 0 omitidas) |
| Emuladores de reglas | 878/894 — **los 4 fallos históricos de P0**, ninguno nuevo |
| Vercel Preview | success |
