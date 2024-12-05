const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { GetCommand, DynamoDBDocumentClient } = require("@aws-sdk/lib-dynamodb");

const client = new DynamoDBClient({});
const dynamoDb = DynamoDBDocumentClient.from(client);

exports.handler = async (event) => {
    const tableName = process.env.USERS_TABLE;
    const { id, email, role, birthday, preferences } = JSON.parse(event.body);

    if (!id || !email || !role || !birthday) {
        return {
            statusCode: 400,
            body: JSON.stringify({
                error: "Missing required fields: id, username, role, birthday",
            }),
        };
    }

    const params = {
        TableName: tableName,
        Item: {
            id,
            email,
            role: role || "customer",
            birthday,
            preferences: preferences || {},
            date_registered: new Date().toISOString(),
            newAccount: true,
        },
    };

    try {
        await dynamoDb.send(new PutCommand(params));
        return {
            statusCode: 200,
            body: JSON.stringify({ message: "User added successfully!" }),
        };
    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error }),
        };
    }
};
