/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ConfiguracionAseguradora, Candidato, Inmueble, SolicitudSeguroImpago } from '../types';

vi.mock('../accesibilidad/interaccion', () => ({ propsInteraccion: () => ({}) }));
vi.mock('../accesibilidad/dialogo', () => ({
  useDialogoAccesible: () => ({ refDialogo: { current: null }, propsDialogo: {} }),
}));

import { CrearSolicitudSeguroModal } from './CrearSolicitudSeguroModal';

afterEach(() => cleanup());

const aseguradora = {
  id: 'aseguradora-p7',
  nombre: 'Aseguradora de prueba',
  nombreComercial: 'Aseguradora de prueba',
  emailTramitacion: 'aseguradora@example.invalid',
  activa: true,
  ratioEsfuerzoMaximo: 40,
  antiguedadMinimaMeses: 6,
  documentosRequeridos: ['dni_nie', 'nomina', 'contrato'],
  tasaPrimaAnualPorcentaje: 4.5,
  mesesCoberturaImpago: 12,
  tiempoMedioRespuestaHoras: 24,
  coberturasSugeridas: { mesesImpago: 12, defensaJuridicaEuros: 0, actosVandalicosEuros: 0 },
} as unknown as ConfiguracionAseguradora;

function candidato(scoringTotal?: number) {
  return {
    id: 'candidato-p7',
    nombre: 'Titular de prueba',
    dni: '00000000X',
    telefono: '600000000',
    email: 'titular@example.invalid',
    tipoEmpleo: 'cuenta_ajena_indefinido',
    empresa: 'Empresa de prueba',
    tipoContrato: 'Indefinido',
    antiguedadLaboral: '3 años',
    ingresosNetos: 2400,
    scoringTotal,
    documentosAnalizados: [],
  } as unknown as Candidato;
}

const inmueble = {
  id: 'inmueble-p7',
  titulo: 'Vivienda de prueba',
  direccion: 'Calle de prueba 1',
  ciudad: 'Alicante',
  precio: 900,
} as unknown as Inmueble;

async function crearExpediente(cand: Candidato) {
  const onCrearSolicitud = vi.fn();
  render(
    <CrearSolicitudSeguroModal
      candidato={cand}
      inmueble={inmueble}
      candidatosList={[cand]}
      inmueblesList={[inmueble]}
      aseguradoras={[aseguradora]}
      onClose={vi.fn()}
      onCrearSolicitud={onCrearSolicitud}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: /Crear Expediente y Preparar Solicitud/ }));
  await waitFor(() => expect(onCrearSolicitud).toHaveBeenCalledTimes(1));
  return onCrearSolicitud.mock.calls[0][0] as SolicitudSeguroImpago;
}

describe('CrearSolicitudSeguroModal · evita inventar puntuaciones y conclusiones', () => {
  it('no crea puntuación ni nivel de riesgo cuando no existe una puntuación de origen', async () => {
    const solicitud = await crearExpediente(candidato());

    expect(solicitud).not.toHaveProperty('scoreSolvenciaIA');
    expect(solicitud).not.toHaveProperty('scoreSolvenciaFuente');
    expect(solicitud).not.toHaveProperty('nivelRiesgoIA');
    expect(solicitud).not.toHaveProperty('alertasDetectadasIA');
    expect(solicitud).not.toHaveProperty('resumenSolvenciaIA');
  });

  it('solo conserva una puntuación existente y marca su procedencia, sin derivarla del ratio', async () => {
    const solicitud = await crearExpediente(candidato(73));

    expect(solicitud).toMatchObject({
      scoreSolvenciaIA: 73,
      scoreSolvenciaFuente: 'PUNTUACION_CANDIDATO',
    });
    expect(solicitud).not.toHaveProperty('nivelRiesgoIA');
  });
});
