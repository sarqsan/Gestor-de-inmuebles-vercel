/**
 * GAP 5 · FASE 1 — núcleo interno de sindicación (`src/sindicacion/**`).
 * ---------------------------------------------------------------------
 * Cubre los cuatro huecos (hash+versionado, decisor de idempotencia, errores
 * estructurados + imágenes, contrato de adaptador) y el AISLAMIENTO: cero red,
 * cero Firestore, cero Storage, cero persistencia de estados, cero publicación
 * real, inmuebles intactos, y `materializarFichasPublicas`/DRY-RUN sin tocar.
 *
 * No toca ningún fichero existente: importa el motor y comprueba que el módulo
 * nuevo lo COMPONE (mismas huellas, mismos externalId, mismos mensajes).
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { HabitacionInmueble, ImagenPublicacion, Inmueble, PortalInmobiliario, PublicacionInmueble } from '../src/types';
import { buildPublicacionInmueble, generarIdPublicoInmueble, hashEstable, identidadPublicacionPortal, validarPublicacion } from '../src/utils/publicacionEngine';
import { generarFeedXmlKyero } from '../src/utils/publicacionXml';
import { PORTALES_DISPONIBLES } from '../src/utils/publicacionPortales';
import {
  ADAPTADORES_SINDICACION_FASE1,
  CLAVES_NO_CONTENIDO,
  CLAVES_NO_CONTENIDO_IMAGEN,
  OPERACIONES_ADAPTADOR,
  TABLA_MENSAJES_Y_CODIGOS,
  aValidacionLegado,
  auditarContratoAdaptador,
  calcularVersionPublicable,
  camposQueCambiaron,
  codigosDeValidacion,
  contenidoPublicableIdentico,
  contextoParaAdaptador,
  crearAdaptador,
  crearAdaptadorNoConectado,
  erroresDeDecision,
  estadoAdaptadores,
  exportarFeed,
  ejecutarOperacion,
  formaCanonicaPublicable,
  hashDeContenidoPublicable,
  huellaCortaDeContenido,
  identidadEnPortal,
  identidadEstableInmueble,
  mensajesAEstructurados,
  operacionDeAccion,
  representacionCanonica,
  requiereEnvio,
  resolverAccionSindicacion,
  sanearContexto,
  versionesIguales,
  validarImagenesPublicables,
  validarModeloPublicable,
  VERSION_CONTRATO_ADAPTADOR,
  type DecisionSindicacion,
  type InstantaneaPublicada,
  type VersionPublicable,
} from '../src/sindicacion';

// ---------------------------------------------------------------------------
// Fixtures: se construyen SIEMPRE con el motor existente (fuente de verdad).
// ---------------------------------------------------------------------------
const inm = (p: Partial<Inmueble> = {}): Inmueble =>
  ({
    id: 'inm-A',
    direccion: 'Calle Sol 1 & 2',
    ciudad: 'Alicante',
    provincia: 'Alicante',
    codigoPostal: '03001',
    precio: 950,
    estado: 'disponible',
    habitaciones: 3,
    banos: 2,
    superficie: 90,
    descripcion: 'Piso luminoso con terraza cerca del mar y del centro de Alicante.',
    candidatosCount: 0,
    fianzaMeses: 1,
    propietarioId: 'prop-A',
    tipoInmueble: 'piso',
    ascensor: true,
    terraza: true,
    referenciaCatastral: '1234567AB1234C',
    images: [
      { id: 'i1', storagePath: 'a', downloadURL: 'https://storage.example.com/a.jpg', order: 1, isCover: true, isPublic: true, createdAt: '' },
      { id: 'i2', storagePath: 'b', downloadURL: 'https://storage.example.com/b.jpg', order: 0, isCover: false, isPublic: true, createdAt: '' },
      { id: 'i3', storagePath: 'c', downloadURL: 'https://storage.example.com/c.jpg', order: 2, isCover: false, isPublic: false, createdAt: '' },
    ],
    ...p,
  }) as Inmueble;

const hab = (id: string, p: Partial<HabitacionInmueble> = {}): HabitacionInmueble => ({
  id,
  inmuebleId: 'inm-A',
  propietarioId: 'prop-A',
  nombre: `Hab ${id}`,
  estado: 'DISPONIBLE',
  activo: true,
  superficie: 12,
  precioObjetivo: 350,
  fechaAlta: '',
  fechaModificacion: '',
  creadoPor: 'P',
  actualizadoPor: 'P',
  historial: [],
  ...p,
});

const pub = (p: Partial<Inmueble> = {}, habitaciones?: HabitacionInmueble[]): PublicacionInmueble => buildPublicacionInmueble(inm(p), habitaciones);

/** Claves en orden invertido: mismo contenido, objeto distinto. */
function barajar<T extends object>(o: T): T {
  const claves = Object.keys(o).reverse();
  const salida: Record<string, unknown> = {};
  for (const clave of claves) salida[clave] = (o as Record<string, unknown>)[clave];
  return salida as T;
}

const conImagenes = (imagenes: ImagenPublicacion[], base?: PublicacionInmueble): PublicacionInmueble =>
  ({ ...(base || pub()), imagenes }) as PublicacionInmueble;

const DIR = path.resolve(__dirname, '../src/sindicacion');
/** El código sin comentarios: lo que de verdad se ejecuta (un comentario no abre una conexión). */
function sinComentarios(codigo: string): string {
  return codigo.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}
const FUENTES = readdirSync(DIR)
  .filter((f) => f.endsWith('.ts'))
  .map((f) => {
    const codigo = readFileSync(path.join(DIR, f), 'utf8');
    return { nombre: f, codigo, ejecutable: sinComentarios(codigo) };
  });

// ===========================================================================
describe('GAP5-F1 · A. Hash canónico y versionado del contenido publicable', () => {
  it('A.1 mismo contenido con las claves en otro orden ⇒ misma huella y misma forma canónica', () => {
    const a = pub();
    const b = barajar(pub());
    expect(a).not.toBe(b);
    expect(Object.keys(a)).not.toEqual(Object.keys(b));
    expect(representacionCanonica(a)).toBe(representacionCanonica(b));
    expect(hashDeContenidoPublicable(a)).toBe(hashDeContenidoPublicable(b));
    expect(calcularVersionPublicable(a)).toEqual(calcularVersionPublicable(b));
  });

  it('A.2 cambio relevante (precio, descripción, superficie, imágenes) ⇒ huella distinta', () => {
    const base = hashDeContenidoPublicable(pub());
    const casos: Array<[string, PublicacionInmueble]> = [
      ['precio', pub({ precio: 960 })],
      ['descripcion', pub({ descripcion: 'Otro texto descriptivo suficientemente largo para la validación del feed.' })],
      ['superficie', pub({ superficie: 95 })],
      ['imagenes', conImagenes([{ url: 'https://storage.example.com/z.jpg', orden: 0, portada: true }])],
    ];
    for (const [nombre, alternativa] of casos) {
      expect(hashDeContenidoPublicable(alternativa), nombre).not.toBe(base);
    }
  });

  it('A.3 ruido inocuo NO cambia la huella (espacios, vacío≠ausente, metadatos, orden de conjuntos)', () => {
    const base = pub();
    // 1) espacios y saltos en textos libres
    const espacios = { ...base, descripcion: `  ${base.descripcion}\n\n `, titulo: `  ${base.titulo}  ` };
    expect(hashDeContenidoPublicable(espacios)).toBe(hashDeContenidoPublicable(base));
    // 2) clave vacía / null === clave ausente
    expect(hashDeContenidoPublicable({ ...base, planta: '' })).toBe(hashDeContenidoPublicable(base));
    expect(hashDeContenidoPublicable({ ...base, planta: null as unknown as string })).toBe(hashDeContenidoPublicable(base));
    expect(hashDeContenidoPublicable({ ...base, planta: undefined })).toBe(hashDeContenidoPublicable(base));
    // 3) metadato de generación excluido (documentado en CLAVES_NO_CONTENIDO)
    expect(CLAVES_NO_CONTENIDO).toEqual(['generadoEn']);
    expect(hashDeContenidoPublicable({ ...base, generadoEn: '2020-01-01T00:00:00.000Z' })).toBe(hashDeContenidoPublicable(base));
    // 4) características: orden y duplicados no son contenido
    const reordenadas = { ...base, caracteristicas: [...base.caracteristicas].reverse() };
    const duplicadas = { ...base, caracteristicas: [...base.caracteristicas, ...base.caracteristicas] };
    expect(hashDeContenidoPublicable(reordenadas)).toBe(hashDeContenidoPublicable(base));
    expect(hashDeContenidoPublicable(duplicadas)).toBe(hashDeContenidoPublicable(base));
    // 5) habitaciones: el orden de llegada no es contenido
    const habs = [hab('h1'), hab('h2'), hab('h3')];
    expect(hashDeContenidoPublicable(pub({}, habs))).toBe(hashDeContenidoPublicable(pub({}, [...habs].reverse())));
    // 6) imágenes: el orden de llegada tampoco (portada y `orden` sí)
    const rotadas = { ...base, imagenes: [...base.imagenes].reverse() };
    expect(hashDeContenidoPublicable(rotadas)).toBe(hashDeContenidoPublicable(base));
    // 7) metadato por imagen excluido
    expect(CLAVES_NO_CONTENIDO_IMAGEN).toEqual(['estadoPublicacion']);
    const conEstado = { ...base, imagenes: base.imagenes.map((i, idx) => ({ ...i, estadoPublicacion: (idx === 0 ? 'PUBLICADA' : 'PENDIENTE') as 'PUBLICADA' | 'PENDIENTE' })) };
    expect(hashDeContenidoPublicable(conEstado)).toBe(hashDeContenidoPublicable(base));
  });

  it('A.3bis orden de conjuntos y arrays: payloads hechas a mano (fuera del motor) tampoco generan versión falsa', () => {
    // El hash se va a usar también con publicaciones persistidas/recargadas, que no pasan
    // por `buildPublicacionInmueble`: la canonización tiene que ser estable por sí sola.
    const base = pub();
    const imgA = { url: 'https://cdn.example.com/a.jpg', orden: 0, portada: false } as ImagenPublicacion;
    const imgB = { url: 'https://cdn.example.com/b.jpg', orden: 1, portada: false } as ImagenPublicacion;
    expect(hashDeContenidoPublicable({ ...base, imagenes: [imgA, imgB] } as PublicacionInmueble)).toBe(
      hashDeContenidoPublicable({ ...base, imagenes: [imgB, imgA] } as PublicacionInmueble),
    );
    // la portada y el `orden` SÍ son contenido: invertirlos cambia la huella
    expect(hashDeContenidoPublicable({ ...base, imagenes: [{ ...imgA, portada: true }, imgB] } as PublicacionInmueble)).not.toBe(
      hashDeContenidoPublicable({ ...base, imagenes: [imgA, { ...imgB, portada: true }] } as PublicacionInmueble),
    );
    expect(hashDeContenidoPublicable({ ...base, imagenes: [{ ...imgA, orden: 5 }, imgB] } as PublicacionInmueble)).not.toBe(
      hashDeContenidoPublicable({ ...base, imagenes: [imgA, imgB] } as PublicacionInmueble),
    );
    // habitaciones: orden de llegada irrelevante; el contenido de cada una no
    const h1 = { habitacionId: 'h1', nombre: 'Uno', disponible: true };
    const h2 = { habitacionId: 'h2', nombre: 'Dos', disponible: true, precioMensual: 400 };
    const habPub = (habs: unknown[]) =>
      ({ ...base, modalidadAlquiler: 'habitaciones', habitacionesPublicables: habs }) as unknown as PublicacionInmueble;
    expect(hashDeContenidoPublicable(habPub([h1, h2]))).toBe(hashDeContenidoPublicable(habPub([h2, h1])));
    expect(hashDeContenidoPublicable(habPub([h1, h2]))).not.toBe(hashDeContenidoPublicable(habPub([h1, { ...h2, precioMensual: 410 }])));
    // características: conjunto, no secuencia
    expect(hashDeContenidoPublicable({ ...base, caracteristicas: ['Ascensor', 'Terraza'] })).toBe(
      hashDeContenidoPublicable({ ...base, caracteristicas: ['Terraza', 'Ascensor', 'Terraza'] }),
    );
    // y la decisión de idempotencia hereda esa estabilidad
    expect(
      resolverAccionSindicacion({
        publicacion: habPub([h2, h1]),
        portal: 'IDEALISTA',
        publicada: { version: calcularVersionPublicable(habPub([h1, h2])) },
      }).accion,
    ).toBe('SIN_CAMBIOS');
  });

  it('A.4 la identidad es ESTABLE y separada del hash del contenido', () => {
    const original = pub();
    const modificado = pub({ precio: 1200, descripcion: 'Descripción nueva, más larga que la mínima exigida por la validación del feed.' });
    const idA = identidadEstableInmueble(inm());
    const idB = identidadEstableInmueble(inm({ precio: 1200, descripcion: modificado.descripcion }));
    expect(idA).toEqual(idB);
    expect(idA.idPublico).toBe(generarIdPublicoInmueble('inm-A'));
    expect(idA.referenciaInterna).toBe('1234567AB1234C');
    // sin referencia catastral el motor aplica su fallback documentado (ERP-<id>)
    expect(identidadEstableInmueble(inm({ referenciaCatastral: undefined })).referenciaInterna).toBe('ERP-inm-A');
    // cambiar el identificador sí cambia la identidad (no se puede 'renombrar' un inmueble)
    expect(identidadEstableInmueble(inm({ id: 'inm-B', referenciaCatastral: '9999999ZZ9999Z' })).idPublico).not.toBe(idA.idPublico);
    // y el hash, en cambio, SÍ cambia con el contenido
    expect(hashDeContenidoPublicable(original)).not.toBe(hashDeContenidoPublicable(modificado));
    // identidad por portal: estable frente al contenido, distinta entre portales
    expect(identidadEnPortal('inm-A', 'KYERO')).toEqual(identidadPublicacionPortal('inm-A', 'KYERO'));
    expect(identidadEnPortal('inm-A', 'KYERO').externalId).toBe(identidadEnPortal('inm-A', 'KYERO').externalId);
    expect(identidadEnPortal('inm-A', 'KYERO').externalId).not.toBe(identidadEnPortal('inm-A', 'FOTOCASA').externalId);
  });

  it('A.5 mecanismo de versión: contador sólo cuando cambia la huella, sin reloj', () => {
    const base = pub();
    const v1 = calcularVersionPublicable(base);
    expect(v1.numero).toBe(1);
    expect(v1.etiqueta).toBe(`v1·${v1.hashCorto}`);
    const igual = calcularVersionPublicable(barajar(base), v1);
    expect(igual.numero).toBe(1);
    expect(versionesIguales(v1, igual)).toBe(true);
    const v2 = calcularVersionPublicable(pub({ precio: 990 }), v1);
    expect(v2.numero).toBe(2);
    expect(v2.hashContenido).not.toBe(v1.hashContenido);
    expect(v2.etiqueta).not.toBe(v1.etiqueta);
    const v3 = calcularVersionPublicable(pub({ precio: 991 }), v2);
    expect(v3.numero).toBe(3);
    // repetir el cálculo no avanza versiones (determinismo puro)
    expect(calcularVersionPublicable(pub({ precio: 991 }), v2)).toEqual(v3);
    // y volver al contenido de v1 no reutiliza v1: es una versión nueva con la huella vieja
    const vuelta = calcularVersionPublicable(base, v3);
    expect(vuelta.numero).toBe(4);
    expect(vuelta.hashContenido).toBe(v1.hashContenido);
    expect(versionesIguales(vuelta, v2)).toBe(false);
    expect(contenidoPublicableIdentico(base, barajar(base))).toBe(true);
    expect(contenidoPublicableIdentico(base, pub({ precio: 991 }))).toBe(false);
  });

  it('A.6 la huella fuerte es sha256 y la corta REUTILIZA hashEstable (no hay segundo hash)', () => {
    const base = pub();
    const huella = hashDeContenidoPublicable(base);
    expect(huella).toMatch(/^[0-9a-f]{64}$/);
    const canonica = representacionCanonica(base);
    expect(huellaCortaDeContenido(base)).toBe(hashEstable(canonica));
    expect(calcularVersionPublicable(base).hashCorto).toBe(hashEstable(canonica));
    // la representación canónica es la de `jsonDeterminista`: claves ordenadas, 2 espacios
    expect(canonica.startsWith('{\n  "ascensor"')).toBe(true);
    expect(formaCanonicaPublicable(base).generadoEn).toBeUndefined();
  });

  it('A.7 camposQueCambiaron informa el campo público afectado y calla los metadatos', () => {
    const antes = pub();
    expect(camposQueCambiaron(antes, pub({ precio: 1000 }))).toEqual(['precioMensual']);
    expect(camposQueCambiaron(antes, { ...antes, generadoEn: '2024-01-01T00:00:00.000Z' })).toEqual([]);
    expect(camposQueCambiaron(antes, { ...antes, imagenes: antes.imagenes.map((i) => ({ ...i, estadoPublicacion: 'PUBLICADA' as const })) })).toEqual([]);
    expect(camposQueCambiaron(antes, conImagenes([{ url: 'https://storage.example.com/nueva.jpg', orden: 0, portada: true }], antes))).toEqual(['imagenes']);
  });

  it('A.8 canonizar no muta la entrada y no depende del estado global', () => {
    const base = pub();
    const antes = JSON.stringify(base);
    const copia = JSON.parse(antes) as PublicacionInmueble;
    formaCanonicaPublicable(copia);
    calcularVersionPublicable(copia, calcularVersionPublicable(copia));
    expect(JSON.stringify(copia)).toBe(antes);
    // la forma canónica es una copia profunda: mutarla no contamina la siguiente llamada
    const forma = formaCanonicaPublicable(copia);
    (forma.imagenes as Array<Record<string, unknown>>)[0].url = 'https://mutada.example.com/x.jpg';
    expect(hashDeContenidoPublicable(copia)).toBe(hashDeContenidoPublicable(base));
  });
});

// ===========================================================================
describe('GAP5-F1 · B. Decisor de idempotencia (puro, sin E/S)', () => {
  const decide = (publicacion: PublicacionInmueble, publicada?: InstantaneaPublicada, retirar = false): DecisionSindicacion =>
    resolverAccionSindicacion({
      publicacion,
      portal: 'IDEALISTA',
      ...(publicada ? { publicada } : {}),
      ...(retirar ? { intencion: { retirar: true } } : {}),
    });

  it('B.1 sin precedente y contenido válido ⇒ NUEVO (y hay que enviar)', () => {
    const d = decide(pub());
    expect(d.accion).toBe('NUEVO');
    expect(d.motivo).toBe('SIN_PRECEDENTE');
    expect(d.cambioDetectado).toBe(true);
    expect(d.version.numero).toBe(1);
    expect(requiereEnvio(d)).toBe(true);
    expect(operacionDeAccion(d)).toBe('publicar');
    expect(d.claveIdentidad).toBe('IDEALISTA:inm-A');
    expect(d.externalId).toBe(identidadPublicacionPortal('inm-A', 'IDEALISTA').externalId);
  });

  it('B.2 huella igual a la publicada ⇒ SIN_CAMBIOS (no se republica)', () => {
    const base = pub();
    const version = calcularVersionPublicable(base);
    expect(decide(base, { version }).accion).toBe('SIN_CAMBIOS');
    expect(decide(base, { version: version.hashContenido.toUpperCase() }).accion).toBe('SIN_CAMBIOS');
    expect(decide(barajar(base), { version }).accion).toBe('SIN_CAMBIOS');
    const d = decide(base, { version });
    expect(d.motivo).toBe('HASH_IGUAL');
    expect(d.cambioDetectado).toBe(false);
    expect(d.version.numero).toBe(version.numero);
    expect(requiereEnvio(d)).toBe(false);
    expect(operacionDeAccion(d)).toBe('ninguna');
  });

  it('B.2b precedente SIN huella guardada pero con la payload publicada ⇒ se deduce la huella', () => {
    const base = pub();
    expect(decide(base, { publicacion: base }).accion).toBe('SIN_CAMBIOS');
    expect(decide(pub({ precio: 960 }), { publicacion: base }).accion).toBe('ACTUALIZAR');
  });

  it('B.3 huella distinta y válido ⇒ ACTUALIZAR con la versión siguiente y el diff de campos', () => {
    const anterior = calcularVersionPublicable(pub());
    const d = decide(pub({ precio: 960 }), { version: anterior, publicacion: pub() });
    expect(d.accion).toBe('ACTUALIZAR');
    expect(d.motivo).toBe('HASH_DISTINTO');
    expect(d.version.numero).toBe(2);
    expect(d.versionAnterior?.numero).toBe(1);
    expect(d.camposQueCambiaron).toEqual(['precioMensual']);
    expect(requiereEnvio(d)).toBe(true);
    expect(operacionDeAccion(d)).toBe('actualizar');
    expect(d.resumen).toContain('v1 → v2');
    // sin la payload previa sólo se sabe que cambió algo, no qué (honestidad del diff)
    expect(decide(pub({ precio: 960 }), { version: anterior }).camposQueCambiaron).toBeUndefined();
  });

  it('B.4 retirada: RETIRAR si estaba publicado, SIN_CAMBIOS si nunca lo estuvo', () => {
    const base = pub();
    const version = calcularVersionPublicable(base);
    const d = decide(base, { version }, true);
    expect(d.accion).toBe('RETIRAR');
    expect(d.motivo).toBe('RETIRADA_SOLICITADA');
    expect(operacionDeAccion(d)).toBe('retirar');
    expect(requiereEnvio(d)).toBe(true);
    expect(decide(base, undefined, true).accion).toBe('SIN_CAMBIOS');
    expect(decide(base, undefined, true).motivo).toBe('RETIRADA_SIN_PUBLICAR');
    // ya retirado: no se vuelve a enviar nada (ni se reactiva en silencio)
    const r = decide(base, { version, retirado: true }, true);
    expect(r.accion).toBe('SIN_CAMBIOS');
    expect(r.motivo).toBe('RETIRADA_VIGENTE');
    expect(requiereEnvio(r)).toBe(false);
    // la retirada NO requiere contenido publicable: es la única intención que manda
    const roto = { ...base, precioMensual: 0 };
    expect(validarPublicacion(roto).valido).toBe(false);
    expect(decide(roto, { version }, true).accion).toBe('RETIRAR');
  });

  it('B.5 determinismo puro: 100 llamadas y órdenes distintos dan decisiones idénticas', () => {
    const base = pub();
    const anterior = calcularVersionPublicable(pub({ precio: 900 }));
    const primera = JSON.stringify(decide(barajar(base), { version: anterior }));
    for (let i = 0; i < 100; i++) {
      expect(JSON.stringify(decide(base, { version: anterior }))).toBe(primera);
      expect(JSON.stringify(decide(barajar(base), { version: anterior }))).toBe(primera);
    }
  });

  it('B.6 contenido no publicable ⇒ BLOQUEADO con el código estable (y sin E/S)', () => {
    const d = decide({ ...pub(), precioMensual: 0 });
    expect(d.accion).toBe('BLOQUEADO');
    expect(d.motivo).toBe('VALIDACION_BLOQUEANTE');
    expect(d.bloqueos).toEqual(['PRECIO_NO_POSITIVO']);
    expect(requiereEnvio(d)).toBe(false);
    expect(erroresDeDecision(d)[0].campo).toBe('precioMensual');
    // con precedente y cambios, el bloqueo impide el envío pero informa del diff
    const conPrecedente = resolverAccionSindicacion({
      publicacion: { ...pub(), precioMensual: 0 },
      portal: 'IDEALISTA',
      publicada: { version: calcularVersionPublicable(pub({ precio: 900 })), publicacion: pub({ precio: 900 }) },
    });
    expect(conPrecedente.accion).toBe('BLOQUEADO');
    expect(conPrecedente.cambioDetectado).toBe(true);
    expect(conPrecedente.camposQueCambiaron).toContain('precioMensual');
  });

  it('B.7 advertencias del motor NO bloquean la acción', () => {
    const sinImagenes = pub({ images: [] });
    expect(validarPublicacion(sinImagenes).valido).toBe(true);
    expect(validarPublicacion(sinImagenes).advertencias).toContain('Sin imágenes: el anuncio se publicará sin fotografías.');
    const d = decide(sinImagenes);
    expect(d.accion).toBe('NUEVO');
    expect(d.advertencias).toContain('SIN_IMAGENES');
    expect(d.validacion.errores).toEqual([]);
  });

  it('B.8 ausencia de modelo ⇒ BLOQUEADO, nunca una excepción', () => {
    const d = resolverAccionSindicacion({ publicacion: undefined as unknown as PublicacionInmueble, portal: 'FOTOCASA' });
    expect(d.accion).toBe('BLOQUEADO');
    expect(d.validacion.estado).toBe('INVALIDO');
  });
});

// ===========================================================================
describe('GAP5-F1 · C. Errores estructurados sin romper el contrato de strings', () => {
  it('C.1 todo error lleva código, severidad, categoría y mensaje', () => {
    const v = validarModeloPublicable({ ...pub(), precioMensual: 0, superficieM2: 0 });
    for (const e of [...v.errores, ...v.advertencias]) {
      expect(e.codigo).toMatch(/^[A-Z0-9_]+$/);
      expect(e.codigo).not.toBe('SIN_CLASIFICAR');
      expect(['BLOQUEANTE', 'ADVERTENCIA']).toContain(e.severidad);
      expect(['ESTRUCTURA', 'OBLIGATORIO_AUSENTE', 'VALOR_INVALIDO', 'VALOR_INCOMPATIBLE', 'IMAGEN', 'CONTENIDO']).toContain(e.categoria);
      expect(e.mensaje.length).toBeGreaterThan(10);
    }
    expect(v.errores[0]).toMatchObject({ codigo: 'PRECIO_NO_POSITIVO', campo: 'precioMensual', severidad: 'BLOQUEANTE', categoria: 'VALOR_INVALIDO' });
  });

  it('C.2 cobertura total: NINGÚN mensaje del motor se queda sin código', () => {
    // publication that breaks every rule of the engine at once
    const roto = {
      inmuebleId: '',
      idPublico: '',
      referenciaInterna: '',
      direccion: '',
      municipio: '',
      provincia: '',
      codigoPostal: '',
      tipoInmueble: '',
      modalidadAlquiler: 'habitaciones',
      superficieM2: 0,
      precioMensual: 0,
      titulo: '',
      descripcion: 'corta',
      caracteristicas: [],
      imagenes: [],
      habitacionesPublicables: [],
    } as unknown as PublicacionInmueble;
    const legado = validarPublicacion(roto);
    expect(legado.valido).toBe(false);
    const v = validarModeloPublicable(roto);
    const mensajesSinClasificar = [...v.errores, ...v.advertencias].filter((e) => e.codigo === 'SIN_CLASIFICAR');
    expect(mensajesSinClasificar).toEqual([]);
    for (const mensaje of [...legado.erroresBloqueantes, ...legado.advertencias]) {
      expect(Object.keys(TABLA_MENSAJES_Y_CODIGOS), mensaje).toContain(mensaje);
    }
  });

  it('C.3 la conversión no pierde información (ida y vuelta con el contrato del motor)', () => {
    for (const publicacion of [pub(), pub({ images: [] }), pub({ descripcion: 'corta' }), pub({}, [hab('h1', { estado: 'ALQUILADA' })])]) {
      const legado = validarPublicacion(publicacion);
      const estructurada = validarModeloPublicable(publicacion);
      expect(estructurada.origen).toEqual(legado);
      expect(aValidacionLegado(estructurada).valido).toBe(legado.valido);
      expect([...aValidacionLegado(estructurada).erroresBloqueantes].sort()).toEqual([...legado.erroresBloqueantes].sort());
      // los mensajes del motor se conservan LITERALMENTE (mismo texto, no una paráfrasis)
      const textos = estructurada.errores.map((e) => e.mensaje);
      for (const m of legado.erroresBloqueantes) expect(textos).toContain(m);
      const advertencias = estructurada.advertencias.map((e) => e.mensaje);
      for (const m of legado.advertencias) expect(advertencias).toContain(m);
      // vuelta completa: el legado reconstruido es IDÉNTICO al del motor (bloqueantes y advertencias)
      expect([...aValidacionLegado(estructurada).advertencias].sort()).toEqual([...legado.advertencias].sort());
      expect(aValidacionLegado(estructurada)).toEqual(legado);
      expect(estructurada.errores.length + estructurada.advertencias.length).toBeGreaterThanOrEqual(legado.erroresBloqueantes.length + legado.advertencias.length);
      expect(mensajesAEstructurados(legado).length).toBe(legado.erroresBloqueantes.length + legado.advertencias.length);
    }
  });

  it('C.4 severidad: los bloqueantes vacían `estado`, las advertencias no', () => {
    const soloAdvertencias = validarModeloPublicable(pub({ images: [] }));
    expect(soloAdvertencias.estado).toBe('VALIDO');
    expect(soloAdvertencias.errores).toEqual([]);
    expect(codigosDeValidacion(soloAdvertencias, 'ADVERTENCIA')).toEqual(['SIN_IMAGENES']);
    expect(codigosDeValidacion(soloAdvertencias, 'BLOQUEANTE')).toEqual([]);
    const bloqueado = validarModeloPublicable({ ...pub(), direccion: '' });
    expect(bloqueado.estado).toBe('INVALIDO');
    expect(codigosDeValidacion(bloqueado, 'BLOQUEANTE')).toContain('DIRECCION_AUSENTE');
    expect(bloqueado.resumen).toMatch(/bloqueante/);
  });

  it('C.5 imágenes: estructura, URL válida y valores inválidos ⇒ BLOQUEANTE con índice', () => {
    const casos: Array<[string, Partial<ImagenPublicacion>, string]> = [
      ['sin url', { url: '' }, 'IMAGEN_URL_AUSENTE'],
      ['data-url', { url: 'data:image/png;base64,iVBORw0KGgo=' }, 'IMAGEN_URL_INCRUSTADA_PROHIBIDA'],
      ['espacios en la url', { url: 'https://cdn.example.com/a b.jpg' }, 'IMAGEN_URL_INVALIDA'],
      ['url relativa', { url: '/img/a.jpg' }, 'IMAGEN_URL_NO_ABSOLUTA'],
      ['orden negativo', { orden: -1 }, 'IMAGEN_ORDEN_INVALIDO'],
      ['orden no entero', { orden: 1.5 }, 'IMAGEN_ORDEN_INVALIDO'],
    ];
    for (const [nombre, parche, codigo] of casos) {
      const invalida = { url: 'https://cdn.example.com/a.jpg', orden: 0, portada: true, ...parche } as ImagenPublicacion;
      const errores = validarImagenesPublicables(conImagenes([invalida]));
      expect(errores.map((e) => e.codigo), nombre).toContain(codigo);
      expect(errores[0].severidad, nombre).toBe('BLOQUEANTE');
      expect(errores[0].indice, nombre).toBe(0);
      expect(errores[0].campo, nombre).toBe('imagenes');
      expect(validarModeloPublicable(conImagenes([invalida])).estado).toBe('INVALIDO');
    }
    // imagen que no es un objeto, e imágenes que no es un array
    expect(validarImagenesPublicables({ ...pub(), imagenes: [null] } as PublicacionInmueble)[0].codigo).toBe('IMAGEN_ESTRUCTURA_INVALIDA');
    expect(validarImagenesPublicables({ ...pub(), imagenes: 'x' } as unknown as PublicacionInmueble)[0]).toMatchObject({
      codigo: 'IMAGENES_ESTRUCTURA_INVALIDA',
      severidad: 'BLOQUEANTE',
      categoria: 'ESTRUCTURA',
    });
  });

  it('C.6 imágenes: reglas de representación como advertencias (no bloquean el feed)', () => {
    const repetida = [
      { url: 'https://cdn.example.com/a.jpg', orden: 0, portada: true },
      { url: 'https://cdn.example.com/a.jpg', orden: 1, portada: false },
    ] as ImagenPublicacion[];
    const codigosRepetida = validarImagenesPublicables(conImagenes(repetida)).map((e) => e.codigo);
    expect(codigosRepetida).toContain('IMAGEN_URL_DUPLICADA');
    expect(validarModeloPublicable(conImagenes(repetida)).estado).toBe('VALIDO');

    const portadasDobles = [
      { url: 'https://cdn.example.com/a.jpg', orden: 0, portada: true },
      { url: 'https://cdn.example.com/b.jpg', orden: 1, portada: true },
    ] as ImagenPublicacion[];
    expect(validarImagenesPublicables(conImagenes(portadasDobles))).toEqual([
      expect.objectContaining({ codigo: 'IMAGEN_PORTADA_AMBIGUA', severidad: 'ADVERTENCIA', categoria: 'IMAGEN' }),
    ]);

    const ordenRepetido = [
      { url: 'https://cdn.example.com/a.jpg', orden: 0, portada: true },
      { url: 'https://cdn.example.com/b.jpg', orden: 0, portada: false },
    ] as ImagenPublicacion[];
    expect(validarImagenesPublicables(conImagenes(ordenRepetido)).map((e) => e.codigo)).toContain('IMAGEN_ORDEN_DUPLICADO');

    expect(validarImagenesPublicables(conImagenes([{ url: 'https://cdn.example.com/a.jpg', orden: 0, portada: true, estadoPublicacion: 'EN_REVISION' as never }])).map((e) => e.codigo)).toContain('IMAGEN_ESTADO_INVALIDO');

    // una imagen correcta no genera ningún error
    expect(validarImagenesPublicables(pub())).toEqual([]);
  });

  it('C.7 el modelo sin imágenes usa la regla del motor, no una nueva', () => {
    const v = validarModeloPublicable(pub({ images: [] }));
    expect(v.advertencias).toEqual([expect.objectContaining({ codigo: 'SIN_IMAGENES', mensaje: 'Sin imágenes: el anuncio se publicará sin fotografías.' })]);
  });
});

// ===========================================================================
describe('GAP5-F1 · D. Contrato de adaptador sobre AdaptadorPortal', () => {
  it('D.1 el adaptador de la Fase 1 expone las cinco operaciones del contrato', () => {
    expect(OPERACIONES_ADAPTADOR).toEqual(['validar', 'publicar', 'actualizar', 'retirar', 'consultarEstado']);
    const a = crearAdaptadorNoConectado('IDEALISTA', 'Idealista');
    expect(a.nombre).toBe('Idealista');
    expect(a.versionContrato).toBe(VERSION_CONTRATO_ADAPTADOR);
    for (const op of OPERACIONES_ADAPTADOR) expect(typeof a[op]).toBe('function');
    expect(auditarContratoAdaptador(a)).toMatchObject({ ok: true, faltan: [], portal: 'IDEALISTA' });
    expect(a.conectado).toBe(false);
    expect(a.operacionesSoportadas).toEqual(['validar']);
  });

  it('D.2 publicar/actualizar/retirar/consultarEstado devuelven un rechazo estructurado, sin red', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const a = crearAdaptadorNoConectado('FOTOCASA');
    const ctx = contextoParaAdaptador(pub(), resolverAccionSindicacion({ publicacion: pub(), portal: 'FOTOCASA' }));
    for (const op of ['publicar', 'actualizar', 'retirar', 'consultarEstado'] as const) {
      const r = a[op](ctx) as never as { ok: boolean; error: { codigo: string; mensaje: string }; operacion: string; portal: string };
      expect(r.ok, op).toBe(false);
      expect(r.operacion, op).toBe(op);
      expect(r.portal, op).toBe('FOTOCASA');
      expect(r.error.codigo).toBe('PORTAL_NO_CONECTADO');
      expect(r.error.mensaje).toContain('Fase 1');
    }
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('D.3 validar sí funciona en la Fase 1 (es puro) y devuelve la validación estructurada', async () => {
    const a = crearAdaptadorNoConectado('KYERO');
    const ok = await a.validar(contextoParaAdaptador(pub()));
    expect(ok.ok).toBe(true);
    expect(ok.datos?.estado).toBe('VALIDO');
    const malo = await ejecutarOperacion(a, 'validar', contextoParaAdaptador({ ...pub(), precioMensual: 0 }));
    expect(malo.ok).toBe(false);
    expect(codigosDeValidacion(malo.datos as never, 'BLOQUEANTE')).toContain('PRECIO_NO_POSITIVO');
    expect((await ejecutarOperacion(a, 'retirar', contextoParaAdaptador(pub()))).error?.codigo).toBe('PORTAL_NO_CONECTADO');
    expect((await ejecutarOperacion({ ...a, publicar: undefined as never }, 'publicar', contextoParaAdaptador(pub()))).error?.codigo).toBe('OPERACION_NO_IMPLEMENTADA');
  });

  it('D.4 crearAdaptador exige el contrato completo y normaliza sync/async', async () => {
    const incompleto = crearAdaptador({ portal: 'IDEALISTA', nombre: 'Idealista', publicar: () => ({ ok: true, operacion: 'publicar', portal: 'IDEALISTA' }) } as never);
    expect(incompleto.ok).toBe(false);
    expect(incompleto.error?.codigo).toBe('OPERACION_NO_IMPLEMENTADA');
    expect(incompleto.error?.detalles?.faltan).toEqual(['actualizar', 'retirar', 'consultarEstado']);

    const llamadas: Array<{ op: string; ctx: Record<string, unknown> }> = [];
    const puerto = {
      portal: 'HABITACLIA' as const,
      nombre: 'Habitaclia',
      publicar: (ctx: never) => {
        llamadas.push({ op: 'publicar', ctx: ctx as never });
        return { ok: true, operacion: 'publicar' as const, portal: 'HABITACLIA' as const, externalId: 'pub_extern_1' };
      },
      actualizar: () => Promise.resolve({ ok: true, operacion: 'actualizar' as const, portal: 'HABITACLIA' as const }),
      retirar: () => Promise.resolve({ ok: true, operacion: 'retirar' as const, portal: 'HABITACLIA' as const }),
      consultarEstado: () => Promise.resolve({ ok: true, operacion: 'consultarEstado' as const, portal: 'HABITACLIA' as const, datos: { estado: 'PUBLICADO' } }),
    };
    const creado = crearAdaptador(puerto as never);
    expect(creado.ok).toBe(true);
    const adaptador = creado.adaptador!;
    expect(adaptador.operacionesSoportadas).toEqual(OPERACIONES_ADAPTADOR);
    const decision = resolverAccionSindicacion({ publicacion: pub(), portal: 'HABITACLIA' });
    const ctx = contextoParaAdaptador(pub(), decision);
    expect(ctx.claveIdempotencia).toBe('HABITACLIA:inm-A');
    expect(await adaptador.publicar(ctx)).toMatchObject({ ok: true, externalId: 'pub_extern_1' });
    expect((await adaptador.actualizar(ctx)).ok).toBe(true);
    expect((await adaptador.consultarEstado(ctx)).datos?.estado).toBe('PUBLICADO');
    expect(llamadas[0].ctx.claveIdempotencia).toBe('HABITACLIA:inm-A');
    // SIN_CAMBIOS nunca llega al puerto: la idempotencia se aplica ANTES de tocar el portal
    const sinCambios = { ...ctx, decision: { ...decision, accion: 'SIN_CAMBIOS' as const } };
    const rechazo = await adaptador.publicar(sinCambios);
    expect(rechazo.ok).toBe(false);
    expect(rechazo.error?.codigo).toBe('DECISION_NO_ENVIABLE');
    expect(llamadas.length).toBe(1);
  });

  it('D.5 el contexto no admite credenciales: se sanitizan o se rechaza la operación', async () => {
    const conCredenciales = {
      publicacion: pub(),
      extras: { apiKey: 'NO-DEBE-PASAR', nota: 'ok', token: 't', referenciaAnuncio: 'REF-1' },
    };
    const saneado = sanearContexto(conCredenciales as never);
    expect(saneado.eliminadas).toEqual(['apiKey', 'token']);
    expect(saneado.contexto.extras).toEqual({ nota: 'ok', referenciaAnuncio: 'REF-1' });
    expect((saneado.contexto as never as Record<string, unknown>).publicacion).toBeDefined();
    // una credencial colada en la raíz del contexto se elimina igualmente
    expect(sanearContexto({ ...conCredenciales, credenciales: { u: 'x' } } as never).eliminadas).toContain('credenciales');

    let recibido: Record<string, unknown> | undefined;
    let ejecuciones = 0;
    const adaptador = crearAdaptador({
      portal: 'KYERO',
      nombre: 'Kyero',
      publicar: (ctx: never) => {
        ejecuciones++;
        recibido = ctx as never;
        return { ok: true, operacion: 'publicar', portal: 'KYERO' };
      },
      actualizar: () => ({ ok: true, operacion: 'actualizar', portal: 'KYERO' }),
      retirar: () => ({ ok: true, operacion: 'retirar', portal: 'KYERO' }),
      consultarEstado: () => ({ ok: true, operacion: 'consultarEstado', portal: 'KYERO' }),
    } as never).adaptador!;
    // Credenciales en el contexto ⇒ rechazo ESTRUCTURADO y el puerto no se ejecuta ni una vez.
    const conCredencialesEnRaiz = await adaptador.publicar({ publicacion: pub(), credenciales: { u: 'x' }, accessToken: 'z' } as never);
    expect(conCredencialesEnRaiz.ok).toBe(false);
    expect(conCredencialesEnRaiz.error?.codigo).toBe('CONTEXTO_NO_PERMITIDO');
    expect(conCredencialesEnRaiz.error?.detalles?.clavesEliminadas).toEqual(['credenciales', 'accessToken']);
    const conCredencialEnExtras = await adaptador.publicar({ publicacion: pub(), extras: { apiKey: 'NO-DEBE-PASAR' } } as never);
    expect(conCredencialEnExtras.error?.codigo).toBe('CONTEXTO_NO_PERMITIDO');
    expect(ejecuciones).toBe(0);
    // contexto limpio => el puerto recibe un contexto útil, sin claves de credencial
    const buenCtx = await adaptador.publicar({ publicacion: pub(), extras: { nota: 'ok' } } as never);
    expect(buenCtx.ok).toBe(true);
    expect(ejecuciones).toBe(1);
    expect(recibido).toBeDefined();
    expect(JSON.stringify(recibido)).not.toContain('NO-DEBE-PASAR');
    expect(recibido!.extras).toEqual({ nota: 'ok' });
    expect(Object.keys(recibido!)).not.toContain('credenciales');
  });

  it('D.6 el motor NO tiene condicionales por portal: la decisión es idéntica en los cuatro', () => {
    const publicacion = pub({ precio: 960 });
    const anterior = calcularVersionPublicable(pub());
    const decisiones = PORTALES_DISPONIBLES.map((portal) =>
      resolverAccionSindicacion({ publicacion, portal: portal as PortalInmobiliario, publicada: { version: anterior } }),
    );
    expect(decisiones).toHaveLength(4);
    const [primera] = decisiones;
    for (const d of decisiones) {
      expect(d.accion).toBe(primera.accion);
      expect(d.motivo).toBe(primera.motivo);
      expect(d.version.hashContenido).toBe(primera.version.hashContenido);
      expect(d.version.numero).toBe(primera.version.numero);
    }
    expect(new Set(decisiones.map((d) => d.claveIdentidad)).size).toBe(4);
    expect(decisiones.map((d) => d.claveIdentidad)).toEqual(PORTALES_DISPONIBLES.map((p) => `${p}:inm-A`));
    // el registro de la Fase 1 no publica en ningún portal declarado
    expect(Object.keys(ADAPTADORES_SINDICACION_FASE1).sort()).toEqual([...PORTALES_DISPONIBLES].sort());
    for (const a of Object.values(ADAPTADORES_SINDICACION_FASE1)) {
      expect(a.operacionesSoportadas).toEqual(['validar']);
      expect(a.conectado).toBe(false);
    }
  });

  it('D.7 la exportación existente se REUTILIZA, no se duplica', () => {
    const estado = estadoAdaptadores();
    expect(estado.map((e) => e.portal).sort()).toEqual([...PORTALES_DISPONIBLES].sort());
    expect(estado.filter((e) => e.soportaExportacion).map((e) => e.portal)).toEqual(['KYERO']);
    expect(estado.every((e) => e.pendientes.length === 4 && e.disponibles.length === 1)).toBe(true);

    const publicaciones = [pub()];
    const feed = exportarFeed('KYERO', publicaciones);
    expect(feed.ok).toBe(true);
    expect(feed.formato).toBe('XML_KYLERO');
    expect(feed.contenido).toBe(generarFeedXmlKyero(publicaciones));

    const pendiente = exportarFeed('IDEALISTA', publicaciones);
    expect(pendiente.ok).toBe(false);
    expect(typeof pendiente.motivo).toBe('string');
    expect(exportarFeed('OTRO' as PortalInmobiliario, publicaciones).ok).toBe(false);
  });

  it('D.8 el contrato no arrastra reglas de un portal concreto', () => {
    const fuentes = FUENTES.map((f) => f.ejecutable).join('\n');
    // ni una sola comparación/constante contra un portal concreto en el código ejecutable
    for (const nombre of ['IDEALISTA', 'FOTOCASA', 'HABITACLIA', 'KYERO']) {
      expect(fuentes.includes(`'${nombre}'`), `literal '${nombre}' en el núcleo`).toBe(false);
    }
    expect(fuentes).not.toMatch(/switch\s*\(\s*\w*portal\w*\s*\)/i);
    expect(fuentes).not.toMatch(/portal\s*(===|==|!==|\.includes|\.indexOf)\s*['"](IDEALISTA|FOTOCASA|HABITACLIA|KYERO)['"]/);
    expect(fuentes).not.toMatch(/\[['"](IDEALISTA|FOTOCASA|HABITACLIA|KYERO)['"]\]\s*\.?\s*(includes|indexOf)/);
    // (la única comparación contra `portal` admisible es contra una VARIABLE: búsqueda genérica
    //  del adaptador declarado en publicacionPortales.ts, nunca una regla por portal)
    expect(fuentes).toContain('a.portal === portal');
    // ningún código de validación menciona un portal
    const codigos = Object.values(TABLA_MENSAJES_Y_CODIGOS).map((r) => r.codigo);
    expect(codigos.filter((c) => /KYERO|IDEALISTA|FOTOCASA|HABITACLIA/i.test(c))).toEqual([]);
  });
});

// ===========================================================================
describe('GAP5-F1 · E. Aislamiento (nada de esto toca el sistema en marcha)', () => {
  it('E.1 los módulos sólo importan tipos, el motor existente y entre sí', () => {
    const permitidas = ['../types', '../utils/publicacionEngine', '../utils/publicacionJson', '../utils/publicacionXml', '../utils/publicacionPortales', '../utils/sha256'];
    for (const f of FUENTES) {
      const imports = [...f.codigo.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]);
      for (const i of imports) {
        const ok = permitidas.includes(i) || i.startsWith('./');
        expect(ok, `${f.nombre} importa ${i}`).toBe(true);
      }
    }
    expect(FUENTES.length).toBeGreaterThanOrEqual(5);
  });

  it('E.2 cero red, cero Firestore, cero Storage, cero jobs, cero persistencia', () => {
    const prohibido: Array<[string, RegExp]> = [
      ['fetch(', /\bfetch\s*\(/],
      ['XMLHttpRequest', /XMLHttpRequest/],
      ['axios/got/node-fetch', /from\s+'(axios|got|node-fetch)'/],
      ['firebase', /['"]@?firebase|\.\.\/lib\/firebase/i],
      ['Firestore', /Firestore|collection\(|doc\(|setDoc|getDoc|updateDoc|writeBatch|runTransaction/i],
      ['Storage', /getDownloadURL|ref\(|uploadBytes|storage\.bucket/i],
      ['http directo', /node:https?|require\(['"]https?['"]\)/],
      ['reloj', /Date\.now|new Date\(|performance\.now/],
      ['azar', /Math\.random|crypto\.getRandomValues/],
      ['jobs/colas/cron', /\bcron\b|setTimeout|setInterval|setImmediate|queue|bullmq|webhook/i],
      ['persistencia de estados', /localStorage|sessionStorage|indexedDB|saveState|persistState/i],
      ['secretos', /serviceAccount|privateKey|process\.env/i],
    ];
    for (const f of FUENTES) {
      for (const [nombre, patron] of prohibido) {
        expect(patron.test(f.ejecutable), `${f.nombre} contiene ${nombre}`).toBe(false);
      }
    }
  });

  it('E.3 los inmuebles y las publicaciones no se modifican (el núcleo no escribe)', () => {
    const inmueble = inm();
    const instantaneaInmueble = JSON.stringify(inmueble);
    const publicacion = buildPublicacionInmueble(inmueble);
    const instantaneaPub = JSON.stringify(publicacion);
    const anterior = calcularVersionPublicable({ ...publicacion, precioMensual: 900 });
    const publicada: InstantaneaPublicada = { version: anterior, publicacion };

    const a = crearAdaptadorNoConectado('IDEALISTA');
    for (let i = 0; i < 25; i++) {
      const d = resolverAccionSindicacion({ publicacion, portal: 'IDEALISTA', publicada });
      validarModeloPublicable(publicacion);
      formaCanonicaPublicable(publicacion);
      calcularVersionPublicable(publicacion, anterior);
      void a.validar(contextoParaAdaptador(publicacion, d));
      void a.publicar(contextoParaAdaptador(publicacion, d));
      void a.retirar({ publicacion, claveIdempotencia: d.claveIdentidad });
    }

    expect(JSON.stringify(inmueble)).toBe(instantaneaInmueble);
    expect(JSON.stringify(publicacion)).toBe(instantaneaPub);
    expect(JSON.stringify(publicada.publicacion)).toBe(instantaneaPub);
  });

  it('E.4 no hay efectos visibles en el entorno: sin globals nuevos, sin timers', async () => {
    const antes = new Set(Object.keys(globalThis));
    const d = resolverAccionSindicacion({ publicacion: pub(), portal: 'IDEALISTA' });
    const a = crearAdaptadorNoConectado('IDEALISTA');
    await ejecutarOperacion(a, 'validar', contextoParaAdaptador(pub(), d));
    const despues = Object.keys(globalThis).filter((k) => !antes.has(k));
    expect(despues).toEqual([]);
  });

  it('E.5 materializarFichasPublicas y el DRY-RUN siguen intactos (el módulo no los importa ni los invoca)', () => {
    const fuentes = FUENTES.map((f) => f.ejecutable).join('\n');
    for (const nombre of ['materializarFichasPublicas', 'DRY_RUN', 'dryRun', 'fichasPublicas', 'App.tsx', 'src/lib']) {
      expect(fuentes.includes(nombre), `referencia a ${nombre}`).toBe(false);
    }
    // y las piezas del motor que reutilizamos conservan su firma/contrato
    expect(typeof generarIdPublicoInmueble).toBe('function');
    expect(typeof validarPublicacion).toBe('function');
    expect(typeof buildPublicacionInmueble).toBe('function');
    expect(hashDeContenidoPublicable(pub())).toHaveLength(64);
  });

  it('E.6 el módulo nuevo no añade dependencias de portal ni persiste estados', () => {
    const v = validarModeloPublicable(pub());
    expect(JSON.stringify(v)).not.toMatch(/undefined|null/);
    expect(v.errores).toEqual([]);
    const decision: DecisionSindicacion = resolverAccionSindicacion({ publicacion: pub(), portal: 'IDEALISTA' });
    expect(decision).not.toHaveProperty('estadoGuardado');
    expect(decision).not.toHaveProperty('ultimaSincronizacion');
    expect((decision as unknown as Record<string, unknown>).versionAnterior).toBeUndefined();
  });
});
