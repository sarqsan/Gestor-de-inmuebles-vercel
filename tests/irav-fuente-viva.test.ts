/**
 * P1.2 (parcial) — Contrato de fuente IRAV: NO se presenta un snapshot como
 * fuente viva, y una fuente caducada IMPIDE calcular (fallo cerrado).
 */
import { describe, it, expect } from 'vitest';
import {
  proveedorSnapshotLocal,
  proveedorRemotoPendiente,
  resolverSerieIrav,
  validarFrescuraSerie,
  consultaMasReciente,
  ErrorFuenteIravNoDisponible,
  type ProveedorFuenteIrav,
} from '../server/indices/fuenteIrav';
import {
  FUENTES_IRAV_OFICIALES,
  MAX_DIAS_ANTIGUEDAD_FUENTE_IRAV,
  calcularPreviewActualizacionRenta,
  type DatoIRAVOficial,
} from '../src/utils/actualizacionRentaEngine';

const HOY = '2026-10-27';

describe('fuente IRAV · honestidad del origen', () => {
  it('el proveedor por defecto se declara SNAPSHOT_LOCAL, nunca REMOTO', async () => {
    const r = await proveedorSnapshotLocal().obtenerSerie();
    expect(r.origen).toBe('SNAPSHOT_LOCAL');
    expect(r.aviso).toContain('NO es una fuente viva');
    expect(r.serie).toHaveLength(2);
    expect(consultaMasReciente(r.serie)).toBe('2026-10-17');
    expect(FUENTES_IRAV_OFICIALES.at(-1)?.variacionAnualPct).toBe(2.54);
  });

  it('el proveedor remoto PENDIENTE falla cerrado y NO simula una descarga', async () => {
    await expect(proveedorRemotoPendiente().obtenerSerie()).rejects.toThrow(ErrorFuenteIravNoDisponible);
    await expect(resolverSerieIrav(proveedorRemotoPendiente(), HOY)).rejects.toThrow(/PENDIENTE/);
  });

  it('la frescura se valida: 0 días OK, 45 OK, 46 rechazado, fecha futura rechazada', () => {
    const base: DatoIRAVOficial = {
      serie: 'IRAV1', periodo: '2026M09', variacionAnualPct: 2.54, estado: 'DEFINITIVO',
      publicadoEn: '2026-10-14', consultadoEn: '2026-10-17',
      urlSerie: 'https://www.ine.es/consul/serie.do?d=true&s=IRAV1',
      urlCalendario: 'https://www.ine.es/uc/oC7D0Ncd',
    };
    expect(validarFrescuraSerie([base], '2026-10-17').ok).toBe(true);
    expect(validarFrescuraSerie([base], '2026-12-01').ok).toBe(true); // 45 días
    expect(validarFrescuraSerie([base], '2026-12-02').motivo).toBe('FUENTE_IRAV_DESACTUALIZADA');
    expect(validarFrescuraSerie([base], '2026-10-01').motivo).toBe('FECHA_CONSULTA_FUTURA');
    expect(validarFrescuraSerie([], HOY).motivo).toBe('SERIE_VACIA');
    expect(MAX_DIAS_ANTIGUEDAD_FUENTE_IRAV).toBe(45);
  });

  it('resolverSerieIrav rechaza una fuente manipulada sin fecha de consulta', async () => {
    const proveedor: ProveedorFuenteIrav = {
      id: 'sin_fecha',
      async obtenerSerie() {
        return { origen: 'REMOTO_VERIFICADO', serie: [], consultadoEn: null, aviso: null };
      },
    };
    await expect(resolverSerieIrav(proveedor, HOY)).rejects.toThrow(/no declara fecha de consulta/);
  });

  it('el MOTOR ya inyecta la serie: con una fuente caducada NO calcula', async () => {
    const contrato = {
      id: 'contrato-1', inmuebleId: 'inmueble-1', propietarioId: 'propietario-1',
      fechaCelebracionContrato: '2026-10-08', fechaInicioContrato: '2025-10-17',
      rentaMensual: 1250.01, esVigente: true, modalidadContractual: 'VIVIENDA_HABITUAL',
      finalidadUso: 'Vivienda habitual',
      referenciaContratoActualizacionRenta: 'contratos/c-1/contrato.pdf',
      evidenciaClausulaActualizacionRenta: {
        estado: 'ACREDITADA', textoExtracto: 'Se aplicará el IRAV publicado',
        referenciaDocumental: 'contratos/c-1/contrato.pdf', mecanismo: 'IRAV',
      },
    } as any;
    const datos = {
      evidenciaContrato: 'contratos/c-1/contrato.pdf',
      limitePrecioReferencia: {
        importeMensual: 1500, consultadoEn: '2027-10-17',
        referenciaOficial: 'consulta-servidor:test-1', verificadoServidor: true as const,
      },
    };
    // 2027-10-17 está a 365 días de la consulta codificada (2026-10-17).
    const antiguo: any = calcularPreviewActualizacionRenta(contrato, datos, {
      hoy: '2027-10-17', serie: FUENTES_IRAV_OFICIALES,
    });
    expect(antiguo.codigo).toBe('FUENTE_IRAV_DESACTUALIZADA');
    expect(antiguo.rentaFutura).toBeUndefined();
    // Y el resolvedor de fuente también bloquea antes de llegar al motor.
    await expect(resolverSerieIrav(proveedorSnapshotLocal(), '2027-10-17')).rejects.toThrow(
      /FUENTE_IRAV_DESACTUALIZADA/,
    );
  });
});
