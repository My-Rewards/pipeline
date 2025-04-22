import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";
import { mockClient } from "aws-sdk-client-mock";
import { APIGatewayProxyEvent } from "aws-lambda";
import { handler } from "@/lambda/user/Plans/getPlan";

const ddbMock = mockClient(DynamoDBDocumentClient);

const originalEnv = process.env;

describe('getPlan Lambda Handler', () => {
  const createMockEvent = (queryStringParameters: Record<string, string> = {}, userSub?: string): APIGatewayProxyEvent => {
    return {
      queryStringParameters,
      requestContext: {
        authorizer: userSub ? {
          claims: {
            sub: userSub
          }
        } : undefined
      }
    } as unknown as APIGatewayProxyEvent;
  };

  beforeEach(() => {
    jest.resetModules();
    ddbMock.reset();

    process.env = {
      ...originalEnv,
      PLANS_TABLE: 'test-plans-table',
      ORG_TABLE: 'test-org-table',
      LIKES_TABLE: 'test-likes-table'
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test('should return 500 when environment variables are missing', async () => {
    process.env.PLANS_TABLE = undefined;
    const event = createMockEvent({ org_id: 'test-org-id' }, 'test-user-id');

    const result = await handler(event);

    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).error).toBe('Missing env values');
  });

  test('should return 404 when userSub is missing', async () => {
    const event = createMockEvent({ org_id: 'test-org-id' });

    const result = await handler(event);

    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body).error).toBe('Missing userSub');
  });

  test('should return 404 when org_id parameter is missing', async () => {
    const event = createMockEvent({}, 'test-user-id');

    const result = await handler(event);

    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body).error).toBe('Missing [org_id] parameter');
  });

  test('should return 404 when organization is not found', async () => {
    const event = createMockEvent({ org_id: 'non-existent-org' }, 'test-user-id');

    ddbMock.on(GetCommand, {
      TableName: 'test-org-table',
      Key: { id: 'non-existent-org' },
      ProjectionExpression: "id, #org_name, description, images, rewards_loyalty, rewards_milestone, rl_active, rm_active, date_registered, active",
      ExpressionAttributeNames: {
        "#org_name": "name"
      }
    }).resolves({
      Item: undefined
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body).error).toBe('Organization not found');
  });

  test('should return a new empty plan when user has no existing plan', async () => {
    // Arrange
    const orgId = 'test-org-id';
    const userId = 'test-user-id';
    const event = createMockEvent({ org_id: orgId }, userId);

    // Mock organization retrieval
    const mockOrg = {
      id: orgId,
      name: 'Test Organization',
      rl_active: true,
      rm_active: false,
      rewards_loyalty: {
        reward_type: 'points',
        points_per_visit: 10
      }
    };

    ddbMock.on(GetCommand, {
      TableName: 'test-org-table',
      Key: { id: orgId },
      ProjectionExpression: "id, #org_name, description, images, rewards_loyalty, rewards_milestone, rl_active, rm_active, date_registered, active",
      ExpressionAttributeNames: {
        "#org_name": "name"
      }
    }).resolves({
      Item: mockOrg
    });

    ddbMock.on(GetCommand, {
      TableName: 'test-plans-table',
      Key: {
        user_id: userId,
        org_id: orgId
      }
    }).resolves({
      Item: undefined
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    const plan = JSON.parse(result.body);
    expect(plan).toEqual({
      reward_plan: {
        rewards_loyalty: mockOrg.rewards_loyalty,
        rewards_milestone: undefined
      },
      visits: 0,
      points: 0,
      redeemableRewards: [],
      rl_active: true,
      rm_active: false,
      firstPlan: false,
      active: false,
      organization_id: mockOrg.id,
      name: mockOrg.name
    });
  });

  test('should return existing plan data when user has a plan', async () => {
    const orgId = 'test-org-id';
    const userId = 'test-user-id';
    const event = createMockEvent({ org_id: orgId }, userId);

    const mockOrg = {
      id: orgId,
      name: 'Test Organization',
      rl_active: true,
      rm_active: true,
      rewards_loyalty: {
        reward_type: 'points',
        points_per_visit: 10
      },
      rewards_milestone: {
        milestone_visits: 10,
        reward_item: 'Free Coffee'
      }
    };

    ddbMock.on(GetCommand, {
      TableName: 'test-org-table',
      Key: { id: orgId },
      ProjectionExpression: "id, #org_name, description, images, rewards_loyalty, rewards_milestone, rl_active, rm_active, date_registered, active",
      ExpressionAttributeNames: {
        "#org_name": "name"
      }    }).resolves({
      Item: mockOrg
    });

    const mockPlan = {
      id: 'test-plan-id',
      visits: 5,
      points: 50,
      active: true
    };

    ddbMock.on(GetCommand, {
      TableName: 'test-plans-table',
      Key: {
        user_id: userId,
        org_id: orgId
      }
    }).resolves({
      Item: mockPlan
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    const plan = JSON.parse(result.body);
    expect(plan).toEqual({
      reward_plan: {
        rewards_loyalty: mockOrg.rewards_loyalty,
        rewards_milestone: mockOrg.rewards_milestone
      },
      visits: 5,
      points: 50,
      redeemableRewards: [],
      rl_active: true,
      rm_active: true,
      firstPlan: false,
      id: 'test-plan-id',
      active: true,
      organization_id: mockOrg.id,
      name: mockOrg.name
    });
  });

  test('should handle organizations with no reward programs active', async () => {
    const orgId = 'test-org-id';
    const userId = 'test-user-id';
    const event = createMockEvent({ org_id: orgId }, userId);

    const mockOrg = {
      id: orgId,
      name: 'Test Organization',
      rl_active: false,
      rm_active: false
    };

    ddbMock.on(GetCommand, {
      TableName: 'test-org-table',
      Key: { id: orgId },
      ProjectionExpression: "id, #org_name, description, images, rewards_loyalty, rewards_milestone, rl_active, rm_active, date_registered, active",
      ExpressionAttributeNames: {
        "#org_name": "name"
      }
    }).resolves({
      Item: mockOrg
    });

    ddbMock.on(GetCommand, {
      TableName: 'test-plans-table',
      Key: {
        user_id: userId,
        org_id: orgId
      }
    }).resolves({
      Item: undefined
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    const plan = JSON.parse(result.body);
    expect(plan.reward_plan.rewards_loyalty).toBeUndefined();
    expect(plan.reward_plan.rewards_milestone).toBeUndefined();
    expect(plan.rl_active).toBe(false);
    expect(plan.rm_active).toBe(false);
  });

  test('should handle partial plan data', async () => {
    const orgId = 'test-org-id';
    const userId = 'test-user-id';
    const event = createMockEvent({ org_id: orgId }, userId);

    const mockOrg = {
      id: orgId,
      name: 'Test Organization',
      rl_active: true,
      rewards_loyalty: {
        reward_type: 'points',
        points_per_visit: 10
      }
    };

    ddbMock.on(GetCommand, {
      TableName: 'test-org-table',
      Key: { id: orgId },
      ProjectionExpression: "id, #org_name, description, images, rewards_loyalty, rewards_milestone, rl_active, rm_active, date_registered, active",
      ExpressionAttributeNames: {
        "#org_name": "name"
      }
    }).resolves({
      Item: mockOrg
    });

    const mockPlan = {
      id: 'test-plan-id',
      active: true
    };

    ddbMock.on(GetCommand, {
      TableName: 'test-plans-table',
      Key: {
        user_id: userId,
        org_id: orgId
      }
    }).resolves({
      Item: mockPlan
    });

    const result = await handler(event);

    expect(result.statusCode).toBe(200);
    const plan = JSON.parse(result.body);
    expect(plan.visits).toBe(0);
    expect(plan.points).toBe(0);
    expect(plan.redeemableRewards).toEqual([]);
  });

  test('should handle database errors gracefully', async () => {
    const event = createMockEvent({ org_id: 'test-org-id' }, 'test-user-id');

    ddbMock.on(GetCommand).rejects(new Error('Database connection failed'));

    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    const result = await handler(event);

    // Assert
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).error).toBe('Could not retrieve shop plan');
    expect(consoleErrorSpy).toHaveBeenCalled();

    // Restore console.error
    consoleErrorSpy.mockRestore();
  });
});