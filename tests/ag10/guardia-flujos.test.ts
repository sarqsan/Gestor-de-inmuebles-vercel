/**
 * AG-10 · GUARDIA DE LOS CINCO FLUJOS CONSUMIDORES.
 *
 * Una prueba de comportamiento no impide que, dentro de seis meses, alguien
 * vuelva a llamar a `saveContratoFirestore` desde un flujo sin declarar qué
 * periodos escribe: el tipo lo permite y la prueba seguiría pasando. Esta guardia
 * lee el CÓDIGO REAL de los cinco puntos de escritura y falla si reaparece el
 * patrón defectuoso (guardar el contrato completo a ciegas).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const RAIZ = resolve(__dirname, '../..');
const leer = (rel: string) => readFileSync(resolve(RAIZ, rel), 'utf8');

const firebaseTs = leer('src/lib/firebase.ts');
const appTs = leer('src/App.tsx');
const importExportTs = leer('src/lib/importExportFirebase.ts');
const nucleo = leer('src/lib/contratoTransaccion.ts');

/** Extrae el cuerpo de una función exportada (hasta la siguiente `export`). */
function cuerpoFuncion(fuente: string, nombre: string): string {
  const inicio = fuente.indexOf(`export async function ${nombre}`);
  if (inicio === -1) throw new Error(`no se encontró ${nombre}`);
  const siguiente = fuente.indexOf('\nexport ', inicio + 10);
  return fuente.slice(inicio, siguiente === -1 ? undefined : siguiente);
}

describe('AG-10 · guardia: el contrato se escribe con transacción y fusión', () => {
  it('saveContratoFirestore usa runTransaction y lee DENTRO de la transacción', () => {
    const cuerpo = cuerpoFuncion(firebaseTs, 'saveContratoFirestore');
    expect(cuerpo).toContain('runTransaction(db');
    expect(cuerpo).toContain('tx.get(refC)');
    expect(cuerpo).toContain('fusionarContratoParaPersistencia(');
    expect(cuerpo).toContain('tx.set(refC');
    // El defecto original: leer fuera y escribir el documento completo.
    expect(cuerpo).not.toContain('setDoc(refC');
    expect(cuerpo).not.toContain('getDoc(refC)');
  });

  it('la escritura del ciclo de alquiler pasa por la misma fusión', () => {
    const cuerpo = cuerpoFuncion(firebaseTs, 'persistirTransicionAlquilerFirestore');
    expect(cuerpo).toContain('runTransaction(db');
    expect(cuerpo).toContain('fusionarContratoParaPersistencia({');
    expect(cuerpo).not.toMatch(/tx\.set\(contratoRef, sanitizeObjectForFirestore\(contratoTx\)/);
  });

  it('el núcleo no importa Firebase: la política de datos es pura y comprobable', () => {
    expect(nucleo).not.toContain("from 'firebase/");
    expect(nucleo).not.toContain("from './firebase'");
  });

  it('existe una única vía de materialización automática, con política de descarte', () => {
    const cuerpo = cuerpoFuncion(firebaseTs, 'materializarPeriodosCobroFirestore');
    expect(cuerpo).toContain("politica: 'descartar'");
    expect(cuerpo).toContain('escriturasPorDiferencia');
  });

  it('el registro de un pago reaplica la intención (no descarta la del usuario)', () => {
    const cuerpo = cuerpoFuncion(firebaseTs, 'registrarCambioPeriodoCobroFirestore');
    expect(cuerpo).toContain("politica: 'reintentar'");
  });
});

describe('AG-10 · guardia: los cinco flujos consumidores', () => {
  it('ALTA y EDICIÓN (App.handleSaveContrato) declaran base y periodos', () => {
    const inicio = appTs.indexOf('const handleSaveContrato = async (');
    const cuerpo = appTs.slice(inicio, inicio + 4000);
    expect(cuerpo).toContain('escriturasPorDiferencia(');
    expect(cuerpo).toContain("modoCobros: 'FUSIONAR'");
    expect(cuerpo).toContain("modoCobros: 'CREAR_SOLO_NUEVOS'");
    expect(cuerpo).toContain('base,');
  });

  it('MATERIALIZACIÓN AUTOMÁTICA (efecto de App) usa la transacción, no el guardado completo', () => {
    const inicio = appTs.indexOf('Materializa el calendario de cobros');
    const efecto = appTs.slice(inicio, inicio + 4000);
    expect(efecto).toContain('materializarPeriodosCobroFirestore(');
    expect(efecto).not.toContain('saveContratoFirestore(sincro.contratoActualizado)');
  });

  it('IMPORTACIÓN (anexarCobro) declara sólo el cobro importado', () => {
    const inicio = importExportTs.indexOf('async anexarCobro(');
    const cuerpo = importExportTs.slice(inicio, inicio + 1200);
    expect(cuerpo).toContain('periodos: [{ despues: cobro, politica:');
    expect(cuerpo).toContain("modoCobros: 'FUSIONAR'");
    // Ya no se reenvía el contrato completo sin política de fusión.
    expect(cuerpo).not.toMatch(/await saveContratoFirestore\(\{ \.\.\.contrato, registroCobros:/);
  });

  it('CIERRE (Tesorería/batch) declara los periodos que cambia', () => {
    const inicio = appTs.indexOf('const handleSaveContratosBatch');
    const cuerpo = appTs.slice(inicio, inicio + 800);
    expect(cuerpo).toContain('escriturasPorDiferencia(');
    expect(cuerpo).toContain("modoCobros: 'FUSIONAR'");
  });

  it('APP conserva el permiso, el gestor de reintentos y la firma tras confirmar', () => {
    expect(appTs).toContain('canWriteContrato(usuarioConAmbitoAlquiler, contrato)');
    expect(appTs).toContain('gestorGuardadoContratos.current');
    expect(appTs).toContain("if (resultado !== 'GUARDADO' && resultado !== 'OBSOLETO')");
    // Indicador visible de error en Formalización (role="alert").
    expect(leer('src/components/sections/FormalizacionSection.tsx')).toContain('No se pudo guardar.');
  });
});
