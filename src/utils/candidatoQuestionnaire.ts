import { Candidato, EmploymentType, ContractType } from '../types';

/**
 * Generates an interactive printable/downloadable HTML PDF questionnaire
 * tailored for a candidate.
 */
export function openCandidatoQuestionnairePDF(nombreCandidato: string, inmuebleNombre?: string) {
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('Por favor, permite las ventanas emergentes en tu navegador para generar el PDF del Cuestionario.');
    return;
  }

  const htmlContent = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Cuestionario de Solvencia - ${nombreCandidato}</title>
  <style>
    @media print {
      .no-print { display: none !important; }
      body { background: white; padding: 0; }
      .container { border: none !important; shadow: none !important; }
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background-color: #f8fafc;
      color: #0f172a;
      margin: 0;
      padding: 20px;
    }
    .container {
      max-width: 800px;
      margin: 0 auto;
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 16px;
      padding: 32px;
      box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);
    }
    .header {
      border-bottom: 2px solid #3b82f6;
      padding-bottom: 16px;
      margin-bottom: 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .title {
      font-size: 20px;
      font-weight: 800;
      color: #1e3a8a;
      margin: 0;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .subtitle {
      font-size: 12px;
      color: #64748b;
      margin-top: 4px;
    }
    .actions {
      display: flex;
      gap: 10px;
      margin-bottom: 20px;
    }
    .btn {
      background-color: #2563eb;
      color: white;
      border: none;
      padding: 10px 18px;
      font-size: 13px;
      font-weight: 700;
      border-radius: 8px;
      cursor: pointer;
    }
    .btn:hover { background-color: #1d4ed8; }
    .btn-secondary { background-color: #e2e8f0; color: #334155; }
    .btn-secondary:hover { background-color: #cbd5e1; }
    
    .section-title {
      font-size: 14px;
      font-weight: 700;
      color: #1e293b;
      background: #f1f5f9;
      padding: 8px 12px;
      border-radius: 6px;
      margin-top: 20px;
      margin-bottom: 16px;
      border-left: 4px solid #2563eb;
    }
    .form-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
    }
    .full-width { grid-column: span 2; }
    .field-label {
      font-size: 11px;
      font-weight: 700;
      color: #475569;
      margin-bottom: 4px;
      display: block;
      text-transform: uppercase;
    }
    .field-input {
      width: 100%;
      box-sizing: border-box;
      border: 1.5px solid #cbd5e1;
      border-radius: 6px;
      padding: 8px 12px;
      font-size: 13px;
      color: #0f172a;
      background: #fafafa;
    }
    .prefilled {
      background: #eff6ff;
      border-color: #bfdbfe;
      font-weight: 700;
      color: #1e40af;
    }
    .checkbox-group {
      display: flex;
      gap: 16px;
      align-items: center;
      padding-top: 6px;
    }
    .checkbox-label {
      font-size: 12px;
      font-weight: 600;
      color: #334155;
    }
    .footer-note {
      margin-top: 32px;
      padding-top: 16px;
      border-top: 1px solid #e2e8f0;
      font-size: 11px;
      color: #64748b;
      text-align: center;
      line-height: 1.5;
    }
  </style>
</head>
<body>

  <div class="actions no-print">
    <button onclick="window.print()" class="btn">🖨️ Imprimir / Guardar como PDF</button>
    <button onclick="downloadJsonTemplate()" class="btn btn-secondary">📥 Descargar Ficha Rellenable (.json)</button>
  </div>

  <div class="container">
    <div class="header">
      <div>
        <h1 class="title">Cuestionario de Solvencia para Alquiler</h1>
        <div class="subtitle">Ficha de Datos del Solicitante para Análisis de Perfil de Arrendamiento</div>
      </div>
      <div style="text-align: right; font-size: 12px; font-weight: 700; color: #2563eb;">
        GestinDealquiler
      </div>
    </div>

    <form id="questionnaireForm">
      <div class="section-title">1. Datos Personales de Contacto</div>
      <div class="form-grid">
        <div class="full-width">
          <label class="field-label">Nombre y Apellidos del Solicitante</label>
          <input type="text" id="nombre" class="field-input prefilled" value="${nombreCandidato}" readonly />
        </div>
        <div>
          <label class="field-label">Teléfono de Contacto</label>
          <input type="tel" id="telefono" class="field-input" placeholder="Ej. +34 600 000 000" />
        </div>
        <div>
          <label class="field-label">Correo Electrónico (Email)</label>
          <input type="email" id="email" class="field-input" placeholder="ejemplo@correo.com" />
        </div>
        <div class="full-width">
          <label class="field-label">Vivienda / Inmueble Solicitado</label>
          <input type="text" id="inmuebleNombre" class="field-input" value="${inmuebleNombre || ''}" placeholder="Dirección de la vivienda de interés" />
        </div>
        <div>
          <label class="field-label">N.º de Personas que habitarán la vivienda</label>
          <input type="number" id="numPersonas" class="field-input" value="1" min="1" />
        </div>
        <div>
          <label class="field-label">¿Tiene mascotas?</label>
          <input type="text" id="mascotas" class="field-input" placeholder="Ej. No / Sí, 1 perro pequeño" />
        </div>
      </div>

      <div class="section-title">2. Información Económica y Laboral</div>
      <div class="form-grid">
        <div>
          <label class="field-label">Ingresos Netos Mensuales (€)</label>
          <input type="number" id="ingresosNetos" class="field-input" placeholder="Ej. 2100" />
        </div>
        <div>
          <label class="field-label">Tipo de Empleo</label>
          <select id="tipoEmpleo" class="field-input">
            <option value="cuenta_ajena">Por cuenta ajena</option>
            <option value="autonomo">Autónomo</option>
            <option value="funcionario">Funcionario / Empleo Público</option>
            <option value="pensionista">Pensionista / Jubilado</option>
            <option value="estudiante_otro">Otro / Estudiante</option>
          </select>
        </div>
        <div>
          <label class="field-label">Tipo de Contrato</label>
          <select id="tipoContrato" class="field-input">
            <option value="indefinido">Indefinido</option>
            <option value="temporal">Temporal</option>
            <option value="practicas">En prácticas</option>
            <option value="fijo_discontinuo">Fijo discontinuo</option>
            <option value="no_aplica">No aplica</option>
          </select>
        </div>
        <div>
          <label class="field-label">Antigüedad Laboral Actual</label>
          <input type="text" id="antiguedadLaboral" class="field-input" placeholder="Ej. 3 años y 2 meses" />
        </div>
        <div>
          <label class="field-label">Otros Ingresos Mensuales (€)</label>
          <input type="number" id="otrosIngresos" class="field-input" placeholder="0" />
        </div>
        <div>
          <label class="field-label">¿Dispone de Avalista?</label>
          <select id="avalista" class="field-input">
            <option value="no">No</option>
            <option value="si">Sí, dispone de avalista personal/familiar</option>
          </select>
        </div>
      </div>

      <div class="section-title">3. Documentación Disponible</div>
      <div class="checkbox-group">
        <label class="checkbox-label"><input type="checkbox" checked /> DNI / NIE en vigor</label>
        <label class="checkbox-label"><input type="checkbox" checked /> Últimas 3 Nóminas</label>
        <label class="checkbox-label"><input type="checkbox" checked /> Informe Vida Laboral</label>
        <label class="checkbox-label"><input type="checkbox" /> Declaración de Renta</label>
      </div>

      <div class="section-title">4. Observaciones y Notas Adicionales</div>
      <div>
        <textarea id="observaciones" class="field-input" rows="3" placeholder="Indique cualquier otra información relevante (disponibilidad de entrada, aclaraciones económicas, etc.)"></textarea>
      </div>
    </form>

    <div class="footer-note">
      Documento confidencial emitido para la evaluación de solvencia de alquiler. Los datos proporcionados serán tratados estrictamente con fines de verificación de arrendamiento.
    </div>
  </div>

  <script>
    function downloadJsonTemplate() {
      const data = {
        nombre: document.getElementById('nombre').value || "${nombreCandidato}",
        telefono: document.getElementById('telefono').value,
        email: document.getElementById('email').value,
        inmuebleNombre: document.getElementById('inmuebleNombre').value,
        numPersonas: parseInt(document.getElementById('numPersonas').value) || 1,
        ingresosNetos: parseFloat(document.getElementById('ingresosNetos').value) || 0,
        tipoEmpleo: document.getElementById('tipoEmpleo').value,
        tipoContrato: document.getElementById('tipoContrato').value,
        antiguedadLaboral: document.getElementById('antiguedadLaboral').value,
        otrosIngresos: parseFloat(document.getElementById('otrosIngresos').value) || 0,
        avalista: document.getElementById('avalista').value === 'si',
        observaciones: document.getElementById('observaciones').value,
      };

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'cuestionario_' + data.nombre.toLowerCase().replace(/\\s+/g, '_') + '.json';
      a.click();
      URL.revokeObjectURL(url);
    }
  </script>
</body>
</html>
  `;

  printWindow.document.write(htmlContent);
  printWindow.document.close();
}

/**
 * Parses an uploaded file (JSON or TXT / form response) to extract candidate data.
 */
export async function parseCompletedQuestionnaireFile(file: File): Promise<Partial<Candidato>> {
  const text = await file.text();
  try {
    const json = JSON.parse(text);
    return {
      nombre: json.nombre || json.fullName || '',
      telefono: json.telefono || json.phone || '',
      email: json.email || '',
      inmuebleNombre: json.inmuebleNombre || json.inmueble || '',
      numPersonas: typeof json.numPersonas === 'number' ? json.numPersonas : 1,
      ingresosNetos: typeof json.ingresosNetos === 'number' ? json.ingresosNetos : (parseFloat(json.ingresos) || 0),
      tipoEmpleo: (json.tipoEmpleo as EmploymentType) || 'cuenta_ajena',
      tipoContrato: (json.tipoContrato as ContractType) || 'indefinido',
      antiguedadLaboral: json.antiguedadLaboral || json.antiguedad || '1 año',
      otrosIngresos: typeof json.otrosIngresos === 'number' ? json.otrosIngresos : 0,
      avalista: Boolean(json.avalista),
      observaciones: json.observaciones || '',
    };
  } catch {
    // Fallback: parse plain text form response
    const lines = text.split('\n');
    const result: Partial<Candidato> = {};
    
    lines.forEach((line) => {
      const lower = line.toLowerCase();
      if (lower.includes('nombre:')) result.nombre = line.split(':')[1]?.trim();
      if (lower.includes('teléfono:') || lower.includes('telefono:')) result.telefono = line.split(':')[1]?.trim();
      if (lower.includes('email:') || lower.includes('correo:')) result.email = line.split(':')[1]?.trim();
      if (lower.includes('ingresos:')) result.ingresosNetos = parseFloat(line.split(':')[1]?.trim()) || 0;
      if (lower.includes('antigüedad:') || lower.includes('antiguedad:')) result.antiguedadLaboral = line.split(':')[1]?.trim();
      if (lower.includes('observaciones:')) result.observaciones = line.split(':')[1]?.trim();
    });

    return result;
  }
}
