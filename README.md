# iaprohub vagas

Hub de vagas de tecnologia da comunidade iaprohub: https://iaprohub.vagas.aurora-saas.com.br

O agente de coleta manda as vagas prontas pela API de ingestão ([docs/API.md](docs/API.md)). O site mostra a lista em cards, apaga cada vaga 21 dias depois de ela entrar e gera em `/admin/resumo` o texto do resumo para colar nos grupos de WhatsApp. O plano completo está em [docs/plano.md](docs/plano.md).

## Estrutura

- `apps/api`: Fastify + Postgres. API de ingestão, API pública, páginas com meta tags e JSON-LD (Google for Jobs), link curto `/v/:code`, sitemap e a expiração (de hora em hora).
- `apps/web`: Vue 3 + Vite. Lista com busca e filtros, página da vaga e tela do resumo.
- `deploy/`: imagem única (a API serve o build do site), compose com Postgres e backup, e o script de deploy.

## Rodar local

```bash
pnpm install
pnpm db:up
cp apps/api/.env.example apps/api/.env
pnpm dev:api      # API em :4000
pnpm dev:web      # site em :5173 (repassa /api para a API)
pnpm --filter @iaprohub-vagas/api client:create meu-agente   # token de ingestão
```

Testes (precisam do Postgres local e do banco `vagas_test`, criado uma vez com `docker compose exec postgres psql -U vagas -c "CREATE DATABASE vagas_test"`). Para o teste das páginas, rode antes `pnpm --filter @iaprohub-vagas/web build`:

```bash
pnpm test
```

## Deploy

```bash
bash deploy/vps-deploy.sh
```

Builda a imagem localmente, envia para `saas-vps` por SSH e sobe a stack em `/home/deploy/iaprohub-vagas`. Na primeira vez, o script cria o `stack.env` com segredos novos (incluindo o `ADMIN_TOKEN`).
