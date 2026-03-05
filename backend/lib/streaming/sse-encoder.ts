/**
 * Shared SSE encoder with backpressure support.
 * Used by generate-stream and modify-stream route handlers.
 */

import { BackpressureController, EventPriority } from './backpressure-controller';

export class SSEEncoder {
  private encoder = new TextEncoder();
  private backpressure: BackpressureController;

  constructor(backpressure: BackpressureController) {
    this.backpressure = backpressure;
  }

  /**
   * Encodes an SSE event
   */
  encode(event: string, data: any): Uint8Array {
    const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    return this.encoder.encode(message);
  }

  /**
   * Encodes a heartbeat comment (keeps connection alive)
   */
  heartbeat(): Uint8Array {
    return this.encoder.encode(': heartbeat\n\n');
  }

  /**
   * Enqueue an event with backpressure handling
   */
  enqueueEvent(
    controller: ReadableStreamDefaultController<Uint8Array>,
    event: string,
    data: any,
    priority: EventPriority = EventPriority.NORMAL
  ): boolean {
    const encoded = this.encode(event, data);
    return this.backpressure.enqueue(controller, encoded, priority);
  }

  /**
   * Enqueue a heartbeat with low priority (can be dropped)
   */
  enqueueHeartbeat(
    controller: ReadableStreamDefaultController<Uint8Array>
  ): boolean {
    const encoded = this.heartbeat();
    return this.backpressure.enqueue(controller, encoded, EventPriority.LOW);
  }
}
