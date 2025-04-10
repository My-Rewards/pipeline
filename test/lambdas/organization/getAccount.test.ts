import { APIGatewayProxyEvent } from "aws-lambda";
import { mockClient } from "aws-sdk-client-mock";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";
import { handler } from "../../../lambda/organization/getAccount";

const ddbMock = mockClient(DynamoDBDocumentClient);

describe("getAccount Lambda Function", () => {
  beforeEach(() => {
    ddbMock.reset();
    process.env.USER_TABLE = "test-user-table";
    process.env.ORG_TABLE = "test-org-table";
    process.env.SHOP_TABLE = "test-shop-table";
  });

  const createMockEvent = (userSub: string | null = "user-123"): APIGatewayProxyEvent => {
    return {
      requestContext: {
        authorizer: {
          claims: { sub: userSub }
        },
      },
      body: "",
      headers: {},
      multiValueHeaders: {},
      httpMethod: "GET",
      isBase64Encoded: false,
      path: "/",
      pathParameters: null,
      queryStringParameters: null,
      multiValueQueryStringParameters: null,
      stageVariables: null,
      resource: ""
    } as unknown as APIGatewayProxyEvent;
  };

  test("returns 500 if any required env variable is missing", async () => {
    delete process.env.USER_TABLE;
    let event = createMockEvent("user-123");
    let result = await handler(event);
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).error).toContain("No Org/Shop/User Table");
    process.env.USER_TABLE = "test-user-table";


    delete process.env.ORG_TABLE;
    result = await handler(event);
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).error).toContain("No Org/Shop/User Table");
    process.env.ORG_TABLE = "test-org-table";

    
    delete process.env.SHOP_TABLE;
    result = await handler(event);
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).error).toContain("No Org/Shop/User Table");
    process.env.SHOP_TABLE = "test-shop-table";
  });

  test("returns 500 if userSub is missing", async () => {
    const event = createMockEvent(null);
    const result = await handler(event);
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).error).toContain("no userID supplied");
  });

  test("returns 210 if user is not found", async () => {
    const event = createMockEvent("user-123");
    ddbMock.on(GetCommand, {
      TableName: "test-user-table",
      Key: { id: "user-123" }
    }).resolves({ Item: undefined });
    const result = await handler(event);
    expect(result.statusCode).toBe(210);
    expect(JSON.parse(result.body).info).toContain("User not found");
  });

  test("returns 404 if user exists but missing orgId", async () => {
    const event = createMockEvent("user-123");
    ddbMock.on(GetCommand, {
      TableName: "test-user-table",
      Key: { id: "user-123" }
    }).resolves({ Item: { fullName: "Test User", email: "test@example.com" } });
    const result = await handler(event);
    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body).info).toContain("User not found");
  });

  test("returns 210 if organization not found", async () => {
    const event = createMockEvent("user-123");
    // Simulate user found with orgId
    ddbMock.on(GetCommand, {
      TableName: "test-user-table",
      Key: { id: "user-123" }
    }).resolves({
      Item: {
        orgId: "org-123",
        fullName: "Test User",
        email: "test@example.com",
        preferences: {},
        date_created: "2023-01-01"
      }
    });
    // Simulate no organization returned
    ddbMock.on(GetCommand, {
      TableName: "test-org-table",
      Key: { id: "org-123" }
    }).resolves({ Item: undefined });
    const result = await handler(event);
    expect(result.statusCode).toBe(210);
    expect(JSON.parse(result.body).info).toContain("Organization not found");
  });

  test("returns 211 if organization not linked", async () => {
    const event = createMockEvent("user-123");
    // Simulate user found with orgId
    ddbMock.on(GetCommand, {
      TableName: "test-user-table",
      Key: { id: "user-123" }
    }).resolves({
      Item: {
        orgId: "org-123",
        fullName: "Test User",
        email: "test@example.com",
        preferences: {},
        date_created: "2023-01-01"
      }
    });
    // Simulate organization found but not linked
    ddbMock.on(GetCommand, {
      TableName: "test-org-table",
      Key: { id: "org-123" }
    }).resolves({
      Item: { name: "Test Org", linked: false }
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(211);
    expect(JSON.parse(result.body).info).toContain("Organization not Linked");
  });

  test("returns 200 with organization and user data on success", async () => {
    const event = createMockEvent("user-123");
    // Simulate user found with orgId and details
    ddbMock.on(GetCommand, {
      TableName: "test-user-table",
      Key: { id: "user-123" }
    }).resolves({
      Item: {
        orgId: "org-123",
        fullName: "Test User",
        email: "test@example.com",
        preferences: { theme: "dark" },
        date_created: "2023-01-01"
      }
    });
    // Simulate organization found and linked with image data
    ddbMock.on(GetCommand, {
      TableName: "test-org-table",
      Key: { id: "org-123" }
    }).resolves({
      Item: {
        name: "Test Org",
        linked: true,
        owner_id: "user-123",
        images: { logo: { url: "test.com/logo" } }
      }
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.organization).toBeDefined();
    expect(body.organization.name).toBe("Test Org");
    expect(body.organization.images.logo).toBe("test.com/logo");
    expect(body.user.fullName).toBe("Test User");
    expect(body.user.email).toBe("test@example.com");
  });

  test("returns 500 when an error occurs", async () => {
    const event = createMockEvent("user-123");
    ddbMock.on(GetCommand).rejects(new Error("Database error"));
    const result = await handler(event);
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).error).toBeDefined();
  });
});
