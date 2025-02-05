import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { SSMStackProps } from '../../global/props';
import { 
    UP_CUSTOMER_ID,
    UPC_CUSTOMER,
    UP_BUSINESS_ID,
    UPC_BUSINESS,
    UP_ADMIN_ID,
    UPC_ADMIN,
    IDENTITY_POOL_CUSTOMER,
    IDENTITY_POOL_BUSINESS
} from '../../global/constants';

export class SSMStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: SSMStackProps) {
    super(scope, id, props);

    const stripeData = cdk.aws_secretsmanager.Secret.fromSecretNameV2(this, 'fetchStripeCredentials', 'stripe/credentials');
    const stripe_key = stripeData.secretValueFromJson('key').unsafeUnwrap();

    const squareData = cdk.aws_secretsmanager.Secret.fromSecretNameV2(this, 'fetchSquareCredentials', 'square/credentials');
    const square_clientId = squareData.secretValueFromJson('client_id').unsafeUnwrap();

    // Customer User Pool Parameters
    new ssm.StringParameter(this, 'CustomerUserPoolId', {
      parameterName: `/myRewardsApp/${props.stageName}/customerUserPoolId`,
      stringValue: cdk.Fn.importValue(UP_CUSTOMER_ID),
    });

    new ssm.StringParameter(this, 'CustomerWebClientId', {
      parameterName: `/myRewardsApp/${props.stageName}/customerWebClientId`,
      stringValue: cdk.Fn.importValue(UPC_CUSTOMER),
    });

    // Business User Pool Parameters
    new ssm.StringParameter(this, 'BusinessUserPoolId', {
      parameterName: `/myRewardsApp/${props.stageName}/businessUserPoolId`,
      stringValue: cdk.Fn.importValue(UP_BUSINESS_ID),
    });

    new ssm.StringParameter(this, 'BusinessWebClientId', {
      parameterName: `/myRewardsApp/${props.stageName}/businessWebClientId`,
      stringValue: cdk.Fn.importValue(UPC_BUSINESS),
    });

    // Admin User Pool Parameters
    new ssm.StringParameter(this, 'AdminUserPoolId', {
      parameterName: `/myRewardsApp/${props.stageName}/adminUserPoolId`,
      stringValue: cdk.Fn.importValue(UP_ADMIN_ID),
    });

    new ssm.StringParameter(this, 'AdminWebClientId', {
      parameterName: `/myRewardsApp/${props.stageName}/adminWebClientId`,
      stringValue: cdk.Fn.importValue(UPC_ADMIN),
    });

    // Identity Pool Customer + Business
    new ssm.StringParameter(this, 'IdentityPoolIdCustomer', {
      parameterName: `/myRewardsApp/${props.stageName}/identityPoolIdCustomer`,
      stringValue: cdk.Fn.importValue(IDENTITY_POOL_CUSTOMER),
    });
    new ssm.StringParameter(this, 'IdentityPoolIdBusiness', {
      parameterName: `/myRewardsApp/${props.stageName}/identityPoolIdBusiness`,
      stringValue: cdk.Fn.importValue(IDENTITY_POOL_BUSINESS),
    });

    // Stripe
    new ssm.StringParameter(this, 'StripeKey', {
      parameterName: `/myRewardsApp/${props.stageName}/stripeKey`,
      stringValue: stripe_key,
    });

    // Square
    new ssm.StringParameter(this, 'SquareClientId', {
      parameterName: `/myRewardsApp/${props.stageName}/squareClientId`,
      stringValue: square_clientId,
    });
  }
}
