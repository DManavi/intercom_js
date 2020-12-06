/**
 * Intercom core
 */

import { ApplicationError } from '@speedup/error';
import generateId from 'shortid';

import { HandlersRegistry } from './handler_registry';

type PromiseMethod<T, U> = (input: T) => Promise<U>;
type CallbackMethod<T, U> = (input: T, callback: (err?: Error, result?: U) => void) => void;

export const defaultIntercomConfig = {

    /**
     * Prevent registering multiple handler with the same event name
     */
    preventDuplicatedEventListeners: false,

    /**
     * Throw an error if no event handler exists
     */
    throwErrorIfNoEventHandlerFound: false,

    /**
     * Throw an error if no method handler exists
     */
    throwErrorIfNoMethodHandlerFound: true,
}

export type IntercomConfig = typeof defaultIntercomConfig;

export class Intercom {

    /**
     * Current configuration
     */
    protected readonly config: IntercomConfig;

    /**
     * Event handlers registry
     */
    protected readonly eventHandlers: HandlersRegistry = {};

    /**
     * Method handlers registry
     */
    protected readonly methodHandlers: HandlersRegistry = {};

    constructor(config?: IntercomConfig) {

        // merge default configuration with the user-provided one in a safe way
        this.config = {
            ...defaultIntercomConfig,
            ...(config || {}) // ensure that the provided config object is not null or undefined
        };
    }

    /* Utility methods */

    /**
     * Prepare handlers registry
     * @param registry Either event handlers or method handler registry
     * @param handlerName Either event name or method name
     */
    protected prepareHandlersRegistry(registry: HandlersRegistry, handlerName: string,): void {

        // check to see whether the handler collection is ready or not
        const handlerCollectionExists = Array.isArray(registry[handlerName]);

        // prepare the array
        if (!handlerCollectionExists) { registry[handlerName] = []; }
    }

    /**
     * Ensure that there is at least a registered handler
     * @param registry Either event handlers or method handler registry
     * @param handlerName Either event name or method name
     * @param throwErrorIfNotExists Either throw error or ignore not existence of a handler
     */
    protected ensureHandlersExists(registry: HandlersRegistry, handlerName: string, throwErrorIfNotExists: boolean,): void {

        // check handler existence
        const handlerExists = registry[handlerName].length > 0;

        if (!handlerExists && throwErrorIfNotExists) {
            throw new ApplicationError({
                code: 'E_NO_HANDLER',
                message: `No handler is registered for '${handlerName}' on the registry.`
            });
        }
    }

    /**
     * Ensure that there is only one registered handler exists in the registry
     * @param registry Either event handlers or method handler registry
     * @param handlerName Either event name or method name
     * @param throwErrorIfAlreadyExists Either throw error or ignore existence of a handler
     */
    protected preventRegisteringMoreThanOneHandler(registry: HandlersRegistry, handlerName: string, throwErrorIfExists: boolean): void {

        // check handler existence
        const handlerExists = registry[handlerName].length > 0;

        if (handlerExists && throwErrorIfExists) {
            throw new ApplicationError({
                code: 'E_ALREADY_EXISTS',
                message: `There is an already registered handler for '${handlerName}' on the registry.`
            });
        }
    }

    /**
     * Remove all handlers
     * @param registry Either event handlers or method handler registry
     * @param handlerName Either event name or method name
     */
    protected removeAllHandlers(registry: HandlersRegistry, handlerName: string,): void {
        // Magic happens here :D
        delete registry[handlerName];
    }

    /**
     * Remove a specific handler of an event
     * @param registry Either event handlers or method handler registry
     * @param handlerName Either event name or method name
     * @param handlerId Target handler identifier
     */
    protected removeHandlerById(registry: HandlersRegistry, handlerName: string, handlerId: string): void {
        registry[handlerName] = registry[handlerName].filter(_ => _.id !== handlerId);
    }

    /**
     * Generate an event-level unique identifier
     * @param registry Either event handlers or method handler registry
     * @param handlerName Either event name or method name
     */
    protected generateUniqueIdentifier(registry: HandlersRegistry, handlerName: string,): string {

        let generatedId: string = '';
        let isUnique = false;

        do {
            // generate a new identifier
            generatedId = generateId();

            // check uniqueness of the generated identifier
            isUnique = registry[handlerName].findIndex(_ => _.id === generatedId) === -1;

        } while (isUnique === false);

        return generatedId;
    }

    /* Event methods */

    /**
     * Emit an event with the desiered paylaod
     * @param eventName Target event name
     * @param payload Payload to pass to the event
     * @param config Event emitting configuration
     */
    emit<T>(eventName: string, payload?: T, config?: { throwErrorIfNoEventHandlerFound: boolean, }): void {

        this.prepareHandlersRegistry(this.eventHandlers, eventName);
        this.ensureHandlersExists(
            this.eventHandlers,
            eventName,
            config ? config.throwErrorIfNoEventHandlerFound : this.config.throwErrorIfNoEventHandlerFound
        );

        // invoke existing handlers
        this.eventHandlers[eventName]
            .map(handler =>
                setImmediate(
                    (payload) => handler.handler(payload),
                    payload
                )
            );
    }

    /**
     * Register an event handler for a specific event
     * @param eventName Target event name
     * @param handler Handler to get called on the event emitting
     * @param config Event handler registering configuration
     */
    onEvent<T>(eventName: string, handler: (payload: T) => void, config?: { preventDuplicatedEventListeners: boolean, }): string {

        this.prepareHandlersRegistry(this.eventHandlers, eventName);
        this.preventRegisteringMoreThanOneHandler(
            this.eventHandlers,
            eventName,
            (config && config.preventDuplicatedEventListeners)
            ||
            this.config.preventDuplicatedEventListeners
        );

        // register event handler
        const insertedHandlerIndex = this.eventHandlers[eventName].push({
            id: this.generateUniqueIdentifier(this.eventHandlers, eventName),
            handler: handler,
        });

        // return generated id
        return this.eventHandlers[eventName][insertedHandlerIndex].id;
    }

    /**
     * Remove all handlers for an event
     * @param eventName Target event name
     */
    removeAllEventHandlers(eventName: string,): void {
        this.prepareHandlersRegistry(this.eventHandlers, eventName);
        this.removeAllHandlers(this.eventHandlers, eventName);
    }

    /**
     * Remove a specific event handler by its identifier
     * @param eventName Target event name
     * @param handlerId Target handler identifier
     */
    removeEventHandler(eventName: string, handlerId: string,): void {
        this.prepareHandlersRegistry(this.eventHandlers, eventName);
        this.removeHandlerById(this.eventHandlers, eventName, handlerId);
    }

    /* RPC methods */

    /**
     * Request an RPC method
     * @param methodName Target method name
     * @param payload Method payload
     * @param config Invocation configuration
     * @param callback Operation result callback (prevent setting causes promise-based operation)
     */
    request<T, U>(
        methodName: string,
        payload?: T | Array<any>,
        config?: { throwErrorIfNoMethodHandlerFound: boolean, },
        callback?: (err?: Error, result?: U) => void
    ): Promise<U> | void {
        this.prepareHandlersRegistry(this.methodHandlers, methodName);
        this.ensureHandlersExists(
            this.methodHandlers,
            methodName,
            (config && config.throwErrorIfNoMethodHandlerFound)
            ||
            this.config.throwErrorIfNoMethodHandlerFound,
        );

        if (callback) { // callback mode

            // resolve the promise here
            this.methodHandlers[methodName][0]
                .handler(payload)
                .then((result: U) => callback(undefined, result))
                .catch((err: Error) => callback(err));
        }
        else { // Promise mode
            return this.methodHandlers[methodName][0].handler(payload);
        }
    }

    /**
     * Register RPC handler
     * @param methodName Target method name
     * @param handler Handler that gets invoked when an RPC request is received
     */
    onRequest<T, U>(
        methodName: string,
        handler: PromiseMethod<T, U> | CallbackMethod<T, U>,
    ) {
        this.prepareHandlersRegistry(this.methodHandlers, methodName);
        this.preventRegisteringMoreThanOneHandler(
            this.methodHandlers,
            methodName,
            true,
        );

        // generate handler identifier
        const handlerIdentifier = this.generateUniqueIdentifier(this.methodHandlers, methodName);

        // remove all previous handlers
        this.methodHandlers[methodName] = [
            {
                // it's an always-unique identifier
                id: handlerIdentifier,

                // promise-based wrapper
                handler: (payload: T): Promise<U> => {

                    // promise-based, no need to wrap
                    if (handler.length === 1) { return (handler as PromiseMethod<T, U>)(payload); }

                    // callback-based, wrapper required
                    return new Promise<U>(
                        (resolve, reject) => (handler as CallbackMethod<T, U>)(
                            payload,
                            (err, result) => err ? reject(err) : resolve(err)
                        )
                    );
                }
            }
        ];

        return handlerIdentifier;
    }

    /**
     * Remove method handler
     * @param methodName Target method handler
     */
    removeMethodHandler(methodName: string): void {
        this.removeAllHandlers(this.methodHandlers, methodName);
    }
}
