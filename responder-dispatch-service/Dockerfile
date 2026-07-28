FROM node:24

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install

COPY data/ ./data/
COPY src/ ./src/

EXPOSE 3000

CMD ["npm", "start"]
