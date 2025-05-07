import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import { APIGatewayProxyEvent } from "aws-lambda";
import {STATUS_CODE} from "../../global/statusCodes";

const client = new DynamoDBClient({});
const dynamoDb = DynamoDBDocumentClient.from(client);

export const handler = async (event: APIGatewayProxyEvent) => {
    const likesTable = process.env.PLANS_TABLE;
    const userId = event.requestContext.authorizer?.claims.sub;
    const { shop_id } = event.pathParameters || {};

    switch (true) {
        case !likesTable:
            return { statusCode: STATUS_CODE.MissingData, body: JSON.stringify({ error: "Missing Shop Table Info" }) };
        case !userId:
            return { statusCode: STATUS_CODE.MissingData, body: JSON.stringify({ error: "Missing User ID" }) };
        case !shop_id:
            return { statusCode: STATUS_CODE.MissingParam, body: JSON.stringify({ error: "Missing [shop_id] path parameter" }) };
    }

    try {
        const getParams = new GetCommand({
            TableName: likesTable,
            Key: {
                PK: `USER#${userId}`,
                SK: `SHOP#${shop_id}`
            }
        });

        const { Item } = await dynamoDb.send(getParams);
        
        const newFavoriteValue = Item ? !(Item.favorite) : true;

        const updateParams = new UpdateCommand({
            TableName: likesTable,
            Key: {
                PK: `USER#${userId}`,
                SK: `SHOP#${shop_id}`
            },
            UpdateExpression: 'SET favorite = :liked, updated_at = if_not_exists(createdAt, :now)',
            ExpressionAttributeValues: {
                ':liked': newFavoriteValue,
                ':now': new Date().toISOString()
            },
            ReturnValues: 'ALL_NEW'
        });

        const { Attributes } = await dynamoDb.send(updateParams);

        return {
            statusCode: STATUS_CODE.Success,
            body: JSON.stringify({
                message: `Shop ${newFavoriteValue ? 'liked' : 'unliked'} successfully`,
                favorite: Attributes?.favorite
            })
        };

    } catch (error) {
        console.error('Error:', error);
        return {
            statusCode: STATUS_CODE.Error,
            body: JSON.stringify({ error: "Could not update like status" })
        };
    }
};