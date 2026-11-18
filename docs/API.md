# API de ingestão: iaprohub vagas

Endereço: `https://iaprohub.vagas.aurora-saas.com.br`

O agente de coleta manda as vagas já filtradas (tech, até 3 dias) e preenchidas. O site só guarda e mostra cada vaga, e a apaga 21 dias depois de ela entrar.

## Autenticação

`Authorization: Bearer <token do cliente>`. Cada agente tem um token próprio, e o banco guarda só o hash dele. Limite: 60 requisições por hora por token, com até 200 vagas por requisição.

Para criar um token, use o token de admin:

```bash
curl -X POST https://iaprohub.vagas.aurora-saas.com.br/api/v1/admin/clients \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"gpt"}'
```

## POST /api/v1/ingest/jobs

```json
{
  "jobs": [
    {
      "source": { "kind": "greenhouse", "key": "acme", "externalId": "4012345", "url": "https://boards.greenhouse.io/acme/jobs/4012345" },
      "title": "Senior Back-End Developer (Python/AWS)",
      "company": { "name": "Acme", "website": "https://acme.com" },
      "description": "Texto puro (as quebras de linha são mantidas). Não use HTML.",
      "seniority": ["senior"],
      "workplace": ["remoto"],
      "regime": ["pj"],
      "stack": ["python", "aws", "postgresql"],
      "location": "Brasil",
      "salary": { "min": 15000, "max": 20000, "currency": "BRL", "period": "month" },
      "applyUrl": "https://boards.greenhouse.io/acme/jobs/4012345",
      "publishedAt": "2026-11-17T12:00:00Z"
    }
  ]
}
```

| Campo | Obrigatório | Valores |
|---|---|---|
| `source.kind` | sim | nome da fonte em texto livre: `greenhouse`, `gupy`, `linkedin`... |
| `source.externalId` ou `source.url` | um dos dois | id da vaga na fonte. **A mesma combinação `kind` + `externalId` atualiza a vaga em vez de duplicar.** |
| `title` | sim | até 200 caracteres |
| `applyUrl` | sim | `http(s)://...` |
| `company.name` | não | até 150 caracteres |
| `description` | não | texto puro, até 50 mil caracteres |
| `seniority` | não | `estagio`, `junior`, `pleno`, `senior`, `especialista`, `lideranca` |
| `workplace` | não | `remoto`, `hibrido`, `presencial` |
| `regime` | não | `clt`, `pj`, `estagio`, `cooperado`, `freelance`, `temporario`, `outro` |
| `stack` | não | até 30 termos, em minúsculas |
| `location` | não | texto exibido como veio: `Brasil`, `São Paulo, SP`, `LatAm` |
| `salary` | não | `min`/`max` (números), `currency` (padrão `BRL`), `period` (`month` padrão, `year`, `day`, `hour`) ou `text` (ex.: `"A combinar"`) |
| `publishedAt` | não | ISO 8601 com fuso; ordena a lista. Sem ele, vale a hora em que a vaga chegou. |

Os campos de vocabulário aceitam acento, maiúsculas e alguns sinônimos (`Sênior`, `sr`, `Remote`, `hybrid`). Um valor desconhecido rejeita só aquele item.

Resposta: um resultado por vaga, na mesma ordem.

```json
{ "results": [
  { "index": 0, "status": "created", "id": "ne66553", "url": "https://iaprohub.vagas.aurora-saas.com.br/vagas/senior-back-end-developer-python-aws-acme-ne66553" },
  { "index": 1, "status": "updated", "id": "r4fte7t", "url": "..." },
  { "index": 2, "status": "rejected", "errors": ["applyUrl: Invalid URL"] }
] }
```

## Outras rotas

- `POST /api/v1/ingest/jobs/close`, corpo `{ "source": { "kind": "greenhouse" }, "externalIds": ["4012345"] }`: tira do ar as vagas que fecharam antes dos 21 dias.
- `GET /api/v1/ingest/runs?limit=20`: as últimas chamadas deste token, com o motivo de cada rejeição.
- `GET /api/v1/ingest/vocab`: os valores aceitos, para usar no prompt ou no JSON Schema do agente.

## Admin

- `GET /api/v1/admin/digest?hours=24` (Bearer admin): texto do resumo para o WhatsApp. O mesmo resumo aparece na tela `/admin/resumo`.
- `DELETE /api/v1/admin/jobs/:id` (Bearer admin): apaga uma vaga.

## Anúncios

Aparecem na lista como um card "Patrocinado" (borda tracejada, mesmo tamanho de um card de vaga) a cada 12 vagas. Quando há mais de um anúncio ativo, eles se revezam. Sem anúncio ativo, nada aparece.

- `POST /api/v1/admin/ads` (Bearer admin), corpo `{ "title": "...", "url": "https://...", "text": "opcional, até 200", "cta": "opcional, ex.: Conhecer o curso", "endsAt": "opcional, ISO 8601" }`
- `GET /api/v1/admin/ads` (Bearer admin): lista todos.
- `DELETE /api/v1/admin/ads/:id` (Bearer admin): desliga o anúncio.
- `GET /api/v1/ads`: os anúncios ativos, usados pelo site.
