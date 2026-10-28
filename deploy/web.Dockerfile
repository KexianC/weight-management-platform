# Build from the repository root using docker-compose.deploy.yml.
FROM node:22-alpine AS admin-build
WORKDIR /app
COPY apps/clinician-admin/package*.json ./
RUN npm ci --no-audit --no-fund
COPY apps/clinician-admin/ ./
ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
RUN npm run build

FROM node:22-alpine AS h5-build
WORKDIR /app
COPY apps/mini-program/package*.json ./
RUN npm ci --no-audit --no-fund
COPY apps/mini-program/ ./
ARG VITE_API_BASE_URL
ARG VITE_STORAGE_BASE_URL
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
ENV VITE_STORAGE_BASE_URL=${VITE_STORAGE_BASE_URL}
RUN npm run build:h5

FROM nginx:1.27-alpine
COPY deploy/nginx.deploy.conf /etc/nginx/conf.d/default.conf
COPY --from=admin-build /app/dist/ /usr/share/nginx/html/
COPY --from=h5-build /app/dist/build/h5/ /usr/share/nginx/html/h5/
EXPOSE 80
