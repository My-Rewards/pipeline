import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { StackProps } from '../../global/props';
import { 
    UP_CUSTOMER_ID,
    UPC_CUSTOMER,
    CUSTOMER_DOMAIN,
    UP_BUSINESS_ID,
    UPC_BUSINESS,
    BUSINESS_DOMAIN,
    UP_ADMIN_ID,
    UPC_ADMIN,
    ADMIN_DOMAIN,
    IDENTITY_POOL
} from '../../global/constants';

export class SSMStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);

    // Customer User Pool Parameters
    new ssm.StringParameter(this, 'CustomerUserPoolId', {
      parameterName: `/myRewardsApp/${props.stageName}/customerUserPoolId`,
      stringValue: cdk.Fn.importValue(UP_CUSTOMER_ID),
    });

    new ssm.StringParameter(this, 'CustomerWebClientId', {
      parameterName: `/myRewardsApp/${props.stageName}/customerWebClientId`,
      stringValue: cdk.Fn.importValue(UPC_CUSTOMER),
    });

    new ssm.StringParameter(this, 'CustomerCognitoDomain', {
      parameterName: `/myRewardsApp/${props.stageName}/customerCognitoDomain`,
      stringValue: cdk.Fn.importValue(CUSTOMER_DOMAIN),
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

    new ssm.StringParameter(this, 'BusinessCognitoDomain', {
      parameterName: `/myRewardsApp/${props.stageName}/businessCognitoDomain`,
      stringValue: cdk.Fn.importValue(BUSINESS_DOMAIN),
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

    new ssm.StringParameter(this, 'AdminCognitoDomain', {
      parameterName: `/myRewardsApp/${props.stageName}/adminCognitoDomain`,
      stringValue: cdk.Fn.importValue(ADMIN_DOMAIN),
    });

    // Identity Pool
    new ssm.StringParameter(this, 'IdentityPoolId', {
      parameterName: `/myRewardsApp/${props.stageName}/identityPoolId`,
      stringValue: cdk.Fn.importValue(IDENTITY_POOL),
    });
  }
}
