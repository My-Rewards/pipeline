import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { stackProps } from '../../global/props';

import { 
    USER_POOL_CLIENT, 
    USER_POOL_ID,
    IDENTITY_POOL,
    COGNITO_DOMAIN
 } from '../../global/constants';

export class SSMStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: stackProps) {
    super(scope, id, props);

    new ssm.StringParameter(this, 'envUserPoolId', {
      parameterName: `/myRewardsApp/${props.stageName}/userPoolId`,
      stringValue: cdk.Fn.importValue(USER_POOL_ID),
    });

    new ssm.StringParameter(this, 'envWebClientId', {
      parameterName: `/myRewardsApp/${props.stageName}/webClientId`,
      stringValue: cdk.Fn.importValue(USER_POOL_CLIENT),
    });

    new ssm.StringParameter(this, 'BetaCognitoDomain', {
      parameterName: `/myRewardsApp/${props.stageName}/cognitoDomain`,
      stringValue: cdk.Fn.importValue(COGNITO_DOMAIN),
    });

    new ssm.StringParameter(this, 'BetaIdentityPoolId', {
      parameterName: `/myRewardsApp/${props.stageName}/identityPoolId`,
      stringValue: cdk.Fn.importValue(IDENTITY_POOL), 
    });
  }
}
