/** Advisory setup checks; these never modify operations or machining paths. */
export function enabledOperations(list = []) {
    const enabled = [];
    for (const op of list || []) {
        if (op.type === '|') break;
        if (!op.disabled) enabled.push(op);
    }
    return enabled;
}

export function flipWarnings(process, requestedAxis) {
    const sides = [enabledOperations(process.ops), enabledOperations(process.op2)];
    const axis = requestedAxis || sides.flat().find(op => op.type === 'flip')?.axis;
    if (!['X', 'Y'].includes(axis)) return [];
    const warnings = [];
    sides.forEach((ops, side) => {
        for (const op of ops) {
            if (op.type !== 'register' || Number(op.points) !== 3 || !['X', 'Y'].includes(op.axis) || op.axis === axis) continue;
            warnings.push(`Three-point Register ${op.axis} on the ${side ? 'other' : 'current'} side: Flip ${axis} swaps the single-pin and paired-pin ends, so holes may not align. Check the setup or use Flip ${op.axis}.`);
        }
    });
    return warnings;
}

export function flipInstruction(axis) {
    if (axis === 'X') return 'Rotate stock 180° about X; +Y and −Y edges exchange. The X axis stays fixed.';
    if (axis === 'Y') return 'Rotate stock 180° about Y; +X and −X edges exchange. The Y axis stays fixed.';
    return 'Choose X or Y for a 180° stock flip.';
}

/** Bright axis and half-turn arrow in stock coordinates, independent of camera. */
export function createFlipGuide(axis, size, center) {
    if (!['X', 'Y'].includes(axis)) return null;
    const group = new THREE.Group();
    group.name = `flip-guide-${axis}`;
    group.position.set(center.x, center.y, center.z);
    const alongX = axis === 'X';
    const length = Math.max(alongX ? size.x : size.y, 10) * 0.65;
    const radius = Math.max((alongX ? size.y : size.x) * 0.6, size.z * 0.6, 10);
    const line = (points, color) => {
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.LineBasicMaterial({ color, depthTest: false, depthWrite: false });
        const object = new THREE.Line(geometry, material);
        object.renderOrder = 1000;
        group.add(object);
    };
    const point = (u, z) => new THREE.Vector3(alongX ? 0 : u, alongX ? u : 0, z);
    line([new THREE.Vector3(alongX ? -length : 0, alongX ? 0 : -length, 0),
          new THREE.Vector3(alongX ? length : 0, alongX ? 0 : length, 0)], 0xffbf00);
    const arc = [];
    for (let i = 0; i <= 48; i++) {
        const angle = Math.PI * i / 48;
        arc.push(point(radius * Math.cos(angle), radius * Math.sin(angle)));
    }
    line(arc, 0xb66cff);
    const end = arc[arc.length - 1];
    const head = radius * 0.14;
    line([point(-radius - head * 0.5, head), end, point(-radius + head * 0.5, head)], 0xb66cff);
    return group;
}
