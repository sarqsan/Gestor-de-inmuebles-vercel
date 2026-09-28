/** Uso: npx tsx scripts/auditar-roadmap01-snapshot.ts /ruta/export-autorizado.json 2026-09-28T00:00:00.000Z
 * NO conecta con Firebase ni abre credenciales. Salida JSON a stdout (rediríjala
 * a un lugar seguro si procede); no guarda ni modifica fichero alguno.
 * El export debe contener arrays COMPLETOS de usuarios, propietarios,
 * usuarios_auth, gestiones_cartera, inmuebles y enlaces_registro. Solo personal
 * autorizado debe prepararlo: puede contener datos personales; no commitearlo.
 */
import { readFileSync } from 'node:fs';
import { auditarInstantaneaRoadmap01, type InstantaneaRoadmap01 } from '../src/lib/auditoriaHistoricaRoadmap01';
const [archivo, fecha] = process.argv.slice(2);
if (!archivo || !fecha) throw new Error('Requiere ruta a instantánea autorizada y fecha ISO --as-of explícita');
const s = JSON.parse(readFileSync(archivo,'utf8')) as InstantaneaRoadmap01;
const hallazgos = auditarInstantaneaRoadmap01(s,fecha);
const resumen = { CORRECTO:0, INCOMPLETO:0, INCONSISTENTE:0, SOBREAUTORIZADO:0, DECISION_HUMANA:0 };
for (const h of hallazgos) resumen[h.nivel]++;
console.log(JSON.stringify({ fecha, resumen, hallazgos,
  advertencia:'Sin evidencia de completitud, procedencia y autorización del export este informe NO valida datos reales ni autoriza reproyección.' },null,2));
