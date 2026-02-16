import * as THREE from 'three';

// Configuration
const PARTICLE_COUNT = 3000; // Optimized for performance
const PARTICLE_SIZE = 0.25;
const HEART_COLOR = 0xFFB7B2; // Pastel Pink
const INTERACTION_RADIUS = 3;
const MOUSE_INFLUENCE = 0.5;

// Variables
let scene, camera, renderer, particles, stars, geometry, material;
let videoElement, hands;
let handPosition = new THREE.Vector3(0, 0, 0); // Default position
let isHandDetected = false;
let isFist = false; // Track gesture state
let clock = new THREE.Clock();

// Heart Shape Formula (Volumetric)
function getHeartPosition(t) {
    // Basic Heart Curve
    const x = 16 * Math.pow(Math.sin(t), 3);
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    const z = 0;

    // To make it 3D volumetric, we can scale this 2D shape towards the center
    // and also give it thickness based on the heart shape width at that point.
    // However, a simpler approch for "Planet Heart" is:
    // 1. Generate point on surface.
    // 2. Scale by random amount to fill inside.
    // 3. Add Z-thickness proportional to X-width to make it "puffy".

    // Let's refine the Z to be more "heart-like volume"
    // Using a known 3D heart implicit surface or just thickening the 2D shape.
    // Let's stick to thickening the 2D shape for controllable aesthetics.

    const scale = Math.cbrt(Math.random()); // Cube root for uniform volume distribution

    return new THREE.Vector3(x * scale, y * scale, z);
}

function init() {
    console.log("Initializing Three.js...");
    try {
        // 1. Scene Setup
        scene = new THREE.Scene();
        // scene.background is handled by CSS transparency or we can set it here if we want fog
        // scene.fog = new THREE.FogExp2(0x000000, 0.02);

        camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        camera.position.z = 30;
        camera.position.y = 5;

        const canvas = document.querySelector('.output_canvas');
        if (!canvas) console.error("Canvas element not found!");

        renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(window.devicePixelRatio);
        console.log("Renderer created");

        // --- STARFIELD BACKGROUND ---
        const starGeo = new THREE.BufferGeometry();
        const starPos = [];
        for (let i = 0; i < 2000; i++) {
            const x = (Math.random() - 0.5) * 600;
            const y = (Math.random() - 0.5) * 600;
            const z = (Math.random() - 0.5) * 600;
            starPos.push(x, y, z);
        }
        starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
        const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.2 });
        stars = new THREE.Points(starGeo, starMat);
        scene.add(stars);


        // 2. Particle System
        geometry = new THREE.BufferGeometry();
        const positions = [];
        const heartPositions = [];
        const scatteredPositions = []; // Store scattered state
        const colors = [];
        const sizes = [];

        const color = new THREE.Color(HEART_COLOR);

        for (let i = 0; i < PARTICLE_COUNT; i++) {
            // Heart Target Position
            const t = Math.random() * Math.PI * 2;
            let hPos = getHeartPosition(t);

            // Add Z-thickness to make it 3D (puffy heart)
            // Function of x/y? Simple bulge in middle.
            const bulge = (1 - Math.abs(hPos.x) / 16) * 6; // Thicker in middle
            hPos.z = (Math.random() - 0.5) * bulge * Math.random(); // Random fill inside thickness

            // Scattered Initial Position (Random sphere)
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            const r = 20 + Math.random() * 20;

            const sX = r * Math.sin(phi) * Math.cos(theta);
            const sY = r * Math.sin(phi) * Math.sin(theta);
            const sZ = r * Math.cos(phi);

            // Start at scattered position
            positions.push(sX, sY, sZ);

            // Store targets
            heartPositions.push(hPos.x, hPos.y, hPos.z);
            scatteredPositions.push(sX, sY, sZ);

            // Slight color variation
            const c = color.clone();
            c.offsetHSL(0.0, (Math.random() - 0.5) * 0.1, (Math.random() - 0.5) * 0.1);
            colors.push(c.r, c.g, c.b);

            sizes.push(PARTICLE_SIZE * (0.8 + Math.random() * 0.4));
        }

        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('heartPosition', new THREE.Float32BufferAttribute(heartPositions, 3));
        geometry.setAttribute('scatteredPosition', new THREE.Float32BufferAttribute(scatteredPositions, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        geometry.setAttribute('size', new THREE.Float32BufferAttribute(sizes, 1));

        // Use standard PointsMaterial 
        material = new THREE.PointsMaterial({
            color: HEART_COLOR,
            size: PARTICLE_SIZE,
            sizeAttenuation: true,
            transparent: true,
            opacity: 0.9,
            blending: THREE.AdditiveBlending,
            vertexColors: true
        });

        particles = new THREE.Points(geometry, material);
        scene.add(particles);
        console.log("Particles added to scene");

        // Make sure camera is looking at the center
        camera.lookAt(0, 0, 0);

        // 3. MediaPipe Setup
        console.log("Setting up MediaPipe...");
        setupMediaPipe();

        // 4. Resize Handler
        window.addEventListener('resize', onWindowResize, false);

        // 5. Start Animation
        console.log("Starting animation loop...");
        animate();
    } catch (err) {
        console.error("Initialization error:", err);
    }
}

function setupMediaPipe() {
    videoElement = document.querySelector('.input_video');
    const loadingElement = document.getElementById('loading');

    try {
        hands = new Hands({
            locateFile: (file) => {
                return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
            }
        });

        hands.setOptions({
            maxNumHands: 1,
            modelComplexity: 1, // Revert to Full model for stability
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5
        });

        hands.onResults(onHandsResults);

        const cameraUtils = new Camera(videoElement, {
            onFrame: async () => {
                await hands.send({ image: videoElement });
            },
            width: 640,
            height: 480
        });

        cameraUtils.start()
            .then(() => {
                console.log("Camera started");
                // Hide loading text when camera starts, or change text to "Show your hand"
                loadingElement.innerText = "Camera active. Show your hand!";
                setTimeout(() => {
                    if (loadingElement) loadingElement.style.display = 'none';
                }, 2000);
            })
            .catch(err => {
                console.error("Camera failed to start", err);
                loadingElement.innerText = "Error: Camera access denied or not found.";
                loadingElement.style.color = "red";
            });

    } catch (e) {
        console.error(e);
        loadingElement.innerText = "Error initializing MediaPipe: " + e.message;
    }
}

function detectFist(landmarks) {
    // Simple heuristic: Check if fingertips are close to the wrist (landmark 0) or palm base
    // Wrist: 0
    // Thumb Tip: 4
    // Index Tip: 8
    // Middle Tip: 12
    // Ring Tip: 16
    // Pinky Tip: 20

    // We can check if tips are below the PIP joints (knuckles) in Y axis,
    // but orientation matters.
    // Easier: Check Euclidean distance from Tips to Wrist (0).
    // If all fingers (except maybe thumb) are close to wrist, it's a fist.

    const wrist = landmarks[0];
    const tips = [8, 12, 16, 20]; // Index, Middle, Ring, Pinky

    let allfolded = true;
    for (const tipIdx of tips) {
        const tip = landmarks[tipIdx];
        const dist = Math.sqrt(Math.pow(tip.x - wrist.x, 2) + Math.pow(tip.y - wrist.y, 2));
        // Threshold depends on hand size/distance, but usually < 0.3-0.4 means folded
        if (dist > 0.45) { // Adjusted threshold
            allfolded = false;
            break;
        }
    }

    return allfolded;
}

function onHandsResults(results) {
    // We handle loading screen in camera start now, but just in case
    const loadingElement = document.getElementById('loading');
    if (loadingElement && loadingElement.style.display !== 'none') {
        loadingElement.style.display = 'none';
    }

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        isHandDetected = true;
        const landmarks = results.multiHandLandmarks[0];

        // Detect Gesture
        isFist = detectFist(landmarks);

        // Update Hand Position (Index finger tip or center of palm)
        const point = landmarks[9]; // Middle finger MCP (palm center-ish)

        const vector = new THREE.Vector3(
            (1 - point.x) * 2 - 1,
            -(point.y * 2 - 1),
            0.5
        );

        vector.unproject(camera);
        const dir = vector.sub(camera.position).normalize();
        const distance = -camera.position.z / dir.z;
        const pos = camera.position.clone().add(dir.multiplyScalar(distance));

        handPosition.copy(pos);
    } else {
        isHandDetected = false;
        isFist = false; // Reset if no hand
    }
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    requestAnimationFrame(animate);

    const time = clock.getElapsedTime();
    const positions = geometry.attributes.position.array;
    const heartPositions = geometry.attributes.heartPosition.array;
    const scatteredPositions = geometry.attributes.scatteredPosition.array;

    // Movement speed
    const lerpFactor = 0.05;

    for (let i = 0; i < PARTICLE_COUNT; i++) {
        const i3 = i * 3;

        // Target: Heart if Fist, Scattered if Open Hand
        let targetX, targetY, targetZ;

        if (isFist) {
            targetX = heartPositions[i3];
            targetY = heartPositions[i3 + 1];
            targetZ = heartPositions[i3 + 2];

            // Add floating animation to Heart shape
            targetX += Math.sin(time * 0.5 + targetY * 0.1) * 0.2;
            targetY += Math.cos(time * 0.3 + targetX * 0.1) * 0.2;

            // Follow hand (optional, maybe subtle attraction)
            if (isHandDetected) {
                targetX += (handPosition.x * 0.2); // Gentle drag
                targetY += (handPosition.y * 0.2);
            }

        } else {
            targetX = scatteredPositions[i3];
            targetY = scatteredPositions[i3 + 1];
            targetZ = scatteredPositions[i3 + 2];

            // Add organic movement to scattered particles
            targetX += Math.sin(time * 0.2 + i) * 0.1;
            targetY += Math.cos(time * 0.2 + i) * 0.1;
        }

        // Move current position towards target
        positions[i3] += (targetX - positions[i3]) * lerpFactor;
        positions[i3 + 1] += (targetY - positions[i3 + 1]) * lerpFactor;
        positions[i3 + 2] += (targetZ - positions[i3 + 2]) * lerpFactor;
    }

    geometry.attributes.position.needsUpdate = true;

    // Gentle Rotation
    // Only rotate if in heart mode for dramatic effect, or always?
    // Let's rotate slowly always
    scene.rotation.y = Math.sin(time * 0.1) * 0.1;

    // Rotate stars slowly
    if (stars) {
        stars.rotation.y += 0.0005;
        stars.rotation.x += 0.0002;
    }

    renderer.render(scene, camera);
}

init();
