import { Polygon, Response, Vector } from 'sat';
import { Drawable, StringTMap } from '../types';
import { Scene } from './scene';
export declare class Entity {
    id: string;
    pid: string;
    gid: number;
    x: number;
    y: number;
    width: number;
    height: number;
    layerId: number;
    damage: number;
    type: string;
    family: string;
    image: string;
    color: string;
    radius: number;
    direction: string;
    bounds: StringTMap<number>;
    properties: StringTMap<any>;
    force: Vector;
    expectedPos: Vector;
    initialPos: Vector;
    collisionMask: Polygon;
    collisionLayers: number[];
    collided: Entity[];
    energy: number[];
    activated: boolean;
    onGround: boolean;
    shadowCaster: boolean;
    sprite: Drawable;
    solid: boolean;
    shape: string;
    light: any;
    dead: boolean;
    visible: boolean;
    kill: () => boolean;
    isActive: (scene: Scene) => boolean;
    constructor(obj: StringTMap<any>);
    setBoundingBox(x: number, y: number, w: number, h: number): void;
    getTranslatedBounds(x?: number, y?: number): any;
    draw(ctx: CanvasRenderingContext2D, scene: Scene): void;
    collide(obj: Entity, scene: Scene, response: Response): void;
    hit(damage: number): void;
    overlapTest(obj: Entity, scene: Scene): void;
    update(scene: Scene, delta?: number): void;
    addLightSource(color: string, distance: number, radius?: number): void;
    getLight(scene: Scene): any;
    getLightMask(scene: Scene): any;
    private _displayDebug;
}
//# sourceMappingURL=entity.d.ts.map