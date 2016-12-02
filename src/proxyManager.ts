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
import { TenantDefinition } from './model';
import { IEngine } from './host';
const util = require('util');
const fs = require('fs');
import * as Path from 'path';

export class ProxyManager {
    private restarting = false;

    constructor(public engine: IEngine) {
    }

    // -------------------------------------------------------------------
    // Define web api used to restart haproxy
    // -------------------------------------------------------------------
    restart() {
        // Simulate rx.debounce
        let self = this;
        if (!this.restarting) {
            this.restarting = true;
            setTimeout(function () {
                self.startProxy(false);
                self.restarting = false;
            }, 2000);
        }
    }

    // -------------------------------------------------------------------
    // combines all config file (one by cluster + default)
    // -------------------------------------------------------------------
    private createConfigFileArguments() {
        const folder = this.engine.configurationsFolder;

        const defaultName = this.engine.isTestServer() ? "test" : "global";
        var args = ["-f " + Path.join(folder, defaultName + ".default")];
        try {
            var files = fs.readdirSync(folder);
            files.forEach(function (file: string, index) {
                if (!file.endsWith(".cfg")) {
                    return;
                }
                var fullPath = Path.join(folder, file);
                args.push("-f " + fullPath);
            });
        }
        catch (e) {
            return;
        }
        return args.join(" ");
    }

    // -------------------------------------------------------------------
    // Start or restart proxy
    // -------------------------------------------------------------------
    public startProxy(firstTime: boolean) {

        const configFile = this.createConfigFileArguments();

        // First time just start haproxy
        //  -p /var/haproxy/haproxy.pid : Tell haproxy to store process id and child process id in haproxy.pid
        //  -f /var/haproxy/haproxy.cfg ... : use a specific config file (works with share volume with service discover)
        if (firstTime) {
            util.log("Starting haproxy with " + configFile);
            return this.engine.processCommandAsync("haproxy " + configFile + " -p /var/run/haproxy.pid", "Start haproxy");
        }
        else {
            // Soft restart
            // -sf : tells haproxy to send sigterm to all pid of the old haproxy process when the new process is ready
            util.log("Restarting haproxy with " + configFile);
            return this.engine.processCommandAsync("haproxy " + configFile + " -p /var/run/haproxy.pid -sf $(cat /var/run/haproxy.pid)", "Restart haproxy");
        }
    }

    purge(domains: Array<TenantDefinition>) {
        fs.exists(this.engine.certificatesFolder, exists => {
            if (!exists) {
                return;
            }
            fs.readdir(this.engine.certificatesFolder, (err, folders) => {
                if (err) {
                    util.log("Error when trying to purge certificates " + err);
                    return;
                }

                let domainNames = domains.map(d => d.domain.toLowerCase());

                for (const folder of folders) {
                    if (domainNames.find(d => d === folder.toLowerCase())) {
                        continue;
                    }
                    this.engine.revokeCertificate(this.engine.certificatesFolder, folder);
                }
            });
        });
    }

    createCertificate(domain: string, email: string) {
        return new Promise((resolve, reject) => {
            fs.exists(Path.join(this.engine.certificatesFolder, domain), exists => {
                if (!exists) {
                    util.log("Creating certificate for " + domain);
                    this.engine.createCertificateAsync(domain, email || process.env["EXPIRATION_EMAIL"])
                        .then(resolve)
                        .catch(reject);
                }
                else {
                    resolve();
                }
            });
        });
    }
}