FROM amazon/aws-cli:latest

RUN npm install -g aws-cdk

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm install

COPY . . 

ENTRYPOINT ["cdk"]