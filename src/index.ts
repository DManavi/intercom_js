/**
 * Module entry point
 */

import { Intercom } from './service/intercom';

/* Default shared instance of the intercom */
const defaultInstance = new Intercom();

/* Factory method to create new instance of the intercom */
const createIntercomInstance = () => new Intercom();

/* Export available methods and classes */

export default defaultInstance;
export {
    createIntercomInstance,
    Intercom,
};
