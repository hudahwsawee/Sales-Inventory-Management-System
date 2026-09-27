# ---- Build ----
# node:20-bookworm-slim بدل node:20-alpine — نفس إصلاح Dockerfiles الـBackend،
# بالإضافة لتوحيد الصورة الأساسية عبر كل حاويات المشروع (لا Alpine إطلاقًا).
# لا حاجة لتثبيت openssl هنا: هذه الحاوية لا تُشغّل Prisma إطلاقًا (Build ثابت
# لملفات الواجهة فقط)، فمشكلة libssl.so.1.1 مع محرك Prisma لا تنطبق عليها.
FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# ---- Production (Nginx يخدم الملفات الساكنة) ----
# nginx:alpine مُستبدَلة بـnginx:stable-bookworm (بناء Debian رسمي)، لنفس
# سبب توحيد الصورة الأساسية بلا Alpine في كل مكان بالمشروع.
FROM nginx:stable-bookworm AS production
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
