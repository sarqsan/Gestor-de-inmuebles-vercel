import { describe, expect, it } from 'vitest';
import {
  FECHA_CORTE_ENLACES_LEGADOS,
  LONGITUD_SECRETO,
  analizarTokenSolicitud,
  asegurarTokenSolicitud,
  enlaceLegadoVigente,
  esTokenFirmado,
  generarSecreto,
  generarTokenSolicitud,
  idsFichaCandidatos,
  tokenEnlaceParaMostrar,
  verificarTokenContraPropiedad,
} from '../src/lib/tokenSolicitudPublica';

// H-06 — El enlace público de solicitud era `sol-<idInmueble>`: un id
// enumerable. Conocer el id de un inmueble bastaba para dar de alta solicitudes
// y candidatos en su cartera sin haber recibido ningún enlace. Estos casos fijan
// el formato nuevo, el cierre por defecto y la ventana de compatibilidad.

const SECRETO = 'a'.repeat(LONGITUD_SECRETO);
const DENTRO_DE_VENTANA = '2026-10-28T12:00:00.000Z';
const DESPUES_DE_VENTANA = '2027-06-01T00:00:00.000Z';

describe('H-06 · emisión del token', () => {
  it('genera 128 bits en hexadecimal y no repite valores', () => {
    const secretos = new Set(Array.from({ length: 200 }, () => generarSecreto()));
    expect(secretos.size).toBe(200);
    for (const secreto of secretos) {
      expect(secreto).toMatch(new RegExp(`^[0-9a-f]{${LONGITUD_SECRETO}}$`));
    }
  });

  it('el token incluye el inmueble pero el secreto no se deriva de él', () => {
    const uno = generarTokenSolicitud('inm-1');
    const otro = generarTokenSolicitud('inm-1');
    expect(uno.startsWith('sol-inm-1-t')).toBe(true);
    expect(otro).not.toBe(uno);
    expect(esTokenFirmado(uno)).toBe(true);
  });

  it('rechaza emitir sin inmueble o con un secreto débil', () => {
    expect(() => generarTokenSolicitud('')).toThrow();
    expect(() => generarTokenSolicitud('inm-1', 'corto')).toThrow(/32 caracteres/);
    expect(() => generarTokenSolicitud('inm-1', 'Z'.repeat(32))).toThrow(/hexadecimal/);
  });

  it('no usa Math.random: con una fuente criptográfica inyectada se respeta', () => {
    const token = generarTokenSolicitud('inm-9', 'b'.repeat(32));
    expect(token).toBe(`sol-inm-9-t${'b'.repeat(32)}`);
  });
});

describe('H-06 · lectura del token', () => {
  it('distingue un token firmado de un enlace heredado', () => {
    expect(analizarTokenSolicitud(`sol-inm-1-t${SECRETO}`)).toMatchObject({
      formato: 'firmado',
      inmuebleId: 'inm-1',
      secreto: SECRETO,
    });
    expect(analizarTokenSolicitud('sol-inm-1')).toMatchObject({ formato: 'legado', inmuebleId: 'inm-1' });
    expect(analizarTokenSolicitud('inm-1')).toMatchObject({ formato: 'legado', inmuebleId: 'inm-1' });
  });

  it('admite ids de inmueble con guiones sin confundirlos con el secreto', () => {
    expect(analizarTokenSolicitud('sol-prop-2026-03')).toMatchObject({
      formato: 'legado',
      inmuebleId: 'prop-2026-03',
    });
    expect(analizarTokenSolicitud(`sol-prop-2026-03-t${SECRETO}`)).toMatchObject({
      formato: 'firmado',
      inmuebleId: 'prop-2026-03',
    });
  });

  it('resuelve la ficha pública por el id del inmueble, no por el token entero', () => {
    expect(idsFichaCandidatos(`sol-inm-1-t${SECRETO}`)).toEqual(['inm-1']);
    // Los enlaces heredados conservan sus dos formas para no romper los enviados.
    expect(idsFichaCandidatos('sol-inm-1')).toEqual(['sol-inm-1', 'inm-1']);
    expect(idsFichaCandidatos('inm-1')).toEqual(['inm-1']);
    expect(idsFichaCandidatos('')).toEqual([]);
  });

  it('el prefijo suelto no resuelve a ficha pero tampoco revienta', () => {
    expect(idsFichaCandidatos('sol-')).toEqual(['sol-']);
    expect(analizarTokenSolicitud('sol-')).toBeNull();
  });
});

describe('H-06 · capacidad: qué token vale para qué propiedad', () => {
  const conToken = { tokenSolicitud: `sol-inm-1-t${SECRETO}` };

  it('acepta exactamente el token emitido', () => {
    expect(verificarTokenContraPropiedad(`sol-inm-1-t${SECRETO}`, conToken, DENTRO_DE_VENTANA)).toBe('OK');
  });

  it('rechaza el id del inmueble y cualquier otro secreto', () => {
    for (const token of ['sol-inm-1', 'inm-1', `sol-inm-1-t${'c'.repeat(32)}`, `sol-inm-2-t${SECRETO}`]) {
      expect(verificarTokenContraPropiedad(token, conToken, DENTRO_DE_VENTANA)).toBe('TOKEN_NO_COINCIDE');
    }
  });

  it('mientras la propiedad no tenga token, el enlace heredado vale hasta la fecha de corte', () => {
    expect(verificarTokenContraPropiedad('sol-inm-1', {}, DENTRO_DE_VENTANA)).toBe('OK');
    expect(verificarTokenContraPropiedad('inm-1', { tokenSolicitud: '   ' }, DENTRO_DE_VENTANA)).toBe('OK');
    expect(verificarTokenContraPropiedad('sol-inm-1', {}, DESPUES_DE_VENTANA)).toBe('LEGADO_CADUCADO');
  });

  it('un token firmado no vale contra una propiedad sin token emitido', () => {
    expect(verificarTokenContraPropiedad(`sol-inm-1-t${SECRETO}`, {}, DENTRO_DE_VENTANA)).toBe('TOKEN_NO_COINCIDE');
  });

  it('sin propiedad legible no hay capacidad (cierre por defecto)', () => {
    expect(verificarTokenContraPropiedad(`sol-inm-1-t${SECRETO}`, null, DENTRO_DE_VENTANA)).toBe(
      'PROPIEDAD_NO_DISPONIBLE'
    );
    expect(verificarTokenContraPropiedad('', conToken, DENTRO_DE_VENTANA)).toBe('PROPIEDAD_NO_DISPONIBLE');
  });

  it('la ventana de compatibilidad tiene fecha y se puede evaluar', () => {
    expect(FECHA_CORTE_ENLACES_LEGADOS).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(enlaceLegadoVigente(DENTRO_DE_VENTANA)).toBe(true);
    expect(enlaceLegadoVigente(DESPUES_DE_VENTANA)).toBe(false);
    // La fecha de corte exacta sigue siendo válida; un milisegundo después, no.
    const corte = Date.parse(FECHA_CORTE_ENLACES_LEGADOS);
    expect(enlaceLegadoVigente(new Date(corte).toISOString())).toBe(true);
    expect(enlaceLegadoVigente(new Date(corte + 1).toISOString())).toBe(false);
    // Entradas inválidas se cierran, no se abren.
    expect(enlaceLegadoVigente('no-es-fecha')).toBe(false);
  });
});

describe('H-06 · emisión idempotente al guardar', () => {
  it('emite un token cuando falta', () => {
    const salida = asegurarTokenSolicitud({ id: 'inm-5', tokenSolicitud: undefined } as { id: string; tokenSolicitud?: string });
    expect(esTokenFirmado(salida.tokenSolicitud!)).toBe(true);
    expect(salida.tokenSolicitud!.startsWith('sol-inm-5-t')).toBe(true);
  });

  it('respeta el token existente: reemitir invalidaría los enlaces ya enviados', () => {
    const original = { id: 'inm-5', tokenSolicitud: `sol-inm-5-t${SECRETO}` };
    expect(asegurarTokenSolicitud(original)).toBe(original);
  });

  it('sustituye un token heredado con forma antigua', () => {
    const salida = asegurarTokenSolicitud({ id: 'inm-5', tokenSolicitud: 'sol-inm-5' });
    expect(esTokenFirmado(salida.tokenSolicitud!)).toBe(true);
  });
});

const AHORA = '2026-10-28T10:00:00.000Z';

describe('H-06 · token que viaja en el enlace', () => {
  it('usa el token firmado cuando existe', () => {
    const conToken = { id: 'inm-7', tokenSolicitud: `sol-inm-7-t${SECRETO}` };
    expect(tokenEnlaceParaMostrar(conToken)).toBe(conToken.tokenSolicitud);
  });

  it('cae al enlace heredado si el inmueble aún no tiene token', () => {
    expect(tokenEnlaceParaMostrar({ id: 'inm-7' })).toBe('sol-inm-7');
  });

  it('el enlace que se muestra es el que el servidor aceptará', () => {
    const inmueble = asegurarTokenSolicitud({ id: 'inm-7' } as { id: string; tokenSolicitud?: string });
    const mostrado = tokenEnlaceParaMostrar(inmueble);
    // Mostrar el heredado tras emitir el nuevo daría 404 en el alta.
    expect(mostrado).not.toBe('sol-inm-7');
    expect(verificarTokenContraPropiedad(mostrado, inmueble, AHORA)).toBe('OK');
    expect(verificarTokenContraPropiedad('sol-inm-7', inmueble, AHORA)).toBe('TOKEN_NO_COINCIDE');
  });
});
