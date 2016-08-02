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
import {Template} from './template';
import * as http from 'http'
import {ProxyManager} from './proxyManager';

let firstTime = true;
const folder = "/var/haproxy";

const app = express();
app.use(bodyParser.json());
app.use(express.static("/app/letsencrypt"));

// -------------------------------------------------------------------
// Reload configuration
// -------------------------------------------------------------------
app.post('/update', async function (req, res) {
    try {
        util.log("Updating configuration");
        let def = req.body;
        if (def) {
            let tpl = new Template(def);
            await tpl.transform();
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
});

// -------------------------------------------------------------------
// Restart
// -------------------------------------------------------------------
app.post('/restart', function (req, res) {
    util.log("Restarting haproxy");
    let proxy = new ProxyManager();
    proxy.restart();
    res.end();
});

function bootstrapAsync() {
    let manager = process.env.VULCAIN_SERVER;
    if (!manager) {
        util.log("ERROR: VULCAIN_SERVER must be defined");
        process.exit(1);
    }
    let cluster = process.env.VULCAIN_CLUSTER;
    if (!cluster) {
        util.log("ERROR: VULCAIN_CLUSTER must be defined");
        process.exit(1);
    }
    let token = process.env.VULCAIN_TOKEN;
    if (!token) {
        util.log("ERROR: You must provided a token.");
        process.exit(1);
    }

    util.log(`Getting proxy configuration for cluster ${cluster} on ${manager}`);

    let parts = manager.split(':');
    let opts: http.RequestOptions = {
        method: "get",
        path: "/api/v1/services/proxyConfiguration?env=" + cluster,
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

// -------------------------------------------------------------------
// START
// -------------------------------------------------------------------
util.log("vulcain load balancer - version 1.0.0");

app.listen(29000, (err) => {
    if (err) {
        console.log(err);
        process.exit(1);
        return;
    }

    util.log("Load balancer ready. Listening on port 29000");
    let proxyManager = new ProxyManager();
    proxyManager
        .startProxy(true)
        .then(() => {
            setTimeout(initialize, 2000); // wait for haproxy running
        })
        .catch(err => {
            console.log(err);
            process.exit(1);
        });
});

function initialize() {
    bootstrapAsync().then((result: any) => {
        let error = result.error;
        if (!error) {
            if (result.status / 100 > 2)
                error = result.data;
            else {
                try {
                    let def = JSON.parse(result.data);
                    if (def.domain && def.services) {
                        let tpl = new Template(def);
                        tpl.transform();
                    }
                    else {
                        util.log("No configurations founded.");
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
