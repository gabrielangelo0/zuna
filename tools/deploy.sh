#!/usr/bin/env bash
# Publica a versão nova do Zuna na VPS. Roda *na* VPS, chamado pelo GitHub Actions
# (.github/workflows/deploy.yml) ou à mão por quem estiver logado lá.
#
# Se a versão nova não responder ao healthcheck, volta para a anterior sozinho: um
# deploy automático que derruba o jogo e vai dormir é pior do que nenhum.

set -euo pipefail

# Onde o repositório está clonado na VPS.
APP_DIR="${ZUNA_DIR:-/opt/zuna}"
# Nome da unidade do systemd que mantém o servidor de pé.
SERVICE="${ZUNA_SERVICE:-zuna}"
BRANCH="${ZUNA_BRANCH:-main}"
# Porta em que o Node escuta na máquina (o Caddy encosta nela).
PORT="${ZUNA_PORT:-8080}"
# Como reiniciar. O padrão é systemd; quem usa pm2 ou docker troca por ZUNA_RESTART.
RESTART="${ZUNA_RESTART:-sudo systemctl restart $SERVICE}"
# Rota que prova que o servidor voltou de verdade: ela só responde depois de o banco
# conectar e os mundos carregarem. (/__healthcheck não existe neste servidor — está
# só no railway.json, que não vale para esta VPS.)
HEALTH_URL="${ZUNA_HEALTH_URL:-http://127.0.0.1:${PORT}/api/worlds}"
# Quanto esperar o servidor voltar antes de desistir e reverter.
HEALTH_TRIES="${ZUNA_HEALTH_TRIES:-30}"
HEALTH_WAIT="${ZUNA_HEALTH_WAIT:-2}"

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

# --ff-only de propósito: se alguém editou direto na VPS, o deploy para e avisa em vez
# de apagar o trabalho por cima.
log "Atualizando para $(git log -1 --format='%h %s' "$novo")"
git merge --ff-only "origin/$BRANCH"

publicar() {
  log "Instalando dependências"
  npm ci --no-audit --no-fund
  log "Compilando o cliente"
  npm run build -w @zuna/client
  log "Reiniciando: $RESTART"
  bash -c "$RESTART"
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

log "Esperando o servidor responder"
if saudavel; then
  log "No ar: $(git log -1 --format='%h %s')"
  exit 0
fi

erro "A versão nova não respondeu ao healthcheck. Voltando para $(git log -1 --format='%h %s' "$anterior")."
git reset --hard "$anterior"
publicar
if saudavel; then
  erro "Revertido. O jogo está no ar na versão anterior; o commit novo ficou de fora."
  exit 1
fi

erro "Reverteu e mesmo assim não respondeu. O serviço precisa de olho humano:"
erro "  sudo systemctl status $SERVICE"
erro "  sudo journalctl -u $SERVICE -n 100 --no-pager"
exit 1
