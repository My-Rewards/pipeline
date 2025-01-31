const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({});
const dynamoDb = DynamoDBDocumentClient.from(client);

exports.handler = async (event) => {
  const tableName = process.env.TABLE;
  const role = process.env.ROLE;
  
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

        await dynamoDb.send(new PutCommand(params));
        console.log('Successfully saved user:', userAttributes.sub);
        
        return event;
        
    } catch (error) {
        if (error.name === 'ConditionalCheckFailedException') {
            return event;
        }
        
        console.error('Error saving user to DynamoDB:', error);
        throw error;
    }
};