#!/bin/bash

set -o allexport
source .env
set +o allexport

ECR_URL="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPO_NAME}"

aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $ECR_URL

docker build -t $ECR_REPO_NAME .

docker tag $ECR_REPO_NAME:latest $ECR_URL:latest
docker push $ECR_URL:latest

echo "Image pushed successfully to $ECR_URL:latest"

