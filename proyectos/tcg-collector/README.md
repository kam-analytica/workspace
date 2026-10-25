# TCG Collector — aplicación propia de registro de cartas Pokémon TCG

Proyecto derivado de la ingeniería inversa **funcional** (clean-room) de Collectr. No contiene código, endpoints, claves ni datos de Collectr.

| Archivo | Contenido |
|---|---|
| `app/` | **Carpeta TCG**, la aplicación funcional (PWA local-first). Ver `app/README.md` |
| `RIF_Collectr_2026_V_1_0.docx` | Informe: inventario funcional con evidencia, fuentes de datos lícitas, modelo de datos, metodología de valoración, arquitectura, hoja de ruta y marco legal |
| `db/schema.sql` | Modelo de datos PostgreSQL ≥ 14 / Supabase (esquema `tcg`), referencia del motor de la app y base de una futura sincronización en la nube |
| `db/tests/test_schema.sql` | Pruebas de integración con datos sintéticos (T1–T10) |
| `_fuentes_informe/` | Generadores del informe y sus figuras (docx-js + matplotlib) |

## Estado

- **Fase 1 (MVP) construida** como aplicación local-first: historias HU-01 a HU-07 del informe, más lista de deseos con alertas (HU-09) e historial de valor (HU-08).
- Cambios respecto al informe v1.0:
  - La app guarda los datos en el dispositivo (IndexedDB) en lugar de Supabase, por decisión del usuario. `db/schema.sql` queda listo para una fase de sincronización en la nube.
  - Los precios se toman del campo `pricing` de TCGdex, que incluye TCGplayer y Cardmarket. Ya no hace falta pokemontcg.io.
- Pendiente para fases siguientes: escáner por cámara (HU-10), importación desde Collectr (HU-11), precios de graduadas con fuente de pago (HU-12) y sincronización entre dispositivos.

## Probar el esquema SQL

```bash
createdb tcgtest
psql -d tcgtest -v ON_ERROR_STOP=1 -f db/schema.sql
psql -d tcgtest -f db/tests/test_schema.sql
```
