# Imagem de produção: um processo Node serve o jogo (cliente compilado), a API e o WebSocket.

FROM node:24-slim AS manifests
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY packages/client/package.json packages/client/
COPY packages/baker/package.json packages/baker/
# Corrige a biblioteca HTTP do Colyseus logo depois do npm ci (postinstall).
COPY tools/fix-better-call.mjs tools/

# Compila o cliente.
FROM manifests AS client
COPY tsconfig.base.json ./
RUN npm ci --no-audit --no-fund
COPY packages/shared packages/shared
COPY packages/client packages/client
# Endereço público do servidor, embutido no cliente (a Railway passa as variáveis do serviço como build args).
ARG VITE_SERVER_URL
RUN npm run build -w @zuna/client

# Servidor: só as dependências dele. O npm também instala peers opcionais do Colyseus
# que o jogo não usa (Vite, TypeScript, uWebSockets); eles saem aqui para a imagem ficar leve.
FROM manifests AS runtime
ENV NODE_ENV=production
RUN npm ci --omit=dev --workspace=@zuna/server --no-audit --no-fund \
  && rm -rf node_modules/uWebSockets.js node_modules/vite node_modules/rolldown node_modules/@rolldown \
    node_modules/lightningcss* node_modules/typescript node_modules/@typescript \
  && npm cache clean --force
COPY packages/shared packages/shared
COPY packages/server packages/server
COPY --from=client /app/packages/client/dist packages/client/dist
USER node
EXPOSE 8080
CMD ["node", "--import", "tsx", "packages/server/src/index.ts"]
