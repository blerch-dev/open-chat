FROM node:14.17.3-alpine3.14

WORKDIR /usr/src/app

COPY ./package.json ./src ./public ./scripts
RUN npm install

CMD ["npm","run","build"]
CMD ["npm","start"]