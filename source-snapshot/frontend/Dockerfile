# Stage 1: Build the Angular application
FROM node:18-alpine AS build

WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install --legacy-peer-deps

# Copy the rest of the application code
COPY . .

# Build the Angular app for production
RUN npm run build -- --configuration production

# Stage 2: Run Angular SSR.
FROM node:18-alpine AS ssr

WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/dist/frontend ./dist/frontend

EXPOSE 4000

CMD ["node", "dist/frontend/server/server.mjs"]

# Stage 3: Keep Nginx as the public entry point and API proxy.
FROM nginx:1.27.1-alpine

# Install gettext for envsubst
RUN apk add --no-cache gettext
RUN mkdir -p /var/log/pollitic

# Copy the build output to Nginx's default directory
COPY --from=build /app/dist/frontend/browser /usr/share/nginx/html

# Angular SSR emits the browser fallback as index.csr.html. Nginx needs it as
# index.html for the deliberately browser-only routes (social renderer,
# compare, groups and refresh); otherwise it would keep its stock welcome page.
RUN cp /usr/share/nginx/html/index.csr.html /usr/share/nginx/html/index.html

# Copy the Nginx configuration file
COPY nginx.conf /etc/nginx/nginx.conf

# Copy the default config
COPY default.conf /etc/nginx/conf.d/default.conf

# Expose port 80 and 443
EXPOSE 80
EXPOSE 443

# Start Nginx
CMD ["nginx", "-g", "daemon off;"]
