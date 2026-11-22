-- O resumo passa a sair em vários horários por dia (DIGEST_TIMES). Cada horário sai no máximo uma vez e leva
-- as vagas que chegaram desde o envio anterior. A tabela antiga (um por dia) não tinha linhas em produção.
DROP TABLE wa_digest;

CREATE TABLE wa_digest (
  slot text PRIMARY KEY,                      -- dia e horário em Brasília, ex.: 2026-11-18 09:10
  group_jid text NOT NULL,
  job_count int NOT NULL,
  sent_at timestamptz,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
