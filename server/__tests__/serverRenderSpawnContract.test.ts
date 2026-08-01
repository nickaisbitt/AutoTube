import { EventEmitter } from "node:events";
import { existsSync, unlinkSync, writeFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Behavioral contract test for POST /api/server-render → child process spawn.
 *
 * Contract:
 *   - The project JSON is passed to the renderer via the
 *     AUTOTUBE_PROJECT_PATH environment variable.
 *   - argv after the script path contains ONLY the output .mp4 path
 *     (server-render.mjs treats argv[2] as its output file).
 *
 * The legacy [projectPath, outputMp4] argv order made the monolith treat the
 * project JSON as its output target (overwriting it) while rendering whatever
 * project happened to be newest in /tmp.
 */

const spawnMock = vi.hoisted(() => vi.fn());

vi.mock("child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("child_process")>();
  // The route's compiled import may reach spawn through the CJS default
  // export, so override both the named and default surfaces.
  return {
    ...actual,
    default: { ...(actual as { default?: object }).default, spawn: spawnMock },
    spawn: spawnMock,
  };
});

import { handleServerRender } from "../routes/serverRender.js";

const PROJECT_PATH = "/tmp/autotube-project-spawncontract.json";

type FakeChild = EventEmitter & {
  stdout: EventEmitter;
  stderr: EventEmitter;
  killed: boolean;
  kill: ReturnType<typeof vi.fn>;
};

function makeFakeChild(): FakeChild {
  const child = new EventEmitter() as FakeChild;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.killed = false;
  child.kill = vi.fn();
  return child;
}

function makeReq(body: Record<string, unknown>): IncomingMessage {
  const req = new EventEmitter() as IncomingMessage;
  req.headers = { host: "localhost:5173" };
  process.nextTick(() => {
    req.emit("data", Buffer.from(JSON.stringify(body)));
    req.emit("end");
  });
  return req;
}

function makeRes(): ServerResponse {
  const res = {
    statusCode: 200,
    setHeader: vi.fn(),
    write: vi.fn(),
    end: vi.fn(),
  };
  return res as unknown as ServerResponse;
}

describe("handleServerRender spawn contract", () => {
  const prevRemotion = process.env.USE_REMOTION_RENDER;
  let lastChild: FakeChild;

  beforeEach(() => {
    writeFileSync(PROJECT_PATH, JSON.stringify({ topic: "contract test", script: [] }));
    lastChild = makeFakeChild();
    spawnMock.mockReset();
    spawnMock.mockImplementation(() => lastChild);
    delete process.env.USE_REMOTION_RENDER;
  });

  afterEach(() => {
    if (prevRemotion === undefined) delete process.env.USE_REMOTION_RENDER;
    else process.env.USE_REMOTION_RENDER = prevRemotion;
    if (existsSync(PROJECT_PATH)) unlinkSync(PROJECT_PATH);
  });

  async function run(body: Record<string, unknown>) {
    const req = makeReq(body);
    const res = makeRes();
    await handleServerRender(req, res);
    // Clear the heartbeat interval / render timeout registered by the route.
    req.emit("close");
    return { req, res };
  }

  it("passes the project via AUTOTUBE_PROJECT_PATH and only the output mp4 as argv", async () => {
    await run({ projectPath: PROJECT_PATH });

    expect(spawnMock).toHaveBeenCalledTimes(1);
    const [cmd, args, opts] = spawnMock.mock.calls[0] as [
      string,
      string[],
      { env: Record<string, string | undefined> },
    ];

    expect(cmd).toBe("node");
    expect(args[0]).toMatch(/server-render.index\.mjs$/);
    // Exactly one positional arg after the script: the output .mp4 path.
    expect(args).toHaveLength(2);
    expect(args[1]).toMatch(/test-recordings.server-render-\d+\.mp4$/);
    expect(args).not.toContain(PROJECT_PATH);
    // Project selection happens exclusively via the environment.
    expect(opts.env.AUTOTUBE_PROJECT_PATH).toBe(PROJECT_PATH);
  });

  it("keeps remotion's own [projectPath, outputMp4] order when opted in", async () => {
    process.env.USE_REMOTION_RENDER = "true";
    await run({ projectPath: PROJECT_PATH });

    expect(spawnMock).toHaveBeenCalledTimes(1);
    const [, args, opts] = spawnMock.mock.calls[0] as [
      string,
      string[],
      { env: Record<string, string | undefined> },
    ];

    expect(args[0]).toMatch(/remotion.render\.mjs$/);
    expect(args).toEqual([args[0], PROJECT_PATH, args[2]]);
    expect(args[2]).toMatch(/test-recordings.server-render-\d+\.mp4$/);
    expect(opts.env.AUTOTUBE_PROJECT_PATH).toBe(PROJECT_PATH);
  });

  it("rejects requests without a saved project instead of rendering a stale one", async () => {
    const { res } = await run({});

    expect(spawnMock).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
  });
});
