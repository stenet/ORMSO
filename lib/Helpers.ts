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
}