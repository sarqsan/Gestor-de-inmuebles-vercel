# AE-01 — Auditoría de escalabilidad documental (P1.9.3, SIN migración)

**Fecha:** 2026-10-27 · **Estado:** auditoría de código y modelo, **sin datos de
producción**. Conclusión: **NO se migra** `registroCobros[]` a subcolección.

---

## 1. Alcance y método

Se inspecciona el modelo de cobros incrustado en los contratos de
formalización, su lectura/escritura y el límite de tamaño de documento de
Firestore. **No se ha conectado a la base de producción**, no se han leído
documentos reales y no se ha ejecutado ninguna migración. Por eso las cifras de
volumen son **cotas teóricas derivadas del código**, no mediciones.

Fuentes:
- `src/utils/cobrosEngine.ts` (generación de periodos, `registrarPagoPeriodo`,
  `registroCobros[]`).
- `src/utils/facturacionEngine.ts`, `src/components/sections/CobrosSection.tsx`.
- `firestore.rules` (colección `contratos_formalizacion`).
- `firestore.indexes.json` (10 índices declarados; ver §7 de
  `docs/CONFIGURACION-VERIFICABLE.md` sobre su despliegue pendiente).
- Límite oficial de documento Firestore: **1 MiB**
  ([firebase.google.com/docs/firestore/quotas](https://firebase.google.com/docs/firestore/quotas)).

---

## 2. Modelo actual (hecho comprobado)

| Aspecto | Observación |
|---|---|
| Ubicación | `registroCobros` es un **array embebido** en el documento del contrato, no una subcolección. |
| Escritura | `registrarPagoPeriodo` devuelve un **contrato nuevo** (inmutabilidad) y la UI persiste el documento completo. |
| Crecimiento | Un periodo por mes por contrato; cada periodo acumula importes, fechas, estado, método, usuario y eventos de auditoría. |
| Concurrencia | Dos gestores que registran pagos del mismo contrato **sobrescriben** el array completo si no hay transacción/versión: riesgo de **pérdida de un cobro**. |
| Límite | Con N periodos × tamaño medio por periodo, el documento puede acercarse a 1 MiB. Una anualidad son 12 periodos; 10 años, 120. |
| Índices | Los 10 índices de `firestore.indexes.json` **no se publican** con el `firebase.json` actual (H-14, P0.4.6). |

### Cota teórica (NO medición)

Si un periodo ocupa `P` bytes, el límite se alcanza con `1.048.576 / P`
periodos. Con `P = 1 KiB` → ~1024 periodos (~85 años mensuales); con
`P = 4 KiB` (auditoría verbosa, evidencias embebidas) → ~256 periodos
(~21 años). **Ambas cotas superan la vida útil típica de un contrato LAU**,
pero el margen se reduce si se empiezan a incrustar PDFs, imágenes o trazas
largas en el mismo documento. El riesgo real hoy **no es el tamaño**, es la
**concurrencia de escritura** y la **falta de medición**.

---

## 3. Decisión: NO migrar (todavía)

Razones, en orden de peso:

1. **No hay evidencia de tamaño real.** Sin acceso a producción (prohibido en
   esta sesión) cualquier migración sería preventiva y especulativa, que es
   exactamente lo que la corrección D-07 de la Fase 0 desactivó.
2. **La migración es estructuralmente peligrosa:** cambia la forma de leer
   contratos, cobros, morosidad, compromisos de pago y reportes. Requiere
   doble escritura, backfill, compatibilidad de lectura, verificación de
   totales y un rollback probado.
3. **El beneficio es incierto:** el límite de 1 MiB no se ha alcanzado en
   ningún caso medido. Migrar por «por si acaso» añade coste de lecturas y
   complejidad de reglas.
4. **Hay un problema más barato y más probable que resolver antes:** la
   concurrencia (transacciones/versionado) y la publicación de índices (H-14).

---

## 4. Instrumentación propuesta (sin migrar, sin producción)

1. Añadir en el **emulador** una prueba que genere 120/240/480 periodos y mida
   el tamaño serializado del contrato; registrar el resultado en un artefacto
   de CI. **Esto sí es verificable hoy** y convierte la cota teórica en dato.
2. Publicar una métrica de tamaño de documento (solo conteo/sumario, sin
   contenido sensible) al guardar un contrato, con umbral de aviso en 700 KiB.
3. Resolver la concurrencia con `runTransaction` o `updateTime` esperado en
   `registrarPagoPeriodo`, manteniendo el array actual.
4. Declarar los índices en `firebase.json` y verificar con
   `firebase deploy --only firestore:indexes --dry-run` antes de publicar.
5. Solo si (1) muestra documentos >700 KiB **en datos reales de staging**,
   redactar un plan de migración a `contratos/{id}/cobros` con doble escritura,
   backfill por lotes, verificación de totales y rollback; y pedir
   **autorización independiente**.

---

## 5. Criterio de salida de AE-01

- [x] Modelo y límites documentados (este fichero).
- [x] Decisión «no migrar» justificada y reversible.
- [ ] Medición real en emulador con 120/240/480 periodos.
- [ ] Índices publicados en staging (H-14).
- [ ] Concu­rrencia resuelta con transacción/versionado.
- [ ] (Condicional) plan de migración firmado y autorizado.

**No se ha tocado `registroCobros[]`, ni `firestore.rules`, ni datos.**

---

## 6. Invariante permanente

Ninguna de estas tareas introduce banca, PSD2, agregadores, pasarelas ni pagos
online. El registro contable definitivo sigue siendo la acción humana
`registrarPagoPeriodo`; los justificantes son documentación, no cobros.
