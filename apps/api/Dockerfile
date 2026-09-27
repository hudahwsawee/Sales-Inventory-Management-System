# ---- Base ----
# نفس إصلاح Dockerfile.dev: node:20-bookworm-slim بدل node:20-alpine
# لتفادي مشكلة libssl.so.1.1 مع Prisma Query Engine على Alpine/musl.
FROM node:20-bookworm-slim AS base
RUN apt-get update -y \
    && apt-get install -y openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# ---- Dependencies ----
FROM base AS deps
COPY package*.json ./
COPY prisma ./prisma
RUN npm install
RUN npx prisma generate

# ---- Build ----
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---- Production ----
# مرحلة جديدة تمامًا (طبقة أساس جديدة) — تحتاج تثبيت openssl مجددًا هنا
# صراحة، فهي لا ترث حزم apt المثبَّتة في مرحلة base أعلاه.
FROM node:20-bookworm-slim AS production
RUN apt-get update -y \
    && apt-get install -y openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
EXPOSE 3000
CMD ["node", "dist/main.js"]
