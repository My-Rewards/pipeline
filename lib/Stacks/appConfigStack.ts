import * as cdk from 'aws-cdk-lib'
import * as appconfig from 'aws-cdk-lib/aws-appconfig'
import { Construct } from 'constructs'
import { AppConfigStackProps } from '../../global/props'
import * as fs from 'fs'
import * as path from 'path'

export class AppConfigStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props?: AppConfigStackProps){
        super(scope, id, props);
        const stage_name = props?.stageName;
        const config = getConfig(stage_name);

        //Create an AppConfig Application
        const appConfigApplication = new appconfig.CfnApplication(this, 'AppConfigApplication', {
            name: 'AppConfigApplication',
        });
  
        //Create environment
        const appConfigEnvironment = new appconfig.CfnEnvironment(this, 'dev', {
            applicationId: appConfigApplication.ref,
            name: 'dev',
        });
    
        //Create Configuration Profile
        const appConfigProfile = new appconfig.CfnConfigurationProfile(this, 'ConfigProfile', {
            applicationId: appConfigApplication.ref,
            name: 'ConfigProfile',
            locationUri: 'hosted',
        });

           //Create Hosted Configuration Version
        const appConfigVersion = new appconfig.CfnHostedConfigurationVersion(this, 'Version 1', {
        applicationId: appConfigApplication.ref,
        configurationProfileId: appConfigProfile.ref,
        contentType: 'application/json',
        //Create JSON for configuration values
        content: config
        });
        
        const deploymentStrategy = new appconfig.CfnDeploymentStrategy(this, "CustomDeployment", {
            name: "CustomDeployment", 
            deploymentDurationInMinutes: 5,   
            growthType: "LINEAR",               
            growthFactor: 10,                  
            finalBakeTimeInMinutes: 1,
            replicateTo: "NONE"
          });

        //Define a Configuration Version 
        const configVersion = new appconfig.CfnDeployment(this, 'AppConfigDeployment', {
        applicationId: appConfigApplication.ref,
        environmentId: appConfigEnvironment.ref,
        configurationProfileId: appConfigProfile.ref,
        configurationVersion: appConfigVersion.ref,
        deploymentStrategyId: deploymentStrategy.ref
      });
    }
}

function getConfig(stageName: unknown){
    const betaConfig = fs.readFileSync(path.join(__dirname, '../../appConfig/beta.json'), 'utf-8');
    const prodConfig = fs.readFileSync(path.join(__dirname, '../../appConfig/prod.json'), 'utf-8');
    const envConfig = stageName === 'beta' ? betaConfig : prodConfig;

    return envConfig;
}