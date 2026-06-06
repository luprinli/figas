CREATE TABLE fare_matrix (
  origin_code      VARCHAR(4) NOT NULL,
  destination_code VARCHAR(4) NOT NULL,
  fare_amount_gbp  NUMERIC(8,2) NOT NULL,
  updated_at       TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (origin_code, destination_code)
);
