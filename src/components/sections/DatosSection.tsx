/**
 * AUDITORÍA UX PROPIETARIO (2026-09-29 · FASES 14–19/22) — Sección «Importar / Exportar».
 *
 * Envoltorio FINO del panel canónico `ImportExportPanel` (erp-import-export-v1):
 * NO duplica ningún motor (el panel sigue montado también en Configuración).
 * Su única responsabilidad es hacer DESCUBRIBLE el flujo y explicar, en lenguaje
 * llano, qué puede hacer el usuario y qué garantías tiene antes de confirmar:
 *
 *  Importar:  archivo (JSON/CSV/XLSX) → entidad → Analizar (dry-run 0 escrituras)
 *             → resumen/problemas → confirmar. Nunca escribe al seleccionar.
 *  Exportar:  entidad → ámbito (propietarios/inmuebles/ejercicios) → formato
 *             → generar y descargar.
 *  Fiscal:    la exportación fiscal vive aparte, en «Informes & Export» (FASE 19).
 *
 * El ámbito efectivo lo fijan SIEMPRE las reglas de Firestore (el panel solo
 * restringe la consulta); esta sección no concede ningún permiso nuevo.
 *
 * REVISIÓN PR #13 (2026-09-29): el panel NO recibe `usuario` por props — recibía
 * identidad inyectada y eso apagaba su autocarga y su `DataAccessScope` (bug
 * detectado en la revisión final). Montarlo sin `usuario` reproduce el camino
 * canónico ya probado desde Configuración, con scope acotado por perfil y
 * fail-closed sin sesión. El copy de arriba sigue usando `usuario` SOLO para
 * orientar el texto (nunca define ámbito).
 */
import React from 'react';
import { ArrowDownUp, FileSpreadsheet, Info, ShieldCheck, Upload } from 'lucide-react';
import type { Inmueble, UsuarioApp } from '../../types';
import { ImportExportPanel } from './ImportExportPanel';

interface DatosSectionProps {
  inmuebles: Inmueble[];
  usuario?: UsuarioApp | null;
}

export const DatosSection: React.FC<DatosSectionProps> = ({ inmuebles, usuario }) => {
  const esPropietario = usuario?.tipoPerfil === 'PROPIETARIO';
  return (
    <div className="space-y-4">
      {/* Introducción llana y garantías (presentacional; la autoridad son las Rules) */}
      <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-2xl p-4 flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
          <ArrowDownUp className="w-5 h-5" />
        </div>
        <div className="space-y-1">
          <h3 className="font-bold text-slate-900 text-sm">Importar o exportar tus datos</h3>
          <p className="text-xs text-slate-600 leading-relaxed">
            Formatos admitidos: <strong>JSON</strong>, <strong>CSV</strong> y <strong>Excel (.xlsx)</strong>.
            Al importar, primero se <strong>analiza el archivo y se muestra una vista previa</strong> con lo que
            se crearía, lo duplicado y los problemas: <strong>no se escribe nada hasta que tú lo confirmes</strong>.
            {esPropietario && (
              <> Solo actúa sobre <strong>tus propios datos</strong> (tu ámbito de propietario), igual que el resto
              de la aplicación.</>
            )}
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-[11px] font-semibold text-emerald-800">
            <span className="inline-flex items-center gap-1"><Upload className="w-3.5 h-3.5" /> Vista previa antes de escribir</span>
            <span className="inline-flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5" /> Duplicados detectados y clasificados</span>
            <span className="inline-flex items-center gap-1"><FileSpreadsheet className="w-3.5 h-3.5" /> JSON · CSV · Excel</span>
          </div>
        </div>
      </div>

      {/* Separación conceptual (FASE 19): la exportación fiscal es otro sistema */}
      <div className="flex items-start gap-2 p-3 bg-blue-50/70 border border-blue-200 rounded-xl text-[11px] text-blue-900">
        <Info className="w-4 h-4 shrink-0 mt-0.5 text-blue-600" />
        <span>
          ¿Buscas el <strong>informe fiscal</strong>, la rentabilidad o la <strong>exportación fiscal CSV/JSON</strong>?
          Están en <strong>Informes &amp; Export</strong> (menú «Económico»). Esta pantalla es la exportación
          <em> general de datos</em> (inmuebles, propietarios, contratos, cobros y gastos).
        </span>
      </div>

      {/* Motor canónico, sin modificar.
          REVISIÓN PR #13 (2026-09-29): NO pasar `usuario` por props — con esa
          identidad inyectada el panel desactivaba su autocarga y `scopeEf`
          quedaba `undefined` (consulta a la colección entera → denegación de
          Rules + timeout para PROPIETARIO y para gestores de cartera). Al no
          inyectarlo, el panel construye él mismo su `DataAccessScope` (mismo
          camino probado del montaje de Configuración): propietario → su ficha;
          gestor → sus carteras; sin sesión → bloqueo honesto fail-closed.
          El `usuario` de esta sección se usa solo para la orientación textual. */}
      <div data-tour="datos-panel">
        <ImportExportPanel inmuebles={inmuebles} />
      </div>
    </div>
  );
};
