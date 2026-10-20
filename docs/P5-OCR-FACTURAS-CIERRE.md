# P5 — OCR local de facturas y alta revisada

Fecha: 2026-10-20

SHA inicial verificado de `main` y rama de trabajo: `722865d1631c75eeed464dbc7483b63395cb09a3`

Rama: `arena/2b184147-gestor-de-inmuebles-vercel`

## Inspección de partida

P5 no estaba implementado en HEAD. Sí existían: `POST /api/analizar-documento` y sus componentes, pero están orientados a documentos de candidatos/solvencia y pueden usar Gemini/fallback; no eran un OCR patrimonial de factura con revisión antes de crear un gasto. También existían el modelo canónico `Gasto`, su flujo en `GastosSection`/`GastoModal`, el expediente por inmueble de P3 y la custodia SHA-256/Storage. Se reutilizan estos últimos; el nuevo flujo no llama al endpoint de IA ni cambia sus fallbacks preexistentes. La factura electrónica de salida tampoco se reutiliza como registro de factura recibida.

No se encontró Tesseract, PDF.js ni otro motor OCR local ya instalado. Para no incorporar proveedor de OCR, cuenta, clave ni coste por documento, se eligió Tesseract.js ejecutado en el navegador y PDF.js únicamente para rasterizar páginas PDF. Ambas cargas se importan bajo demanda. En la primera ejecución se descargan el motor/modelo español desde CDN pública; ni la imagen/PDF ni el texto OCR se envían a esa CDN ni al servidor de la aplicación.

## Implementación

- Acción **Escanear factura** en Gastos, con selección/captura móvil. Admite PDF/JPEG/PNG/WEBP, límite de 20 MB y 5 páginas por lectura, firma real del archivo, MIME/extensión, extracción mínima legible y errores visibles. No se convierte el archivo a Base64.
- OCR en navegador con estado de progreso; campo incompleto, ausente o globalmente poco fiable queda marcado para revisión. Se puede consultar el texto completo reconocido en el modal.
- Extracción conservadora de proveedor, NIF/CIF, número y fecha de factura, base imponible, tipo/importe IVA, retenciones u otros impuestos, total y concepto. No se calcula un campo a partir de otro.
- Formulario de revisión edita valores antes de persistir; inmueble, categoría y parte a cargo se eligen/validan manualmente. La deducibilidad queda `false` hasta decisión posterior y el gasto queda `PENDIENTE`, sin fecha ni movimiento de pago.
- La confirmación usa `Gasto` canónico y el expediente P3 `inmuebles/{id}/documentos_patrimoniales`, ligado por `gastoId`; el gasto conserva referencia al binario y hash. El objeto sigue sujeto a las reglas de Storage/Firestore de P3. La auditoría y los estados de Storage son los del gestor documental existente; la vista fiscal recupera el binario mediante P3 y verifica su integridad, en vez de exponer una URL pública. No hay fallback Base64.
- `facturaOcr` conserva versión, confianza, SHA-256, campos OCR reconocidos y campos aceptados por separado, más el enlace documental. El texto OCR completo solo vive en el modal, no se persiste.
- Dedupe por emisor + número de factura normalizados y, como respaldo, SHA-256 idéntico. El ID estable evita una segunda alta; un gasto incompleto por error de referencia permite reintentar el enlace. Fallo documental intenta revertir el gasto y nunca presenta éxito falso.
- Sin una entidad canónica de proveedor recibida utilizable en el flujo de gastos, se conserva el nombre fiscal como texto; no se inventa un `proveedorId`. El año se deriva del `fechaDevengo`/período que ya usa el motor patrimonial.

## Verificaciones ejecutadas

- `npx vitest run --exclude tests/guardia-a04-rama-sesion.test.ts --reporter=dot`: **257 archivos, 4.634 aprobadas, 0 fallidas, 2 omitidas y 7 todo**.
- Regresión focal P5 + P3 documental/patrimonial + guarda UX-7: **73/73** en siete archivos.
- `npm run lint` (TypeScript): correcto.
- `npm run build`: correcto. Se mantienen avisos existentes de imports mixtos/chunk grande; OCR/PDF aparecen en chunks separados de carga bajo demanda.
- `git diff --check`: correcto.
- `npm run test:patrimonial`: **85/88**; tres verificaciones de custodia no pueden resolver `f782e53ed3beefa4cdcae4e839457480f9cfd995`, ausente en el clon superficial. `npm run test:integracion` se detiene en su etapa de operaciones: **299/302**, con tres verificaciones equivalentes sin acceso al commit histórico `f782e53ed3beefa4cdcae4e839457480f9cfd995`. Es una limitación de referencias disponibles en el checkout, no una prueba de integración contra datos reales.
- `npm audit --omit=dev`: mantiene siete hallazgos en dependencias preexistentes (`@grpc/grpc-js` bajo Firebase, DOMPurify, Nodemailer y `source-map-js`); las versiones correspondientes son idénticas a las del lockfile inicial. El comando no mostró hallazgos para Tesseract.js/PDF.js. No se hizo `audit fix` transversal.
- No se ejecutaron OCR sobre facturas reales, Firebase/emuladores nuevos, servicios externos, producción ni despliegue.

## Límites pendientes

- La CDN pública del worker/modelo español debe estar accesible la primera vez; el OCR puede fallar con red bloqueada, documentos dañados o poco legibles. El límite actual es cinco páginas por documento.
- El reconocimiento por patrones y OCR no certifica una factura ni deducibilidad fiscal. Los datos se revisan manualmente. Un mismo proveedor puede repetir número solo si el documento original contiene esa referencia; sin identificadores confiables la deduplicación se limita a SHA-256.
- No se ejecutó validación operativa con facturas propias ni persistencia real con cuentas y carteras; corresponde a la etapa posterior acordada.

## Integración

PR y resultado de merge se añadirán a esta sección tras verificar CI y el merge real; no se declara integrado en `main` antes de esa comprobación.
