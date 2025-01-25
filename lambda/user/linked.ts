import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {DynamoDBDocumentClient} from '@aws-sdk/lib-dynamodb'
import { CognitoIdentityProviderClient, AdminUpdateUserAttributesCommand, AdminUpdateUserAttributesCommandInput } from "@aws-sdk/client-cognito-identity-provider"; 
import { APIGatewayProxyEvent } from "aws-lambda";
import { error } from 'console';

const client = new DynamoDBClient({});
const dynamoDb = DynamoDBDocumentClient.from(client);
const cognitoClient = new CognitoIdentityProviderClient({});

exports.handler = async (event:APIGatewayProxyEvent) => {
    if(!event.body){
        throw(error('Body not given'))
    }

    const { userSub } = JSON.parse(event.body);

    const tableName = process.env.USERS_TABLE;
    const userPoolId = process.env.USERPOOL_ID;

    try{
        const updateUserAttributesParams:AdminUpdateUserAttributesCommandInput = {
            UserPoolId: userPoolId,
            Username: userSub,
            UserAttributes: [
                {
                    Name: 'custom:linked',
                    Value: '1'
                }
            ]
        };
    
        await cognitoClient.send(new AdminUpdateUserAttributesCommand(updateUserAttributesParams));
    
        return {
            statusCode: 200,
            body: JSON.stringify({
                message: "User link status updated successfully",
            }),
        };

    }
    catch (error) {
        console.error("Error fetching user:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({
                error: "Could not fetch user",
                details: error,
            }),
        };
    }
};
