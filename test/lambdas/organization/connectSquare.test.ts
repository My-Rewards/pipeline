import { handler } from '../../../lambda/organization/square/link';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { KMSClient, EncryptCommand } from '@aws-sdk/client-kms';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { APIGatewayProxyEvent } from 'aws-lambda';

const ddbMock = mockClient(DynamoDBDocumentClient);
const kmsMock = mockClient(KMSClient);
const secretsMock = mockClient(SecretsManagerClient);

jest.mock('square', () => {
  const mockObtainToken = jest.fn();
  const mockMerchantsList = jest.fn();
  
  return {
    SquareClient: jest.fn().mockImplementation(() => ({
      oAuth: {
        obtainToken: mockObtainToken
      },
      merchants: {
        list: mockMerchantsList
      }
    })),
    SquareEnvironment: {
      Production: 'production',
      Sandbox: 'sandbox'
    }
  };
});

import * as square from 'square';

describe('Square Integration Lambda', () => {
  let mockObtainToken: jest.Mock;
  let mockMerchantsList: jest.Mock;
  
  beforeEach(() => {
    jest.clearAllMocks();
    ddbMock.reset();
    kmsMock.reset();
    secretsMock.reset();
    
    mockObtainToken = jest.fn();
    mockMerchantsList = jest.fn();
    
    (square.SquareClient as jest.Mock).mockImplementation(() => ({
      oAuth: {
        obtainToken: mockObtainToken
      },
      merchants: {
        list: mockMerchantsList
      }
    }));
    
    process.env.USER_TABLE = 'users-table';
    process.env.ORG_TABLE = 'orgs-table';
    process.env.SQUARE_ARN = 'square-secret-arn';
    process.env.KMS_KEY_ID = 'kms-key-id';
    process.env.APP_ENV = 'dev';
  });

  const mockEvent = (body: any, user:string|null): APIGatewayProxyEvent => {
    return {
      body: JSON.stringify(body),
      headers: {},
      multiValueHeaders: {},
      httpMethod: 'POST',
      requestContext: {
        authorizer: {
          claims: { sub: user }
        },
        accountId: '',
        apiId: '',
        protocol: '',
        httpMethod: '',
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
          sourceIp: '',
          user: null,
          userAgent: null,
          userArn: null
        },
        path: '',
        stage: '',
        requestId: '',
        requestTimeEpoch: 0,
        resourceId: '',
        resourcePath: ''
      },
      isBase64Encoded: false,
      path: '/square-auth',
      pathParameters: null,
      queryStringParameters: null,
      multiValueQueryStringParameters: null,
      stageVariables: null,
      resource: ''
    };
  };

  test('should return 400 when body is missing', async () => {
    const event = { ...mockEvent({}, null), body: null };
    const result = await handler(event);
    
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toContain('Request body is required');
  });

  test('should return 400 when required fields are missing', async () => {
    let event = mockEvent({}, 'user123');
    let result = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toContain('authCode, userId, and codeVerifier are required');
    
    event = mockEvent({}, 'user123');
    result = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error).toContain('authCode, userId, and codeVerifier are required');
  });

  test('should return 500 when environment variables are missing', async () => {
    const event = mockEvent({ authCode: 'auth123'}, 'user123');
    
    process.env.SQUARE_ARN = '';
    let result = await handler(event);
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).error).toContain('Square ARN required');
    process.env.SQUARE_ARN = 'square-secret-arn';
    
    process.env.USER_TABLE = '';
    result = await handler(event);
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).error).toContain('Square Missing Table Name');
    process.env.USER_TABLE = 'users-table';
    
    process.env.ORG_TABLE = '';
    result = await handler(event);
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).error).toContain('Square Missing Table Name');
    process.env.ORG_TABLE = 'orgs-table';
    
    process.env.KMS_KEY_ID = '';
    result = await handler(event);
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).error).toContain('KMS Key ID is not configured');
  });

  test('should return 210 when user not found', async () => {
    const event = mockEvent({ authCode: 'auth123'}, 'user123');
    
    ddbMock.on(GetCommand, {
      TableName: 'users-table',
      Key: { id: 'user123' }
    }).resolves({
      Item: undefined
    });
    
    const result = await handler(event);
    expect(result.statusCode).toBe(210);
    expect(JSON.parse(result.body).info).toContain('User not found');
  });

  test('should return 210 when organization not found', async () => {
    const event = mockEvent({ authCode: 'auth123' }, 'user123');
    
    ddbMock.on(GetCommand, {
      TableName: 'users-table',
      Key: { id: 'user123' }
    }).resolves({
      Item: { orgId: 'org123' }
    });
    
    ddbMock.on(GetCommand, {
      TableName: 'orgs-table',
      Key: { id: 'org123' }
    }).resolves({
      Item: undefined
    });
    
    const result = await handler(event);
    expect(result.statusCode).toBe(210);
    expect(JSON.parse(result.body).info).toContain('Organization not found');
  });

  test('should return 401 when user is not the organization owner', async () => {
    const event = mockEvent({ authCode: 'auth123'}, 'user123');
    
    ddbMock.on(GetCommand, {
      TableName: 'users-table',
      Key: { id: 'user123' }
    }).resolves({
      Item: { orgId: 'org123' }
    });
    
    ddbMock.on(GetCommand, {
      TableName: 'orgs-table',
      Key: { id: 'org123' }
    }).resolves({
      Item: { id: 'org123', owner_id: 'different_user' }
    });
    
    const result = await handler(event);
    expect(result.statusCode).toBe(401);
    expect(JSON.parse(result.body).error).toContain('Only Organization owner may delete Organization');
  });

  test('should handle Square API error gracefully', async () => {
    const event = mockEvent({ authCode: 'auth123'}, 'user123');
    
    ddbMock.on(GetCommand, {
      TableName: 'users-table',
      Key: { id: 'user123' }
    }).resolves({
      Item: { orgId: 'org123' }
    });
    
    ddbMock.on(GetCommand, {
      TableName: 'orgs-table',
      Key: { id: 'org123' }
    }).resolves({
      Item: { id: 'org123', owner_id: 'user123' }
    });
    
    secretsMock.on(GetSecretValueCommand).resolves({
      SecretString: JSON.stringify({
        client_id: 'square_client_id',
        client_secret: 'square_client_secret'
      })
    });
    
    mockObtainToken.mockRejectedValue(new Error('Square API error'));
    
    const result = await handler(event);
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).error).toContain('Failed');
  });

  test('should return 500 if encryption fails', async () => {
    const event = mockEvent({ authCode: 'auth123'}, 'user123');
    
    ddbMock.on(GetCommand, {
      TableName: 'users-table',
      Key: { id: 'user123' }
    }).resolves({
      Item: { orgId: 'org123' }
    });
    
    ddbMock.on(GetCommand, {
      TableName: 'orgs-table',
      Key: { id: 'org123' }
    }).resolves({
      Item: { id: 'org123', owner_id: 'user123' }
    });
    
    secretsMock.on(GetSecretValueCommand).resolves({
      SecretString: JSON.stringify({
        client_id: 'square_client_id',
        client_secret: 'square_client_secret'
      })
    });
    
    mockObtainToken.mockResolvedValue({
      accessToken: 'mock_access_token',
      refreshToken: 'mock_refresh_token',
      expiresAt: '2025-01-01T00:00:00Z'
    });
    
    mockMerchantsList.mockResolvedValue({
      data: [{ id: 'merchant123' }]
    });
    
    kmsMock.on(EncryptCommand).resolves({
      CiphertextBlob: undefined
    });
    
    const result = await handler(event);
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).error).toContain('Failed to encrypt tokens');
  });

  test('should successfully process the Square auth flow', async () => {
    const event = mockEvent({ authCode: 'auth123'}, 'user123');
    
    ddbMock.on(GetCommand, {
      TableName: 'users-table',
      Key: { id: 'user123' }
    }).resolves({
      Item: { orgId: 'org123' }
    });
    
    ddbMock.on(GetCommand, {
      TableName: 'orgs-table',
      Key: { id: 'org123' }
    }).resolves({
      Item: { id: 'org123', owner_id: 'user123' }
    });
    
    secretsMock.on(GetSecretValueCommand).resolves({
      SecretString: JSON.stringify({
        client_id: 'square_client_id',
        client_secret: 'square_client_secret'
      })
    });
    
    mockObtainToken.mockResolvedValue({
      accessToken: 'mock_access_token',
      refreshToken: 'mock_refresh_token',
      expiresAt: '2025-01-01T00:00:00Z'
    });
    
    mockMerchantsList.mockResolvedValue({
      data: [{ id: 'merchant123' }]
    });
    
    const mockCiphertextBlob = Buffer.from('encrypted_token');
    kmsMock.on(EncryptCommand).resolves({
      CiphertextBlob: mockCiphertextBlob
    });
    
    ddbMock.on(UpdateCommand).resolves({
      Attributes: {
        accessToken: 'encrypted_token',
        refreshToken: 'encrypted_token',
        expiresAt: '2025-01-01T00:00:00Z',
        square_merchant_id: 'merchant123',
        linked: true
      }
    });
    
    const result = await handler(event);
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).message).toContain('Tokens saved successfully');
    
    expect(ddbMock.commandCalls(UpdateCommand)[0].args[0].input).toMatchObject({
      TableName: 'orgs-table',
      Key: { id: 'org123' },
      UpdateExpression: expect.stringContaining('accessToken'),
      ExpressionAttributeValues: expect.objectContaining({
        ':square_merchant_id': 'merchant123',
        ':linked': true
      })
    });
  });

  test('should return 500 if Square obtainToken fails to return tokens', async () => {
    const event = mockEvent({ authCode: 'auth123'}, 'user123');
    
    // Setup successful DB queries
    ddbMock.on(GetCommand, {
      TableName: 'users-table',
      Key: { id: 'user123' }
    }).resolves({
      Item: { orgId: 'org123' }
    });
    
    ddbMock.on(GetCommand, {
      TableName: 'orgs-table',
      Key: { id: 'org123' }
    }).resolves({
      Item: { id: 'org123', owner_id: 'user123' }
    });
    
    secretsMock.on(GetSecretValueCommand).resolves({
      SecretString: JSON.stringify({
        client_id: 'square_client_id',
        client_secret: 'square_client_secret'
      })
    });
    
    mockObtainToken.mockResolvedValue({
      accessToken: undefined,
      refreshToken: undefined
    });
    
    const result = await handler(event);
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).error).toContain('Failed to retrieve tokens');
  });

  test('should return 404 if merchant data cannot be retrieved', async () => {
    const event = mockEvent({ authCode: 'auth123'}, 'user123');
    
    ddbMock.on(GetCommand, {
      TableName: 'users-table',
      Key: { id: 'user123' }
    }).resolves({
      Item: { orgId: 'org123' }
    });
    
    ddbMock.on(GetCommand, {
      TableName: 'orgs-table',
      Key: { id: 'org123' }
    }).resolves({
      Item: { id: 'org123', owner_id: 'user123' }
    });
    
    secretsMock.on(GetSecretValueCommand).resolves({
      SecretString: JSON.stringify({
        client_id: 'square_client_id',
        client_secret: 'square_client_secret'
      })
    });
    
    mockObtainToken.mockResolvedValue({
      accessToken: 'mock_access_token',
      refreshToken: 'mock_refresh_token',
      expiresAt: '2025-01-01T00:00:00Z'
    });
    
    mockMerchantsList.mockResolvedValue({
      data: undefined
    });
    
    const result = await handler(event);
    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body).error).toContain('Square merchant not retrieved');
  });
});