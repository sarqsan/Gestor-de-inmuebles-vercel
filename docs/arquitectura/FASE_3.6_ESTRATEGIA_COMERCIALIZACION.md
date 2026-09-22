# Fase 3.6 — Estrategia, kit de publicación, bolsa de inmobiliarias y cierre del ciclo

Última fase del bloque de recomercialización (especificación §4.7 y cierre del
flujo §4.1): una vez valorado el activo, el propietario decide cómo
comercializarlo, prepara el anuncio, puede delegar o comparar agencias y cierra
el ciclo dejando el inmueble listo para una nueva vida comercial sobre la
**misma ficha**.

## 1. Decisión de estrategia

- En el detalle del expediente, desde `VALORACION_COMPLETADA`, se elige la
  modalidad (`modalidadElegida`): **gestión propia**, **delegar en
  inmobiliaria** o **híbrida**. Al confirmar se pasa a `DECISION_ESTRATEGIA`.
- Desde ahí se inicia la comercialización (`EN_COMERCIALIZACION`, con
  `fechaInicioComercializacion`); se puede volver atrás a la decisión. La
  máquina de estados no cambia (ya definía estas transiciones en la 3.0).

## 2. Kit de publicación

- `POST /api/generar-kit-publicacion` redacta **titular, descripción, puntos
  fuertes, entorno y extras/extras** con Gemini, con una plantilla heurística
  de respaldo cuando no hay clave.
- Restricción clave de veracidad: el modelo escribe **solo con los hechos
  aportados** (tipología, m², habitaciones, precio de los escenarios de la 3.5,
  mejoras confirmadas de la 3.4, antigüedad catastral de la 3.5.1 y una lista
  explícita de hechos adicionales). No puede inventar ascensor, parking,
  terraza, piscina, transporte, colegios ni servicios del barrio: si no se los
  dan, `entorno`/`extras` salen vacíos. Aviso de normativa de publicidad.
- `KitPublicacionModal`: borrador editable (titular con contador, descripción,
  chips de puntos fuertes/entorno/extras), vista previa del texto para
  portales, copia al portapapeles, guardado como borrador y
  «Publicar e iniciar comercialización» (deja
  `comercializacion.kitPublicacion` y `fechaPublicacion`, y avanza el estado).

## 3. Bolsa de inmobiliarias y RFPs

Colecciones ya creadas en la 3.0, por fin con UI:

- `inmobiliarias_directorio` (bolsa común): `BolsaInmobiliariasModal` lista
  agencias activas compatibles con la operación (alquiler / venta /
  habitaciones), destacando las que cubren el código postal o la localidad del
  inmueble. El **administrador** gestiona el directorio (alta/baja; las
  alturas quedan como `LOCALIZADA_EXTERNA`, no verificadas); las reglas ya
  reservaban la escritura al administrador.
- **RFP**: selección múltiple de agencias → se crea un `LeadInmobiliario`
  (`SOLICITADO`, con su tipo de operación) por cada agencia no contactada y se
  añaden a `comercializacion.inmobiliariasContactadasIds`. Seguimiento del
  lead: *RFP enviada → en contacto → acuerdo firmado / descartada / reabrir*.
- **Propuestas (`propuestas_inmobiliaria`)**: se registran las condiciones
  recibidas (honorarios, plazo estimado, servicios incluidos, resumen de
  estrategia), se comparan en lista y se **acepta una** (las demás pendientes
  pasan a rechazadas y el lead queda como acuerdo firmado) o se rechazan.
- Aislamiento: leads y propuestas llevan `propietarioId` y las suscripciones
  salen ya acotadas por el ámbito del usuario (`subscribeColeccionPropietario`).

## 4. Cierre del ciclo y acople con contratos

- En `EN_COMERCIALIZACION` se cierra como **CERRADO · REARRENDADO** o
  **CERRADO · VENDIDO** (confirmación explícita); se guardan
  `comercializacion.fechaCierre` y `resultadoCierre`, y el resumen de cierre
  queda visible en el expediente.
- `handleCerrarExpedienteRecomerc` (App) realiza el acople completo:
  1. localiza el contrato anterior (vinculado por `contratoAnteriorId` o el
     más reciente no finalizado del inmueble) y, si sigue vivo, llama al flujo
     oficial `handleFinalizarContrato`;
  2. ese flujo deja el contrato en `FINALIZADO`/no vigente y **libera la ficha
     del inmueble** (`estado: 'disponible'`, sin inquilino ni contrato activo);
  3. si no había contrato, la liberación se hace de forma idempotente.
- La siguiente comercialización o contrato usa **el mismo `inmuebleId`**
  (formalización estándar sobre la ficha liberada); el expediente cerrado
  conserva el histórico. En venta el inmueble queda asimismo liberado; la
  baja patrimonial definitiva corresponde al bloque de Patrimonio (fase 5).

## Datos y tipos

- `ComercializacionExpediente`: `kitPublicacion` ampliado a `KitPublicacion`
  (puntos fuertes, entorno, extras, motor, fecha); nuevos
  `fechaInicioComercializacion`, `fechaCierre`, `resultadoCierre`,
  `nuevoContratoId`.
- Nuevos componentes: `modals/KitPublicacionModal.tsx`,
  `modals/BolsaInmobiliariasModal.tsx`, `utils/kitPublicacionIa.ts`.
- Modificados: `server.ts` (endpoint del kit), `App.tsx` (suscripciones,
  handlers y cierre), `RecomercializacionSection.tsx` (props e indicadores del
  listado: kit publicado, agencias contactadas), `DetalleExpedienteModal.tsx`
  (decisión de estrategia, accesos a kit/bolsa, cierre y resumen).
- Sin cambios en reglas Firestore/Storage: las tres colecciones y sus
  permisos (aislamiento por propietario; directorio sólo admin) ya existían.
  **Pendiente del usuario**: desplegar `firestore.rules` si no se desplegaron
  en la 3.0.

## Verificación

- `tsc --noEmit` y `npm run build` correctos.
- Kit heurístico sin clave: titular y descripción construidos sólo con hechos
  reales (piso 85 m², 3 hab, 1 baño, Alicante 03001, 1.025 €/mes, pintura y
  LED), `entorno`/`extras` vacíos y cláusula prudente; sin equipamiento
  inventado.
- Cierre: el acople con la finalización del contrato y la liberación del
  inmueble reutiliza el flujo ya probado de contratos. La generación con
  Gemini real queda pendiente de `GEMINI_API_KEY` en Vercel.

## Cierre del bloque 3

Con la 3.6 quedan entregadas las fases 3.0 a 3.6: altas y máquina de estados,
avisos de salida, inspección fotográfica con IA, reformas/ROI, pricing con
escenarios y catastro, y la comercialización con su cierre. Siguientes bloques
previstos: Incidencias (4), Patrimonio y analítica (5) y Fiscal/IRPF (6).
