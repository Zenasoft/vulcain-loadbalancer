//   Licensed under the Apache License, Version 2.0 (the "License");
//   you may not use this file except in compliance with the License.
//   You may obtain a copy of the License at
//
//       http://www.apache.org/licenses/LICENSE-2.0
//
//   Unless required by applicable law or agreed to in writing, software
//   distributed under the License is distributed on an "AS IS" BASIS,
//   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
//   See the License for the specific language governing permissions and
//   limitations under the License.
//
//    Copyright (c) Zenasoft
//
import * as Path from 'path';
import * as fs from 'fs';
import { IngressDefinition, RuleDefinition, CONTEXT } from './model';
const util = require('util');

// Create template for haproxy and notify proxy container to restart if
//  new config is not equal than the previous one.
// This code is not in the proxy container for updating. The current container can be
//  stopped and updating while the proxy container is running.
import { ProxyManager } from './proxyManager';
import * as shell from 'shelljs';

/**
 *  Haproxy configuration generator from template
 */
export class Template {
    private backends: Array<string>;
    private frontends: Array<string>;
    private configFileName: string;

    constructor(public proxyManager: ProxyManager, private def: IngressDefinition) {
        this.configFileName = Path.join(this.proxyManager.engine.configurationsFolder, "services.cfg");
    }

    // see https://github.com/tutumcloud/haproxy
    //     https://serversforhackers.com/load-balancing-with-haproxy
    /**
     * Generate config and restart haproxy
     */
    async apply() {
        util.log("Generating new haproxy configuration file...");

        const config = await this.transform(false);
        if (config) {
            fs.writeFileSync(this.configFileName, config);
        }
        else {
            shell.rm(this.configFileName);
        }

        this.proxyManager.restart();
    }

    /**
     * Generate config and generate new certificates
     * @param dryrun Do not generate certificates
     */
    async transform(dryrun: boolean) {
        let newConfig: string = "";

        this.frontends = [];
        this.backends = [""];

        if (await this.emitBinding(dryrun)) {

            this.frontends.push("  mode http");
            this.frontends.push("  http-request del-header ^x-vulcain"); // remove all incoming headers beginning with x-vulcain

            await this.emitFronts();

            newConfig = this.frontends.join('\n');
            newConfig += this.backends.join('\n');

            return newConfig;
        }

        return null;
    }

    /**
     * Emit front definition with ssl certificats list for all tenants
     * Bind on port 443 or port 80 in test mode
     */
    private async emitBinding(dryrun: boolean) {
        this.frontends.push("frontend vulcain");

        if (CONTEXT.isTest()) {
            this.frontends.push(`  bind *:80`);
            return true;
        }

        // Create certificates list for https binding
        let crtFileName = Path.join(this.proxyManager.engine.configurationsFolder, "list.crt");
        let crtList = this.def.wildcardDomains.map(this.createCertificateFileName.bind(this))

        let hasFrontEnds = false;

        if (this.def.rules) {
            for (const rule of this.def.rules) {
                hasFrontEnds = true;
                if (rule && rule.tlsDomain) {
                    let domainName = rule.tlsDomain;

                    try {
                        if (domainName) {
                            let fullName = this.createCertificateFileName(domainName);
                            if (crtList.indexOf(fullName) < 0) {
                                if (!dryrun) {
                                    // Ensures certificate exist
                                    await this.proxyManager.createCertificate(domainName, this.def.tlsEmail);
                                }
                                crtList.push(fullName);
                            }
                        }
                    }
                    catch (e) {
                        util.log("Certificate creation for domain " + domainName + " failed. " + e.message);
                    }
                }
            }
        }
        if (!dryrun) {
            fs.writeFileSync(crtFileName, crtList.join('\n'));
        }

        if (crtList.length > 0) {
            this.frontends.push(`  bind *:443 ssl crt-list ${crtFileName}`);
        }
        else {
            this.frontends.push(`  bind *:80`);
        }

        return hasFrontEnds;
    }

    private createCertificateFileName(domainName: string) {
        return Path.join(this.proxyManager.engine.certificatesFolder, domainName, "haproxy.pem").toLowerCase();
    }

    /**
     * Emit frontend configurations
     */
    private emitFronts() {

        // Default rule for tenant resolution
        if (this.def.defaultTenantPattern) {
            this.frontends.push("  http-request set-header x-vulcain-tenant pattern:" + this.def.defaultTenantPattern);
        }
        else {
            this.frontends.push("  http-request set-header x-vulcain-tenant ?"); // must be resolved by the service
        }

        let cx = 0; // acl counter

        if (this.def.rules) {
            for (const rule of this.def.rules) {
                cx++;
                let domainName = rule.hostname;
                let aclIf = "if ";

                // Filter by hostname
                if (domainName) {
                    this.frontends.push("  # " + rule.hostname);
                    this.frontends.push("  acl acl_" + cx + " hdr(host) -i " + domainName);
                    aclIf = " if acl_" + cx;
                }

                // Filter by path
                let path: string;
                if (rule.path) {
                    if (rule.path === '/') {
                        path = "/(.*)?$"
                    }
                    else {
                        if (rule.path[0] !== '/') {
                            path = `/${this.normalizeRegex(rule.path)}(.*)?$`;
                        }
                        else {
                            path = `${this.normalizeRegex(rule.path)}(.*)?$`;
                        }
                    }
                    if (path[0] === "^")
                        path = path.substr(1);

                    let acl = "acl_path_" + cx;
                    this.frontends.push("  acl " + acl + " path_reg ^" + path);
                    aclIf = aclIf + " " + acl;
                }

                if (rule.tenant) {
                    this.frontends.push("  http-request set-header x-vulcain-tenant " + rule.tenant + aclIf);

                    if (CONTEXT.isTest()) {
                        // http://...?$tenant=(tenant)
                        this.frontends.push("  acl acl_test_" + cx + "_tenant url_param($tenant) -i " + rule.tenant);
                        this.frontends.push("  http-request set-header x-vulcain-tenant " + rule.tenant + aclIf + " acl_test_" + cx);
                    }
                }

                this.emitBackends(rule, aclIf, path, cx);
            }
        }
    }

    private emitBackends(rule: RuleDefinition, aclIf: string, path: string, cx: number) {

        let serviceName = `${rule.serviceName.replace(/\./g, "-")}_${cx}`;
        let backend = "backend_" + serviceName;

        this.frontends.push("  use_backend " + backend + aclIf);

        this.backends.push("");
        this.backends.push("# " + rule.serviceName);
        this.backends.push("backend " + backend);

        this.backends.push("  option forwardfor");
        this.backends.push("  http-request set-header X-Forwarded-Port %[dst_port]");
        this.backends.push("  http-request add-header X-Forwarded-Proto https if { ssl_fc }");
        this.backends.push("  mode http");

        // Path rewriting
        if (rule.pathRewrite && path) {
            this.backends.push(`  http-request add-header x-vulcain-publicpath ${rule.path}`);
            let rw = rule.pathRewrite;
            let parts = rw.split(':');
            if (parts.length === 1) {
                // Replace path by pathRewrite
                this.backends.push("  reqrep ^([^\\ :]*)\\ " + path + "  \\1\\ " + rw + "\\2");
            } else if (parts.length === 2) {
                this.backends.push("  reqrep ^([^\\ :]*)\\ " + this.normalizeRegex(parts[0]) + "  \\1\\ " + this.normalizeRegex(parts[1]));
            }
            else {
                util.log(`Malformed rewriting path ${rw} is ignored for rule ${rule.id}`);
            }
        }

        if (rule.backendConfig) {
            let parts = rule.backendConfig.split(';').map(p => p && p.trim());
            parts.forEach(p => {
                if (p) {
                    this.backends.push(p);
                }
            });
        }
        this.backends.push("  server " + serviceName + " " + rule.serviceName + ":" + (rule.servicePort || "8080"));
    }

    private normalizeRegex(str: string): string {
        return str.replace(/\\\//g, '/')
            .replace(/\$(\d+)/g, (s, x) => String(+x + 1)); // $x -> \\(x+1)
    }
}