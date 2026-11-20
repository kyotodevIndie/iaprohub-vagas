# IAPro Vagas

Hub de vagas de tecnologia da comunidade iaprohub: https://iaprohub.vagas.noxlabs.com.br

O agente de coleta manda as vagas prontas pela API de ingestão ([docs/API.md](docs/API.md)). O site mostra a lista em cards, apaga cada vaga 21 dias depois de ela entrar e gera em `/admin/resumo` o texto do resumo para colar nos grupos de WhatsApp. O plano completo está em [docs/plano.md](docs/plano.md).

## Estrutura

- `apps/api`: Fastify + Postgres. API de ingestão, API pública, páginas com meta tags e JSON-LD (Google for Jobs), link curto `/v/:code`, sitemap e a expiração (de hora em hora).
- `apps/web`: Vue 3 + Vite + Tailwind 4 + shadcn-vue (componentes em `src/components/ui`, tema em `src/styles/theme.css`, padrões em `~/dev/nox-design/padroes.md`). Lista com busca, filtros e card de anúncio, página da vaga e tela do resumo.
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

## Google AdSense

Com `ADSENSE_CLIENT` (ex.: `ca-pub-1234567890123456`) no `stack.env`, o site passa a ter a meta tag de verificação, o script do AdSense em todas as páginas públicas e o `/ads.txt`. Com `ADSENSE_SLOT` (id de um bloco "In-feed" criado no painel do AdSense), a lista mostra esse bloco a cada 12 vagas quando não houver anúncio direto ativo. Depois de editar o `stack.env`, rode o deploy de novo. A política de privacidade exigida pelo AdSense fica em `/privacidade`.

## Talentos Pro (R$ 5/mês)

Conta com login por código no e-mail, perfil e CV, envio automático do CV para as vagas com `applyEmail`, alerta diário às 9h, site sem anúncio para o Pro e banco de talentos para recrutadores aprovados em `/admin/recrutadores`. Regras em [docs/talentos.md](docs/talentos.md).

Precisa no `stack.env`: `RESEND_API_KEY` e `EMAIL_FROM` (login e envios) e `NOX_URL`, `NOX_CLIENT_ID`, `NOX_SECRET` (assinatura; produto `iaprohub-vagas`, plano `pro`). Sem o Resend, o código de login só aparece no log, o que serve para rodar local.

## Resumo automático no WhatsApp

Com `EVOLUTION_URL` e `EVOLUTION_API_KEY` no `stack.env` (Evolution em `~/dev/evolution`, instância `iapro`), o resumo sai nos horários de `DIGEST_TIMES` (padrão 9h10, 12h10 e 17h10 de Brasília, 10 min depois de cada rodada do agente) no grupo escolhido em `/admin/resumo`, com as vagas que chegaram desde o envio anterior. Sem grupo escolhido, nada é enviado. A mesma tela tem o botão "Enviar agora".
