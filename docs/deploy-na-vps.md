# Publicar na VPS

Produção roda numa VPS da Hostinger em São Paulo (187.127.24.38), em https://zuna.devfly.net.
**Não é Railway** — o `railway.json` do repositório é herança e não vale para cá.

## Como a VPS está montada

O jogo **não** roda como serviço do systemd. É um contêiner construído a partir do código,
declarado num `docker-compose.yml` que sobe o stack inteiro:

```
/opt/devfly/                 # o stack
├── docker-compose.yml       # serviços: postgres, zuna, caddy (+ zitadel)
├── src/zuna/                # clone deste repositório: é o contexto de build
├── zuna.env                 # variáveis do jogo (senha do banco, token da Asaas)
├── backup-devfly.sh         # pg_dumpall dos três bancos, diário, para o S3
└── Caddyfile                # o Caddy que atende o domínio
```

- Serviço no compose: `zuna` · contêiner: `devfly-zuna-1` · imagem: `zuna:local`
- Banco: contêiner `devfly-postgres-1` (`postgres:18-alpine`), no mesmo compose
- Acesso: `ssh -i ~/.ssh/id_ed25519_hostinger gabriel@187.127.24.38`

Publicar, portanto, é: atualizar o clone, reconstruir a imagem e recriar o contêiner. Quem faz
isso é o `tools/deploy.sh`.

## Publicar à mão

```bash
ssh -i ~/.ssh/id_ed25519_hostinger gabriel@187.127.24.38 \
  'ZUNA_STACK=/opt/devfly bash /opt/devfly/src/zuna/tools/deploy.sh'
```

O script faz backup do banco, atualiza o clone com `--ff-only`, guarda a imagem atual como
`zuna:anterior`, reconstrói, recria o contêiner, confere `/api/worlds` e **volta sozinho** se o
jogo não responder.

Se preferir passo a passo, é isto que ele faz:

```bash
bash /opt/devfly/backup-zuna.sh
cd /opt/devfly/src/zuna && git pull
cd /opt/devfly && docker compose build zuna && docker compose up -d zuna
docker compose logs --tail 40 zuna
```

Voltar à versão anterior:

```bash
docker tag zuna:anterior zuna:local && cd /opt/devfly && docker compose up -d zuna
```

## O banco

As migrações do Drizzle (`packages/server/drizzle/`) são aplicadas **no boot do servidor**, sem
passo manual. É por isso que o `deploy.sh` faz backup antes de qualquer coisa: migração aplicada
não tem desfazer.

O backup diário (`backup-devfly.sh`, 04:20 UTC) faz `pg_dumpall` dos três bancos da instância e
envia para `s3://portal-production-backups/devfly/`. O `backup-zuna.sh` faz o mesmo e manda para
`s3://portal-production-backups/zuna/` — são duplicatas, e vale consolidar um dia.

## Ligar o deploy automático

O workflow (`.github/workflows/deploy.yml`) publica a cada push no `main`, mas **passa em verde
sem fazer nada** enquanto faltarem segredos. É de propósito: pintar de vermelho todo push por um
deploy que ninguém configurou seria pior.

A conta ativa do `gh` nesta máquina é a do trabalho, então os comandos levam o token da conta
certa na frente:

```bash
export GH_TOKEN="$(gh auth token --user gabrielangelo0)"
R=gabrielangelo0/zuna
gh secret set VPS_HOST    --repo $R --body "187.127.24.38"
gh secret set VPS_USER    --repo $R --body "gabriel"
gh secret set VPS_STACK   --repo $R --body "/opt/devfly"
gh secret set VPS_SERVICE --repo $R --body "zuna"
gh secret set VPS_SSH_KEY --repo $R < ~/.ssh/id_ed25519_hostinger
gh secret set VPS_KNOWN_HOSTS --repo $R --body "$(ssh-keyscan -H 187.127.24.38 2>/dev/null)"
```

> **Antes de colar a chave:** `id_ed25519_hostinger` é a sua chave pessoal e abre a VPS inteira.
> Para o deploy, o certo é gerar um par só para isso (`ssh-keygen -t ed25519 -f ~/.ssh/zuna_deploy`),
> somar a pública ao `~/.ssh/authorized_keys` da VPS e dar **essa** ao GitHub. Assim, revogar o
> deploy não custa o seu acesso.

## Histórico

- **2026-09-24 a 2026-10-07:** produção ficou parada em `1ab4bd2`, 25 commits atrás, enquanto
  andares, PvP, VIP e arena eram construídos. O deploy automático existia mas nunca teve segredos.
- **2026-10-07:** os quatro sistemas foram publicados de uma vez, com as migrações 0016 a 0020.
  Nessa ocasião se descobriu que `tools/deploy.sh` e este documento descreviam systemd e
  `/opt/zuna` — uma máquina que não existe. Os dois foram reescritos para a realidade.

## Pendências de segurança

- A senha do Postgres de produção apareceu em texto puro numa conversa e **precisa ser trocada**.
- O `ASAAS_WEBHOOK_TOKEN` foi colado numa conversa e nunca foi trocado.
