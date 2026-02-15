# SSE Streaming with Backpressure Control

This module provides backpressure handling for Server-Sent Events (SSE) streaming to prevent memory exhaustion when clients consume data slower than the server produces it.

## Problem

Without backpressure handling, if a client is on a slow connection, data accumulates in the response buffer without limit. This can lead to:
- Unbounded memory growth on the server
- Out-of-memory crashes under load
- Poor performance for all clients

## Solution

The `BackpressureController` implements flow control using:
1. **High Water Mark**: Signals to the ReadableStream when the buffer is getting full
2. **Internal Buffering**: Buffers events internally when the stream buffer is full
3. **Priority-Based Dropping**: Drops low-priority events (heartbeats) to preserve critical events (files, errors)
4. **Statistics Tracking**: Monitors backpressure events and drop rates

## Usage

### Basic Setup

```typescript
import { BackpressureController, EventPriority } from '../../../lib/streaming';

// Create controller with configuration
const backpressure = new BackpressureController({
  maxBufferSize: 1024 * 1024, // 1MB internal buffer
  highWaterMark: 16 * 1024,   // 16KB stream buffer
  debug: false,               // Enable debug logging
});

// Create ReadableStream with high water mark
const stream = new ReadableStream({
  async start(controller) {
    // ... streaming logic
  },
}, {
  highWaterMark: backpressure.getHighWaterMark(),
});
```

### Enqueuing Events

```typescript
// Critical events (never dropped)
backpressure.enqueue(
  controller,
  data,
  EventPriority.CRITICAL
);

// Normal priority events
backpressure.enqueue(
  controller,
  data,
  EventPriority.NORMAL
);

// Low priority events (dropped under backpressure)
backpressure.enqueue(
  controller,
  data,
  EventPriority.LOW
);
```

### Priority Levels

| Priority | Behavior | Use Cases |
|----------|----------|-----------|
| `CRITICAL` | Always buffered, never dropped | File data, errors, completion events |
| `NORMAL` | Buffered when space available, may be dropped if buffer full | Progress updates, start events |
| `LOW` | Dropped during backpressure | Heartbeats, non-essential pings |

## How It Works

### 1. Backpressure Detection

The controller checks `controller.desiredSize` before enqueuing:
- `desiredSize > 0`: Stream buffer has space, enqueue directly
- `desiredSize <= 0`: Stream buffer is full, backpressure detected

### 2. Buffering Strategy

When backpressure is detected:

1. **Critical events**: Always buffered in internal buffer
2. **Normal events**: Buffered if internal buffer has space
3. **Low priority events**: Dropped immediately if buffer is not empty

### 3. Buffer Management

When internal buffer fills up:

1. Try to evict low-priority events to make space
2. If still no space and event is normal priority, drop it
3. Critical events are always buffered (can exceed max if necessary)

### 4. Buffer Flushing

On every `enqueue()` call, the controller attempts to flush buffered events to the stream if backpressure has resolved.

## Statistics

The controller tracks:

```typescript
const stats = backpressure.getStats();

console.log({
  totalEnqueued: stats.totalEnqueued,       // Total events sent to stream
  totalDropped: stats.totalDropped,         // Total events dropped
  totalBuffered: stats.totalBuffered,       // Total events that were buffered
  currentBufferSize: stats.currentBufferSize, // Current buffer size in bytes
  maxBufferSizeReached: stats.maxBufferSizeReached, // Peak buffer size
  backpressureEvents: stats.backpressureEvents, // Times backpressure occurred
});
```

## Example: SSE Streaming with Backpressure

```typescript
const stream = new ReadableStream({
  async start(controller) {
    const backpressure = new BackpressureController({
      maxBufferSize: 1024 * 1024,
      highWaterMark: 16 * 1024,
    });

    // Send files (critical)
    for (const file of files) {
      const data = encoder.encode(`data: ${JSON.stringify(file)}\n\n`);
      backpressure.enqueue(controller, data, EventPriority.CRITICAL);
    }

    // Send heartbeats (low priority)
    const heartbeatInterval = setInterval(() => {
      const data = encoder.encode(': heartbeat\n\n');
      backpressure.enqueue(controller, data, EventPriority.LOW);
    }, 10000);

    // Cleanup and log stats
    cleanup(() => {
      clearInterval(heartbeatInterval);
      backpressure.logStats();
    });
  },
}, {
  highWaterMark: backpressure.getHighWaterMark(),
});
```

## Testing

Run tests with:

```bash
npm test -- backpressure-controller.test.ts
```

## Configuration Recommendations

### For File Streaming
```typescript
{
  maxBufferSize: 2 * 1024 * 1024, // 2MB (larger buffer for files)
  highWaterMark: 32 * 1024,       // 32KB
}
```

### For Text/JSON Streaming
```typescript
{
  maxBufferSize: 1024 * 1024,     // 1MB
  highWaterMark: 16 * 1024,       // 16KB
}
```

### For High-Frequency Updates
```typescript
{
  maxBufferSize: 512 * 1024,      // 512KB (smaller buffer)
  highWaterMark: 8 * 1024,        // 8KB
  debug: true,                    // Enable monitoring
}
```

## Acceptance Criteria

✅ **Server memory bounded even with slow clients**
- Internal buffer limited to `maxBufferSize`
- Low priority events dropped when buffer fills

✅ **No data loss for critical events**
- Critical priority events always buffered
- Files, errors, and completion events never dropped

✅ **Heartbeat events safely dropped under pressure**
- Heartbeats marked as `EventPriority.LOW`
- Automatically dropped during backpressure

## Performance Impact

- **Negligible overhead** when no backpressure
- **Small overhead** during backpressure (buffer management)
- **Memory savings** prevent unbounded growth
- **Improved stability** under varying client speeds
