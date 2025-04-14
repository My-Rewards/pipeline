import * as cdk from 'aws-cdk-lib'
import * as appconfig from 'aws-cdk-lib/aws-appconfig'
import { Construct } from 'constructs'
import { AppConfigStackProps } from '../../global/props'
import * as fs from 'fs'
import * as path from 'path'


export class AppConfigStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props: AppConfigStackProps){
        
        super(scope, id, props);
        const APPCONFIG_CONSTANTS = getConstants(props.stageName);
        
        //Create an AppConfig Application
        const appConfigApplication = new appconfig.CfnApplication(this,  "MyRewards-AppConfig", {
            name: APPCONFIG_CONSTANTS.application_name,
        });
  
        //Create environment
        const appConfigEnvironment = new appconfig.CfnEnvironment(this, APPCONFIG_CONSTANTS.environment_name, {
            applicationId: appConfigApplication.ref,
            name: APPCONFIG_CONSTANTS.environment_name,
        });
    
        //Create Configuration Profile
        const appConfigProfile = new appconfig.CfnConfigurationProfile(this, "AppConfig-Profile", {
            applicationId: appConfigApplication.ref,
            name: APPCONFIG_CONSTANTS.appConfigProfileName,
            locationUri: APPCONFIG_CONSTANTS.locationUri,
        });

        //Create Hosted Configuration Version
        const appConfigVersion = new appconfig.CfnHostedConfigurationVersion(this, `AppConfig-Version`, {
        applicationId: appConfigApplication.ref,
        configurationProfileId: appConfigProfile.ref,
        contentType: APPCONFIG_CONSTANTS.contentType,
        content: APPCONFIG_CONSTANTS.content
        });
        
        const deploymentStrategy = new appconfig.CfnDeploymentStrategy(this, "Custom-5Min50Percent", {
            name: APPCONFIG_CONSTANTS.deployment_name,
            deploymentDurationInMinutes: APPCONFIG_CONSTANTS.deploymentDurationInMinutes,   
            growthType: APPCONFIG_CONSTANTS.growthType,               
            growthFactor: APPCONFIG_CONSTANTS.growthFactor,                  
            finalBakeTimeInMinutes: APPCONFIG_CONSTANTS.finalBakeTimeInMinutes,
            replicateTo: APPCONFIG_CONSTANTS.replicateTo
        });

        //Define a Configuration Version 
        const configVersion = new appconfig.CfnDeployment(this, 'AppConfigDeployment', {
        applicationId: appConfigApplication.ref,
        environmentId: appConfigEnvironment.ref,
        configurationProfileId: appConfigProfile.ref,
        configurationVersion: appConfigVersion.ref,
        deploymentStrategyId: deploymentStrategy.ref
      });

    new cdk.CfnOutput(this, 'APPCONFIG_APP_ID', {
        value: appConfigApplication.ref,
        description: 'Id of AppConfig application',
        exportName: 'AppConfigApplicationId',
    });
    new cdk.CfnOutput(this, 'APPCONFIG_ENV_ID', {
        value: appConfigEnvironment.ref,
        description: 'Id of the AppConfig environment',
        exportName: 'AppConfigEnvironmentId',
    });
    new cdk.CfnOutput(this, 'APPCONFIG_PROFILE_ID', {
        value: appConfigProfile.ref,
        description: 'Id of the AppConfig profile',
        exportName: 'AppConfigProfileId',
    });
    }
}

function getConfig(stageName: string){
    const betaConfig = fs.readFileSync(path.join(__dirname, '../../appConfig/beta.json'), 'utf-8');
    const prodConfig = fs.readFileSync(path.join(__dirname, '../../appConfig/prod.json'), 'utf-8');
    const envConfig = stageName === 'beta' ? betaConfig : prodConfig;

    return envConfig;
}

function getConstants(stageName: string){
    const config = getConfig(stageName);
    const configConstants = {
        application_name: "MyRewardsAppConfig",
        environment_name: stageName,
        locationUri: "hosted",
        appConfigProfileName: "MyRewards_Profile",
        contentType: "application/json",
        deployment_name: "5Min50Percent",
        growthType: "LINEAR",
        replicateTo: "NONE",
        deploymentDurationInMinutes: 5,
        growthFactor: 10,
        finalBakeTimeInMinutes: 1,
        content: config
    };

    return configConstants;
}
