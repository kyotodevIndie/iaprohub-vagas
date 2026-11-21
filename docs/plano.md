# Hub de vagas da comunidade: plano de desenvolvimento

Versão 1, 18/11/2026. Nome provisório: **hub-vagas**. Ainda não há código nem repositório.

## 0. Em uma frase

Um site de vagas para uma comunidade. Robôs coletam vagas de fontes públicas várias vezes por dia, e as vagas somem sozinhas depois de 3 semanas. Recrutadores também podem publicar. Depois vem um banco de talentos com consentimento. O site se paga com anúncios discretos, e todo dia sai um resumo pronto para os grupos de WhatsApp.

Não é SaaS: não tem plano, assinatura nem multi-tenant. O Nox só entra se um dia houver cobrança (vaga em destaque ou patrocínio).

## 1. Princípios que tornam o MVP rápido

1. **O hub só recebe e mostra (decisões de 18/11/2026).** Quem busca, filtra e preenche as vagas é o agente da pessoa (GPT ou outro), rodando onde ela quiser. Ele já manda só vagas do nicho, com **no máximo 3 dias de publicação** e com todos os campos preenchidos. O hub oferece uma **API de ingestão** autenticada (seção 4), guarda, exibe, expira em 21 dias e monta o resumo do WhatsApp. Não há filtro, normalização nem deduplicação entre fontes no servidor. As seções sobre fontes e IA ficam só como referência para o agente.
2. **Sem IA dentro do hub.** A IA só aparece na Fase 2, e é opcional: serve para dar uma nota de risco às vagas que recrutadores publicarem direto no site.
3. **O modelo de dados já existe.** `@ecosystem/job-schema` do JobLens (`Job`, `JobSource`, `Compensation`, `WorkplaceType`, `Seniority`) é a forma normalizada da vaga. Este é o 2º uso, então **copiamos** o pacote em vez de extrair um compartilhado. A extração só acontece no 3º uso.
4. **Usar o que a casa já tem:** Fastify + Postgres + Vue em monorepo pnpm, deploy na VPS compartilhada (`iapro.vagas.noxlabs.com.br` até haver domínio próprio), Caddy e o padrão de `deploy/` do Agendia. A interface `WhatsAppTransport` de `~/dev/agendia/packages/whatsapp` serve de referência: basta criar um `EvolutionTransport` com a mesma forma (só leitura do Agendia).
5. **Sem Redis.** A fila e os jobs agendados usam `pg-boss`, que roda sobre o próprio Postgres.

## 2. Arquitetura

```
hub-vagas/  (monorepo pnpm)
├─ apps/
│  ├─ web/      Site público e áreas logadas (Vue). Páginas de vaga renderizadas no servidor para SEO.
│  ├─ api/      Fastify: API pública, área do recrutador, área do candidato, admin
│  └─ worker/   pg-boss: expiração, resumo diário, envio no WhatsApp
├─ packages/
│  ├─ db/           schema e migrations (Postgres)
│  ├─ job-schema/   cópia do JobLens (tipos e validação da vaga normalizada)
│  └─ whatsapp/     formatação do resumo + EvolutionTransport (desligado por padrão)

agente de coleta (fora do repositório; da pessoa, ex.: GPT agendado X vezes por dia)
   └─ POST /api/v1/ingest/jobs  ──►  apps/api
└─ deploy/          docker-compose, Caddy, Dockerfiles (molde do Agendia)
```

**SEO é o canal grátis mais forte.** As páginas de vaga (`/vagas/:slug`) precisam sair renderizadas em HTML, com o JSON-LD `JobPosting` do schema.org para aparecerem no Google for Jobs. As políticas do Google exigem tirar do ar as vagas expiradas, o que casa com a regra de 3 semanas: vaga apagada responde `410 Gone` e sai do sitemap. Opções: renderizar no servidor com Vue + Vite, ou Nuxt só no `web`. A recomendação é decidir no 1º dia, conforme o que a equipe conhece melhor.

### Fluxo da ingestão (o agente chama quando quiser, ex.: 4×/dia)

```
agente → POST /api/v1/ingest/jobs (lote de até 200 vagas, Bearer token)
  → checa o formato de cada item (só para não quebrar a página; erro por item, sem derrubar o lote)
  → upsert por (source, external_id)    # reenvio da mesma vaga atualiza em vez de duplicar
  → status 'ativa' → aparece no site e entra no próximo resumo
ingest_run grava: recebidas, novas, atualizadas, rejeitadas (com o motivo)
```

### Interface (modelo enviado pela pessoa)

Grade de cards em tema escuro, como na referência:

- Topo: título "Vagas abertas", busca de texto e um seletor (local). No nosso caso, acrescentar filtros rápidos em chips: **Remoto / Híbrido / Presencial**, **senioridade**, **stack** e **com salário**.
- Card: título em negrito; linha com ícone de local (ex.: `Brasil · Remoto`); 2 linhas do resumo; **"Ver vaga →"** na cor de destaque (laranja, como na referência). Acréscimos discretos: empresa, selos (`Sênior`, `PJ`, `R$ 12–15k`), "há 2 dias" e a fonte.
- Grade de 3 colunas no desktop, 1 no celular. Vaga em destaque (futuro) usa o mesmo card com borda de destaque e o selo "Destaque". Nada de banner piscando.
- Anúncio entra como **um card nativo a cada 12 vagas** e em um bloco lateral na página da vaga (seção 7).
- Página da vaga: descrição limpa, botão grande "Candidatar-se no site da empresa" (link original com `?utm_source=<nome>`), "Reportar vaga" e vagas parecidas.

## 3. Modelo de dados (Postgres)

```sql
-- Quem envia vagas pela API e de onde elas vieram
ingest_client(id, name, token_hash, enabled, rate_limit_per_hour, last_used_at)
source(id, kind,               -- greenhouse | lever | ashby | gupy | inhire | github | linkedin | outro (texto livre do agente)
       key,                    -- board token, slug da empresa, owner/repo, domínio
       label)                  -- criada sozinha na 1ª vaga que chega com aquele (kind, key)

ingest_run(id, client_id, received_at, received, created, updated,
           rejected, errors jsonb)

-- Vagas
job(id, slug,
    origin,                    -- coletada | recrutador
    source_id NULL, external_id NULL, recruiter_id NULL, company_id NULL,
    title, title_norm, company_name,
    seniority text[],          -- estagio | junior | pleno | senior | especialista | lideranca
    workplace text[],          -- remoto | hibrido | presencial
    location jsonb,            -- offices[], remoteEligibility[] (formato do job-schema)
    regime text[],             -- clt | pj | cooperado | estagio | contrato_exterior
    stack text[],              -- vocabulário fechado (react, node, python, aws...)
    salary_min, salary_max, salary_currency, salary_period,  -- só se a vaga informar
    description_md, apply_url, canonical_url,
    published_at,              -- data informada pela fonte, se houver
    first_seen_at,             -- quando entrou na plataforma (base da expiração)
    last_seen_at,              -- última coleta em que ainda estava na fonte
    expires_at,                -- first_seen_at + 21 dias
    status,                    -- pendente | ativa | rejeitada | encerrada
    featured_until NULL,       -- destaque pago (futuro)
    risk_score, risk_reasons,  -- moderação (vagas de recrutador)
    ingest_client_id NULL,     -- qual agente enviou
    raw jsonb)
  UNIQUE(source_id, external_id); GIN(stack)

job_report(id, job_id, reporter_user_id NULL, reporter_ip_hash, reason, created_at)
job_click(job_id, day, clicks)                          -- agregado, sem dado pessoal

-- Pessoas
app_user(id, email, name, role,  -- candidato | recrutador | admin
         email_verified_at, created_at, deleted_at)
company(id, name, domain, domain_verified_at, cnpj NULL, trust_level)
recruiter(user_id, company_id, status,  -- novo | confiavel | bloqueado
          approved_posts, rejected_posts)

-- Banco de talentos
talent_profile(user_id, visibility,       -- oculto (padrão) | anonimo | aberto_a_recrutadores
               headline, seniority, stack text[], workplace_pref text[],
               region,                    -- estado/país; nunca endereço
               salary_expectation_band NULL,
               summary, cv_file_key NULL, cv_text NULL,
               open_to_work, updated_at)
consent_log(id, user_id, purpose,         -- termos | banco_talentos | alertas_email | analise_cv_ia
            policy_version, granted_at, revoked_at, ip_hash, user_agent)
contact_request(id, recruiter_id, talent_user_id, job_id NULL, message,
                status,                   -- pendente | aceito | recusado | expirado
                created_at, responded_at, expires_at)
data_request(id, user_id, kind,           -- exportar | apagar
             status, created_at, done_at)

-- Divulgação e monetização
wa_group(id, jid, name, enabled, filter jsonb, send_time, daily_limit)
digest(id, date, channel,                 -- manual | whatsapp_auto
       group_id NULL, text, job_ids int[], sent_at NULL, wa_message_id NULL, error NULL)
sponsor(id, name, url, logo_key, placement, starts_at, ends_at, active)
setting(key, value jsonb)                 -- feature flags: wa_auto_enabled, niche, risk_llm_enabled...
```

### O que o servidor faz com a vaga

Nada além de guardar. Os campos chegam prontos do agente e são exibidos como vieram. Só duas coisas automáticas: o `slug` da URL (título + empresa + id curto) e o nosso `utm_source` no link de candidatura, para medir os cliques.

## 4. API de ingestão e fontes

### Contrato da API (o que o agente da pessoa chama)

- **Autenticação:** `Authorization: Bearer <token>`. Cada agente é um `ingest_client`, criado no admin. O token aparece uma vez e fica guardado só como hash; pode ser revogado.
- **Limite:** 60 requisições/hora por cliente, até 200 vagas por requisição.

`POST /api/v1/ingest/jobs`

```json
{
  "jobs": [
    {
      "source": { "kind": "greenhouse", "key": "acme", "externalId": "4012345", "url": "https://boards.greenhouse.io/acme/jobs/4012345" },
      "title": "Senior Back-End Developer (Python/AWS)",
      "company": { "name": "Acme", "website": "https://acme.com" },
      "description": "Markdown ou texto puro",
      "seniority": ["senior"],
      "workplace": ["remoto"],
      "location": { "remoteEligibility": [{ "name": "Brazil" }], "offices": [] },
      "regime": ["pj"],
      "stack": ["python", "aws", "postgresql"],
      "salary": { "min": 15000, "max": 20000, "currency": "BRL", "period": "month" },
      "applyUrl": "https://boards.greenhouse.io/acme/jobs/4012345#app",
      "publishedAt": "2026-11-17T12:00:00Z"
    }
  ]
}
```

Obrigatórios: `source.kind`, `source.externalId` (ou `source.url`, que vira o id), `title`, `company.name`, `applyUrl`. O resto é opcional: campo ausente quer dizer "não informado", como no job-schema do JobLens.

Resposta `200`, um resultado por item, na mesma ordem:

```json
{ "results": [
  { "index": 0, "status": "created", "id": "j_8f2a", "url": "https://<dominio>/vagas/senior-back-end-developer-acme-8f2a" },
  { "index": 1, "status": "updated", "id": "j_11c0" },
  { "index": 2, "status": "rejected", "errors": ["applyUrl: obrigatório"] }
] }
```

`status` pode ser `created`, `updated` (mesmo `source` + `externalId` já enviado) ou `rejected` (falta campo obrigatório ou formato inválido).

Outras rotas:
- `POST /api/v1/ingest/jobs/close`: `{ "source": {...}, "externalIds": [...] }` encerra vagas que saíram da fonte antes dos 21 dias.
- `GET /api/v1/ingest/vocab`: devolve os valores usados nos filtros do site (senioridade, regime, modelo de trabalho), para o agente mandar com a mesma grafia e os chips de filtro funcionarem.
- `GET /api/v1/ingest/runs?limit=20`: histórico das últimas chamadas, para o agente (ou a pessoa) ver o que foi rejeitado e por quê.

O mesmo contrato vale para "enviar vaga por link" no admin: a tela só monta o JSON e chama a API.

### Fontes (referência para o agente de coleta, não é trabalho do hub)

| Fonte | Tipo | Como coletar | Termos e risco | Prioridade |
|---|---|---|---|---|
| **Greenhouse** | API oficial pública (Job Board API) | `GET boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true` por empresa | Feita para quem quer exibir as vagas da empresa; sem autenticação para leitura. Risco baixo. | MVP |
| **Lever** | API oficial pública (Postings API) | `GET api.lever.co/v0/postings/{empresa}?mode=json` | Pública e documentada. Risco baixo. | MVP |
| **Ashby** | API oficial pública (Job Posting API) | `GET api.ashbyhq.com/posting-api/job-board/{nome}?includeCompensation=true` | Pública e documentada; traz salário e modelo de trabalho. Risco baixo. | MVP |
| **Gupy** | Endpoint público **não documentado** do portal | `portal.api.gupy.io/api/v1/jobs?jobName=...` (busca por termo, paginada) ou a página `{empresa}.gupy.io` | Não existe API pública oficial para terceiros (a API oficial é só para clientes). Usar com moderação (poucas buscas por termo, 1 requisição/s), identificar o robô e sempre mandar para o link original. Risco médio: pode mudar ou bloquear sem aviso. Não traz senioridade nem salário estruturados. | MVP |
| **InHire** | Página de carreira com JSON interno (não documentado) | `{empresa}.inhire.app/vagas` | Mesmo caso da Gupy. **Spike de 2h na semana 1** para confirmar o endpoint (a skill `apli` já navega por lá). Risco médio. | Fase 2 |
| **GitHub issues** (`frontendbr/vagas`, `backend-br/vagas`, `react-brasil/vagas` e outros) | API oficial do GitHub | `GET /repos/{o}/{r}/issues?state=open&since=...` com token (5.000 req/h) | Conteúdo publicado pela comunidade em repositório público. Ótimo para tech BR. Dar crédito ao repositório na página da vaga. | MVP |
| **Remotive / Himalayas / RemoteOK** | APIs públicas | JSON aberto | Exigem atribuição e link de volta; a Remotive pede poucas chamadas por dia. Vagas remotas internacionais: atraem dev BR que quer ganhar em dólar. Ler os termos de cada uma antes de ligar. | Fase 2 |
| **We Work Remotely** | RSS | feed por categoria | Feed público; dar crédito e link. | Fase 2 |
| **Adzuna / Jooble / Careerjet** | API de parceiro (chave grátis) | busca por termo + país BR | Exigem cadastro e mostrar os links deles (eles ganham no clique). Pode até virar receita: a Careerjet tem programa de parceiro. Avaliar depois do MVP. | Depois |
| **LinkedIn** | — | **Não coletar.** | O Contrato do Usuário proíbe scraping e robôs, inclusive pelo endpoint de convidado; o risco é bloqueio e problema jurídico. Alternativa: **"enviar vaga por link"** no admin e para membros. A pessoa cola o texto ou o link, a IA preenche os campos e um moderador aprova. | Fase 2 (manual) |
| Indeed, Catho, InfoJobs, Vagas.com | Só scraping | **Não coletar.** | Os termos proíbem; a API de publisher do Indeed foi descontinuada. | — |

**De onde vem a lista de empresas** (os ATS consultam por empresa, não por busca): começar com uma planilha de 150 a 300 empresas que contratam tech no Brasil e na LatAm. Fontes: a lista da `apli`, a comunidade e as empresas que já apareceram no GitHub issues. A Gupy é a exceção: lá dá para buscar por termo (`desenvolvedor`, `dados`, `QA`, `produto`...).

**Boa vizinhança em toda coleta:** User-Agent próprio com URL de contato, cache com `ETag`/`If-Modified-Since` quando houver, 1 requisição/s por host, backoff em 429 e 5xx, fonte desligada sozinha depois de 5 falhas seguidas (com aviso no admin), e sempre mandar a candidatura para o site original, nunca copiar o formulário.

### Custo de IA do lado do agente (referência)

A IA roda no agente da pessoa, não no hub. Para dar uma ideia do custo de preencher os campos a partir do texto da vaga (~1.500 tokens de entrada e ~250 de saída por vaga nova):

| Modelo | Preço por 1M tokens (entrada / saída) | 15 mil vagas/mês | 60 mil vagas/mês |
|---|---|---|---|
| GPT-5 nano | US$ 0,05 / 0,40 | ~US$ 2,60 | ~US$ 10,50 |
| Claude Haiku 5.5 | US$ 0,10 / 0,50 | ~US$ 4,10 | ~US$ 16,50 |
| GPT-5.4 nano | US$ 0,20 / 1,25 | ~US$ 9,20 | ~US$ 37 |

Com Batch API, os dois fornecedores cobram metade. Fontes consultadas em 18/11/2026: [preços da OpenAI](https://developers.openai.com/api/docs/pricing) e [preços da Anthropic](https://www.anthropic.com/pricing). Um blog ([nops.io](https://www.nops.io/blog/openai-api-pricing/)) diz que o GPT-5 nano sai do ar em 11/12/2026; a página oficial não confirma.

Para o agente gastar menos: (1) pegar o JSON do ATS e só chamar o modelo para o que não vier estruturado; (2) usar `GET /api/v1/ingest/vocab` como enum no JSON Schema da saída; (3) não reenviar vaga que já voltou como `created`, a não ser que ela tenha mudado.

## 5. Expiração (3 semanas)

- Job `expire-jobs` todo dia às 03h:
  - `DELETE` das vagas com `first_seen_at < now() - interval '21 days'` (vaga em destaque também conta a partir da entrada, mas o destaque pago pode acrescentar dias se a pessoa decidir assim).
  - Como o agente só manda vagas com até 3 dias, uma vaga apagada não volta sozinha; não é preciso guardar registro do que expirou.
  - Vaga encerrada antes dos 21 dias: o agente chama `POST /api/v1/ingest/jobs/close` e ela sai do ar na hora.
- A URL de vaga apagada responde `410 Gone` e sai do `sitemap.xml`, como o Google for Jobs pede.
- Vaga de recrutador: o painel avisa no dia 18 ("expira em 3 dias") e permite **republicar uma vez** (nova moderação).

## 6. Recrutadores

**Cadastro:** login por link mágico no e-mail, sem senha. O e-mail tem de ser corporativo: domínios gratuitos (gmail, hotmail, outlook…) vão para aprovação manual. Ao criar a empresa, o domínio do e-mail vira `company.domain`. O CNPJ é opcional no início.

**Moderação contra spam e vaga falsa:**
1. Os primeiros 3 anúncios de um recrutador novo vão para a **fila de moderação**. Depois de 3 aprovações, ele vira `confiavel` e publica direto, com checagem automática.
2. **Nota de risco** automática (regras + IA), com o motivo exibido para o moderador:
   - pede pagamento, PIX, "taxa de cadastro", compra de curso ou kit;
   - o único contato é WhatsApp ou Telegram pessoal; link encurtado; domínio do link de candidatura diferente do domínio da empresa;
   - salário fora da realidade ("R$ 8 mil em casa sem experiência"), texto genérico de "renda extra" ou marketing multinível;
   - empresa sem site, domínio registrado há menos de 30 dias, texto repetido em várias contas.
   - Nota alta → bloqueia e manda para revisão. Nota média → fila. Nota baixa (recrutador confiável) → publica.
3. Botão **"Reportar vaga"** em toda vaga. 3 reportes distintos escondem a vaga até alguém revisar.
4. Limites: no máximo 5 vagas ativas por recrutador novo e 20 por confiável; limite por IP no cadastro; Turnstile da Cloudflare (grátis) no formulário.
5. Recrutador bloqueado: as vagas dele saem do ar na hora.

**Destaque pago (futuro, Fase 4):** vaga fixa no topo e com selo por 7 dias, além de entrar primeiro no resumo do WhatsApp. Cobrança pelo Nox (checkout PIX/cartão, webhook `v1=hmac`), como no ArteGo. Preço a testar: R$ 49 a R$ 149 por vaga. É hipótese, ainda sem validação.

## 7. Banco de talentos (LGPD)

**Base legal:** consentimento (LGPD art. 7º, I, e art. 8º), separado por finalidade. Nada vem marcado de fábrica:
- [ ] Li e aceito os Termos e a Política de Privacidade (obrigatório para ter conta)
- [ ] Quero aparecer no banco de talentos para recrutadores verificados
- [ ] Quero receber alertas de vagas por e-mail
- [ ] Autorizo a análise do meu currículo por IA para preencher o perfil. Essa caixa precisa dizer que o texto é enviado a um fornecedor nos EUA, o que é transferência internacional (art. 33). Sem ela, o perfil é preenchido à mão.

Cada aceite e cada revogação vão para o `consent_log` com a versão da política.

**Visibilidade controlada pela pessoa:**

| Nível | O que o recrutador verificado vê |
|---|---|
| `oculto` (padrão) | Nada. O perfil não aparece em busca. |
| `anonimo` | Título ("Dev Back-end Pleno"), senioridade, stack, região (estado/país), modelo de trabalho desejado, faixa de pretensão se a pessoa quiser, resumo sem nomes de empresa. |
| `aberto_a_recrutadores` | Igual ao anônimo, mais o nome da empresa atual e o LinkedIn. |

**Fica escondido até o aceite:** nome completo, e-mail, telefone, LinkedIn (no modo anônimo), arquivo do CV, empresa atual (no modo anônimo) e cidade exata.

**Conexão:** o recrutador clica em "Quero conversar", escolhe uma vaga dele (opcional) e escreve uma mensagem. A pessoa recebe por e-mail e no painel e escolhe Aceitar ou Recusar. Só ao aceitar o recrutador vê o contato e o CV. O pedido expira em 14 dias. Limite de 20 pedidos por dia por recrutador. Não há exportação em massa, e toda visualização de perfil fica registrada.

**Direitos do titular (art. 18), em autosserviço no painel:**
- **Exportar meus dados** (JSON + CV).
- **Apagar minha conta:** apaga na hora o perfil, o CV no storage, o texto do CV e os alertas; anonimiza os pedidos de contato e mantém só o `consent_log` com o id pseudonimizado, como prova do consentimento. Os backups expiram em 30 dias, e a política deixa isso claro.
- Perfil sem atualização há 12 meses volta para `oculto` e recebe um e-mail pedindo para reconfirmar.

**Encarregado (DPO):** como agente de pequeno porte, há dispensa de nomear encarregado (Resolução CD/ANPD nº 2/2022), mas é preciso manter um canal de contato (`privacidade@...`). Revisar a política com alguém de jurídico antes de abrir o banco de talentos.

## 8. Monetização discreta

| Opção | Requisito | Receita esperada | Comentário |
|---|---|---|---|
| **Google AdSense** | aprovação do site (conteúdo próprio, política de privacidade, tráfego real) | RPM tech no Brasil: R$ 8 a R$ 22 por mil páginas ([bigdatauniversity, 2026](https://bigdatauniversity.com.br/quanto-se-ganha-com-adsense-no-brasil-2026/)); fontes internacionais estimam US$ 2 a 6 para a América do Sul ([ranktracker](https://www.ranktracker.com/pt-br/blog/adsense-payment-trends-by-country/)). **Para este plano: R$ 5 a R$ 15**, porque site de vaga tem muito clique de saída. | Pedir aprovação na semana 2 (leva dias ou semanas). O mais fácil para começar. |
| **EthicalAds** | ≥ 50 mil páginas/mês, site para devs, só por convite | ~US$ 2,50 por mil páginas com público EUA/Europa ([FAQ](https://www.ethicalads.io/publishers/faq/), [guia](https://www.ethicalads.io/publisher-guide/)); com público BR deve render bem menos | Sem rastreamento e combina com dev. Pedir quando passar de 50 mil. |
| **Carbon Ads** | curadoria por convite, sem mínimo publicado ([política](https://carbonads.net/placement-policy)) | não publicado | 1 anúncio por página, muito discreto. Tentar quando o site tiver tráfego. |
| **Patrocínio direto** | relação com a comunidade | **R$ 300 a R$ 1.500/mês por patrocinador** (hipótese, a validar) | "Resumo de hoje oferecido por X" no WhatsApp + logo no rodapé. Costuma render mais que o AdSense em comunidade de nicho. |
| **Vaga em destaque** | recrutadores ativos + Nox | R$ 49 a R$ 149 por vaga (hipótese) | Fase 4. |

**Onde pôr sem poluir:**
- Lista: **1 card nativo a cada 12 vagas**, com o mesmo visual do card de vaga e o rótulo "Patrocinado".
- Página da vaga: 1 bloco na lateral (desktop) ou depois da descrição (celular). **Nunca** entre o título e o botão de candidatura.
- Resumo do WhatsApp: no máximo 1 linha de patrocinador no fim.
- Proibido: pop-up, intersticial, anúncio de vídeo com som, anúncio na área logada do banco de talentos.
- Banner de cookies com recusa fácil. Sem consentimento, só anúncio não personalizado.

**Receita por faixa de tráfego** (páginas vistas por mês):

| Cenário | Páginas/mês | AdSense (R$ 5–15) | EthicalAds | Patrocínio | Total provável |
|---|---|---|---|---|---|
| A. Lançamento (comunidade de 2–5 mil pessoas) | 10 mil | R$ 50–150 | não elegível | R$ 0–500 | **R$ 50–650** |
| B. Pegou | 100 mil | R$ 500–1.500 | elegível; substitui o AdSense se render mais | R$ 500–1.500 | **R$ 1.000–3.000** |
| C. Referência no nicho | 500 mil | R$ 2.500–7.500 | idem | R$ 1.500–4.500 | **R$ 4.000–12.000** |

## 9. Divulgação nos grupos de WhatsApp

### Caminho manual (MVP)

- Job `build-digest` todo dia às 08h. Ele monta o texto das vagas novas das últimas 24h, agrupadas por área e com no máximo 15 vagas (as demais ficam no link "ver todas").
- No admin, a tela **"Resumo de hoje"** mostra o texto pronto, o botão **Copiar** e as variações por grupo (ex.: grupo de front recebe só front), já que `wa_group.filter` define o recorte.
- Formato (o link curto leva à página da vaga, onde está o anúncio):

```
🧑‍💻 *Vagas de hoje: 18/11* (23 novas)

*Back-end*
• Dev Back-end Pleno (Node) · Acme · Remoto · PJ
  vagas.exemplo.com.br/v/abc12
• Eng. de Dados Sênior (AWS) · Foo · Remoto LatAm
  vagas.exemplo.com.br/v/def34

*Front-end*
• ...

🔎 Todas as vagas: vagas.exemplo.com.br
Oferecido por <patrocinador> (opcional)
```

- Alternativa sem risco: um **Canal do WhatsApp** da comunidade, onde a mesma mensagem é postada à mão uma vez e todos os grupos indicam o canal.

### Caminho automático (Fase 2, desligado por padrão)

- **Evolution API** ([GitHub](https://github.com/EvolutionAPI/evolution-api), código aberto, grátis) instalada na VPS (container + o Postgres que já existe), conectada a um **chip dedicado** pelo QR code. O `EvolutionTransport` segue a interface `WhatsAppTransport` do Agendia.
- Flags em `setting`: `wa_auto_enabled` (geral), `wa_group.enabled` (por grupo), horário de envio, limite diário. Se a conexão cair ou o envio falhar, o sistema volta para o modo manual e avisa o admin.

**Riscos:**
- A Evolution usa o WhatsApp Web (Baileys), que **não é oficial**. A Meta pode banir o número a qualquer momento, sem recurso. Se o chip cair, o envio cai junto, e é preciso reentrar com outro chip em todos os grupos.
- A API oficial (Cloud API) não serve: ela não posta em grupos comuns da comunidade e cobra por mensagem (a nota do rx-assim lembra que a Meta voltou a cobrar mensagens de service em 01/10/2026).

**Limites e boas práticas** (a Meta não publica números; estes são de guias de mercado: [horadecodar](https://horadecodar.com.br/evitar-bloqueios-whatsapp-evolution-api-n8n/), [whapi](https://whapi.cloud/blog/pt/how-to-avoid-whatsapp-ban-2026)):
- **Aquecer o chip por 1 a 2 semanas** antes de automatizar: uso normal, conversas de ida e volta com pessoas reais, foto e nome de perfil.
- O número só envia para grupos em que **foi adicionado por um admin** do grupo. Nunca entrar em grupo por link em massa e nunca mandar mensagem privada para membros.
- No máximo **1 mensagem por grupo por dia**, com intervalo aleatório de 30 a 120 s entre grupos; começar com 3 a 5 grupos e só passar de 20 depois de 1 mês sem problema.
- Variar o texto (cabeçalho e ordem mudam a cada dia), mandar só em horário comercial e não enviar o mesmo link repetido em sequência.
- Não responder automaticamente nada; o número é só de envio. Pedir aos admins dos grupos que avisem quando houver denúncias.
- Ter um **segundo chip reserva** já aquecido.

## 10. Fases e entregas por semana (2 devs)

**Dev A** = back-end, coleta e infraestrutura. **Dev B** = front-end, site e admin.

### MVP: semanas 1 e 2 (no ar no fim da semana 2)

| Semana | Dev A | Dev B |
|---|---|---|
| **1** | Monorepo e deploy (molde do Agendia), Postgres + pg-boss, schema; cópia do `job-schema` do JobLens; **API de ingestão** (`/ingest/jobs`, `/close`, `/vocab`, `/runs`), tokens de cliente, upsert por fonte + id; doc da API em `docs/API.md` com exemplos de curl. Nesta semana a pessoa já pode ligar o agente dela no ambiente de teste. | Layout no modelo da referência (cards escuros, busca, filtros em chip); lista com paginação; página da vaga com JSON-LD `JobPosting`; páginas renderizadas no servidor; sitemap |
| **2** | `expire-jobs` + `410`; `build-digest`; `ingest_run` e alerta "nenhuma vaga recebida em 24h" | Admin mínimo (login de admin, clientes de API e tokens, ocultar vaga, rejeitadas por motivo, tela "Resumo de hoje" com Copiar); botão "Reportar"; política de privacidade e termos; slots de anúncio + pedido ao AdSense; banner de cookies; domínio e lançamento na comunidade |

**Pronto quando:** o agente da pessoa enviou pelo menos 300 vagas ativas, a ingestão rodou 3 dias seguidos sem erro no servidor, a expiração foi testada (vaga com 22 dias some e a URL responde `410`) e o resumo do dia foi copiado e colado em um grupo de verdade.

Com a coleta, o filtro e o preenchimento fora do hub, o MVP é basicamente site + API + expiração + resumo: cabe em **1 semana** para 2 devs, com a semana 2 de folga para admin, AdSense e ajustes.

### Fase 2: semanas 3 e 4 (recrutadores + WhatsApp automático)

| Semana | Dev A | Dev B |
|---|---|---|
| **3** | Contas (link mágico), empresa e recrutador; API de publicação; nota de risco (regras + IA); limites por usuário e IP; Turnstile | Cadastro do recrutador, formulário de vaga com prévia, painel "minhas vagas" (expira em X dias, republicar), fila de moderação no admin |
| **4** | `EvolutionTransport`, flags, envio agendado com intervalos aleatórios, volta para o manual se falhar | "Enviar vaga por link" (LinkedIn e outras, com aprovação); config de grupos de WhatsApp no admin; página "Para recrutadores"; métricas simples (vagas por fonte, cliques) |

O aquecimento do chip começa na semana 2, em paralelo, para estar pronto na semana 4.

### Fase 3: semanas 5 a 7 (banco de talentos, agora parte do serviço pago de R$ 5/mês; ver seção 13)

| Semana | Dev A | Dev B |
|---|---|---|
| **5** | Conta de candidato, `talent_profile`, upload do CV (storage privado, URL assinada), `consent_log`, extração do CV por IA (só com consentimento) | Cadastro em etapas com os consentimentos, editor do perfil, seletor de visibilidade com prévia ("é assim que o recrutador te vê") |
| **6** | Busca de talentos (filtros de stack, senioridade, região, modelo de trabalho) só para recrutador confiável; `contact_request` + e-mails; registro de visualização | Tela de busca do recrutador, pedido de contato, caixa de pedidos do candidato (aceitar/recusar) |
| **7** | Exportar e apagar conta (autosserviço), expiração de perfil parado, revisão de segurança (architect) | Política de privacidade revisada, central "Meus dados", alertas de vaga por e-mail (opcional) |

### Fase 4: depois (monetização + crescimento)

- Vaga em destaque paga via Nox (produto `hub-vagas`, checkout PIX/cartão, webhook).
- Kit de patrocínio (página de mídia com números reais de tráfego).
- EthicalAds/Carbon quando passar de 50 mil páginas/mês.
- Alertas por e-mail e um bot de busca no WhatsApp ("/vagas react remoto") só se a comunidade pedir.

## 11. Custos mensais

Câmbio usado: US$ 1 ≈ R$ 5,50 (referência, confira no dia). Preços consultados em 18/11/2026.

| Item | A: 10 mil páginas | B: 100 mil páginas | C: 500 mil páginas | Fonte do preço |
|---|---|---|---|---|
| VPS | R$ 0 (cabe na VPS compartilhada) | R$ 0 a 35 (pode dividir a VPS) | R$ 35 a 70 (VPS própria, tipo Hostinger KVM 2: 2 vCPU, 8 GB; R$ 35 na promoção, ~R$ 70 na renovação) | [horadecodar, 2026](https://horadecodar.com.br/valor-vps/); [valebyte, 03/11/2026](https://valebyte.com/en/providers/hostinger/) |
| IA no hub | R$ 0 (a coleta e o preenchimento ficam no agente da pessoa; custo dele na seção 4) | R$ 0 a 5 (nota de risco das vagas de recrutador, opcional) | R$ 0 a 10 | [anthropic.com/pricing](https://www.anthropic.com/pricing) |
| Evolution API | R$ 0 (código aberto, na VPS) | R$ 0 | R$ 0 | [GitHub](https://github.com/EvolutionAPI/evolution-api) |
| Chip dedicado + reserva | R$ 15 a 30 (só a fase automática; recarga pré-paga mínima para manter a linha ativa) | R$ 30 a 60 (2 chips) | R$ 30 a 60 | [minhaconexao](https://www.minhaconexao.com.br/planos/planos-de-celular/plano-pre-pago); [melhorplano](https://melhorplano.net/claro/planos-claro/prezao-claro) |
| Domínio `.com.br` | R$ 3,33 (R$ 40/ano) | R$ 3,33 | R$ 3,33 | [Teletime/NIC.br, 14/10/2026](https://teletime.com.br/14/10/2026/br-6-milhoes/) |
| E-mail transacional (link mágico, avisos) | R$ 0 (plano grátis de Resend/Brevo; confirmar limites) | R$ 0 a 110 | ~R$ 110 | a confirmar na contratação |
| Storage de CV (Fase 3) | R$ 0 (disco da VPS ou R2 grátis até 10 GB) | R$ 0 | R$ 0 a 10 | a confirmar |
| **Total** | **~R$ 20 a 35** | **~R$ 35 a 215** | **~R$ 180 a 265** | |

**Só o MVP (site + API + resumo manual):** ~R$ 3/mês, que é só o domínio. A VPS já existe e é paga por todos os produtos; o chip só entra se o WhatsApp automático for ligado, o e-mail só quando recrutadores tiverem login e o storage só com o banco de talentos. O custo de IA do seu agente fica do seu lado (seção 4).

Em todos os cenários a receita esperada (seção 8) cobre o custo. O maior custo é o tempo dos 2 devs: ~7 semanas até a Fase 3.

## 12. Riscos

| Risco | Prob. | Impacto | Mitigação |
|---|---|---|---|
| O agente de coleta para ou manda lixo | média | alto (site sem vagas novas) | Alerta "nenhuma vaga recebida em 24h", motivo de rejeição em `/ingest/runs`, botão de ocultar vaga no admin |
| Gupy ou InHire bloqueiam o agente (endpoint não documentado) | média | médio | Problema do lado do agente; o hub não depende de nenhuma fonte. Priorizar APIs oficiais (Greenhouse, Lever, Ashby, GitHub) |
| Ban do chip na Evolution | média-alta | baixo (há o modo manual) | Flag desligada por padrão, aquecimento, 1 mensagem por dia por grupo, chip reserva, Canal do WhatsApp como alternativa |
| Vaga falsa ou golpe chega à comunidade | média | alto (reputação) | Moderação dos primeiros anúncios, nota de risco, botão de reporte, só domínio corporativo; vagas coletadas vêm de ATS de empresas reais |
| Poucas vagas relevantes no nicho escolhido | média | alto | Começar com uma lista de empresas curada com a comunidade; GitHub issues; abrir vagas remotas internacionais |
| AdSense recusa ou paga pouco | média | baixo | Patrocínio direto como plano principal; EthicalAds e Carbon depois |
| Vazamento do banco de talentos | baixa | muito alto | Oculto por padrão, contato só após aceite, CV em storage privado com URL assinada, só recrutador confiável busca, revisão do architect na Fase 3, apagar conta em autosserviço |
| Termos de uso de fontes (LinkedIn e outras) | baixa (se seguir o plano) | alto | Não fazer scraping de LinkedIn, Indeed nem Catho; só links enviados manualmente |
| Conteúdo duplicado ou "fino" atrapalhar o SEO | média | médio | Página de vaga com dados estruturados e link canônico; `410` nas expiradas; não indexar listas filtradas profundas |
| Vazamento do token da API de ingestão | baixa | médio (spam publicado) | Token por cliente, só hash no banco, revogação no admin, limite por hora, botão de ocultar e apagar lote inteiro de um cliente no admin |

## 13. Decisões (respostas da pessoa em 18/11/2026)

1. **Nome e endereço:** iaprohub-vagas, em **`iapro.vagas.noxlabs.com.br`** (antes `iaprohub.vagas.aurora-saas.com.br`, que segue como alias durante a migração para a NoxLabs). Por ter dois níveis abaixo de `noxlabs.com.br`, esse endereço não é coberto por um `*.noxlabs.com.br`: precisa de um registro DNS próprio (A ou CNAME para a VPS), e o Caddy emite o certificado sozinho. Fica de reserva: `iaprohubvagas.com.br` está livre (R$ 40/ano).
2. **Comunidade:** média para grande → planejar pelo **cenário B** (~100 mil páginas/mês) desde o início: cache nas páginas públicas e índices certos.
3. **Nicho:** tech em geral (todas as áreas de tecnologia).
4. **Recorte:** sem recorte geográfico. Entra o que for tech e tiver até 3 dias, e o agente da pessoa já faz esse filtro.
5. **Recrutador:** publica de graça.
6. **WhatsApp:** só manual por enquanto. Uma vez por dia o sistema gera uma mensagem curta e a pessoa copia e cola nos grupos. Cada vaga ocupa uma linha com cargo, empresa (se houver), remoto/híbrido/presencial, salário (se informado) e **link curto da própria plataforma** (`/v/abc12`, sem encurtador externo). No fim vai o link para a lista completa.
7. **Prazo:** a pessoa quer o MVP no ar **hoje** (18/11/2026).
8. **Banco de talentos:** vira parte do serviço pago abaixo e sai do escopo grátis.
9. **Serviço pago de R$ 5/mês (a planejar em 19/11/2026):** inclui o banco de talentos e o envio automático do currículo quando aparecer uma vaga compatível. A cobrança passa pelo Nox. Cuidados para o plano de amanhã: (a) consentimento explícito para cada envio ou para um filtro definido pela pessoa (LGPD); (b) muitos ATS (Gupy, LinkedIn) proíbem candidatura automatizada, então o caminho seguro é mandar o currículo para o **e-mail do recrutador** nas vagas publicadas no próprio hub, ou preparar a candidatura para a pessoa confirmar com 1 clique; (c) a `apli` é a referência de como aplicar em cada ATS.

### Escopo de hoje (MVP)

- API de ingestão (`/ingest/jobs`, `/close`, `/runs`) com token.
- Site: lista em cards no modelo da referência, busca, filtros em chip, página da vaga com JSON-LD, link curto `/v/:code`, sitemap.
- Expiração automática em 21 dias.
- Tela/rota "Resumo de hoje" com o texto pronto para copiar.
- Deploy na VPS em `iapro.vagas.noxlabs.com.br`.

Ficam para depois: publicação por recrutador e moderação (Fase 2), anúncios (pedir o AdSense assim que o site estiver no ar) e o serviço pago (Fase 3, que substitui o antigo "banco de talentos").
