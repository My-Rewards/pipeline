import {
  DynamoDBClient,
  QueryCommandInput,
  ScanCommand,
} from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import {STATUS_CODE} from "../../global/statusCodes";

const dynamoClient = new DynamoDBClient({});
const dynamoDb = DynamoDBDocumentClient.from(dynamoClient);

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    const userSub = event.requestContext.authorizer?.claims?.sub;
    const orgTable = process.env.ORG_TABLE;
    const userTable = process.env.USER_TABLE;

    if (!userTable || !orgTable) {
      return {
        statusCode: STATUS_CODE.Error,
        body: JSON.stringify({ error: "No Org/Shop/User Table" }),
      };
    }

    if (!userSub) {
      return {
        statusCode: STATUS_CODE.Error,
        body: JSON.stringify({ error: "no userID supplied" }),
      };
    }

    const getUser = new GetCommand({
      TableName: userTable,
      Key: { id: userSub },
    });

    const user = await dynamoDb.send(getUser);

    if (!user.Item) {
      return {
        statusCode: STATUS_CODE.MissingUser,
        body: JSON.stringify({ info: "User not found" }),
      };
    }

    const orgId = user.Item ? user.Item.org_id : null;

    if (!orgId) {
      return {
        statusCode: STATUS_CODE.NotFound,
        body: JSON.stringify({ info: "User not found" }),
      };
    }

    const getOrg = new GetCommand({
      TableName: orgTable,
      Key: { id: orgId },
    });

    const org = await dynamoDb.send(getOrg);

    if (!org.Item) {
      return {
        statusCode: STATUS_CODE.NotFound,
        body: JSON.stringify({ info: "Organization not found" }),
      };
    }

    if (!org.Item.linked) {
      return {
        statusCode: STATUS_CODE.OrgNotLinked,
        body: JSON.stringify({ info: "Organization not Linked" }),
      };
    }

    const admin = org.Item.owner_id === userSub;

    return {
      statusCode: 200,
      body: JSON.stringify({
        organization: {
          name: org.Item.name,
          images: {
            logo: org.Item.images.logo.url,
          },
        },
        user: {
          fullname: user.Item.fullname,
          email: user.Item.email,
          preferences: user.Item.preferences,
          date_created: user.Item.date_created,
        },
      }),
    };
  } catch (error) {
    console.error("Error fetching organization:", error);
    return { statusCode: 500, body: JSON.stringify({ error }) };
  }
};
