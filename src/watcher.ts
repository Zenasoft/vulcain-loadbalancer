import k8s = require('@kubernetes/client-node');
import { RuleDefinition, IngressDefinition } from './model';
import { Server } from './server';
const util = require('util');

export interface IWatcher {
    run(configFile: string);
}

export class KubernetesWatcher implements IWatcher {
    constructor(private server: Server, private ignoredNamespaces = ["kube-system"]) {
        util.log("Initializing kubernetes watcher");
    }

    run(configFile: string) {
        let kc = new k8s.KubeConfig();
        kc.loadFromFile(configFile);

        let watch = new k8s.Watch(kc);
        util.log("Listening on kubernetes events...");

        let req = watch.watch('/api/v1/watch/services',
            // optional query parameters can go here.
            {},
            // callback is called for each received object.
            (type, obj) => {
                if (type == 'ADDED' || type == 'MODIFIED' || type === "DELETED") {
                    if (this.ignoredNamespaces.indexOf(obj.metadata.namespace) >= 0)
                        return;

                    let removeRule = type == 'DELETED';
                    let def = this.mapFromAnnotations(obj);
                    if (def) {
                        removeRule ? util.log("Removing rule from kubernetes event") : util.log("Updating rule from kubernetes event");
                        try {
                            this.server.initializeProxyFromConfiguration( def, removeRule);
                        }
                        catch (e) {
                            util.log("Service ignored due to invalid service annotations. " + e.message);
                        }
                    }
                }
            },
            // done callback is called if the watch terminates normally
            (err) => {
                if (err) {
                    util.log('Kubernetes watcher error. ' + err);
                }
                else {
                    util.log('Kubernetes watcher aborted.');
                }
            });
    }

    private mapFromAnnotations(obj): IngressDefinition {
        let rule: any = {};
        let annotations = obj.metadata.annotations;
        if (!annotations)
            return null;

        // Required
        rule.hostName = annotations["lb.vulcain.io/hostName"];
        rule.tlsDomain = annotations["lb.vulcain.io/tlsDomain"];
        rule.path = annotations["lb.vulcain.io/path"];

        if (!rule.path && !(rule.hostName || (rule.tlsDomain && !rule.tlsDomain.startsWith("*."))))
            return null;

        // Optional
        rule.servicePort = annotations["lb.vulcain.io/port"];
        rule.pathRewrite = annotations["lb.vulcain.io/pathRewrite"];
        rule.tenant = annotations["lb.vulcain.io/tenant"];

        rule.serviceName = obj.metadata.name + "." + obj.metadata.namespace;
        rule.id = obj.metadata.uid;

        return {
            tlsEmail: annotations["lb.vulcain.io/tlsEmail"],
            rules: [rule]
        }
    }
}
