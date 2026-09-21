import { describe, expect, it } from 'vitest';
import type { HabitacionInmueble, Inmueble } from '../types';
import {
  aplicarEstadoPublicacion,
  buildPublicacionInmueble,
  estadoSindicacionInicial,
  generarIdPublicoInmueble,
  hashEstable,
  identidadPublicacionPortal,
  propietarioPublicacionInmutable,
  publicacionAccesoDenegado,
  registrarTrazabilidadPublicacion,
  transicionEstadoPublicacionPermitida,
  validarPublicacion,
} from './publicacionEngine';
import { deduplicarPublicaciones, escapeXml, generarFeedXmlKyero, generarFeedXmlPublicaciones } from './publicacionXml';
import { generarJsonLdPublicacion, generarJsonPublicacion, jsonDeterminista, tipoSchemaOrg } from './publicacionJson';
import { ADAPTADORES_PORTAL, PORTALES_DISPONIBLES, generarExportacion, obtenerAdaptadorPortal } from './publicacionPortales';

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

// =====================================================================
describe('GAP5 · 1. Modelo normalizado', () => {
  it('1.1 inmueble completo: todos los datos reales presentes', () => {
    const pub = buildPublicacionInmueble(inm());
    expect(pub.inmuebleId).toBe('inm-A');
    expect(pub.idPublico).toBe(generarIdPublicoInmueble('inm-A'));
    expect(pub.referenciaInterna).toBe('1234567AB1234C');
    expect(pub.propietarioId).toBe('prop-A');
    expect(pub.precioMensual).toBe(950);
    expect(pub.municipio).toBe('Alicante');
    expect(pub.provincia).toBe('Alicante');
    expect(pub.caracteristicas).toContain('Ascensor');
    expect(pub.caracteristicas).toContain('Terraza');
    expect(pub.modalidadAlquiler).toBe('completo');
    expect(pub.habitacionesPublicables).toBeUndefined();
  });

  it('1.2 inmueble incompleto: solo datos existentes, nada inventado', () => {
    const pub = buildPublicacionInmueble({ id: 'inm-X', direccion: '', ciudad: '', precio: 0, estado: 'disponible', habitaciones: 0, banos: 0, superficie: 0, candidatosCount: 0, fianzaMeses: 0 } as Inmueble);
    expect(pub.provincia).toBeUndefined();
    expect(pub.codigoPostal).toBeUndefined();
    expect(pub.descripcion).toBeUndefined();
    expect(pub.imagenes.length).toBe(0);
    expect(pub.referenciaInterna).toBe('ERP-inm-X'); // sin catastral → referencia ERP
  });

  it('1.3 alquiler por habitaciones: solo lectura del circuito', () => {
    const habs = [
      hab('h2', { estado: 'OCUPADA', contratoId: 'cont-9' }),
      hab('h1'),
      hab('h3', { activo: false }),
      hab('hAjena', { inmuebleId: 'inm-B' }),
    ];
    const pub = buildPublicacionInmueble(inm({ modalidadAlquiler: 'habitaciones' }), habs);
    expect(pub.modalidadAlquiler).toBe('habitaciones');
    expect(pub.habitacionesPublicables?.map((h) => h.habitacionId)).toEqual(['h1', 'h2']); // h3 inactiva y hAjena excluidas, orden determinista
    const h1 = pub.habitacionesPublicables?.find((h) => h.habitacionId === 'h1');
    const h2 = pub.habitacionesPublicables?.find((h) => h.habitacionId === 'h2');
    expect(h1?.disponible).toBe(true);
    expect(h2?.disponible).toBe(false); // ocupada: se publica como no disponible, sin alterar el circuito
  });

  it('1.4 imágenes: solo públicas, con orden y portada; sin base64', () => {
    const pub = buildPublicacionInmueble(inm());
    expect(pub.imagenes.length).toBe(2); // la isPublic:false queda fuera
    expect(pub.imagenes[0].portada).toBe(true);
    expect(pub.imagenes[0].url).toContain('https://storage.example.com/a.jpg');
    expect(pub.imagenes[1].orden).toBe(1);
    pub.imagenes.forEach((i) => expect(i.url.startsWith('data:')).toBe(false));
  });

  it('1.5 campos opcionales ausentes no aparecen', () => {
    const pub = buildPublicacionInmueble(inm({ planta: undefined, balcon: undefined }));
    expect(pub.planta).toBeUndefined();
    expect(pub.balcon).toBeUndefined();
  });
});

// =====================================================================
describe('GAP5 · 2. Validación', () => {
  it('2.1 datos completos → válido, sin errores bloqueantes', () => {
    const v = validarPublicacion(buildPublicacionInmueble(inm()));
    expect(v.valido).toBe(true);
    expect(v.erroresBloqueantes.length).toBe(0);
  });

  it('2.2 datos incompletos → advertencias pero válido', () => {
    const pub = buildPublicacionInmueble(inm({ descripcion: '', provincia: undefined, images: [] }));
    const v = validarPublicacion(pub);
    expect(v.valido).toBe(true);
    expect(v.advertencias.length).toBeGreaterThan(0);
    expect(v.advertencias.join(' ')).toContain('imágenes');
    expect(v.advertencias.join(' ')).toContain('Descripción');
  });

  it('2.3 error bloqueante: precio inválido', () => {
    const v = validarPublicacion(buildPublicacionInmueble(inm({ precio: -5 })));
    expect(v.valido).toBe(false);
    expect(v.erroresBloqueantes.join(' ')).toContain('Precio inválido');
  });

  it('2.4 errores bloqueantes: ubicación esencial ausente', () => {
    const v = validarPublicacion(buildPublicacionInmueble(inm({ direccion: '', ciudad: '' })));
    expect(v.valido).toBe(false);
    expect(v.erroresBloqueantes.length).toBeGreaterThanOrEqual(2);
  });

  it('2.5 advertencias específicas de modalidad habitaciones', () => {
    const v1 = validarPublicacion(buildPublicacionInmueble(inm({ modalidadAlquiler: 'habitaciones' }), []));
    expect(v1.advertencias.join(' ')).toContain('sin habitaciones');
    const v2 = validarPublicacion(buildPublicacionInmueble(inm({ modalidadAlquiler: 'habitaciones' }), [hab('h1', { estado: 'OCUPADA', contratoId: 'c' })]));
    expect(v2.advertencias.join(' ')).toContain('Ninguna habitación');
  });
});

// =====================================================================
describe('GAP5 · 3. XML', () => {
  const pubEspecial = buildPublicacionInmueble(
    inm({ direccion: 'Calle "Sol" & <Mar> 1', descripcion: 'Ático con ñandú, año 2020 & vistas <espectaculares>' })
  );

  it('3.1 XML válido: cabecera, estructura y cierre', () => {
    const xml = generarFeedXmlPublicaciones([pubEspecial]);
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('<feed_inmuebles total="1">');
    expect(xml.trim().endsWith('</feed_inmuebles>')).toBe(true);
    expect(xml).toContain(`<inmueble id="${pubEspecial.idPublico}">`);
  });

  it('3.2 escaping correcto de & < > " \'', () => {
    expect(escapeXml('&')).toBe('&amp;');
    expect(escapeXml('<>')).toBe('&lt;&gt;');
    expect(escapeXml('"\'')).toBe('&quot;&apos;');
    expect(escapeXml('a&b<c>d"e\'f')).toBe('a&amp;b&lt;c&gt;d&quot;e&apos;f');
    const xml = generarFeedXmlPublicaciones([pubEspecial]);
    expect(xml).not.toContain('& <');
    expect(xml).toContain('Calle &quot;Sol&quot; &amp; &lt;Mar&gt; 1');
    expect(xml).toContain('vistas &lt;espectaculares&gt;');
  });

  it('3.3 acentos y caracteres españoles presentes sin corromper', () => {
    const xml = generarFeedXmlPublicaciones([pubEspecial]);
    expect(xml).toContain('Ático');
    expect(xml).toContain('ñandú');
    expect(xml).toContain('año 2020');
  });

  it('3.4 imágenes conservadas con orden y portada', () => {
    const xml = generarFeedXmlPublicaciones([buildPublicacionInmueble(inm())]);
    expect(xml).toContain('<imagenes>');
    expect(xml).toContain('portada="true"');
    expect(xml).toContain('https://storage.example.com/a.jpg');
    expect(xml).not.toContain('c.jpg'); // la no pública no sale
  });

  it('3.5 determinismo: mismo input → misma salida', () => {
    const a = generarFeedXmlPublicaciones([buildPublicacionInmueble(inm())]);
    const b = generarFeedXmlPublicaciones([buildPublicacionInmueble(inm())]);
    expect(a).toBe(b);
  });

  it('3.6 sin duplicados por idPublico', () => {
    const p1 = buildPublicacionInmueble(inm());
    const p2 = buildPublicacionInmueble(inm()); // mismo inmueble
    const p3 = buildPublicacionInmueble(inm({ id: 'inm-B' }));
    expect(deduplicarPublicaciones([p1, p2, p3]).length).toBe(2);
    const xml = generarFeedXmlPublicaciones([p1, p2, p3]);
    expect(xml).toContain('total="2"');
  });

  it('3.7 feed Kyero con identidad estable y requisitos reales', () => {
    const xml = generarFeedXmlKyero([buildPublicacionInmueble(inm())]);
    expect(xml).toContain('<kyero>');
    const identidad = identidadPublicacionPortal('inm-A', 'KYERO');
    expect(xml).toContain(`<property id="${identidad.externalId}">`);
    expect(xml).toContain('<currency>EUR</currency>');
    expect(xml).toContain('<price_freq>month</price_freq>');
    expect(xml).toContain('https://storage.example.com/a.jpg');
  });
});

// =====================================================================
describe('GAP5 · 4. JSON normalizado', () => {
  it('4.1 estructura y equivalencia de datos con el modelo', () => {
    const pub = buildPublicacionInmueble(inm());
    const json = generarJsonPublicacion([pub]);
    const parsed = JSON.parse(json);
    expect(parsed.version).toBe('GAP5/1.0');
    expect(parsed.total).toBe(1);
    const nodo = parsed.inmuebles[0];
    expect(nodo.identificacion.idPublico).toBe(pub.idPublico);
    expect(nodo.ubicacion.municipio).toBe('Alicante');
    expect(nodo.economico.precioMensual).toBe(950);
    expect(nodo.imagenes.length).toBe(2);
    expect(nodo.descripcion.caracteristicas).toContain('Ascensor');
  });

  it('4.2 determinismo', () => {
    const a = generarJsonPublicacion([buildPublicacionInmueble(inm())]);
    const b = generarJsonPublicacion([buildPublicacionInmueble(inm())]);
    expect(a).toBe(b);
    expect(jsonDeterminista({ b: 1, a: 2 })).toBe(jsonDeterminista({ a: 2, b: 1 }));
  });

  it('4.3 representa alquiler por habitaciones y completo', () => {
    const completo = JSON.parse(generarJsonPublicacion([buildPublicacionInmueble(inm())]));
    expect(completo.inmuebles[0].caracteristicas.modalidadAlquiler).toBe('completo');
    expect(completo.inmuebles[0].habitacionesPublicables).toBeUndefined();
    const habs = JSON.parse(
      generarJsonPublicacion([buildPublicacionInmueble(inm({ modalidadAlquiler: 'habitaciones' }), [hab('h1')])])
    );
    expect(habs.inmuebles[0].caracteristicas.modalidadAlquiler).toBe('habitaciones');
    expect(habs.inmuebles[0].habitacionesPublicables[0].habitacionId).toBe('h1');
  });
});

// =====================================================================
describe('GAP5 · 5. JSON-LD', () => {
  it('5.1 estructura Schema.org válida para piso de alquiler', () => {
    const pub = buildPublicacionInmueble(inm());
    const ld = JSON.parse(generarJsonLdPublicacion(pub));
    expect(ld['@context']).toBe('https://schema.org');
    expect(ld['@type']).toBe('Apartment');
    expect(ld.identifier).toBe(pub.idPublico);
    expect(ld.address.addressLocality).toBe('Alicante');
    expect(ld.offers.price).toBe(950);
    expect(ld.offers.priceCurrency).toBe('EUR');
    expect(ld.floorSize.value).toBe(90);
    expect(ld.numberOfRooms).toBe(3);
    expect(ld.image.length).toBe(2);
  });

  it('5.2 mapeo de tipos sin inventar', () => {
    expect(tipoSchemaOrg(buildPublicacionInmueble(inm({ tipoInmueble: 'casa' })))).toBe('House');
    expect(tipoSchemaOrg(buildPublicacionInmueble(inm({ tipoInmueble: 'local' })))).toBe('Place');
    expect(tipoSchemaOrg(buildPublicacionInmueble(inm({ tipoInmueble: 'habitacion' })))).toBe('Room');
    expect(tipoSchemaOrg(buildPublicacionInmueble(inm({ modalidadAlquiler: 'habitaciones' })))).toBe('Apartment');
  });

  it('5.3 ausencia de datos inventados: campos inexistentes no aparecen', () => {
    const ld = JSON.parse(
      generarJsonLdPublicacion(buildPublicacionInmueble({ id: 'x', direccion: 'D', ciudad: 'C', precio: 100, estado: 'disponible', habitaciones: 1, banos: 1, superficie: 0, candidatosCount: 0, fianzaMeses: 1 } as Inmueble))
    );
    expect(ld.floorSize).toBeUndefined(); // superficie 0 → no se publica
    expect(ld.geo).toBeUndefined(); // sin coordenadas en el ERP
    expect(ld.image).toBeUndefined(); // sin imágenes reales
  });

  it('5.4 habitaciones como containsPlace Room solo con datos reales', () => {
    const ld = JSON.parse(
      generarJsonLdPublicacion(buildPublicacionInmueble(inm({ modalidadAlquiler: 'habitaciones' }), [hab('h1')]))
    );
    expect(ld.containsPlace.length).toBe(1);
    expect(ld.containsPlace[0]['@type']).toBe('Room');
    expect(ld.containsPlace[0].identifier).toBe('h1');
    expect(ld.containsPlace[0].offers.price).toBe(350);
  });
});

// =====================================================================
describe('GAP5 · 6. Idempotencia e identidad', () => {
  it('6.1 mismo inmueble + mismo portal = misma identidad', () => {
    const a = identidadPublicacionPortal('inm-A', 'KYERO');
    const b = identidadPublicacionPortal('inm-A', 'KYERO');
    expect(a.externalId).toBe(b.externalId);
    expect(a.clave).toBe('KYERO:inm-A');
    expect(hashEstable('x')).toBe(hashEstable('x'));
  });

  it('6.2 actualización = no duplicación (mismo externalId, contenido nuevo)', () => {
    const v1 = generarFeedXmlKyero([buildPublicacionInmueble(inm({ precio: 900 }))]);
    const v2 = generarFeedXmlKyero([buildPublicacionInmueble(inm({ precio: 1000 }))]);
    const id = (s: string) => s.match(/<property id="([^"]+)">/)![1];
    expect(id(v1)).toBe(id(v2)); // misma identidad
    expect(v1).not.toBe(v2); // contenido actualizado
  });

  it('6.3 distinto portal → externalId distinto', () => {
    const kyero = identidadPublicacionPortal('inm-A', 'KYERO');
    const idealista = identidadPublicacionPortal('inm-A', 'IDEALISTA');
    expect(kyero.externalId).not.toBe(idealista.externalId);
  });
});

// =====================================================================
describe('GAP5 · 7. Estados y trazabilidad', () => {
  it('7.1 estados independientes por portal', () => {
    const estados = estadoSindicacionInicial('inm-A', PORTALES_DISPONIBLES);
    expect(estados.length).toBe(4);
    const r = aplicarEstadoPublicacion(estados[0], 'VALIDADO');
    expect(r.ok).toBe(true);
    expect(estados[1].estado).toBe('BORRADOR'); // los demás no cambian
  });

  it('7.2 transiciones inválidas denegadas', () => {
    expect(transicionEstadoPublicacionPermitida('BORRADOR', 'PUBLICADO')).toBe(false);
    expect(transicionEstadoPublicacionPermitida('VALIDADO', 'LISTO_PARA_PUBLICAR')).toBe(true);
    expect(transicionEstadoPublicacionPermitida('PUBLICADO', 'ACTUALIZADO')).toBe(true);
    const est = estadoSindicacionInicial('inm-A', ['KYERO'])[0];
    expect(aplicarEstadoPublicacion(est, 'PUBLICADO').ok).toBe(false); // BORRADOR→PUBLICADO no permitido
  });

  it('7.3 trazabilidad registra inmueble, portal, formato y resultado', () => {
    const pub = buildPublicacionInmueble(inm());
    const v = validarPublicacion(pub);
    const t = registrarTrazabilidadPublicacion(pub, 'KYERO', 'XML_KYLERO', v, 'kyero_x', '2026-09-20T10:00:00.000Z');
    expect(t.inmuebleId).toBe('inm-A');
    expect(t.portal).toBe('KYERO');
    expect(t.formato).toBe('XML_KYLERO');
    expect(t.resultado).toBe('OK');
    expect(t.externalId).toBe('kyero_x');
    expect(t.fecha).toBe('2026-09-20T10:00:00.000Z'); // determinista si se aporta
  });
});

// =====================================================================
describe('GAP5 · 8. Seguridad y adaptadores', () => {
  it('8.1 aislamiento: propietario inmutable en el modelo', () => {
    const pub = buildPublicacionInmueble(inm());
    expect(propietarioPublicacionInmutable(pub, 'prop-B')).toBe(true); // intento de cambio → denegado
    expect(propietarioPublicacionInmutable(pub, 'prop-A')).toBe(false);
    expect(publicacionAccesoDenegado(inm(), 'prop-B')).toBe(true);
    expect(publicacionAccesoDenegado(inm(), 'prop-A')).toBe(false);
  });

  it('8.2 generación bloqueada ante errores bloqueantes', () => {
    const res = generarExportacion([buildPublicacionInmueble(inm({ precio: -1 }))], 'XML_GENERICO');
    expect(res.ok).toBe(false);
    expect(res.motivo).toContain('errores bloqueantes');
  });

  it('8.3 adaptadores: Kyero genera; el resto declaran requisitos sin simular conexión', () => {
    const kyero = obtenerAdaptadorPortal('KYERO')!;
    const gen = kyero.generar([buildPublicacionInmueble(inm())]);
    expect(gen.ok).toBe(true);
    expect(gen.contenido).toContain('<kyero>');
    for (const portal of ['IDEALISTA', 'FOTOCASA', 'HABITACLIA'] as const) {
      const ad = obtenerAdaptadorPortal(portal)!;
      expect(ad.modo).toBe('PENDIENTE_ACCESO_OPERADOR');
      const r = ad.generar([buildPublicacionInmueble(inm())]);
      expect(r.ok).toBe(false);
      expect(r.motivo).toContain('requiere acceso');
    }
    expect(ADAPTADORES_PORTAL.length).toBe(4);
  });

  it('8.4 ausencia de secretos: ningún adaptador porta credenciales', () => {
    const serializado = JSON.stringify(ADAPTADORES_PORTAL);
    expect(serializado.toLowerCase()).not.toContain('apikey');
    expect(serializado.toLowerCase()).not.toContain('api_secret');
    expect(serializado.toLowerCase()).not.toContain('password');
    expect(serializado.toLowerCase()).not.toContain('token=');
  });

  it('8.5 JSON-LD bloqueado para más de un inmueble (formato individual)', () => {
    const res = generarExportacion(
      [buildPublicacionInmueble(inm()), buildPublicacionInmueble(inm({ id: 'inm-B' }))],
      'JSON_LD'
    );
    expect(res.ok).toBe(false);
  });
});
