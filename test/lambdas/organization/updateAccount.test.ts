import { APIGatewayProxyEvent } from "aws-lambda";
import { mockClient } from "aws-sdk-client-mock";
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { handler } from "../../../lambda/organization/update/account";

const ddbMock = mockClient(DynamoDBDocumentClient);

describe("updateAccount Lambda Function", () => {
  beforeEach(() => {
    ddbMock.reset();
    process.env.USER_TABLE = "test-user-table";
  });

  const createMockEvent = (
    body: any,
    userSub: string | null = "user-123"
  ): APIGatewayProxyEvent => {
    return {
      requestContext: {
        authorizer: {
          claims: { sub: userSub },
        },
      },
      body: JSON.stringify(body),
      headers: {},
      multiValueHeaders: {},
      httpMethod: "POST",
      isBase64Encoded: false,
      path: "/update-account",
      pathParameters: null,
      queryStringParameters: null,
      multiValueQueryStringParameters: null,
      stageVariables: null,
      resource: "",
    } as unknown as APIGatewayProxyEvent;
  };

  test("returns 400 if user id is missing", async () => {
    const event = createMockEvent({ name: "New Name", email: "new@example.com" }, null);
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.error).toContain("Missing user id");
  });

  test("returns 500 if USER_TABLE env variable is missing", async () => {
    delete process.env.USER_TABLE;
    const event = createMockEvent({ name: "New Name", email: "new@example.com" });
    const result = await handler(event);
    expect(result.statusCode).toBe(500);
    const body = JSON.parse(result.body);
    expect(body.error).toContain("User table not configured");
    process.env.USER_TABLE = "test-user-table";
  });

  test("returns 400 if request body is missing", async () => {
    const event = createMockEvent(null);
    event.body = null;
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.error).toContain("Missing request body");
  });

  test("returns 400 if name or email is missing in request body", async () => {
    const event = createMockEvent({ name: "New Name" });
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    const body = JSON.parse(result.body);
    expect(body.error).toContain("Missing name or email");
  });

  test("returns 200 with updated attributes on successful update", async () => {
    const event = createMockEvent({ name: "New Name", email: "new@example.com" });
    // Simulate a successful update by resolving UpdateCommand with Attributes
    ddbMock.on(UpdateCommand).resolves({
      Attributes: { fullName: "New Name", email: "new@example.com", updated_at: "2025-01-01T00:00:00Z" },
    });
    const result = await handler(event);
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.message).toContain("Account updated successfully");
    expect(body.updatedAttributes).toHaveProperty("fullName", "New Name");
    expect(body.updatedAttributes).toHaveProperty("email", "new@example.com");
  });

  test("returns 500 if DynamoDB update fails", async () => {
    const event = createMockEvent({ name: "New Name", email: "new@example.com" });
    // Force an error from the UpdateCommand
    ddbMock.on(UpdateCommand).rejects(new Error("DynamoDB error"));
    const result = await handler(event);
    expect(result.statusCode).toBe(500);
    const body = JSON.parse(result.body);
    expect(body.error).toContain("Could not update account");
    expect(body.details).toContain("DynamoDB error");
  });
});
