-- Talentos Pro (docs/talentos.md): contas por código no e-mail, perfil e CV, assinatura R$ 5 pelo Nox,
-- envio automático do CV, alerta diário e recrutadores verificados.

-- E-mail de candidatura que o agente manda (opcional). Só ele é usado no envio automático.
ALTER TABLE job ADD COLUMN apply_email text;
-- Quando o casamento com os perfis Pro já rodou para esta vaga.
ALTER TABLE job ADD COLUMN matched_at timestamptz;
CREATE INDEX job_unmatched_idx ON job (first_seen_at) WHERE matched_at IS NULL;

CREATE TABLE app_user (
  id bigserial PRIMARY KEY,
  email text NOT NULL UNIQUE,                 -- sempre em minúsculas
  created_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz,
  -- recrutador: pede pelo site, o admin aprova
  recruiter_company text,
  recruiter_status text CHECK (recruiter_status IN ('pendente', 'aprovado', 'recusado')),
  -- assinatura (cópia local do Nox; o acesso vale por billing_access)
  billing_status text,
  billing_version int NOT NULL DEFAULT 0,
  billing_access boolean NOT NULL DEFAULT false,
  paid_until timestamptz,
  last_alert_at timestamptz
);

CREATE TABLE login_code (
  id bigserial PRIMARY KEY,
  email text NOT NULL,
  code_hash text NOT NULL,
  attempts int NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX login_code_email_idx ON login_code (email, created_at DESC);

CREATE TABLE user_session (
  token_hash text PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE TABLE talent_profile (
  user_id bigint PRIMARY KEY REFERENCES app_user(id) ON DELETE CASCADE,
  public_id text NOT NULL UNIQUE,             -- id que o recrutador vê (não dá para enumerar)
  name text,
  phone text,
  linkedin text,
  headline text,
  current_company text,
  summary text,
  region text,                                -- estado/país, nunca endereço
  seniority text[] NOT NULL DEFAULT '{}',
  workplace text[] NOT NULL DEFAULT '{}',
  stack text[] NOT NULL DEFAULT '{}',
  salary_min numeric,                         -- pretensão mínima mensal em BRL (opcional)
  visibility text NOT NULL DEFAULT 'oculto' CHECK (visibility IN ('oculto', 'anonimo', 'aberto')),
  -- consentimentos vigentes (o histórico fica em consent_log)
  consent_talent_bank boolean NOT NULL DEFAULT false,
  consent_auto_apply boolean NOT NULL DEFAULT false,
  consent_alerts boolean NOT NULL DEFAULT false,
  cv_pdf bytea,
  cv_filename text,
  cv_updated_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE consent_log (
  id bigserial PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  purpose text NOT NULL,                      -- termos | banco_talentos | envio_automatico | alertas
  granted boolean NOT NULL,
  policy_version text NOT NULL,
  ip_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Cada envio automático (canal email) e cada vaga que entrou no alerta diário (canal alerta).
CREATE TABLE application (
  id bigserial PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  job_id bigint REFERENCES job(id) ON DELETE SET NULL,
  job_code text NOT NULL,
  job_title text NOT NULL,
  company_name text,
  apply_url text NOT NULL,
  channel text NOT NULL CHECK (channel IN ('email', 'alerta')),
  to_email text,
  status text NOT NULL CHECK (status IN ('pendente', 'enviado', 'falhou')),
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  UNIQUE (user_id, job_code)
);
CREATE INDEX application_pending_idx ON application (status, channel) WHERE status = 'pendente';

CREATE TABLE contact_request (
  id bigserial PRIMARY KEY,
  token text NOT NULL UNIQUE,                 -- vai no link do e-mail da pessoa
  recruiter_id bigint NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  talent_id bigint NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'aceito', 'recusado')),
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  UNIQUE (recruiter_id, talent_id)
);

CREATE TABLE nox_event (id text PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now());
