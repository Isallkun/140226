import cv2
import mediapipe as mp
import time
import math
import random
import numpy as np

print("\n\n WARNING: Do not run this script while the Web version (index.html) is running!")
print(" Running both will cause your laptop to freeze.\n\n")

# Initialize MediaPipe Hands
mp_hands = mp.solutions.hands
mp_drawing = mp.solutions.drawing_utils
mp_drawing_styles = mp.solutions.drawing_styles

# Configure Hands
# model_complexity=0 ensures fastest performance (Lite model)
hands = mp_hands.Hands(
    model_complexity=0,
    min_detection_confidence=0.5,
    min_tracking_confidence=0.5)

# Capture Video Stream
cap = cv2.VideoCapture(0)

# Particle System Configuration
PARTICLE_COUNT = 200 # Keep low for Python/CV2 performance
particles = []

class Particle:
    def __init__(self, width, height):
        self.x = random.randint(0, width)
        self.y = random.randint(0, height)
        self.target_x = self.x
        self.target_y = self.y
        self.vx = 0
        self.vy = 0
        self.color = (178, 183, 255) # Pastel Pink in BGR (approx)
        self.size = random.randint(1, 3)

    def update(self):
        # Simple easing usage
        easing = 0.1
        self.x += (self.target_x - self.x) * easing
        self.y += (self.target_y - self.y) * easing

def get_heart_position(t, scale=10, center_x=320, center_y=240):
    # Heart curve math
    x = 16 * math.sin(t)**3
    y = 13 * math.cos(t) - 5 * math.cos(2*t) - 2 * math.cos(3*t) - math.cos(4*t)
    
    # Scale and center (Note: Y is inverted in screen coords, so we subtract y)
    px = center_x + x * scale
    py = center_y - y * scale 
    return px, py

def detect_fist(landmarks):
    # Wrist is landmark 0
    wrist = landmarks[0]
    # Tips: Index(8), Middle(12), Ring(16), Pinky(20)
    tips_indices = [8, 12, 16, 20]
    
    folded_count = 0
    for idx in tips_indices:
        tip = landmarks[idx]
        # Calculate distance to wrist
        # Note: landmarks are normalized [0,1], convert to aspect ratio if needed,
        # but simple Euclidean dist works for rough estimation
        dist = math.sqrt((tip.x - wrist.x)**2 + (tip.y - wrist.y)**2)
        
        # Threshold for "folded"
        if dist < 0.35: # Tuning threshold
            folded_count += 1
            
    return folded_count >= 3 # If 3 or more fingers are close to wrist

# Initialize particles
width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
for _ in range(PARTICLE_COUNT):
    particles.append(Particle(width, height))

# Variables for FPS calculation
prev_frame_time = 0
new_frame_time = 0
frame_count = 0

print("Tekan 'q' untuk keluar / Press 'q' to exit")

while cap.isOpened():
    success, image = cap.read()
    if not success:
        print("Ignoring empty camera frame.")
        continue

    # To improve performance, optionally mark the image as not writeable to
    # pass by reference.
    image.flags.writeable = False
    image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
    results = hands.process(image)

    # Draw the hand annotations on the image.
    image.flags.writeable = True
    image = cv2.cvtColor(image, cv2.COLOR_RGB2BGR)
    
    # Create a black overlay for particles (optional, or just draw on image)
    # overlay = image.copy()
    
    is_fist = False
    hand_center = (width // 2, height // 2)

    if results.multi_hand_landmarks:
        for hand_landmarks in results.multi_hand_landmarks:
            mp_drawing.draw_landmarks(
                image,
                hand_landmarks,
                mp_hands.HAND_CONNECTIONS,
                mp_drawing_styles.get_default_hand_landmarks_style(),
                mp_drawing_styles.get_default_hand_connections_style())
            
            # Detect Fist
            if detect_fist(hand_landmarks.landmark):
                is_fist = True
                
            # Update hand center (using Palm center approx: Landmark 9)
            check_lm = hand_landmarks.landmark[9]
            hand_center = (int(check_lm.x * width), int(check_lm.y * height))

    # Update and Draw Particles
    # Time-based animation
    t_base = time.time()
    
    for i, p in enumerate(particles):
        if is_fist:
            # Form Heart
            # Distribute t along the heart curve
            angle = (i / PARTICLE_COUNT) * 2 * math.pi
            hx, hy = get_heart_position(angle, scale=12, center_x=hand_center[0], center_y=hand_center[1])
            p.target_x = hx + random.randint(-5, 5) # Jitter
            p.target_y = hy + random.randint(-5, 5)
        else:
            # Scatter / Float
            # E.g., float upwards or random drift
            p.target_x += random.uniform(-2, 2)
            p.target_y += random.uniform(-2, 2)
            
            # Keep in bounds loosely or wrap
            if p.x < 0: p.x = width
            if p.x > width: p.x = 0
            if p.y < 0: p.y = height
            if p.y > height: p.y = 0
            
            # Optional: Attract to hand loosely when open?
            # p.target_x = hand_center[0] + random.randint(-200, 200)
            # p.target_y = hand_center[1] + random.randint(-200, 200)

        p.update()
        
        # Draw particle
        cv2.circle(image, (int(p.x), int(p.y)), p.size, p.color, -1)

    # Calculate FPS
    new_frame_time = time.time()
    fps = 1 / (new_frame_time - prev_frame_time) if (new_frame_time - prev_frame_time) > 0 else 0
    prev_frame_time = new_frame_time
    fps = int(fps)

    # Display FPS on screen
    cv2.putText(image, "FPS: " + str(fps), (7, 70), cv2.FONT_HERSHEY_SIMPLEX, 3, (100, 255, 0), 3, cv2.LINE_AA)
    
    # Display Instructions
    cv2.putText(image, "Fist: Heart | Open: Scatter", (10, height - 20), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)

    # Flip the image horizontally for a selfie-view display.
    # Note: Flipping affects the text if drawn before. 
    # Better to Flip first then draw text? 
    # The original ref flipped at imshow. 
    # If we draw text on 'image', then flip, text is mirrored.
    # Let's flip image first for processing if we want "selfie view" logical interactions, 
    # but usually landmarks are normalized.
    # For now, let's keep the original flow: Draw -> Show(Flipped). 
    # WAIT, if we show Flipped, the text will be backwards.
    # Correct approach: Flip image first, THEN process detection (landmark coordinates will be flipped), THEN draw.
    # BUT MediaPipe expects RGB.
    
    # Let's just flip the final result and accept backwards text, 
    # OR flip the image at the start of the loop for everything.
    # To fix text:
    final_image = cv2.flip(image, 1)
    
    # Re-draw text on the flipped image so it's readable
    # (Overwrite the backwards text? No, it's burned in.)
    
    # Better: 
    # 1. Capture
    # 2. Flip
    # 3. Process
    # 4. Draw
    # 5. Show
    # Logic change below: 
    
    # Actually, let's just draw text AFTER flipping for display?
    # But landmarks are drawn on 'image'.
    # If we flip 'image' to 'final_image', dots move to correct side.
    # Then draw text on 'final_image'.
    
    cv2.putText(final_image, f"FPS: {fps}", (10, 50), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)
    cv2.putText(final_image, "Fist: Heart | Open: Scatter", (10, height - 20), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)

    cv2.imshow('Hand Gesture Detection', final_image)

    if cv2.waitKey(5) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()
