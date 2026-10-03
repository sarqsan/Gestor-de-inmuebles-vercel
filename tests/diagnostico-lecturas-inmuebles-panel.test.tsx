/**
 * PANTALLA DE ADMINISTRACIÓN «Diagnóstico de lecturas de Inmuebles».
 *
 * Verifica lo que la orden 2026-10-03 exige de la interfaz:
 *  · solo el administrador principal ve datos (espejo de `isMasterAdmin()`);
 *  · el error se lee de un golpe: origen, código, fecha, causa y consulta;
 *  · filtros por origen y por código;
 *  · producción y desarrollo NUNCA se mezclan;
 *  · el detalle muestra el contexto completo con identificadores minimizados;
 *  · no se filtra ningún correo aunque el registro de auditoría lo traiga;
 *  · «Limpiar vista local» solo afecta a la copia del dispositivo.
 */
// @vitest-environment jsdom
import fs from 'fs';
import path from 'path';
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  DiagnosticoLecturasInmueblesPanel,
  puedeConsultarDiagnosticoLecturas,
} from '../src/components/admin/DiagnosticoLecturasInmueblesPanel';
import {
  ACCION_DIAGNOSTICO_INMUEBLES,
  CLAVE_ALMACEN_INMUEBLES,
  construirIncidenciaLecturaInmuebles,
  documentoAuditoriaIncidencia,
  registrarIncidenciaLecturaInmuebles,
  _reiniciarEstadoObservabilidadParaPruebas,
  type IncidenciaLecturaInmuebles,
} from '../src/lib/observabilidadLecturaInmuebles';
import {
  construirInformeInmuebles,
  type ContextoLecturaInmuebles,
} from '../src/lib/diagnosticoInmuebles';
import type { AuditLog, UsuarioApp } from '../src/types';

const MASTER = 'sarqsan2@gmail.com';
const UID = 'uid-auth-1234567890';
const PID = 'prop-1783441481122_0';

const master = {
  id: 'u-master',
  nombre: 'Master',
  email: MASTER,
  tipoPerfil: 'ADMINISTRADOR',
  estado: 'ACTIVO',
  roles: ['SUPERADMIN'],
  permisos: [],
} as unknown as UsuarioApp;

const propietario = {
  id: 'u-prop',
  nombre: 'Propietaria',
  email: 'propietaria@erp.test',
  tipoPerfil: 'PROPIETARIO',
  estado: 'ACTIVO',
  roles: [],
  permisos: [],
} as unknown as UsuarioApp;

const informe = (extra: Partial<ContextoLecturaInmuebles> = {}) =>
  construirInformeInmuebles({
    ctx: {
      origen: 'INM-COT',
      consulta: "inmuebles where('titularesIds','array-contains', pid)  [cotitularidad]",
      pid: PID,
      authUid: UID,
      tipoPerfil: 'PROPIETARIO',
      propietarioIdCliente: PID,
      numeroInmuebleIds: 2,
      numeroInmueblesParciales: 0,
      numeroCarterasGestionadas: 0,
      proyecto: 'gestor-inmuebles-produccion',
      baseDeDatos: 'ai-studio-gestordeinmueble-ejemplo',
      codigoError: 'permission-denied',
      mensajeError: 'Missing or insufficient permissions.',
      ...extra,
    },
    observacion: {
      espejo: { estado: 'EXISTE', datos: { usuarioId: 'usuario-1', propietarioId: PID, tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO' } },
      perfil: { estado: 'EXISTE', datos: { authUid: UID, propietarioId: PID, tipoPerfil: 'PROPIETARIO', estado: 'ACTIVO' } },
      perfilPorUid: { estado: 'NO_EXISTE' },
    },
    momento: '2026-10-03T20:15:00.000Z',
  });

const incidencia = (extra: Partial<ContextoLecturaInmuebles> = {}, entorno: 'production' | 'development' = 'production') =>
  construirIncidenciaLecturaInmuebles(informe(extra), { entorno, momento: '2026-10-03T20:15:00.000Z' });

/** Registro de auditoría tal y como lo produce el transporte real. */
const auditLog = (registro: IncidenciaLecturaInmuebles, extra: Partial<AuditLog> = {}): AuditLog =>
  ({
    id: `audit_${registro.clave.slice(0, 6)}_${registro.fechaHora}`,
    usuarioId: 'h:0f1e2d3c',
    usuarioEmail: 'correo-que-no-debe-verse@erp.test',
    usuarioNombre: 'Diagnóstico técnico (lectura de inmuebles)',
    accion: ACCION_DIAGNOSTICO_INMUEBLES,
    descripcion: `Lectura · Inmuebles — ${registro.origen} · ${registro.errorCode} · ${registro.causa}`,
    fechaHora: registro.fechaHora,
    entidadAfectada: 'modulo',
    idAfectado: registro.origen,
    resultado: 'ERROR',
    detalles: { incidencia: registro },
    ...extra,
  }) as unknown as AuditLog;

beforeEach(() => {
  _reiniciarEstadoObservabilidadParaPruebas();
  try {
    localStorage.removeItem(CLAVE_ALMACEN_INMUEBLES);
  } catch {
    /* almacenamiento no disponible: nada que limpiar */
  }
});

afterEach(() => cleanup());

describe('panel de diagnóstico de lecturas · autorización', () => {
  it('el propietario no ve ningún dato (espejo de isMasterAdmin)', () => {
    expect(puedeConsultarDiagnosticoLecturas(propietario, propietario.email)).toBe(false);
    render(
      <DiagnosticoLecturasInmueblesPanel
        auditLogs={[auditLog(incidencia())]}
        currentUser={propietario}
        emailSesion={propietario.email}
      />
    );
    expect(screen.getByTestId('diagnostico-lecturas-inmuebles')).toBeTruthy();
    expect(screen.queryByTestId('diag-produccion')).toBeNull();
    expect(screen.getByText(/Solo el administrador principal/)).toBeTruthy();
  });

  it('un administrador que no sea el principal tampoco ve datos', () => {
    const otroAdmin = { ...master, email: 'otro@erp.test' } as UsuarioApp;
    expect(puedeConsultarDiagnosticoLecturas(otroAdmin, otroAdmin.email)).toBe(false);
  });

  it('el administrador principal sí ve el diagnóstico', () => {
    expect(puedeConsultarDiagnosticoLecturas(master, MASTER)).toBe(true);
    render(<DiagnosticoLecturasInmueblesPanel auditLogs={[]} currentUser={master} emailSesion={MASTER} />);
    expect(screen.getByTestId('diag-produccion')).toBeTruthy();
  });
});

describe('panel de diagnóstico de lecturas · lectura inmediata del error', () => {
  it('muestra origen, código, fecha, causa y consulta sin abrir nada', () => {
    render(
      <DiagnosticoLecturasInmueblesPanel auditLogs={[auditLog(incidencia())]} currentUser={master} emailSesion={MASTER} />
    );
    const fila = screen.getByTestId('incidencia-fila');
    expect(fila.getAttribute('data-origen')).toBe('INM-COT');
    expect(fila.textContent).toContain('INM-COT');
    expect(fila.textContent).toContain('permission-denied');
    expect(fila.textContent).toContain('ESTADO_CUMPLE_LA_REGLA');
    expect(fila.textContent).toContain("array-contains");
    // Fecha localizada por el navegador: se comprueba el año y que hay hora (no el formato).
    expect(fila.textContent).toContain('2026');
    expect(fila.textContent).toMatch(/\d{1,2}:\d{2}/);
  });

  it('el detalle añade el contexto minimizado y el ámbito', () => {
    render(
      <DiagnosticoLecturasInmueblesPanel auditLogs={[auditLog(incidencia())]} currentUser={master} emailSesion={MASTER} />
    );
    fireEvent.click(screen.getByTestId('incidencia-fila'));
    const panel = screen.getByTestId('diagnostico-lecturas-inmuebles');
    expect(panel.textContent).toContain('pidEspejo');
    expect(panel.textContent).toContain(`${PID.slice(0, 6)}…`);
    expect(panel.textContent).toContain('inmuebleIds:2,parciales:0,carteras:0');
  });

  it('nunca muestra el correo que el registro de auditoría sí contiene', () => {
    render(
      <DiagnosticoLecturasInmueblesPanel auditLogs={[auditLog(incidencia())]} currentUser={master} emailSesion={MASTER} />
    );
    fireEvent.click(screen.getByTestId('incidencia-fila'));
    expect(screen.getByTestId('diagnostico-lecturas-inmuebles').textContent).not.toContain('correo-que-no-debe-verse');
  });
});

describe('panel de diagnóstico de lecturas · filtros y entornos', () => {
  const produccion = auditLog(incidencia());
  const desarrollo = auditLog(incidencia({ origen: 'INM-OWN' }, 'development'));

  it('separa producción y desarrollo (nunca se mezclan)', () => {
    render(<DiagnosticoLecturasInmueblesPanel auditLogs={[produccion, desarrollo]} currentUser={master} emailSesion={MASTER} />);
    const bloqueProduccion = screen.getByTestId('diag-produccion');
    const bloqueDesarrollo = screen.getByTestId('diag-desarrollo');
    expect(bloqueProduccion.textContent).toContain('INM-COT');
    expect(bloqueProduccion.textContent).not.toContain('INM-OWN');
    expect(bloqueDesarrollo.textContent).toContain('INM-OWN');
    expect(bloqueDesarrollo.textContent).not.toContain('INM-COT');
  });

  it('filtra por origen y por código', () => {
    const tercero = auditLog(incidencia({ origen: 'INM-ID', codigoError: 'unavailable' }));
    render(<DiagnosticoLecturasInmueblesPanel auditLogs={[produccion, tercero]} currentUser={master} emailSesion={MASTER} />);
    expect(screen.getAllByTestId('incidencia-fila')).toHaveLength(2);

    fireEvent.change(screen.getByTestId('filtro-origen'), { target: { value: 'INM-ID' } });
    expect(screen.getAllByTestId('incidencia-fila')).toHaveLength(1);
    expect(screen.getByTestId('incidencia-fila').getAttribute('data-origen')).toBe('INM-ID');

    fireEvent.change(screen.getByTestId('filtro-codigo'), { target: { value: 'permission-denied' } });
    expect(screen.queryAllByTestId('incidencia-fila')).toHaveLength(0);
  });
});

describe('panel de diagnóstico de lecturas · copia local', () => {
  it('muestra las incidencias locales no confirmadas y las puede limpiar', () => {
    const local = incidencia({ origen: 'INM-GEST' }, 'production');
    localStorage.setItem(CLAVE_ALMACEN_INMUEBLES, JSON.stringify([{ ...local, contador: 4 }]));

    render(<DiagnosticoLecturasInmueblesPanel auditLogs={[]} currentUser={master} emailSesion={MASTER} />);
    const bloqueLocal = screen.getByTestId('diag-locales');
    expect(bloqueLocal.textContent).toContain('INM-GEST');
    expect(bloqueLocal.textContent).toContain('local x4');

    fireEvent.click(screen.getByTestId('limpiar-local'));
    expect(screen.getByTestId('diag-locales').textContent).toContain('Sin incidencias registradas');
    expect(JSON.parse(localStorage.getItem(CLAVE_ALMACEN_INMUEBLES) || '[]')).toEqual([]);
  });
});

describe('panel de diagnóstico de lecturas · criterio de éxito de la orden', () => {
  it('error real → incidencia persistida → el administrador identifica la lectura que falla', async () => {
    // 1) La sesión sufre el `permission-denied` y el diagnóstico produce el informe.
    const informeReal = informe();
    // 2) El transporte lo persiste con el sobre REAL del módulo (mismo que usa firebase.ts).
    let documento: Record<string, unknown> | null = null;
    const resultado = await registrarIncidenciaLecturaInmuebles(informeReal, {
      entorno: 'production',
      enviarRemoto: async (registro) => {
        documento = documentoAuditoriaIncidencia(registro, 'audit_diag_inm_e2e');
      },
    });
    expect(resultado.enviadoRemoto).toBe(true);
    expect(resultado.registro.origen).toBe('INM-COT');
    expect(resultado.registro.errorCode).toBe('permission-denied');

    // 3) El administrador autorizado abre la pantalla y ve el origen exacto + el contexto.
    render(
      <DiagnosticoLecturasInmueblesPanel
        auditLogs={[documento as unknown as AuditLog]}
        currentUser={master}
        emailSesion={MASTER}
      />
    );
    const fila = screen.getByTestId('incidencia-fila');
    expect(fila.getAttribute('data-origen')).toBe('INM-COT');
    expect(fila.textContent).toContain('permission-denied');
    fireEvent.click(fila);
    const texto = screen.getByTestId('diagnostico-lecturas-inmuebles').textContent ?? '';
    expect(texto).toContain("array-contains");
    expect(texto).toContain('PROPIETARIO');
    expect(texto).toContain(`${PID.slice(0, 6)}…`); // propietario minimizado
    expect(texto).not.toContain(PID);
  });

  it('el panel está montado en el área de administración REAL (AdminControlCenter)', () => {
    const admin = fs.readFileSync(path.resolve(__dirname, '../src/components/admin/AdminControlCenter.tsx'), 'utf8');
    expect(admin).toMatch(/import \{ DiagnosticoLecturasInmueblesPanel \} from '\.\/DiagnosticoLecturasInmueblesPanel';/);
    expect(admin).toContain('<DiagnosticoLecturasInmueblesPanel auditLogs={auditLogs} currentUser={currentUser} />');
  });
});
