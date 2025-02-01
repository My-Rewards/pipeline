const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');
const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');

const client = new DynamoDBClient({});
const dynamoDb = DynamoDBDocumentClient.from(client);
const ses = new SESClient({ region: 'us-east-1' }); 

exports.handler = async (event) => {
  const tableName = process.env.TABLE;
  const role = process.env.ROLE;
  const emailSender = process.env.EMAIL_SENDER;

    try {
        const { request: { userAttributes } } = event;
        
        if (!userAttributes.email || !userAttributes.given_name || !userAttributes.family_name || !userAttributes.sub || !role || !tableName) {
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
            role:role,
            newAccount: true,
            preferences:{
                lightMode:true
            },
            accessToken:null,
            refreshToken:null,
            updatedAt:null,
            linked:false,
            orgIds:null
        };

        const params = {
            TableName: tableName,
            Item: userData,
            ConditionExpression: 'attribute_not_exists(id)'
        };

        const emailParams = {
            Source: emailSender,
            Destination: { ToAddresses: [userAttributes.email] },
            Message: {
                Subject: { Data: 'Welcome To MyRewards!' },
                Body: { Text: { Data: 'Setup Your account and link with awuare if you havent! We have a feeling your gonna like it here.' } },
            },
        };

        await dynamoDb.send(new PutCommand(params));

        await ses.send(new SendEmailCommand(emailParams));

        return event;
        
    } catch (error) {
        if (error.name === 'ConditionalCheckFailedException') {
            return event;
        }
        
        console.error('Error saving user to DynamoDB:', error);
        throw error;
    }
};