export class AppError extends Error {

    public statusCode: number;

    constructor(statusCode: number, message: string, stack: string = "") {
        super(message);
        this.statusCode = statusCode; // was `this.statusCode: statusCode` — colon isn't valid assignment syntax

        if (stack) {
            this.stack = stack;
        } else {
            Error.captureStackTrace(this, this.constructor);
        }
    }

}