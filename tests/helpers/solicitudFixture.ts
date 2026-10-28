import type { Inmueble, SolicitudAlquiler } from '../../src/types';

export function solicitudFixture(sobreescribir: Partial<SolicitudAlquiler> = {}): SolicitudAlquiler {
  return {
    id: 'sol-1', token: 'sol-inm-1-abc', ownerId: 'prop-1',
    inmuebleId: 'inm-1', inmuebleNombre: 'Calle Real 12, Alicante', inmueblePrecio: 950,
    candidatoId: 'cand-1', candidatoNombre: 'Persona Sintética',
    candidatoTelefono: '600111222', candidatoEmail: 'sintetica@example.test',
    numAdultos: 1, numMenores: 0, numTotalPersonas: 1,
    fechaEntradaAproximada: '2026-12-01', duracionPrevista: '1 año',
    tieneMascotas: false, esFumador: false, situacionLaboral: 'cuenta_ajena',
    tipoContrato: 'indefinido', antiguedadLaboral: '2 años',
    ingresosNetosMensuales: 2100, tieneAvalista: false,
    consentimientoAceptado: true, fechaConsentimiento: '2026-10-27T10:00:00.000Z',
    estado: 'NUEVA', cuestionarioCompletado: true, documentosCompletados: false,
    documentos: [], historial: [], fechaCreacion: '2026-10-27',
    fechaActualizacion: '2026-10-27T10:00:00.000Z',
    ...sobreescribir,
  };
}

export function inmuebleFixture(): Inmueble {
  return {
    id: 'inm-1', direccion: 'Calle Real 12, Alicante', ciudad: 'Alicante', precio: 950,
  } as unknown as Inmueble;
}
