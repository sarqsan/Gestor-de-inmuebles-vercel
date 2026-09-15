import React, { useState, useRef } from 'react';
import { TipoDocumento } from '../types';
import { getTipoDocumentoLabel } from '../utils/formatters';
import { Upload, X, FileText, Image, CheckCircle, AlertCircle } from 'lucide-react';

interface DocumentUploadModalProps {
  candidatoNombre: string;
  onClose: () => void;
  onUploadDocument: (fileData: {
    nombreArchivo: string;
    mimeType: string;
    base64Data: string;
    tipoDocumento: TipoDocumento;
  }) => void;
}

export const DocumentUploadModal: React.FC<DocumentUploadModalProps> = ({
  candidatoNombre,
  onClose,
  onUploadDocument,
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [base64String, setBase64String] = useState<string>('');
  const [tipoDocumento, setTipoDocumento] = useState<TipoDocumento>('nomina');
  const [autoDetect, setAutoDetect] = useState<boolean>(true);
  const [dragActive, setDragActive] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (file: File) => {
    setErrorMessage(null);
    const validTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];

    if (!validTypes.includes(file.type)) {
      setErrorMessage('Por favor, selecciona un archivo válido: PDF, JPG, JPEG o PNG.');
      return;
    }

    if (file.size > 20 * 1024 * 1024) {
      setErrorMessage('El tamaño máximo permitido de archivo es 20MB.');
      return;
    }

    setSelectedFile(file);

    // Convert file to Base64
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setBase64String(result);
    };
    reader.onerror = () => {
      setErrorMessage('Error al leer el archivo. Inténtalo de nuevo.');
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileChange(e.dataTransfer.files[0]);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile || !base64String) {
      setErrorMessage('Selecciona un archivo antes de continuar.');
      return;
    }

    onUploadDocument({
      nombreArchivo: selectedFile.name,
      mimeType: selectedFile.type,
      base64Data: base64String,
      tipoDocumento: autoDetect ? 'nomina' : tipoDocumento, // 'nomina' as default placeholder when auto-detecting
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3 sm:p-4 md:p-6 overflow-y-auto">
      <div
        className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-100 bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base">Añadir Documento</h3>
              <p className="text-xs text-slate-500">Candidato: <span className="font-medium text-slate-700">{candidatoNombre}</span></p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs sm:text-sm">
          {errorMessage && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Drag & Drop Area */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-6 text-center transition-all cursor-pointer ${
              dragActive
                ? 'border-blue-500 bg-blue-50/50'
                : selectedFile
                ? 'border-emerald-400 bg-emerald-50/30'
                : 'border-slate-300 hover:border-blue-400 bg-slate-50/60'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  handleFileChange(e.target.files[0]);
                }
              }}
            />

            {selectedFile ? (
              <div className="space-y-2">
                <div className="w-12 h-12 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
                  {selectedFile.type.includes('pdf') ? (
                    <FileText className="w-6 h-6" />
                  ) : (
                    <Image className="w-6 h-6" />
                  )}
                </div>
                <div>
                  <p className="font-bold text-slate-900 text-sm truncate max-w-xs mx-auto">{selectedFile.name}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{(selectedFile.size / (1024 * 1024)).toFixed(2)} MB</p>
                </div>
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-100/80 px-2.5 py-1 rounded-full">
                  <CheckCircle className="w-3.5 h-3.5" /> Archivo seleccionado
                </span>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="w-12 h-12 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center mx-auto">
                  <Upload className="w-6 h-6" />
                </div>
                <div>
                  <p className="font-bold text-slate-800 text-sm">Arrastra tu archivo aquí o haz clic para buscar</p>
                  <p className="text-xs text-slate-400 mt-1">Formatos soportados: PDF, JPG, JPEG, PNG (Máx. 20MB)</p>
                </div>
              </div>
            )}
          </div>

          {/* Tipo de Documento e Identificación Auto */}
          <div className="space-y-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200/80">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700">Identificación con IA Gemini:</label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoDetect}
                  onChange={(e) => setAutoDetect(e.target.checked)}
                  className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                />
                <span className="text-xs font-semibold text-blue-700">Auto-detectar con IA ✨</span>
              </label>
            </div>

            {!autoDetect && (
              <div className="space-y-1">
                <label className="block text-xs font-medium text-slate-600">Seleccionar Tipo Manualmente:</label>
                <select
                  value={tipoDocumento}
                  onChange={(e) => setTipoDocumento(e.target.value as TipoDocumento)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value="nomina">Nómina</option>
                  <option value="contrato">Contrato laboral</option>
                  <option value="vida_laboral">Vida laboral</option>
                  <option value="renta">Declaración de la renta</option>
                  <option value="dni_nie">DNI / NIE</option>
                  <option value="justificante_bancario">Justificante bancario</option>
                  <option value="otros_ingresos">Justificante de otros ingresos</option>
                  <option value="avalista">Documentación de avalista</option>
                  <option value="otro">Otro</option>
                </select>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 font-semibold text-xs rounded-xl transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!selectedFile}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl transition-colors shadow-md shadow-blue-500/20"
            >
              Añadir y Procesar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
