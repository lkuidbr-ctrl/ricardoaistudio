# 🎬 CHARACTER + CLAUDE + FAL.AI MASTER WORKFLOW
*(adaptado do Artlist MCP Master Workflow — personagem trocado para o usuário, estilo Spider-Verse, geração de imagens via fal.ai / modelo Muse)*

---

## STEP 0 — Conectar a fal.ai à Claude

Em vez do conector do Artlist MCP, use a API da fal.ai diretamente (ou via um MCP wrapper para fal.ai, se você tiver um configurado).

1. Crie uma conta em https://fal.ai e gere uma **API Key**.
2. Configure a chave como variável de ambiente (`FAL_KEY`) no ambiente onde a automação vai rodar.
3. Modelo de imagem a usar: **Muse** (fal.ai), custo aproximado de **$0.01 por imagem**.
4. Inicie uma nova conversa no Claude para este projeto, com a API da fal.ai disponível como ferramenta.

---

## STEP 1 — CRIAR O PERSONAGEM (agora é você)

**Ação antes do prompt**
- Esta é a etapa mestre de criação do personagem.
- Gere primeiro **uma imagem de referência do personagem**.
- Não gere vídeo ainda.
- Use a referência visual real do usuário (fotos fornecidas: homem de meia-idade, cabelo grisalho curto, óculos de armação redonda, barba e bigode grisalhos aparados, expressão confiante e sorridente, relógio de pulso prateado, vestindo camiseta preta lisa ou camisa branca de linho — ambiente "estúdio de IA" moderno).
- Salve a imagem mais forte como **MASTER_CHARACTER_REFERENCE**.
- Use essa mesma referência para a folha de personagem (character sheet) e para os shots de vídeo depois.

**PROMPT (fal.ai / Muse) — imagem do personagem**

```
character design -
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
strong graphic silhouette, cinematic composition, highly stylized illustration
--ar 9:16 --hd
```

> Se a fal.ai/Muse suportar **image-to-image** com imagem de entrada, anexe uma das suas fotos reais como referência de rosto para manter a fidelidade da identidade antes de aplicar o estilo Spider-Verse.

**Output:** `MASTER_CHARACTER_REFERENCE`

---

## STEP 2 — CRIAR A LOCAÇÃO

**Ação antes do prompt**
- Mantenha a geração do personagem separada da geração do ambiente.
- Gere o estúdio/escritório como **MASTER_LOCATION_REFERENCE**.
- Não redesenhe o ambiente depois.
- Mantenha a mesma arquitetura, mobiliário, lógica de iluminação e linguagem visual.

**PROMPT (fal.ai / Muse) — locação**

```
location design -
modern AI studio office reception at dusk, marble countertop desk, wood-slat feature wall,
large glass windows overlooking a city skyline, backlit signage with a logo and studio name,
soft warm ceiling downlights, potted plant, laptop on the desk, tray with branded cups,
clean minimalist premium corporate-tech interior, stylized animated comic-book rendering,
bold cel shading, angular graphic shapes, expressive ink outlines, halftone textures,
exaggerated perspective, vibrant color blocking, dynamic Spider-Verse-inspired animation aesthetic,
cinematic wide establishing shot, polished professional atmosphere, rich environmental storytelling,
high-detail animated film frame
--ar 16:9 --hd
```

**Output:** `MASTER_LOCATION_REFERENCE`

---

## STEP 3 — CRIAR A CHARACTER SHEET

**Ação antes do prompt**
- Use `MASTER_CHARACTER_REFERENCE` como entrada (image-to-image, se suportado pelo Muse).
- Diga à Claude que é o mesmo personagem.
- Não mude rosto, cabelo, barba, óculos, roupa ou proporções.

**PROMPT — folha de personagem**

```
character sheet -
create a character sheet of this character including closeups and full body,
keep the art style exactly as in the reference image (Spider-Verse style)
```

**Output:** `MASTER_CHARACTER_SHEET`

---

## STEP 4 — CRIAR A LOCATION SHEET

**Ação antes do prompt**
- Use `MASTER_LOCATION_REFERENCE` como referência estrita.
- Gere todas as vistas como um único ambiente consistente.

**PROMPT — folha de locação**

```
location sheet -
create a professional location reference sheet based strictly on the uploaded reference image.
Match the exact stylized visual style, lighting quality, color treatment, and texture of the reference.
Arrange into two horizontal rows. Top row: straight-on frontal view, left angled perspective,
right angled perspective, reverse wide view. Bottom row: three detailed close-ups of key environmental
elements. Maintain architectural consistency, accurate proportions, and consistent lighting across all
panels. Output a crisp, print-ready location sheet.
```

**Output:** `MASTER_LOCATION_SHEET`

---

## STEP 5 — TRAVAR AS REFERÊNCIAS DO PROJETO

Antes de gerar o vídeo, tenha estes 4 ativos disponíveis:

| Tipo | Ativo |
|---|---|
| Personagem | `MASTER_CHARACTER_REFERENCE` |
| Character sheet | `MASTER_CHARACTER_SHEET` |
| Locação | `MASTER_LOCATION_REFERENCE` |
| Location sheet | `MASTER_LOCATION_SHEET` |

**Importante:** não regenere o personagem ou o ambiente entre os shots, a menos que seja absolutamente necessário.

---

## STEP 6 — GERAÇÃO DE VÍDEO

Troque de criação de ativos → produção de shots.

**Regra de produção:** gere SHOT 1 → revise → SHOT 2 → revise → ... até o último shot. Não peça para reescrever os prompts.

> Nota: a fal.ai tem modelos de vídeo separados do Muse (que é um modelo de imagem). Para os shots de vídeo abaixo, use o modelo de vídeo da fal.ai que suportar **image-to-video** com a referência de personagem/locação travada (ex.: um modelo de vídeo compatível com referência de imagem disponível na fal.ai). As imagens fixas (personagem, locação, sheets) continuam usando **Muse a $0.01/imagem**.

**Instrução de controle para a Claude:**

```
Use os prompts fornecidos exatamente como escritos.

NÃO:
- reescreva os prompts
- melhore os prompts
- resuma os prompts
- parafraseie os prompts
- adicione novos detalhes criativos
- remova detalhes existentes
- mude falas
- mude descrições de câmera
- mude a ordem dos shots
- redesenhe o personagem
- redesenhe a locação
- introduza efeitos visuais aleatórios
- mude o estilo visual

FLUXO:
1. Criar a referência mestre do personagem (fal.ai / Muse).
2. Criar a referência mestre da locação (fal.ai / Muse).
3. Criar a character sheet usando a referência mestre do personagem.
4. Criar a location sheet usando a referência mestre da locação.
5. Travar essas referências como ativos de continuidade visual do projeto.
6. Gerar o vídeo shot a shot, usando o modelo de vídeo da fal.ai.
7. Usar o ativo de referência correto para cada shot.
8. Preservar identidade do personagem, roupa, proporções, continuidade do ambiente e estilo visual.
```

### Narrativa nova

Você é o fundador de um estúdio de IA, testando sozinho, tarde da noite, a demo do seu próprio
produto de automação (o pipeline com as etapas INSTALL / CONFIGURE / ONBOARDING / NO AR 24H / LAUNCH
— os mesmos mascotes dos copos de referência). Um dos mascotes do dashboard ganha vida e o puxa para
dentro do próprio sistema: um "mundo digital" onde cada etapa do produto é uma zona da cidade. Ele
percorre as zonas usando poderes ligados às etapas (velocidade = INSTALL, hack de UI = CONFIGURE,
double jump = ONBOARDING/NO AR 24H) até quebrar a barreira de LAUNCH e ser expelido de volta à
realidade — sem os poderes, em queda livre sobre a cidade real.

**PROMPT DE VÍDEO — MANTER EXATAMENTE COMO ESCRITO (não reescrever, não resumir, não parafrasear)**

```
video -

SUBJECTS: Use the uploaded character reference exactly: middle-aged man, salt-and-pepper short hair,
round black-framed glasses, trimmed gray beard, warm confident expression, plain black t-shirt
(or white linen shirt), silver wristwatch. Preserve exact identity, face, hairstyle, beard, glasses,
clothing and proportions. Fully Spider-Verse-inspired animated character from first frame to last:
bold cel shading, graphic ink contours, angular facial planes, stylized hair, halftone texture,
saturated comic color blocking. No photorealism.

ENVIRONMENT: Use the uploaded studio reference exactly for the opening: same marble reception desk,
wood-slat wall, backlit "STUDIO" signage, glass windows and city skyline, tray of branded mascot cups
on the counter. Inside the system: a vibrant open-world "product city" built from the studio's own
pipeline, with five glowing districts labeled INSTALL, CONFIGURE, ONBOARDING, NO AR 24H and LAUNCH,
holographic mascot NPCs matching the cup characters, floating UI panels, neon data-streams and a
visible glass-like LAUNCH barrier glowing high above the world. Outside the barrier: the real modern
city skyline at night. Same stylized animation language throughout.

STYLE: High-end Spider-Verse-inspired cinematic 3D animation, graphic 2D/3D hybrid, strong cel shadows,
crisp ink lines, comic textures, saturated cyan-orange-magenta lighting, expressive animation. Digital
effects are clean and intentional: RGB separation, pixel fragments, screen tearing and controlled
glitch transitions. No photorealistic humans, no random glitches, no morphing, no continuity breaks,
no sudden location changes.

SHOT 1: Medium-wide, 35mm, slow push-in. The founder sits alone at the marble desk late at night,
laptop open, running a live demo of his own AI pipeline dashboard. One of the mascot icons on the
screen (the INSTALL character) suddenly turns and looks directly at the camera, then casts a bolt
of glowing code toward him.

SHOT 2: Over-the-shoulder, 50mm. The bolt hits the laptop screen. The display erupts into controlled
RGB glitching and digital distortion. The founder is pulled forward into the exact screen, breaking
into clean pixel fragments before disappearing through it.

SHOT 3: Wide 28mm. He lands inside the glowing product-city, standing at the edge of the INSTALL
district. He looks around in shock and mutters, "Onde diabos eu estou?" He approaches the holographic
INSTALL mascot and reaches for its shoulder. His hand passes completely through it. The mascot keeps
repeating its scripted onboarding animation without reacting. The founder realizes everyone here is
an NPC running his own software.

SHOT 4: Medium shot, 35mm. A translucent interface appears around him showing INSTALL / CONFIGURE /
ONBOARDING as activatable powers. He activates INSTALL and instantly accelerates down the street,
racing past holographic NPCs and glowing terminals, discovering his own product from the inside while
moving at full speed.

SHOT 5: Dynamic tracking shot, 28mm. He activates a CONFIGURE/ONBOARDING double-jump ability, launches
into the air above the ONBOARDING and NO AR 24H districts, lands, jumps again, then reaches an
impossible height above the rooftops. The city shrinks below him. He looks upward and sees the
LAUNCH barrier: a giant glowing glass-like boundary sealing the top of the product world.

SHOT 6: Wide low-angle shot, 24mm. He performs one final double-jump straight into the glowing LAUNCH
barrier. It cracks like glass and bursts into digital fragments. He breaks completely through it and
emerges into the real night sky above the real city outside his studio. The interface, the glow and
the jump effects instantly vanish.

SHOT 7: Final shot, 35mm, slow-motion falling camera. The founder realizes he's back in the real
world — the pipeline just "shipped" him out along with the update. He looks down and sees the glowing
power icons are gone. His expression shifts from amazement to sudden panic as he realizes he's simply
falling through the real night sky with no powers, the studio's rooftop rushing up far below. Hold on
his face for one beat. CUT TO BLACK.
/ SFX: Glitch pulse → impact → city ambience → speed rush → double-jump burst → glass-like barrier
break → sudden silence → wind roar during freefall.
```

**GERAÇÃO ORDEM:**

```
CHARACTER (Muse) → LOCATION (Muse) → CHARACTER SHEET (Muse) → LOCATION SHEET (Muse)
→ SHOT 1 → SHOT 2 → SHOT 3 → SHOT 4 → SHOT 5 → SHOT 6 → SHOT 7 (modelo de vídeo fal.ai)
```

Se uma geração da fal.ai exigir uma configuração específica do modelo, escolha a configuração
disponível apropriada sem alterar o prompt criativo.

Nunca substitua o personagem ou ambiente travado por uma nova geração, a menos que
explicitamente instruído.
