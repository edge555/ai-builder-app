/**
 * Backpressure Controller for SSE Streaming
 *
 * Handles flow control to prevent memory exhaustion when clients
 * consume data slower than the server produces it.
 */

import { createLogger } from '../logger';

const logger = createLogger('backpressure-controller');

const DEFAULT_MAX_BUFFER_SIZE = 1024 * 1024; // 1MB
const DEFAULT_HIGH_WATER_MARK = 16 * 1024; // 16KB

export interface BackpressureConfig {
    /** Maximum internal buffer size in bytes (default: 1MB) */
    maxBufferSize?: number;
    /** High water mark for ReadableStream (default: 16KB) */
    highWaterMark?: number;
    /** Enable debug logging for backpressure events */
    debug?: boolean;
}

export enum EventPriority {
    /** Critical events that must never be dropped (files, errors, complete) */
    CRITICAL = 'critical',
    /** Normal priority events (progress, start) */
    NORMAL = 'normal',
    /** Low priority events that can be dropped (heartbeats) */
    LOW = 'low',
}

interface BufferedEvent {
    data: Uint8Array;
    priority: EventPriority;
    timestamp: number;
}

interface BackpressureStats {
    totalEnqueued: number;
    totalDropped: number;
    totalBuffered: number;
    currentBufferSize: number;
    maxBufferSizeReached: number;
    backpressureEvents: number;
}

/**
 * Controller for managing backpressure in SSE streaming.
 * Implements internal buffering and priority-based event dropping.
 */
export class BackpressureController {
    private readonly maxBufferSize: number;
    private readonly highWaterMark: number;
    private readonly debugEnabled: boolean;

    private buffer: BufferedEvent[] = [];
    private currentBufferSize = 0;

    private stats: BackpressureStats = {
        totalEnqueued: 0,
        totalDropped: 0,
        totalBuffered: 0,
        currentBufferSize: 0,
        maxBufferSizeReached: 0,
        backpressureEvents: 0,
    };

    constructor(config: BackpressureConfig = {}) {
        this.maxBufferSize = config.maxBufferSize ?? DEFAULT_MAX_BUFFER_SIZE;
        this.highWaterMark = config.highWaterMark ?? DEFAULT_HIGH_WATER_MARK;
        this.debugEnabled = config.debug ?? false;
    }

    /**
     * Get the high water mark for ReadableStream constructor.
     */
    getHighWaterMark(): number {
        return this.highWaterMark;
    }

    /**
     * Attempt to enqueue data to the stream controller.
     * Handles backpressure by buffering or dropping events based on priority.
     *
     * @returns true if enqueued successfully, false if dropped
     */
    enqueue(
        controller: ReadableStreamDefaultController<Uint8Array>,
        data: Uint8Array,
        priority: EventPriority = EventPriority.NORMAL
    ): boolean {
        // First, try to flush any buffered events
        this.flushBuffer(controller);

        // Check if we're experiencing backpressure
        const desiredSize = controller.desiredSize;
        const isBackpressured = desiredSize !== null && desiredSize <= 0;

        if (isBackpressured) {
            this.stats.backpressureEvents++;

            if (this.debugEnabled) {
                logger.debug('Backpressure detected', {
                    desiredSize,
                    bufferSize: this.currentBufferSize,
                    priority,
                });
            }

            return this.handleBackpressure(data, priority);
        }

        // No backpressure - enqueue directly
        try {
            controller.enqueue(data);
            this.stats.totalEnqueued++;
            return true;
        } catch (error) {
            logger.error('Failed to enqueue data', {
                error: error instanceof Error ? error.message : String(error),
                dataSize: data.length,
            });
            return false;
        }
    }

    /**
     * Handle backpressure by buffering or dropping events.
     */
    private handleBackpressure(data: Uint8Array, priority: EventPriority): boolean {
        // Critical events must always be buffered
        if (priority === EventPriority.CRITICAL) {
            return this.bufferEvent(data, priority);
        }

        // Low priority events can be dropped immediately if buffer is not empty
        if (priority === EventPriority.LOW && this.buffer.length > 0) {
            this.stats.totalDropped++;

            if (this.debugEnabled) {
                logger.debug('Dropped low priority event', {
                    dataSize: data.length,
                    bufferSize: this.currentBufferSize,
                });
            }

            return false;
        }

        // Check if buffer has space
        const eventSize = data.length;
        if (this.currentBufferSize + eventSize > this.maxBufferSize) {
            // Buffer is full - drop based on priority
            if (priority === EventPriority.LOW) {
                this.stats.totalDropped++;

                if (this.debugEnabled) {
                    logger.debug('Dropped event - buffer full', {
                        priority,
                        dataSize: eventSize,
                        bufferSize: this.currentBufferSize,
                        maxBufferSize: this.maxBufferSize,
                    });
                }

                return false;
            }

            // Normal priority - try to make space by dropping low priority events
            this.evictLowPriorityEvents(eventSize);

            // If still no space, we have to drop this event
            if (this.currentBufferSize + eventSize > this.maxBufferSize) {
                this.stats.totalDropped++;

                logger.warn('Dropped normal priority event - buffer full after eviction', {
                    dataSize: eventSize,
                    bufferSize: this.currentBufferSize,
                    maxBufferSize: this.maxBufferSize,
                });

                return false;
            }
        }

        // Buffer the event
        return this.bufferEvent(data, priority);
    }

    /**
     * Add event to internal buffer.
     */
    private bufferEvent(data: Uint8Array, priority: EventPriority): boolean {
        this.buffer.push({
            data,
            priority,
            timestamp: Date.now(),
        });

        this.currentBufferSize += data.length;
        this.stats.totalBuffered++;
        this.stats.currentBufferSize = this.currentBufferSize;

        if (this.currentBufferSize > this.stats.maxBufferSizeReached) {
            this.stats.maxBufferSizeReached = this.currentBufferSize;
        }

        if (this.debugEnabled) {
            logger.debug('Event buffered', {
                priority,
                dataSize: data.length,
                bufferSize: this.currentBufferSize,
                bufferedEvents: this.buffer.length,
            });
        }

        return true;
    }

    /**
     * Evict low priority events from buffer to make space.
     */
    private evictLowPriorityEvents(spaceNeeded: number): void {
        let freedSpace = 0;
        const originalLength = this.buffer.length;

        this.buffer = this.buffer.filter(event => {
            if (event.priority === EventPriority.LOW && freedSpace < spaceNeeded) {
                freedSpace += event.data.length;
                this.currentBufferSize -= event.data.length;
                this.stats.totalDropped++;
                return false;
            }
            return true;
        });

        const evicted = originalLength - this.buffer.length;
        if (evicted > 0) {
            logger.debug('Evicted low priority events from buffer', {
                evicted,
                freedSpace,
                remainingBufferSize: this.currentBufferSize,
            });
        }
    }

    /**
     * Attempt to flush buffered events to the controller.
     */
    private flushBuffer(controller: ReadableStreamDefaultController<Uint8Array>): void {
        if (this.buffer.length === 0) {
            return;
        }

        const flushedEvents: BufferedEvent[] = [];

        for (const event of this.buffer) {
            const desiredSize = controller.desiredSize;

            // Stop if we hit backpressure again
            if (desiredSize !== null && desiredSize <= 0) {
                break;
            }

            try {
                controller.enqueue(event.data);
                this.currentBufferSize -= event.data.length;
                this.stats.totalEnqueued++;
                flushedEvents.push(event);
            } catch (error) {
                logger.error('Failed to flush buffered event', {
                    error: error instanceof Error ? error.message : String(error),
                });
                break;
            }
        }

        // Remove flushed events from buffer
        if (flushedEvents.length > 0) {
            this.buffer = this.buffer.slice(flushedEvents.length);

            if (this.debugEnabled) {
                logger.debug('Flushed buffered events', {
                    flushed: flushedEvents.length,
                    remaining: this.buffer.length,
                    bufferSize: this.currentBufferSize,
                });
            }
        }
    }

    /**
     * Get current backpressure statistics.
     */
    getStats(): BackpressureStats {
        return {
            ...this.stats,
            currentBufferSize: this.currentBufferSize,
        };
    }

    /**
     * Log current statistics.
     */
    logStats(): void {
        const stats = this.getStats();
        logger.info('Backpressure statistics', {
            totalEnqueued: stats.totalEnqueued,
            totalDropped: stats.totalDropped,
            totalBuffered: stats.totalBuffered,
            currentBufferSize: stats.currentBufferSize,
            maxBufferSizeReached: stats.maxBufferSizeReached,
            backpressureEvents: stats.backpressureEvents,
            dropRate: stats.totalEnqueued > 0
                ? `${((stats.totalDropped / (stats.totalEnqueued + stats.totalDropped)) * 100).toFixed(2)}%`
                : '0%',
        });
    }

    /**
     * Reset statistics (useful for testing).
     */
    resetStats(): void {
        this.stats = {
            totalEnqueued: 0,
            totalDropped: 0,
            totalBuffered: 0,
            currentBufferSize: this.currentBufferSize,
            maxBufferSizeReached: 0,
            backpressureEvents: 0,
        };
    }
}
