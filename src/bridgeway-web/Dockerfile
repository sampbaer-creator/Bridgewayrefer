FROM node:24-alpine AS build
WORKDIR /app
COPY src/bridgeway-web/package*.json ./
RUN npm ci
COPY src/bridgeway-web/ ./
ARG BRIDGEWAYREFER_API_ORIGIN
ARG BRIDGEWAY_API_ORIGIN=http://bridgeway-api
ENV BRIDGEWAYREFER_API_ORIGIN=$BRIDGEWAYREFER_API_ORIGIN
ENV BRIDGEWAY_API_ORIGIN=$BRIDGEWAY_API_ORIGIN
RUN npm run build

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
