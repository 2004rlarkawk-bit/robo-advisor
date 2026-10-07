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
    ['Wooden Kitchen Cabinet', '940340'],
    ['Oak Kitchen Table', '940340'],
    ['목제 주방 캐비닛', '940340'],
    ['Wooden Bedroom Cabinet', '940350'],
    ['Wooden Bed-room Wardrobe', '940350'],
    ['목제 침실 옷장', '940350'],
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

  it('가구 단어가 수식어로만 쓰인 다른 물건은 정하지 않는다', () => {
    // HSCodeComp 측정에서 샹들리에·책상 정리함이 책상 소호로 강제된 사례
    expect(furnitureSubheadingForQuery('Nordic Front Desk Lamps Simple Iron Art Bar Tree Chandelier')).toBeNull();
    expect(furnitureSubheadingForQuery('Drawer-style Storage Rack Desk Sundries Organizer Wood')).toBeNull();
    expect(furnitureSubheadingForQuery('Wooden Desk Organizer')).toBeNull();
    expect(furnitureSubheadingForQuery('Metal Table Lamp')).toBeNull();
    expect(furnitureSubheadingForQuery('Glass Table Cloth Cover')).toBeNull();
    expect(furnitureSubheadingForQuery('Wooden Storage Box')).toBeNull();
    expect(furnitureSubheadingForQuery('나무 책상 스탠드 조명')).toBeNull();
  });

  it('목제 가구의 용도가 충돌하면 소호를 강제하지 않는다', () => {
    expect(furnitureSubheadingForQuery('Wooden Kitchen Office Cabinet')).toBeNull();
    expect(furnitureSubheadingForQuery('Wooden Kitchen Bedroom Table')).toBeNull();
    expect(furnitureSubheadingForQuery('목제 사무실 침실 캐비닛')).toBeNull();
  });

  it('앉는 가구와 가구가 아닌 품목은 다루지 않는다', () => {
    expect(furnitureSubheadingForQuery('Wooden Chair')).toBeNull();
    expect(furnitureSubheadingForQuery('Steel Pipe')).toBeNull();
    expect(furnitureSubheadingForQuery('Stone Slab')).toBeNull();
  });
});
