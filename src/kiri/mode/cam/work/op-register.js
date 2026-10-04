/** Copyright Stewart Allen <sa@grid.space> -- All Rights Reserved */

import { CamOp } from '../core/op.js';
import { Tool } from '../core/tool.js';
import { newPolygon } from '../../../../geo/polygon.js';
import { newSlice } from '../../../core/slice.js';
import { newPoint } from '../../../../geo/point.js';
import { arcToPath } from '../../../../geo/paths.js';
import { util } from '../../../../geo/base.js';

class OpRegister extends CamOp {
    constructor(state, op) {
        super(state, op);
    }

    async slice(progress) {
        let { op, state } = this;
        let { addSlices, bounds, color, settings, widget } = state;
        let { updateToolDiams } = state;

        let tool = new Tool(settings, op.tool);
        let sliceOut = this.sliceOut = [];
        let axis = op.axis.toLowerCase();

        const nominalDiameter = Number(op.diameter || 0);
        const allowance = Number(op.allowance ?? 0);
        const diameter = nominalDiameter > 0 ? nominalDiameter + allowance : 0;
        const toolDiam = tool.fluteDiameter();
        const holes = !['-', '='].includes(axis);
        if (holes && op.method != null && !['drill', 'mill'].includes(op.method)) {
            throw new Error('Choose Drill / peck or Helical mill for registration holes.');
        }
        const usesDiameter = holes && op.method !== 'drill';
        if (usesDiameter && (!Number.isFinite(allowance) || allowance < 0)) {
            throw new Error('Registration diameter allowance must be a finite, non-negative value.');
        }
        if (usesDiameter && (!Number.isFinite(nominalDiameter) || nominalDiameter < 0 || !Number.isFinite(diameter) ||
            (diameter > 0 && diameter < toolDiam - 0.001))) {
            throw new Error('Registration hole diameter must be at least the tool diameter.');
        }
        this.milling = holes && (op.method === 'mill' || (op.method == null && diameter > toolDiam + 0.001));
        if (this.milling && !(nominalDiameter > 0 && diameter > toolDiam + 0.001)) {
            throw new Error('Helical registration hole diameter plus allowance must be larger than the cutter diameter.');
        }
        if (this.milling && tool.getType() !== 'endmill') {
            throw new Error('Helical registration holes require a centre-cutting end mill.');
        }
        if (this.milling && !(Number.isFinite(op.pitch) && op.pitch > 0)) {
            throw new Error('Registration helix pitch must be greater than zero.');
        }
        updateToolDiams(toolDiam);

        let { stock } = settings;
        let { pos } = widget.track;
        let toolZ = pos.z,
            boundMinX = bounds.min.x,
            boundMaxX = bounds.max.x,
            boundMinY = bounds.min.y,
            boundMaxY = bounds.max.y,
            toolOffset = tool.fluteDiameter() * 2,
            // For three-point registration, allow the paired holes to be
            // spread farther apart than the legacy tool-diameter-derived
            // distance. A zero/omitted value preserves the old behaviour.
            pairOffset = op.spacing > 0 ? op.spacing / 2 : toolOffset,
            centerX = (boundMinX + boundMaxX) / 2,
            centerY = (boundMinY + boundMaxY) / 2,
            cutDepth = op.thru || 0,
            pathPoints = [],
            stockToSurfaceOffset = stock.z - bounds.max.z,
            startZ = bounds.max.z + stockToSurfaceOffset + toolZ,
            endZ = toolZ - cutDepth,
            cutOffset = op.offset;

        if (!(stock.x && stock.y && stock.z)) {
            return;
        }

        switch (axis) {
            case "x":
                if (op.points == 3) {
                    pathPoints.push(newPoint(boundMinX - cutOffset, centerY, 0));
                    pathPoints.push(newPoint(boundMaxX + cutOffset, centerY - pairOffset, 0));
                    pathPoints.push(newPoint(boundMaxX + cutOffset, centerY + pairOffset, 0));
                } else {
                    pathPoints.push(newPoint(boundMinX - cutOffset, centerY, 0));
                    pathPoints.push(newPoint(boundMaxX + cutOffset, centerY, 0));
                }
                break;
            case "y":
                if (op.points == 3) {
                    pathPoints.push(newPoint(centerX, boundMinY - cutOffset, 0));
                    pathPoints.push(newPoint(centerX - pairOffset, boundMaxY + cutOffset, 0));
                    pathPoints.push(newPoint(centerX + pairOffset, boundMaxY + cutOffset, 0));
                } else {
                    pathPoints.push(newPoint(centerX, boundMinY - cutOffset, 0));
                    pathPoints.push(newPoint(centerX, boundMaxY + cutOffset, 0));
                }
                break;
            case "-":
            case "=":
                let halfOffset = toolOffset / 2,
                    loopMinX = boundMinX - cutOffset,
                    loopMaxX = boundMaxX + cutOffset,
                    loopMinY = boundMinY - cutOffset - halfOffset,
                    loopMaxY = boundMaxY + cutOffset + halfOffset,
                    deltaX = (loopMaxX - loopMinX - halfOffset) / 4,
                    deltaY = (loopMaxY - loopMinY - halfOffset * 3) / 4,
                    poly, currentPoint, currentZ;
                function start(z) {
                    currentZ = z;
                    currentPoint = { x: loopMinX + halfOffset * 0.5, y: loopMinY + halfOffset * 1.5 };
                    poly = newPolygon().add(currentPoint.x, currentPoint.y, z);
                }
                function move(dx, dy) {
                    currentPoint.x += dx;
                    currentPoint.y += dy;
                    poly.add(currentPoint.x, currentPoint.y, currentZ);
                }
                function rept(count, step, fn) {
                    while (count-- > 0) {
                        fn(step, count);
                        step = -step;
                    }
                }
                for (let z of util.lerp(startZ, endZ, op.down)) {
                    let slice = newSlice(z);
                    addSlices(slice);
                    sliceOut.push(slice);
                    start(z);
                    rept(4, halfOffset, (oy, count) => {
                        move(0, -oy);
                        if (axis === '=' && count % 2 === 1) {
                            move(deltaX/2, 0);
                            move(0, oy/2);
                            move(0, -oy/2);
                            move(deltaX/2, 0);
                        } else {
                            move(deltaX, 0);
                        }
                    });
                    rept(4, halfOffset, ox => {
                        move(ox, 0);
                        move(0, deltaY);
                    });
                    rept(4, halfOffset, oy => {
                        move(0, oy);
                        move(-deltaX, 0);
                    });
                    rept(4, halfOffset, ox => {
                        move(-ox, 0);
                        move(0, -deltaY);
                    });
                    poly.points.pop();
                    slice.camTrace = { tool: tool.getID(), rate: op.feed, plunge: op.rate };
                    slice.camLines = [ poly ];
                    slice.output()
                        .setLayer("register", { line: color }, false)
                        .addPolys(slice.camLines)
                }
                break;
        }

        if (pathPoints.length) {
            let slice = newSlice(0,null), polys = [];
            pathPoints.forEach(point => {
                if (!this.milling) {
                    polys.push(newPolygon()
                        .append(point.clone().setZ(startZ))
                        .append(point.clone().setZ(endZ)));
                    return;
                }
                const radius = (diameter - toolDiam) / 2;
                // Overlapping concentric helices also clear the centre of holes
                // larger than twice the cutter diameter.
                const rings = Math.ceil(radius / (toolDiam * 0.4));
                for (let ring = 1; ring <= rings; ring++) {
                    const r = radius * ring / rings;
                    const poly = newPolygon().setOpen();
                    let current = newPoint(point.x + r, point.y, startZ);
                    poly.append(point.clone().setZ(startZ));
                    poly.append(current.clone());
                    while (current.z > endZ) {
                        const drop = Math.min(op.pitch, current.z - endZ);
                        const angle = -2 * Math.PI * drop / op.pitch;
                        const dx = current.x - point.x, dy = current.y - point.y;
                        const next = newPoint(point.x + dx * Math.cos(angle) - dy * Math.sin(angle),
                            point.y + dx * Math.sin(angle) + dy * Math.cos(angle), current.z - drop);
                        poly.addPoints(arcToPath(current, next, 128, {
                            clockwise: true, radius: r, center: point.clone()
                        }));
                        poly.append(next.clone());
                        current = next;
                    }
                    if (op.finish) {
                        poly.addPoints(arcToPath(current, current, 128, {
                            clockwise: true, radius: r, center: point.clone()
                        }));
                        poly.append(current.clone());
                    }
                    polys.push(poly);
                }
            });
            slice.camLines = polys;
            slice.output()
                .setLayer("register", {face: color, line: color})
                .addPolys(polys);
            addSlices(slice);
            sliceOut.push(slice);
        }
    }

    prepare(ops, progress) {
        let { op } = this;
        let { emitDrills, emitTraces, setDrill, setTool, setTravelBoundary } = ops;

        setTravelBoundary();
        if (this.milling || op.axis === '-' || op.axis === '=') {
            setTool(op.tool, op.feed, op.rate);
            for (let slice of this.sliceOut) {
                emitTraces(slice.camLines);
            }
        } else {
            setTool(op.tool, undefined, op.rate);
            setDrill(op.down, op.lift, op.dwell);
            emitDrills(this.sliceOut.map(slice => slice.camLines).flat());
        }
    }
}

export { OpRegister };
