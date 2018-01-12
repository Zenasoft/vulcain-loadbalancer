const util = require('util');
import * as childProcess from 'child_process';
import * as shell from 'shelljs';

/**
 * Host interaction
 */
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
     * Revoke a certificate (sync)
     *
     * @param {string} letsEncryptFolder
     * @param {string} domain
     *
     * @memberOf IEngine
     */
    revokeCertificate(letsEncryptFolder: string, domain: string);
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

    constructor() {
        this.certificatesFolder = "./data/certificates";
        shell.mkdir("-p", this.configurationsFolder);
    }

    get configurationsFolder() {
        return "./data/config"
    }

    isTestServer() {
        return true;
    }

    revokeCertificate(letsEncryptFolder: string, domain: string) {
        util.log("Revoke certificate " + domain);
    }

    // -------------------------------------------------------------------
    // Function called when a process is started
    // -------------------------------------------------------------------
    processCommandAsync(command: string, message: string): Promise<any> {
        util.log(`Running command ${command} - ${message}`);
        return Promise.resolve(true);
    }

    createCertificateAsync(domain: string, email: string): Promise<any> {
        util.log(`Create certificate for domain ${domain}
        --------------------------\n`);
        return Promise.reject(true);
    }
}

class HostEngine implements IEngine {

    public certificatesFolder = "/etc/letsencrypt/live";
    public configurationsFolder = "/var/haproxy";

    isTestServer() {
        return false;
    }

    revokeCertificate(letsEncryptFolder: string, domain: string) {
        const command = `certbot revoke -t -n --cert-path ${letsEncryptFolder}/${domain}/haproxy.pem`;
        util.log("Running command " + command);

        return new Promise((resolve, reject) => {

            shell.exec(command, (error, stdout, stderr) => {
                if (!error) {
                    console.log(stderr);
                    try {
                        util.log("Remove domain folder");
                        shell.rm("-rf", letsEncryptFolder + "/" + domain);
                        shell.rm("-rf", letsEncryptFolder + "/../archive/" + domain);
                        util.log("Remove domain renewal configuration");
                        shell.rm(letsEncryptFolder + "/../renewal/" + domain + ".conf");
                    }
                    catch (e) {
                        util.log(`Certificate revocation failed for domain ${domain}`);
                    }
                }
                else {
                    util.log(`Certificate revocation failed for domain ${domain}`);
                    console.log(stderr);
                }
                resolve();
            });
        });
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
            if (!email) {
                throw new Error("Validation email is required.");
            }
            childProcess.execFile("/app/cert-creation.sh", [domain, email], { cwd: "/app" }, (err, stdout, stderr) => {
                if (err) {
                    util.log(`Error when creating certificate for ${domain} - ${err}
                    -----------------------\n`);
                    reject();
                }
                else {
                    util.log(`Certificate created for ${domain} ${stdout}
                    ------------------------\n`);
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
            let test = (process.env.MODE || "").startsWith("test");
            EngineFactory._engine = test ? new MockEngine() : new HostEngine();
        }
        return EngineFactory._engine;
    }
}