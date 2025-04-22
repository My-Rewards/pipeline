import { handler } from "@/lambda/shop/getShopApp";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";
import { APIGatewayProxyEvent } from "aws-lambda";
import { mockClient } from "aws-sdk-client-mock";

const ddbMock = mockClient(DynamoDBDocumentClient);

describe("Lambda Handler - Merging shop/org/likes", () => {
  const envBackup = { ...process.env };

  beforeEach(() => {
    process.env.SHOP_TABLE = "TestShopTable";
    process.env.ORG_TABLE = "TestOrgTable";
    process.env.LIKES_TABLE = "TestLikesTable";
  });

  afterEach(() => {
      ddbMock.reset();
  });

  const buildEvent = ({ 
    shop_id,
    userSub
  }: {
      shop_id?: string;
    userSub?: string; 
  } = {}): APIGatewayProxyEvent => ({
      queryStringParameters: shop_id ? { shop_id: shop_id } : {},
      requestContext: {
          authorizer: {
            claims: { sub: userSub || null }
          },
          accountId: "",
          apiId: "",
          protocol: "",
          httpMethod: "",
          identity: {
            accessKey: null,
            accountId: null,
            apiKey: null,
            apiKeyId: null,
            caller: null,
            clientCert: null,
            cognitoAuthenticationProvider: null,
            cognitoAuthenticationType: null,
            cognitoIdentityId: null,
            cognitoIdentityPoolId: null,
            principalOrgId: null,
            sourceIp: "",
            user: null,
            userAgent: null,
            userArn: null
          },
          path: "",
          stage: "",
          requestId: "",
          requestTimeEpoch: 0,
          resourceId: "",
          resourcePath: ""
      },
      body: null,
      headers: {},
      multiValueHeaders: {},
      httpMethod: "GET",
      isBase64Encoded: false,
      path: "/",
      pathParameters: null,
      stageVariables: null,
      resource: "/",
      multiValueQueryStringParameters: null
  });

  test("returns 500 if environment variables are missing", async () => {
    delete process.env.SHOP_TABLE;
    const event = buildEvent({
        shop_id: "shop1",
        userSub: "user123" 
    });
    const response = await handler(event);
    expect(response.statusCode).toBe(500);
    const body = JSON.parse(response.body);
    expect(body.error).toEqual("Missing env values");
  });

  test("returns 404 if userSub is missing", async () => {
    const event = buildEvent({ shop_id: "shop1" });
    const response = await handler(event);
    expect(response.statusCode).toBe(404);
    expect(JSON.parse(response.body).error).toEqual("Missing userSub");
  });

  test("returns 404 if shop_id is missing", async () => {
    const event = buildEvent({ userSub: "user123" });
    const response = await handler(event);
    expect(response.statusCode).toBe(404);
    expect(JSON.parse(response.body).error).toEqual("Missing [shop_id] parameter");
  });

  test("returns 404 if shop not found", async () => {
    ddbMock
    .on(GetCommand)
    .resolvesOnce({ Item: undefined });
    const event = buildEvent({
        shop_id: "shop1",
        userSub: "user123" 
    });

    const response = await handler(event);
    expect(response.statusCode).toBe(404);
    expect(JSON.parse(response.body).error).toEqual("Shop not found");
  });

  test("returns 404 if organization not found", async () => {
    ddbMock
    .on(GetCommand)
    .resolvesOnce({
      Item: {
        id: "shop1",
        org_id: "org1",
        latitude: 29.65,
        longitude: -82.33,
        location: { city: "Gainesville", state: "FL" },
        shop_hours: [{ day: "Monday", open: "08:00", close: "20:00" }],
        menu: "https://mock-menu-link.com",
        phoneNumber: "1234567890"
      }
    })
    .resolvesOnce({ Item: undefined });
    
    const event = buildEvent({
        shop_id: "shop1",
        userSub: "user123" 
    });
    const response = await handler(event);
    expect(response.statusCode).toBe(404);
    expect(JSON.parse(response.body).error).toEqual("Organization not found");
  });

  test("returns 200 and final shop with correct favorite status when like record exists", async () => {
    ddbMock
    .on(GetCommand)
    .resolvesOnce({
      Item: {
        id: "shop1",
        org_id: "org1",
        latitude: 29.65,
        longitude: -82.33,
        location: { city: "Gainesville", state: "FL" },
        shop_hours: [{ day: "Monday", open: "08:00", close: "20:00" }],
        menu: "https://mock-menu-link.com",
        phoneNumber: "1234567890"
      }
    })
    .resolvesOnce({
      Item: {
        id: "org1",
        name: "MockOrg",
        description: "Organization Description",
        images: {
          banner: { url: "https://example.com/banner.jpg" },
          logo: { url: "https://example.com/logo.jpg" }
        }
      }
    })
    .resolvesOnce({
      Item: { favorite: true }
    });

    const event = buildEvent({
        shop_id: "shop1",
        userSub: "user123" 
    });
    const response = await handler(event);
    expect(response.statusCode).toBe(200);
    const finalShop = JSON.parse(response.body);
    expect(finalShop.org_id).toEqual("org1");
    expect(finalShop.name).toEqual("MockOrg");
    expect(finalShop.banner).toEqual("https://example.com/banner.jpg");
    expect(finalShop.favorite).toEqual(false);
  });  test("returns 200 and final shop with favorite false when like record missing", async () => {

        ddbMock.on(GetCommand, {
            TableName: 'TestShopTable',
            Key: { id: 'shop1' },
        }).resolvesOnce({
            Item: {
                id: "shop1",
                org_id: "org1",
                latitude: 29.65,
                longitude: -82.33,
                location: { city: "Gainesville", state: "FL" },
                shop_hours: [{ day: "Monday", open: "08:00", close: "20:00" }],
                menu: "https://mock-menu-link.com",
                phoneNumber: "1234567890"
            }
        })

        ddbMock.on(GetCommand, {
            TableName: 'TestOrgTable',
            Key: { id: 'org1' },
            ProjectionExpression: "id, #org_name, description, images",
            ExpressionAttributeNames: { "#org_name": "name" }
        }).resolvesOnce({
                Item: {
                    id: "org1",
                    name: "MockOrg",
                    description: "Organization Description",
                    images: {
                        banner: { url: "https://example.com/banner.jpg" },
                        logo: { url: "https://example.com/logo.jpg" }
                    }
                }
            })


        const event = buildEvent({
            shop_id: "shop1",
            userSub: "user123"
        });
        const response = await handler(event);
        expect(response.statusCode).toBe(200);

        const finalShop = JSON.parse(response.body);
        expect(finalShop.org_id).toEqual("org1");
        expect(finalShop.name).toEqual("MockOrg");
        expect(finalShop.banner).toEqual("https://example.com/banner.jpg");
        expect(finalShop.favorite).toEqual(false);
    });

});