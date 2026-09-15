import React from 'react';
import { Candidato, DocumentoAnalizado } from '../types';
import { formatEuro, getTipoDocumentoLabel } from '../utils/formatters';
import {
  FileCheck,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Calculator,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react';

interface ResumenDocumentalCardProps {
  candidato: Candidato;
  documentosAnalizados?: DocumentoAnalizado[];
}

export const ResumenDocumentalCard: React.FC<ResumenDocumentalCardProps> = ({
  candidato,
  documentosAnalizados = [],
}) => {
  const docs = documentosAnalizados;

  // Filter analyzed pay slips
  const nominasAnalizadas = docs.filter(
    (d) => d.tipoDocumento === 'nomina' && d.estadoAnalisis === 'analizado' && d.datosExtraidos
  );

  // Extract net incomes from pay slips
  const valoresNominasNetas: number[] = [];
  nominasAnalizadas.forEach((nom) => {
    const fieldNeto = nom.datosExtraidos?.salarioNeto?.valor || nom.datosExtraidos?.liquido?.valor;
    if (fieldNeto) {
      // Parse string like "2.340 €" or 2340
      const parsedNum = typeof fieldNeto === 'number'
        ? fieldNeto
        : parseFloat(String(fieldNeto).replace(/[^0-9,.-]/g, '').replace(',', '.'));
      if (!isNaN(parsedNum) && parsedNum > 0) {
        valoresNominasNetas.push(parsedNum);
      }
    }
  });

  // Calculate average media
  const numNominas = valoresNominasNetas.length;
  const mediaNetos = numNominas > 0
    ? Math.round(valoresNominasNetas.reduce((acc, curr) => acc + curr, 0) / numNominas)
    : candidato.ingresosNetos;

  // Check variation between max and min pay slip net income
  let variacionSignificativa = false;
  let porcentajeVariacion = 0;
  if (numNominas > 1) {
    const min = Math.min(...valoresNominasNetas);
    const max = Math.max(...valoresNominasNetas);
    if (min > 0) {
      porcentajeVariacion = Math.round(((max - min) / min) * 100);
      if (porcentajeVariacion >= 12) {
        variacionSignificativa = true;
      }
    }
  }

  // Count key analyzed documents
  const tieneNomina = nominasAnalizadas.length > 0;
  const tieneContrato = docs.some((d) => d.tipoDocumento === 'contrato' && d.estadoAnalisis === 'analizado');
  const tieneVidaLaboral = docs.some((d) => d.tipoDocumento === 'vida_laboral' && d.estadoAnalisis === 'analizado');
  const tieneRenta = docs.some((d) => d.tipoDocumento === 'renta' && d.estadoAnalisis === 'analizado');
  const tieneDni = docs.some((d) => d.tipoDocumento === 'dni_nie' && d.estadoAnalisis === 'analizado');

  return (
    <div className="bg-slate-50/80 border border-slate-200/90 rounded-2xl p-4 sm:p-5 space-y-4">
      {/* Title */}
      <div className="flex items-center justify-between border-b border-slate-200/80 pb-3">
        <h4 className="font-bold text-slate-900 text-sm sm:text-base flex items-center gap-2">
          <FileCheck className="w-5 h-5 text-indigo-600" />
          Resumen Documental y Verificación
        </h4>
        <span className="text-xs bg-indigo-100 text-indigo-700 px-2.5 py-0.5 rounded-full font-bold">
          {docs.filter((d) => d.estadoAnalisis === 'analizado').length} Analizados
        </span>
      </div>

      {/* Checklist items */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
        <div className="flex items-center justify-between p-2.5 bg-white rounded-xl border border-slate-200/70">
          <span className="flex items-center gap-2 font-medium text-slate-800">
            {tieneNomina ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <Clock className="w-4 h-4 text-amber-500 shrink-0" />
            )}
            Nóminas
          </span>
          <span className={`px-2 py-0.5 rounded font-semibold text-[11px] ${tieneNomina ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
            {numNominas > 0 ? `${numNominas} analizada(s)` : 'Pendiente'}
          </span>
        </div>

        <div className="flex items-center justify-between p-2.5 bg-white rounded-xl border border-slate-200/70">
          <span className="flex items-center gap-2 font-medium text-slate-800">
            {tieneContrato ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <Clock className="w-4 h-4 text-amber-500 shrink-0" />
            )}
            Contrato Laboral
          </span>
          <span className={`px-2 py-0.5 rounded font-semibold text-[11px] ${tieneContrato ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
            {tieneContrato ? 'Analizado' : 'Pendiente'}
          </span>
        </div>

        <div className="flex items-center justify-between p-2.5 bg-white rounded-xl border border-slate-200/70">
          <span className="flex items-center gap-2 font-medium text-slate-800">
            {tieneVidaLaboral ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <Clock className="w-4 h-4 text-amber-500 shrink-0" />
            )}
            Vida Laboral
          </span>
          <span className={`px-2 py-0.5 rounded font-semibold text-[11px] ${tieneVidaLaboral ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
            {tieneVidaLaboral ? 'Analizada' : 'Pendiente'}
          </span>
        </div>

        <div className="flex items-center justify-between p-2.5 bg-white rounded-xl border border-slate-200/70">
          <span className="flex items-center gap-2 font-medium text-slate-800">
            {tieneRenta ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <Clock className="w-4 h-4 text-amber-500 shrink-0" />
            )}
            Declaración de la Renta
          </span>
          <span className={`px-2 py-0.5 rounded font-semibold text-[11px] ${tieneRenta ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
            {tieneRenta ? 'Analizada' : 'Pendiente'}
          </span>
        </div>
      </div>

      {/* Multi-Pay-Slip Breakdown Section */}
      {numNominas > 0 && (
        <div className="bg-indigo-50/60 border border-indigo-100 rounded-xl p-3.5 space-y-2">
          <div className="flex items-center justify-between text-xs font-bold text-indigo-900">
            <span className="flex items-center gap-1.5">
              <Calculator className="w-4 h-4 text-indigo-600" />
              NÓMINAS ANALIZADAS: {numNominas}
            </span>
            <span className="text-slate-500 font-normal">Media calculada:</span>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 bg-white p-2.5 rounded-lg border border-indigo-200/60 text-xs">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-slate-500">Netos:</span>
              {valoresNominasNetas.map((v, i) => (
                <span key={i} className="px-2 py-0.5 bg-slate-100 font-semibold text-slate-800 rounded">
                  {formatEuro(v)}
                </span>
              ))}
            </div>

            <div className="text-right">
              <span className="text-xs text-slate-500">Media: </span>
              <strong className="text-indigo-700 text-sm font-extrabold">{formatEuro(mediaNetos)}/mes</strong>
            </div>
          </div>

          {variacionSignificativa && (
            <div className="flex items-center gap-2 text-xs text-amber-800 bg-amber-50 p-2 rounded-lg border border-amber-200/80">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                Variación detectada del {porcentajeVariacion}% entre nóminas (ej. complementos o variables).
              </span>
            </div>
          )}
        </div>
      )}

      {/* Overall Summary Conclusion Statement */}
      <div className="bg-white p-3 rounded-xl border border-slate-200 text-xs text-slate-700 flex items-start gap-2.5">
        <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold text-slate-900">
            Los documentos analizados muestran ingresos netos aproximados de{' '}
            <span className="text-emerald-700 font-bold">{formatEuro(mediaNetos)}/mes</span>.
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Decisión final correspondiente al propietario. La IA se limita a estructurar y verificar la documentación.
          </p>
        </div>
      </div>
    </div>
  );
};
