-- Quem envia vagas pela API (o agente de coleta). O token só fica como hash.
CREATE TABLE ingest_client (
  id serial PRIMARY KEY,
  name text NOT NULL UNIQUE,
  token_hash text NOT NULL UNIQUE,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);

-- Vaga como o agente mandou. O hub não filtra nem normaliza: só guarda, mostra e apaga em 21 dias.
CREATE TABLE job (
  id bigserial PRIMARY KEY,
  code text NOT NULL UNIQUE,              -- link curto /v/:code
  slug text NOT NULL,
  client_id int REFERENCES ingest_client(id) ON DELETE SET NULL,
  source_kind text NOT NULL,              -- greenhouse, gupy, linkedin...
  source_key text,
  external_id text NOT NULL,
  source_url text,
  title text NOT NULL,
  company_name text,
  company_website text,
  description text,
  seniority text[] NOT NULL DEFAULT '{}',
  workplace text[] NOT NULL DEFAULT '{}',
  regime text[] NOT NULL DEFAULT '{}',
  stack text[] NOT NULL DEFAULT '{}',
  location text,
  salary_min numeric,
  salary_max numeric,
  salary_currency text,
  salary_period text,
  salary_text text,
  apply_url text NOT NULL,
  search_text text NOT NULL,              -- título, empresa, stack e local em minúsculas e sem acento
  published_at timestamptz,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_kind, external_id)
);
CREATE INDEX job_first_seen_idx ON job (first_seen_at DESC);
CREATE INDEX job_stack_idx ON job USING gin (stack);

CREATE TABLE ingest_run (
  id bigserial PRIMARY KEY,
  client_id int REFERENCES ingest_client(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  received int NOT NULL,
  created int NOT NULL,
  updated int NOT NULL,
  rejected int NOT NULL,
  errors jsonb NOT NULL DEFAULT '[]'
);
CREATE INDEX ingest_run_client_idx ON ingest_run (client_id, created_at DESC);
