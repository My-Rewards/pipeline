import { Handler } from 'aws-lambda';
import { Client } from 'pg';
import {GetSecretValueCommand, SecretsManagerClient} from "@aws-sdk/client-secrets-manager";

const secretClient = new SecretsManagerClient({ region: "us-east-1" });

export const handler: Handler = async () => {
    const SECRET_ARN = process.env.SECRET_ARN!;
    const DATABASE_NAME = process.env.DATABASE_NAME!;

    try {
        console.log('retrieving admin credentials...');
        const adminSecret = await secretClient.send(new GetSecretValueCommand({ SecretId: SECRET_ARN }));
        const admin = JSON.parse(adminSecret.SecretString as string);

        const adminClient = new Client({
            host: admin.host,
            user: admin.username,
            password: admin.password,
            database: 'postgres',
            port: 5432,
        });

        await adminClient.connect();

        const userExistsResult = await adminClient.query(`
            SELECT 1 FROM pg_roles WHERE rolname = 'app_user'
        `);

        if (userExistsResult.rows.length === 0) {
            console.log('creating user and granting privileges...');
            await adminClient.query(`CREATE USER app_user WITH PASSWORD '${admin.password}';`);
        } else {
            console.log('user already exists, skipping creation');
        }

        await adminClient.query(`GRANT ALL PRIVILEGES ON DATABASE ${DATABASE_NAME} TO app_user;`);

        await adminClient.end();

        const appSchemaClient = new Client({
            host: admin.host,
            user: admin.username,
            password: admin.password,
            database: DATABASE_NAME,
            port: 5432,
        });

        await appSchemaClient.connect();

        console.log('creating required extensions...');
        await appSchemaClient.query('CREATE EXTENSION IF NOT EXISTS postgis;');
        await appSchemaClient.query('CREATE EXTENSION IF NOT EXISTS postgis_topology;');
        await appSchemaClient.query('CREATE EXTENSION IF NOT EXISTS pg_stat_statements;');


        console.log('applying schema permissions...');
        await appSchemaClient.query(`GRANT USAGE, CREATE ON SCHEMA public TO app_user;`);
        await appSchemaClient.query(`GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO app_user;`);
        await appSchemaClient.query(`GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO app_user;`);
        await appSchemaClient.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON TABLES TO app_user;`);
        await appSchemaClient.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON SEQUENCES TO app_user;`);

        await appSchemaClient.end();

        const userClient = new Client({
            host: admin.host,
            user: 'app_user',
            password: admin.password,
            database: DATABASE_NAME,
            port: 5432,
        });

        console.log('connecting to rds with application user...');
        await userClient.connect();

        console.log('checking and creating tables if needed...');

        await userClient.query(`
            CREATE TABLE IF NOT EXISTS Organizations (
                id VARCHAR(50) PRIMARY KEY,
                active BOOLEAN DEFAULT TRUE,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                search_name VARCHAR(100),
             );
        `);

        await userClient.query(`
            CREATE TABLE IF NOT EXISTS Shops (
                id VARCHAR(50) PRIMARY KEY,
                organization_id VARCHAR(50) NOT NULL,
                active BOOLEAN DEFAULT TRUE,
                location GEOGRAPHY(POINT),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

                 FOREIGN KEY (organization_id) REFERENCES Organizations(id)
                );

            CREATE INDEX IF NOT EXISTS idx_shops_location ON Shops USING GIST(location);
            CREATE INDEX IF NOT EXISTS idx_shops_organization ON Shops(organization_id);
        `);

        console.log('all tables and extensions created successfully!');
        await userClient.end();

    } catch (error) {
        console.error('Error setting up database:', error);
        throw error;
    }
};