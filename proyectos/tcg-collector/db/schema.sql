-- =====================================================================
-- TCG Collector — Modelo de datos v1.0 (PostgreSQL >= 14 / Supabase)
-- kam. Analytica · octubre de 2026
--
-- Derivado de la ingeniería inversa FUNCIONAL (clean-room) de Collectr
-- documentada en RIF_Collectr_2026_V_1_0.docx. No contiene código,
-- endpoints, claves ni datos de Collectr.
--
-- Convenciones:
--   * Moneda funcional: USD. Toda valoración se expresa en USD; los
--     precios en otra moneda se convierten con fx_rate a la fecha de
--     observación.
--   * Coste: identificación específica por lote (analogía NIC 2 párr. 23).
--     Sellado abierto: asignación de coste conjunto por valor de mercado
--     relativo (analogía NIC 2 párr. 14) -> allocate_opened_cost().
--   * Nivel de valoración 1/2/3: analogía con la jerarquía de valor
--     razonable de NIIF 13 (párr. 76, 81 y 86). Criterio de diseño, no
--     obligación normativa para un coleccionista persona natural.
-- =====================================================================

BEGIN;

CREATE SCHEMA IF NOT EXISTS tcg;
SET search_path = tcg, public;

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ---------------------------------------------------------------------
-- 1. Dominios
-- ---------------------------------------------------------------------
CREATE TYPE item_kind AS ENUM ('card', 'sealed');

-- Acabados con precio propio (granularidad a la que cotiza el mercado)
CREATE TYPE finish AS ENUM (
  'normal', 'holofoil', 'reverse_holofoil',
  'first_edition_normal', 'first_edition_holofoil', 'unlimited_holofoil',
  'sealed'
);

CREATE TYPE card_condition AS ENUM ('NM', 'LP', 'MP', 'HP', 'DMG');

CREATE TYPE acquisition_channel AS ENUM ('purchase', 'pack_pull', 'trade', 'gift', 'other');

-- 'opened' = sellado abierto; su coste se traslada a los lotes hijos
CREATE TYPE disposal_channel AS ENUM ('sale', 'trade', 'gift', 'loss', 'opened', 'other');

CREATE TYPE price_kind AS ENUM (
  'market', 'sold_median', 'trend', 'avg7', 'avg30', 'avg1', 'mid', 'low', 'high'
);

CREATE TYPE alert_direction AS ENUM ('above', 'below');

-- ---------------------------------------------------------------------
-- 2. Usuarios
--    En Supabase: sustituir por auth.users y user_id = auth.uid() (ver §8)
-- ---------------------------------------------------------------------
CREATE TABLE app_user (
  user_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL UNIQUE,
  display_name  text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- 3. Catálogo (datos de referencia del proveedor de catálogo)
-- ---------------------------------------------------------------------
CREATE TABLE tcg_set (
  set_id         text PRIMARY KEY,            -- id del proveedor, p. ej. 'sv1'
  name           text NOT NULL,
  series         text,
  printed_total  int CHECK (printed_total >= 0),
  total          int CHECK (total >= 0),
  release_date   date,
  ptcgo_code     text,
  symbol_url     text,
  logo_url       text,
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- Una fila por impresión (set + número), independiente del idioma.
-- El idioma es atributo de la copia física (lot.language).
CREATE TABLE catalog_item (
  item_id           text PRIMARY KEY,         -- p. ej. 'sv1-1' o 'sv1-etb'
  kind              item_kind NOT NULL,
  set_id            text REFERENCES tcg_set (set_id),
  name              text NOT NULL,            -- nombre canónico (inglés)
  collector_number  text,                     -- tal como se imprime: '199', 'TG05'
  rarity            text,
  supertype         text,                     -- Pokémon / Trainer / Energy
  subtypes          text[],
  hp                int CHECK (hp > 0),
  artist            text,
  image_small_url   text,
  image_large_url   text,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT card_requires_number CHECK (kind <> 'card' OR collector_number IS NOT NULL)
);
CREATE INDEX catalog_item_set_number_idx ON catalog_item (set_id, collector_number);

-- Nombres localizados (es, pt, ja...) para búsqueda en el idioma del usuario
CREATE TABLE catalog_item_name (
  item_id   text NOT NULL REFERENCES catalog_item ON DELETE CASCADE,
  language  char(2) NOT NULL,
  name      text NOT NULL,
  PRIMARY KEY (item_id, language)
);
CREATE INDEX catalog_item_name_trgm_idx ON catalog_item_name USING gin (name gin_trgm_ops);

CREATE TABLE catalog_variant (
  variant_id  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  item_id     text NOT NULL REFERENCES catalog_item ON DELETE CASCADE,
  finish      finish NOT NULL,
  UNIQUE (item_id, finish)
);

-- ---------------------------------------------------------------------
-- 4. Precios
-- ---------------------------------------------------------------------
CREATE TABLE price_source (
  source_code      text PRIMARY KEY,          -- 'tcgplayer', 'cardmarket', ...
  name             text NOT NULL,
  provider         text,                      -- vía de obtención (API intermedia)
  currency         char(3) NOT NULL,
  market_language  char(2),                   -- NULL = mercado multi-idioma
  priority         smallint NOT NULL,         -- menor = preferente en la cascada
  valuation_level  smallint NOT NULL CHECK (valuation_level BETWEEN 1 AND 3)
);

-- Correspondencia variante <-> identificador en cada fuente
CREATE TABLE external_ref (
  variant_id   bigint NOT NULL REFERENCES catalog_variant ON DELETE CASCADE,
  source_code  text NOT NULL REFERENCES price_source,
  external_id  text NOT NULL,
  PRIMARY KEY (variant_id, source_code)
);

-- Serie temporal append-only. condition_key = 'ANY' si la fuente no
-- desagrega por estado; grade_key = 'RAW' para carta sin graduar.
CREATE TABLE price_observation (
  variant_id     bigint NOT NULL REFERENCES catalog_variant ON DELETE CASCADE,
  source_code    text NOT NULL REFERENCES price_source,
  price_kind     price_kind NOT NULL,
  condition_key  text NOT NULL DEFAULT 'ANY'
                 CHECK (condition_key IN ('ANY', 'NM', 'LP', 'MP', 'HP', 'DMG')),
  grade_key      text NOT NULL DEFAULT 'RAW'
                 CHECK (grade_key ~ '^(RAW|(PSA|BGS|CGC|SGC|OTHER)([1-9]|10)(\.5)?)$'),
  observed_on    date NOT NULL,
  amount         numeric(12,2) NOT NULL CHECK (amount >= 0),
  currency       char(3) NOT NULL,
  fetched_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (variant_id, source_code, price_kind, condition_key, grade_key, observed_on)
);
CREATE INDEX price_observation_recent_idx ON price_observation (variant_id, observed_on DESC);

-- Convención: 1 unidad de base = rate unidades de quote (p. ej. EUR->USD)
CREATE TABLE fx_rate (
  rate_date  date NOT NULL,
  base       char(3) NOT NULL,
  quote      char(3) NOT NULL,
  rate       numeric(18,8) NOT NULL CHECK (rate > 0),
  source     text NOT NULL DEFAULT 'ECB',
  PRIMARY KEY (rate_date, base, quote)
);

-- Ajuste por estado cuando la fuente solo publica precio agregado.
-- Valores por defecto neutros (1.000): calibrar con datos por estado.
CREATE TABLE condition_factor (
  condition  card_condition PRIMARY KEY,
  factor     numeric(5,3) NOT NULL CHECK (factor > 0 AND factor <= 1)
);

-- Trazabilidad de cada corrida de ingesta (linaje de datos)
CREATE TABLE ingest_run (
  run_id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_code    text NOT NULL REFERENCES price_source,
  started_at     timestamptz NOT NULL DEFAULT now(),
  finished_at    timestamptz,
  rows_upserted  int,
  status         text NOT NULL DEFAULT 'running'
                 CHECK (status IN ('running', 'ok', 'partial', 'failed')),
  error          text
);

-- ---------------------------------------------------------------------
-- 5. Colección
-- ---------------------------------------------------------------------
CREATE TABLE portfolio (
  portfolio_id  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id       uuid NOT NULL REFERENCES app_user ON DELETE CASCADE,
  name          text NOT NULL,
  is_default    boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);
CREATE UNIQUE INDEX portfolio_one_default_idx ON portfolio (user_id) WHERE is_default;

-- Lote = una o varias copias idénticas adquiridas en un mismo acto.
CREATE TABLE lot (
  lot_id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  portfolio_id       bigint NOT NULL REFERENCES portfolio ON DELETE CASCADE,
  variant_id         bigint NOT NULL REFERENCES catalog_variant,
  quantity           int NOT NULL CHECK (quantity > 0),
  condition          card_condition NOT NULL DEFAULT 'NM',
  language           char(2) NOT NULL DEFAULT 'en',
  grader             text CHECK (grader IN ('PSA', 'BGS', 'CGC', 'SGC', 'OTHER')),
  grade              numeric(3,1) CHECK (grade BETWEEN 1 AND 10 AND grade * 2 = trunc(grade * 2)),
  cert_number        text,
  acquired_on        date NOT NULL,
  channel            acquisition_channel NOT NULL DEFAULT 'purchase',
  -- Coste total del lote en USD: precio + envío + comisiones + aranceles
  acquisition_cost   numeric(14,2) NOT NULL DEFAULT 0 CHECK (acquisition_cost >= 0),
  parent_lot_id      bigint REFERENCES lot (lot_id),   -- sellado del que proviene
  manual_unit_value  numeric(12,2) CHECK (manual_unit_value >= 0),  -- nivel 3; prevalece
  notes              text,
  photo_url          text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT graded_needs_grade CHECK ((grader IS NULL) = (grade IS NULL)),
  CONSTRAINT graded_is_single   CHECK (grader IS NULL OR quantity = 1),
  CONSTRAINT not_own_parent     CHECK (parent_lot_id IS DISTINCT FROM lot_id)
);
CREATE INDEX lot_portfolio_idx ON lot (portfolio_id);
CREATE INDEX lot_parent_idx ON lot (parent_lot_id) WHERE parent_lot_id IS NOT NULL;

CREATE TABLE lot_disposal (
  disposal_id    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  lot_id         bigint NOT NULL REFERENCES lot ON DELETE CASCADE,
  disposed_on    date NOT NULL,
  quantity       int NOT NULL CHECK (quantity > 0),
  channel        disposal_channel NOT NULL DEFAULT 'sale',
  unit_proceeds  numeric(12,2) NOT NULL DEFAULT 0 CHECK (unit_proceeds >= 0),
  disposal_fees  numeric(12,2) NOT NULL DEFAULT 0 CHECK (disposal_fees >= 0),
  notes          text
);
-- Una única apertura por lote sellado
CREATE UNIQUE INDEX lot_disposal_one_opening_idx ON lot_disposal (lot_id) WHERE channel = 'opened';

-- Lista de deseos y alertas de precio (direction NULL = solo deseo)
CREATE TABLE watch_item (
  watch_id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id            uuid NOT NULL REFERENCES app_user ON DELETE CASCADE,
  variant_id         bigint NOT NULL REFERENCES catalog_variant,
  condition          card_condition NOT NULL DEFAULT 'NM',
  language           char(2) NOT NULL DEFAULT 'en',
  direction          alert_direction,
  threshold_usd      numeric(12,2) CHECK (threshold_usd > 0),
  is_active          boolean NOT NULL DEFAULT true,
  last_triggered_at  timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT alert_complete CHECK ((direction IS NULL) = (threshold_usd IS NULL))
);

CREATE TABLE portfolio_snapshot (
  portfolio_id     bigint NOT NULL REFERENCES portfolio ON DELETE CASCADE,
  snapshot_on      date NOT NULL,
  items_on_hand    int NOT NULL,
  market_value     numeric(14,2) NOT NULL,
  cost_basis       numeric(14,2) NOT NULL,
  unrealized_pnl   numeric(14,2) NOT NULL,
  realized_pnl     numeric(14,2) NOT NULL,
  PRIMARY KEY (portfolio_id, snapshot_on)
);

-- ---------------------------------------------------------------------
-- 6. Reglas de integridad
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION check_disposal() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_qty       int;
  v_acquired  date;
  v_kind      item_kind;
  v_disposed  int;
BEGIN
  SELECT l.quantity, l.acquired_on, ci.kind
    INTO v_qty, v_acquired, v_kind
    FROM lot l
    JOIN catalog_variant v USING (variant_id)
    JOIN catalog_item ci USING (item_id)
   WHERE l.lot_id = NEW.lot_id
     FOR UPDATE OF l;

  IF NEW.disposed_on < v_acquired THEN
    RAISE EXCEPTION 'Lote %: la fecha de disposición (%) es anterior a la adquisición (%)',
      NEW.lot_id, NEW.disposed_on, v_acquired;
  END IF;

  IF NEW.channel = 'opened' AND v_kind <> 'sealed' THEN
    RAISE EXCEPTION 'Lote %: solo un producto sellado puede registrarse como abierto', NEW.lot_id;
  END IF;

  SELECT COALESCE(SUM(quantity), 0) INTO v_disposed
    FROM lot_disposal
   WHERE lot_id = NEW.lot_id
     AND disposal_id <> NEW.disposal_id;

  IF v_disposed + NEW.quantity > v_qty THEN
    RAISE EXCEPTION 'Lote %: disponible %, solicitado %', NEW.lot_id, v_qty - v_disposed, NEW.quantity;
  END IF;

  RETURN NEW;
END $$;

CREATE TRIGGER lot_disposal_check
  BEFORE INSERT OR UPDATE ON lot_disposal
  FOR EACH ROW EXECUTE FUNCTION check_disposal();

-- ---------------------------------------------------------------------
-- 7. Valoración
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fx_to_usd(p_amount numeric, p_currency char(3), p_on date)
RETURNS numeric
LANGUAGE sql STABLE AS $$
  SELECT CASE
           WHEN p_currency = 'USD' THEN p_amount
           ELSE p_amount * (SELECT r.rate
                              FROM fx_rate r
                             WHERE r.base = p_currency AND r.quote = 'USD'
                               AND r.rate_date <= p_on
                             ORDER BY r.rate_date DESC
                             LIMIT 1)
         END
$$;

-- Cascada de precios: estado exacto antes que agregado -> prioridad de
-- fuente -> tipo de precio -> observación más reciente dentro de la
-- ventana de vigencia. Sin tipo de cambio disponible no hay precio
-- (falla de forma visible, nunca en silencio).
CREATE OR REPLACE FUNCTION unit_price_usd(
  p_variant_id    bigint,
  p_condition     card_condition,
  p_language      char(2),
  p_grade_key     text,
  p_asof          date DEFAULT current_date,
  p_max_age_days  int  DEFAULT 30
)
RETURNS TABLE (
  unit_value_usd   numeric(12,2),
  source_code      text,
  price_kind       price_kind,
  observed_on      date,
  valuation_level  smallint
)
LANGUAGE sql STABLE AS $$
  SELECT round(fx_to_usd(o.amount, o.currency, o.observed_on)
               * CASE WHEN o.condition_key = 'ANY' THEN COALESCE(cf.factor, 1) ELSE 1 END, 2),
         o.source_code,
         o.price_kind,
         o.observed_on,
         GREATEST(
           s.valuation_level,
           CASE WHEN o.condition_key = 'ANY' AND p_condition <> 'NM' THEN 2 ELSE 1 END,
           CASE WHEN s.market_language IS NOT NULL AND s.market_language <> p_language THEN 2 ELSE 1 END
         )::smallint
    FROM price_observation o
    JOIN price_source s ON s.source_code = o.source_code
    LEFT JOIN condition_factor cf ON cf.condition = p_condition
   WHERE o.variant_id = p_variant_id
     AND o.grade_key = p_grade_key
     AND o.condition_key IN (p_condition::text, 'ANY')
     AND o.observed_on BETWEEN p_asof - p_max_age_days AND p_asof
     AND fx_to_usd(o.amount, o.currency, o.observed_on) IS NOT NULL
   ORDER BY (o.condition_key = 'ANY'),
            s.priority,
            array_position(
              ARRAY['market', 'sold_median', 'trend', 'avg7', 'avg30', 'avg1', 'mid', 'low', 'high']::price_kind[],
              o.price_kind),
            o.observed_on DESC
   LIMIT 1
$$;

-- Posición vigente por lote
CREATE OR REPLACE VIEW v_lot_position AS
WITH disposed AS (
  SELECT lot_id, SUM(quantity) AS qty
    FROM lot_disposal
   GROUP BY lot_id
), base AS (
  SELECT l.*,
         COALESCE(l.grader || rtrim(rtrim(l.grade::text, '0'), '.'), 'RAW') AS grade_key,
         l.quantity - COALESCE(d.qty, 0) AS qty_on_hand
    FROM lot l
    LEFT JOIN disposed d USING (lot_id)
)
SELECT b.lot_id,
       b.portfolio_id,
       b.variant_id,
       ci.item_id,
       ci.name,
       v.finish,
       b.condition,
       b.language,
       b.grade_key,
       b.qty_on_hand,
       round(b.acquisition_cost * b.qty_on_hand / b.quantity, 2)                        AS cost_basis,
       COALESCE(b.manual_unit_value, p.unit_value_usd)                                  AS unit_value_usd,
       round(COALESCE(b.manual_unit_value, p.unit_value_usd) * b.qty_on_hand, 2)        AS market_value,
       round(COALESCE(b.manual_unit_value, p.unit_value_usd) * b.qty_on_hand
             - b.acquisition_cost * b.qty_on_hand / b.quantity, 2)                      AS unrealized_pnl,
       CASE WHEN b.manual_unit_value IS NOT NULL THEN 'manual' ELSE p.source_code END    AS price_source,
       CASE WHEN b.manual_unit_value IS NOT NULL THEN NULL ELSE p.observed_on END        AS price_date,
       CASE WHEN b.manual_unit_value IS NOT NULL THEN 3::smallint
            ELSE p.valuation_level END                                                  AS valuation_level
  FROM base b
  JOIN catalog_variant v ON v.variant_id = b.variant_id
  JOIN catalog_item ci ON ci.item_id = v.item_id
  LEFT JOIN LATERAL unit_price_usd(
         b.variant_id,
         CASE WHEN b.grader IS NULL THEN b.condition ELSE 'NM'::card_condition END,
         b.language,
         b.grade_key) p ON true
 WHERE b.qty_on_hand > 0;

-- Resultado realizado por disposición (identificación específica).
-- Las aperturas no realizan resultado: su coste pasa a los lotes hijos.
CREATE OR REPLACE VIEW v_realized_pnl AS
SELECT d.disposal_id,
       l.portfolio_id,
       d.lot_id,
       d.disposed_on,
       d.channel,
       d.quantity,
       round(d.unit_proceeds * d.quantity - d.disposal_fees, 2)                   AS net_proceeds,
       round(l.acquisition_cost * d.quantity / l.quantity, 2)                     AS cost_released,
       round(d.unit_proceeds * d.quantity - d.disposal_fees
             - l.acquisition_cost * d.quantity / l.quantity, 2)                   AS realized_pnl
  FROM lot_disposal d
  JOIN lot l USING (lot_id)
 WHERE d.channel <> 'opened';

-- Resumen por portafolio. market_value y unrealized_pnl cubren solo los
-- lotes con precio; cost_basis_unpriced expone el coste sin valorar.
CREATE OR REPLACE VIEW v_portfolio_summary AS
WITH realized AS (
  SELECT portfolio_id, SUM(realized_pnl) AS realized_pnl
    FROM v_realized_pnl
   GROUP BY portfolio_id
)
SELECT p.portfolio_id,
       p.user_id,
       p.name,
       COALESCE(SUM(lp.qty_on_hand), 0)::int                                          AS items_on_hand,
       COALESCE(SUM(lp.market_value), 0)                                             AS market_value,
       COALESCE(SUM(lp.cost_basis), 0)                                               AS cost_basis,
       COALESCE(SUM(lp.cost_basis) FILTER (WHERE lp.unit_value_usd IS NULL), 0)      AS cost_basis_unpriced,
       COALESCE(SUM(lp.unrealized_pnl), 0)                                           AS unrealized_pnl,
       COALESCE(r.realized_pnl, 0)                                                   AS realized_pnl,
       COUNT(lp.lot_id) FILTER (WHERE lp.unit_value_usd IS NULL)                     AS lots_without_price,
       round(SUM(lp.market_value) FILTER (WHERE lp.valuation_level = 1)
             / NULLIF(SUM(lp.market_value), 0), 4)                                   AS share_level_1,
       round(SUM(lp.market_value) FILTER (WHERE lp.valuation_level = 2)
             / NULLIF(SUM(lp.market_value), 0), 4)                                   AS share_level_2,
       round(SUM(lp.market_value) FILTER (WHERE lp.valuation_level = 3)
             / NULLIF(SUM(lp.market_value), 0), 4)                                   AS share_level_3
  FROM portfolio p
  LEFT JOIN v_lot_position lp ON lp.portfolio_id = p.portfolio_id
  LEFT JOIN realized r ON r.portfolio_id = p.portfolio_id
 GROUP BY p.portfolio_id, p.user_id, p.name, r.realized_pnl;

CREATE OR REPLACE VIEW v_alerts_due AS
SELECT w.watch_id,
       w.user_id,
       w.variant_id,
       ci.name,
       v.finish,
       w.direction,
       w.threshold_usd,
       p.unit_value_usd,
       p.observed_on
  FROM watch_item w
  JOIN catalog_variant v ON v.variant_id = w.variant_id
  JOIN catalog_item ci ON ci.item_id = v.item_id
 CROSS JOIN LATERAL unit_price_usd(w.variant_id, w.condition, w.language, 'RAW') p
 WHERE w.is_active
   AND w.direction IS NOT NULL
   AND (   (w.direction = 'above' AND p.unit_value_usd >= w.threshold_usd)
        OR (w.direction = 'below' AND p.unit_value_usd <= w.threshold_usd))
   AND (w.last_triggered_at IS NULL OR w.last_triggered_at::date < p.observed_on);

-- Asigna el coste de un sellado abierto a sus lotes hijos en proporción
-- a su valor de mercado a la fecha de apertura (sin look-ahead). Para
-- aperturas antiguas sin historial de precios, p_valuation_date permite
-- usar los valores relativos de otra fecha como aproximación declarada.
-- El residuo de redondeo se imputa al lote de mayor valor para que la
-- suma cuadre al centavo.
CREATE OR REPLACE FUNCTION allocate_opened_cost(
  p_parent_lot_id    bigint,
  p_valuation_date   date DEFAULT NULL
)
RETURNS int
LANGUAGE plpgsql AS $$
DECLARE
  v_pool       numeric(14,2);
  v_opened_on  date;
  v_value_on   date;
  v_children   int;
  v_priced     int;
  v_total      numeric;
BEGIN
  SELECT round(l.acquisition_cost * d.quantity / l.quantity, 2), d.disposed_on
    INTO v_pool, v_opened_on
    FROM lot l
    JOIN lot_disposal d ON d.lot_id = l.lot_id AND d.channel = 'opened'
   WHERE l.lot_id = p_parent_lot_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lote %: no registra apertura (lot_disposal.channel = opened)', p_parent_lot_id;
  END IF;

  v_value_on := COALESCE(p_valuation_date, v_opened_on);

  CREATE TEMP TABLE IF NOT EXISTS _alloc (lot_id bigint, value numeric) ON COMMIT DROP;
  TRUNCATE _alloc;

  INSERT INTO _alloc
  SELECT c.lot_id,
         c.quantity * COALESCE(c.manual_unit_value, p.unit_value_usd)
    FROM lot c
    LEFT JOIN LATERAL unit_price_usd(c.variant_id, c.condition, c.language, 'RAW', v_value_on) p ON true
   WHERE c.parent_lot_id = p_parent_lot_id;

  SELECT count(*), count(value), SUM(value) INTO v_children, v_priced, v_total FROM _alloc;

  IF v_children = 0 THEN
    RAISE EXCEPTION 'Lote %: no tiene lotes hijos registrados', p_parent_lot_id;
  ELSIF v_priced < v_children THEN
    RAISE EXCEPTION 'Lote %: % de % lotes hijos sin precio al %; informe manual_unit_value',
      p_parent_lot_id, v_children - v_priced, v_children, v_value_on;
  ELSIF v_total = 0 THEN
    RAISE EXCEPTION 'Lote %: valor de mercado total de los hijos igual a cero', p_parent_lot_id;
  END IF;

  WITH shares AS (
    SELECT lot_id,
           round(v_pool * value / v_total, 2) AS alloc,
           row_number() OVER (ORDER BY value DESC, lot_id) AS rn
      FROM _alloc
  ), final AS (
    SELECT lot_id,
           alloc + CASE WHEN rn = 1 THEN v_pool - SUM(alloc) OVER () ELSE 0 END AS alloc
      FROM shares
  )
  UPDATE lot l
     SET acquisition_cost = f.alloc,
         acquired_on      = v_opened_on,
         channel          = 'pack_pull'
    FROM final f
   WHERE l.lot_id = f.lot_id;

  RETURN v_children;
END $$;

-- Instantánea diaria (programar con pg_cron en Supabase)
CREATE OR REPLACE FUNCTION take_portfolio_snapshots()
RETURNS int
LANGUAGE sql AS $$
  WITH ins AS (
    INSERT INTO portfolio_snapshot AS s
           (portfolio_id, snapshot_on, items_on_hand, market_value, cost_basis, unrealized_pnl, realized_pnl)
    SELECT portfolio_id, current_date, items_on_hand, market_value, cost_basis, unrealized_pnl, realized_pnl
      FROM v_portfolio_summary
    ON CONFLICT (portfolio_id, snapshot_on) DO UPDATE
       SET items_on_hand  = EXCLUDED.items_on_hand,
           market_value   = EXCLUDED.market_value,
           cost_basis     = EXCLUDED.cost_basis,
           unrealized_pnl = EXCLUDED.unrealized_pnl,
           realized_pnl   = EXCLUDED.realized_pnl
    RETURNING 1
  )
  SELECT count(*)::int FROM ins
$$;

-- ---------------------------------------------------------------------
-- 8. Datos de configuración
--    Las fuentes son parámetros de diseño; verificar términos de uso de
--    cada proveedor antes de activarlas.
-- ---------------------------------------------------------------------
INSERT INTO price_source (source_code, name, provider, currency, market_language, priority, valuation_level) VALUES
  ('tcgplayer',  'TCGplayer Market Price',            'pokemontcg.io v2 / Scrydex', 'USD', 'en', 1, 1),
  ('cardmarket', 'Cardmarket (precio de tendencia)',  'pokemontcg.io v2 / Scrydex', 'EUR', NULL, 2, 2);

INSERT INTO condition_factor (condition, factor) VALUES
  ('NM', 1.000), ('LP', 1.000), ('MP', 1.000), ('HP', 1.000), ('DMG', 1.000);

-- Supabase (no ejecutar en PostgreSQL local): seguridad a nivel de fila
-- ALTER TABLE tcg.portfolio  ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY own_portfolios ON tcg.portfolio
--   USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
-- ALTER TABLE tcg.lot ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY own_lots ON tcg.lot
--   USING (portfolio_id IN (SELECT portfolio_id FROM tcg.portfolio WHERE user_id = auth.uid()));
-- (replicar para lot_disposal, watch_item y portfolio_snapshot)
-- SELECT cron.schedule('snapshot-diario', '15 6 * * *', $$SELECT tcg.take_portfolio_snapshots()$$);

COMMIT;
