FROM mcr.microsoft.com/playwright:v1.61.0-noble

WORKDIR /app

COPY package.json ./
COPY package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

COPY server.mjs ./

ENV NODE_ENV=production
ENV PORT=3000
ENV SOCIAL_RENDER_BASE_URL=http://frontend
ENV SOCIAL_ASSETS_DIR=/var/lib/pollitic/social-assets

EXPOSE 3000

CMD ["node", "server.mjs"]
