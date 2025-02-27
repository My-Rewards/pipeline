import { handler } from '../../../lambda/organization/getOrg';
import { APIGatewayProxyEvent } from "aws-lambda";
import {DynamoDBDocumentClient, GetCommand, GetCommandOutput, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { mockClient } from "aws-sdk-client-mock";

const mockQuery_linked: GetCommandOutput = {
    $metadata: {},
    Item:
      {
        id: "test-org-id",
        owner_id: "mock-owner-id",
        stripe_id: "stripe-id",
        accessToken: true,
        refreshToken: true,
        updatedAt: true,
        expiresAt: true,
        square_merchant_id: true,
        date_registered: new Date().toISOString(),
        lastUpdate: new Date().toISOString(),
        rewards_loyalty: true,
        rewards_milestone: true,
        payment_setup: false,
        members: ["mock-member-id"],
        org_name: "mock-org-name",
        description: "mock description",
        rl_active: false,
        rm_active: false,
        linked: true
      },
  };

const mockQuery_not_linked: GetCommandOutput = {
    $metadata: {},
    Item:{
      id: "test-org-id",
      owner_id: "mock-owner-id",
      stripe_id: "stripe-id",
      accessToken: true,
      refreshToken: true,
      updatedAt: true,
      expiresAt: true,
      square_merchant_id: true,
      date_registered: new Date().toISOString(),
      lastUpdate: new Date().toISOString(),
      rewards_loyalty: true,
      rewards_milestone: true,
      payment_setup: false,
      members: ["mock-member-id"],
      org_name: "mock-org-name",
      description: "mock description",
      rl_active: false,
      rm_active: false,
      linked: false ,
    },
  };

const mockAPIEvent={
  body: null, 
  headers: {},
  multiValueHeaders: {},
  httpMethod: "GET",
  isBase64Encoded: false,
  path: "/orgs/details",
  pathParameters: null,
  stageVariables: null,
  requestContext: {} as any,
  resource: "/orgs/details",
  multiValueQueryStringParameters: null,
}

describe("Lambda Handler", () => {
    const ddbMock = mockClient(DynamoDBDocumentClient);
    process.env.ORG_TABLE = "test-table";
    process.env.SHOP_TABLE = "shop-table";

    beforeEach(() => {
      ddbMock.reset();
    });

    test("should return 404 if user_id is missing", async () => {
      const event: APIGatewayProxyEvent = {
        queryStringParameters: {},
        ...mockAPIEvent
      };

      const response = await handler(event);
        expect(response.statusCode).toBe(404);
        expect(JSON.parse(response.body)).toEqual({ error: "no userID supplied" });
    });

    test("should return 210 if no organization is found", async () => {
      ddbMock.on(GetCommand).resolvesOnce({Item:{org_id:'test-org-id'}}).resolvesOnce({Item:undefined});
      ddbMock.on(QueryCommand).resolvesOnce({Items:[]})

      const event: APIGatewayProxyEvent = {
        queryStringParameters: { userSub: "mock-member-id" },
        ...mockAPIEvent
      };
      
      const response = await handler(event);
      expect(response.statusCode).toBe(210);
      expect(JSON.parse(response.body)).toEqual({ info: "Organization not found" });
    });

    test("should return 211 if organization is not linked", async () => {
      ddbMock.on(GetCommand).resolvesOnce({Item:{org_id:'test-org-id'}}).resolvesOnce(mockQuery_not_linked);
      ddbMock.on(QueryCommand).resolvesOnce({Items:[]})

      const event: APIGatewayProxyEvent = {
        queryStringParameters: { userSub: "mock-owner-id" },
        ...mockAPIEvent
      };
      const response = await handler(event);
      
      expect(response.statusCode).toBe(211);
    });

    test("should return 200 with organization and role 'owner' when user is the owner", async () => {
      ddbMock.on(GetCommand).resolvesOnce({Item:{org_id:'test-org-id'}}).resolvesOnce(mockQuery_linked);
      ddbMock.on(QueryCommand).resolvesOnce({Items:[]})

      const event: APIGatewayProxyEvent = {
        queryStringParameters: { userSub: "mock-member-id" },
        ...mockAPIEvent
      };
      const response = await handler(event);
      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.organization.admin).toBe(false);
    });

    test("should return 200 with organization and role 'owner' when user is not the owner", async () => {
      ddbMock.on(GetCommand).resolvesOnce({Item:{org_id:'test-org-id'}}).resolvesOnce(mockQuery_linked);
      ddbMock.on(QueryCommand).resolvesOnce({Items:[]})

      const event: APIGatewayProxyEvent = {
        queryStringParameters: { userSub: "mock-owner-id" },
        ...mockAPIEvent
      };

      const response = await handler(event);
      
      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.organization.admin).toBe(true);
    });

    test("should return 200 with organization and role 'member' when user is not the owner", async () => {
        ddbMock.on(GetCommand).resolvesOnce({Item:{org_id:'test-org-id'}}).resolvesOnce(mockQuery_linked);
        ddbMock.on(QueryCommand).resolves({Items:[]})

        const event: APIGatewayProxyEvent = {
          queryStringParameters: { userSub: "mock-member-id" },
          ...mockAPIEvent
        };
        const response = await handler(event);
        
        expect(response.statusCode).toBe(200);

        const body = JSON.parse(response.body);
        expect(body.organization.admin).toBe(false);
    });
});
