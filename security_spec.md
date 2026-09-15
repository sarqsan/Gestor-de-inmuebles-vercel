# AUDITORÍA DE SEGURIDAD Y ESPECIFICACIÓN DE REGLAS (FASE 6)

## 1. Alcance de la Auditoría y Principio de Mínimo Privilegio

La plataforma gestiona el ciclo completo de alquiler residencial en España:
- Publicación de Inmuebles y Datos Fiscales (Referencia Catastral, IBAN, Cédula).
- Registro de Candidatos con Información Personal, Laboral y Financiera (DNI/NIE, Nóminas, IRPF, Vida Laboral).
- Cuestionarios Operativos de Incidencias.
- Gestión de Visitas con Slots y Reserva Atómica.
- Aportación y Análisis Documental con IA (Gemini 3.7 Flash y Gemini 2.5 Flash).
- Tramitación de Seguro de Impago y Dictámenes con Aseguradoras (SEAG, Caser, etc.).
- Formalización Contractual LAU y Entrega de Llaves.

## 2. Invariantes de Seguridad y Modelo de Acceso

1. **Inmuebles**:
   - Lectura: Permitida para consulta pública de fichas y para usuarios del sistema.
   - Creación/Modificación/Eliminación: Restringida a gestores y propietarios autorizados con validación estricta de estructura.
2. **Candidatos**:
   - Lectura de lista y expedientes completos: Restringida a la propiedad/gestión para proteger la PII (nombres, teléfonos, salarios, notas privadas).
   - Actualización por token público de cuestionario: Un candidato únicamente puede escribir sus respuestas al cuestionario operativo y actualizar la fecha de compleción sin alterar el resto de su expediente laboral o económico.
3. **Solicitudes Públicas de Alquiler**:
   - Creación: Abierta mediante formulario público validando campos obligatorios (`nombre`, `email`, `telefono`, `inmuebleId`).
   - Lectura/Gestión: Restringida a la administración o por token único.
4. **Invitaciones y Slots de Visita**:
   - Consulta de horarios disponibles: Permitida para visualización de agenda.
   - Reserva de slot: Validación atómica mediante transacción que bloquea reservas duplicadas y asocia la invitación y candidato.
5. **Solicitudes de Documentación Post-Visita**:
   - Consulta y aportación de archivos: Permitida mediante token seguro individual (`tokenDoc`).
   - Bloqueo de acceso entre candidatos: El candidato solo puede ver y aportar a su propio `tokenDoc`.
6. **Contratos de Formalización, Seguros y Notas Privadas**:
   - Prohibido el acceso público. Exclusivo para gestión y propietarios autorizados.
7. **Regla de Cierre Global**:
   - `match /{document=**} { allow read, write: if false; }` (Default-Deny).

## 3. Matriz de Endpoints y Secretos del Backend

- `GEMINI_API_KEY`: Alojada exclusivamente en variables de entorno del servidor (`process.env.GEMINI_API_KEY`). Nunca expuesta al navegador.
- `/api/upload-document`: Almacena temporalmente archivos con límites de tamaño (50MB) y validación de tipos MIME autorizados (PDF, JPEG, PNG, WEBP).
- `/api/documents/:fileId`: Servido de forma segura con headers `Content-Disposition: inline` y sanitización de nombres de archivo.
- `/api/analizar-documento` & `/api/analizar-cuestionario`: Proxies seguros que no persisten claves en cliente.
- `Gmail API Scopes`: Estrictamente delimitados a `https://www.googleapis.com/auth/gmail.send` y `https://www.googleapis.com/auth/gmail.readonly` para comunicación con aseguradoras.
