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
import { IngressDefinition, CONTEXT, RuleDefinition } from './model';
import { IEngine } from './host';
const app = express();
const YAML = require('yamljs');

export class Server {

    private proxyManager: ProxyManager;
    private currentDefinition: IngressDefinition;

    constructor(engine: IEngine) {
        this.proxyManager = new ProxyManager(engine);

        app.use(bodyParser.json());
        app.use(express.static("/app/letsencrypt"));

        app.post('/update', (req: express.Request, res: express.Response) => this.updateConfiguration(req, res, false));
        app.post('/delete', (req: express.Request, res: express.Response) => this.updateConfiguration(req, res, true));
        app.post('/restart', (req: express.Request, res: express.Response) => this.restart(req, res));
        app.get('/health', (req: express.Request, res: express.Response) => { res.end(); });
        app.get('/status', (req: express.Request, res: express.Response) => { this.showInfos(req.query.env, res); });
    }

    start() {
        if (CONTEXT.isTest()) {
            util.log("*** Running in test mode. Listen to port 80 ***");
        }
        else if (CONTEXT.isDryRun()) {
            util.log("*** Running in dry-run mode ***");
        }

        // Start server
        app.listen(29000, async (err) => {
            if (err) {
                util.log(err);
                process.exit(1);
                return;
            }

            util.log("Load balancer ready. Listening on port 29000 for api management");

            // When server is initialized, run haproxy with initial configuration
            //
            try {
                await this.proxyManager.startProxy();
                setTimeout(this.initialize.bind(this), 2000); // waiting for haproxy running
            }
            catch (err) {
                util.log(err);
                process.exit(1);
            }
        });
    }

    /**
     * First initialization
     * Get initial configuration from local file or remote server (see bootstrapAsync) and
     *  create a new haproxy config file before starting it
     */
    private async initialize() {
        let result:any = await this.bootstrapAsync();

        if (!result) {
            return;
        }

        let error = result.error;
        if (!error) {
            if (result.status / 100 > 2) {
                error = result.data;
            }
            else {
                let def: IngressDefinition = result.def;
                try {
                    await this.initializeProxyFromConfiguration(def);
                }
                catch (e) {
                    error = e.message;
                }
            }
        }

        if (error) {
            util.log("Error on bootstrap " + error + ". Initial configuration is ignored.");
        }
    }

    private validateRule(rule: RuleDefinition, removeAction: boolean) {
        if (!rule.id) {
            throw new Error("id is required for rules");
        }
        if (removeAction)
            return;

        if (rule.tlsDomain && !this.currentDefinition.tlsEmail)
            throw new Error("tlsEmail is required for let's encrypt certificate creation");

        if (!rule.hostName && rule.tlsDomain && !rule.tlsDomain.startsWith("*.")) {
            rule.hostName = rule.tlsDomain;
        }
        if (!rule.hostName && !rule.path) {
            throw new Error(`Rule ${rule.id} either hostName or path must be set`);
        }
        if (!rule.serviceName) {
            throw new Error(`Rule ${rule.id} serviceName is required`);
        }
    }

    private async initializeProxyFromConfiguration(def: IngressDefinition, removeRule = false) {
        let old = this.currentDefinition;
        try {
            if (!this.currentDefinition || !def) {
                this.currentDefinition = def;
                def && def.rules && def.rules.forEach(r => this.validateRule(r, false));
            }
            else {
                if (!this.currentDefinition)
                    this.currentDefinition = <any>{};

                // Merge with current
                Object.keys(def).forEach(key => {
                    let value = def[key];
                    if (key === "rules") {
                        let list = this.currentDefinition.rules || [];
                        for (const rule of value) {
                            // Validation
                            this.validateRule(rule, removeRule);

                            let oldIndex = list.findIndex(r => r.id === rule.id);
                            if (!removeRule) {
                                if (oldIndex < 0) {
                                    util.log('Rule ' + list[oldIndex].id + ' added');
                                    list.push(rule);
                                }
                                else {
                                    let v = { ...list[oldIndex], ...rule };
                                    util.log('Rule ' + list[oldIndex].id + ' updated.');
                                    list[oldIndex] = v;
                                }
                            }
                            else if (oldIndex >= 0) { // remove
                                util.log('Rule ' + list[oldIndex].id + ' removed');
                                list.splice(oldIndex);
                            }
                        }
                        value = list;
                    }
                    else if (removeRule) {
                        // Only remove rule
                        return;
                    }

                    this.currentDefinition[key] = value;
                });
            }

            if (this.currentDefinition && this.currentDefinition.rules) {
                let tpl = new Template(this.proxyManager, this.currentDefinition);
                await tpl.apply();

                // Remove unused certificates
                util.log("Pruning certificates");
                tpl.proxyManager.purge(this.currentDefinition.rules);
            }
            else {
                util.log("No configuration founded. Waiting for new configuration ...");
            }
        }
        catch (e) {
            util.log('Error occurs. Rollback configuration.');
            this.currentDefinition = old;
            throw e;
        }
    }

    // -------------------------------------------------------------------
    // Update configuration from api
    // Restart haproxy
    // -------------------------------------------------------------------
    private async updateConfiguration(req: express.Request, res: express.Response, removeRule: boolean) {
        try {
            removeRule ? util.log("Removing rule from api request") : util.log("Updating configuration from api request");

            let def: IngressDefinition = req.body;
            if (def) {
                try {
                    await this.initializeProxyFromConfiguration(def, removeRule);
                    res.end("OK");
                }
                catch (e) {
                    res.status(400).end(e.message);
                }
            }
            else {
                util.log("Error: Empty configuration.");
                res.status(400).end();
            }
        }
        catch (e) {
            util.log(e);
            res.status(400).send(e);
        }
    }

    // -------------------------------------------------------------------
    // Restart haproxy with the same configuration (from api)
    // -------------------------------------------------------------------
    private restart(req: express.Request, res: express.Response) {
        util.log("Restarting haproxy...");
        this.proxyManager.restart();
        res.end();
    }

    /**
     * First run
     * Try to get service definitions from vulcain server or config file
     */
    private bootstrapAsync() {
        var services = {};

        var fn = process.env["CONFIG_FILE"] || "/etc/vulcain/services.yaml";
        if (fs.existsSync(fn)) {
            try {
                util.log("Loading configuration file from " + fn);
                services = YAML.parse(fs.readFileSync(fn, 'utf8'));
            }
            catch (e) {
                util.log("Error when loading services.yaml - ", e.message);
                process.exit(1);
            }
        }

        let vulcainAddress = process.env.VULCAIN_SERVER;
        if (!vulcainAddress) {
            return Promise.resolve({ def: services });
        }

        return this.getConfigurationFromVulcainServer(vulcainAddress, services);
    }

    private getConfigurationFromVulcainServer(vulcainAddress: string, services: any) {

        let env = process.env.VULCAIN_ENV;
        let token = process.env.VULCAIN_TOKEN;
        if (!token) {
            util.log("ERROR: Token is required for getting configuration from vulcain server.");
            process.exit(1);
        }

        util.log(`Getting proxy configuration for environment ${env} on ${vulcainAddress}`);

        // Getting information from vulcain server for initialize config
        let parts = vulcainAddress.split(':');
        let opts: http.RequestOptions = {
            method: "get",
            path: "/api/service.config?env=" + env,
            host: parts[0],
            port: parts.length > 1 ? parseInt(parts[1]) : 80,
            headers: {
                "Authorization": "ApiKey " + token
            }
        };

        return new Promise((resolve, reject) => {
            let req = http.request(opts, (res) => {
                let data: any = '';
                res.on('data', (chunk) => {
                    data += chunk;
                });
                res.on('end', () => {
                    let error;
                    let def = {};
                    let status = res.statusCode;
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
                        catch (e) {
                            error = e.message;
                        }
                    }

                    resolve({ error, def: Object.assign(services, def) });
                });
            });
            req.on('error', (e) => {
                resolve({ error: e });
            });
            req.end();
        });
    }

    private async showInfos(env: string, res: express.Response) {
        if (this.currentDefinition) {
            const tpl = new Template(this.proxyManager, this.currentDefinition);
            res.send({ def: this.currentDefinition, proxy: await tpl.transform(true) });
        }
        else {
            res.send({ def: "<no configuration>" });
        }
    }
}