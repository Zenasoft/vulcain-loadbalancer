export interface ServiceDefinition {
    name: string;
    version: string;
    path: string;
    port: number;
}

export interface BackendDefinition {
    hostname: string;
    ip: string;
}

export interface ServiceDefinitions {
    clusterName: string;
    domain: string;
    backends: Array<BackendDefinition>;
    services: Array<ServiceDefinition>;
}