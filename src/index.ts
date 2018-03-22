import { Server } from './server';
import { EngineFactory } from './host';
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
const pkg = require('../package.json');

// -------------------------------------------------------------------
// START
// -------------------------------------------------------------------
util.log("Vulcain load balancer - version " + pkg.version);

process.on('unhandledRejection', function(reason, p){
    console.log("Unhandled rejection at: Promise ", p, " reason: ", reason);
});

const engine = EngineFactory.createEngine();
const server = new Server(engine);
server.start();