import { handler } from "../../../lambda/likes/setLike";
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { mockClient } from "aws-sdk-client-mock";
import { APIGatewayProxyEvent } from "aws-lambda";

const ddbMock = mockClient(DynamoDBDocumentClient);

describe("Lambda Handler", () => {
  const envBackup = { ...process.env };

  beforeEach(() => {
    process.env.PLANS_TABLE = "TestLikesTable";
    ddbMock.reset();
  });

  afterEach(() => {
    process.env = { ...envBackup };
    jest.clearAllMocks();
  });

  const buildEvent = (params: { shop_id?: string; userSub?: string } = {}): APIGatewayProxyEvent => ({
    pathParameters: params.shop_id ? { shop_id: params.shop_id } : null,
    requestContext: {
      authorizer: {
        claims: { sub: params.userSub || undefined }
      }
    }
  } as any);

  test("returns error when missing shop_id", async () => {
    const event = buildEvent({ userSub: "user123" });
    const response = await handler(event);
    expect(response.statusCode).toBe(404);
    expect(JSON.parse(response.body).error).toEqual("Missing [shop_id] path parameter");
  });

  test("returns error when PLANS_TABLE is missing", async () => {
    delete process.env.PLANS_TABLE;
    const event = buildEvent({ shop_id: "shop1", userSub: "user123" });
    const response = await handler(event);
    expect(response.statusCode).toBe(500);
    expect(JSON.parse(response.body).error).toEqual("Missing Shop Table Info");
  });

  test("returns error when user id is missing", async () => {
    const event = buildEvent({ shop_id: "shop1" });
    const response = await handler(event);
    expect(response.statusCode).toBe(404);
    expect(JSON.parse(response.body).error).toEqual("Missing User ID");
  });

  test("updates like status to liked when record not exists", async () => {
    ddbMock
      .on(GetCommand)
      .resolves({ Item: undefined })
      .on(UpdateCommand)
      .resolves({ Attributes: { favorite: true } });

    const event = buildEvent({ shop_id: "shop1", userSub: "user123" });

    const response = await handler(event);
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.message).toEqual("Shop liked successfully");
    expect(body.favorite).toEqual(true);
  });

  test("updates like status to unliked when record exists and is currently liked", async () => {
    ddbMock
      .on(GetCommand)
      .resolves({ Item: { favorite: true } })
      .on(UpdateCommand)
      .resolves({ Attributes: { favorite: false } });

    const event = buildEvent({ shop_id: "shop1", userSub: "user123" });

    const response = await handler(event);
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.message).toEqual("Shop unliked successfully");
    expect(body.favorite).toEqual(false);
  });
});