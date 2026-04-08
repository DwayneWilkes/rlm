/**
 * @fileoverview Tests that server and client use the same socket path.
 *
 * This test catches the bug where getSocketPath() (client) and
 * getDefaultSocketPath() (server) compute different paths on macOS
 * because one uses os.tmpdir() and the other hardcodes /tmp.
 */

import { describe, it, expect } from 'vitest';
import { getSocketPath } from '../../../src/daemon/detect.js';
import { getDefaultSocketPath } from '../../../src/daemon/server.js';

describe('Socket path consistency', () => {
  it('server and client should use the same socket path', () => {
    // This is the critical bug: getSocketPath() (used by clients) and
    // getDefaultSocketPath() (used by server) must return the same value
    // or the daemon server and clients will never find each other.
    const clientPath = getSocketPath();
    const serverPath = getDefaultSocketPath();

    expect(clientPath).toBe(serverPath);
  });
});
