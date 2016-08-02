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

import * as fs from 'fs'
import * as childProcess from 'child_process'
import {ServiceDefinitions, BackendDefinition, ServiceDefinition} from './model';
const util = require('util');

// Create template for haproxy and notify proxy container to restart if
//  new config is not equal than the previous one.
// This code is not in the proxy container for updating. The current container can be
//  stopped and updating while the proxy container is running.
import {ProxyManager} from './proxyManager';

export class Template
{
    private backends: Array<string> = [];
    private frontends: Array<string> = [];
    private proxyManager: ProxyManager;

    constructor(private def: ServiceDefinitions) {
        this.proxyManager = new ProxyManager();
    }

// see https://github.com/tutumcloud/haproxy
//     https://serversforhackers.com/load-balancing-with-haproxy
    async transform() {

        util.log("Generating new haproxy configuration file...");

        this.frontends.push(
            "frontend " + this.def.clusterName
        );

        let https = this.def.domain.split(':');
        let domain = https[0];

        await this.proxyManager.createCertificate(domain, this.def.email);

        if (https.length === 1)
            https.push("443");
        this.frontends.push(`  bind *:${https[1]} ssl crt /etc/letsencrypt/live/${domain}/haproxy.pem`);

        //this.frontends.push("  bind *:80");
        //this.frontends.push("  redirect scheme https if !{ ssl_fc }");
        this.frontends.push("  mode http");

        for (let service of this.def.services) {
            this.emitFront(service);
            this.emitBackends(service);
        }

        let newConfig = this.frontends.join('\n');
        newConfig += this.backends.join('\n');
        let configFileName = "/var/haproxy/" + this.def.clusterName + ".cfg";

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

    private emitBackends(service: ServiceDefinition) {
        let serviceName = this.def.clusterName + "_" + service.name;

        let backend = "backend_" + serviceName;
        this.backends.push("");
        this.backends.push("backend " + backend);

        let publicPath = service.path;
        if (publicPath[0] === '/')
            publicPath = publicPath.substr(1);

        this.backends.push("  mode http");
        this.backends.push("  reqrep ^([^\\ :]*)\\ /(" + publicPath + ")([?\\#/]+)(.*)   \\1\\ /api\\3\\4");
        this.backends.push("  option forwardfor");
        this.backends.push("  http-request set-header X-Forwarded-Port %[dst_port]");
        this.backends.push("  http-request add-header X-Forwarded-Proto https if { ssl_fc }");

        this.backends.push("  server " + serviceName + " " + service.name + ":" + (service.port || "8080"));
    }

    private emitFront(service: ServiceDefinition) {

        let serviceName = this.def.clusterName + "_" + service.name;

        let backend = "backend_" + serviceName;
        let publicPath = service.path;
        if (publicPath[0] === '/')
            publicPath = publicPath.substr(1);

        let acl = backend + "_public_acl";
        this.frontends.push("  acl " + acl + " path_reg ^/" + publicPath + "[?\\#/]|^/" + publicPath + "$");
        this.frontends.push("  use_backend " + backend + " if " + acl);
    }
}