import http = require("http");
import q = require("q");
export declare class Helpers {
    static qSequential(items: any[], callback: (item: any) => q.Promise<any>): q.Promise<any>;
    static extend(origin: any, add: any): any;
    static wasRequestSuccessful(response: http.IncomingMessage): boolean;
    static getRequestError(response: http.IncomingMessage): any;
}
