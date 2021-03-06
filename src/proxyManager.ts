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
import { RuleDefinition, CONTEXT, IngressDefinition } from './model';
import { IEngine } from './host';
const util = require('util');
const fs = require('fs');
import * as Path from 'path';

/**
 *
 */
export class ProxyManager {
    private restarting = false;
    private firstTime: boolean = true;

    constructor(public engine: IEngine) {
    }

    // -------------------------------------------------------------------
    // Restart proxy
    // -------------------------------------------------------------------
    restart() {
        // Simulate rx.debounce
        let self = this;
        if (!this.restarting) {
            this.restarting = true;
            setTimeout(function () {
                self.startProxy()
                    .then(() => { self.restarting = false; })
                    .catch(e => { self.restarting = false; });
            }, 2000);
        }
    }

    // -------------------------------------------------------------------
    // combines all config file
    // -------------------------------------------------------------------
    private createConfigFileArguments() {
        const folder = this.engine.configurationsFolder;

        const defaultName = CONTEXT.isTest() ? "test" : "global";
        var args = ["-f " + Path.join(folder, defaultName + ".default")];
        try {
            var files = fs.readdirSync(folder);
            // Take all .cfg files
            files.forEach(function (file: string, index) {
                if (!file.endsWith(".cfg")) {
                    return;
                }
                var fullPath = Path.join(folder, file);
                args.push("-f " + fullPath);
            });
        }
        catch (e) {
            return null;
        }
        return args.join(" ");
    }

    // -------------------------------------------------------------------
    // Start or restart proxy
    // -------------------------------------------------------------------
    public startProxy() {

        const configFile = this.createConfigFileArguments();

        if (configFile) {
            // First time just start haproxy
            //  -p /var/haproxy/haproxy.pid : Tell haproxy to store process id and child process id in haproxy.pid
            //  -f /var/haproxy/haproxy.cfg ... : use a specific config file (works with share volume with service discover)
            if (this.firstTime) {
                this.firstTime = false;
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
        else {
            return Promise.resolve(true);
        }
    }

    purge(def: IngressDefinition) {
        if (!def || !def.rules) {
            return;
        }

        fs.exists(this.engine.certificatesFolder, exists => {
            if (!exists) {
                return;
            }

            fs.readdir(this.engine.certificatesFolder, (err, folders) => {
                if (err) {
                    util.log("Error when trying to purge certificates " + err);
                    return;
                }

                let activeDomains =
                    def.rules.filter(d => d.tlsDomain).map(d => d.tlsDomain)
                        // Do not revoke a wildcard domain
                        .concat(def.wildcardDomains);

                for (let folder of folders) {
                    if (activeDomains.find(d => d === folder)) {
                        continue;
                    }

                    this.engine.revokeCertificate(def.tlsEmail, this.engine.certificatesFolder, folder);
                }
            });
        });
    }

    createCertificate(domain: string, email: string) {
        return new Promise((resolve, reject) => {
            fs.exists(Path.join(this.engine.certificatesFolder, domain), exists => {
                if (!exists) {
                    this.engine.createCertificateAsync(domain, email)
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