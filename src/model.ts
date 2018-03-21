
export class TEST {
    public static isTest() {{ return  process.env.MODE === "test";} }
    public static isDryRun() { return TEST.isTest() || process.env.MODE === "dry-run";}
}

/**
 * Tenant definition
 * Match tenant name and host name
 */
export interface RuleDefinition {
    /**
     * tenant name - If not provide ServiceDefinitions.defaultTenantPattern must be provided
     * Used to force a tenant
     */
    tenant?: string;
    /**
     * Host name
     */
    hostName: string;
    /**
     * Domain name - A let's encrypt certificate will be created
     */
    tlsDomain?: string;
    /**
     * Public path - overrided by pathPrefix in service endpoint if any
     *
     */
    path?: string;
    /**
     * Replace public path prefix with this value (default is api)
     * ex: if pathPrefix = api
     *   publicPath = /v1/customer.all
     *   target service path = /api/customer.all
     */
    pathPrefix?: string;
    /**
     * Service name (dns)
     */
    serviceName: string;
    /**
     * Exposed port service - Default 8080
     */
    servicePort?: number;
}

/**
 * Service list for an environment
 */
export interface IngressDefinition {
    /**
     * Name
     */
    env?: string;
    /**
     * Let's encrypt expiration email
     */
    tlsEmail?: string;
    /**
     * Regex pattern to resolve tenant from uri host name (optional)
     * Used to set x-vulcain-tenant header if no tenant.name is provided
     */
    defaultTenantPattern?: string;
    /**
     * Rules
     */
    rules: Array<RuleDefinition>;
}