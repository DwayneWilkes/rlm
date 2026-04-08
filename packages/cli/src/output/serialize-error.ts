/**
 * @fileoverview Shared error serialization utility.
 *
 * Converts Error objects to plain serializable objects for output formatters.
 *
 * @module @rlm/cli/output/serialize-error
 */

/**
 * Convert an Error object to a serializable plain object.
 *
 * Extracts the standard Error properties (name, message, stack)
 * into a Record that can be safely serialized to JSON or YAML.
 *
 * @param error - The Error to serialize
 * @returns A plain object with name, message, and stack properties
 */
export function serializeError(error: Error): Record<string, unknown> {
  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
  };
}
