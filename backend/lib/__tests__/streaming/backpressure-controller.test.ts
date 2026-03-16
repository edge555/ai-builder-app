import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BackpressureController,
  EventPriority,
} from '../../streaming/backpressure-controller';

describe('BackpressureController', () => {
    let controller: BackpressureController;
    let mockStreamController: ReadableStreamDefaultController<Uint8Array>;

    beforeEach(() => {
        controller = new BackpressureController({
            maxBufferSize: 1024, // 1KB for testing
            highWaterMark: 512, // 512 bytes
            debug: false,
        });

        // Mock ReadableStreamDefaultController
        mockStreamController = {
            enqueue: vi.fn(),
            desiredSize: 1000, // Positive desiredSize = no backpressure
            close: vi.fn(),
            error: vi.fn(),
        } as unknown as ReadableStreamDefaultController<Uint8Array>;
    });

    describe('enqueue without backpressure', () => {
        it('should enqueue data directly when no backpressure', () => {
            const data = new TextEncoder().encode('test data');

            const result = controller.enqueue(
                mockStreamController,
                data,
                EventPriority.NORMAL
            );

            expect(result).toBe(true);
            expect(mockStreamController.enqueue).toHaveBeenCalledWith(data);
            expect(controller.getStats().totalEnqueued).toBe(1);
            expect(controller.getStats().totalDropped).toBe(0);
        });

        it('should handle critical priority events', () => {
            const data = new TextEncoder().encode('critical data');

            const result = controller.enqueue(
                mockStreamController,
                data,
                EventPriority.CRITICAL
            );

            expect(result).toBe(true);
            expect(mockStreamController.enqueue).toHaveBeenCalledWith(data);
        });
    });

    describe('backpressure handling', () => {
        beforeEach(() => {
            // Simulate backpressure
            mockStreamController.desiredSize = -100;
        });

        it('should buffer critical events during backpressure', () => {
            const data = new TextEncoder().encode('critical event');

            const result = controller.enqueue(
                mockStreamController,
                data,
                EventPriority.CRITICAL
            );

            expect(result).toBe(true);
            expect(mockStreamController.enqueue).not.toHaveBeenCalled();
            expect(controller.getStats().totalBuffered).toBe(1);
            expect(controller.getStats().currentBufferSize).toBe(data.length);
        });

        it('should buffer normal events during backpressure if space available', () => {
            const data = new TextEncoder().encode('normal event');

            const result = controller.enqueue(
                mockStreamController,
                data,
                EventPriority.NORMAL
            );

            expect(result).toBe(true);
            expect(controller.getStats().totalBuffered).toBe(1);
        });

        it('should drop low priority events during backpressure', () => {
            // First add a normal event to make buffer non-empty
            const normalData = new TextEncoder().encode('normal');
            controller.enqueue(mockStreamController, normalData, EventPriority.NORMAL);

            // Now try to add a low priority event
            const lowPriorityData = new TextEncoder().encode('heartbeat');
            const result = controller.enqueue(
                mockStreamController,
                lowPriorityData,
                EventPriority.LOW
            );

            expect(result).toBe(false);
            expect(controller.getStats().totalDropped).toBe(1);
        });

        it('should flush buffer when backpressure resolves', () => {
            const data1 = new TextEncoder().encode('buffered1');
            const data2 = new TextEncoder().encode('buffered2');

            // Buffer events during backpressure
            controller.enqueue(mockStreamController, data1, EventPriority.NORMAL);
            controller.enqueue(mockStreamController, data2, EventPriority.NORMAL);

            expect(controller.getStats().totalBuffered).toBe(2);

            // Resolve backpressure
            mockStreamController.desiredSize = 1000;

            // Next enqueue should flush buffer
            const data3 = new TextEncoder().encode('new data');
            controller.enqueue(mockStreamController, data3, EventPriority.NORMAL);

            expect(mockStreamController.enqueue).toHaveBeenCalledTimes(3);
            expect(controller.getStats().currentBufferSize).toBe(0);
        });
    });

    describe('buffer overflow', () => {
        beforeEach(() => {
            mockStreamController.desiredSize = -100;
        });

        it('should drop low priority events when buffer is full', () => {
            // Fill buffer with critical events
            const largeData = new TextEncoder().encode('x'.repeat(1000));
            controller.enqueue(mockStreamController, largeData, EventPriority.CRITICAL);

            // Try to add low priority event - should be dropped
            const heartbeat = new TextEncoder().encode('heartbeat');
            const result = controller.enqueue(
                mockStreamController,
                heartbeat,
                EventPriority.LOW
            );

            expect(result).toBe(false);
            expect(controller.getStats().totalDropped).toBe(1);
        });

        it('should evict low priority events to make space for normal priority', () => {
            // Add low priority events
            const heartbeat1 = new TextEncoder().encode('heartbeat1');
            const heartbeat2 = new TextEncoder().encode('heartbeat2');
            controller.enqueue(mockStreamController, heartbeat1, EventPriority.LOW);
            controller.enqueue(mockStreamController, heartbeat2, EventPriority.LOW);

            // Fill buffer near limit with normal events
            const normalData = new TextEncoder().encode('x'.repeat(900));
            controller.enqueue(mockStreamController, normalData, EventPriority.NORMAL);

            // Add another normal event - should evict low priority events
            const moreNormal = new TextEncoder().encode('normal event');
            const result = controller.enqueue(
                mockStreamController,
                moreNormal,
                EventPriority.NORMAL
            );

            expect(result).toBe(true);
            expect(controller.getStats().totalDropped).toBeGreaterThan(0);
        });

        it('should track max buffer size reached', () => {
            const data1 = new TextEncoder().encode('x'.repeat(500));
            const data2 = new TextEncoder().encode('x'.repeat(400));

            controller.enqueue(mockStreamController, data1, EventPriority.CRITICAL);
            controller.enqueue(mockStreamController, data2, EventPriority.CRITICAL);

            const stats = controller.getStats();
            expect(stats.maxBufferSizeReached).toBeGreaterThan(0);
        });
    });

    describe('statistics', () => {
        it('should track backpressure events', () => {
            mockStreamController.desiredSize = -100;

            const data = new TextEncoder().encode('test');
            controller.enqueue(mockStreamController, data, EventPriority.NORMAL);

            expect(controller.getStats().backpressureEvents).toBe(1);
        });

        it('should calculate statistics correctly', () => {
            const data = new TextEncoder().encode('test');

            // Enqueue without backpressure
            controller.enqueue(mockStreamController, data, EventPriority.NORMAL);

            // Enable backpressure and drop an event
            mockStreamController.desiredSize = -100;
            controller.enqueue(mockStreamController, new TextEncoder().encode('x'), EventPriority.NORMAL);
            controller.enqueue(mockStreamController, data, EventPriority.LOW);

            const stats = controller.getStats();
            expect(stats.totalEnqueued).toBe(1);
            expect(stats.totalBuffered).toBe(1);
            expect(stats.totalDropped).toBe(1);
        });

        it('should reset statistics', () => {
            const data = new TextEncoder().encode('test');
            controller.enqueue(mockStreamController, data, EventPriority.NORMAL);

            controller.resetStats();

            const stats = controller.getStats();
            expect(stats.totalEnqueued).toBe(0);
            expect(stats.totalDropped).toBe(0);
            expect(stats.totalBuffered).toBe(0);
        });
    });

    describe('getHighWaterMark', () => {
        it('should return configured high water mark', () => {
            expect(controller.getHighWaterMark()).toBe(512);
        });
    });

    describe('priority ordering', () => {
        beforeEach(() => {
            mockStreamController.desiredSize = -100;
        });

        it('should preserve critical events even under severe backpressure', () => {
            // Fill buffer completely
            const largeData = new TextEncoder().encode('x'.repeat(1000));
            controller.enqueue(mockStreamController, largeData, EventPriority.CRITICAL);

            // Try to add another critical event (should succeed by nature of critical priority)
            const criticalData = new TextEncoder().encode('critical');
            const result = controller.enqueue(
                mockStreamController,
                criticalData,
                EventPriority.CRITICAL
            );

            // Critical events are always buffered
            expect(result).toBe(true);
        });
    });

    describe('edge cases', () => {
        it('should handle null desiredSize', () => {
            mockStreamController.desiredSize = null;

            const data = new TextEncoder().encode('test');
            const result = controller.enqueue(
                mockStreamController,
                data,
                EventPriority.NORMAL
            );

            // null desiredSize means no backpressure
            expect(result).toBe(true);
        });

        it('should handle zero desiredSize as backpressure', () => {
            mockStreamController.desiredSize = 0;

            const data = new TextEncoder().encode('test');
            controller.enqueue(mockStreamController, data, EventPriority.NORMAL);

            // Should buffer instead of enqueue
            expect(controller.getStats().totalBuffered).toBe(1);
        });

        it('should handle enqueue errors gracefully', () => {
            mockStreamController.enqueue = vi.fn().mockImplementation(() => {
                throw new Error('Enqueue failed');
            });

            const data = new TextEncoder().encode('test');
            const result = controller.enqueue(
                mockStreamController,
                data,
                EventPriority.NORMAL
            );

            expect(result).toBe(false);
        });
    });
});
