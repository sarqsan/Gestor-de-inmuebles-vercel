/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ROLES_PREDEFINIDOS } from '../../types';
import { CentroAyudaSection } from './CentroAyudaSection';
import { AsistentePanel } from '../experiencia/AsistentePanel';

afterEach(cleanup);
const permisosAdmin = ROLES_PREDEFINIDOS.find((r) => r.id === 'SUPERADMIN')!.permisos;
const permisosProp = ROLES_PREDEFINIDOS.find((r) => r.id === 'PROPIETARIO_ESTANDAR')!.permisos;

describe('BLOQUE 9 · Centro de Ayuda', () => {
  it('filtra por categorías autorizadas y muestra contenidos categorizados', () => {
    render(<CentroAyudaSection usuario={{ tipoPerfil: 'ADMINISTRADOR', roles: ['SUPERADMIN'], permisos: permisosAdmin }} onIniciarTutorial={vi.fn()} />);
    const filtro = screen.getByRole('combobox', { name: 'Filtrar por categoría' });
    fireEvent.change(filtro, { target: { value: 'documentos' } });
    expect(screen.getByRole('heading', { name: 'Documentos y evidencias' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Migración histórica' })).toBeNull();
    fireEvent.change(filtro, { target: { value: 'migracion' } });
    expect(screen.getByRole('heading', { name: 'Migración histórica' })).toBeTruthy();
  });

  it('presenta una consulta aprobada como resultado verificable del motor, sin que Gemini ejecute datos', async () => {
    const onConsultar = vi.fn(async () => ({ estado: 'OK' as const, capabilityId: 'cap.gastos.ejercicio', titulo: 'Resumen de gastos · 2026', resumen: 'Resultado verificado.', motorOficial: 'fiscalEngine.calcularGastosEjercicio', hechos: [{ etiqueta: 'Gasto total según el motor', valor: 100, formato: 'EUR' as const }], ambito: 'AMBITO_AUTORIZADO' as const }));
    render(<AsistentePanel usuario={{ tipoPerfil: 'ADMINISTRADOR', roles: ['SUPERADMIN'], permisos: permisosAdmin }} section="inicio" onAccion={vi.fn()} onConsultar={onConsultar} />);
    fireEvent.click(screen.getByRole('button', { name: 'Asistente' }));
    const dialog = screen.getByRole('dialog', { name: 'Asistente' });
    fireEvent.change(within(dialog).getByLabelText('¿Qué necesitas?'), { target: { value: 'gastos de 2026' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Enviar petición' }));
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Consultar datos autorizados' })).toBeTruthy());
    fireEvent.click(within(dialog).getByRole('button', { name: 'Consultar datos autorizados' }));
    await waitFor(() => expect(onConsultar).toHaveBeenCalledTimes(1));
    expect(within(dialog).getByLabelText('Resultado verificado del ERP').textContent).toContain('fiscalEngine.calcularGastosEjercicio');
    expect(within(dialog).getByText('100,00 €')).toBeTruthy();
  });

  it('no expone categorías ni entradas de administración al propietario; ofrece acceso al asistente en el centro', () => {
    const onAccion = vi.fn();
    render(<CentroAyudaSection usuario={{ tipoPerfil: 'PROPIETARIO', roles: ['PROPIETARIO_ESTANDAR'], permisos: permisosProp }} onIniciarTutorial={vi.fn()} onAccionAsistente={onAccion} />);
    const filtro = screen.getByRole('combobox', { name: 'Filtrar por categoría' });
    const categorias = within(filtro).getAllByRole('option').map((option) => option.textContent);
    expect(categorias).not.toContain('Auditoría');
    expect(categorias).not.toContain('Usuarios y permisos');
    expect(screen.queryByRole('heading', { name: 'Usuarios, roles y permisos' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Asistente' }));
    expect(screen.getByRole('dialog', { name: 'Asistente' })).toBeTruthy();
  });
});
