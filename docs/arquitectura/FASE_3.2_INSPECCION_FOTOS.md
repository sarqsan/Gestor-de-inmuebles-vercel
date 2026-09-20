# Fase 3.2 — Inspección visual y fotografías por estancias (Storage)

Alcance: permitir documentar el estado físico de la vivienda tras la salida
del inquilino, mediante carga de fotografías **catalogadas por estancia** y
almacenadas de forma privada en Firebase Storage, avanzando el expediente de
`REVISION_PENDIENTE` a `FOTOS_ACTUALIZADAS`.

## Objetivos cubiertos

- Pregunta guía de la especificación (§4.3): «¿Deseas actualizar las
  fotografías de la vivienda para evaluar su estado y optimizar su salida al
  mercado?».
- Categorización por las 7 estancias: Salón/Comedor, Cocina, Baños,
  Dormitorios, Terraza/Balcón, Zonas comunes/Exterior y Otras zonas
  (trastero, garaje…).
- Carga múltiple de imágenes por estancia, con **autoguardado** tras cada
  subida, contador de progreso, miniaturas, visor en grande y borrado.
- Compresión previa en cliente (máx. 1600 px, calidad 0.72) reutilizando
  `compressImageForUpload`, suficiente para el análisis visual de la fase 3.3.
- Acción «Inspección fotográfica» en el detalle del expediente y botón
  «Fotos completadas» que lleva el expediente a `FOTOS_ACTUALIZADAS`, con
  posibilidad de «Volver a revisión».
- Indicador del número de fotos en las tarjetas del listado y resumen de
  zonas cubiertas en el detalle.

## Almacenamiento y reglas

- Ruta **privada** por propietario y expediente:
  `recomercializacion_fotos/{propietarioId}/{expedienteId}/{archivo}`.
- A diferencia de las imágenes de catálogo (`inmuebles/…`, públicas), las
  fotos de inspección son documentos internos de trabajo (estado/desperfectos)
  y solo las leen cuentas internas; tipo imagen y < 15 MB.
- **Sin fallback base64**: un expediente acumula muchas fotos y los data URL
  inflarían el documento de Firestore (límite 1 MB por documento). Si Storage
  falla o tarda (>20 s), la UI muestra el error y permite reintentar; el
  metadato nunca queda apuntando a una imagen rota.
- Firestore guarda solo metadatos (`FotoInspeccion`: id, estancia, `url`,
  `storagePath`, fecha; el `analisisIa` se rellenará en la fase 3.3).
- Al **eliminar un expediente** se borran también sus fotos de Storage
  (best-effort) antes de borrar el documento.
- Residual conocido: sin custom claims, Storage no puede aislar finamente por
  `propietarioId`; se exige cuenta interna (igual que justificantes y facturas).

## Archivos

- Nuevo: `src/components/modals/InspeccionFotograficaModal.tsx`.
- Modificados:
  - `src/utils/recomercializacionEngine.ts`: `ESTANCIAS_ORDEN`,
    `nuevoFotoInspeccionId`, `agregarFotoInspeccion`, `quitarFotoInspeccion`.
  - `src/lib/firebase.ts`: `uploadFotoInspeccionStorage`,
    `deleteFotoInspeccionStorage`.
  - `storage.rules`: bloque privado `recomercializacion_fotos`.
  - `src/components/modals/DetalleExpedienteModal.tsx`: tarjeta de inspección,
    estados habilitados en la línea de tiempo y montaje del modal.
  - `src/components/sections/RecomercializacionSection.tsx`: indicador de fotos.
  - `src/App.tsx`: limpieza de Storage al eliminar el expediente.

## Despliegue manual necesario

Esta fase añade una ruta nueva a **Storage Rules**; Firestore no cambia:

```bash
firebase deploy --only storage --project startup-sanctuary-sln7n
# (si aún no se desplegó la Fase 3.0:)
firebase deploy --only firestore:rules --project startup-sanctuary-sln7n
```

## Pendiente para la 3.3

- Envío de las imágenes a un endpoint en `server.ts` con prompt estructurado y
  **lenguaje no asertivo**, volcando el resultado en
  `FotoInspeccion.analisisIa` (observaciones + sugerencias de mejora).
