import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { PostConfirmationTriggerEvent } from 'aws-lambda';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { readFileSync } from 'fs';
import { join } from 'path';

const client = new DynamoDBClient({});
const ses = new SESClient({ region: 'us-east-1' });
const dynamoDb = DynamoDBDocumentClient.from(client);

export const handler = async (event: PostConfirmationTriggerEvent) => {
  const tableName = process.env.TABLE;
  const emailSender = process.env.EMAIL_SENDER;
  const email = process.env.EMAIL;

  try {
    const { request: { userAttributes } } = event;

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
      preferences: {
        lightMode: true
      },
      permissions: {
        modifyOrg: true,
        modifyBilling: true,
        modifyShops: true,
      },
    };

    const params = new PutCommand({
      TableName: tableName,
      Item: userData,
      ConditionExpression: 'attribute_not_exists(id)'
    });

    await dynamoDb.send(params);

    const emailParams = {
      Source: `MyRewards <${emailSender}>`,
      Destination: { ToAddresses: [userAttributes.email] },
      Message: {
        Subject: { Data: 'Welcome To MyRewards!' },
        Body: {
          Html: { Data: email },
          Text: { Data: 'Setup your account and link with Square if you haven’t! We have a feeling you’re going to like it here.' },
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
