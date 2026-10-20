/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { SolicitudSeguroImpago } from '../types';

const mocks = vi.hoisted(() => ({
  getAccessToken: vi.fn(),
  googleSignIn: vi.fn(),
  buildRawEmailWithAttachments: vi.fn(),
  sendGmailMessage: vi.fn(),
  searchGmailMessages: vi.fn(),
  getGmailMessageDetails: vi.fn(),
  solicitarIA: vi.fn(),
  avisarOperacion: vi.fn(),
}));

vi.mock('../lib/googleAuth', () => ({
  getAccessToken: mocks.getAccessToken,
  googleSignIn: mocks.googleSignIn,
}));
vi.mock('../lib/gmailClient', () => ({
  buildRawEmailWithAttachments: mocks.buildRawEmailWithAttachments,
  sendGmailMessage: mocks.sendGmailMessage,
  searchGmailMessages: mocks.searchGmailMessages,
  getGmailMessageDetails: mocks.getGmailMessageDetails,
}));
vi.mock('../lib/clienteIA', () => ({ solicitarIA: mocks.solicitarIA }));
vi.mock('../feedback/canalFeedback', () => ({ avisarOperacion: mocks.avisarOperacion }));
vi.mock('../feedback/mensajes', () => ({
  mensajeDeErrorUsuario: (error: unknown, respaldo: string) =>
    error instanceof Error && error.message ? error.message : respaldo,
}));
vi.mock('../accesibilidad/dialogo', () => ({
  useDialogoAccesible: () => ({ refDialogo: { current: null }, propsDialogo: {} }),
}));

import { DetalleSolicitudSeguroModal } from './DetalleSolicitudSeguroModal';

const BORRADOR_ASUNTO = 'Asunto editado que debe conservarse';
const BORRADOR_CUERPO = 'Cuerpo editado que debe conservarse';
const TEXTO_RESPUESTA = 'Respuesta recibida: revisar condiciones y documentación.';
const ANALISIS_VALIDO = {
  dictamen: 'FAVORABLE_CONDICIONADO',
  dictamenTexto: 'Aceptación condicionada a un aval.',
  importeMaximoAsegurable: 900,
  condiciones: ['Aportar avalista.'],
  documentosRequeridos: ['DNI del avalista.'],
  resumenEjecutivo: 'La aseguradora solicita un avalista antes de aceptar.',
  requiereAtencionPropietario: true,
} as const;

const solicitudBase: SolicitudSeguroImpago = {
  id: 'solicitud-p7',
  referenciaUnica: 'REF-P7-001',
  candidatoId: 'candidato-p7',
  inmuebleId: 'inmueble-p7',
  inmuebleNombre: 'Vivienda de prueba',
  inmuebleDireccion: 'Calle de prueba 1',
  inmuebleCiudad: 'Alicante',
  rentaMensual: 900,
  numeroCandidatoInmueble: 1,
  aseguradoraId: 'aseguradora-p7',
  aseguradoraNombre: 'Aseguradora de prueba',
  aseguradoraEmail: 'pruebas@example.invalid',
  numTitulares: 1,
  titular1: {
    nombre: 'Titular de prueba',
    tipoEmpleo: 'INDEFINIDO',
    tipoContrato: 'INDEFINIDO',
    antiguedadLaboral: '3 años',
    ingresosNetosMensuales: 2400,
  },
  tieneAvalista: false,
  ingresosTotalesConjuntos: 2400,
  ratioEsfuerzoCalculado: 37.5,
  documentosAdjuntos: [],
  documentacionCompletaSegunAseguradora: true,
  resumenSolvenciaIA: 'Resumen de prueba',
  scoreSolvenciaIA: 80,
  alertasDetectadasIA: [],
  nivelRiesgoIA: 'Bajo',
  estado: 'BORRADOR',
  metodoEnvio: 'GMAIL_API',
  dictamenAseguradora: 'EN_ESTUDIO',
  importeMaximoAsegurable: 777,
  condicionesEstipuladas: ['Condición previa conservada.'],
  documentosSolicitadosExtra: ['Documento previo conservado.'],
  comentariosAseguradora: 'Comentario original.',
  emailRespuestaRaw: undefined,
  procesadoConIA: false,
  decisionFinalPropietario: 'PENDIENTE',
  fechaCreacion: '2026-10-01T10:00:00.000Z',
  fechaActualizacion: '2026-10-01T10:00:00.000Z',
  historial: [{
    id: 'hist-inicial',
    fecha: '2026-10-01T10:00:00.000Z',
    autor: 'propietario',
    accion: 'Expediente creado',
  }],
};

function montar(onUpdateSolicitud = vi.fn()) {
  render(
    <DetalleSolicitudSeguroModal
      solicitud={structuredClone(solicitudBase)}
      aseguradoras={[]}
      onClose={vi.fn()}
      onUpdateSolicitud={onUpdateSolicitud}
    />,
  );
  return onUpdateSolicitud;
}

function abrirCorreo() {
  fireEvent.click(screen.getByRole('button', { name: /2\. Solicitud & Correo/ }));
}

function abrirRespuesta() {
  fireEvent.click(screen.getByRole('button', { name: /3\. Respuesta Aseguradora \(IA\)/ }));
}

async function enviarBorrador() {
  abrirCorreo();
  fireEvent.change(screen.getByLabelText(/Asunto del Correo/), { target: { value: BORRADOR_ASUNTO } });
  fireEvent.change(screen.getByLabelText(/Cuerpo del Mensaje Formal/), { target: { value: BORRADOR_CUERPO } });
  fireEvent.click(screen.getByRole('button', { name: 'Enviar Solicitud con Gmail OAuth' }));
}

function responseOk(body: unknown) {
  return { ok: true, status: 200, json: vi.fn().mockResolvedValue(body) };
}

function responseError(status: number, body: unknown = { error: 'IA no disponible' }) {
  return { ok: false, status, json: vi.fn().mockResolvedValue(body) };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getAccessToken.mockResolvedValue(null);
  mocks.googleSignIn.mockResolvedValue({ accessToken: 'token-de-prueba', user: { uid: 'usuario-p7' } });
  mocks.buildRawEmailWithAttachments.mockReturnValue('mensaje-mime-de-prueba');
  mocks.sendGmailMessage.mockResolvedValue({ id: 'gmail-message-1', threadId: 'gmail-thread-1' });
  mocks.searchGmailMessages.mockResolvedValue([]);
  mocks.getGmailMessageDetails.mockResolvedValue(null);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('DetalleSolicitudSeguroModal · envío por Gmail', () => {
  it.each([
    ['cancelación OAuth', () => {
      mocks.googleSignIn.mockRejectedValue(new Error('auth/popup-closed-by-user'));
    }],
    ['autorización fallida', () => {
      mocks.googleSignIn.mockRejectedValue(new Error('auth/unauthorized-domain'));
    }],
    ['token ausente tras OAuth', () => {
      mocks.googleSignIn.mockResolvedValue(null);
    }],
    ['error HTTP/de envío', () => {
      mocks.getAccessToken.mockResolvedValue('token-de-prueba');
      mocks.sendGmailMessage.mockRejectedValue(new Error('Gmail respondió 403'));
    }],
    ['resultado 2xx no verificable', () => {
      mocks.getAccessToken.mockResolvedValue('token-de-prueba');
      mocks.sendGmailMessage.mockResolvedValue({ id: '', threadId: 'gmail-thread-1' });
    }],
    ['resultado 2xx sin threadId verificable', () => {
      mocks.getAccessToken.mockResolvedValue('token-de-prueba');
      mocks.sendGmailMessage.mockResolvedValue({ id: 'gmail-message-1', threadId: '' });
    }],
  ])('con %s conserva y persiste el borrador sin registrar un envío', async (_caso, preparar) => {
    preparar();
    const onUpdateSolicitud = vi.fn(async (_actualizada: SolicitudSeguroImpago) => undefined);
    montar(onUpdateSolicitud);
    await enviarBorrador();

    await waitFor(() => expect(onUpdateSolicitud).toHaveBeenCalledTimes(1));
    const persistida = onUpdateSolicitud.mock.calls[0][0];
    expect(screen.getByRole('alert').textContent).toMatch(/no se marcará como enviado/i);
    expect(persistida.estado).toBe('BORRADOR');
    expect(persistida.fechaEnvio).toBeUndefined();
    expect(persistida.emailAsunto).toBe(BORRADOR_ASUNTO);
    expect(persistida.emailCuerpo).toBe(BORRADOR_CUERPO);
    expect(persistida.historial).toEqual(solicitudBase.historial);
    expect(persistida.historial.some((evento) => /enviad[oa].*exitosamente|registrada como enviada/i.test(evento.accion))).toBe(false);
    expect((screen.getByLabelText(/Asunto del Correo/) as HTMLInputElement).value).toBe(BORRADOR_ASUNTO);
    expect((screen.getByLabelText(/Cuerpo del Mensaje Formal/) as HTMLTextAreaElement).value).toBe(BORRADOR_CUERPO);
    expect(mocks.avisarOperacion).toHaveBeenCalledWith(expect.objectContaining({ tipo: 'error' }));
  });

  it('solo persiste CORREO_ENVIADO e historial de éxito tras respuesta Gmail verificable', async () => {
    mocks.getAccessToken.mockResolvedValue('token-de-prueba');
    const onUpdateSolicitud = vi.fn(async (_actualizada: SolicitudSeguroImpago) => undefined);
    montar(onUpdateSolicitud);
    await enviarBorrador();

    await waitFor(() => expect(onUpdateSolicitud).toHaveBeenCalledTimes(1));
    const persistida = onUpdateSolicitud.mock.calls[0][0];
    expect(mocks.sendGmailMessage).toHaveBeenCalledWith('token-de-prueba', 'mensaje-mime-de-prueba');
    expect(persistida.estado).toBe('CORREO_ENVIADO');
    expect(persistida.metodoEnvio).toBe('GMAIL_API');
    expect(persistida.emailAsunto).toBe(BORRADOR_ASUNTO);
    expect(persistida.emailCuerpo).toBe(BORRADOR_CUERPO);
    expect(persistida.fechaEnvio).toMatch(/^2026-|^20\d\d-/);
    expect(persistida.historial).toHaveLength(solicitudBase.historial.length + 1);
    expect(persistida.historial.at(-1)).toMatchObject({
      autor: 'gmail',
      accion: 'Solicitud enviada exitosamente vía Gmail API',
    });
    expect(persistida.historial.at(-1)?.detalle).toContain('gmail-message-1');
  });
});

describe('DetalleSolicitudSeguroModal · análisis IA de respuesta recibida', () => {
  const fallos: Array<[string, () => void]> = [
    ['proveedor/cliente IA no disponible', () => {
      mocks.solicitarIA.mockRejectedValue(new Error('servicio IA no disponible'));
    }],
    ['respuesta HTTP no satisfactoria', () => {
      mocks.solicitarIA.mockResolvedValue(responseError(503));
    }],
    ['JSON inválido', () => {
      mocks.solicitarIA.mockResolvedValue({ ok: true, status: 200, json: vi.fn().mockRejectedValue(new SyntaxError('JSON inválido')) });
    }],
    ['esquema incompleto', () => {
      mocks.solicitarIA.mockResolvedValue(responseOk({ dictamen: 'FAVORABLE' }));
    }],
    ['dictamen ausente', () => {
      const { dictamen: _omitido, ...sinDictamen } = ANALISIS_VALIDO;
      mocks.solicitarIA.mockResolvedValue(responseOk(sinDictamen));
    }],
    ['dictamen no permitido', () => {
      mocks.solicitarIA.mockResolvedValue(responseOk({ ...ANALISIS_VALIDO, dictamen: 'APROBADO' }));
    }],
  ];

  it.each(fallos)('en %s conserva el texto y los datos y deja el expediente pendiente de revisión humana', async (_caso, preparar) => {
    preparar();
    const onUpdateSolicitud = vi.fn(async (_actualizada: SolicitudSeguroImpago) => undefined);
    montar(onUpdateSolicitud);
    abrirRespuesta();
    const campo = screen.getByLabelText(/Texto del Correo de Respuesta recibido/);
    fireEvent.change(campo, { target: { value: TEXTO_RESPUESTA } });
    fireEvent.click(screen.getByRole('button', { name: 'Analizar Respuesta con IA' }));

    await waitFor(() => expect(onUpdateSolicitud).toHaveBeenCalledTimes(1));
    const persistida = onUpdateSolicitud.mock.calls[0][0];
    expect(screen.getByRole('alert').textContent).toMatch(/pendiente de revisión humana/i);
    expect((campo as HTMLTextAreaElement).value).toBe(TEXTO_RESPUESTA);
    expect(persistida.estado).toBe('ERROR_PROCESAMIENTO');
    expect(persistida.emailRespuestaRaw).toBe(TEXTO_RESPUESTA);
    expect(persistida.procesadoConIA).toBe(false);
    expect(persistida.dictamenAseguradora).toBe(solicitudBase.dictamenAseguradora);
    expect(persistida.importeMaximoAsegurable).toBe(solicitudBase.importeMaximoAsegurable);
    expect(persistida.condicionesEstipuladas).toEqual(solicitudBase.condicionesEstipuladas);
    expect(persistida.documentosSolicitadosExtra).toEqual(solicitudBase.documentosSolicitadosExtra);
    expect(persistida.comentariosAseguradora).toBe(solicitudBase.comentariosAseguradora);
    expect(persistida.fechaRecepcionRespuesta).toBeUndefined();
    expect(persistida.historial).toHaveLength(solicitudBase.historial.length + 1);
    expect(persistida.historial.at(-1)).toMatchObject({
      autor: 'sistema_ia',
      accion: 'Respuesta de aseguradora pendiente de revisión humana',
    });
    expect(persistida.historial.some((evento) => evento.accion === 'Dictamen de aseguradora analizado por IA')).toBe(false);
    expect(persistida.dictamenAseguradora).not.toBe('FAVORABLE');
  });

  it('procesa y persiste un dictamen solo cuando la respuesta cumple todo el esquema', async () => {
    mocks.solicitarIA.mockResolvedValue(responseOk(ANALISIS_VALIDO));
    const onUpdateSolicitud = vi.fn(async (_actualizada: SolicitudSeguroImpago) => undefined);
    montar(onUpdateSolicitud);
    abrirRespuesta();
    fireEvent.change(screen.getByLabelText(/Texto del Correo de Respuesta recibido/), { target: { value: TEXTO_RESPUESTA } });
    fireEvent.click(screen.getByRole('button', { name: 'Analizar Respuesta con IA' }));

    await waitFor(() => expect(onUpdateSolicitud).toHaveBeenCalledTimes(1));
    const persistida = onUpdateSolicitud.mock.calls[0][0];
    expect(persistida.estado).toBe('RESPUESTA_PROCESADA');
    expect(persistida.dictamenAseguradora).toBe('FAVORABLE_CONDICIONADO');
    expect(persistida.emailRespuestaRaw).toBe(TEXTO_RESPUESTA);
    expect(persistida.procesadoConIA).toBe(true);
    expect(persistida.importeMaximoAsegurable).toBe(900);
    expect(persistida.historial.at(-1)).toMatchObject({
      autor: 'sistema_ia',
      accion: 'Dictamen de aseguradora analizado por IA',
    });
  });
});

describe('DetalleSolicitudSeguroModal · P7 trazabilidad de estados y procedencia', () => {
  function montarConDetalle(solicitud: SolicitudSeguroImpago, onUpdateSolicitud = vi.fn()) {
    const onClose = vi.fn();
    render(
      <DetalleSolicitudSeguroModal
        solicitud={structuredClone(solicitud)}
        aseguradoras={[]}
        onClose={onClose}
        onUpdateSolicitud={onUpdateSolicitud}
      />,
    );
    return { onUpdateSolicitud, onClose };
  }

  it('conserva y muestra la respuesta pendiente de revisión al reabrir el expediente', () => {
    montarConDetalle({
      ...solicitudBase,
      estado: 'ERROR_PROCESAMIENTO',
      procesadoConIA: false,
      emailRespuestaRaw: TEXTO_RESPUESTA,
    });

    expect(screen.getByTestId('origen-dictamen-expediente').textContent).toBe(
      'Pendiente de revisión humana',
    );
    abrirRespuesta();
    expect(screen.getByTestId('respuesta-pendiente-revision')).toBeTruthy();
    expect(screen.getByTestId('texto-respuesta-conservado').textContent).toBe(TEXTO_RESPUESTA);
    expect(screen.queryByTestId('lectura-automatica-respuesta')).toBeNull();
  });

  it('no presenta la lectura automática como dictamen oficial de la aseguradora', async () => {
    mocks.solicitarIA.mockResolvedValue(responseOk(ANALISIS_VALIDO));
    const { onUpdateSolicitud } = montarConDetalle(solicitudBase);
    abrirRespuesta();
    fireEvent.change(screen.getByLabelText(/Texto del Correo de Respuesta recibido/), {
      target: { value: TEXTO_RESPUESTA },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Analizar Respuesta con IA' }));

    await waitFor(() => expect(onUpdateSolicitud).toHaveBeenCalledTimes(1));
    expect(onUpdateSolicitud.mock.calls[0][0].dictamenTexto).toBe(ANALISIS_VALIDO.dictamenTexto);

    await waitFor(() => expect(screen.getByTestId('lectura-automatica-respuesta')).toBeTruthy());
    const panel = screen.getByTestId('lectura-automatica-respuesta');
    expect(panel.textContent).toContain('Lectura automática del correo');
    expect(panel.textContent).toMatch(/no es un dictamen oficial/i);
    expect(panel.textContent).not.toMatch(/dictamen oficial extraído/i);
    expect(screen.getByTestId('origen-dictamen-expediente').textContent).toMatch(/^Lectura IA · /);
  });

  it('avisa de que el texto de demostración no procede de ninguna aseguradora', () => {
    montarConDetalle(solicitudBase);
    abrirRespuesta();
    fireEvent.click(screen.getByRole('button', { name: 'Favorable' }));

    expect(screen.getByTestId('aviso-texto-simulado').textContent).toMatch(
      /no lo ha enviado ninguna aseguradora/i,
    );

    fireEvent.change(screen.getByLabelText(/Texto del Correo de Respuesta recibido/), {
      target: { value: 'Texto pegado manualmente.' },
    });
    expect(screen.queryByTestId('aviso-texto-simulado')).toBeNull();
  });

  it('etiqueta la solvencia como estimación local y no como análisis de IA', () => {
    montarConDetalle(solicitudBase);

    expect(screen.getByText('ESTIMACIÓN LOCAL DE SOLVENCIA')).toBeTruthy();
    expect(screen.getByText(/Estimación local: 80 \/ 100/)).toBeTruthy();
    expect(screen.getByText(/no es un dictamen, una garantía ni una valoración de la aseguradora/i)).toBeTruthy();
    expect(screen.queryByText(/ANÁLISIS IA Y ESTIMACIÓN DE RIESGO/)).toBeNull();
  });

  it('muestra el estado real del envío sin afirmar un envío no confirmado', () => {
    montarConDetalle(solicitudBase);
    abrirCorreo();

    expect(screen.getByTestId('estado-solicitud-seguro').textContent).toBe('Borrador');
    expect(screen.getByTestId('detalle-estado-solicitud-seguro').textContent).toMatch(
      /sin envío confirmado/i,
    );
  });

  it('no registra el envío dos veces al pulsar repetidamente mientras está en curso', async () => {
    mocks.getAccessToken.mockResolvedValue('token-de-prueba');
    let resolver: ((valor: unknown) => void) | undefined;
    mocks.sendGmailMessage.mockImplementation(
      () => new Promise((resolve) => { resolver = resolve; }),
    );
    const { onUpdateSolicitud } = montarConDetalle(solicitudBase);
    abrirCorreo();

    const boton = screen.getByRole('button', { name: 'Enviar Solicitud con Gmail OAuth' });
    fireEvent.click(boton);
    fireEvent.click(boton);
    fireEvent.click(boton);

    await waitFor(() => expect(mocks.sendGmailMessage).toHaveBeenCalledTimes(1));
    resolver?.({ id: 'gmail-message-1', threadId: 'gmail-thread-1' });
    await waitFor(() => expect(onUpdateSolicitud).toHaveBeenCalledTimes(1));
    expect(onUpdateSolicitud.mock.calls[0][0].estado).toBe('CORREO_ENVIADO');
  });
});

describe('DetalleSolicitudSeguroModal · P7 borrador de correo con IA', () => {
  function montarConDetalle(solicitud: SolicitudSeguroImpago, onUpdateSolicitud = vi.fn()) {
    const onClose = vi.fn();
    render(
      <DetalleSolicitudSeguroModal
        solicitud={structuredClone(solicitud)}
        aseguradoras={[]}
        onClose={onClose}
        onUpdateSolicitud={onUpdateSolicitud}
      />,
    );
    return { onUpdateSolicitud, onClose };
  }

  it('declara el uso de la plantilla estándar cuando el servicio no genera con IA', async () => {
    mocks.solicitarIA.mockResolvedValue(
      responseOk({
        asunto: 'Asunto de plantilla',
        cuerpo: 'Cuerpo de plantilla',
        generadoConIA: false,
        motivoGeneracionSinIA: 'IA_NO_DISPONIBLE',
      }),
    );
    montarConDetalle(solicitudBase);
    abrirCorreo();
    fireEvent.click(screen.getByRole('button', { name: /Regenerar con IA/ }));

    await waitFor(() =>
      expect(screen.getByTestId('aviso-generacion-correo').textContent).toMatch(
        /plantilla estándar/i,
      ),
    );
    expect((screen.getByLabelText(/Asunto del Correo/) as HTMLInputElement).value).toBe(
      'Asunto de plantilla',
    );
  });

  it.each([
    ['error HTTP del servicio', () => mocks.solicitarIA.mockResolvedValue(responseError(503))],
    ['rechazo de red', () => mocks.solicitarIA.mockRejectedValue(new Error('sin conexión'))],
    ['respuesta incompleta', () => mocks.solicitarIA.mockResolvedValue(responseOk({ asunto: 'Solo asunto' }))],
  ])('ante %s conserva el borrador y avisa sin culpar al envío', async (_caso, preparar) => {
    preparar();
    montarConDetalle(solicitudBase);
    abrirCorreo();
    fireEvent.change(screen.getByLabelText(/Asunto del Correo/), { target: { value: BORRADOR_ASUNTO } });
    fireEvent.change(screen.getByLabelText(/Cuerpo del Mensaje Formal/), { target: { value: BORRADOR_CUERPO } });
    fireEvent.click(screen.getByRole('button', { name: /Regenerar con IA/ }));

    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/se conserva el borrador/i));
    expect((screen.getByLabelText(/Asunto del Correo/) as HTMLInputElement).value).toBe(BORRADOR_ASUNTO);
    expect((screen.getByLabelText(/Cuerpo del Mensaje Formal/) as HTMLTextAreaElement).value).toBe(BORRADOR_CUERPO);
  });
});

describe('DetalleSolicitudSeguroModal · P7 decisión humana', () => {
  it('no cierra el expediente si la decisión no se puede guardar', async () => {
    const onUpdateSolicitud = vi.fn().mockRejectedValue(new Error('sin conexión'));
    const onClose = vi.fn();
    render(
      <DetalleSolicitudSeguroModal
        solicitud={structuredClone(solicitudBase)}
        aseguradoras={[]}
        onClose={onClose}
        onUpdateSolicitud={onUpdateSolicitud}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /4\. Decisión Final Propietario/ }));
    fireEvent.click(screen.getByRole('button', { name: /Aceptar Candidato y Proceder a Firma/ }));
    fireEvent.click(screen.getByRole('button', { name: /Guardar Decisión y Actualizar Expediente/ }));

    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/no se pudo guardar la decisión/i));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('persiste la decisión con un valor declarado del modelo y cierra el expediente', async () => {
    const onUpdateSolicitud = vi.fn(async (_actualizada: SolicitudSeguroImpago) => undefined);
    const onClose = vi.fn();
    render(
      <DetalleSolicitudSeguroModal
        solicitud={structuredClone(solicitudBase)}
        aseguradoras={[]}
        onClose={onClose}
        onUpdateSolicitud={onUpdateSolicitud}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /4\. Decisión Final Propietario/ }));
    fireEvent.click(screen.getByRole('button', { name: /Rechazar Candidatura/ }));
    fireEvent.click(screen.getByRole('button', { name: /Guardar Decisión y Actualizar Expediente/ }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(onUpdateSolicitud.mock.calls[0][0].decisionFinalPropietario).toBe('RECHAZAR_CANDIDATO');
  });
});
