FROM node:24

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install

COPY data/ ./data/
COPY src/ ./src/

EXPOSE 3000

# AI: Sprint 5 starts Node directly so the custom-service container emits no npm banner lines among its JSON logs.
CMD ["node", "src/index.js"]
