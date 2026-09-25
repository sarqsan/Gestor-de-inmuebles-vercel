/**
 * GAP 5 · FASE 1 — HUECO 3: errores de validación ESTRUCTURADOS + validación de imágenes.
 * ------------------------------------------------------------------------------------
 * No sustituye ni duplica la validación del motor existente: la COMPONE.
 *   1. Se llama a `validarPublicacion` (src/utils/publicacionEngine.ts), que sigue
 *      siendo la dueña de las reglas (su contrato `{valido, erroresBloqueantes,
 *      advertencias}` NO cambia: los adaptadores actuales siguen igual).
 *   2. Cada mensaje se traduce por TABLA_DE_CODIGOS a `{codigo, campo, severidad,
 *      categoria}`. La traducción es por IGUALDAD EXACTA del mensaje (no por regex),
 *      así que no puede reinterpretar semántica.
 *   3. Se añaden las comprobaciones que faltaban y que el modelo ya exigía: las de
 *      IMÁGENES (estructura, URL utilizable, prohibición de data-URL/base64, orden,
 *      portada, duplicidades).
 *
 * `origen` conserva el objeto literal del motor y `aValidacionLegado()` permite volver
 * a él: la conversión no pierde información en ningún sentido (verificado por tests).
 * Un mensaje nuevo en el motor sin código asignado cae a `SIN_CLASIFICAR` y el test de
 * cobertura lo detecta: es el cerrojo que evita que la tabla se quede obsoleta.
 *
 * Cero dependencias de portal: nada aquí sabe qué exige Idealista, Fotocasa,
 * Habitaclia o Kyero; sólo qué exige el modelo publicable para poder representarse.
 */
import type { PublicacionInmueble, ValidacionPublicacion } from '../types';
import { validarPublicacion } from '../utils/publicacionEngine';

export type SeveridadValidacion = 'BLOQUEANTE' | 'ADVERTENCIA';

export type CategoriaValidacion =
  | 'ESTRUCTURA'
  | 'OBLIGATORIO_AUSENTE'
  | 'VALOR_INVALIDO'
  | 'VALOR_INCOMPATIBLE'
  | 'IMAGEN'
  | 'CONTENIDO';

export interface ErrorValidacionEstructurado {
  /** Código ESTABLE: lo que consumen los adaptadores para decidir (no el texto). */
  codigo: string;
  /** Campo afectado, cuando la regla es de un campo concreto. */
  campo?: string;
  /** Índice dentro de un array (imágenes, habitaciones). */
  indice?: number;
  severidad: SeveridadValidacion;
  categoria: CategoriaValidacion;
  /** Mensaje del motor (o generado aquí): legible y SIN información perdida. */
  mensaje: string;
}

export interface ValidacionEstructurada {
  estado: 'VALIDO' | 'INVALIDO';
  /** Sólo severidad BLOQUEANTE. */
  errores: ErrorValidacionEstructurado[];
  /** Sólo severidad ADVERTENCIA. */
  advertencias: ErrorValidacionEstructurado[];
  /** Objeto literal devuelto por `validarPublicacion`: se conserva tal cual. */
  origen: ValidacionPublicacion;
  resumen: string;
}

interface ReglaCodigo {
  codigo: string;
  campo?: string;
  categoria: CategoriaValidacion;
}

/** Mensaje literal del motor → código estable. La clave debe coincidir EXACTAMENTE. */
const TABLA_DE_CODIGOS: Record<string, ReglaCodigo> = {
  'Identificador de inmueble inexistente.': { codigo: 'IDENTIFICADOR_AUSENTE', campo: 'inmuebleId', categoria: 'OBLIGATORIO_AUSENTE' },
  'Identificador público inexistente.': { codigo: 'IDENTIFICADOR_PUBLICO_AUSENTE', campo: 'idPublico', categoria: 'OBLIGATORIO_AUSENTE' },
  'Precio inválido: debe ser un número positivo.': { codigo: 'PRECIO_NO_POSITIVO', campo: 'precioMensual', categoria: 'VALOR_INVALIDO' },
  'Ubicación esencial ausente: falta la dirección.': { codigo: 'DIRECCION_AUSENTE', campo: 'direccion', categoria: 'OBLIGATORIO_AUSENTE' },
  'Ubicación esencial ausente: falta el municipio.': { codigo: 'MUNICIPIO_AUSENTE', campo: 'municipio', categoria: 'OBLIGATORIO_AUSENTE' },
  'Referencia interna inexistente.': { codigo: 'REFERENCIA_AUSENTE', campo: 'referenciaInterna', categoria: 'OBLIGATORIO_AUSENTE' },
  'Datos incompatibles: superficie no positiva.': { codigo: 'SUPERFICIE_NO_POSITIVA', campo: 'superficieM2', categoria: 'VALOR_INCOMPATIBLE' },
  'Sin imágenes: el anuncio se publicará sin fotografías.': { codigo: 'SIN_IMAGENES', campo: 'imagenes', categoria: 'IMAGEN' },
  'Descripción ausente o demasiado corta (menos de 40 caracteres).': {
    codigo: 'DESCRIPCION_INSUFICIENTE',
    campo: 'descripcion',
    categoria: 'CONTENIDO',
  },
  'Provincia no informada.': { codigo: 'PROVINCIA_AUSENTE', campo: 'provincia', categoria: 'OBLIGATORIO_AUSENTE' },
  'Tipo de inmueble no informado.': { codigo: 'TIPO_INMUEBLE_AUSENTE', campo: 'tipoInmueble', categoria: 'OBLIGATORIO_AUSENTE' },
  'Código postal no informado.': { codigo: 'CODIGO_POSTAL_AUSENTE', campo: 'codigoPostal', categoria: 'OBLIGATORIO_AUSENTE' },
  'Modalidad habitaciones sin habitaciones registradas en la publicación.': {
    codigo: 'HABITACIONES_SIN_REGISTRO',
    campo: 'habitacionesPublicables',
    categoria: 'VALOR_INCOMPATIBLE',
  },
  'Ninguna habitación figura como disponible actualmente.': {
    codigo: 'HABITACIONES_NINGUNA_DISPONIBLE',
    campo: 'habitacionesPublicables',
    categoria: 'CONTENIDO',
  },
};

/** Expuesta para el test de cobertura (que ningún mensaje del motor se quede sin código). */
export const TABLA_MENSAJES_Y_CODIGOS: Readonly<Record<string, ReglaCodigo>> = TABLA_DE_CODIGOS;

function clasificar(mensaje: string, severidad: SeveridadValidacion): ErrorValidacionEstructurado {
  const regla = TABLA_DE_CODIGOS[mensaje];
  if (!regla) {
    return {
      codigo: 'SIN_CLASIFICAR',
      severidad,
      categoria: 'ESTRUCTURA',
      mensaje,
    };
  }
  const error: ErrorValidacionEstructurado = {
    codigo: regla.codigo,
    severidad,
    categoria: regla.categoria,
    mensaje,
  };
  if (regla.campo) error.campo = regla.campo;
  return error;
}

/** Traducción de los strings del motor a errores estructurados (ida y vuelta sin pérdida). */
export function mensajesAEstructurados(validacion: ValidacionPublicacion): ErrorValidacionEstructurado[] {
  return [
    ...validacion.erroresBloqueantes.map((m) => clasificar(m, 'BLOQUEANTE')),
    ...validacion.advertencias.map((m) => clasificar(m, 'ADVERTENCIA')),
  ];
}

const URL_ABSOLUTA = /^https?:\/\/\S+$/i;

/**
 * Validación específica de imágenes del MODELO publicable (no de un portal):
 * estructura, URL representable, prohibición de incrustar bytes (data-URL/base64),
 * orden utilizable y portada ambigua.
 */
export function validarImagenesPublicables(pub: PublicacionInmueble): ErrorValidacionEstructurado[] {
  const errores: ErrorValidacionEstructurado[] = [];
  const imagenes = pub?.imagenes as unknown;

  if (!Array.isArray(imagenes)) {
    errores.push({
      codigo: 'IMAGENES_ESTRUCTURA_INVALIDA',
      campo: 'imagenes',
      severidad: 'BLOQUEANTE',
      categoria: 'ESTRUCTURA',
      mensaje: 'Las imágenes deben ser un array en el modelo publicable.',
    });
    return errores;
  }

  let portadas = 0;
  const vistosUrl = new Map<string, number>();
  const vistosOrden = new Map<number, number>();

  imagenes.forEach((bruta, indice) => {
    const imagen = bruta as { url?: unknown; orden?: unknown; portada?: unknown; estadoPublicacion?: unknown };
    if (typeof imagen !== 'object' || imagen === null) {
      errores.push({
        codigo: 'IMAGEN_ESTRUCTURA_INVALIDA',
        campo: 'imagenes',
        indice,
        severidad: 'BLOQUEANTE',
        categoria: 'ESTRUCTURA',
        mensaje: `Imagen ${indice}: debe ser un objeto con url, orden y portada.`,
      });
      return;
    }

    const url = typeof imagen.url === 'string' ? imagen.url.trim() : '';
    if (url.length === 0) {
      errores.push({
        codigo: 'IMAGEN_URL_AUSENTE',
        campo: 'imagenes',
        indice,
        severidad: 'BLOQUEANTE',
        categoria: 'IMAGEN',
        mensaje: `Imagen ${indice}: falta la URL de la imagen.`,
      });
    } else if (url.startsWith('data:')) {
      errores.push({
        codigo: 'IMAGEN_URL_INCRUSTADA_PROHIBIDA',
        campo: 'imagenes',
        indice,
        severidad: 'BLOQUEANTE',
        categoria: 'IMAGEN',
        mensaje: `Imagen ${indice}: las data-URL/base64 no son referencias publicables; debe ser una URL de Storage.`,
      });
    } else if (/\s/.test(url)) {
      errores.push({
        codigo: 'IMAGEN_URL_INVALIDA',
        campo: 'imagenes',
        indice,
        severidad: 'BLOQUEANTE',
        categoria: 'IMAGEN',
        mensaje: `Imagen ${indice}: la URL no puede contener espacios ni saltos.`,
      });
    } else if (!URL_ABSOLUTA.test(url)) {
      errores.push({
        codigo: 'IMAGEN_URL_NO_ABSOLUTA',
        campo: 'imagenes',
        indice,
        severidad: 'BLOQUEANTE',
        categoria: 'IMAGEN',
        mensaje: `Imagen ${indice}: la URL debe ser absoluta http(s).`,
      });
    } else {
      const previo = vistosUrl.get(url);
      if (previo !== undefined) {
        errores.push({
          codigo: 'IMAGEN_URL_DUPLICADA',
          campo: 'imagenes',
          indice,
          severidad: 'ADVERTENCIA',
          categoria: 'IMAGEN',
          mensaje: `Imagen ${indice}: la misma URL ya aparece en la posición ${previo}.`,
        });
      }
      vistosUrl.set(url, indice);
    }

    const orden = imagen.orden as number;
    if (typeof orden !== 'number' || !Number.isInteger(orden) || orden < 0) {
      errores.push({
        codigo: 'IMAGEN_ORDEN_INVALIDO',
        campo: 'imagenes',
        indice,
        severidad: 'BLOQUEANTE',
        categoria: 'IMAGEN',
        mensaje: `Imagen ${indice}: el orden debe ser un entero >= 0 para poder representarse en el feed.`,
      });
    } else {
      const previo = vistosOrden.get(orden);
      if (previo !== undefined) {
        errores.push({
          codigo: 'IMAGEN_ORDEN_DUPLICADO',
          campo: 'imagenes',
          indice,
          severidad: 'ADVERTENCIA',
          categoria: 'IMAGEN',
          mensaje: `Imagen ${indice}: orden repetido con la posición ${previo}.`,
        });
      }
      vistosOrden.set(orden, indice);
    }

    if (imagen.portada === true) portadas++;

    if (
      imagen.estadoPublicacion !== undefined &&
      !['PENDIENTE', 'PUBLICADA', 'RECHAZADA'].includes(String(imagen.estadoPublicacion))
    ) {
      errores.push({
        codigo: 'IMAGEN_ESTADO_INVALIDO',
        campo: 'imagenes',
        indice,
        severidad: 'ADVERTENCIA',
        categoria: 'IMAGEN',
        mensaje: `Imagen ${indice}: estadoPublicación no reconocido (${String(imagen.estadoPublicacion)}).`,
      });
    }
  });

  if (portadas > 1) {
    errores.push({
      codigo: 'IMAGEN_PORTADA_AMBIGUA',
      campo: 'imagenes',
      severidad: 'ADVERTENCIA',
      categoria: 'IMAGEN',
      mensaje: `Hay ${portadas} imágenes marcadas como portada: se usará la primera del orden canónico.`,
    });
  }

  return errores;
}

/** Validación estructurada completa: motor existente + capa de imágenes. */
export function validarModeloPublicable(pub: PublicacionInmueble): ValidacionEstructurada {
  const sinModelo = typeof pub !== 'object' || pub === null;
  const origen: ValidacionPublicacion = sinModelo
    ? { valido: false, erroresBloqueantes: ['Identificador de inmueble inexistente.'], advertencias: [] }
    : validarPublicacion(pub);

  const estructurados = mensajesAEstructurados(origen);
  const deImagenes = sinModelo ? [] : validarImagenesPublicables(pub);
  const todos = [...estructurados, ...deImagenes];
  const errores = todos.filter((e) => e.severidad === 'BLOQUEANTE');
  const advertencias = todos.filter((e) => e.severidad === 'ADVERTENCIA');

  return {
    estado: errores.length === 0 ? 'VALIDO' : 'INVALIDO',
    errores,
    advertencias,
    origen,
    resumen: `${errores.length} bloqueante(s), ${advertencias.length} advertencia(s)`,
  };
}

/** Vuelta al contrato del motor (para que el código existente siga pudiendo consumir el resultado). */
export function aValidacionLegado(validacion: ValidacionEstructurada): ValidacionPublicacion {
  return {
    valido: validacion.estado === 'VALIDO',
    erroresBloqueantes: validacion.errores.map((e) => e.mensaje),
    advertencias: validacion.advertencias.map((e) => e.mensaje),
  };
}

/** Código(s) estable(s) de una validación: lo que un adaptador usa para decidir sin parsear textos. */
export function codigosDeValidacion(validacion: ValidacionEstructurada, severidad?: SeveridadValidacion): string[] {
  const lista = severidad === 'BLOQUEANTE' ? validacion.errores : severidad === 'ADVERTENCIA' ? validacion.advertencias : [...validacion.errores, ...validacion.advertencias];
  return [...new Set(lista.map((e) => e.codigo))].sort();
}
