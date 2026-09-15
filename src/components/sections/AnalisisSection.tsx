import React, { useState } from 'react';
import { Candidato, Inmueble } from '../../types';
import { calcularValuracionCandidato } from '../../utils/solvenciaEngine';
import { SolvenciaCard } from '../SolvenciaCard';
import { ComparadorCandidatos } from '../ComparadorCandidatos';
import { formatEuro } from '../../utils/formatters';
import { ResumenDocumentalCard } from '../ResumenDocumentalCard';
import {
  Sparkles,
  BrainCircuit,
  FileCheck,
  FileText,
  ShieldCheck,
  Scale,
  Users,
  Layers,
  Search,
  CheckCircle2,
  Clock,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';

interface AnalisisSectionProps {
  candidatos: Candidato[];
  inmuebles: Inmueble[];
  initialCandidateId?: string;
  onSelectCandidateModal?: (cand: Candidato) => void;
  onGenerarInforme?: (cand: Candidato) => void;
}

export const AnalisisSection: React.FC<AnalisisSectionProps> = ({
  candidatos,
  inmuebles,
  initialCandidateId,
  onSelectCandidateModal,
  onGenerarInforme,
}) => {
  const [activeTab, setActiveTab] = useState<'individual' | 'comparador' | 'arquitectura'>('individual');
  const [selectedCandidateId, setSelectedCandidateId] = useState<string>(
    initialCandidateId || candidatos[0]?.id || ''
  );

  const selectedCandidate = candidatos.find((c) => c.id === selectedCandidateId) || candidatos[0];
  const property = inmuebles.find((i) => i.id === selectedCandidate?.inmuebleId);

  // Calcular resultado dinámico
  const valuracion = selectedCandidate
    ? calcularValuracionCandidato(selectedCandidate, property)
    : null;

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-2xl p-6 text-white shadow-lg relative overflow-hidden">
        <div className="relative z-10 max-w-3xl">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-500/30 text-indigo-200 border border-indigo-400/30 mb-3">
            <Sparkles className="w-3.5 h-3.5 text-indigo-300" />
            Módulo de Valoración Explicable y Transparente
          </div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight">
            Sistema de Valoración de Candidatos (Índice de Solvencia)
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 mt-1 leading-relaxed">
            Evaluación objetiva basada en la capacidad de pago, estabilidad laboral, consistencia de ingresos y grado de documentación aportado. La decisión final siempre corresponde al propietario.
          </p>
        </div>
      </div>

      {/* Tabs Selector: Individual vs Comparador vs Arquitectura IA */}
      <div className="bg-white p-2 rounded-2xl border border-slate-200/80 shadow-2xs flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('individual')}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-all ${
              activeTab === 'individual'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-slate-50 text-slate-700 hover:bg-slate-100'
            }`}
          >
            <BrainCircuit className="w-4 h-4 text-indigo-400" />
            Valoración Individual
          </button>

          <button
            onClick={() => setActiveTab('comparador')}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-all ${
              activeTab === 'comparador'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-slate-50 text-slate-700 hover:bg-slate-100'
            }`}
          >
            <Users className="w-4 h-4 text-blue-400" />
            Comparador por Inmueble
          </button>

          <button
            onClick={() => setActiveTab('arquitectura')}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-all ${
              activeTab === 'arquitectura'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-slate-50 text-slate-700 hover:bg-slate-100'
            }`}
          >
            <Sparkles className="w-4 h-4 text-purple-400" />
            Análisis de Documentación (Gemini AI)
          </button>
        </div>

        {/* Candidate Selector (visible in individual mode) */}
        {activeTab === 'individual' && (
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <span className="text-xs font-bold text-slate-500 hidden md:inline">Candidato:</span>
            <select
              value={selectedCandidateId}
              onChange={(e) => setSelectedCandidateId(e.target.value)}
              className="w-full sm:w-72 px-3.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-2xs"
            >
              {candidatos.map((cand) => (
                <option key={cand.id} value={cand.id}>
                  {cand.nombre} ({cand.inmuebleNombre})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* TAB 1: VALORACIÓN INDIVIDUAL DE CANDIDATO */}
      {activeTab === 'individual' && valuracion && selectedCandidate && (
        <div className="space-y-4">
          <div className="bg-gradient-to-r from-indigo-900 via-slate-900 to-indigo-950 p-4 rounded-2xl text-white shadow-md border border-indigo-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-500/30 text-indigo-200 border border-indigo-400/30">
                  Informe Inteligente de {selectedCandidate.nombre}
                </span>
                {selectedCandidate.ultimoInforme && (
                  <span className="text-xs text-slate-300">
                    Última versión: #{selectedCandidate.ultimoInforme.versionNum} ({selectedCandidate.ultimoInforme.fechaGeneracion})
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-300">
                Analiza conjuntamente solvencia, ratio de pago, datos laborales, documentos OCR y coherencia entre datos declarados y acreditados.
              </p>
            </div>

            {onGenerarInforme && (
              <button
                onClick={() => onGenerarInforme(selectedCandidate)}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl transition-all shadow-md flex items-center justify-center gap-2 shrink-0 self-stretch sm:self-auto"
              >
                <Sparkles className="w-4 h-4 text-indigo-200" />
                <span>{selectedCandidate.ultimoInforme ? 'Ver / Regenerar informe' : 'Generar informe'}</span>
              </button>
            )}
          </div>

          <SolvenciaCard resultado={valuracion} />
        </div>
      )}

      {/* TAB 2: COMPARADOR DE CANDIDATOS */}
      {activeTab === 'comparador' && (
        <ComparadorCandidatos
          candidatos={candidatos}
          inmuebles={inmuebles}
          onSelectCandidate={onSelectCandidateModal}
        />
      )}

      {/* TAB 3: ANÁLISIS DE DOCUMENTACIÓN CON GEMINI */}
      {activeTab === 'arquitectura' && selectedCandidate && (
        <div className="space-y-6">
          <ResumenDocumentalCard candidato={selectedCandidate} documentosAnalizados={selectedCandidate.documentosAnalizados} />

          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-indigo-600" />
                  Documentos y Extracción de Datos para {selectedCandidate.nombre}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Abre la ficha completa del candidato para añadir nuevos documentos (PDF/imágenes), revisar datos extraídos o confirmar cambios.
                </p>
              </div>

              {onSelectCandidateModal && (
                <button
                  onClick={() => onSelectCandidateModal(selectedCandidate)}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-indigo-500/20 flex items-center justify-center gap-1.5 self-start sm:self-auto"
                >
                  <ExternalLink className="w-4 h-4" />
                  Gestionar Documentación en Ficha
                </button>
              )}
            </div>

            {/* Document list summary preview */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {(selectedCandidate.documentosAnalizados || []).map((doc) => (
                <div key={doc.id} className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                    <span className="truncate">{doc.nombreArchivo}</span>
                    <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded font-semibold text-[10px]">
                      {doc.estadoAnalisis.toUpperCase()}
                    </span>
                  </div>
                  {doc.resumenAI && (
                    <p className="text-xs text-slate-600 italic">"{doc.resumenAI}"</p>
                  )}
                </div>
              ))}
              {(!selectedCandidate.documentosAnalizados || selectedCandidate.documentosAnalizados.length === 0) && (
                <p className="text-xs text-slate-400 col-span-2 text-center py-4">
                  No hay documentos analizados aún para este candidato. Haz clic en "Gestionar Documentación en Ficha" para subir.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
