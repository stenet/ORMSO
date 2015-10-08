import http = require("http");
import q = require("q");

export class Helpers {
    static qSequential(items: any[], callback: (item: any) => q.Promise<any>): q.Promise<any> {
        if (!items || items.length === 0) {
            return q.resolve(null);
        }

        return items.reduce((prev: q.Promise<any>, curr: q.Promise<any>) => {
            return prev
                .then((): q.Promise<any> => {
                    return callback(curr);
                });
        }, q.resolve(null));
    }
    static extend(origin: any, add: any): any {
        if (!add || typeof add !== 'object') {
            return origin;
        }

        var keys = Object.keys(add);
        var i = keys.length;

        while (i--) {
            origin[keys[i]] = add[keys[i]];
        }

        return origin;
    };

    static wasRequestSuccessful(response: http.IncomingMessage): boolean {
        if (!response || !response.statusCode) {
            return false;
        }
        if (response.statusCode < 200 || response.statusCode > 299) {
            return false;
        }

        return true;
    }
    static getRequestError(response: http.IncomingMessage): any {
        if (!response || !response.statusCode || !response.statusMessage) {
            return {
                url: response.url,
                statusCode: 0,
                statusMessage: "Unknown Error occured (no response, statusCode or statusMessage)"
            };
        }

        var url = response.url;
        var req: any = (<any>response).req;

        if (req && req.path) {
            url = req.path;
        }

        return {
            url: url,
            statusCode: response.statusCode,
            statusMessage: response.statusMessage
        }
    }
}