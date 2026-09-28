# Principio resolutivo de Arena

Una dependencia ausente, una herramienta no instalada o un problema de entorno no constituye por sí mismo un motivo para detener una implementación.

La Arena debe intentar resolverlo, instalarlo, configurarlo o sustituir únicamente la infraestructura de validación necesaria por un mecanismo equivalente y verificable.

La secuencia obligatoria es **DETECTAR → RESOLVER → VERIFICAR → CONTINUAR**.

Solo podrá declararse un bloqueo definitivo cuando exista una imposibilidad técnica real, después de haber agotado las vías razonables de resolución disponibles en el entorno. El objetivo de una Arena no es informar de bloqueos: es resolverlos y completar el trabajo.

## Aplicación

- Inspeccionar primero herramientas, configuración, scripts y estado Git real.
- Separar herramientas de validación de dependencias de producción.
- Intentar instalación y fuentes oficiales alternativas; registrar versiones y errores concretos.
- No sustituir pruebas de Firebase Emulator por mocks ni declarar PASS sin ejecución.
- No desactivar TLS ni obtener ejecutables de fuentes no verificables para sortear fallos de red.
- Preservar trabajo existente; no mezclar correcciones ajenas ni integrar a main sin autorización.
- Si persiste una limitación externa, registrar intentos reproducibles, qué permite desbloquearla y pruebas que siguen pendientes.
