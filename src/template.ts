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
import { ServiceDefinitions, ServiceDefinition } from './model';
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
        let configFileName = Path.join(this.proxyManager.engine.configurationsFolder, this.def.cluster + ".cfg");
        return configFileName;
    }

    constructor(public proxyManager: ProxyManager, private def: ServiceDefinitions) {
        if(!def.cluster)
            def.cluster = "default";
    }

    // see https://github.com/tutumcloud/haproxy
    //     https://serversforhackers.com/load-balancing-with-haproxy
    async transform() {

        util.log("Generating new haproxy configuration file...");

        this.frontends = [];
        this.backends = [];

        this.frontends.push(
            "frontend " + this.def.cluster
        );

        let newConfig: string = "";
        this.backends.push("");

        let hasFrontends: boolean = true;
        if (this.proxyManager.engine.isTestServer()) {
            await this.emitTestFront();
        }
        else {
            hasFrontends = await this.emitFront();
        }

        if (hasFrontends) {
            for (let service of this.def.services) {
                this.emitBackends(service);
            }

            newConfig = this.frontends.join('\n');
            newConfig += this.backends.join('\n');
        }

        if (!hasFrontends || !newConfig) {
            shell.rm(this.configFileName);
        }
        else {
            fs.writeFileSync(this.configFileName, newConfig);
        }
        this.proxyManager.restart();
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
    private async emitFront() {
        let crtList = [];
        let crtFileName = Path.join(this.proxyManager.engine.configurationsFolder, "list.crt");
        let hasFrontEnds = false;

        for (const tenant of this.def.tenants) {
            if (tenant) {
                let domainName = tenant.domain;
                try {
                    await this.proxyManager.createCertificate(domainName, tenant.email);
                    crtList.push(Path.join(this.proxyManager.engine.certificatesFolder, domainName, "haproxy.pem"));
                    hasFrontEnds = true;
                }
                catch (e) {
                    util.log("Creating certificate for domain " + domainName + " failed. " + e.message);
                }
            }
        }

        fs.writeFileSync(crtFileName, crtList.join('\n'));

        this.frontends.push(`  bind *:${this.def.port || 443} ssl crt-list ${crtFileName}`);
        this.frontends.push("  mode http");
        this.frontends.push("  reqidel ^x-vulcain"); // remove all incoming headers beginning with x-vulcain
        //this.frontends.push("  option httplog");
        //this.frontends.push("  option dontlognull");
        //this.frontends.push("  log global");

        return hasFrontEnds;
    }

    /**
     * Try to set x-vulcain-tenant header based on domain name
     */
    private emitTenantRules() {
        // Default rule
        if (this.def.defaultTenantPattern) {
            this.backends.push("  http-request set-header x-vulcain-tenant pattern:" + this.def.defaultTenantPattern);
        }
        else {
            this.backends.push("  http-request set-header x-vulcain-tenant ?"); // must be resolved by the service
        }

        if (this.def.tenants) {
            for (const tenant of this.def.tenants) {
                // If a tenant has a name then use it
                if (tenant && tenant.name) {
                    let domainName = tenant.domain;
                    let acl = 'host_' + domainName.replace(/\./g, '');
                    this.backends.push("  acl " + acl + " hdr(host) -i " + tenant.domain);
                    this.backends.push("  http-request set-header x-vulcain-tenant " + tenant.name + " if " + acl);

                    if (this.proxyManager.engine.isTestServer()) {
                        // http://test/api/...?$tenant=(tenant)
                        this.backends.push("  acl " + acl + "_test url_param($tenant) -i " + tenant.name);
                        this.backends.push("  http-request set-header x-vulcain-tenant " + tenant.name + " if " + acl + "_test");
                    }
                }
            }
        }
    }

    private async emitTestFront() {
        this.frontends.push(`  bind *:${this.def.testPort || 80}`);
        this.frontends.push("  mode http");
    }

    private emitBackends(service: ServiceDefinition) {
        let serviceName = this.def.cluster + "_" + service.name;

        let backend = "backend_" + serviceName;
        let publicPath = service.path;
        if (publicPath) {
            // Filter backend by publicpath
            if (publicPath === '/') {
                publicPath = '';
            }
            else if (publicPath[0] !== '/') {
                publicPath = '/' + publicPath;
            }
            let acl = backend + "_public_acl";
            this.frontends.push("  acl " + acl + " path_reg ^" + publicPath + "/?([?\\#/].*)?$");
            this.frontends.push("  use_backend " + backend + " if " + acl);
        }
        else {
            // Use always this backend
            this.frontends.push("  use_backend " + backend);
        }

        this.backends.push("");
        this.backends.push("backend " + backend);

        this.backends.push("  option forwardfor");
        this.backends.push("  http-request set-header X-Forwarded-Port %[dst_port]");
        this.backends.push("  http-request add-header X-Forwarded-Proto https if { ssl_fc }");

        this.backends.push("  mode http");

        this.emitTenantRules();

        if (service.pathPrefix) {
            // Publicpath rewriting
            if (publicPath) {
                this.backends.push(`  http-request add-header x-vulcain-publicpath ${publicPath}`);
                this.backends.push("  reqrep ^([^\\ ]*)\\ " + publicPath + "([?\\#/].*)?   \\1\\ /" + service.pathPrefix + "\\2");
            }
            else if (service.path) { // means /
                this.backends.push(`  http-request add-header x-vulcain-publicpath  /`);
                this.backends.push("  reqrep ^([^\\ :]*)\\ /(.*)   \\1\\ /" + service.pathPrefix + "\\2");
            }
        }

        this.backends.push("  server " + serviceName + " " + service.name + ":" + (service.port || "8080"));
    }
}