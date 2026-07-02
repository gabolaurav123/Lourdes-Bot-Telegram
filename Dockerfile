FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY worker/package.json worker/package.json
RUN npm install

FROM deps AS build
WORKDIR /app
COPY . .
RUN npm run db:generate
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ARG APP=api
ENV APP=$APP
COPY --from=build /app/package.json /app/package.json
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/apps /app/apps
COPY --from=build /app/packages /app/packages
COPY --from=build /app/worker /app/worker
COPY --from=build /app/storage /app/storage
EXPOSE 4000
CMD ["sh", "-c", "if [ \"$APP\" = \"worker\" ]; then npm run start -w @crm/worker; else npm run start -w @crm/api; fi"]
