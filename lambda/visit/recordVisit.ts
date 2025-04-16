import { DynamoDBClient, QueryCommand } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { KMSClient, DecryptCommand } from '@aws-sdk/client-kms';
import { randomUUID } from "crypto";
import { SquareClient, SquareEnvironment } from 'square';
import { SearchOrdersFilter } from 'square/serialization';
import { SearchOrdersSortField, SortOrder } from 'square/api';

const client = new DynamoDBClient({});
const dynamoDb = DynamoDBDocumentClient.from(client);
const kmsClient = new KMSClient({});

exports.handler = async (event: APIGatewayProxyEvent) => {
  const shopsTable = process.env.SHOPS_TABLE;
  const organizationsTable = process.env.ORGANIZATIONS_TABLE;
  const plansTable = process.env.PLANS_TABLE;
  const visitsTable = process.env.VISITS_TABLE;


  console.log('Event:', JSON.stringify(event, null, 2));

  try {
    let requestBody = JSON.parse(event.body || '{}');

    // NOTE: Current implementation does not utilize any information besides timestamp and shopId to match orders with square
    const {userId, shopId, visitDetails} = requestBody;

    if (!userId || !shopId || !visitDetails) {
      console.error('Missing required attributes');
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: 'Missing required attributes: userId, shopId, visitDetails',
        }),
      };
    }


    // Make a request to DynamoDB Shops table to obtain locationID
    let shopsGetParams = {
        TableName: shopsTable,
        Key: {
            shopId
        }
    }

    let shop;

    try {
        const result = await dynamoDb.send(new GetCommand(shopsGetParams));

        if (!result.Item) {
            return {
                statusCode: 404,
                body: JSON.stringify({
                    error: `Shop with id '${shopId}' not found`,
                }),
            };
        }

        shop = result.Item;
        console.log('Obtained shop:', shop); // Debug
    } catch (error) {
        console.error("Error fetching shop:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({
                error: "Failed to fetch shop",
                details: error,
            }),
        };
    }

    // Make a request to DynamoDB Organizations table to obtain square auth token
    let organizationsGetParams = {
        TableName: organizationsTable,
        Key: {
            organizationId: shop.organization_id
        }
    }

    let organization;

    try {
        const result = await dynamoDb.send(new GetCommand(organizationsGetParams));

        if (!result.Item) {
            return {
                statusCode: 404,
                body: JSON.stringify({
                    error: `Organization with id '${shop.organization_id}' not found`,
                }),
            };
        }

        organization = result.Item;
        console.log('Obtained organization:', organization); // Debug
    } catch (error) {
        console.error("Error fetching organization:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({
                error: "Failed to fetch organization",
                details: error,
            }),
        };
    }

    // Once key is obtained from AWS, decrypt using KMS
    let decryptedToken;
    try {
        const decryptParams = {
            CiphertextBlob: Buffer.from(organization.square_oauth_encrypted, 'base64')
        }
        const decryptCommand = new DecryptCommand(decryptParams);
        const decryptResponse = await kmsClient.send(decryptCommand);
        decryptedToken = decryptResponse.Plaintext?.toString();
    } catch (error) {
        console.error("error decrypting organization ", organization.id, "'s square oauth token:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({
                error: "Failed to decrypt token",
                details: error,
            })
        }
    }

    // Send a request to square to get the value of the transaction
    const squareClient = new SquareClient({
        token: decryptedToken,
        environment: SquareEnvironment.Sandbox// Determine if beta or prod
    })

    const searchOrdersRequest = {
        location_ids: [shop.location_id],
        query: {
            sort: {
                sortField: SearchOrdersSortField.CreatedAt,
                sortOrder: SortOrder.Desc
            },
            filter: {
                dateTimeFilter: {
                    createdAt: {
                        endAt: shop.visitDetails.creation_time
                    }
                },
            },
            limit: 1
        }
    };

    const result = await squareClient.orders.search(searchOrdersRequest);

    if (result.errors) {
        console.error('Error from Square:', result.errors);
        return {
            statusCode: 500,
            body: JSON.stringify({
                error: 'Error from Square',
                details: result.errors,
            }),
        };
    }
    if (!result.orders || result.orders.length === 0) {
        return {
            statusCode: 404,
            body: JSON.stringify({
                error: 'No orders found',
            })
        }
    }

    const mostRecentOrder = result.orders[0];

    console.log(mostRecentOrder) // debug

    // Record visit in visit table

    const visitId = randomUUID();
    const visitData = {
      visitId: visitId,
      userId: userId,
      order_id: mostRecentOrder.id,
      organization_id: shop.organization_id,
      visit_timestamp: mostRecentOrder.createdAt,
      total: mostRecentOrder.totalMoney
    };

    let putParams = {
      TableName: visitsTable,
      Item: visitData,
      ConditionExpression: 'attribute_not_exists(visitId)',
    };

    let resp = await dynamoDb.send(new PutCommand(putParams));

    if (!resp || !resp.$metadata || resp.$metadata.httpStatusCode !== 200) {
        return {
            statusCode: 500,
            body: JSON.stringify({
                error: 'Failed to record visit in DynamoDB',
            }),
        };
    }


    // If the visit was successfully recorded, interact with the plans table

    const plansKey = {
        userId: userId,
        organizationId: shop.organization_id,
    };

    let planGetParams = {
        TableName: plansTable,
        Key: plansKey
    };

    try {
        const planResult = await dynamoDb.send(new QueryCommand(planGetParams));

        // If organization has a loyalty reward active:
        if (organization.loyalty_planAvail) {
            
        }

        // Plan does not exist
        if (!planResult.Item) {
            return {
                statusCode: 404,
                body: JSON.stringify({
                    error: `Plan with id '${visitDetails.plan_id}' not found for organization '${shop.organization_id}'`,
                }),
            };
        }

        // If business has a expenditure reward active:

        

        // Plan

        const plan = planResult.Item;
        console.log('Obtained plan:', plan); // Debug

        // Additional logic to interact with the plan can be added here

    } catch (error) {
        console.error("Error fetching plan:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({
                error: "Failed to fetch plan",
                details: error,
            }),
        };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Visit recorded successfully',
        visit: visitData,
      }),
    };
  } catch (error) {
    console.error('Error recording visit:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Could not record visit',
        details: error,
      }),
    };
  }
};