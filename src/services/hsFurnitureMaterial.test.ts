import { describe, expect, it } from 'vitest';
import { furnitureSubheadingForQuery } from './hsFurnitureMaterial';

describe('가구 재질 보조표 (9403)', () => {
  it.each([
    ['Metal Desk Blue', '940310'],
    ['Metal Folding Desk', '940310'],
    ['철제 파란색 책상', '940310'],
    ['Steel Bookshelf', '940320'],
    ['Wooden Desk', '940330'],
    ['Wooden Office Desk', '940330'],
    ['나무 책상', '940330'],
    ['Oak Bookshelf', '940360'],
    ['Plastic Desk', '940370'],
    ['Bamboo Table', '940382'],
    ['대나무 책상', '940382'],
    ['Rattan Table', '940383'],
    ['Stone Desk', '940389'],
    ['돌 책상', '940389'],
    ['Marble Top Desk', '940389'],
    ['Glass Top Desk', '940389'],
  ])('%s → %s', (query, expected) => {
    expect(furnitureSubheadingForQuery(query)).toBe(expected);
  });

  it('재질이 없거나 둘 이상이면 정하지 않는다', () => {
    expect(furnitureSubheadingForQuery('desk')).toBeNull();
    expect(furnitureSubheadingForQuery('Height Adjustable Electric Desk')).toBeNull();
    expect(furnitureSubheadingForQuery('Metal Desk with Glass Top')).toBeNull();
  });

  it('앉는 가구와 가구가 아닌 품목은 다루지 않는다', () => {
    expect(furnitureSubheadingForQuery('Wooden Chair')).toBeNull();
    expect(furnitureSubheadingForQuery('Steel Pipe')).toBeNull();
    expect(furnitureSubheadingForQuery('Stone Slab')).toBeNull();
  });
});
