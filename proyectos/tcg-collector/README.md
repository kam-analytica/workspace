# TCG Collector — aplicación propia de registro de cartas Pokémon TCG

Proyecto derivado de la ingeniería inversa **funcional** (clean-room) de Collectr. No contiene código, endpoints, claves ni datos de Collectr.

| Archivo | Contenido |
|---|---|
| `RIF_Collectr_2026_V_1_0.docx` | Informe: inventario funcional con evidencia, fuentes de datos lícitas, modelo de datos, metodología de valoración, arquitectura, hoja de ruta y marco legal |
| `db/schema.sql` | Modelo de datos PostgreSQL ≥ 14 / Supabase (esquema `tcg`) |
| `db/tests/test_schema.sql` | Pruebas de integración con datos sintéticos (T1–T10) |
| `_fuentes_informe/` | Generadores del informe y sus figuras (docx-js + matplotlib) |

## Probar el esquema

```bash
createdb tcgtest
psql -d tcgtest -v ON_ERROR_STOP=1 -f db/schema.sql
psql -d tcgtest -f db/tests/test_schema.sql
```

## Estado

Versión 1.0, borrador para validación. Las decisiones pendientes están en la sección 13 del informe; el siguiente entregable es la Fase 0–1 (Supabase + ingesta diaria + cliente PWA, historias HU-01 a HU-07).
