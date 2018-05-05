const util = require('util');
import * as childProcess from 'child_process';
import * as shell from 'shelljs';
import { CONTEXT } from './model';
import * as Path from 'path';

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
     * Revoke a certificate (sync)
     *
     * @param {string} letsEncryptFolder
     * @param {string} domain
     *
     * @memberOf IEngine
     */
    revokeCertificate(email: string, letsEncryptFolder: string, domain: string);
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
        this.certificatesFolder = "./data/etc/letsencrypt/live";
        shell.mkdir("-p", this.configurationsFolder);
    }

    private lock(semaphore: string) {
        if (semaphore.startsWith("$$lock_"))
            return true; // simulate a lock to ignore this sempahore (it's itself)
        let lockFile = Path.join(this.certificatesFolder, "$$lock_" + semaphore);
        shell.mkdir(lockFile);
        return shell.error() == null;
    }

    private unlock(semaphore: string) {
        let lockFile = Path.join(this.certificatesFolder, "$$lock_" + semaphore);
        shell.rm("-rf", lockFile);
    }

    get configurationsFolder() {
        return "./data/config"
    }

    revokeCertificate(email: string, letsEncryptFolder: string, domain: string) {
        let semaphore = domain + "_revoke";
        this.lock(semaphore);
        util.log("MOCK: Revoke certificate " + domain);
        this.unlock(semaphore);
    }

    // -------------------------------------------------------------------
    // Function called when a process is started
    // -------------------------------------------------------------------
    processCommandAsync(command: string, message: string): Promise<any> {
        util.log(`MOCK: Running command ${command} - ${message}`);
        return Promise.resolve(true);
    }

    createCertificateAsync(domain: string, email: string): Promise<any> {
        util.log(`MOCK: Create certificate for domain ${domain} --------------------------\n`);
        return Promise.resolve(true);
    }
}

class HostEngine implements IEngine {
    public certificatesFolder = "/etc/letsencrypt/live";
    public configurationsFolder = "/var/haproxy";

    /**
     * Simulate a semaphore between instances sharing volume data.
     * Use mkdir because it is an atomic operation on linux
     */
    private lock(semaphore: string) {
        // let lockFile = Path.join(this.certificatesFolder, semaphore + "__lock");
        // shell.mkdir(lockFile);
        // return shell.error() == null;
        return true; // see https://certbot.eff.org/docs/using.html#id6
    }

    private unlock(semaphore: string) {
        // let lockFile = Path.join(this.certificatesFolder, semaphore + "__lock");
        // shell.rm("-f", lockFile);
    }

    revokeCertificate(email: string, letsEncryptFolder: string, domain: string) {
        let semaphore = domain + "_revoke";
        if (!this.lock(semaphore)) {
            util.log("Skipping revoke certificate. Revoke process already running for domain " + domain)
            return;
        }

        const command = `certbot revoke -t -n --agree-tos --email ${email} --cert-path ${letsEncryptFolder}/${domain}/haproxy.pem`;
        util.log("Running command " + command);

        return new Promise((resolve, reject) => {
            shell.exec(command, (error, stdout, stderr) => {
                if (!error) {
                    console.log(stdout);
                    util.log(`Delete additional certificate files for domain ${domain}`);
                    shell.exec("certbot delete --cert-name " + domain, (error, stdout, stderr) => {
                        if (!error) {
                            console.log(stdout);
                        }
                        else {
                            util.log(`Certificate deletion failed for domain ${domain}`);
                        }
                        this.unlock(semaphore);
                        resolve(true);
                    });
                }
                else {
                    util.log(`Certificate revocation failed for domain ${domain}`);
                    console.log(stderr);
                    this.unlock(semaphore);
                    resolve(false);
                }
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
                    util.log("***** Error ***** " + message + " - " + error.message);
                    stdout && util.log(" stdout : " + stdout);
                    stderr && util.log(" stderr : " + stderr);
                    resolve(false);
                }
            });
        });
    }

    createCertificateAsync(domain: string, email: string): Promise<any> {
        if (!this.lock(domain)) {
            util.log("Skipping certificate creation. Creation process already running for domain " + domain)
            return;
        }

        util.log("Creating certificate for domain " + domain);
        return new Promise((resolve, reject) => {
            if (!email) {
                throw new Error("Validation email is required.");
            }
            childProcess.execFile("/app/cert-creation.sh", [domain, email], { cwd: "/app" }, (err, stdout, stderr) => {
                if (err) {
                    util.log(`Error when creating certificate for ${domain} - ${err} -----------------------\n`);
                    this.unlock(domain);
                    reject();
                }
                else {
                    util.log(`Certificate created for ${domain} ${stdout} ------------------------\n`);
                    this.unlock(domain);
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
            EngineFactory._engine = CONTEXT.isDryRun() ? new MockEngine() : new HostEngine();
        }
        return EngineFactory._engine;
    }
}