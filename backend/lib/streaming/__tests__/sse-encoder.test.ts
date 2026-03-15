import { describe, expect, it, vi, beforeEach } from 'vitest';
import { SSEEncoder } from '../sse-encoder';
import { BackpressureController, EventPriority } from '../backpressure-controller';

// Mock the BackpressureController
vi.mock('../backpressure-controller', () => ({
    BackpressureController: vi.fn().mockImplementation(function() {
        return { enqueue: vi.fn() };
    }),
    EventPriority: {
        LOW: 'low',
        NORMAL: 'normal',
        HIGH: 'high',
        CRITICAL: 'critical',
    },
}));

describe('SSEEncoder', () => {
    let encoder: SSEEncoder;
    let mockBackpressureController: BackpressureController;

    beforeEach(() => {
        vi.clearAllMocks();
        mockBackpressureController = new BackpressureController();
        (mockBackpressureController.enqueue as ReturnType<typeof vi.fn>).mockReturnValue(true);
        encoder = new SSEEncoder(mockBackpressureController);
    });

    describe('encode', () => {
        it('should encode a simple event with data', () => {
            const result = encoder.encode('message', { text: 'Hello' });
            const decoded = new TextDecoder().decode(result);
            
            expect(decoded).toContain('event: message');
            expect(decoded).toContain('data: {"text":"Hello"}');
            expect(decoded).toContain('\n\n');
        });

        it('should encode an event with null data', () => {
            const result = encoder.encode('ping', null);
            const decoded = new TextDecoder().decode(result);
            
            expect(decoded).toContain('event: ping');
            expect(decoded).toContain('data: null');
            expect(decoded).toContain('\n\n');
        });

        it('should encode an event with complex data', () => {
            const complexData = {
                user: { id: 1, name: 'John' },
                items: ['item1', 'item2'],
                nested: { deep: { value: 42 } },
            };
            const result = encoder.encode('update', complexData);
            const decoded = new TextDecoder().decode(result);
            
            expect(decoded).toContain('event: update');
            expect(decoded).toContain('"user":{');
            expect(decoded).toContain('"items":[');
            expect(decoded).toContain('"nested":{');
        });

        it('should encode an event with array data', () => {
            const result = encoder.encode('items', [1, 2, 3]);
            const decoded = new TextDecoder().decode(result);
            
            expect(decoded).toContain('event: items');
            expect(decoded).toContain('data: [1,2,3]');
        });

        it('should encode an event with string data', () => {
            const result = encoder.encode('string', 'test');
            const decoded = new TextDecoder().decode(result);
            
            expect(decoded).toContain('event: string');
            expect(decoded).toContain('data: "test"');
        });

        it('should encode an event with number data', () => {
            const result = encoder.encode('number', 42);
            const decoded = new TextDecoder().decode(result);
            
            expect(decoded).toContain('event: number');
            expect(decoded).toContain('data: 42');
        });

        it('should encode an event with boolean data', () => {
            const result = encoder.encode('boolean', true);
            const decoded = new TextDecoder().decode(result);
            
            expect(decoded).toContain('event: boolean');
            expect(decoded).toContain('data: true');
        });

        it('should handle unicode characters', () => {
            const data = { text: 'Hello 世界 🌍' };
            const result = encoder.encode('message', data);
            const decoded = new TextDecoder().decode(result);
            
            expect(decoded).toContain('event: message');
            expect(decoded).toContain('世界');
            expect(decoded).toContain('🌍');
        });

        it('should handle empty object', () => {
            const result = encoder.encode('empty', {});
            const decoded = new TextDecoder().decode(result);
            
            expect(decoded).toContain('event: empty');
            expect(decoded).toContain('data: {}');
        });

        it('should return Uint8Array', () => {
            const result = encoder.encode('test', { data: 'value' });
            
            expect(result).toBeInstanceOf(Uint8Array);
        });
    });

    describe('heartbeat', () => {
        it('should encode a heartbeat comment', () => {
            const result = encoder.heartbeat();
            const decoded = new TextDecoder().decode(result);
            
            expect(decoded).toBe(': heartbeat\n\n');
        });

        it('should return Uint8Array', () => {
            const result = encoder.heartbeat();
            
            expect(result).toBeInstanceOf(Uint8Array);
        });
    });

    describe('enqueueEvent', () => {
        it('should encode and enqueue event with backpressure', () => {
            const mockController = {
                enqueue: vi.fn().mockReturnValue(true),
            } as unknown as ReadableStreamDefaultController<Uint8Array>;
            
            const result = encoder.enqueueEvent(mockController, 'message', { text: 'Hello' });
            
            expect(result).toBe(true);
            expect(mockBackpressureController.enqueue).toHaveBeenCalledWith(
                mockController,
                expect.any(Uint8Array),
                EventPriority.NORMAL
            );
        });

        it('should use CRITICAL priority when specified', () => {
            const mockController = {
                enqueue: vi.fn().mockReturnValue(true),
            } as unknown as ReadableStreamDefaultController<Uint8Array>;
            
            const result = encoder.enqueueEvent(
                mockController,
                'error',
                { message: 'Error' },
                EventPriority.CRITICAL
            );
            
            expect(result).toBe(true);
            expect(mockBackpressureController.enqueue).toHaveBeenCalledWith(
                mockController,
                expect.any(Uint8Array),
                EventPriority.CRITICAL
            );
        });

        it('should use LOW priority when specified', () => {
            const mockController = {
                enqueue: vi.fn().mockReturnValue(true),
            } as unknown as ReadableStreamDefaultController<Uint8Array>;
            
            const result = encoder.enqueueEvent(
                mockController,
                'info',
                { message: 'Info' },
                EventPriority.LOW
            );
            
            expect(result).toBe(true);
            expect(mockBackpressureController.enqueue).toHaveBeenCalledWith(
                mockController,
                expect.any(Uint8Array),
                EventPriority.LOW
            );
        });

        it('should return false when backpressure enqueue fails', () => {
            (mockBackpressureController.enqueue as ReturnType<typeof vi.fn>).mockReturnValue(false);
            const mockController = {
                enqueue: vi.fn(),
            } as unknown as ReadableStreamDefaultController<Uint8Array>;

            const result = encoder.enqueueEvent(mockController, 'message', { text: 'Hello' });

            expect(result).toBe(false);
        });

        it('should encode event data correctly before enqueuing', () => {
            const mockController = {
                enqueue: vi.fn().mockReturnValue(true),
            } as unknown as ReadableStreamDefaultController<Uint8Array>;
            
            encoder.enqueueEvent(mockController, 'test', { key: 'value' });
            
            const enqueueCall = mockBackpressureController.enqueue as any;
            const encodedData = enqueueCall.mock.calls[0][1];
            const decoded = new TextDecoder().decode(encodedData);
            
            expect(decoded).toContain('event: test');
            expect(decoded).toContain('data: {"key":"value"}');
        });
    });

    describe('enqueueHeartbeat', () => {
        it('should encode and enqueue heartbeat with LOW priority', () => {
            const mockController = {
                enqueue: vi.fn().mockReturnValue(true),
            } as unknown as ReadableStreamDefaultController<Uint8Array>;
            
            const result = encoder.enqueueHeartbeat(mockController);
            
            expect(result).toBe(true);
            expect(mockBackpressureController.enqueue).toHaveBeenCalledWith(
                mockController,
                expect.any(Uint8Array),
                EventPriority.LOW
            );
        });

        it('should return false when backpressure enqueue fails', () => {
            (mockBackpressureController.enqueue as ReturnType<typeof vi.fn>).mockReturnValue(false);
            const mockController = {
                enqueue: vi.fn(),
            } as unknown as ReadableStreamDefaultController<Uint8Array>;

            const result = encoder.enqueueHeartbeat(mockController);

            expect(result).toBe(false);
        });

        it('should encode heartbeat correctly before enqueuing', () => {
            const mockController = {
                enqueue: vi.fn().mockReturnValue(true),
            } as unknown as ReadableStreamDefaultController<Uint8Array>;
            
            encoder.enqueueHeartbeat(mockController);
            
            const enqueueCall = mockBackpressureController.enqueue as any;
            const encodedData = enqueueCall.mock.calls[0][1];
            const decoded = new TextDecoder().decode(encodedData);
            
            expect(decoded).toBe(': heartbeat\n\n');
        });
    });

    describe('edge cases', () => {
        it('should handle very large data objects', () => {
            const largeData = {
                items: Array.from({ length: 1000 }, (_, i) => ({ id: i, value: `item-${i}` })),
            };
            const result = encoder.encode('large', largeData);
            const decoded = new TextDecoder().decode(result);
            
            expect(decoded).toContain('event: large');
            expect(decoded).toContain('"items":[');
            expect(result.length).toBeGreaterThan(1000);
        });

        it('should handle deeply nested objects', () => {
            const nested = { level1: { level2: { level3: { level4: { value: 'deep' } } } } };
            const result = encoder.encode('nested', nested);
            const decoded = new TextDecoder().decode(result);
            
            expect(decoded).toContain('event: nested');
            expect(decoded).toContain('"level1":{');
            expect(decoded).toContain('"value":"deep"');
        });

        it('should handle Date objects', () => {
            const date = new Date('2024-01-01T00:00:00.000Z');
            const result = encoder.encode('date', date);
            const decoded = new TextDecoder().decode(result);
            
            expect(decoded).toContain('event: date');
            expect(decoded).toContain('2024-01-01');
        });

        it('should handle special characters in data', () => {
            const data = { text: 'Line 1\nLine 2\nLine 3' };
            const result = encoder.encode('message', data);
            const decoded = new TextDecoder().decode(result);
            
            expect(decoded).toContain('event: message');
            expect(decoded).toContain('data: ');
        });

        it('should handle undefined data', () => {
            const result = encoder.encode('undefined', undefined);
            const decoded = new TextDecoder().decode(result);
            
            expect(decoded).toContain('event: undefined');
            expect(decoded).toContain('data: undefined');
        });
    });

    describe('integration', () => {
        it('should work with multiple events in sequence', () => {
            const event1 = encoder.encode('message', { text: 'Hello' });
            const event2 = encoder.encode('message', { text: 'World' });
            const decoded1 = new TextDecoder().decode(event1);
            const decoded2 = new TextDecoder().decode(event2);
            
            expect(decoded1).toContain('data: {"text":"Hello"}');
            expect(decoded2).toContain('data: {"text":"World"}');
        });

        it('should work with mixed event types', () => {
            const event = encoder.encode('data', { value: 42 });
            const heartbeat = encoder.heartbeat();
            
            const eventDecoded = new TextDecoder().decode(event);
            const heartbeatDecoded = new TextDecoder().decode(heartbeat);
            
            expect(eventDecoded).toContain('event: data');
            expect(heartbeatDecoded).toBe(': heartbeat\n\n');
        });
    });
});
