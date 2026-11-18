-- Resumo diário no grupo do WhatsApp (Evolution API). O grupo é escolhido no admin; cada dia sai no máximo uma vez.
CREATE TABLE app_setting (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE wa_digest (
  day date PRIMARY KEY,                       -- dia em Brasília
  group_jid text NOT NULL,
  job_count int NOT NULL,
  sent_at timestamptz,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
