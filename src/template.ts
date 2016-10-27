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
import * as fs from 'fs'
import * as childProcess from 'child_process'
import {ServiceDefinitions, ServiceDefinition} from './model';
const util = require('util');

// Create template for haproxy and notify proxy container to restart if
//  new config is not equal than the previous one.
// This code is not in the proxy container for updating. The current container can be
//  stopped and updating while the proxy container is running.
import {ProxyManager} from './proxyManager';
import * as http from 'http';

export class Template
{
    private backends: Array<string>;
    private frontends: Array<string>;

    constructor(public proxyManager: ProxyManager, private def: ServiceDefinitions) {
    }

// see https://github.com/tutumcloud/haproxy
//     https://serversforhackers.com/load-balancing-with-haproxy
    async transform() {

        util.log("Generating new haproxy configuration file...");

        this.frontends = [];
        this.backends = [];

        this.frontends.push(
            "frontend " + this.def.clusterName
        );

        this.backends.push("");

        if (this.proxyManager.engine.isTestServer())
            await this.emitTestFront();
        else
            await this.emitFront();

        for (let service of this.def.services) {
            this.emitBackends(service);
        }

        let newConfig = this.frontends.join('\n');
        newConfig += this.backends.join('\n');
        let configFileName = Path.join(this.proxyManager.engine.configurationsFolder, this.def.clusterName + ".cfg");

        //resolve(true);return;
        if (!newConfig) {
            let exists = fs.exists(configFileName);
            if (exists) {
                fs.unlinkSync(configFileName);
            }
        }
        else {
            fs.writeFileSync(configFileName, newConfig);
        }
        this.proxyManager.restart();
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

        for (const tenant of this.def.tenants) {
            if (tenant) {
                let domainName = tenant.domain
                await this.proxyManager.createCertificate(domainName, this.def.email);
                crtList.push( Path.join(this.proxyManager.engine.certificatesFolder, domainName, "haproxy.pem"));
            }
        }

        fs.writeFileSync(crtFileName, crtList.join('\n'));

        this.frontends.push(`  bind *:443 ssl crt-list ${crtFileName}`);

        this.frontends.push("  mode http");
        //this.frontends.push("  option httplog");
        //this.frontends.push("  option dontlognull");
        //this.frontends.push("  log global");

        for (const tenant of this.def.tenants) {
            if (tenant) {
                let domainName = tenant.domain
                let acl = 'host_' + domainName.replace(/\./g, '');
                this.frontends.push("  acl " + acl + " hdr(host) -i " + tenant.domain);
                this.frontends.push("  http-request set-header X-VULCAIN-TENANT " + tenant.name + " if " + acl);
            }
        }
    }

   private async emitTestFront() {
        this.frontends.push(`  bind *:80`);

        this.frontends.push("  mode http");

        for (const tenant of this.def.tenants) {
            if (tenant) {
                let domainName = tenant.domain
                let acl = 'host_' + domainName.replace(/\./g, '');
                // http://(domain)/.....
                this.frontends.push("  acl " + acl + " hdr(host) -i " + tenant.domain);
                // http://test/api/...?$tenant=(domain)
                this.frontends.push("  acl " + acl + " url_param($tenant) -i " + tenant.domain);
                // http://test/api/...?$tenant=(tenant)
                this.frontends.push("  acl " + acl + " url_param($tenant) -i " + tenant.name);
                this.frontends.push("  http-request set-header X-VULCAIN-TENANT " + tenant.name + " if " + acl);
            }
        }
    }

    private emitBackends(service: ServiceDefinition) {
        let serviceName = this.def.clusterName + "_" + service.name;

        let backend = "backend_" + serviceName;
        let publicPath = service.path;
        if (publicPath) {
            if (publicPath[0] === '/')
                publicPath = publicPath.substr(1);

            let acl = backend + "_public_acl";
            this.frontends.push("  acl " + acl + " path_reg ^/" + publicPath + "[?\\#/]|^/" + publicPath + "$");
            this.frontends.push("  use_backend " + backend + " if " + acl);
        }
        else {
            this.frontends.push("  use_backend " + backend);
        }

        this.backends.push("");
        this.backends.push("backend " + backend);

        this.backends.push("  option forwardfor");
        this.backends.push("  http-request set-header X-Forwarded-Port %[dst_port]");
        this.backends.push("  http-request add-header X-Forwarded-Proto https if { ssl_fc }");

        this.backends.push("  mode http");

        if(publicPath)
            this.backends.push("  reqrep ^([^\\ :]*)\\ /(" + publicPath + ")([?\\#/]+)(.*)   \\1\\ /api\\3\\4");


        this.backends.push("  server " + serviceName + " " + service.name + ":" + (service.port || "8080"));
    }
}