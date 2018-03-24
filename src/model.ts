
export class CONTEXT {
    public static isTest() {{ return  process.env.MODE === "test";} }
    public static isDryRun() { return process.env.MODE === "dry-run";}
}

/**
 * Rule definition
 */
export interface RuleDefinition {
    /**
     * Unique id (Required)
     */
    id: string;
    /**
     * tenant name :  force a tenant - If not provided, ServiceDefinitions.defaultTenantPattern is used
     */
    tenant?: string;
    /**
     * Host name (Optional), if not provided it will be initialized with tlsDomain
     */
    hostname?: string;
    /**
     * Domain name (Optional) - A let's encrypt certificate will be created
     * Must be precise only if this is not a wildcards sub domain.
     * Certificate will be revoked in case of rule deletion
     */
    tlsDomain?: string;
    /**
     * Path filter (starts with)
     * Optional, if empty hostname is required.
     * Can also be a haproxy regular expression (see https://www.haproxy.com/fr/documentation/aloha/7-0/traffic-management/lb-layer7/http-rewrite/#rewrite-anywhere)
     */
    path?: string;
    /**
     * Path rewriting (Optional), replace 'path' with.
     * Can be a haproxy regular expression (see https://www.haproxy.com/fr/documentation/aloha/7-0/traffic-management/lb-layer7/http-rewrite/#rewrite-anywhere)
     */
    pathRewrite?: string;
    /**
     * Service name (dns host) - Required
     */
    serviceName: string;
    /**
     * Exposed port service - Default to 8080
     */
    servicePort?: number;
}

/**
 * Rules configuration
 */
export interface IngressDefinition {
    /**
     * Let's encrypt expiration email
     * Required for certificate creation
     */
    tlsEmail?: string;
    /**
     * Wildcard domains (eg. mydomain.com) list.
     * Certificates must be created manually and copied in /etc/letsencrypt
     */
    wildcardDomains?: string[];
    /**
     * Regex pattern to resolve tenant from uri host name (optional)
     * Used to set x-vulcain-tenant header, if no rule.tenant is provided
     */
    defaultTenantPattern?: string;
    /**
     * Rule list
     */
    rules: Array<RuleDefinition>;
}