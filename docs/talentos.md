# Talentos Pro: banco de talentos e envio automático (R$ 5/mês)

Decisões de 18/11/2026:
- envio por e-mail + 1 clique;
- login por código no e-mail;
- só recrutador verificado vê o banco.

## O que a pessoa ganha

| Grátis (com conta) | Pro (R$ 5/mês, Nox) |
|---|---|
| Perfil e CV guardados; pode aparecer no banco de talentos (se quiser) | Tudo do grátis |
| | **Envio automático:** vaga nova que bate com as preferências e tem e-mail de contato → o hub manda o CV ao recrutador em nome da pessoa |
| | **Alerta 1 clique:** vaga que bate mas é de ATS (Gupy, Greenhouse...) → e-mail com a vaga e o botão "Candidatar", 1 resumo por dia |
| | **Site sem anúncios** (nem o direto, nem o AdSense) |
| | Selo "Pro" no perfil para recrutadores (aparece primeiro na busca) |

## Regras do envio automático

- O envio só acontece com o consentimento "Autorizo o IAPro Vagas a enviar meu currículo em meu nome" marcado. Esse consentimento é separado dos outros e pode ser revogado a qualquer momento.
- O hub envia só para o `applyEmail` que o agente mandou na vaga (campo novo e opcional da API). E-mail tirado do texto da vaga não é usado.
- A vaga só casa com o perfil se ele tiver:
  - a senioridade da vaga;
  - o modelo de trabalho;
  - pelo menos 1 tecnologia em comum;
  - salário mínimo atendido (quando os dois lados informam).
- Limite de 5 envios por pessoa por dia, e nunca 2 envios para a mesma vaga.
- O e-mail vai do endereço do hub, com `Reply-To` da pessoa e o CV em PDF anexo. O texto é montado do perfil, sem IA.
- Todo envio vira linha em `application`. A pessoa vê a lista na conta e pode desligar o envio.

## Recrutadores

- O recrutador cria conta pelo mesmo login por código e marca "sou recrutador" com o nome da empresa. Você aprova em `/admin`.
- Ele busca perfis com visibilidade `anonimo` ou `aberto`, e vê só os dados permitidos (tabela da seção 7 do `plano.md`).
- Ele pede contato com uma mensagem. A pessoa recebe um e-mail com aceitar/recusar e, se aceitar, o recrutador recebe o e-mail e o LinkedIn dela.

## Fora agora

IA no CV, robô em ATS, alerta pelo WhatsApp e cobrança de recrutador.

## O que você precisa providenciar

1. **Nox:** cadastrar o produto `iaprohub-vagas` com o plano `pro` (R$ 5, mensal) e me passar `NOX_CLIENT_ID` e `NOX_SECRET`.
2. **Resend:** uma chave e um remetente verificado (ex.: `vagas@noxlabs.com.br`). Sem eles, o login não funciona em produção.
3. **E-mail de privacidade** para a política (pode ser o mesmo remetente).
