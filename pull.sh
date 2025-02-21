#!/bin/bash

set -o allexport
source .env
set +o allexport

ECR_URL="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPO_NAME}"

aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $ECR_URL

docker pull $ECR_URL:latest

docker stop my-cdk-container || true
docker rm my-cdk-container || true

docker run -d --name my-cdk-container -v $(pwd):/app $ECR_URL:latest

echo "Container started successfully from $ECR_URL:latest"

