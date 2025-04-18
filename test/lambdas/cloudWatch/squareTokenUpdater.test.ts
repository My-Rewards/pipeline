import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import * as square from 'square';
import { handler } from '../../../lambda/cloudWatch/squareTokenUpdater';
import { fetchSquareSecret } from '../../../lambda/constants/square';

const obtainTokenMock = jest.fn();

jest.mock('../../../lambda/constants/square', () => ({
  fetchSquareSecret: jest.fn(),
}));

jest.mock('square', () => {
  return {
    SquareClient: jest.fn().mockImplementation(() => ({
      oAuth: {
        obtainToken: obtainTokenMock,
      },
    })),
    SquareEnvironment: {
      Production: 'production',
      Sandbox: 'sandbox',
    },
  };
});

const ddbMock = mockClient(DynamoDBDocumentClient);

describe('squareTokenUpdater Lambda', () => {
  const OriginalDate = global.Date;

  const fixedDate = new Date('2023-01-01T12:00:00Z');
  const twentyFourHoursLater = new Date('2023-01-02T12:00:00Z');

  beforeEach(() => {
    jest.clearAllMocks();
    ddbMock.reset();
    obtainTokenMock.mockClear();

    const MockDate = class extends OriginalDate {
      constructor(...args: ConstructorParameters<typeof OriginalDate>) {
        if (args.length as number === 0) {
          super(fixedDate);
        } else {
          super(...args);
        }
      }

      toISOString() {
        if (this.getTime() === fixedDate.getTime()) {
          return fixedDate.toISOString();
        }
        if (this.getTime() === twentyFourHoursLater.getTime() ||
            Math.abs(this.getTime() - (fixedDate.getTime() + 24 * 60 * 60 * 1000)) < 1000) {
          return twentyFourHoursLater.toISOString();
        }
        return new OriginalDate(this.getTime()).toISOString();
      }

    };

    global.Date = MockDate as unknown as DateConstructor;
    global.Date.now = jest.fn(() => fixedDate.getTime());

    obtainTokenMock.mockReturnValue({
      accessToken: 'test-access-token',
      refreshToken: 'test-refresh-token',
      refreshTokenExpiresAt: '2023-02-01T12:00:00Z'
    });

    process.env.ORG_TABLE = 'test-org-table';
    process.env.ORGANIZATIONS_TABLE = 'test-org-table';
    process.env.SQUARE_ARN = 'arn:aws:secretsmanager:region:account:secret:square';
    process.env.KMS_KEY_ID = 'test-kms-key';
    process.env.APP_ENV = 'dev';

    (fetchSquareSecret as jest.Mock).mockResolvedValue({
      client: 'square-client-id',
      secret: 'square-client-secret',
    });
  });

  afterEach(() => {
    global.Date = OriginalDate;
    jest.clearAllMocks();
    jest.resetAllMocks();

    delete process.env.ORG_TABLE;
    delete process.env.ORGANIZATIONS_TABLE;
    delete process.env.SQUARE_ARN;
    delete process.env.KMS_KEY_ID;
    delete process.env.APP_ENV;
  });

  test('should handle missing required environment variables', async () => {
    // Missing SQUARE_ARN
    delete process.env.SQUARE_ARN;

    const result = await handler();

    expect(result).toEqual({
      statusCode: 500,
      body: JSON.stringify({ error: 'Square ARN required' }),
    });
  });

  test('should handle missing KMS_KEY_ID', async () => {
    delete process.env.KMS_KEY_ID;

    const result = await handler();

    expect(result).toEqual({
      statusCode: 500,
      body: JSON.stringify({ error: 'KMS Key ID is not configured' }),
    });
  });

  test('should process organizations with expiring tokens', async () => {
    const organizations = [
      {
        id: 'org1',
        accessToken: 'existing-token-1',
        expiresAt: '2023-01-01T20:00:00Z',
        refreshToken: 'refresh-token-1',
      },
      {
        id: 'org2',
        accessToken: 'existing-token-2',
        expiresAt: '2023-01-01T10:00:00Z',
        refreshToken: 'refresh-token-2',
      },
    ];

    ddbMock.on(ScanCommand).resolves({
      Items: organizations,
    });

    obtainTokenMock
        .mockResolvedValueOnce({
          accessToken: 'new-token-1',
          refreshToken: 'new-refresh-1',
          refreshTokenExpiresAt: '2023-02-01T12:00:00Z',
        })
        .mockResolvedValueOnce({
          accessToken: 'new-token-2',
          refreshToken: 'new-refresh-2',
          refreshTokenExpiresAt: '2023-02-01T12:00:00Z',
        });

    ddbMock.on(UpdateCommand).resolves({});

    const result = await handler();

    expect(result).toEqual({
      statusCode: 200,
      body: JSON.stringify({ message: 'Token update process completed successfully' }),
    });

    expect(square.SquareClient).toHaveBeenCalledWith({
      environment: 'sandbox',
    });

    expect(obtainTokenMock).toHaveBeenCalledTimes(2);
    expect(obtainTokenMock).toHaveBeenCalledWith({
      clientId: 'square-client-id',
      clientSecret: 'square-client-secret',
      grantType: 'refresh_token',
      refreshToken: 'refresh-token-1',
    });
    expect(obtainTokenMock).toHaveBeenCalledWith({
      clientId: 'square-client-id',
      clientSecret: 'square-client-secret',
      grantType: 'refresh_token',
      refreshToken: 'refresh-token-2',
    });

    // Verify DynamoDB updates were called with correct parameters
    const updateCalls = ddbMock.commandCalls(UpdateCommand);
    expect(updateCalls.length).toBe(2);

    // Verify first update
    const firstUpdate = updateCalls[0].args[0].input;
    expect(firstUpdate).toEqual({
      TableName: 'test-org-table',
      Key: { id: 'org1' },
      UpdateExpression: 'SET accessToken = :token, expiresAt = :expiration, refreshToken = :refresh',
      ExpressionAttributeValues: {
        ':token': 'new-token-1',
        ':expiration': '2023-02-01T12:00:00Z',
        ':refresh': 'new-refresh-1',
      },
    });

    // Verify second update
    const secondUpdate = updateCalls[1].args[0].input;
    expect(secondUpdate).toEqual({
      TableName: 'test-org-table',
      Key: { id: 'org2' },
      UpdateExpression: 'SET accessToken = :token, expiresAt = :expiration, refreshToken = :refresh',
      ExpressionAttributeValues: {
        ':token': 'new-token-2',
        ':expiration': '2023-02-01T12:00:00Z',
        ':refresh': 'new-refresh-2',
      },
    });
  });

  test('should handle empty response from DynamoDB', async () => {
    // Mock empty DynamoDB scan response
    ddbMock.on(ScanCommand).resolves({
      Items: [],
    });

    // Execute handler
    const result = await handler();

    // Verify results
    expect(result).toEqual({
      statusCode: 200,
      body: JSON.stringify({ message: 'Token update process completed successfully' }),
    });

    // Verify that no obtainToken calls were made
    expect(obtainTokenMock).not.toHaveBeenCalled();

    // Verify that no DynamoDB updates were made
    const updateCalls = ddbMock.commandCalls(UpdateCommand);
    expect(updateCalls.length).toBe(0);
  });

  test('should handle errors when refreshing tokens', async () => {
    const organizations = [
      {
        id: 'org1',
        accessToken: 'existing-token-1',
        expiresAt: '2023-02-01T12:00:00Z',
        refreshToken: 'refresh-token-1',
      },
    ];

    // Mock DynamoDB scan response
    ddbMock.on(ScanCommand).resolves({
      Items: organizations,
    });

    // Mock obtainToken to throw an error
    const error = new Error('Token refresh failed');
    obtainTokenMock.mockRejectedValueOnce(error);

    // Spy on console.error
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    // Execute the handler
    const result = await handler();

    // Verify the handler returned success despite the error
    expect(result).toEqual({
      statusCode: 200,
      body: JSON.stringify({ message: 'Token update process completed successfully' }),
    });

    // Verify obtainToken was called
    expect(obtainTokenMock).toHaveBeenCalledTimes(1);

    // Verify error was logged
    expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error refreshing token for organization org1:',
        error
    );

    // Verify no DynamoDB updates were made
    const updateCalls = ddbMock.commandCalls(UpdateCommand);
    expect(updateCalls.length).toBe(0);

    // Restore console.error
    consoleErrorSpy.mockRestore();
  });

  test('should use production environment when app_env is prod', async () => {
    // Set production environment
    process.env.APP_ENV = 'prod';

    // Mock empty DynamoDB scan response
    ddbMock.on(ScanCommand).resolves({
      Items: [],
    });

    // Execute handler
    await handler();

    // Verify the Square client was created with production environment
    expect(square.SquareClient).toHaveBeenCalledWith({
      environment: 'production',
    });
  });

  test('should handle incomplete organization data', async () => {
    const organizations = [
      {
        id: 'org1',
        // Missing refreshToken
        accessToken: 'existing-token-1',
        expiresAt: '2023-02-01T12:00:00Z',
      },
      {
        id: 'org2',
        // Missing expiresAt
        accessToken: 'existing-token-2',
        refreshToken: 'refresh-token-2',
      },
      {
        id: 'org3',
        // Complete data
        accessToken: 'existing-token-3',
        expiresAt: '2023-02-01T12:00:00Z',
        refreshToken: 'refresh-token-3',
      },
    ];

    // Mock DynamoDB scan response
    ddbMock.on(ScanCommand).resolves({
      Items: organizations,
    });

    // Mock obtainToken response for the complete organization
    obtainTokenMock.mockResolvedValueOnce({
      accessToken: 'new-token-3',
      refreshToken: 'new-refresh-3',
      refreshTokenExpiresAt: '2023-02-01T12:00:00Z',
    });

    // Execute the handler
    const result = await handler();

    // Verify the handler returned success
    expect(result).toEqual({
      statusCode: 200,
      body: JSON.stringify({ message: 'Token update process completed successfully' }),
    });

    // Verify obtainToken was called only once (for org3)
    expect(obtainTokenMock).toHaveBeenCalledTimes(1);
    expect(obtainTokenMock).toHaveBeenCalledWith({
      clientId: 'square-client-id',
      clientSecret: 'square-client-secret',
      grantType: 'refresh_token',
      refreshToken: 'refresh-token-3',
    });

    // Verify only one DynamoDB update was called
    const updateCalls = ddbMock.commandCalls(UpdateCommand);
    expect(updateCalls.length).toBe(1);
  });
});