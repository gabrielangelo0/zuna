#!/usr/bin/env bash
# Publica a versão nova do Zuna na VPS. Roda *na* VPS, chamado pelo GitHub Actions
# (.github/workflows/deploy.yml) ou à mão por quem estiver logado lá.
#
# O jogo roda num contêiner construído a partir do código, declarado no docker-compose.yml
# do stack (o mesmo que sobe o Postgres e o Caddy). Não há systemd: publicar é atualizar o
# clone, reconstruir a imagem e recriar o contêiner.
#
# Se a versão nova não responder ao healthcheck, volta para a anterior sozinho: um deploy
# automático que derruba o jogo e vai dormir é pior do que nenhum.

set -euo pipefail

# Pasta do stack: é onde mora o docker-compose.yml.
STACK_DIR="${ZUNA_STACK:-/opt/devfly}"
# Clone do repositório, que o compose usa como contexto de build.
APP_DIR="${ZUNA_DIR:-$STACK_DIR/src/zuna}"
# Nome do serviço dentro do compose.
SERVICE="${ZUNA_SERVICE:-zuna}"
BRANCH="${ZUNA_BRANCH:-main}"
# Marca guardada antes de reconstruir, para a volta ser uma linha.
ROLLBACK_TAG="${ZUNA_ROLLBACK_TAG:-zuna:anterior}"
IMAGE="${ZUNA_IMAGE:-zuna:local}"
# Rota que prova que o servidor voltou de verdade: ela só responde depois de o banco
# conectar e os mundos carregarem.
HEALTH_URL="${ZUNA_HEALTH_URL:-https://zuna.devfly.net/api/worlds}"
HEALTH_TRIES="${ZUNA_HEALTH_TRIES:-30}"
HEALTH_WAIT="${ZUNA_HEALTH_WAIT:-3}"
# Script de backup do banco. Vazio pula o backup — mas as migrações rodam no boot, então
# pular é escolha de quem já tem outro backup do dia.
BACKUP="${ZUNA_BACKUP:-$STACK_DIR/backup-zuna.sh}"

log() { printf '\n\033[1;36m==>\033[0m %s\n' "$*"; }
erro() { printf '\n\033[1;31m!!\033[0m %s\n' "$*" >&2; }

cd "$APP_DIR"

anterior="$(git rev-parse HEAD)"
log "Versão atual: $(git log -1 --format='%h %s' "$anterior")"

log "Buscando o que há de novo"
git fetch --prune origin
novo="$(git rev-parse "origin/$BRANCH")"
if [ "$anterior" = "$novo" ]; then
  log "Nada novo em origin/$BRANCH. Nada a fazer."
  exit 0
fi

# O backup vem antes de qualquer coisa: as migrações do Drizzle rodam no boot do servidor,
# e migração aplicada não tem desfazer.
if [ -n "$BACKUP" ] && [ -x "$BACKUP" ]; then
  log "Backup do banco"
  bash "$BACKUP"
elif [ -n "$BACKUP" ]; then
  erro "Script de backup não encontrado em $BACKUP. Defina ZUNA_BACKUP='' para pular de propósito."
  exit 1
fi

# --ff-only de propósito: se alguém editou direto na VPS, o deploy para e avisa em vez de
# apagar o trabalho por cima.
log "Atualizando para $(git log -1 --format='%h %s' "$novo")"
git merge --ff-only "origin/$BRANCH"

cd "$STACK_DIR"

# Guarda a imagem que está no ar antes de sobrescrevê-la.
if docker image inspect "$IMAGE" >/dev/null 2>&1; then
  log "Guardando a imagem atual como $ROLLBACK_TAG"
  docker tag "$IMAGE" "$ROLLBACK_TAG"
fi

publicar() {
  log "Construindo a imagem"
  docker compose build "$SERVICE"
  log "Recriando o contêiner"
  docker compose up -d "$SERVICE"
}

saudavel() {
  for _ in $(seq 1 "$HEALTH_TRIES"); do
    if curl -fsS -m 5 "$HEALTH_URL" >/dev/null 2>&1; then
      return 0
    fi
    sleep "$HEALTH_WAIT"
  done
  return 1
}

publicar

log "Conferindo se o jogo respondeu"
if saudavel; then
  log "No ar: $(git -C "$APP_DIR" log -1 --format='%h %s' "$novo")"
  exit 0
fi

erro "O jogo não respondeu depois do deploy. Voltando para a versão anterior."
git -C "$APP_DIR" reset --hard "$anterior"
if docker image inspect "$ROLLBACK_TAG" >/dev/null 2>&1; then
  docker tag "$ROLLBACK_TAG" "$IMAGE"
  docker compose up -d "$SERVICE"
else
  erro "Não havia imagem anterior guardada: reconstruindo a partir do código revertido."
  publicar
fi

if saudavel; then
  erro "Voltou para a versão anterior e o jogo está no ar. O deploy falhou."
else
  erro "O jogo continua fora do ar mesmo depois de voltar. Olhe: docker compose logs $SERVICE"
fi
exit 1
