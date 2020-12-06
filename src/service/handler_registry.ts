/**
 * Handler registry
 */

export type HandlersRegistry = {
    [keyof: string]: Array<{
        id: string,
        handler: Function,
    }>
};
