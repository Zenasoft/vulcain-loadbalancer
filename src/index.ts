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
const app = express();
import * as http from 'http'
import {ProxyManager} from './proxyManager';

let firstTime = true;
const folder = "/var/haproxy";

// -------------------------------------------------------------------
// Reload configuration
// -------------------------------------------------------------------
app.post('/update', function (req, res) {
    try {
        util.log("Updating configuration");
        let def = req.body;
        let tpl = new Template(def);
        tpl.transform();
        res.end("OK");
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

    util.log(`Getting proxy configuration for cluster ${cluster} on ${manager}`);

    let parts = manager.split(':');
    let opts: http.RequestOptions = {
        method: "get",
        path: "/api/v1/services/proxyConfiguration?env=" + cluster,
        host: parts[0],
        port: parts.length > 1 ? parseInt(parts[1]) : 80,
        headers: {
            "Authorization": "ApiKey 0ebb6e00-4383-11e6-81ea-3fc910c9cb8e"
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

bootstrapAsync().then((result: any) => {
    let error = result.error;
    if (!error) {
        if (result.status / 100 > 2)
            error = result.data;
        else {
            try {
                let def = JSON.parse( result.data );
                if (def.domain && def.services && def.backends) {
                    let tpl = new Template(def);
                    tpl.transform();
                }
                else {
                    util.log("No configurations founded.");
                }
                app.use(express.static("/app/letsencrypt"));
                app.use(bodyParser.urlencoded({ extended: true }));
                app.use(bodyParser.json());
                app.listen(29000, (err) => util.log("Load balancer ready. Listening on port 29000"));
            }
            catch (e) {
                error = e;
            }
        }
    }
    if(error)
        util.log("Error on bootstrap " + error);
});