/**
 * P6 — UI del paquete del asesor dentro de Importación/Exportación (Datos).
 * Renderiza el panel REAL con el adaptador Firebase mockeado:
 *  · el flujo es revisar (sin binarios) → generar/descargar;
 *  · los documentos no incluidos se declaran ANTES de generar;
 *  · el ZIP se autoverifica con el verificador real y se descarga;
 *  · un paquete con documentos pendientes se distingue como «CON advertencias».
 *
 * @vitest-environment jsdom
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { CobroPeriodo, ContratoFormalizacion, Gasto, Inmueble, UsuarioApp } from '../src/types';
import type { FuentesPaqueteAsesor } from '../src/lib/paqueteAsesor/adaptador';

const INMUEBLE = {
  id: 'i1', direccion: 'Calle Mayor 1', ciudad: 'Alicante', propietarioId: 'p1',
  propietarioPrincipalId: 'p1', estado: 'alquilado', titularesIds: ['p1'],
} as unknown as Inmueble;

const CONTRATO = {
  id: 'c1', inmuebleId: 'i1', propietarioId: 'p1', candidatoNombre: 'Inquilina',
  fechaInicioContrato: '2024-01-01', fechaFinContrato: '2024-12-31',
  rentaMensual: 600, estado: 'FIRMADO', inmuebleDireccion: 'Calle Mayor 1',
  registroCobros: [{
    id: 'cob1', contratoId: 'c1', inmuebleId: 'i1', propietarioId: 'p1',
    anio: 2024, mes: 6, periodoMesAnio: '2024-06', fechaPago: '2024-06-03',
    fechaVencimiento: '2024-06-05', importePrevisto: 600, importeRecibido: 600,
    estado: 'RECIBIDO',
  }],
} as unknown as ContratoFormalizacion;

const GASTO = {
  id: 'g1', inmuebleId: 'i1', propietarioId: 'p1', categoria: 'IBI', concepto: 'IBI 2024',
  importe: 100, estado: 'PAGADO', fechaDevengo: '2024-06-10', ejercicioFiscal: 2024,
} as unknown as Gasto;

function fuentes(docs: FuentesPaqueteAsesor['entrada']['documentosPatrimoniales']): FuentesPaqueteAsesor {
  return {
    entrada: {
      inmuebles: [INMUEBLE],
      contratos: [CONTRATO],
      gastos: [GASTO],
      facturas: [],
      liquidaciones: [],
      polizas: [],
      ...(docs !== undefined ? { documentosPatrimoniales: docs } : {}),
    },
    propietarios: [{ id: 'p1', nombre: 'Propietaria' } as never],
    inmuebles: [INMUEBLE],
    disponibilidad: {
      facturas: null, liquidaciones: null, polizas: null, titularidades: null, documentos: null,
    },
    rutasStorageDocumentos: new Map(),
    avisos: [],
  };
}

const mem = vi.hoisted(() => ({
  fuentes: null as unknown,
  descargado: null as null | { blob: Blob },
}));

vi.mock('../src/lib/firebase', () => ({
  auth: { get currentUser() { return { uid: 'u1', email: 'u@example.com' }; } },
}));

vi.mock('../src/lib/authService', () => ({ getUsuarioByAuthUid: async () => null }));
vi.mock('../src/lib/gestionesCarteraServicio', () => ({
  listarGestionesDeGestor: async () => ({ ok: true, gestiones: [] }),
}));
vi.mock('../src/lib/gestionesCarteraServicioFirebase', () => ({
  dependenciasGestionesCarteraFirestore: {},
}));

vi.mock('../src/lib/importExportFirebase', async (importOriginal) => ({
  ...(await (importOriginal() as Promise<Record<string, unknown>>)),
  cargarFuentesCatalogo: async () => ({
    propietarios: [], inmuebles: [], contratos: [], gastos: [],
  }),
  catalogosDesdeFuentes: () => ({ propietarios: [], inmuebles: [], contratos: [], mapeos: [], existentes: [] }),
  crearPuertoFirebase: () => ({}),
  leerIdentidadCanonicaImport: async () => null,
}));

// El adaptador real de Firebase se sustituye por las fuentes sintéticas; el
// empaquetado usa el núcleo PURO real (ZIP y verificación auténticos).
vi.mock('../src/lib/paqueteAsesorFirebase', async () => {
  const real = await import('../src/lib/paqueteAsesor/adaptador');
  return {
    cargarFuentesPaqueteAsesor: async () => mem.fuentes,
    empaquetarConBinariosStorage: (paquete: unknown, _fuentes: unknown, _incluir: boolean) => (
      real.empaquetarConBinarios(paquete as never, {
        rutas: new Map(),
        incluirBinarios: false,
        leer: async () => { throw new Error('no debe leer binarios en este test'); },
      })
    ),
  };
});

import { ImportExportPanel } from '../src/components/sections/ImportExportPanel';

const USUARIO = {
  id: 'p1', email: 'p1@example.com', nombre: 'Propietaria', tipoPerfil: 'PROPIETARIO',
  propietarioId: 'p1',
} as unknown as UsuarioApp;

const DOC_PENDIENTE = [{
  id: 'd1', inmuebleId: 'i1', propietarioId: 'p1', tipo: 'FACTURA_GASTO',
  nombre: 'Factura pendiente.pdf', nombreStorage: 'f.pdf', mimeType: 'application/pdf',
  tamanoBytes: 0, sha256: '', storagePath: '', fechaDocumental: '2024-06-10',
  fechaIncorporacion: '2024-06-11T00:00:00Z', actorId: 'p1', actorNombre: 'Propietaria',
  version: 1, estado: 'PENDIENTE_STORAGE',
}];

beforeEach(() => {
  mem.descargado = null;
  const url = URL as unknown as Record<string, unknown>;
  url['createObjectURL'] = (blob: Blob) => { mem.descargado = { blob }; return 'blob:test'; };
  url['revokeObjectURL'] = () => {};
});

afterEach(() => { cleanup(); });

function abrirPestana(): { container: HTMLElement } {
  const r = render(<ImportExportPanel inmuebles={[INMUEBLE]} usuario={USUARIO} gestiones={[]} />);
  fireEvent.click(screen.getByRole('button', { name: 'Paquete del asesor' }));
  return r;
}

describe('P6 · UI del paquete del asesor', () => {
  it('revisa el alcance, declara documentos no incluidos y descarga un ZIP verificado', async () => {
    mem.fuentes = fuentes(DOC_PENDIENTE as never);
    const { container } = abrirPestana();
    fireEvent.change(screen.getByLabelText(/Ejercicio:/), { target: { value: '2024' } });
    fireEvent.click(screen.getByRole('button', { name: /1\. Revisar alcance/ }));

    expect(await screen.findByText(/Revisión previa/)).toBeTruthy();
    expect(container.textContent).toContain('1 inmueble(s)');
    expect(container.textContent).toContain('NO_DISPONIBLE');
    expect(container.textContent).toContain('documento(s) referenciado(s)');

    fireEvent.click(screen.getByRole('button', { name: /2\. Generar y descargar/ }));
    expect(await screen.findByText(/Paquete generado y verificado/)).toBeTruthy();
    expect(mem.descargado?.blob.type).toBe('application/zip');
    // Un documento declarado no incluido ⇒ paquete CON advertencias (no falla).
    expect(container.textContent).toContain('Paquete CON advertencias');
    expect(container.textContent).toContain('Verificación independiente: 14 entradas');
  });

  it('sin documentos no incluidos califica el paquete como completo', async () => {
    mem.fuentes = fuentes(undefined);
    const { container } = abrirPestana();
    fireEvent.click(screen.getByRole('button', { name: /1\. Revisar alcance/ }));
    expect(await screen.findByText(/Revisión previa/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /2\. Generar y descargar/ }));
    expect(await screen.findByText(/Paquete generado y verificado/)).toBeTruthy();
    expect(container.textContent).toContain('Paquete completo para el alcance solicitado');
    expect(mem.descargado).not.toBeNull();
  });

  it('un ámbito denegado por el motor no genera descarga y muestra el error', async () => {
    mem.fuentes = fuentes(undefined);
    abrirPestana();
    fireEvent.change(screen.getByLabelText(/Ejercicio:/), { target: { value: '1700' } });
    fireEvent.click(screen.getByRole('button', { name: /1\. Revisar alcance/ }));
    await waitFor(() => expect(screen.getByText(/Ejercicio inválido/)).toBeTruthy());
    expect(screen.queryByText(/Revisión previa/)).toBeNull();
    expect(mem.descargado).toBeNull();
  });
});
