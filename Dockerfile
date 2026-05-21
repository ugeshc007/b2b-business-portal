FROM node:24-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run prisma:generate && npm run build

ENV NODE_ENV=production
EXPOSE 4321

CMD ["npm", "run", "start:prod"]
