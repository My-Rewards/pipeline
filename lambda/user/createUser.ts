import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { PostConfirmationTriggerEvent } from 'aws-lambda';

const client = new DynamoDBClient({});
const dynamoDb = DynamoDBDocumentClient.from(client);
const ses = new SESClient({ region: 'us-east-1' });

export const handler = async (event:PostConfirmationTriggerEvent) => {
  const tableName = process.env.TABLE;
  const emailSender = process.env.EMAIL_SENDER;
  const email = process.env.EMAIL;

    try {
        const { request: { userAttributes } } = event;

        const getUserParams = {
            TableName: tableName,
            Key: { id: userAttributes.sub },
        };
        const existingUser = await dynamoDb.send(new GetCommand(getUserParams));

        if (existingUser.Item) {
            console.log('User already exists');
            return event;
        }

        if (!userAttributes.email || !userAttributes.given_name || !userAttributes.family_name || !userAttributes.sub || !tableName) {
            console.error('Missing required attributes');
            throw new Error('Missing required attributes');
        }

        const userData = {
            id: userAttributes.sub,
            email: userAttributes.email,
            birthdate: userAttributes.birthdate ? new Date(userAttributes.birthdate).toISOString() : null,
            fullname: {
                firstName: userAttributes.given_name,
                lastName: userAttributes.family_name
            },
            date_created: new Date().toISOString(),
            newAccount: true,
            preferences:{
                lightMode:true
            }
        };

        const params = new PutCommand({
            TableName: tableName,
            Item: userData,
            ConditionExpression: 'attribute_not_exists(id)'
        });

        try {
            await dynamoDb.send(params);
        } catch (error: any) {
            if (error.name === 'ConditionalCheckFailedException') {
                console.log('PutCommand failed: user already exists. Skipping insert.');
                return event;
            }
            throw error;
        }

        const emailParams = {
            Source: `MyRewards <${emailSender}>`,
            Destination: { ToAddresses: [userAttributes.email] },
            Message: {
                Subject: { Data: 'Welcome To MyRewards!' },
                Body: {
                    Html: { Data: email },
                    Text: { Data: 'Welcome to MyRewards' },
                },
            },
        };

        await ses.send(new SendEmailCommand(emailParams));

        return event;

    } catch (error) {
        console.error('Error creating User:', error);
        throw error;
    }
};