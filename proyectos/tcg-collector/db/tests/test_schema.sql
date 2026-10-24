-- Pruebas de integración del esquema tcg con DATOS SINTÉTICOS (no son precios reales).
-- Uso: psql -d <base_vacía> -f db/schema.sql && psql -d <base> -f db/tests/test_schema.sql
-- Los bloques DO que esperan error imprimen 'OK bloqueado'; cualquier otro error detiene la ejecución.
\set ON_ERROR_STOP on
SET search_path = tcg, public;
-- DATOS SINTÉTICOS DE PRUEBA (no son precios reales)
INSERT INTO tcg_set (set_id, name, series, printed_total, total, release_date) VALUES ('tst1','Set de Prueba','Serie X',100,120,'2026-01-01');
INSERT INTO catalog_item (item_id, kind, set_id, name, collector_number, rarity) VALUES
 ('tst1-1','card','tst1','Carta A','1','Rare'),
 ('tst1-2','card','tst1','Carta B','2','Common'),
 ('tst1-3','card','tst1','Carta C','3','Common'),
 ('tst1-etb','sealed','tst1','Caja Elite de Prueba',NULL,NULL);
INSERT INTO catalog_item_name VALUES ('tst1-1','es','Carta A (es)'),('tst1-1','en','Card A');
INSERT INTO catalog_variant (item_id, finish) VALUES ('tst1-1','holofoil'),('tst1-2','normal'),('tst1-3','normal'),('tst1-etb','sealed');
INSERT INTO fx_rate VALUES (current_date - 3,'EUR','USD',1.10000000,'ECB');
INSERT INTO price_observation (variant_id, source_code, price_kind, observed_on, amount, currency) VALUES
 (1,'tcgplayer','market',current_date-1,12.00,'USD'),
 (1,'tcgplayer','low',   current_date-1, 9.00,'USD'),
 (1,'cardmarket','trend',current_date-1, 8.00,'EUR'),
 (1,'tcgplayer','market',current_date-60,30.00,'USD'),   -- fuera de ventana
 (2,'cardmarket','trend',current_date-1, 2.00,'EUR'),
 (4,'tcgplayer','market',current_date-1,60.00,'USD'),
 (1,'tcgplayer','market',current_date-3,11.00,'USD'),
 (2,'cardmarket','trend',current_date-3, 2.50,'EUR');
INSERT INTO price_observation (variant_id, source_code, price_kind, grade_key, observed_on, amount, currency) VALUES
 (1,'tcgplayer','market','PSA10',current_date-1,150.00,'USD');
UPDATE condition_factor SET factor = 0.800 WHERE condition = 'LP';

INSERT INTO app_user (email) VALUES ('demo@example.com');
INSERT INTO portfolio (user_id, name, is_default) SELECT user_id, 'Principal', true FROM app_user;

INSERT INTO lot (portfolio_id, variant_id, quantity, condition, language, acquired_on, acquisition_cost) VALUES
 (1,1,2,'NM','en',current_date-30,20.00),   -- lot 1
 (1,2,1,'LP','es',current_date-30, 5.00),   -- lot 2
 (1,3,1,'NM','en',current_date-30, 3.00),   -- lot 3 sin precio
 (1,1,1,'NM','es',current_date-30,10.00);   -- lot 4 carta A en español
INSERT INTO lot (portfolio_id, variant_id, quantity, grader, grade, acquired_on, acquisition_cost) VALUES
 (1,1,1,'PSA',10,current_date-20,100.00);   -- lot 5 graduada
INSERT INTO lot (portfolio_id, variant_id, quantity, acquired_on, acquisition_cost, manual_unit_value) VALUES
 (1,3,1,current_date-10,1.00,4.50);         -- lot 6 valor manual

\echo '--- T1 posición por lote'
SELECT lot_id, name, finish, condition, language, grade_key, qty_on_hand, cost_basis, unit_value_usd, market_value, unrealized_pnl, price_source, valuation_level FROM v_lot_position ORDER BY lot_id;

\echo '--- T2 venta parcial y resultado realizado'
INSERT INTO lot_disposal (lot_id, disposed_on, quantity, unit_proceeds, disposal_fees) VALUES (1, current_date, 1, 15.00, 1.00);
SELECT * FROM v_realized_pnl;

\echo '--- T3 sobre-disposición (debe fallar)'
DO $$ BEGIN
  INSERT INTO lot_disposal (lot_id, disposed_on, quantity) VALUES (1, current_date, 2);
  RAISE EXCEPTION 'NO FALLÓ';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM = 'NO FALLÓ' THEN RAISE; END IF;
  RAISE NOTICE 'OK bloqueado: %', SQLERRM;
END $$;

\echo '--- T4 abrir una carta (debe fallar)'
DO $$ BEGIN
  INSERT INTO lot_disposal (lot_id, disposed_on, quantity, channel) VALUES (3, current_date, 1, 'opened');
  RAISE EXCEPTION 'NO FALLÓ';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM = 'NO FALLÓ' THEN RAISE; END IF;
  RAISE NOTICE 'OK bloqueado: %', SQLERRM;
END $$;

\echo '--- T5 apertura de sellado y asignación de coste conjunto'
INSERT INTO lot (portfolio_id, variant_id, quantity, acquired_on, acquisition_cost) VALUES (1,4,1,current_date-5,50.00); -- lot 7
INSERT INTO lot_disposal (lot_id, disposed_on, quantity, channel) VALUES (7, current_date-2, 1, 'opened');
INSERT INTO lot (portfolio_id, variant_id, quantity, acquired_on, parent_lot_id) VALUES
 (1,1,1,current_date-2,7), (1,2,3,current_date-2,7), (1,3,1,current_date-2,7);  -- carta C sin precio -> debe fallar
DO $$ BEGIN
  PERFORM allocate_opened_cost(7);
  RAISE EXCEPTION 'NO FALLÓ';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM = 'NO FALLÓ' THEN RAISE; END IF;
  RAISE NOTICE 'OK bloqueado: %', SQLERRM;
END $$;
UPDATE lot SET manual_unit_value = 0.10 WHERE parent_lot_id = 7 AND variant_id = 3;
SELECT allocate_opened_cost(7) AS hijos_asignados;
\echo '--- T5b fecha de valoración alternativa'
SELECT allocate_opened_cost(7, current_date) AS hijos_reasignados;
SELECT lot_id, acquisition_cost FROM lot WHERE parent_lot_id = 7 ORDER BY lot_id;
SELECT allocate_opened_cost(7) AS hijos_asignados_fecha_apertura;
SELECT lot_id, variant_id, quantity, acquisition_cost, channel, acquired_on = current_date-2 AS fecha_ok FROM lot WHERE parent_lot_id = 7 ORDER BY lot_id;
SELECT SUM(acquisition_cost) AS suma_hijos FROM lot WHERE parent_lot_id = 7;

\echo '--- T6 resumen de portafolio'
SELECT * FROM v_portfolio_summary;

\echo '--- T7 alertas'
INSERT INTO watch_item (user_id, variant_id, direction, threshold_usd) SELECT user_id, 1, 'above', 11.00 FROM app_user;
INSERT INTO watch_item (user_id, variant_id, direction, threshold_usd) SELECT user_id, 2, 'below', 1.00 FROM app_user;
INSERT INTO watch_item (user_id, variant_id) SELECT user_id, 3 FROM app_user;
SELECT watch_id, name, direction, threshold_usd, unit_value_usd FROM v_alerts_due;

\echo '--- T8 instantánea'
SELECT take_portfolio_snapshots() AS filas;
SELECT take_portfolio_snapshots() AS filas_idempotente;
SELECT * FROM portfolio_snapshot;

\echo '--- T9 búsqueda difusa'
SELECT item_id, name, similarity(name, 'carta a') AS sim FROM catalog_item_name WHERE name % 'carta a' ORDER BY sim DESC;

\echo '--- T10 restricciones'
DO $$ BEGIN
  INSERT INTO lot (portfolio_id, variant_id, quantity, grader, grade, acquired_on) VALUES (1,1,2,'PSA',9.5,current_date);
  RAISE EXCEPTION 'NO FALLÓ';
EXCEPTION WHEN check_violation THEN RAISE NOTICE 'OK graduada con cantidad 2 bloqueada';
END $$;
DO $$ BEGIN
  INSERT INTO lot (portfolio_id, variant_id, quantity, grader, grade, acquired_on) VALUES (1,1,1,'PSA',9.3,current_date);
  RAISE EXCEPTION 'NO FALLÓ';
EXCEPTION WHEN check_violation THEN RAISE NOTICE 'OK nota 9.3 bloqueada';
END $$;
