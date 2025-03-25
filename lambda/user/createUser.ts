import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { PostConfirmationTriggerEvent } from 'aws-lambda';
import { readFileSync } from 'fs';
import { join } from 'path';

const client = new DynamoDBClient({});
const dynamoDb = DynamoDBDocumentClient.from(client);
const ses = new SESClient({ region: 'us-east-1' });

export const handler = async (event:PostConfirmationTriggerEvent) => {
  const tableName = process.env.TABLE;
  const emailSender = process.env.EMAIL_SENDER;

    try {
        const { request: { userAttributes } } = event;
        let credentials = {
            modifyPlans:true,
            modifyPayments:true,
        };

        if (!userAttributes.email || !userAttributes.given_name || !userAttributes.family_name || !userAttributes.sub || !tableName) {
        console.error('Missing required attributes');
        throw new Error('Missing required attributes');
        }

        // look for invites

        const userData = {
            id: userAttributes.sub,
            email: userAttributes.email,
            birthdate: userAttributes.birthdate ? new Date(userAttributes.birthdate).toISOString() : null,
            fullname: {
                firstName: userAttributes.given_name,
                lastName: userAttributes.family_name
            },
            date_created: new Date().toISOString(),
            credentials,
            newAccount: true,
            preferences:{
                lightMode:true
            }
        };

        const params = {
            TableName: tableName,
            Item: userData,
            ConditionExpression: 'attribute_not_exists(id)'
        };

        await dynamoDb.send(new PutCommand(params));

        const emailHtmlContent = readFileSync(join(__dirname, '../../EmailTemplate/welcome-email-customer.html'),'utf8');

        const emailParams = {
            Source: `MyRewards <${emailSender}>`,
            Destination: { ToAddresses: [userAttributes.email] },
            Message: {
                Subject: { Data: 'Welcome To MyRewards!' },
                Body: {
                    Html: { Data: emailHtmlContent },
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