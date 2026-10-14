FROM node:24-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
ENV NODE_ENV=production PORT=3000 STORAGE_DIR=/storage
EXPOSE 3000
CMD ["node", "server/index.js"]
