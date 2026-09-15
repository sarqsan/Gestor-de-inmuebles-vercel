# DOCUMENTO DE ARQUITECTURA Y ESPECIFICACIÓN TÉCNICA
## CONCEPTO: RECOMERCIALIZACIÓN INTELIGENTE DEL INMUEBLE

**Versión:** 1.0.0 (Fase de Diseño y Especificación Arquitectónica)  
**Estado:** Documentación formal / Sin implementación funcional operativa inmediata  
**Ámbito:** Copia de desarrollo  
**Fecha:** Septiembre 2026  

---

## 1. RESUMEN EJECUTIVO Y OBJETIVOS ARQUITECTÓNICOS

El ciclo de vida inmobiliario tradicional adolece de fragmentación cuando un contrato de arrendamiento se extingue: la salida del arrendatario se gestiona de forma aislada, el inmueble sufre tiempos muertos sin rentabilidad y la decisión sobre su próximo destino (nuevo alquiler tradicional, alquiler por habitaciones, venta o reforma) suele carecer de datos objetivos y de una preparación coordinada.

El módulo **“Recomercialización Inteligente del Inmueble”** unifica este hito crítico permitiendo que, ante la notificación de desocupación o finalización de un arrendamiento, el propietario pueda:
1. **Conservar la identidad única e invariable del activo (`inmuebleId`)**, protegiendo el histórico financiero, documental, fiscal y técnico acumulado.
2. **Gestionar la desvinculación ordenada del inquilino saliente** (comunicación formal, calendario de entrega de llaves, liquidación de fianza, estado del contrato).
3. **Evaluar el estado físico del inmueble** mediante carga de fotografías actualizadas de estancias y análisis asistido por Inteligencia Artificial (detección probabilística y no asertiva de desperfectos, pintura, mejoras).
4. **Simular escenarios de rentabilidad y retorno de inversión (ROI)** mediante conexión con el módulo de *Reformas y Optimización*.
5. **Actualizar la valoración de mercado** (alquiler tradicional, habitaciones o venta) con escenarios *conservador*, *recomendado* y *máximo razonable*.
6. **Decidir la estrategia de comercialización** con total flexibilidad sin exclusividades forzadas:
   - **Opción A:** Gestión Propia (kit completo de anuncio, descripción generada, servicios del entorno, preparación para portales).
   - **Opción B:** Delegación en Inmobiliarias (a través de una *Bolsa / Directorio de Inmobiliarias* independiente de los gremios de mantenimiento, con sistema de solicitud y comparativa de propuestas).
   - **Opción C:** Comercialización Híbrida / Simultánea (el propietario comercializa directamente mientras evalúa propuestas de agencias).

---

## 2. PRINCIPIOS INVARIANTES DEL SISTEMA

| Invariante | Descripción y Regla de Negocio |
|---|---|
| **Identidad Única (`inmuebleId`)** | **Bajo ninguna circunstancia se creará un duplicado del inmueble** ni una ficha secundaria para recomercializarlo. El `inmuebleId` permanece inalterable a lo largo de toda la vida útil del activo. |
| **No Asertividad de la IA** | El motor de visión/análisis documental asistido por IA **nunca** afirmará hechos no verificables con certeza física. Utilizará siempre fórmulas condicionales y sugerentes: *«Se detectan indicios de...»*, *«Podría ser conveniente revisar...»*, *«¿Deseas valorar esta mejora?»*. |
| **Soberanía y Libertad del Propietario** | El sistema sugiere, analiza y compara, pero **la decisión final es siempre del propietario** (ejecución de reformas, fijación del precio, elección del canal de comercialización y aceptación de propuestas). |
| **Separación de Bolsas Profesionales** | La **Bolsa / Directorio de Inmobiliarias** es una entidad arquitectónica independiente y desacoplada del directorio de técnicos y gremios de mantenimiento (`profesionales`). |
| **Transparencia en Recomendación vs. Patrocinio** | Las recomendaciones algorítmicas de la IA basadas en compatibilidad objetiva (zona, especialidad, histórico) se diferencian de forma taxativa de los espacios patrocinados o destacados económicamente. |
| **Transparencia en Fuentes Externas** | Si la plataforma localiza inmobiliarias externas mediante directorios públicos, se etiquetan explícitamente como *«Inmobiliaria externa localizada por la plataforma»*, sin inducir a confusión con *«Inmobiliaria verificada/registrada en la plataforma»*. |
| **Prudencia en Portales Externos (Idealista / Otros)** | No se asume la existencia de API pública o publicación directa sin acuerdo oficial y autorizado. En ausencia de integración validada, se proporciona el flujo *«Preparar anuncio para publicación manual»*. |

---

## 3. FLUJO MAESTRO DE DEPENDENCIAS (CYCLE MAP)

```
[ CONTRATO DE ARRENDAMIENTO VIGENTE ]
                    │
                    ▼
   [ 1. NOTIFICACIÓN DE SALIDA DEL INQUILINO ]
      (Punto de entrada: desde Contrato o desde Ficha del Inmueble)
                    │
                    ▼
   [ 2. CIERRE Y LIQUIDACIÓN CONTRACTUAL ]
      (Fechas de preaviso, salida prevista, entrega de llaves, observaciones)
                    │
                    ▼
   [ 3. REVISIÓN FÍSICA Y FOTOGRAFÍAS ACTUALIZADAS ]
      (Salón, cocina, baños, dormitorios, terraza, exteriores)
                    │
                    ▼
   [ 4. ANÁLISIS ASISTIDO POR IA ]
      (Indicios de desgaste, pintura, iluminación, mobiliario, limpieza)
                    │
                    ▼
   [ 5. CONEXIÓN CON REFORMAS Y OPTIMIZACIÓN ]
      (Presupuestos estimados, impacto en renta/valoración, plazo amortización)
                    │
                    ▼
   [ 6. VALORACIÓN Y PRICING DINÁMICO ]
      (Escenario Conservador / Recomendado / Máximo Razonable para Alquiler o Venta)
                    │
                    ▼
   [ 7. DECISIÓN DE LA ESTRATEGIA DE COMERCIALIZACIÓN ]
                    │
       ┌────────────┴────────────────────────┬─────────────────────────────┐
       ▼                                     ▼                             ▼
 [ OPCIÓN A: GESTIÓN PROPIA ]      [ OPCIÓN B: DELEGAR EN AGENCIA ]   [ OPCIÓN C: AMBAS ]
  • Kit de publicación              • Directorio de Inmobiliarias      • Gestión directa +
  • Redacción del anuncio           • Filtro por zona y especialidad     solicitud simultánea
  • Ficha de servicios del entorno  • Envío de solicitud de propuestas   de propuestas de agencias
  • Exportación para portales       • Comparativa de comisiones/plazos • Sin exclusividad forzosa
       │                                     │                             │
       └─────────────────────────────────────┼─────────────────────────────┘
                                             ▼
                               [ 8. COMERCIALIZACIÓN ACTIVA ]
                                             │
                                             ▼
                               [ 9. CONSECUCIÓN DE CANDIDATO ]
                                             │
                                             ▼
                       [ 10. NUEVO CONTRATO (LAU/HABITACIONES) O VENTA ]
                                (Mismo inmuebleId preserved)
```

---

## 4. DETALLE DE FASES DEL PROCESO

### 4.1. Puntos de Entrada
El flujo se habilitará en la interfaz desde dos accesos convergentes:
1. **Desde la Ficha del Inmueble (`InmueblesSection` / `InmuebleModal`):**
   - Acción: *«Recomercializar Inmueble»*.
2. **Desde el Contrato Actual (`FormalizacionSection` / `PropietarioPortalSection`):**
   - Acción: *«El inquilino me ha comunicado que se va»*.

Ambos puntos invocan la misma máquina de estados, contextualizada con el `inmuebleId` y el `contratoId` activo.

### 4.2. Registro de Salida del Inquilino
Datos requeridos para la trazabilidad jurídica y cronológica:
- `fechaComunicacion`: Fecha en la que el inquilino notificó el desistimiento o fin de contrato.
- `fechaPrevistaSalida`: Fecha pactada para desalojo del inmueble.
- `fechaEntregaLlaves`: Fecha formal de inspección presencial y recepción de llaves.
- `observacionesSalida`: Notas privadas del propietario (estado aparente, acuerdos sobre suministros, fianza).
- `estadoContrato`: Transición de `ACTIVO` a `EN_PROCESO_RESOLUCION` y finalmente a `FINALIZADO_LIQUIDADO`.

### 4.3. Inspección Visual y Carga de Fotografías
El sistema formula la pregunta clave:
> *«¿Deseas actualizar las fotografías de la vivienda para evaluar su estado y optimizar su salida al mercado?»*

Estructura de categorización por estancias:
- Salón / Comedor
- Cocina (mobiliario, electrodomésticos, encimera)
- Baños (sanitarios, grifería, azulejos)
- Dormitorios
- Terraza / Balcón
- Zonas Comunes / Exterior
- Otras zonas (trastero, plaza de garaje)

### 4.4. Motor de Diagnóstico Asistido por IA (Visión y Lenguaje Prudente)
El análisis multimodal procesa las imágenes subidas aplicando **reglas estrictas de lenguaje no asertivo**:
- ❌ **Prohibido:** *«La pared del pasillo tiene humedad y debe picarse de inmediato.»*
- ✅ **Correcto:** *«Se detectan indicios visuales de posible desgaste o decoloración en la pared del pasillo. Podría ser conveniente revisar el estado de la pintura o fontanería antes de publicar.»*
- Categorías de análisis:
  - Pintura y acabados superficiales
  - Nivel de iluminación natural/artificial
  - Estado aparente de electrodomésticos y grifería
  - Modernidad y estado del mobiliario/decoración
  - Limpieza y presentación visual
  - Desperfectos o elementos faltantes visibles

### 4.5. Conexión con "Reformas y Optimización" (Simulador de ROI)
Cada mejora sugerida se cuantifica económicamente:
- **Actuación propuesta:** (Ej. *Pintado integral en blanco neutro + sustitución de tiradores*).
- **Coste estimado:** Rango orientativo (€).
- **Incremento potencial de renta:** (+50 € a +90 €/mes).
- **Incremento potencial de valoración patrimonial:** (+2.000 € a +4.000 €).
- **Plazo estimado de retorno (Payback):** Número de meses de alquiler para amortizar la inversión.
- **Acceso a profesionales:** Botón directo para solicitar presupuesto a técnicos de la bolsa de profesionales homologados (`profesionales`).

### 4.6. Actualización Algorítmica de Precios y Escenarios de Comercialización
El motor de pricing recalcula el valor del activo considerando:
1. Renta del contrato inmediatamente anterior.
2. Evolución del IPC e índices de referencia oficiales del mercado de alquiler aplicables a la zona.
3. Reformas o mejoras confirmadas por el propietario.
4. Muestra de comparables activos en el mismo código postal y tipología.

**Salida para Alquiler:**
- Escenario Conservador (rápida absorción, riesgo mínimo de vacancia).
- Escenario Recomendado (óptimo rentabilidad-plazo).
- Escenario Máximo Razonable (tope del mercado para perfiles de solvencia contrastada).

**Salida para Venta (en caso de optar por desinversión):**
- Horquilla de valoración estimada.
- Precio de salida recomendado.
- Plazo medio de comercialización según el histórico de la zona.

---

## 5. ESTRATEGIAS DE COMERCIALIZACIÓN: MODELO TRIPARTITO

El propietario elige con un selector tripartito, sin bloqueos:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      MODALIDAD DE COMERCIALIZACIÓN                          │
├───────────────────────┬─────────────────────────────┬───────────────────────┤
│  [A] GESTIÓN PROPIA   │ [B] DELEGAR EN INMOBILIARIA │      [C] AMBAS        │
│  "Lo gestiono yo"     │  "Confiar a profesionales"  │  "Comercialización    │
│                       │                             │   simultánea abierta" │
└───────────────────────┴─────────────────────────────┴───────────────────────┘
```

### 5.1. Modalidad A: Gestión Propia
Herramientas suministradas al propietario:
- Generador de títulos atractivos y descripciones enriquecidas con IA basadas en las fortalezas del piso.
- Ficha de amenidades y servicios de proximidad (farmacias, colegios, transporte público, supermercados, parques) estructurada para copiar o sincronizar.
- Kit de fotografías ordenadas y retocadas digitalmente para impacto visual.
- **Integración con Portales Inmobiliarios:**
  - Enfoque pragmático: generación de portapapeles y paquete de descarga manual adaptado a las especificaciones de portales como Idealista, Fotocasa, Habitaclia.
  - Sincronización API directa sujeta a validación futura de acuerdos autorizados.

### 5.2. Modalidad B: Delegación en Inmobiliarias (Bolsa de Inmobiliarias)
Arquitectura de la entidad `Inmobiliaria`:
- Ficha corporativa (marca, CIF, contacto, web, años de experiencia).
- Ámbito geográfico específico (provincias, municipios, distritos y códigos postales de operación).
- Especialidades (residencial habitual, estudiantes, alquiler por habitaciones, venta premium, gestión integral).
- Distinción de estado:
  - `VERIFICADA_PLATAFORMA`: Registrada y validada directamente con acuerdo en vigor.
  - `LOCALIZADA_EXTERNA`: Localizada a través de directorios sectoriales abiertos o fuentes públicas para ofrecer alternativas en zonas con baja densidad de agencias registradas.

### 5.3. Modalidad C: Comercialización Híbrida / Abierta
- El propietario lanza el anuncio de gestión directa para atender llamadas de particulares.
- Simultáneamente, emite solicitudes de propuesta (*RFPs*) a agencias seleccionadas de la zona.
- **Regla:** No se impone exclusividad de corretaje en el software.

### 5.4. Sistema de Solicitud y Comparativa de Propuestas (RFPs)
El propietario puede marcar hasta *N* inmobiliarias recomendadas por compatibilidad y enviarles la ficha del activo para recibir:
- Comisión u honorarios de intermediación (% sobre venta o meses de renta).
- Plazo estimado de consecución de inquilino o comprador.
- Servicios incluidos (reportaje fotográfico profesional, tour 3D, filtro de solvencia, seguro de impago, redacción de contrato).
- Estrategia de difusión propuesta.

---

## 6. GENERACIÓN DE LEADS, MONETIZACIÓN Y PUBLICIDAD

### 6.1. Circuito de Generación de Leads Inmobiliarios
1. Propietario pulsa *«Solicitar contacto con esta inmobiliaria»*.
2. Registro de la solicitud en la colección `leads_inmobiliarios` con: `inmuebleId`, `propietarioId`, `inmobiliariaId`, fecha, estado y canal preferente.
3. Se muestra el aviso de procedencia:
   > *«Al contactar, indica que procedes de [Nombre Plataforma] para beneficiarte de las condiciones especiales acordadas.»*

### 6.2. Modelo de Patrocinio Ético y Transparente
- Soporte para agencias destacadas por código postal o provincia.
- **Restricción algorítmica inviolable:** El algoritmo de recomendación nunca etiquetará una agencia patrocinada como *«Recomendada por compatibilidad»*. Toda posición condicionada comercialmente llevará el distintivo visible *«Patrocinado»*.

---

## 7. ESPECIFICACIÓN DE TIPOS Y MODELOS DE DATOS FUTUROS (TYPESCRIPT DRAFT)

*Nota: Estos tipos quedan definidos en esta especificación documental y se incorporarán a `src/types.ts` en la fase de implementación funcional.*

```typescript
// Estado del ciclo de recomercialización
export type EstadoRecomercializacion =
  | 'BORRADOR'
  | 'SALIDA_NOTIFICADA'
  | 'REVISION_PENDIENTE'
  | 'FOTOS_ACTUALIZADAS'
  | 'VALORACION_COMPLETADA'
  | 'DECISION_ESTRATEGIA'
  | 'EN_COMERCIALIZACION'
  | 'CERRADO_REARRENDADO'
  | 'CERRADO_VENDIDO'
  | 'CANCELADO';

export type DestinoInmueble =
  | 'ALQUILER_TRADICIONAL'
  | 'ALQUILER_HABITACIONES'
  | 'ALQUILER_TEMPORAL'
  | 'VENTA'
  | 'INDECISO';

export type ModalidadComercializacion =
  | 'GESTION_PROPIA'
  | 'INMOBILIARIA'
  | 'AMBAS';

// Expediente de recomercialización vinculado al inmueble
export interface ExpedienteRecomercializacion {
  id: string;
  inmuebleId: string; // INVARIANTE: Reutiliza el mismo inmuebleId
  propietarioId: string;
  contratoAnteriorId?: string;
  fechaInicio: string; // ISO-8601
  estado: EstadoRecomercializacion;
  destinoPrevisto: DestinoInmueble;
  modalidadElegida?: ModalidadComercializacion;

  // Datos de salida del inquilino anterior
  datosSalida: {
    fechaComunicacion: string;
    fechaPrevistaSalida: string;
    fechaEntregaLlaves?: string;
    observaciones?: string;
    depositoFianzaADevolver?: number;
  };

  // Fotografías y estado
  revisionFotografica: {
    fechaCarga?: string;
    fotografias: {
      estancia: 'salon' | 'cocina' | 'bano' | 'dormitorio' | 'terraza' | 'exterior' | 'otro';
      url: string;
      fecha: string;
      analisisIa?: {
        observaciones: string[]; // Redacción no asertiva
        sugerenciasMejora: string[];
      };
    }[];
  };

  // Valoración económica
  pricing: {
    rentaAnterior?: number;
    escenarioConservador: number;
    escenarioRecomendado: number;
    escenarioMaximo: number;
    valoracionVentaEstimada?: number;
    fechaCalculo: string;
  };

  // Comercialización
  comercializacion: {
    inmobiliariasContactadasIds: string[];
    enlaceAnuncioManualGenerado: boolean;
    fechaPublicacion?: string;
  };

  createdAt: string;
  updatedAt: string;
}

// Directorio de Inmobiliarias
export interface InmobiliariaDirectorio {
  id: string;
  nombreComercial: string;
  razonSocial?: string;
  cifNif?: string;
  logoUrl?: string;
  telefono: string;
  email: string;
  web?: string;
  
  // Cobertura
  localidad: string;
  provincia: string;
  codigosPostales: string[];
  
  // Servicios y Especialidades
  operaVenta: boolean;
  operaAlquiler: boolean;
  operaHabitaciones: boolean;
  especialidades: string[];
  comisionMediaVenta?: string;
  comisionMediaAlquiler?: string;

  // Estado y Verificación
  origen: 'REGISTRADA_EN_PLATAFORMA' | 'LOCALIZADA_EXTERNA';
  verificada: boolean;
  esPatrocinada: boolean;
  activo: boolean;
  
  createdAt: string;
}

// Propuestas emitidas por Inmobiliarias
export interface PropuestaInmobiliaria {
  id: string;
  expedienteId: string;
  inmuebleId: string;
  inmobiliariaId: string;
  propietarioId: string;
  fechaPropuesta: string;
  honorariosPropuestos: string;
  plazoEstimadoDias: number;
  serviciosIncluidos: string[];
  estrategiaResumen: string;
  estado: 'PENDIENTE' | 'ACEPTADA' | 'RECHAZADA' | 'EXPIRADA';
}

// Registro de Lead de Intermediación
export interface LeadInmobiliario {
  id: string;
  inmuebleId: string;
  propietarioId: string;
  inmobiliariaId: string;
  fechaSolicitud: string;
  tipoOperacion: 'ALQUILER' | 'VENTA' | 'HABITACIONES';
  estado: 'SOLICITADO' | 'CONTACTADO' | 'ACUERDO_FIRMADO' | 'DESCARTADO';
  notas?: string;
}
```

---

## 8. RELACIÓN Y COMPATIBILIDAD CON LOS MÓDULOS EXISTENTES

| Módulo Existente | Tipo de Integración y Garantía de Compatibilidad |
|---|---|
| **`InmueblesSection` / `InmuebleModal`** | **Núcleo del activo:** Reutiliza el mismo `inmuebleId`. El histórico de inquilinos y fotografías se conserva íntegro; la recomercialización añade una nueva época o estado al historial. |
| **`FormalizacionSection` (Contratos)** | **Disparador:** La notificación de salida vincula el `contratoId` saliente con el nuevo `ExpedienteRecomercializacion` sin romper las cláusulas ni firmas del contrato anterior. |
| **`PropietarioPortalSection`** | **Panel de control del propietario:** Muestra el widget de estado del activo en transición y las comparativas de propuestas de agencias. |
| **`AdministracionSection`** | **Gobernanza:** Gestión de la nueva *Bolsa de Inmobiliarias*, diferenciada de los profesionales técnicos (`profesionales`). |
| **`PreseleccionadosSection` / `CandidatosSection`** | **Fase final de comercialización:** Una vez publicado para nuevo alquiler, los nuevos candidatos ingresan al circuito estándar de scoring, visitas y seguro de impago. |
| **Seguro de Impago (SEAG / Aseguradoras)** | **Preservación:** No se altera el protocolo de aseguradoras. La nueva renta validada se transmitirá a la aseguradora cuando haya nuevo candidato finalista. |

---

## 9. DECLARACIÓN DE NO MODIFICACIÓN Y LÍMITES DE ESTA FASE

En cumplimiento estricto de las directrices:
- ❌ **NO se han modificado contratos en ejecución.**
- ❌ **NO se han modificado candidatos ni preselección.**
- ❌ **NO se ha modificado la agenda de visitas.**
- ❌ **NO se han alterado las integraciones de correo ni aseguradoras.**
- ❌ **NO se ha modificado el modelo de datos activo de inmuebles.**
- ❌ **NO se han alterado las reglas de seguridad (`firestore.rules`).**
- ❌ **NO se ha tocado Firebase Authentication ni los permisos RBAC.**
- ❌ **NO se han ejecutado commits, pushes ni despliegues.**

---

## 10. HOJA DE RUTA PARA LA IMPLEMENTACIÓN FUNCIONAL FUTURA

1. **Fase 1 (Tipos y Esquemas de Base de Datos):** Creación de colecciones `expedientes_recomercializacion` e `inmobiliarias_directorio` en `firebase-blueprint.json` y actualización de `src/types.ts`.
2. **Fase 2 (Seguridad y Reglas):** Incorporación en `firestore.rules` de permisos de lectura y escritura controlados para propietarios y agencias verificadas.
3. **Fase 3 (Puntos de Entrada UI):** Integración de botones de acción en `InmueblesSection` y `FormalizacionSection` con modales contextuales guiados.
4. **Fase 4 (Subida e Inspección Visual Asistida):** Módulo de subida de fotos por estancias y prompt estructurado en el servidor (`server.ts`) para el análisis con lenguaje prudente.
5. **Fase 5 (Bolsa de Inmobiliarias y RFPs):** Panel de búsqueda, recomendación por algoritmo y envío seguro de propuestas sin exclusividad.
