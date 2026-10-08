FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && chown -R node:node /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 TAXES_DB_PATH=/data/taxes.sqlite
USER node
EXPOSE 3000
CMD ["npm", "start"]
