# Publicar na VPS

Produção roda numa VPS em São Paulo (187.127.24.38) atrás do Caddy, em
https://zuna.devfly.net. **Não é Railway** — o `railway.json` do repositório não vale para cá.

## O que está no ar hoje

Medido em 2026-10-04, lendo o pacote que o site serve:

| No ar | Fora |
|---|---|
| Classes, grimório, missões, presente diário, ranking | Andares, esgotos e montanhas |
| A otimização de desempenho (`bb65a3c`) | PvP, marca e queda de item |
| | VIP e passes |
| | Arena |

Para repetir a medição sem adivinhar: baixe `https://zuna.devfly.net/assets/main-*.js` e
procure uma palavra que só existe no código novo (`Marcado`, `vip`, `Esgoto`, `Arena`). O que o
servidor tem não dá para ver de fora; o que o cliente tem, dá.

## Ligar o deploy automático

O workflow (`.github/workflows/deploy.yml`) publica a cada push no `main`, mas **passa em verde
sem fazer nada** enquanto faltarem segredos. É de propósito: pintar de vermelho todo push por um
deploy que ninguém configurou seria pior.

Faltam os seis. A conta ativa do `gh` nesta máquina é a do trabalho, então todo comando leva o
token da conta certa na frente:

```bash
export GH_TOKEN="$(gh auth token --user gabrielangelo0)"
R=gabrielangelo0/zuna
gh secret set VPS_HOST    --repo $R --body "187.127.24.38"
gh secret set VPS_USER    --repo $R --body "SEU_USUARIO_SSH"
gh secret set VPS_DIR     --repo $R --body "/opt/zuna"
gh secret set VPS_SERVICE --repo $R --body "zuna"
gh secret set VPS_SSH_KEY --repo $R < ~/.ssh/SUA_CHAVE_DE_DEPLOY
gh secret set VPS_KNOWN_HOSTS --repo $R --body "$(ssh-keyscan -H 187.127.24.38 2>/dev/null)"
```

`VPS_DIR` e `VPS_SERVICE` acima são os padrões do `tools/deploy.sh`; troque se a sua VPS usa
outros. `VPS_PORT` só é preciso se o SSH não estiver na 22.

> **A chave de acesso é sua e só sua.** Use uma chave criada para o deploy, não a sua chave
> pessoal, e deixe-a sem permissão de login interativo onde der.

## A armadilha da primeira vez

O workflow roda `bash $VPS_DIR/tools/deploy.sh` — **o script que já está na VPS**, porque é ele
que faz o `git pull`. Se a cópia da VPS for anterior a `fb5c3a5` (2026-09-25), o script ainda não
existe lá e o primeiro deploy automático falha sem ter mexido em nada.

Resolve-se uma vez, à mão:

```bash
ssh SEU_USUARIO@187.127.24.38 'cd /opt/zuna && git pull'
```

Depois disso o automático se vira sozinho.

## Publicar à mão, agora

Serve tanto para o primeiro deploy quanto para quando se quiser subir sem esperar o push:

```bash
ssh SEU_USUARIO@187.127.24.38 'ZUNA_DIR=/opt/zuna ZUNA_SERVICE=zuna bash /opt/zuna/tools/deploy.sh'
```

O script instala, compila o cliente, reinicia o serviço, confere `/api/worlds` e **volta sozinho
para a versão anterior** se o jogo não responder. Deploy que derruba o jogo e vai dormir é pior
do que nenhum.

## O banco

As migrações do Drizzle (`packages/server/drizzle/`) são aplicadas **no boot**, tanto no PGlite
de desenvolvimento quanto no Postgres de produção. Não há passo manual — mas vale saber que o
primeiro boot depois deste deploy vai criar as tabelas de PvP, VIP e arena de uma vez.

## Pendências de segurança

Duas, nenhuma delas resolvida:

- A senha do Postgres de produção apareceu em texto puro numa conversa e **precisa ser trocada**.
- O `ASAAS_WEBHOOK_TOKEN` foi colado numa conversa e nunca foi trocado.
