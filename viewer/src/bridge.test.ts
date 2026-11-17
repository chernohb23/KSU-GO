import { describe, expect, it, vi } from "vitest";
import { installBridge } from "./bridge";

describe("viewer bridge", () => {
  it("installs receive before sending ready and serializes native messages", () => {
    const postMessage = vi.fn(() => {
      expect(host).toHaveProperty("ksugo.receive", expect.any(Function));
    });
    const host = { ReactNativeWebView: { postMessage } };
    const send = installBridge(host, vi.fn(), vi.fn());
    send({ type: "route:stepChanged", stepIndex: 1 });

    expect(postMessage.mock.calls).toEqual([
      ['{"type":"ready"}'],
      ['{"type":"route:stepChanged","stepIndex":1}'],
    ]);
  });

  it("reports an unknown message and still accepts the next message", () => {
    const host = { ksugo: { receive: vi.fn<(message: unknown) => void>() } };
    const dispatch = vi.fn();
    const log = vi.fn();
    installBridge(host, dispatch, log);
    host.ksugo.receive({ type: "missing" });
    const next = { type: "route:goto", stepIndex: 2 };
    host.ksugo.receive(next);

    expect(log).toHaveBeenCalledWith({ type: "error", message: expect.stringContaining("missing") });
    expect(dispatch).toHaveBeenCalledExactlyOnceWith(next);
  });
});
