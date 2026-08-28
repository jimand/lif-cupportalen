FROM node:20-alpine AS builder

ARG VITE_UMAMI_URL
ENV VITE_UMAMI_URL=$VITE_UMAMI_URL
ARG VITE_UMAMI_WEBSITE_ID
ENV VITE_UMAMI_WEBSITE_ID=$VITE_UMAMI_WEBSITE_ID
ARG VITE_UMAMI_SHARE_URL
ENV VITE_UMAMI_SHARE_URL=$VITE_UMAMI_SHARE_URL

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx-spa.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
