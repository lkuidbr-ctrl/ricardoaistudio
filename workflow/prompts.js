// Prompts copied verbatim from workflow-fal-ai-muse.md.
// Do NOT rewrite, paraphrase, summarize, or "improve" any of these strings.

export const CHARACTER_PROMPT = `character design -
middle-aged man in his 50s, short salt-and-pepper hair neatly styled, round black-framed glasses,
trimmed gray-and-white beard and mustache, warm confident smile, direct eye contact, silver wristwatch,
wearing a plain black crew-neck t-shirt (alt version: white linen button-up shirt),
fully stylized animated character design, unmistakably non-photorealistic,
bold graphic facial construction, simplified facial anatomy, angular geometric planes across forehead
cheeks nose and jaw, hard cel-shaded lighting, flat 2D color blocks with selective painterly gradients,
thick expressive ink outlines, stylized linework around hair and facial features, exaggerated graphic
shadows, illustrated skin with visible brush and halftone texture instead of realistic pores,
sharply simplified hair strands, slightly exaggerated eyes and facial proportions,
comic-book character rendering, dynamic graphic-novel illustration, hand-painted animation frame
aesthetic, 2D/3D hybrid animated film look, high-contrast rim lighting, deep indigo-to-black gradient
background, abstract geometric shapes and halftone patterns, subtle offset-print imperfections,
dramatic blue highlights with warm orange skin tones, modern tech-studio atmosphere, close-up portrait,
chest-up composition, premium animated character poster, looks like a frame from a high-budget
Spider-Verse-style animated movie, not a photograph, not photorealistic, not realistic 3D,
strong graphic silhouette, cinematic composition, highly stylized illustration`;

export const CHARACTER_ASPECT_RATIO = "9:16";

export const LOCATION_PROMPT = `location design -
modern AI studio office reception at dusk, marble countertop desk, wood-slat feature wall,
large glass windows overlooking a city skyline, backlit signage with a logo and studio name,
soft warm ceiling downlights, potted plant, laptop on the desk, tray with branded cups,
clean minimalist premium corporate-tech interior, stylized animated comic-book rendering,
bold cel shading, angular graphic shapes, expressive ink outlines, halftone textures,
exaggerated perspective, vibrant color blocking, dynamic Spider-Verse-inspired animation aesthetic,
cinematic wide establishing shot, polished professional atmosphere, rich environmental storytelling,
high-detail animated film frame`;

export const LOCATION_ASPECT_RATIO = "16:9";

export const CHARACTER_SHEET_PROMPT = `character sheet -
create a character sheet of this character including closeups and full body,
keep the art style exactly as in the reference image (Spider-Verse style)`;

export const LOCATION_SHEET_PROMPT = `location sheet -
create a professional location reference sheet based strictly on the uploaded reference image.
Match the exact stylized visual style, lighting quality, color treatment, and texture of the reference.
Arrange into two horizontal rows. Top row: straight-on frontal view, left angled perspective,
right angled perspective, reverse wide view. Bottom row: three detailed close-ups of key environmental
elements. Maintain architectural consistency, accurate proportions, and consistent lighting across all
panels. Output a crisp, print-ready location sheet.`;

export const VIDEO_SUBJECTS = `SUBJECTS: Use the uploaded character reference exactly: middle-aged man, salt-and-pepper short hair,
round black-framed glasses, trimmed gray beard, warm confident expression, plain black t-shirt
(or white linen shirt), silver wristwatch. Preserve exact identity, face, hairstyle, beard, glasses,
clothing and proportions. Fully Spider-Verse-inspired animated character from first frame to last:
bold cel shading, graphic ink contours, angular facial planes, stylized hair, halftone texture,
saturated comic color blocking. No photorealism.`;

export const VIDEO_ENVIRONMENT = `ENVIRONMENT: Use the uploaded studio reference exactly for the opening: same marble reception desk,
wood-slat wall, backlit "STUDIO" signage, glass windows and city skyline, tray of branded mascot cups
on the counter. Inside the system: a vibrant open-world "product city" built from the studio's own
pipeline, with five glowing districts labeled INSTALL, CONFIGURE, ONBOARDING, NO AR 24H and LAUNCH,
holographic mascot NPCs matching the cup characters, floating UI panels, neon data-streams and a
visible glass-like LAUNCH barrier glowing high above the world. Outside the barrier: the real modern
city skyline at night. Same stylized animation language throughout.`;

export const VIDEO_STYLE = `STYLE: High-end Spider-Verse-inspired cinematic 3D animation, graphic 2D/3D hybrid, strong cel shadows,
crisp ink lines, comic textures, saturated cyan-orange-magenta lighting, expressive animation. Digital
effects are clean and intentional: RGB separation, pixel fragments, screen tearing and controlled
glitch transitions. No photorealistic humans, no random glitches, no morphing, no continuity breaks,
no sudden location changes.`;

export const SFX_LINE = `SFX: Glitch pulse → impact → city ambience → speed rush → double-jump burst → glass-like barrier
break → sudden silence → wind roar during freefall.`;

export const SHOTS = {
  1: `SHOT 1: Medium-wide, 35mm, slow push-in. The founder sits alone at the marble desk late at night,
laptop open, running a live demo of his own AI pipeline dashboard. One of the mascot icons on the
screen (the INSTALL character) suddenly turns and looks directly at the camera, then casts a bolt
of glowing code toward him.`,
  2: `SHOT 2: Over-the-shoulder, 50mm. The bolt hits the laptop screen. The display erupts into controlled
RGB glitching and digital distortion. The founder is pulled forward into the exact screen, breaking
into clean pixel fragments before disappearing through it.`,
  3: `SHOT 3: Wide 28mm. He lands inside the glowing product-city, standing at the edge of the INSTALL
district. He looks around in shock and mutters, "Onde diabos eu estou?" He approaches the holographic
INSTALL mascot and reaches for its shoulder. His hand passes completely through it. The mascot keeps
repeating its scripted onboarding animation without reacting. The founder realizes everyone here is
an NPC running his own software.`,
  4: `SHOT 4: Medium shot, 35mm. A translucent interface appears around him showing INSTALL / CONFIGURE /
ONBOARDING as activatable powers. He activates INSTALL and instantly accelerates down the street,
racing past holographic NPCs and glowing terminals, discovering his own product from the inside while
moving at full speed.`,
  5: `SHOT 5: Dynamic tracking shot, 28mm. He activates a CONFIGURE/ONBOARDING double-jump ability, launches
into the air above the ONBOARDING and NO AR 24H districts, lands, jumps again, then reaches an
impossible height above the rooftops. The city shrinks below him. He looks upward and sees the
LAUNCH barrier: a giant glowing glass-like boundary sealing the top of the product world.`,
  6: `SHOT 6: Wide low-angle shot, 24mm. He performs one final double-jump straight into the glowing LAUNCH
barrier. It cracks like glass and bursts into digital fragments. He breaks completely through it and
emerges into the real night sky above the real city outside his studio. The interface, the glow and
the jump effects instantly vanish.`,
  7: `SHOT 7: Final shot, 35mm, slow-motion falling camera. The founder realizes he's back in the real
world — the pipeline just "shipped" him out along with the update. He looks down and sees the glowing
power icons are gone. His expression shifts from amazement to sudden panic as he realizes he's simply
falling through the real night sky with no powers, the studio's rooftop rushing up far below. Hold on
his face for one beat. CUT TO BLACK.`,
};

export const VIDEO_ASPECT_RATIO = "16:9";
