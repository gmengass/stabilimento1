import { act } from "react";

/** A stand-in for `EventSource` in component tests: the test emits the stream's events. */
export class FakeEventSource {
  static last: FakeEventSource | undefined;
  private listeners = new Map<string, () => void>();
  constructor() {
    FakeEventSource.last = this;
  }
  addEventListener(type: string, listener: () => void) {
    this.listeners.set(type, listener);
  }
  close() {}
  emit(type: string) {
    act(() => this.listeners.get(type)?.());
  }
}
