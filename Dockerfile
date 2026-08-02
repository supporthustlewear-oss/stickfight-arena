# StickFight Arena — deployable server (React website + game server)
FROM node:20-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server.js ./
COPY shared ./shared
COPY public ./public
COPY web/package.json web/package-lock.json ./web/
RUN cd web && npm ci && npm run build
EXPOSE 3000
CMD ["node", "server.js"]
