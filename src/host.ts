const util = require('util');
import * as childProcess from 'child_process';

export interface IEngine {
    /**
     * Folder for storing letsencrypt's certificates
     *  (/etc/letsencrypt/live)
     */
    certificatesFolder: string;
    /**
     * Haproxy configuration files
     */
    configurationsFolder: string;
    /**
     * Test server listen on port 80 and do not generate certificates
     * On test seever, you can simulates a tenant by providing a $tenant url parameter
     *
     * @memberOf IEngine
     */
    isTestServer(): boolean;
    /**
     * Execute a command
     *
     * @param {string} command
     * @param {string} message
     * @returns {Promise<any>}
     *
     * @memberOf IEngine
     */
    processCommandAsync(command: string, message: string): Promise<any>;
    /**
     * Execute a command
     *
     * @param {string} domain
     * @param {string} email
     * @returns {Promise<any>}
     *
     * @memberOf IEngine
     */
    createCertificateAsync(domain: string, email: string): Promise<any>;
}

class MockEngine implements IEngine {
    public certificatesFolder: string;
    public configurationsFolder: string;

    constructor() {
        this.certificatesFolder = "./data/certificates";
        this.configurationsFolder = "./data/config";
    }

    isTestServer() {
        return process.env.VULCAIN_TEST === "true";
    }

    // -------------------------------------------------------------------
    // Function called when a process is started
    // -------------------------------------------------------------------
    processCommandAsync(command: string, message: string): Promise<any> {
        util.log(`Running command ${command} - ${message}`);
        return Promise.resolve(true);
    }

    createCertificateAsync(domain: string, email: string): Promise<any> {
        util.log(`Create certificate for domain ${domain}`);
        return Promise.resolve(true);
    }
}

class HostEngine implements IEngine {

    public certificatesFolder = "/etc/letsencrypt/live";
    public configurationsFolder = "/var/haproxy";

    isTestServer() {
        return process.env.VULCAIN_TEST === "true";
    }

    processCommandAsync(command: string, message: string): Promise<any> {
        util.log("Running command " + command);

        return new Promise((resolve, reject) => {
            childProcess.exec(command, (error, stdout, stderr) => {
                if (!error) {
                    util.log("Success: " + message);
                    resolve(true);
                }
                else {
                    util.log("***** Error ***** " + message);
                    stdout && util.log(" stdout : " + stdout);
                    stderr && util.log(" stderr : " + stderr);
                    reject(error);
                }
            });
        });
    }

    createCertificateAsync(domain: string, email: string): Promise<any> {
        util.log("Creating certificate for domain " + domain);
        return new Promise((resolve, reject) => {
            childProcess.execFile("/app/cert-creation.sh", [domain, email || "ametge@sovinty.com"], { cwd: "/app" }, (err, stdout, stderr) => {
                if (err) {
                    util.log(`Error when creating certficate for ${domain} - ${err}`);
                    reject(err);
                }
                else {
                    util.log(`Certificate created for ${domain} - ${stdout}`);
                    resolve();
                }
            });
        });
    }
}

export class EngineFactory {
    private static _engine: IEngine;

    static createEngine(): IEngine {
        if (!EngineFactory._engine) {
            EngineFactory._engine = process.env.TEST ? new MockEngine() : new HostEngine();
        }
        return EngineFactory._engine;
    }
}