-- Anúncios discretos: aparecem como um card "Patrocinado" a cada 12 vagas. Sem anúncio ativo, nada aparece.
CREATE TABLE ad (
  id serial PRIMARY KEY,
  title text NOT NULL,
  text text,
  cta text,
  url text NOT NULL,
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
