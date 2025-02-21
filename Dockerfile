FROM node:20-alpine

WORKDIR /app

RUN npm install -g aws-cdk typescript

COPY package*.json ./

RUN npm ci

COPY . .

CMD ["tail", "-f", "/dev/null"]
