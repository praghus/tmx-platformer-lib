import { Light } from 'lucendi';
import { COLORS, NODE_TYPE } from '../constants';
import { Box, Polygon, Response, Vector, testPolygonPolygon } from 'sat';
import { boxOverlap, isValidArray, outline, fillText, stroke, lightMaskDisc, lightMaskRect } from '../helpers';
export class Entity {
    constructor(obj) {
        this.force = new Vector(0, 0);
        this.expectedPos = new Vector(0, 0);
        this.collisionLayers = [];
        this.collided = [];
        this.dead = false;
        this.visible = true;
        this.kill = () => this.dead = true;
        this.isActive = (scene) => this.activated || scene.onScreen(this);
        Object.keys(obj).forEach((prop) => this[prop] = obj[prop]);
        this.initialPos = new Vector(this.x, this.y);
        // @todo: refactor
        this.id = obj.id
            ? `${obj.id}`
            : Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        this.setBoundingBox(0, 0, this.width, this.height);
    }
    setBoundingBox(x, y, w, h) {
        this.bounds = { x, y, w, h };
        this.collisionMask = new Box(new Vector(0, 0), w, h).toPolygon().translate(x, y);
    }
    getTranslatedBounds(x = this.x, y = this.y) {
        if (this.collisionMask instanceof Polygon) {
            return Object.assign({}, this.collisionMask, { pos: { x, y } });
        }
    }
    draw(ctx, scene) {
        if (this.isActive(scene) && this.visible) {
            const { camera } = scene;
            if (this.sprite) {
                this.sprite.draw(ctx, this.x + camera.x, this.y + camera.y);
            }
            else if (this.color) {
                ctx.save();
                ctx.fillStyle = this.color;
                ctx.beginPath();
                ctx.rect(this.x + camera.x, this.y + camera.y, this.width, this.height);
                ctx.fill();
                ctx.closePath();
                ctx.restore();
            }
            if (scene.debug)
                this._displayDebug(ctx, scene);
        }
    }
    hit(damage) {
        if (isValidArray(this.energy)) {
            this.energy[0] -= damage;
        }
    }
    overlapTest(obj, scene) {
        if (this.isActive(scene) && this.collisionMask && obj.collisionMask) {
            const response = new Response();
            if (testPolygonPolygon(this.getTranslatedBounds(), obj.getTranslatedBounds(), response)) {
                this.collide && this.collide(obj, scene, response);
                this.collided.push(obj);
                obj.collide && obj.collide(this, scene, response);
                obj.collided.push(this);
            }
            response.clear();
        }
    }
    update(scene) {
        this.expectedPos = new Vector(this.x + this.force.x, this.y + this.force.y);
        if (!this.force.x && !this.force.y)
            return;
        const { width, height, tilewidth, tileheight } = scene.map;
        const b = this.bounds;
        if (this.expectedPos.x + b.x <= 0 || this.expectedPos.x + b.x + b.w >= width * tilewidth)
            this.force.x = 0;
        if (this.expectedPos.y + b.y <= 0 || this.expectedPos.y + b.y + b.h >= height * tileheight)
            this.force.y = 0;
        const offsetX = this.x + b.x;
        const offsetY = this.y + b.y;
        const PX = Math.ceil((this.expectedPos.x + b.x) / tilewidth) - 1;
        const PY = Math.ceil((this.expectedPos.y + b.y) / tileheight) - 1;
        const PW = Math.ceil((this.expectedPos.x + b.x + b.w) / tilewidth);
        const PH = Math.ceil((this.expectedPos.y + b.y + b.h) / tileheight);
        if (isValidArray(this.collisionLayers) && this.collisionMask) {
            for (const layerId of this.collisionLayers) {
                const layer = scene.getLayer(layerId);
                if (layer.type === NODE_TYPE.LAYER) {
                    for (let y = PY; y < PH; y++) {
                        for (let x = PX; x < PW; x++) {
                            const tile = scene.getTile(x, y, layer.id);
                            const nextX = { x: offsetX + this.force.x, y: offsetY, w: b.w, h: b.h };
                            const nextY = { x: offsetX, y: offsetY + this.force.y, w: b.w, h: b.h };
                            if (tile && tile.isSolid()) {
                                if (tile.isCutomShape() && !(tile.isOneWay() && this.force.y < 0)) {
                                    const overlap = tile.collide(this.getTranslatedBounds(this.x + this.force.x - (x * tilewidth), this.y + this.force.y - (y * tileheight)));
                                    this.force.x += overlap.x;
                                    this.force.y += overlap.y;
                                }
                                else {
                                    const t = tile.getBounds(x, y);
                                    if (boxOverlap(nextX, t) && Math.abs(this.force.x) > 0 && !tile.isOneWay()) {
                                        this.force.x = this.force.x < 0
                                            ? t.x + tile.width - offsetX
                                            : t.x - b.w - offsetX;
                                    }
                                    if (boxOverlap(nextY, t)) {
                                        if (!tile.isOneWay() && Math.abs(this.force.y) > 0) {
                                            this.force.y = this.force.y < 0
                                                ? t.y + tile.height - offsetY
                                                : t.y - b.h - offsetY;
                                        }
                                        else if (this.force.y >= 0 && tile.isOneWay() && this.y + b.y + b.h <= t.y) {
                                            this.force.y = t.y - b.h - offsetY;
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        this.x += this.force.x;
        this.y += this.force.y;
        this.onGround = this.y < this.expectedPos.y;
    }
    addLightSource(color, distance, radius = 8) {
        this.light = new Light({ color, distance, radius, id: this.type });
    }
    getLight(scene) {
        if (!this.light)
            return;
        this.light.move(this.x + (this.width / 2) + scene.camera.x, this.y + (this.height / 2) + scene.camera.y);
        return this.light;
    }
    getLightMask(scene) {
        const x = Math.round(this.x + scene.camera.x);
        const y = Math.round(this.y + scene.camera.y);
        const { pos, points } = this.getTranslatedBounds(x, y);
        return this.shape === 'ellipse'
            ? lightMaskDisc(x, y, this.width / 2)
            : lightMaskRect(pos.x, pos.y, points);
    }
    _displayDebug(ctx, scene) {
        const { camera } = scene;
        const { collisionMask, width, height, type, visible, force } = this;
        const [posX, posY] = [Math.floor(this.x + camera.x), Math.floor(this.y + camera.y)];
        ctx.lineWidth = 0.1;
        outline(ctx)(posX, posY, width, height, visible ? COLORS.WHITE_30 : COLORS.PURPLE);
        ctx.lineWidth = 0.5;
        const color = this.collided.length ? COLORS.LIGHT_RED : COLORS.GREEN;
        stroke(ctx)(posX, posY, collisionMask.points, visible ? color : COLORS.PURPLE);
        const text = fillText(ctx);
        const [x, y] = [posX + width + 4, posY + height / 2];
        text(`${type}`, posX, posY - 10, COLORS.WHITE);
        text(`x:${Math.floor(this.x)}`, posX, posY - 6);
        text(`y:${Math.floor(this.y)}`, posX, posY - 2);
        force.x !== 0 && text(`${force.x.toFixed(2)}`, x, y - 2);
        force.y !== 0 && text(`${force.y.toFixed(2)}`, x, y + 2);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZW50aXR5LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vbGliL21vZGVscy9lbnRpdHkudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQ0EsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLFNBQVMsQ0FBQTtBQUMvQixPQUFPLEVBQUUsTUFBTSxFQUFFLFNBQVMsRUFBRSxNQUFNLGNBQWMsQ0FBQTtBQUNoRCxPQUFPLEVBQUUsR0FBRyxFQUFFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxFQUFFLGtCQUFrQixFQUFFLE1BQU0sS0FBSyxDQUFBO0FBQ3hFLE9BQU8sRUFBRSxVQUFVLEVBQUUsWUFBWSxFQUFFLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxFQUFFLGFBQWEsRUFBRSxhQUFhLEVBQUUsTUFBTSxZQUFZLENBQUE7QUFFOUcsTUFBTSxPQUFPLE1BQU07SUF1Q2YsWUFBYSxHQUFvQjtRQXJCMUIsVUFBSyxHQUFlLElBQUksTUFBTSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQTtRQUNwQyxnQkFBVyxHQUFlLElBQUksTUFBTSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQTtRQUcxQyxvQkFBZSxHQUFhLEVBQUUsQ0FBQTtRQUM5QixhQUFRLEdBQWEsRUFBRSxDQUFBO1FBU3ZCLFNBQUksR0FBRyxLQUFLLENBQUE7UUFDWixZQUFPLEdBQUcsSUFBSSxDQUFBO1FBR2QsU0FBSSxHQUFHLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFBO1FBQzdCLGFBQVEsR0FBRyxDQUFDLEtBQVksRUFBVyxFQUFFLENBQUMsSUFBSSxDQUFDLFNBQVMsSUFBSSxLQUFLLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFBO1FBRy9FLE1BQU0sQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsSUFBSSxFQUFFLEVBQUUsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEdB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M0UsSUFBSSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQUUsT0FBTTtRQUUxQyxNQUFNLEVBQUUsS0FBSyxFQUFFLE1BQU0sRUFBRSxTQUFTLEVBQUUsVUFBVSxFQUFFLEdBQUcsS0FBSyxDQUFDLEdBQUcsQ0FBQTtRQUMxRCxNQUFNLENBQUMsR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFBO1FBRXJCLElBQUksSUFBSSxDQUFDLFdBQVcsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLElBQUksSUFBSSxDQUFDLFdBQVcsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxJQUFJLEtBQUssR0FBRyxTQUFTO1lBQUUsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFBO1FBQzFHLElBQUksSUFBSSxDQUFDLFdBQVcsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLElBQUksSUFBSSxDQUFDLFdBQVcsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxJQUFJLE1BQU0sR0FBRyxVQUFVO1lBQUUsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFBO1FBRTVHLE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQTtRQUM1QixNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUE7UUFDNUIsTUFBTSxFQUFFLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLElBQUksQ0FBQyxXQUFXLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxTQUFTLENBQUMsR0FBRyxDQUFDLENBQUE7UUFDaEUsTUFBTSxFQUFFLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFD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bkIsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUE7UUFDcEUsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksRUFBRSxJQUFJLEVBQUUsYUFBYSxDQUFDLE1BQU0sRUFBRSxPQUFPLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxDQUFBO1FBRTlFLE1BQU0sSUFBSSxHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMsQ0FBQTtRQUMxQixNQUFNLENBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBRSxHQUFHLENBQUUsSUFBSSxHQUFHLEtBQUssR0FBRyxDQUFDLEVBQUUsSUFBSSxHQUFHLE1BQU0sR0FBRyxDQUFDLENBQUUsQ0FBQTtRQUV4RCxJQUFJLENBQUMsR0FBRyxJQUFJLEVBQUUsRUFBRSxJQUFJLEVBQUUsSUFBSSxHQUFHLEVBQUUsRUFBRSxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUE7UUFDOUMsSUFBSSxDQUFDLEtBQUssSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxJQUFJLEVBQUUsSUFBSSxHQUFHLENBQUMsQ0FBQyxDQUFBO1FBQy9DLElBQUksQ0FBQyxLQUFLLElBQUksQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsSUFBSSxFQUFFLElBQUksR0FBRyxDQUFDLENBQUMsQ0FBQTtRQUUvQyxLQUFLLENBQUMsQ0FBQyxLQUFLLENBQUMsSUFBSSxJQUFJLENBQUMsR0FBRyxLQUFLLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsRUFBRSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUE7UUFDeEQsS0FBSyxDQUFDLENBQUMsS0FBSyxDQUFDLElBQUksSUFBSSxDQUFDLEdBQUcsS0FBSyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLEVBQUUsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFBO0lBQzVELENBQUM7Q0FDSiJ9