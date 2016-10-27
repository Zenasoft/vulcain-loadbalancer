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
const express = require('express');
const bodyParser = require('body-parser');
import { Template } from './template';
import * as http from 'http'
import { ProxyManager } from './proxyManager';
import { ServiceDefinitions } from './model';
import { EngineFactory, IEngine } from './host';
const app = express();

export class Server {

    private proxyManager: ProxyManager;

    constructor(engine:IEngine) {
        this.proxyManager = new ProxyManager(engine);

        app.use(bodyParser.json());
        app.use(express.static("/app/letsencrypt"));

        app.post('/update', (req, res) => this.updateConfiguration(req, res));
        app.post('/restart', (req, res) => this.restart(req, res));
        app.get('/health', function (req, res) { res.end(); });
    }

    start() {
        // Start server
        app.listen(29000, (err) => {
            if (err) {
                util.log(err);
                process.exit(1);
                return;
            }

            util.log("Load balancer ready. Listening on port 29000");

            // When server is initialized, run haproxy with a initial configuration
            //
            this.proxyManager
                .startProxy(true)
                .then(() => {
                    setTimeout(this.initialize.bind(this), 2000); // wait for haproxy running
                })
                .catch(err => {
                    util.log(err);
                    process.exit(1);
                });
        });
    }

    private initialize() {
        this.bootstrapAsync().then((result: any) => {
            let error = result.error;
            if (!error) {
                if (result.status / 100 > 2)
                    error = result.data;
                else {
                    try {
                        let response = JSON.parse(result.data);
                        if (response.error) {
                            error = response.error.message;
                        }
                        else {
                            let def = response.value;
                            if (def.tenants && def.services) {
                                let tpl = new Template(this.proxyManager, def);
                                tpl.transform();
                                tpl.proxyManager.purge(def.tenants);
                            }
                            else {
                                util.log("No configurations founded.");
                            }
                        }
                    }
                    catch (e) {
                        error = e;
                    }
                }
            }
            if (error)
                util.log("Error on bootstrap " + error);
        });
    }

    // -------------------------------------------------------------------
    // Reload configuration
    // -------------------------------------------------------------------
    private async updateConfiguration(req, res) {
        try {
            util.log("Updating configuration");
            let def: ServiceDefinitions = req.body;
            if (def) {
                let tpl = new Template(this.proxyManager, def);
                await tpl.transform();

                // Remove unused certificates
                util.log("Updating domains");
                this.proxyManager.purge(def.tenants);

                res.end("OK");
            }
            else {
                util.log("Error: empty config");
                res.status(400).end();
            }
        }
        catch (e) {
            util.log(e);
            res.status(400).send(e);
        }
    }

    // -------------------------------------------------------------------
    // Restart
    // -------------------------------------------------------------------
    private restart(req, res) {
        util.log("Restarting haproxy");
        this.proxyManager.restart();
        res.end();
    }

    /**
     * First run
     *
     * @returns
     *
     * @memberOf Server
     */
    private bootstrapAsync() {
        let manager = process.env.VULCAIN_SERVER;
        if (!manager) {
            util.log("ERROR: VULCAIN_SERVER must be defined");
            process.exit(1);
        }
        let cluster = process.env.VULCAIN_ENV;
        if (!cluster) {
            util.log("ERROR: VULCAIN_ENV must be defined");
            process.exit(1);
        }
        let token = process.env.VULCAIN_TOKEN;
        if (!token) {
            util.log("ERROR: You must provided a token.");
            process.exit(1);
        }

        util.log(`Getting proxy configuration for cluster ${cluster} on ${manager}`);

        // Getting information from vulcain server for initialize config
        let parts = manager.split(':');
        let opts: http.RequestOptions = {
            method: "get",
            path: "/api/service.getproxyconfiguration?cluster=" + cluster,
            host: parts[0],
            port: parts.length > 1 ? parseInt(parts[1]) : 80,
            headers: {
                "Authorization": "ApiKey " + token
            }
        };

        return new Promise((resolve, reject) => {
            let req = http.request(opts, (res) => {
                let data = '';
                res.on('data', (chunk) => {
                    data += chunk;
                });
                res.on('end', () => {
                    resolve({ status: res && res.statusCode, data: data });
                });
            });
            req.on('error', (e) => {
                resolve({ error: e });
            });
            req.end();
        });
    }
}