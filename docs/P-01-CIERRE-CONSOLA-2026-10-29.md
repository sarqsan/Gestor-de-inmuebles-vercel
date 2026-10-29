# Cierre de P-01 — verificación en la consola · 2026-10-29

**Quién lo verificó:** el usuario, con capturas de pantalla de la consola.
**Qué se cierra:** los **10 índices** y la **identidad de las reglas publicadas**.
**Proyecto:** `gestor-inmuebles-produccion` · base `ai-studio-gestordeinmueble-c6444afd-24ca-4983-b195-ceb2c5ebdc51`.

---

## 1. Índices — 10/10 · todos *Habilitado*

Captura de **Firestore → Índices** (2026-10-29 18:42). Las tres columnas que
importan: **Campos indexados** con su flecha (`↑` ascendente, `↓` descendente),
**Alcance de la consulta** y **Estado**. «Disperso» y «Único» **sin marcar**, que
es lo correcto: en Firestore los índices ya son dispersos por naturaleza y la
unicidad no se declara por índice.

| # | Colección | Campos (en ese orden) | Alcance | Estado |
|---|---|---|---|---|
| 1 | `actas` | `ownerId` ASC · `propertyId` ASC · `fechaCreacion` DESC | Colección | Habilitado |
| 2 | `actas` | `ownerId` ASC · `contractId` ASC · `fechaCreacion` DESC | Colección | Habilitado |
| 3 | `actas` | `ownerId` ASC · `tipo` ASC · `estado` ASC | Colección | Habilitado |
| 4 | `actas_evidencias` | `ownerId` ASC · `actaId` ASC · `orden` ASC | Colección | Habilitado |
| 5 | `actas_incidencias` | `ownerId` ASC · `actaId` ASC · `fechaHora` DESC | Colección | Habilitado |
| 6 | `actas_otp` | `ownerId` ASC · `actaId` ASC · `estado` ASC | Colección | Habilitado |
| 7 | `gestiones_cartera` | `propietarioId` ASC · `estado` ASC | Colección | Habilitado |
| 8 | `gestiones_cartera` | `gestorUsuarioId` ASC · `estado` ASC | Colección | Habilitado |
| 9 | `ia_operaciones` | `uidTitular` ASC · `iniciadaEn` DESC | Colección | Habilitado |
| 10 | `ia_operaciones` | `uid` ASC · `iniciadaEn` DESC | Colección | Habilitado |

La consola los ordena por colección; el contenido coincide uno a uno con
`firestore.indexes.json` (`tests/indices-documentados.test.ts` ata esta tabla al
fichero, así que no puede desfasarse).

Ninguno quedó en *Creando*: los 10 están construidos y en servicio.

## 2. Reglas publicadas — final del texto y recuento

Captura de **Firestore → Seguridad** desplazada al final (2026-10-29 18:43).

| Comprobación | Resultado |
|---|---|
| **Última línea numerada** | **4064** — igual que `firestore.rules` |
| **Últimas 6 líneas** | `match /{document=**}` → `allow read, write: if false;` → cierres `}`, `}`, `}` |
| **Marcador `DENEGACIÓN GLOBAL POR DEFECTO`** | visible en la línea 4058 |
| **Bloque `allow delete: if isMasterAdmin();`** | visible en la línea 4054 |
| **Líneas visibles 4038–4064** | **26 de 27 idénticas** al fichero del repositorio |

Ese cierre es inconfundible: es la **denegación global por defecto**, la última
regla del fichero. Un ruleset distinto no acabaría así con el mismo recuento.

### La única línea que no puedo afirmar al 100 %

La línea **4039** es un comentario. En la captura leo:

```
// nadie (tampoco un propietario) reasigna un estado a otro inmueble, otro tipo
```

y en el repositorio dice:

```
// nadie (tampoco un propietario) reasigna un estado a otro inmueble, otro portal
```

Una de dos: o la captura no se lee con suficiente resolución en esa palabra, o lo
publicado es una revisión anterior que solo cambia **esa palabra de un comentario**.

**Por qué no cambia nada:** es un comentario. No es una condición, no es un
`allow`, no interviene en ninguna evaluación. Las 26 líneas restantes —incluidas
**todas** las condiciones de `allow update` (4041–4050) y el cierre global— sí
coinciden. Un ruleset que difiriese en comportamiento no podría coincidir en las
condiciones y en el cierre a la vez.

Queda escrito como límite de la evidencia, no como certeza: **no he comparado
byte a byte** el texto publicado. La comprobación byte a byte queda disponible
(§2.4.3 del documento del usuario) para cuando haga falta de verdad.

## 3. Dónde está el simulador en esta versión de la consola

Hallazgo del 2026-10-29, visible en las capturas: la guía hablaba de la pestaña
**«Reglas»**, y en esta versión de la consola se llama **«Seguridad»**. De ahí que
no se encontrara el botón. Y «Rules Playground» tampoco aparece con ese nombre:

- Botón azul **«Desarrollar y realizar pruebas»**, arriba a la derecha del editor.
- O la barra **«Zona de pruebas de reglas — Experimenta y explora con las reglas
  de seguridad»**, **plegada en la esquina inferior izquierda** del editor. Un clic
  en esa barra la despliega.

Queda anotado para que nadie más lo busque por el nombre equivocado.

## 4. Observación no bloqueante: cuota compartida

La consola muestra este aviso sobre la base:

> «Esta base de datos está sujeta a los límites de cuota compartida de IA. Cambia
> esta base de datos a la facturación de pago por uso para quitar estas
> restricciones.»

No es un fallo ni bloquea nada hoy, pero sí un límite operativo real: la base
comparte cuota con el nivel gratuito de AI Studio. Conviene decidir si se pasa a
pago por uso **antes** de que haya uso real sostenido, y no cuando aparezca el
primer error de cuota en producción. Se registra como observación, sin actuar.

## 5. Qué queda **fuera** de este cierre

- **Los 6 casos del simulador**: no se han ejecutado a mano. Su propósito era
  detectar que se publicó otra versión; eso queda cubierto por el recuento y el
  cierre idénticos. El **comportamiento** de las reglas está probado en el
  emulador de CI contra este mismo fichero en cada PR.
- **Prueba con datos reales en producción**: no se ha creado ninguna solicitud ni
  candidato. Eso corresponde al staging de **H-17**.
- **Datos sanos**: esto verifica configuración publicada, no contenido.
