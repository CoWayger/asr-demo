import { describe, it, expect } from 'vitest';
import { float32ToInt16 } from './pcm';

describe('float32ToInt16', () => {
  it('vrátí Int16Array', () => {
    expect(float32ToInt16(new Float32Array([0]))).toBeInstanceOf(Int16Array);
  });

  it('0.0 → 0', () => {
    expect(float32ToInt16(new Float32Array([0.0]))[0]).toBe(0);
  });

  it('1.0 → 32767', () => {
    expect(float32ToInt16(new Float32Array([1.0]))[0]).toBe(0x7FFF);
  });

  it('-1.0 → -32767', () => {
    expect(float32ToInt16(new Float32Array([-1.0]))[0]).toBe(-0x7FFF);
  });

  it('clampuje hodnoty nad 1.0', () => {
    expect(float32ToInt16(new Float32Array([2.0]))[0]).toBe(0x7FFF);
  });

  it('clampuje hodnoty pod -1.0', () => {
    expect(float32ToInt16(new Float32Array([-2.0]))[0]).toBe(-0x7FFF);
  });

  it('zpracuje pole více vzorků', () => {
    const input = new Float32Array([0.0, 0.5, -0.5]);
    const output = float32ToInt16(input);
    expect(output).toHaveLength(3);
    expect(output[0]).toBe(0);
    expect(output[1]).toBe(Math.round(0.5 * 0x7FFF));
    expect(output[2]).toBe(Math.round(-0.5 * 0x7FFF));
  });
});
