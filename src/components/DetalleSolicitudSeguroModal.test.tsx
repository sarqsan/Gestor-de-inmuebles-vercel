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
  GmailApiError: class GmailApiError extends Error {
    constructor(
      readonly status: number | null,
      readonly resultadoEnvio: 'RECHAZADO' | 'INCIERTO' | null = null,
    ) {
      super('Gmail error de prueba sin detalles sensibles');
    }
  },
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
  GmailApiError: mocks.GmailApiError,
}));
vi.mock('../lib/clienteIA', () => ({ solicitarIA: mocks.solicitarIA }));
vi.mock('../feedback/canalFeedback', () => ({ avisarOperacion: mocks.avisarOperacion }));
vi.mock('../accesibilidad/dialogo', () => ({
  useDialogoAccesible: () => ({ refDialogo: { current: null }, propsDialogo: {} }),
}));

import { DetalleSolicitudSeguroModal } from './DetalleSolicitudSeguroModal';

const BORRADOR_ASUNTO = 'Asunto editado que debe conservarse';
const BORRADOR_CUERPO = 'Cuerpo editado que debe conservarse';
const TEXTO_RESPUESTA = 'Respuesta recibida: revisar condiciones y documentación.';
const ANALISIS_VALIDO = {
  clasificacionInferida: 'FAVORABLE_CONDICIONADO',
  textoClasificacionInferida: 'El texto parece condicionar su respuesta a un aval.',
  importeMaximoAsegurable: 900,
  condiciones: ['Aportar avalista.'],
  documentosRequeridos: ['DNI del avalista.'],
  resumenAnalisis: 'El texto menciona un aval; se requiere contraste con la fuente original.',
  recomendacionAtencionPropietario: true,
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
  // Este score heredado no tiene procedencia registrada y no debe mostrarse como válido.
  scoreSolvenciaIA: 80,
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

function montar(
  onUpdateSolicitud = vi.fn(),
  solicitud: SolicitudSeguroImpago = solicitudBase,
) {
  render(
    <DetalleSolicitudSeguroModal
      solicitud={structuredClone(solicitud)}
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

function responseError(status: number) {
  return { ok: false, status, json: vi.fn() };
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

describe('DetalleSolicitudSeguroModal · puntuaciones heredadas', () => {
  it('no presenta como válido un score heredado sin procedencia verificada', () => {
    montar();
    expect(screen.queryByText(/Puntuación existente en la ficha de candidato/)).toBeNull();
    expect(screen.queryByText(/Scoring de Solvencia/)).toBeNull();
  });
});

describe('DetalleSolicitudSeguroModal · borradores de correo', () => {
  it('no aplica una plantilla local del servidor y conserva el texto fuente del borrador', async () => {
    mocks.solicitarIA.mockResolvedValue(responseOk({
      asunto: 'Asunto de plantilla local',
      cuerpo: 'Cuerpo de plantilla local',
      origenBorrador: 'PLANTILLA_LOCAL',
    }));
    montar();
    abrirCorreo();
    fireEvent.change(screen.getByLabelText(/Asunto del Correo/), { target: { value: BORRADOR_ASUNTO } });
    fireEvent.change(screen.getByLabelText(/Cuerpo del Mensaje Formal/), { target: { value: BORRADOR_CUERPO } });
    fireEvent.click(screen.getByRole('button', { name: 'Regenerar con IA' }));

    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/plantilla local recibida no se aplicó/i));
    expect((screen.getByLabelText(/Asunto del Correo/) as HTMLInputElement).value).toBe(BORRADOR_ASUNTO);
    expect((screen.getByLabelText(/Cuerpo del Mensaje Formal/) as HTMLTextAreaElement).value).toBe(BORRADOR_CUERPO);
  });

  it('aplica solo un borrador con origen IA explícito y campos válidos', async () => {
    mocks.solicitarIA.mockResolvedValue(responseOk({
      asunto: 'Propuesta IA',
      cuerpo: 'Borrador IA para revisión.',
      origenBorrador: 'IA',
    }));
    montar();
    abrirCorreo();
    fireEvent.click(screen.getByRole('button', { name: 'Regenerar con IA' }));

    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/propuesto por IA/i));
    expect((screen.getByLabelText(/Asunto del Correo/) as HTMLInputElement).value).toBe('Propuesta IA');
    expect((screen.getByLabelText(/Cuerpo del Mensaje Formal/) as HTMLTextAreaElement).value).toBe('Borrador IA para revisión.');
  });
});

describe('DetalleSolicitudSeguroModal · envío por Gmail', () => {
  it('cambia el indicador de Gmail solo con evidencia verificable, no con un estado heredado', () => {
    montar(vi.fn(), { ...solicitudBase, estado: 'CORREO_ENVIADO' });
    abrirCorreo();

    expect(screen.getByText('ESTADO HEREDADO · REVISAR GMAIL')).toBeTruthy();
    expect(screen.queryByLabelText(/Gmail aceptó el mensaje; entrega no confirmada/i)).toBeNull();
  });

  it.each([
    ['cancelación OAuth', () => mocks.googleSignIn.mockRejectedValue(new Error('auth/popup-closed-by-user')), 'ERROR_ENVIO'],
    ['autorización fallida', () => mocks.googleSignIn.mockRejectedValue(new Error('auth/unauthorized-domain')), 'ERROR_ENVIO'],
    ['token ausente tras OAuth', () => mocks.googleSignIn.mockResolvedValue(null), 'ERROR_ENVIO'],
    ['rechazo HTTP verificable', () => {
      mocks.getAccessToken.mockResolvedValue('token-de-prueba');
      mocks.sendGmailMessage.mockRejectedValue(new mocks.GmailApiError(403, 'RECHAZADO'));
    }, 'ERROR_ENVIO'],
    ['error de transporte tras iniciar la petición', () => {
      mocks.getAccessToken.mockResolvedValue('token-de-prueba');
      mocks.sendGmailMessage.mockRejectedValue(new Error('respuesta privada que no debe mostrarse'));
    }, 'ENVIO_INCIERTO'],
    ['respuesta 2xx sin identificador', () => {
      mocks.getAccessToken.mockResolvedValue('token-de-prueba');
      mocks.sendGmailMessage.mockResolvedValue({ id: '', threadId: 'gmail-thread-1' });
    }, 'ENVIO_INCIERTO'],
    ['respuesta 2xx sin threadId', () => {
      mocks.getAccessToken.mockResolvedValue('token-de-prueba');
      mocks.sendGmailMessage.mockResolvedValue({ id: 'gmail-message-1', threadId: '' });
    }, 'ENVIO_INCIERTO'],
  ])('con %s conserva el borrador y registra el estado sin afirmar un envío exitoso', async (_caso, preparar, estadoEsperado) => {
    preparar();
    const onUpdateSolicitud = vi.fn(async (_actualizada: SolicitudSeguroImpago) => undefined);
    montar(onUpdateSolicitud);
    await enviarBorrador();

    await waitFor(() => expect(onUpdateSolicitud).toHaveBeenCalledTimes(1));
    const persistida = onUpdateSolicitud.mock.calls[0][0];
    expect(persistida.estado).toBe(estadoEsperado);
    expect(persistida.fechaEnvio).toBeUndefined();
    expect(persistida.emailAsunto).toBe(BORRADOR_ASUNTO);
    expect(persistida.emailCuerpo).toBe(BORRADOR_CUERPO);
    expect(persistida.historial).toHaveLength(solicitudBase.historial.length + 1);
    expect(persistida.historial.at(-1)?.accion).not.toMatch(/exitosamente|Gmail confirmó la aceptación/i);
    expect((screen.getByLabelText(/Asunto del Correo/) as HTMLInputElement).value).toBe(BORRADOR_ASUNTO);
    expect((screen.getByLabelText(/Cuerpo del Mensaje Formal/) as HTMLTextAreaElement).value).toBe(BORRADOR_CUERPO);
    expect(screen.getByRole('alert').textContent).not.toContain('respuesta privada que no debe mostrarse');
    expect(mocks.avisarOperacion).toHaveBeenCalledWith(expect.objectContaining({ tipo: 'error' }));

    if (estadoEsperado === 'ENVIO_INCIERTO') {
      expect(screen.getByRole('button', { name: /habilitar reintento manual/i })).toBeTruthy();
      expect(screen.getByRole('button', { name: /Reintento bloqueado por resultado incierto/i })).toHaveProperty('disabled', true);
      fireEvent.click(screen.getByRole('button', { name: /Reintento bloqueado por resultado incierto/i }));
      expect(mocks.sendGmailMessage).toHaveBeenCalledTimes(1);
    }
  });

  it('solo marca aceptación de Gmail con id/threadId y aclara que no acredita entrega', async () => {
    mocks.getAccessToken.mockResolvedValue('token-de-prueba');
    const onUpdateSolicitud = vi.fn(async (_actualizada: SolicitudSeguroImpago) => undefined);
    montar(onUpdateSolicitud);
    await enviarBorrador();

    await waitFor(() => expect(onUpdateSolicitud).toHaveBeenCalledTimes(1));
    const persistida = onUpdateSolicitud.mock.calls[0][0];
    expect(mocks.sendGmailMessage).toHaveBeenCalledWith('token-de-prueba', 'mensaje-mime-de-prueba');
    expect(persistida.estado).toBe('CORREO_ENVIADO');
    expect(persistida.confirmacionGmail).toMatchObject({ id: 'gmail-message-1', threadId: 'gmail-thread-1' });
    expect(persistida.metodoEnvio).toBe('GMAIL_API');
    expect(persistida.emailAsunto).toBe(BORRADOR_ASUNTO);
    expect(persistida.emailCuerpo).toBe(BORRADOR_CUERPO);
    expect(persistida.fechaEnvio).toMatch(/^2026-|^20\d\d-/);
    expect(persistida.historial).toHaveLength(solicitudBase.historial.length + 1);
    expect(persistida.historial.at(-1)).toMatchObject({
      autor: 'gmail',
      accion: 'Gmail confirmó la aceptación de la solicitud de envío',
    });
    expect(persistida.historial.at(-1)?.detalle).toContain('gmail-message-1');
    expect(persistida.historial.at(-1)?.detalle).toContain('no acredita entrega ni lectura');
    expect(screen.getByRole('status').textContent).toMatch(/no confirma su entrega ni lectura/i);
    expect(screen.getByLabelText(/Gmail aceptó el mensaje; entrega no confirmada/i)).toBeTruthy();
  });

  it('si la persistencia falla tras la aceptación, mantiene bloqueado el envío y no reintenta', async () => {
    mocks.getAccessToken.mockResolvedValue('token-de-prueba');
    const onUpdateSolicitud = vi.fn(async (_actualizada: SolicitudSeguroImpago) => false);
    montar(onUpdateSolicitud);
    await enviarBorrador();

    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/Gmail confirmó la aceptación/i));
    expect(mocks.sendGmailMessage).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Enviar Solicitud con Gmail OAuth' })).toHaveProperty('disabled', true);
  });

  it('solo habilita un reintento incierto después de confirmación humana y deja traza', async () => {
    mocks.getAccessToken.mockResolvedValue('token-de-prueba');
    mocks.sendGmailMessage.mockRejectedValue(new Error('transporte interrumpido'));
    const onUpdateSolicitud = vi.fn(async (_actualizada: SolicitudSeguroImpago) => undefined);
    montar(onUpdateSolicitud);
    await enviarBorrador();
    await waitFor(() => expect(onUpdateSolicitud).toHaveBeenCalledTimes(1));

    vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: /He revisado Enviados; habilitar reintento manual/i }));

    await waitFor(() => expect(onUpdateSolicitud).toHaveBeenCalledTimes(2));
    const reintentable = onUpdateSolicitud.mock.calls[1][0];
    expect(reintentable.estado).toBe('BORRADOR');
    expect(reintentable.historial.at(-1)).toMatchObject({
      autor: 'propietario',
      accion: 'Reintento manual autorizado tras revisar Gmail',
    });
    expect(mocks.sendGmailMessage).toHaveBeenCalledTimes(1);
  });
});

describe('DetalleSolicitudSeguroModal · análisis orientativo de respuesta', () => {
  const fallos: Array<[string, () => void]> = [
    ['proveedor/cliente IA no disponible', () => mocks.solicitarIA.mockRejectedValue(new Error('servicio IA privado'))],
    ['respuesta HTTP no satisfactoria', () => mocks.solicitarIA.mockResolvedValue(responseError(503))],
    ['JSON inválido', () => mocks.solicitarIA.mockResolvedValue({ ok: true, status: 200, json: vi.fn().mockRejectedValue(new SyntaxError('JSON inválido')) })],
    ['esquema incompleto', () => mocks.solicitarIA.mockResolvedValue(responseOk({ clasificacionInferida: 'FAVORABLE' }))],
    ['clasificación ausente', () => {
      const { clasificacionInferida: _omitida, ...sinClasificacion } = ANALISIS_VALIDO;
      mocks.solicitarIA.mockResolvedValue(responseOk(sinClasificacion));
    }],
    ['clasificación no permitida', () => mocks.solicitarIA.mockResolvedValue(responseOk({ ...ANALISIS_VALIDO, clasificacionInferida: 'APROBADO' }))],
  ];

  it.each(fallos)('en %s conserva el texto y no inventa un dictamen', async (_caso, preparar) => {
    preparar();
    const onUpdateSolicitud = vi.fn(async (_actualizada: SolicitudSeguroImpago) => undefined);
    montar(onUpdateSolicitud);
    abrirRespuesta();
    const campo = screen.getByLabelText(/Texto fuente de respuesta/);
    fireEvent.change(campo, { target: { value: TEXTO_RESPUESTA } });
    fireEvent.click(screen.getByRole('button', { name: 'Analizar texto (orientativo) con IA' }));

    await waitFor(() => expect(onUpdateSolicitud).toHaveBeenCalledTimes(1));
    const persistida = onUpdateSolicitud.mock.calls[0][0];
    expect(screen.getByRole('alert').textContent).toMatch(/pendiente de revisión humana/i);
    expect((campo as HTMLTextAreaElement).value).toBe(TEXTO_RESPUESTA);
    expect(persistida.estado).toBe('ERROR_PROCESAMIENTO');
    expect(persistida.emailRespuestaRaw).toBe(TEXTO_RESPUESTA);
    expect(persistida.procesadoConIA).toBe(false);
    expect(persistida.analisisRespuestaIA).toBeNull();
    expect(persistida.dictamenAseguradora).toBe('EN_ESTUDIO');
    expect(persistida.dictamenAseguradoraVerificadoManualmente).toBe(false);
    expect(persistida.importeMaximoAsegurable).toBe(solicitudBase.importeMaximoAsegurable);
    expect(persistida.condicionesEstipuladas).toEqual(solicitudBase.condicionesEstipuladas);
    expect(persistida.documentosSolicitadosExtra).toEqual(solicitudBase.documentosSolicitadosExtra);
    expect(persistida.comentariosAseguradora).toBe(solicitudBase.comentariosAseguradora);
    expect(persistida.historial).toHaveLength(solicitudBase.historial.length + 1);
    expect(persistida.historial.at(-1)).toMatchObject({
      autor: 'sistema_ia',
      accion: 'Análisis automático no disponible; requiere revisión humana',
    });
  });

  it('guarda análisis IA por separado del dictamen de aseguradora', async () => {
    mocks.solicitarIA.mockResolvedValue(responseOk(ANALISIS_VALIDO));
    const onUpdateSolicitud = vi.fn(async (_actualizada: SolicitudSeguroImpago) => undefined);
    montar(onUpdateSolicitud);
    abrirRespuesta();
    fireEvent.change(screen.getByLabelText(/Texto fuente de respuesta/), { target: { value: TEXTO_RESPUESTA } });
    fireEvent.click(screen.getByRole('button', { name: 'Analizar texto (orientativo) con IA' }));

    await waitFor(() => expect(onUpdateSolicitud).toHaveBeenCalledTimes(1));
    const persistida = onUpdateSolicitud.mock.calls[0][0];
    expect(persistida.estado).toBe('RESPUESTA_PROCESADA');
    expect(persistida.dictamenAseguradora).toBe('EN_ESTUDIO');
    expect(persistida.dictamenAseguradoraVerificadoManualmente).toBe(false);
    expect(persistida.analisisRespuestaIA).toEqual(ANALISIS_VALIDO);
    expect(persistida.emailRespuestaRaw).toBe(TEXTO_RESPUESTA);
    expect(persistida.procesadoConIA).toBe(true);
    expect(persistida.importeMaximoAsegurable).toBe(solicitudBase.importeMaximoAsegurable);
    expect(persistida.historial.at(-1)).toMatchObject({
      autor: 'sistema_ia',
      accion: 'Análisis IA de respuesta registrado; dictamen pendiente de contraste humano',
    });
    expect(screen.getByText(/Análisis IA orientativo · no es dictamen oficial/i)).toBeTruthy();
    expect(screen.getByText('FAVORABLE_CONDICIONADO')).toBeTruthy();
    expect(screen.getByText(/No consta un dictamen confirmado manualmente/i)).toBeTruthy();
  });

  it('registra un dictamen solo tras una confirmación manual explícita', async () => {
    const onUpdateSolicitud = vi.fn(async (_actualizada: SolicitudSeguroImpago) => undefined);
    montar(onUpdateSolicitud);
    abrirRespuesta();
    fireEvent.change(screen.getByLabelText(/Texto fuente de respuesta/), { target: { value: TEXTO_RESPUESTA } });
    fireEvent.change(screen.getByLabelText(/Clasificación confirmada por revisión humana/), { target: { value: 'FAVORABLE' } });
    fireEvent.click(screen.getByLabelText(/He contrastado el texto con la comunicación original/));
    fireEvent.click(screen.getByRole('button', { name: 'Registrar dictamen contrastado manualmente' }));

    await waitFor(() => expect(onUpdateSolicitud).toHaveBeenCalledTimes(1));
    const persistida = onUpdateSolicitud.mock.calls[0][0];
    expect(persistida.dictamenAseguradora).toBe('FAVORABLE');
    expect(persistida.dictamenAseguradoraVerificadoManualmente).toBe(true);
    expect(persistida.fechaVerificacionDictamenAseguradora).toMatch(/^20\d\d-/);
    expect(persistida.emailRespuestaRaw).toBe(TEXTO_RESPUESTA);
    expect(persistida.historial.at(-1)).toMatchObject({
      autor: 'propietario',
      accion: 'Dictamen de aseguradora contrastado manualmente con la fuente original',
    });
    expect(screen.getByText('Dictamen registrado por revisión humana de la fuente original; la aplicación no ha autenticado el remitente.')).toBeTruthy();
  });

  it('conserva la revisión en memoria ante fallo de guardado sin anunciar persistencia', async () => {
    const onUpdateSolicitud = vi.fn(async (_actualizada: SolicitudSeguroImpago) => false);
    montar(onUpdateSolicitud);
    abrirRespuesta();
    fireEvent.change(screen.getByLabelText(/Texto fuente de respuesta/), { target: { value: TEXTO_RESPUESTA } });
    fireEvent.change(screen.getByLabelText(/Clasificación confirmada por revisión humana/), { target: { value: 'FAVORABLE' } });
    fireEvent.click(screen.getByLabelText(/He contrastado el texto con la comunicación original/));
    fireEvent.click(screen.getByRole('button', { name: 'Registrar dictamen contrastado manualmente' }));

    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/no se confirmó su persistencia/i));
    const enMemoria = onUpdateSolicitud.mock.calls[0][0];
    expect(enMemoria.dictamenAseguradoraVerificadoManualmente).toBe(true);
    expect(enMemoria.emailRespuestaRaw).toBe(TEXTO_RESPUESTA);
    expect(screen.queryByText('Dictamen registrado por revisión humana de la fuente original; la aplicación no ha autenticado el remitente.')).toBeNull();
    expect(screen.getByText('Contraste humano declarado para el texto fuente')).toBeTruthy();
  });
});
