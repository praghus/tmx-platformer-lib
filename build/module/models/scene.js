import { getFilename, isValidArray, noop } from '../helpers';
import { Camera, Layer, Sprite, Tile } from '../index';
export class Scene {
    constructor(images, viewport, properties) {
        this.images = images;
        this.viewport = viewport;
        this.properties = properties;
        this.entities = {};
        this.layers = [];
        this.tiles = {};
        this.createCustomLayer = (Layer, index) => this.addLayer(new Layer(this), index);
        this.createSprite = (id, width, height) => new Sprite(id, this.images[id], width, height);
        this.setProperty = (name, value) => this.properties[name] = value;
        this.getProperty = (name) => this.properties[name];
        this.getMapProperty = (name) => this.map.properties && this.map.properties[name];
        this.getObjects = (layerId) => this.getLayer(layerId).getObjects();
        this.getObjectById = (id, layerId) => this.getObjects(layerId).find((object) => object.id === id);
        this.getObjectByType = (type, layerId) => this.getObjects(layerId).find((object) => object.type === type);
        this.getObjectByProperty = (key, value, layerId) => this.getObjects(layerId).find(({ properties }) => properties && properties[key] === value);
        this.getObjectLayers = () => this.layers.filter((layer) => isValidArray(layer.objects));
        this.getLayer = (id) => this.layers.find((layer) => layer.id === id);
        this.getTileset = (tileId) => this.map.tilesets.find(({ firstgid, tilecount }) => tileId + 1 >= firstgid && tileId + 1 <= firstgid + tilecount);
        this.getTile = (x, y, layerId) => this.getTileObject(this.getLayer(layerId).get(x, y));
        this.getTileObject = (gid) => this.tiles[gid] || null;
        this.resize = (viewport) => this.camera.resize(viewport);
        this.focus = (entity) => entity ? this.camera.setFollow(entity, true) : this.camera.center();
        this.removeLayer = (index) => { this.layers.splice(index, 1); };
        this.removeTile = (x, y, layerId) => this.getLayer(layerId).clear(x, y);
        this.showLayer = (layerId) => this.getLayer(layerId).toggleVisibility(1);
        this.hideLayer = (layerId) => this.getLayer(layerId).toggleVisibility(0);
        this.camera = new Camera(viewport);
        this.resize(viewport);
    }
    /**
     * Update handler
     * @param time
     * @param input
     */
    update(time, input) {
        this.input = input;
        for (const layer of this.layers) {
            layer instanceof Layer && layer.update(this, time);
        }
        this.camera.update();
    }
    /**
     * Draw handler
     * @param ctx
     */
    draw(ctx) {
        const { resolutionX, resolutionY, scale } = this.viewport;
        ctx.imageSmoothingEnabled = false;
        ctx.save();
        ctx.scale(scale, scale);
        ctx.clearRect(0, 0, resolutionX, resolutionY);
        for (const layer of this.layers) {
            layer instanceof Layer && layer.draw(ctx, this);
        }
        ctx.restore();
    }
    /**
     * Add new layer
     * @param layer
     * @param index
     */
    addLayer(layer, index) {
        if (layer instanceof Layer) {
            Number.isInteger(index)
                ? this.layers.splice(index, 0, layer)
                : this.layers.push(layer);
        }
        else
            throw new Error('Invalid Layer!');
    }
    // @todo: refactor sprite+gid
    addObject(entity, index) {
        entity.sprite = entity.image || entity.gid
            ? entity.gid
                ? this.createTile(entity.gid)
                : this.createSprite(entity.image, entity.width, entity.height)
            : null;
        this.getLayer(entity.layerId).addObject(entity, index);
    }
    addTmxMap(data, entities) {
        this.map = data;
        this.entities = entities;
        this.camera.setBounds(0, 0, data.width * data.tilewidth, data.height * data.tileheight);
        data.layers.map((layerData) => this.createTmxLayer(layerData));
    }
    createTile(id) {
        if (!this.tiles[id]) {
            const tileset = this.getTileset(id);
            const image = this.images[getFilename(tileset.image.source)];
            this.tiles[id] = new Tile(id, image, tileset);
        }
        return this.tiles[id];
    }
    createTmxLayer(tmxLayer) {
        this.layers.push(new Layer(tmxLayer));
        if (tmxLayer.data) {
            tmxLayer.data.forEach((gid) => gid > 0 && this.createTile(gid));
        }
        else if (tmxLayer.objects) {
            tmxLayer.objects.forEach((obj) => this.createObject(obj, tmxLayer.id));
        }
    }
    createObject(obj, layerId) {
        const Model = this.entities[obj.type];
        if (Model) {
            this.addObject(new Model({ layerId, ...obj }), layerId);
        }
    }
    onScreen(object) {
        if (object.attached)
            return true;
        const { camera, viewport: { resolutionX, resolutionY }, map: { tilewidth, tileheight } } = this;
        const { bounds, radius } = object;
        const { x, y, w, h } = bounds;
        if (radius) {
            const cx = object.x + x + w / 2;
            const cy = object.y + y + h / 2;
            return (cx + radius > -camera.x &&
                cy + radius > -camera.y &&
                cx - radius < -camera.x + resolutionX &&
                cy - radius < -camera.y + resolutionY);
        }
        else {
            const cx = object.x + x;
            const cy = object.y + y;
            return (cx + w + tilewidth > -camera.x &&
                cy + h + tileheight > -camera.y &&
                cx - tilewidth < -camera.x + resolutionX &&
                cy - tileheight < -camera.y + resolutionY);
        }
    }
    isSolidArea(x, y, layers) {
        return !!layers.map((layerId) => {
            const tile = this.getTile(x, y, layerId);
            return tile && tile.isSolid();
        }).find((isTrue) => !!isTrue);
    }
    forEachVisibleObject(layerId, fn = noop) {
        for (const obj of this.getLayer(layerId).objects) {
            obj.visible && this.onScreen(obj) && fn(obj);
        }
    }
    forEachVisibleTile(layerId, fn = noop) {
        const { camera, map: { tilewidth, tileheight }, viewport: { resolutionX, resolutionY } } = this;
        let y = Math.floor(camera.y % tileheight);
        let _y = Math.floor(-camera.y / tileheight);
        while (y < resolutionY) {
            let x = Math.floor(camera.x % tilewidth);
            let _x = Math.floor(-camera.x / tilewidth);
            while (x < resolutionX) {
                const tileId = this.getLayer(layerId).get(_x, _y);
                tileId && fn(this.getTileObject(tileId), x, y);
                x += tilewidth;
                _x++;
            }
            y += tileheight;
            _y++;
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2NlbmUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9saWIvbW9kZWxzL3NjZW5lLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUNBLE9BQU8sRUFBRSxXQUFXLEVBQUUsWUFBWSxFQUFFLElBQUksRUFBRSxNQUFNLFlBQVksQ0FBQTtBQUU1RCxPQUFPLEVBQUUsTUFBTSxFQUFpQixLQUFLLEVBQUUsTUFBTSxFQUFFLElBQUksRUFBWSxNQUFNLFVBQVUsQ0FBQTtBQUcvRSxNQUFNLE9BQU8sS0FBSztJQVVkLFlBQ1csTUFBb0MsRUFDcEMsUUFBa0IsRUFDbEIsVUFBNEI7UUFGNUIsV0FBTSxHQUFOLE1BQU0sQ0FBOEI7UUFDcEMsYUFBUSxHQUFSLFFBQVEsQ0FBVTtRQUNsQixlQUFVLEdBQVYsVUFBVSxDQUFrQjtRQVZoQyxhQUFRLEdBQW9CLEVBQUUsQ0FBQTtRQUM5QixXQUFNLEdBQVksRUFBRSxDQUFBO1FBQ3BCLFVBQUssR0FBcUIsRUFBRSxDQUFBO1FBd0s1QixzQkFBaUIsR0FBRyxDQUFDLEtBQTJCLEVBQUUsS0FBYyxFQUFRLEVBQUUsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksS0FBSyxDQUFDLElBQUksQ0FBQyxFQUFFLEtBQUssQ0FBQyxDQUFBO1FBQ2hILGlCQUFZLEdBQUcsQ0FBQyxFQUFVLEVBQUUsS0FBYSxFQUFFLE1BQWMsRUFBVSxFQUFFLENBQUMsSUFBSSxNQUFNLENBQUMsRUFBRSxFQUFFLElBQUksQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLEVBQUUsS0FBSyxFQUFFLE1BQU0sQ0FBQyxDQUFBO1FBQ3BILGdCQUFXLEdBQUcsQ0FBQyxJQUFZLEVBQUUsS0FBVSxFQUFRLEVBQUUsQ0FBRSxJQUFJLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxHQUFHLEtBQUssQ0FBQTtRQUNoRixnQkFBVyxHQUFHLENBQUMsSUFBWSxFQUFPLEVBQUUsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLElBQUksQ0FB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