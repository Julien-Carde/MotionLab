import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader';
import Dropdown from './Dropdown'; // Import the custom dropdown component

function SimpleFBXViewer() {
  const mountRef = useRef(null);
  const [log, setLog] = useState([]);
  const [speed, setSpeed] = useState(1.0);
  const [isPaused, setIsPaused] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [selectedAnimation, setSelectedAnimation] = useState('startwalk');
  const [animations, setAnimations] = useState([
    { id: 'startwalk', name: 'Walking', loaded: false, active: false },
    { id: 'seated', name: 'Sitting', loaded: false, active: false },
    { id: 'shakehand', name: 'Shake Hand', loaded: false, active: false },
    { id: 'drinking', name: 'Drinking', loaded: false, active: false },
    { id: 'jumping', name: 'Jumping', loaded: false, active: false }
  ]);

  // Convert animations to dropdown options format
  const animationOptions = animations.map(anim => ({
    value: anim.id,
    label: anim.name
  }));

  // Persistent refs that survive component re-renders
  const mixerRef = useRef(null);
  const modelRef = useRef(null);
  const sceneRef = useRef(null);
  const currentAnimationRef = useRef(null);
  const rendererRef = useRef(null);
  const clockRef = useRef(null);
  const animationFrameIdRef = useRef(null);

  // Helper function to add to log
  const addLog = (message) => {
    setLog(prevLog => [...prevLog, `${new Date().toLocaleTimeString()}: ${message}`]);
    console.log(message);
  };

  // Function to update animation speed
  const updateSpeed = (newSpeed) => {
    setSpeed(newSpeed);
    if (currentAnimationRef.current && mixerRef.current) {
      currentAnimationRef.current.setEffectiveTimeScale(newSpeed);
      addLog(`Animation speed set to ${newSpeed.toFixed(2)}x`);
    }
  };

  // Function to toggle animation pause state
  const togglePause = () => {
    if (!mixerRef.current || !currentAnimationRef.current) return;

    // Toggle the pause state
    const newPausedState = !isPaused;

    if (newPausedState) {
      // Pause animation
      currentAnimationRef.current.paused = true;
      addLog('Animation paused');
    } else {
      // Resume animation
      currentAnimationRef.current.paused = false;
      addLog('Animation resumed');
    }

    // Update state
    setIsPaused(newPausedState);
  };

  // Function to handle animation selection from dropdown
  const handleAnimationChange = (animationId) => {
    // Find the animation in our array
    const selectedAnim = animations.find(anim => anim.id === animationId);

    if (!selectedAnim) {
      addLog(`Animation ${animationId} not found`);
      return;
    }

    // If already loaded and active, just return
    if (selectedAnim.active) {
      addLog(`Animation ${animationId} already active`);
      return;
    }

    addLog(`Switching to animation: ${animationId}`);
    setIsLoading(true);
    setLoadingProgress(0);
    setSelectedAnimation(animationId);

    // Mark as loading in the UI
    setAnimations(prevAnimations =>
      prevAnimations.map(anim => ({
        ...anim,
        active: anim.id === animationId
      }))
    );

    // Reset pause state when switching animations
    setIsPaused(false);

    // Load the model with a small timeout to ensure state updates first
    setTimeout(() => {
      loadAnimationModel(animationId);
    }, 50);
  };

  const loadAnimationModel = (animationId) => {
    // Safety check - ensure scene exists
    if (!sceneRef.current) {
      addLog(`ERROR: Cannot load ${animationId} - scene not initialized`);
      return;
    }

    addLog(`Loading animation model: ${animationId}`);

    // First clear any existing model
    if (modelRef.current) {
      sceneRef.current.remove(modelRef.current);
      modelRef.current = null;
    }

    // Clear existing mixer
    if (mixerRef.current) {
      mixerRef.current.stopAllAction();
      mixerRef.current = null;
      currentAnimationRef.current = null;
    }

    try {
      const loader = new FBXLoader();

      // Use a variable to track if this load request is still valid
      // This helps avoid race conditions with multiple load requests
      const loadId = Date.now();
      loader.loadingId = loadId;

      loader.load(
        `/models/${animationId}.fbx`,
        (fbx) => {
          // Check if this is still the current load request
          if (loader.loadingId !== loadId) {
            addLog(`Ignoring completed load for ${animationId} - newer request in progress`);
            return;
          }

          const modelMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });

          addLog(`FBX model loaded successfully: ${animationId}`);
          setIsLoading(false);

          // Auto-scale and center
          const box = new THREE.Box3().setFromObject(fbx);
          if (box.isEmpty()) {
            addLog("WARNING: Model bounding box is empty!");
          }

          const center = box.getCenter(new THREE.Vector3());
          const size = box.getSize(new THREE.Vector3());
          const maxDim = Math.max(size.x, size.y, size.z);

          if (maxDim === 0 || !isFinite(maxDim)) {
            addLog("WARNING: Cannot determine model size, using default scale");
            fbx.scale.setScalar(0.1);
          } else {
            // Normalize size
            const targetSize = 100;
            const scale = targetSize / maxDim;
            fbx.scale.setScalar(scale);
            addLog(`Scaled model by factor: ${scale}`);
          }

          // Center model
          fbx.position.x = -center.x * fbx.scale.x;
          fbx.position.y = -center.y * fbx.scale.y + size.y / 2 * fbx.scale.y; // Place on ground
          fbx.position.z = -center.z * fbx.scale.z;

          // Setup materials
          fbx.traverse((child) => {
            if (child.isMesh) {
              child.castShadow = true;
              child.receiveShadow = true;

              // Apply a new material
              child.material = new THREE.MeshStandardMaterial({
                color: 0xc9c9c9,
                roughness: 0.5,
              });
            }
          });

          // Store reference and add to scene
          modelRef.current = fbx;

          // Check again that scene still exists (React might have unmounted)
          if (sceneRef.current) {
            sceneRef.current.add(fbx);

            // Set up animation
            if (fbx.animations && fbx.animations.length) {
              addLog(`Model has ${fbx.animations.length} animations`);
              try {
                const mixer = new THREE.AnimationMixer(fbx);
                mixerRef.current = mixer;

                const action = mixer.clipAction(fbx.animations[0]);
                action.setLoop(THREE.LoopRepeat, Infinity); // Explicitly set infinite loops
                action.clampWhenFinished = false;
                action.timeScale = speed; // Use timeScale directly
                action.reset();
                action.play();
                currentAnimationRef.current = action;

                // Apply pause state if needed
                if (isPaused) {
                  action.paused = true;
                }

                // Double-check animation is playing
                if (!action.isRunning() && !isPaused) {
                  addLog("Animation not running after play() - forcing start");
                  action.play();
                }

                addLog(`Animation started with speed: ${speed}x`);

                // Update state to mark animation as loaded and active
                setAnimations(prevAnimations =>
                  prevAnimations.map(anim => ({
                    ...anim,
                    loaded: anim.id === animationId ? true : anim.loaded,
                    active: anim.id === animationId
                  }))
                );
              } catch (error) {
                addLog(`Error setting up animation: ${error.message}`);
                console.error('Animation setup error:', error);
                setIsLoading(false);
              }
            } else {
              addLog("No animations found in model");
              setIsLoading(false);
            }
          } else {
            addLog("WARNING: Scene no longer exists, cannot complete model setup");
            setIsLoading(false);
          }
        },
        (xhr) => {
          // Update loading progress
          if (xhr.lengthComputable) {
            const percent = Math.floor((xhr.loaded / xhr.total) * 100);
            setLoadingProgress(percent);

            // Only log every 10% to reduce log spam
            if (percent % 10 === 0) {
              addLog(`Loading progress for ${animationId}: ${percent}%`);
            }
          }
        },
        (error) => {
          addLog(`Error loading model ${animationId}: ${error.message}`);
          console.error(`FBX loading error for ${animationId}:`, error);
          setIsLoading(false);

          // Clear the "active" state if this is the currently selected animation
          setAnimations(prevAnimations =>
            prevAnimations.map(anim => ({
              ...anim,
              active: anim.id === animationId ? false : anim.active
            }))
          );
        }
      );
    } catch (error) {
      addLog(`Exception during load attempt for ${animationId}: ${error.message}`);
      console.error(`Exception during load for ${animationId}:`, error);
      setIsLoading(false);
    }
  };

  // Dedicated keyboard handler for play/pause that updates with isPaused state
  useEffect(() => {
    const handleKeyPress = (event) => {
      if (event.code === 'Space' || event.key === ' ') {
        event.preventDefault();
        togglePause();
        addLog(`Keyboard shortcut: ${isPaused ? 'Resuming' : 'Pausing'} animation`);
      }
    };

    // Add event listener
    document.addEventListener('keydown', handleKeyPress);

    // Remove event listener on cleanup
    return () => {
      document.removeEventListener('keydown', handleKeyPress);
    };
  }, [isPaused]); // Include isPaused in the dependency array so the handler updates

  useEffect(() => {
    addLog("Component mounted");

    // Prevent multiple initializations
    if (sceneRef.current) {
      addLog("Scene already exists, skipping initialization");
      return;
    }

    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xe6e6e6);
    sceneRef.current = scene;
    addLog("Scene created");

    // Camera setup
    const camera = new THREE.PerspectiveCamera(
      50,
      window.innerWidth / window.innerHeight,
      0.1,
      2000
    );
    camera.position.set(150, 80, 200); // Positioned diagonally from the model, higher up and further back
    // Point camera at the center of the scene
    camera.lookAt(0, 40, 0);
    addLog("Camera created");

    // Renderer setup
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    rendererRef.current = renderer;

    // Ensure the container exists before appending
    if (mountRef.current) {
      // Clear any existing canvases
      while (mountRef.current.firstChild) {
        mountRef.current.removeChild(mountRef.current.firstChild);
      }
      mountRef.current.appendChild(renderer.domElement);
      addLog("Renderer created and attached");
    } else {
      addLog("ERROR: Mount ref not found");
      return; // Abort if mount ref is not available
    }

    // Create ground
    const groundGeometry = new THREE.PlaneGeometry(200, 200);
    const groundMaterial = new THREE.MeshStandardMaterial({
      color: 0xe6e6e6,
      roughness: 0.8
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0;
    ground.receiveShadow = true;
    // scene.add(ground);
    addLog("Ground created");

    // Add grid
    const grid = new THREE.GridHelper(200, 20);
    scene.add(grid);
    addLog("Grid created");

    // Add reference cube
    const cubeGeometry = new THREE.BoxGeometry(10, 10, 10);
    const cubeMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const cube = new THREE.Mesh(cubeGeometry, cubeMaterial);
    cube.position.set(0, 5, 0);
    // scene.add(cube);
    addLog("Reference cube created");

    // Add axis helper
    const axesHelper = new THREE.AxesHelper(50);
    // scene.add(axesHelper);
    addLog("Axes helper created");

    // Add lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 2);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(50, 100, 50);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 1024;
    directionalLight.shadow.mapSize.height = 1024;
    scene.add(directionalLight);
    addLog("Lights created");

    // Add controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.target.set(0, 40, 0); // Set the orbit target to keep looking at the character
    controls.update(); // Important: update controls after changing target
    addLog("Controls created");

    // Animation setup - using explicit constructor to avoid issues
    const clock = new THREE.Clock();
    clockRef.current = clock;
    clock.start();

    // Animation loop - using RAF ID to properly cancel
    const animate = () => {
      animationFrameIdRef.current = requestAnimationFrame(animate);

      if (mixerRef.current) {
        const delta = clock.getDelta();
        try {
          // Add a safety check in case mixer update fails
          mixerRef.current.update(delta);
        } catch (error) {
          addLog(`Error in animation update: ${error.message}`);
        }
      }

      controls.update();
      renderer.render(scene, camera);
    };

    // Load initial animation with a small delay to ensure everything is set up
    setTimeout(() => {
      loadAnimationModel('startwalk');
      setAnimations(prevAnimations =>
        prevAnimations.map(anim => ({
          ...anim,
          active: anim.id === 'startwalk'
        }))
      );
    }, 100);

    // Start animation
    animate();

    // Handle window resize
    const handleResize = () => {
      if (!rendererRef.current) return;

      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      rendererRef.current.setSize(window.innerWidth, window.innerHeight);
    };

    window.addEventListener('resize', handleResize);

    // Cleanup function
    return () => {
      addLog("Component unmounting, cleaning up");
      window.removeEventListener('resize', handleResize);

      // Cancel animation frame to stop rendering
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
      }

      // Clean up mixer
      if (mixerRef.current) {
        try {
          mixerRef.current.stopAllAction();
        } catch (error) {
          addLog(`Error stopping animations: ${error.message}`);
        }
      }

      // Remove renderer
      if (mountRef.current && rendererRef.current && rendererRef.current.domElement) {
        if (rendererRef.current.domElement.parentNode === mountRef.current) {
          mountRef.current.removeChild(rendererRef.current.domElement);
        }
      }

      // Dispose resources
      try {
        if (rendererRef.current) {
          rendererRef.current.dispose();
        }

        if (sceneRef.current) {
          sceneRef.current.traverse((object) => {
            if (object.geometry) object.geometry.dispose();

            if (object.material) {
              if (Array.isArray(object.material)) {
                object.material.forEach(material => material.dispose());
              } else {
                object.material.dispose();
              }
            }
          });
        }
      } catch (error) {
        addLog(`Error during cleanup: ${error.message}`);
      }

      // Reset refs
      sceneRef.current = null;
      modelRef.current = null;
      mixerRef.current = null;
      currentAnimationRef.current = null;
      rendererRef.current = null;
      clockRef.current = null;
      animationFrameIdRef.current = null;
    };
  }, []);

  // CSS for the spinner animation
  const spinnerKeyframes = `
    @keyframes spinner {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  `;

  return (
    <div style={{ position: 'relative', width: '100%', height: '100vh', fontFamily: 'Saira, sans-serif', overflow: 'hidden' }}>
      {/* Saira font import */}
      <style>
        {`
          @font-face {
            font-family: 'Saira';
            src: url('/fonts/Saira/Saira-VariableFont_wdth,wght.ttf') format('truetype');
            font-weight: normal;
            font-style: normal;
          }
          
          * {
            font-family: 'Saira', sans-serif;
          }
          
          ${spinnerKeyframes}
        `}
      </style>

      {/* Full-width 3D Viewer Area */}
      <div
        ref={mountRef}
        style={{
          width: '100%',
          height: '100vh',
          overflow: 'hidden'
        }}
      />

      {/* Floating Side Menu */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '250px',
        height: '100vh', // Use viewport height to match exactly the screen height
        backgroundColor: 'rgba(245, 245, 245, 0.85)',
        backdropFilter: 'blur(5px)',
        display: 'flex',
        flexDirection: 'column',
        padding: '20px 15px',
        boxSizing: 'border-box', // Include padding in height calculation
        boxShadow: '2px 0 10px rgba(0,0,0,0.1)',
        fontFamily: 'Saira, sans-serif',
        zIndex: 100,
        overflow: 'hidden' // Prevent scrolling
      }}>
        <h2 style={{
          margin: '0 0 20px 0',
          padding: '0 0 15px 0',
          borderBottom: '1px solid #ddd',
          fontSize: '25px',
          textAlign: 'left',
          fontFamily: 'Saira, sans-serif'
        }}>
          MotionLab
        </h2>

        {/* Content wrapper with fixed height and scrolling if needed */}
        <div style={{
          flexGrow: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'auto', // Allow this inner container to scroll if content is too large
          maxHeight: 'calc(100vh - 140px)' // Calculate remaining height (viewport - header - shortcuts)
        }}>
          {/* Animation Selection */}
          <div style={{ marginBottom: '25px' }}>
            <label style={{
              display: 'block',
              marginBottom: '8px',
              fontSize: '16px',
              fontWeight: '500',
              fontFamily: 'Saira, sans-serif'
            }}>
              Select Animation:
            </label>

            {/* Using the CustomDropdown component */}
            <Dropdown
              options={animationOptions}
              value={selectedAnimation}
              onChange={handleAnimationChange}
              placeholder="Select Animation"
            />
          </div>

          {/* Playback Controls */}
          <div style={{
            marginBottom: '25px'
          }}>
            <h3 style={{
              fontSize: '16px',
              marginTop: 0,
              marginBottom: '15px',
              fontWeight: '500',
              fontFamily: 'Saira, sans-serif'
            }}>
              Playback
            </h3>

            {/* Pause/Resume Button */}
            <button
              onClick={togglePause}
              disabled={isLoading}
              style={{
                width: '100%',
                padding: '12px',
                backgroundColor: isPaused ? '#4CAF50' : '#f44336',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                fontSize: '14px',
                fontWeight: '500',
                cursor: isLoading ? 'not-allowed' : 'pointer',
                marginBottom: '20px',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                transition: 'all 0.2s ease',
                fontFamily: 'Saira, sans-serif',
                opacity: isLoading ? 0.6 : 1
              }}
            >
              {isPaused ? 'Resume Animation' : 'Pause Animation'}
            </button>

            {/* Speed Control */}
            <div>
              <label style={{
                display: 'block',
                marginBottom: '8px',
                fontSize: '16px',
                fontWeight: '500',
                fontFamily: 'Saira, sans-serif'
              }}>
                Speed: {speed}x
              </label>
              <div style={{
                position: 'relative',
                padding: '10px 0'
              }}>
                <input
                  type="range"
                  min="0.1"
                  max="2"
                  step="0.1"
                  value={speed}
                  onChange={(e) => updateSpeed(parseFloat(e.target.value))}
                  disabled={isLoading}
                  style={{
                    width: '100%',
                    height: '4px',
                    WebkitAppearance: 'none',
                    appearance: 'none',
                    background: '#ddd',
                    borderRadius: '2px',
                    outline: 'none',
                    opacity: isLoading ? 0.6 : 1
                  }}
                />
                <style>
                  {`
                    input[type=range]::-webkit-slider-thumb {
                      -webkit-appearance: none;
                      appearance: none;
                      width: 18px;
                      height: 18px;
                      background: white;
                      border: 2px solid #666;
                      border-radius: 50%;
                      cursor: pointer;
                      box-shadow: 0 1px 3px rgba(0,0,0,0.2);
                    }
                    input[type=range]::-moz-range-thumb {
                      width: 18px;
                      height: 18px;
                      background: white;
                      border: 2px solid #666;
                      border-radius: 50%;
                      cursor: pointer;
                      box-shadow: 0 1px 3px rgba(0,0,0,0.2);
                    }
                  `}
                </style>
              </div>
            </div>
          </div>

          {/* Spacer to push shortcuts to bottom */}
          <div style={{ flexGrow: 1 }}></div>

          {/* Keyboard Shortcuts Section */}
          <div style={{
            borderTop: '1px solid #ddd',
            paddingTop: '15px',
            marginTop: '15px'
          }}>
            <h3 style={{
              fontSize: '14px',
              marginTop: 0,
              marginBottom: '10px',
              fontWeight: 'bold',
              fontFamily: 'Saira, sans-serif'
            }}>
              Navigation Controls
            </h3>

            <div style={{ fontSize: '13px', color: '#444', fontFamily: 'Saira, sans-serif' }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: '8px'
              }}>
                <span style={{ fontWeight: 'bold' }}>Spacebar</span>
                <span>Pause/Resume</span>
              </div>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: '8px'
              }}>
                <span style={{ fontWeight: 'bold' }}>Left Click + Drag</span>
                <span>Rotate View</span>
              </div>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: '8px'
              }}>
                <span style={{ fontWeight: 'bold' }}>Right Click + Drag</span>
                <span>Pan View</span>
              </div>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between'
              }}>
                <span style={{ fontWeight: 'bold' }}>Mouse Wheel</span>
                <span>Zoom In/Out</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Loading Spinner */}
      {isLoading && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: 'rgba(255, 255, 255, 0.7)',
          zIndex: 150
        }}>
          <div style={{
            width: '60px',
            height: '60px',
            border: '5px solid #f3f3f3',
            borderTop: '5px solid #aaaaaa',
            borderRadius: '50%',
            animation: 'spinner 1.5s linear infinite'
          }} />
          <div style={{
            marginTop: '15px',
            fontFamily: 'Saira, sans-serif',
            fontSize: '16px',
            color: '#555'
          }}>
            Loading... {loadingProgress > 0 ? `${loadingProgress}%` : ''}
          </div>
        </div>
      )}

      {/* Current Animation Indicator */}
      <div style={{
        position: 'fixed',
        top: '15px',
        right: '15px',
        backgroundColor: 'rgba(0,0,0,0.6)',
        color: 'white',
        padding: '8px 15px',
        borderRadius: '20px',
        fontFamily: 'Saira, sans-serif',
        fontSize: '14px',
        fontWeight: 'bold',
        boxShadow: '0 2px 5px rgba(0,0,0,0.2)',
        zIndex: 100
      }}>
        {animations.find(a => a.active)?.name || 'No animation'}
        {isPaused && <span style={{ marginLeft: '8px', color: '#ff9800' }}>(Paused)</span>}
      </div>
    </div>
  );
}

export default SimpleFBXViewer;