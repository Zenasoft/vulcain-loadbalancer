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
const childProcess = require('child_process');
const util = require('util');
const path = require('path');
const fs = require('fs');
const folder = '/var/haproxy';

export class ProxyManager {
    private _restart = false;
    private _firstTime = true;

    // -------------------------------------------------------------------
    // Define web api using to restart haproxy
    // -------------------------------------------------------------------
    restart() {
        // Simulate rx.debounce
        if (!this._restart) {
            this._restart = true;
            setTimeout(function () {
                this.startProxy();
                this.restart = false;
            }, 2000);
        }
    }

    // -------------------------------------------------------------------
    // combines all config file (one by cluster + default)
    // -------------------------------------------------------------------
    private createConfigFileArguments() {
        var args = [];
        try {
            var files = fs.readdirSync(folder);
            files.forEach(function (file, index) {
                var fullPath = path.join(folder, file);
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
    private startProxy() {

        var configFile = this.createConfigFileArguments();
        if (!configFile)
            return;

        // First time just start haproxy
        //  -p /var/haproxy/haproxy.pid : Tell haproxy to store process id and child process id in haproxy.pid
        //  -f /var/haproxy/haproxy.cfg ... : use a specific config file (works with share volume with service discover)
        if (this._firstTime) {
            util.log("Starting haproxy with " + configFile);
            childProcess.exec("haproxy " + configFile + " -p /var/run/haproxy.pid", this.processCallback);
        }
        else {
            // Soft restart
            // -sf : tells haproxy to send sigterm to all pid of the old haproxy process when the new process is ready
            util.log("Restarting haproxy with " + configFile);
            childProcess.exec("haproxy " + configFile + " -p /var/run/haproxy.pid -sf $(cat /var/run/haproxy.pid)", this.processCallback);
        }
    }

    // -------------------------------------------------------------------
    // Function called when a process is started
    // -------------------------------------------------------------------
    private processCallback(error, stdout, stderr) {
        if (!error) {
            this._firstTime = false;
            util.log("Haproxy restarted.");
        }
        else {
            util.log("***** Error ***** when starting haproxy")
            stdout && util.log(" stdout : " + stdout);
            stderr && util.log(" stderr : " + stderr);
        }
    }

    createCertificate(domain: string) {
        if (!fs.existsSync("/etc/letsencrypt/live/" + domain)) {
            console.log("Creating certificate for " + domain);
            let cmd = "certbot certonly --text -n --keep --email ametge@sovinty.com --agree-tos --webroot -w /app/letsencrypt -d " + domain;
            childProcess.exec(cmd, (err, stdout, stderr) => {
                if (err) {
                    util.log(`Error when creating certficate for ${domain} - ${err}`);
                }
                else {
                    util.log(`Certificate created for ${domain} - ${stdout}`);
                }
            });
        }
    }
}