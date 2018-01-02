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
const util = require('util');
import * as fs from 'fs';
import * as express from 'express';
const bodyParser = require('body-parser');
import { Template } from './template';
import * as http from 'http';
import { ProxyManager } from './proxyManager';
import { ServiceDefinitions } from './model';
import { IEngine } from './host';
const app = express();
const YAML = require('yamljs');

export class Server {

    private proxyManager: ProxyManager;

    constructor(engine: IEngine) {
        this.proxyManager = new ProxyManager(engine);

        app.use(bodyParser.json());
        app.use(express.static("/app/letsencrypt"));

        app.post('/update', (req: express.Request, res: express.Response) => this.updateConfiguration(req, res));
        app.post('/restart', (req: express.Request, res: express.Response) => this.restart(req, res));
        app.get('/health', (req: express.Request, res: express.Response) => { res.end(); });
        app.get('/infos', (req: express.Request, res: express.Response) => { this.showInfos(req.query.env, res); });
    }

    start() {
        if (this.proxyManager.engine.isTestServer) {
            util.log("*** Test mode enabled. ***")
        }

        // Start server
        app.listen(29000, (err) => {
            if (err) {
                util.log(err);
                process.exit(1);
                return;
            }

            util.log("Load balancer ready. Listening on port 29000");

            // When server is initialized, run haproxy with initial configuration
            //
            this.proxyManager
                .startProxy()
                .then(() => {
                    setTimeout(this.initialize.bind(this), 2000); // waiting for haproxy running
                })
                .catch(err => {
                    util.log(err);
                    process.exit(1);
                });
        });
    }

    private initialize() {
        this.bootstrapAsync().then((result: any) => {
            if (!result) {
                return;
            }
            let error = result.error;
            if (!error) {
                if (result.status / 100 > 2) {
                    error = result.data;
                }
                else {
                    let def = result.def;
                    if (def.tenants && def.services) {
                        let tpl = new Template(this.proxyManager, def);
                        tpl.transform();
                        tpl.proxyManager.purge(def.tenants);
                    }
                    else {
                        util.log("No configuration founded. Proxy is not started. Waiting for new configuration ...");
                    }
                }
            }
            if (error) {
                util.log("Error on bootstrap " + error);
            }
        });
    }

    // -------------------------------------------------------------------
    // Reload configuration
    // -------------------------------------------------------------------
    private async updateConfiguration(req: express.Request, res: express.Response) {
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
    private restart(req: express.Request, res: express.Response) {
        util.log("Restarting haproxy");
        this.proxyManager.restart();
        res.end();
    }

    /**
     * First run
     * Try to get service definitions from vulcain server or config file
     *
     * @returns
     *
     * @memberOf Server
     */
    private bootstrapAsync() {
        var services = {};
        var folder = process.env["CONFIG_FOLDER"];
        var fn = (folder ? folder + "/" : "") + "services.yaml";
        if( fs.existsSync(fn)) {
            try {
                services = YAML.parse(fs.readFileSync(fn, 'utf8'));
            }
            catch(e) {
                util.log("Error when loading services.yaml - ", e.message);
                process.exit(1);
            }
        }
        let manager = process.env.VULCAIN_SERVER;
        if (!manager) {
            return Promise.resolve({def:services});
        }
        let cluster = process.env.VULCAIN_ENV;
        let token = process.env.VULCAIN_TOKEN;
        if (!token) {
            util.log("ERROR: You must provided a token.");
            process.exit(1);
        }

        util.log(`Getting proxy configuration for environment ${cluster} on ${manager}`);

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
                let data:any = '';
                res.on('data', (chunk) => {
                    data += chunk;
                });
                res.on('end', () => {
                    let error;
                    let def = {};
                    let status = res.statusCode
                    if (status / 100 > 2) {
                        error = data;
                    }
                    else {
                        try {
                            let response = JSON.parse(data);
                            if (response.error) {
                                error = response.error.message;
                            }
                            else {
                                def = response.value;
                            }
                        }
                        catch(e) {
                            error = e.message;
                        }
                    }

                    resolve({ error, def: {...services, def} });
                });
            });
            req.on('error', (e) => {
                resolve({ error: e });
            });
            req.end();
        });
    }

    private showInfos(env: string, res: express.Response) {
        let tpl = new Template(this.proxyManager, <any>{ cluster: env });
        let cfg = tpl.getCurrentHaproxyConfiguration();
        res.send({ config: cfg }); // TODO log
    }
}