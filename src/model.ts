export interface ServiceDefinition {
    name: string;
    version: string;
    path: string;
    port: number;
}

export interface TenantDefinition {
    name: string;
    domain: string;
}

export interface ServiceDefinitions {
    clusterName: string;
    tenants: Array<TenantDefinition>;
    email: string;
    services: Array<ServiceDefinition>;
}