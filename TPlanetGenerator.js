const vertexShader = `
    varying vec3 vPosition;
    varying vec3 vNormal;
    varying vec3 vLightDir;
    uniform vec3 lightPosition;

    void main() {
        vPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;
        vNormal = normalize(normalMatrix * normal);
        vLightDir = normalize(lightPosition - vPosition);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`;

const fragmentShader = `
    uniform vec3 starColor;
    uniform float carbon;
    uniform float oxygen;
    uniform float nitrogen;
    uniform float fogThickness;
    varying vec3 vPosition;
    varying vec3 vNormal;
    varying vec3 vLightDir;

    void main() {
        vec3 oxygenColor = vec3(0.0, 0.5, 1.0);
        vec3 carbonColor = vec3(1.0, 0.3, 0.3);
        vec3 nitrogenColor = vec3(0.8, 0.8, 0.0);

        vec3 baseColor = mix(oxygenColor, carbonColor, carbon);
        baseColor = mix(baseColor, nitrogenColor, nitrogen);

        // Compute fog effect based on depth and thickness
        float distance = length(vPosition);
        float fogDensity = exp(-distance * fogThickness);
        float fogFactor = smoothstep(0.1, 1.0, distance);

        vec3 color = baseColor * max(dot(vNormal, vLightDir), 0.0);
        gl_FragColor = vec4(color * fogFactor, fogDensity);
    }
`;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.z = 5;
camera.lookAt(new THREE.Vector3(0, 0, 0));

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const light = new THREE.PointLight(0xffffff);
light.position.set(10, 10, 10);
scene.add(light);

const simplex = new SimplexNoise();

const params = {
    noiseScale: 0.2,
    noiseStrength: 0.05,
    frequency: 1.5,
    amplitude: 5.0,
    octaves: 5,
    persistence: 0.5,
    planetScale: 1.0,
    rotationSpeed: 0.01,
    waterScale: 0.5,
    flatlandThreshold: 0.1,
    plateauHeight: 1.5
};

const atmosphereParams = {
    carbon: 0.5,
    oxygen: 0.3,
    nitrogen: 0.2,
    starType: 'G-type',
    fogThickness: 0.1,
    showAtmosphere: true
};

const gui = new dat.GUI();
gui.add(params, 'noiseScale', 0.01, 3.0).name('Noise Scale').onChange(updatePlanet);
gui.add(params, 'noiseStrength', 0.01, 0.1).name('Noise Strength').onChange(updatePlanet);
gui.add(params, 'frequency', 0.5, 5.0).name('Frequency').onChange(updatePlanet);
gui.add(params, 'amplitude', 1.0, 20.0).name('Amplitude').onChange(updatePlanet);
gui.add(params, 'octaves', 1, 8, 1).name('Octaves').onChange(updatePlanet);
gui.add(params, 'persistence', 0.1, 1.0).name('Persistence').onChange(updatePlanet);
gui.add(params, 'planetScale', 0.1, 2.0).name('Planet Scale').onChange(updatePlanetScale);
gui.add(params, 'rotationSpeed', 0.001, 0.1).name('Rotation Speed');
gui.add(params, 'waterScale', 0.1, 2.0).name('Water Scale').onChange(updateWater);
gui.add(params, 'flatlandThreshold', 0.0, 1.0).name('Flatland Threshold').onChange(updatePlanet);
gui.add(params, 'plateauHeight', 0.0, 3.0).name('Plateau Height').onChange(updatePlanet);

gui.add(atmosphereParams, 'carbon', 0.0, 1.0).name('Carbon').onChange(updateAtmosphere);
gui.add(atmosphereParams, 'oxygen', 0.0, 1.0).name('Oxygen').onChange(updateAtmosphere);
gui.add(atmosphereParams, 'nitrogen', 0.0, 1.0).name('Nitrogen').onChange(updateAtmosphere);
gui.add(atmosphereParams, 'starType', ['G-type', 'K-type', 'M-type']).name('Star Type').onChange(updateAtmosphere);
gui.add(atmosphereParams, 'fogThickness', 0.01, 1.0).name('Fog Thickness').onChange(updateAtmosphere);
gui.add(atmosphereParams, 'showAtmosphere').name('Show Atmosphere').onChange(updateAtmosphereVisibility);

const biomeColors = {
    desert: 0xeed9c4,
    plains: 0x228b22,
    forest: 0x228b22,
    tundra: 0xc0c0c0,
    snow: 0xffffff
};

function getBiomeColor(elevation) {
    if (elevation < 0.001) return biomeColors.desert;
    if (elevation < 0.004) return biomeColors.plains;
    if (elevation < 0.015) return biomeColors.forest;
    if (elevation < 0.02) return biomeColors.tundra;
    return biomeColors.snow;
}

function generateNoise(x, y, z) {
    let noise = 0;
    let amplitude = params.amplitude;
    let frequency = params.frequency;

    for (let i = 0; i < params.octaves; i++) {
        noise += amplitude * simplex.noise3D(x * frequency, y * frequency, z * frequency);
        amplitude *= params.persistence;
        frequency *= 2.0;
    }

    if (noise < params.flatlandThreshold) {
        return noise * 0.5;
    } else if (noise > params.plateauHeight) {
        return params.plateauHeight;
    }

    return noise;
}

function createPlanet() {
    const geometry = new THREE.SphereGeometry(1, 128, 128);
    const vertices = geometry.attributes.position.array;
    const colors = new Float32Array(vertices.length);
    const vertexCount = vertices.length / 3;

    for (let i = 0; i < vertexCount; i++) {
        const x = vertices[i * 3];
        const y = vertices[i * 3 + 1];
        const z = vertices[i * 3 + 2];

        const length = Math.sqrt(x * x + y * y + z * z);
        const nx = x / length;
        const ny = y / length;
        const nz = z / length;

        const noise = generateNoise(nx, ny, nz);
        const scale = 1 + (params.noiseStrength / 10) * noise;

        vertices[i * 3] *= scale;
        vertices[i * 3 + 1] *= scale;
        vertices[i * 3 + 2] *= scale;

        const elevation = Math.sqrt(vertices[i * 3] ** 2 + vertices[i * 3 + 1] ** 2 + vertices[i * 3 + 2] ** 2) - 1;
        const color = new THREE.Color(getBiomeColor(elevation));

        colors[i * 3] = color.r;
        colors[i * 3 + 1] = color.g;
        colors[i * 3 + 2] = color.b;
    }

    geometry.computeVertexNormals();
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.attributes.position.needsUpdate = true;

    const material = new THREE.MeshStandardMaterial({ vertexColors: true });
    return new THREE.Mesh(geometry, material);
}

let planet = createPlanet();
planet.scale.set(params.planetScale, params.planetScale, params.planetScale);
scene.add(planet);

function createWater() {
    const textureLoader = new THREE.TextureLoader();
    const waterTexture = textureLoader.load('WaterTexture.png');
    const normalMap = textureLoader.load('WaterNormalMap.png');

    const material = new THREE.MeshStandardMaterial({
    color: 0x0066ff,  
    roughness: 0.1,
    metalness: 0.5,
    normalMap: normalMap,
    envMap: renderer.environment,
    refractionRatio: 0.95,
    transparent: true, 
    opacity: 0.8,
    emissive: 0x0033ff,
    emissiveIntensity: 0.2
});


    const geometry = new THREE.SphereGeometry(1, 128, 128);
    return new THREE.Mesh(geometry, material);
}


let water = createWater();
water.scale.set(params.waterScale, params.waterScale, params.waterScale);
scene.add(water);

let atmosphere;
function createAtmosphere() {
    if (atmosphere) {
        scene.remove(atmosphere);
    }

    if (!atmosphereParams.showAtmosphere) return;

    const geometry = new THREE.SphereGeometry(1.1, 128, 128);
    const material = new THREE.ShaderMaterial({
        vertexShader: vertexShader,
        fragmentShader: fragmentShader,
        uniforms: {
            starColor: { value: new THREE.Color(0xffff00) },
            carbon: { value: atmosphereParams.carbon },
            oxygen: { value: atmosphereParams.oxygen },
            nitrogen: { value: atmosphereParams.nitrogen },
            lightPosition: { value: light.position },
            fogThickness: { value: atmosphereParams.fogThickness }
        },
        side: THREE.FrontSide,
        transparent: true,
        blending: THREE.AdditiveBlending
    });

    atmosphere = new THREE.Mesh(geometry, material);
    atmosphere.scale.set(params.planetScale, params.planetScale, params.planetScale);
    scene.add(atmosphere);
}

createAtmosphere();

function updatePlanet() {
    scene.remove(planet);
    planet = createPlanet();
    planet.scale.set(params.planetScale, params.planetScale, params.planetScale);
    scene.add(planet);
}

function updatePlanetScale() {
    planet.scale.set(params.planetScale, params.planetScale, params.planetScale);
}

function updateWater() {
    water.scale.set(params.waterScale, params.waterScale, params.waterScale);
    water.position.set(0, 0, 0);
}

function updateAtmosphere() {
    if (atmosphere) {
        atmosphere.material.uniforms.carbon.value = atmosphereParams.carbon;
        atmosphere.material.uniforms.oxygen.value = atmosphereParams.oxygen;
        atmosphere.material.uniforms.nitrogen.value = atmosphereParams.nitrogen;
        atmosphere.material.uniforms.fogThickness.value = atmosphereParams.fogThickness;

        let starColor;
        // NOTE: Star color and type dosent yet change the atmosphere color
        switch (atmosphereParams.starType) {
            case 'K-type':
                starColor = new THREE.Color(0xffa500); // Orange for K-type
                break;
            case 'M-type':
                starColor = new THREE.Color(0xff0000); // Red for M-type
                break;
            default:
                starColor = new THREE.Color(0xffff00); // Yellow for G-type
        }
        atmosphere.material.uniforms.starColor.value = starColor;
        atmosphere.material.needsUpdate = true;
    } else if (atmosphereParams.showAtmosphere) {
        createAtmosphere();
    }
}

function updateAtmosphereVisibility() {
    if (atmosphereParams.showAtmosphere) {
        createAtmosphere();
    } else {
        if (atmosphere) {
            scene.remove(atmosphere);
            atmosphere = null;
        }
    }
}

function animate() {
    requestAnimationFrame(animate);
    planet.rotation.y += params.rotationSpeed;
    water.rotation.y += params.rotationSpeed;
    if (atmosphere) {
        atmosphere.rotation.y += params.rotationSpeed;
    }
    renderer.render(scene, camera);
}

animate();

window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
});

window.addEventListener('wheel', (event) => {
    camera.position.z += event.deltaY * 0.001;
});
