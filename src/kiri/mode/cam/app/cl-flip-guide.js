import { api } from '../../../app/api.js';
import { space } from '../../../../moto/space.js';
import { getBounds } from './cl-stock.js';
import { createFlipGuide } from '../core/flip-guidance.js';

let guide;

export function hideFlipGuide() {
    if (!guide) return;
    guide.traverse(object => {
        object.geometry?.dispose();
        object.material?.dispose();
    });
    space.world.remove(guide);
    guide = undefined;
    space.update();
}

export function showFlipGuide(axis) {
    hideFlipGuide();
    if (!api.widgets.all().length) return;
    const { max, center } = getBounds();
    if (!max || !center) return;
    guide = createFlipGuide(axis, max, center);
    if (guide) {
        space.world.add(guide);
        space.update();
    }
}
