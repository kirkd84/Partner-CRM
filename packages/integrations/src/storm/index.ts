/**
 * Storm Cloud adapter — Phase 5 will flesh out the Real client against
 * Kirk's API docs. Interface lives here so callers depend on the contract
 * rather than either implementation. See SPEC §6.5.
 */
export * from './types';
export * from './client';
export { MockStormCloudClient } from './mock';
export { ResilientStormClient, type ResilienceOptions } from './resilience';
