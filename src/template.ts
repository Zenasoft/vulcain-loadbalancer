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

    get configFileName() {
        let configFileName = Path.join(this.proxyManager.engine.configurationsFolder, this.def.env + ".cfg");
        return configFileName;
    }

    constructor(public proxyManager: ProxyManager, private def: IngressDefinition) {
        if (!def.env)
            def.env = "default";
    }

    // see https://github.com/tutumcloud/haproxy
    //     https://serversforhackers.com/load-balancing-with-haproxy
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

    async transform(dryrun: boolean) {
        let newConfig: string = "";

        this.frontends = [];
        this.backends = [""];

        if (await this.emitBinding(dryrun)) {

            this.frontends.push("  mode http");
            this.frontends.push("  http-request del-header ^x-vulcain"); // remove all incoming headers beginning with x-vulcain
            //this.frontends.push("  option httplog");
            //this.frontends.push("  option dontlognull");
            //this.frontends.push("  log global");

            await this.emitFronts();

            newConfig = this.frontends.join('\n');
            newConfig += this.backends.join('\n');

            return newConfig;
        }

        return null;
    }

    getCurrentHaproxyConfiguration() {
        let fn = this.configFileName;
        if (fs.existsSync(fn)) {
            return fs.readFileSync(fn, 'utf8');
        }
        return "";
    }

    /**
     * Emit front definition with ssl certificats list for all tenants
     * Bind on port 443
     *
     * @private
     *
     * @memberOf Template
     */
    private async emitBinding(dryrun: boolean) {
        this.frontends.push("frontend " + this.def.env);

        if (CONTEXT.isTest()) {
            this.frontends.push(`  bind *:80`);
            return true;
        }

        // Create certificates list for https binding
        let crtList = [];
        let crtFileName = Path.join(this.proxyManager.engine.configurationsFolder, "list.crt");
        let hasFrontEnds = false;

        if (this.def.rules) {
            for (const rule of this.def.rules) {
                hasFrontEnds = true;
                if (rule && rule.tlsDomain) {
                    let domainName = rule.tlsDomain;
                    try {
                        let dn = domainName;
                        if (domainName.startsWith("*.")) // Can be a wildward domain
                            dn = domainName.substr(2);

                        if (dn) {
                            let fullName = Path.join(this.proxyManager.engine.certificatesFolder, dn, "haproxy.pem").toLowerCase();
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
                        util.log("Creating certificate for domain " + domainName + " failed. " + e.message);
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

    /**
     * Try to set x-vulcain-tenant header based on domain name
     */
    private emitFronts() {

        // Default rule for tenant resolution
        if (this.def.defaultTenantPattern) {
            this.frontends.push("  http-request set-header x-vulcain-tenant pattern:" + this.def.defaultTenantPattern);
        }
        else {
            this.frontends.push("  http-request set-header x-vulcain-tenant ?"); // must be resolved by the service
        }

        let acls = {};
        let cx = 0;
        if (this.def.rules) {
            for (const rule of this.def.rules) {
                // Validation
                if (!rule.hostName && !rule.path) {
                    // Error
                    continue;
                }

                // TODO Check if rule.hostName + rule.pathPrefix exists* ?

                cx++;
                let domainName = rule.hostName;
                let acl = acls[domainName] || cx;
                if (domainName)
                    acls[domainName] = acl;

                if (rule.hostName) {
                    this.frontends.push("  # " + rule.hostName);
                    this.frontends.push("  acl host_" + acl + " hdr(host) -i " + domainName);

                    if (rule.tenant) {
                        this.frontends.push("  http-request set-header x-vulcain-tenant " + rule.tenant + " if host_" + acl);

                        if (CONTEXT.isTest()) {
                            // http://test/api/...?$tenant=(tenant)
                            this.frontends.push("  acl host_" + acl + "_test url_param($tenant) -i " + rule.tenant);
                            this.frontends.push("  http-request set-header x-vulcain-tenant " + rule.tenant + " if host_" + acl + "_test");
                        }
                    }
                }
                this.emitBackends(rule, acl);
            }
        }
    }

    private emitBackends(rule: RuleDefinition, index: number) {
        let serviceName = `${this.def.env}_${rule.serviceName.replace(/\./g, "-")}_${index}`;

        let backend = "backend_" + serviceName;
        let aclIf = rule.hostName ? " if host_" + index : " if";

        let publicPath: string;
        if (rule.path) {
            if (rule.path === '/') {
                publicPath = "/(.*)?$"
            }
            else {
                if (rule.path[0] !== '/') {
                    publicPath = `/${rule.path}([?\\#/].*)?$`;
                }
                else {
                    publicPath = `${rule.path}([?\\#/].*)?$`;
                }
            }

            let acl = backend + "_public_acl";
            this.frontends.push("  acl " + acl + " path_reg ^" + publicPath);
            aclIf = aclIf + " " + acl;
        }

        // if (rule.tenant) {
        //     let acl = backend + "_tenant_acl";
        //     this.backends.push("  acl " + acl + " req.fhdr(x-vulcain-tenant) -i " + rule.tenant);
        //     if (aclIf)
        //         aclIf += " " + acl;
        //     else
        //         aclIf = " if " + acl;
        // }

        this.frontends.push("  use_backend " + backend + aclIf);

        this.backends.push("");
        this.backends.push("# " + rule.serviceName);
        this.backends.push("backend " + backend);

        this.backends.push("  option forwardfor");
        this.backends.push("  http-request set-header X-Forwarded-Port %[dst_port]");
        this.backends.push("  http-request add-header X-Forwarded-Proto https if { ssl_fc }");
        this.backends.push("  mode http");

        // Publicpath rewriting
        if (rule.pathPrefix && publicPath) {
            this.backends.push(`  http-request add-header x-vulcain-publicpath ${rule.path}`);
            this.backends.push("  reqrep ^([^\\ :]*)\\ " + publicPath + "  \\1\\ /" + rule.pathPrefix + "\\2");
        }

        this.backends.push("  server " + serviceName + " " + rule.serviceName + ":" + (rule.servicePort || "8080"));
    }
}