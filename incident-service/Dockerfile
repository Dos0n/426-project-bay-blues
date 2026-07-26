# AI: This file was generated with AI assistance. See AI-DISCLOSURE.md and ai/chats/austinf-sprint2/austinf-sprint2.jsonl.
FROM node:24

WORKDIR /usr/src/app

# AI: The dependency-first copy order and npm installation follow the course Docker layer-caching pattern.
COPY package*.json ./
RUN npm install

# AI: The runtime source and read-only simulated fixture are packaged into the service image.
COPY data/ ./data/
COPY src/ ./src/

EXPOSE 3000

CMD ["npm", "start"]
# AI: End AI-assisted file. See AI-DISCLOSURE.md and ai/chats/austinf-sprint2/austinf-sprint2.jsonl.
