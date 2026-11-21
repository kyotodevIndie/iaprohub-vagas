#!/usr/bin/env bash
# Deploy: builda a imagem aqui, manda por SSH (docker save | load) e recria a stack "iaprohub-vagas".
# Na primeira vez cria <servidor>:/home/deploy/iaprohub-vagas/stack.env com segredos novos. As migrations rodam no boot do app.
# Uso: VAGAS_HOST=saas-vps bash deploy/vps-deploy.sh
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

HOST="${VAGAS_HOST:-saas-vps}"
# /opt é do root nesta VPS e o usuário deploy não tem sudo; por isso a stack mora na home dele.
DIR=${VAGAS_DIR:-/home/deploy/iaprohub-vagas}
DOMAIN=${VAGAS_DOMAIN:-iapro.vagas.noxlabs.com.br}
SHA="$(git rev-parse --short HEAD)"
[ -z "$(git status --porcelain)" ] || { echo "Há mudanças não commitadas; commite antes." >&2; exit 1; }

echo "→ build $SHA"
docker build -q -f deploy/Dockerfile -t "iaprohub-vagas:$SHA" . >/dev/null

echo "→ enviando imagem"
docker save "iaprohub-vagas:$SHA" | gzip -1 | ssh "$HOST" 'gunzip | docker load' >/dev/null
ssh "$HOST" "mkdir -p $DIR/backups"
scp -q deploy/docker-compose.yml "$HOST:$DIR/"

ssh "$HOST" SHA="$SHA" DIR="$DIR" DOMAIN="$DOMAIN" bash -s <<'REMOTE'
set -euo pipefail
ENV=$DIR/stack.env
if [ ! -f $ENV ]; then
  umask 077
  printf 'TAG=%s\nDOMAIN=%s\nPOSTGRES_PASSWORD=%s\nADMIN_TOKEN=%s\n' "$SHA" "$DOMAIN" "$(openssl rand -hex 24)" "$(openssl rand -hex 24)" > $ENV
  echo "→ stack.env criado"
fi
sed -i "s/^TAG=.*/TAG=$SHA/" $ENV
cd $DIR
DC="docker compose -p iaprohub-vagas --env-file $ENV -f docker-compose.yml"
$DC up -d --remove-orphans
health() { docker inspect -f '{{.State.Health.Status}}' "$1" 2>/dev/null || true; }
for i in $(seq 1 40); do [ "$(health iaprohub-vagas-app-1)" = healthy ] && break; sleep 3; done
[ "$(health iaprohub-vagas-app-1)" = healthy ] || { docker logs --tail 40 iaprohub-vagas-app-1; exit 1; }
echo "✔ app saudável ($SHA)"
docker image prune -f >/dev/null
REMOTE
