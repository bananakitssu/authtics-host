---
name: Node child-process test cleanup
description: Avoid hanging integration-test cleanup when a fixture server exits from a signal.
---

When a Node child process is terminated by a signal, `exitCode` remains `null` and `signalCode` identifies how it exited. Treat either a non-null exit code or signal code as completion.

**Why:** Fixture-server tests can otherwise wait for an `exit` event that already fired and be cancelled when the event loop empties.

**How to apply:** In child-process test helpers, check both `exitCode` and `signalCode`, and register the exit listener before sending a termination signal.
