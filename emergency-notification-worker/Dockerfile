# AI: This file was generated with AI assistance. See AI-DISCLOSURE.md and ai/chats/2026-08-06-201302-austinf-sprint4-rabbitmq.jsonl.
FROM node:24

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci --omit=dev

COPY src/ ./src/

EXPOSE 3000

# AI: Sprint 5 starts Node directly so the custom-service container emits no npm banner lines among its JSON logs.
CMD ["node", "src/index.js"]
# AI: End AI-assisted file. See AI-DISCLOSURE.md and ai/chats/2026-08-06-201302-austinf-sprint4-rabbitmq.jsonl.
