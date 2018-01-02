/**
 * Service definition
 */
export interface ServiceDefinition {
    /**
     * Service name (dns)
     */
    name: string;
    /**
     * Public path - overrided by pathPrefix  in service endpoint if any
     *
     */
    path?: string;
    /**
     * Replace public path prefix with this value
     * ex: if pathPrefix = api
     *   publicPath = /v1/customer.all
     *   target service path = /api/customer.all
     */
    pathPrefix?: string;
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
     * tenant name - If not provide ServiceDefinitions.defaultTenantPattern must be provided
     * Used to force a tenant
     */
    name?: string;
    /**
     * Domain name - A let's encrypt certificate will be created
     */
    domain: string;
        /**
     * Let's encrypt expiration email
     */
    email: string;
}

/**
 * Service list for an environment
 */
export interface ServiceDefinitions {
    /**
     * Current cluster (or environment) name
     * Optional
     */
    cluster?: string;
    /**
     * Listen port (default 443)
     */
    port?: number;
    /**
     * Port used for testing (default 80)
     */
    testPort?: number;
    /**
     * Pattern to resolve tenant from uri host name (optional)
     * Used to set x-vulcain-tenant header if no tenant.name is provided
     */
    defaultTenantPattern?: string;
    /**
     * Tenant list (FrontEnd)
     */
    tenants: Array<TenantDefinition>;
    /**
     * Services to expose publicly (Backend)
     */
    services: Array<ServiceDefinition>;
}