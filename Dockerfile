FROM node:20-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
# No default on purpose: this image is a deploy artifact, and no configuration is
# safe to guess. The old default (`production`) has no fileReplacements, so it built
# an image pointed at localhost:8080 for anyone who forgot the flag (OBRS-472).
#   docker build --build-arg BUILD_CONFIGURATION=sit .
ARG BUILD_CONFIGURATION
RUN test -n "${BUILD_CONFIGURATION}" \
    || (echo "BUILD_CONFIGURATION is required (sit|prod); ci-smoke is not deployable" >&2; exit 1)
RUN npm run build -- --configuration ${BUILD_CONFIGURATION}

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/obrs/browser /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
