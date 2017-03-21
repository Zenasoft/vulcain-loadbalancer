/**
 * Service definition
 */
export interface ServiceDefinition {
    /**
     * Service name (dns)
     */
    name: string;
    /**
     * Service version
     */
    version: string;
    /**
     * Public path - override /api/ in service endpoint
     */
    path: string;
    /**
     * Exposed port service - Default 8080
     */
    port?: number;
}

/**
 * Tenant definition
 * Match tenant name and host name
 */
export interface TenantDefinition {
    /**
     * tenant name - If not provide ServiceDefinitions.tenantPattern must be provided
     */
    name?: string;
    /**
     * Domain name - A let's encrypt certificate will be created
     */
    domain: string;
}

/**
 * Service list
 */
export interface ServiceDefinitions {
    /**
     * Current cluster (or environment) name
     */
    clusterName: string;
    /**
     * Pattern to resolve tenant from uri host name
     */
    tenantPattern?: string;
    /**
     * Tenant list
     */
    tenants: Array<TenantDefinition>;
    /**
     * Let's encrypt expiration email
     */
    email: string;
    /**
     * Services to expose publicly
     */
    services: Array<ServiceDefinition>;
}