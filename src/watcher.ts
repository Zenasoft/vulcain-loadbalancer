import k8s = require('@kubernetes/client-node');
import { RuleDefinition, IngressDefinition } from './model';
import { Server } from './server';
const util = require('util');
import fs = require('fs');
const path = require('path');

export interface IWatcher {
    run(kc: k8s.KubeConfig);
}

export class KubernetesWatcher implements IWatcher {
    private constructor(private server: Server, private ignoredNamespaces: string[] = []) {
        util.log("Initializing kubernetes watcher");
    }

    static create(server: Server, ignoredNamespaces = ["kube-system"]): IWatcher {
        try {
            let kc: k8s.KubeConfig;
            let configFile = process.env["KUBERNETES_CONFIG_FILE"];
            if (configFile) {
                if (!path.isAbsolute(configFile))
                    configFile = path.join(process.env['HOME'] || process.env['USERPROFILE'], configFile);

                kc = new k8s.KubeConfig();
                kc.loadFromFile(configFile);
            }
            else {
                kc = KubernetesWatcher.fromCluster();
            }
            if (!kc)
                return null;

            let watcher = new KubernetesWatcher(server, ignoredNamespaces);
            watcher.run(kc);
            return watcher;
        }
        catch (e) {
            util.log(`Unable to start kubernetes watcher. ${e.message}`);
        }
    }

    private static fromCluster(): k8s.KubeConfig {
        let host = process.env.KUBERNETES_SERVICE_HOST
        let port = process.env.KUBERNETES_SERVICE_PORT

        if (!host || !fs.existsSync(k8s.Config.SERVICEACCOUNT_CA_PATH)) {
            return null;
        }

        let caCert = fs.readFileSync(k8s.Config.SERVICEACCOUNT_CA_PATH);
        let token = fs.readFileSync(k8s.Config.SERVICEACCOUNT_TOKEN_PATH);

        return <any>{
            getCurrentCluster() {
                return { server: 'https://' + host + ':' + port };
            },
            applyToRequest: (opts) => {
                opts.ca = caCert;
                opts.headers['Authorization'] = 'Bearer ' + token;
            }
        };
    }

    run(kc: k8s.KubeConfig) {
        let watch = new k8s.Watch(kc);
        util.log("Listening on kubernetes events...");

        let req = watch.watch('/api/v1/watch/services',
            {},
            this.onServiceEvents.bind(this),
            (err) => {
                if (err) {
                    util.log('Kubernetes watcher error. ' + err);
                }
                else {
                    util.log('Kubernetes watcher aborted.');
                }
            });
    }

    private onServiceEvents(type: string, obj: any) {
        if (type !== 'ADDED' && type !== 'MODIFIED' && type !== "DELETED")
            return;

        if (this.ignoredNamespaces.indexOf(obj.metadata.namespace) >= 0)
            return;

        let removeRule = type === 'DELETED';
        let def = this.mapFromAnnotations(obj);
        if (def) {
            removeRule ? util.log("Removing rule from kubernetes event") : util.log("Updating rule from kubernetes event");
            try {
                this.server.initializeProxyFromConfiguration(def, removeRule);
            }
            catch (e) {
                util.log("Service ignored due to invalid service annotations. " + e.message);
            }
        }
    }

    private mapFromAnnotations(obj): IngressDefinition {
        let rule: any = {};
        let annotations = obj.metadata.annotations;
        if (!annotations)
            return null;

        // Required
        rule.hostName = annotations["ingress.vulcain.io/hostname"];
        rule.tlsDomain = annotations["ingress.vulcain.io/tlsDomain"];
        rule.path = annotations["ingress.vulcain.io/path"];

        if (!rule.path && !(rule.hostName || rule.tlsDomain))
            return null;

        // Optional
        rule.servicePort = annotations["ingress.vulcain.io/port"];
        rule.pathRewrite = annotations["ingress.vulcain.io/pathRewrite"];
        rule.tenant = annotations["ingress.vulcain.io/tenant"];

        rule.serviceName = obj.metadata.name + "." + obj.metadata.namespace;
        rule.id = obj.metadata.uid;

        return {
            tlsEmail: annotations["ingress.vulcain.io/tlsEmail"],
            rules: [rule]
        }
    }
}
