# Proyecto Flask - Plantilla Web

Este es un proyecto base en Flask con estructura organizada de carpetas, incluyendo CSS, JS y plantillas HTML.

## Persistencia de JSON (produccion/local)

La app ahora usa una carpeta de datos persistente fuera del repo para evitar perder informacion al actualizar codigo.

- Variable opcional: `APP_DATA_DIR`
- Si no se define, usa por defecto:
  - Windows: `%LOCALAPPDATA%\\runners_starlink_data`
  - Otros: `~/runners_starlink_data`

Al iniciar, si faltan archivos en la carpeta persistente, se copian automaticamente desde `./data` una sola vez.

Puedes tomar como base el archivo `.env.example`.
